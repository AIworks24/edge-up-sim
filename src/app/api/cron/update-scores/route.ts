// src/app/api/cron/update-scores/route.ts
//
// Runs nightly after games complete. Fetches final scores from Sportradar,
// evaluates each prediction against the actual result, and writes:
//   - actual_score     (JSONB: { home, away })
//   - actual_winner    ('home' | 'away')
//   - was_correct      (boolean)
//   - resolved_at      (timestamp)
//
// KEY FIXES vs previous version:
//   1. Reads recommended_line.top_pick correctly (not .bet_side which never existed)
//   2. SR game ID lookup is fault-tolerant — tries sports_events first,
//      then falls back to SR daily schedule search by team name + date
//   3. Writes actual_score / actual_winner in the correct column shape
//   4. evaluatePrediction() correctly extracts bet_category and label from top_pick
//   5. Spread evaluation uses market_spread stored at sim time
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin }             from '@/lib/database/supabase-admin'

const SR_BASE = 'https://api.sportradar.com'
const SR_KEY  = process.env.SPORTRADAR_API_KEY ?? ''

// ── Entry point ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Find all predictions that need resolution ─────────────────────────────
  // was_correct IS NULL  → not yet graded
  // game_time < (now - 4hrs) → enough time for game to be complete
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 4)

  const { data: pending, error: fetchErr } = await supabaseAdmin
    .from('ai_predictions')
    .select(`
      id, sport, home_team, away_team, game_time,
      market_spread, market_total,
      recommended_bet_type, recommended_line,
      odds_snapshot
    `)
    .is('was_correct', null)
    .lt('game_time', cutoff.toISOString())
    .not('game_time', 'is', null)
    .limit(50)

  if (fetchErr) {
    console.error('[update-scores] DB fetch error:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ success: true, updated: 0, message: 'No pending predictions' })
  }

  console.log(`[update-scores] Found ${pending.length} predictions to resolve`)

  let updated = 0
  const errors: string[] = []
  const skipped: string[] = []

  for (const pred of pending) {
    const gameLabel = `${pred.home_team} vs ${pred.away_team} (${pred.game_time?.split('T')[0]})`

    try {
      // ── Step 1: Get the SR game ID ────────────────────────────────────────
      const srGameId = await findSrGameId(pred)

      if (!srGameId) {
        skipped.push(`${gameLabel}: SR game ID not found`)
        continue
      }

      // ── Step 2: Fetch final score from SR ─────────────────────────────────
      const result = await getGameResult(srGameId, pred.sport || 'ncaab')

      if (!result) {
        skipped.push(`${gameLabel}: SR fetch failed`)
        continue
      }

      if (result.status !== 'closed') {
        skipped.push(`${gameLabel}: status=${result.status} (not closed yet)`)
        continue
      }

      const { homeScore, awayScore } = result

      if (homeScore === null || awayScore === null) {
        skipped.push(`${gameLabel}: null scores`)
        continue
      }

      // ── Step 3: Determine actual winner ───────────────────────────────────
      const actualWinner: 'home' | 'away' | 'push' =
        homeScore > awayScore ? 'home' :
        awayScore > homeScore ? 'away' : 'push'

      // ── Step 4: Evaluate prediction ───────────────────────────────────────
      const wasCorrect = evaluatePrediction(pred, homeScore, awayScore)

      // ── Step 5: Write back to DB ──────────────────────────────────────────
      const { error: updateErr } = await supabaseAdmin
        .from('ai_predictions')
        .update({
          actual_score:  { home: homeScore, away: awayScore },
          actual_winner: actualWinner,
          was_correct:   wasCorrect,
          resolved_at:   new Date().toISOString(),
        })
        .eq('id', pred.id)

      if (updateErr) {
        errors.push(`${gameLabel}: DB update failed — ${updateErr.message}`)
        continue
      }

      updated++
      console.log(`[update-scores] ✓ ${gameLabel} → ${homeScore}-${awayScore}, correct=${wasCorrect}`)

    } catch (err: any) {
      errors.push(`${gameLabel}: ${err.message}`)
    }
  }

  return NextResponse.json({
    success:  true,
    checked:  pending.length,
    updated,
    skipped:  skipped.length,
    errors:   errors.length,
    details:  { skipped, errors },
  })
}

// ── Find the Sportradar game ID for a prediction ──────────────────────────────
// Strategy 1: Look up sports_events table (fastest, works when event is recent)
// Strategy 2: Search SR daily schedule by date + sport (fallback for older games)
async function findSrGameId(pred: any): Promise<string | null> {
  const gameDate = pred.game_time?.split('T')[0]  // 'YYYY-MM-DD'

  // Strategy 1 — sports_events table
  try {
    // Try exact team name match first
    const { data: exact } = await supabaseAdmin
      .from('sports_events')
      .select('external_event_id')
      .ilike('home_team', `%${pred.home_team.split(' ').pop()}%`)   // last word of name (e.g. "Cavaliers")
      .ilike('away_team', `%${pred.away_team.split(' ').pop()}%`)
      .gte('commence_time', `${gameDate}T00:00:00Z`)
      .lte('commence_time', `${gameDate}T23:59:59Z`)
      .limit(5)

    if (exact && exact.length === 1) {
      return exact[0].external_event_id
    }

    // If multiple hits (partial match), try stricter match
    if (exact && exact.length > 1) {
      const { data: strict } = await supabaseAdmin
        .from('sports_events')
        .select('external_event_id')
        .ilike('home_team', pred.home_team)
        .ilike('away_team', pred.away_team)
        .gte('commence_time', `${gameDate}T00:00:00Z`)
        .lte('commence_time', `${gameDate}T23:59:59Z`)
        .limit(1)

      if (strict && strict.length === 1) {
        return strict[0].external_event_id
      }
    }
  } catch {
    // Fall through to SR search
  }

  // Strategy 2 — SR daily schedule search
  if (!gameDate) return null

  try {
    const srGameId = await searchSrSchedule(pred.sport || 'ncaab', gameDate, pred.home_team, pred.away_team)
    return srGameId
  } catch {
    return null
  }
}

// ── Search SR daily schedule for a game ──────────────────────────────────────
async function searchSrSchedule(
  sport: string,
  date: string,           // 'YYYY-MM-DD'
  homeTeam: string,
  awayTeam: string,
): Promise<string | null> {
  const [year, month, day] = date.split('-')
  const sportPath = sport === 'ncaab' ? 'ncaamb' : sport
  const url = `${SR_BASE}/${sportPath}/trial/v8/en/games/${year}/${month}/${day}/schedule.json`

  const res = await fetch(url, {
    headers: { 'x-api-key': SR_KEY },
  })

  if (!res.ok) return null

  const data = await res.json()
  const games: any[] = data.games || []

  // Fuzzy match: last word of team name (e.g. "Cavaliers" from "Virginia Cavaliers")
  const homeWord = homeTeam.split(' ').pop()?.toLowerCase() ?? ''
  const awayWord = awayTeam.split(' ').pop()?.toLowerCase() ?? ''

  const match = games.find(g => {
    const srHome = (g.home?.name || g.home?.alias || '').toLowerCase()
    const srAway = (g.away?.name || g.away?.alias || '').toLowerCase()
    return srHome.includes(homeWord) && srAway.includes(awayWord)
  })

  return match?.id ?? null
}

// ── Fetch final score from SR game summary ────────────────────────────────────
async function getGameResult(gameId: string, sport: string): Promise<{
  status: string
  homeScore: number | null
  awayScore: number | null
} | null> {
  try {
    const sportPath = sport === 'ncaab' ? 'ncaamb' : sport
    const url = `${SR_BASE}/${sportPath}/trial/v8/en/games/${gameId}/summary.json`

    const res = await fetch(url, {
      headers: { 'x-api-key': SR_KEY },
    })

    if (!res.ok) return null

    const data = await res.json()

    return {
      status:     data.status       || 'unknown',
      homeScore:  data.home?.points ?? null,
      awayScore:  data.away?.points ?? null,
    }
  } catch {
    return null
  }
}

// ── Evaluate whether the stored prediction was correct ────────────────────────
//
// recommended_line is stored as: { top_pick: { bet_category, label, verdict, ... } }
// recommended_bet_type is: 'spread' | 'moneyline' | 'over_under'
//
// Label format examples:
//   Spread:     "Virginia Cavaliers -6.5"  or  "NC State Wolfpack +6.5"
//   Total:      "Over 152.5"  or  "Under 152.5"
//   Moneyline:  "Virginia Cavaliers ML"   or  "NC State Wolfpack ML"
//
function evaluatePrediction(pred: any, homeScore: number, awayScore: number): boolean {
  const betType   = (pred.recommended_bet_type || '').toLowerCase()
  const topPick   = pred.recommended_line?.top_pick ?? {}
  const label     = (topPick.label || '').toLowerCase()

  // Grab market lines stored at sim time
  const marketSpread = pred.market_spread ?? pred.odds_snapshot?.spread ?? null
  const marketTotal  = pred.market_total  ?? pred.odds_snapshot?.total  ?? null

  const actualMargin = homeScore - awayScore   // positive = home won
  const actualTotal  = homeScore + awayScore

  switch (betType) {
    // ── SPREAD ──────────────────────────────────────────────────────────────
    // The label tells us which team + which line was the recommendation.
    // We determine home vs away from the label, then apply the spread.
    case 'spread': {
      if (marketSpread === null) return false

      // Does the label reference the home team (case-insensitive partial match)?
      const isHomeSide = labelRefersToHome(label, pred.home_team)

      if (isHomeSide) {
        // Bet home spread_home (e.g. -6.5) — home covers if margin > -marketSpread
        // marketSpread is stored as the home team's line (negative = home fav)
        return actualMargin > -marketSpread
      } else {
        // Bet away side — away covers if (-actualMargin) > marketSpread (away's line = +abs)
        return -actualMargin > marketSpread
      }
    }

    // ── OVER/UNDER ───────────────────────────────────────────────────────────
    case 'over_under':
    case 'total': {
      if (marketTotal === null) return false

      if (label.startsWith('over')) {
        return actualTotal > marketTotal
      } else {
        return actualTotal < marketTotal
      }
    }

    // ── MONEYLINE ────────────────────────────────────────────────────────────
    case 'moneyline': {
      const isHomeSide = labelRefersToHome(label, pred.home_team)

      if (isHomeSide) {
        return homeScore > awayScore
      } else {
        return awayScore > homeScore
      }
    }

    default:
      return false
  }
}

// ── Does this bet label refer to the home team? ───────────────────────────────
// Matches on the last word of the home team name (most distinctive part).
// E.g. home_team = "Virginia Cavaliers" → looks for "cavaliers" in label.
function labelRefersToHome(label: string, homeTeam: string): boolean {
  // Try last word first (most specific)
  const lastWord = homeTeam.split(' ').pop()?.toLowerCase() ?? ''
  if (lastWord.length >= 4 && label.includes(lastWord)) return true

  // Try full team name
  if (label.includes(homeTeam.toLowerCase())) return true

  // Try first word (e.g. "Virginia" from "Virginia Cavaliers")
  const firstWord = homeTeam.split(' ')[0]?.toLowerCase() ?? ''
  if (firstWord.length >= 4 && label.includes(firstWord)) return true

  return false
}