// src/app/api/cron/update-scores/route.ts
//
// Runs nightly after games complete. Fetches final scores from MySportsFeeds (MSF),
// evaluates each prediction against the actual result, and writes:
//   - actual_score     (JSONB: { home, away })
//   - actual_winner    ('home' | 'away')
//   - was_correct      (boolean)
//   - resolved_at      (timestamp)
//
// MIGRATED: Sportradar → MySportsFeeds (MSF)
// KEY CHANGES vs Sportradar version:
//   1. Removed SR_BASE / SR_KEY — no Sportradar calls anywhere
//   2. Uses msfFetch + getMSFSeasonCandidates for all score lookups
//   3. MSF game IDs are numeric strings (not SR UUIDs)
//   4. Status check: 'completed' (MSF) instead of 'closed' (Sportradar)
//   5. Score fields: home_score / away_score (MSF naming)
//   6. getMSFGameResult() tries all season candidates (regular + playoff)
//      so this cron works correctly during NBA/NFL playoff months
//   7. searchMSFSchedule() fallback uses MSF date/games feed, not SR schedule
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin }             from '@/lib/database/supabase-admin'
import { msfFetch }                  from '@/lib/msf/client'
import { SportKey, MSF_LEAGUE, getMSFSeasonCandidates } from '@/lib/msf/config'

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
      // ── Step 1: Get the MSF game ID ───────────────────────────────────────
      const msfGameId = await findMSFGameId(pred)

      if (!msfGameId) {
        skipped.push(`${gameLabel}: MSF game ID not found`)
        continue
      }

      // ── Step 2: Fetch final score from MSF ────────────────────────────────
      const result = await getMSFGameResult(msfGameId, pred.sport || 'nba')

      if (!result) {
        skipped.push(`${gameLabel}: MSF fetch failed`)
        continue
      }

      // MSF uses 'completed' — NOT 'closed' (that was Sportradar)
      if (result.status !== 'completed') {
        skipped.push(`${gameLabel}: status=${result.status} (not completed yet)`)
        continue
      }

      const homeScore = result.home_score
      const awayScore = result.away_score

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

// ── Find the MSF game ID for a prediction ─────────────────────────────────────
// Strategy 1: Look up sports_events table (fastest — populated by cron fetch)
// Strategy 2: Search MSF daily games feed by date + team name (fallback)
async function findMSFGameId(pred: any): Promise<string | null> {
  const gameDate = pred.game_time?.split('T')[0]   // 'YYYY-MM-DD'

  // Strategy 1 — sports_events table
  // MSF game IDs are stored as external_event_id when games are fetched by the cron
  try {
    const { data: exact } = await supabaseAdmin
      .from('sports_events')
      .select('external_event_id')
      .ilike('home_team', `%${pred.home_team.split(' ').pop()}%`)
      .ilike('away_team', `%${pred.away_team.split(' ').pop()}%`)
      .gte('commence_time', `${gameDate}T00:00:00Z`)
      .lte('commence_time', `${gameDate}T23:59:59Z`)
      .limit(5)

    if (exact && exact.length === 1) {
      return String(exact[0].external_event_id)
    }

    // If multiple hits on the fuzzy match, try a strict name match
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
        return String(strict[0].external_event_id)
      }
    }
  } catch {
    // Fall through to MSF search
  }

  // Strategy 2 — MSF daily games feed
  if (!gameDate) return null

  try {
    return await searchMSFSchedule(
      pred.sport || 'nba',
      gameDate,
      pred.home_team,
      pred.away_team,
    )
  } catch {
    return null
  }
}

// ── Search MSF daily games feed for a specific game ───────────────────────────
// Tries all season candidates (regular + playoff) so it works during transitions.
async function searchMSFSchedule(
  sport:    string,
  date:     string,       // 'YYYY-MM-DD'
  homeTeam: string,
  awayTeam: string,
): Promise<string | null> {
  // Guard: only search for supported sports
  const validSport: SportKey =
    (sport in MSF_LEAGUE) ? (sport as SportKey) : 'nba'

  const league     = MSF_LEAGUE[validSport]
  const candidates = getMSFSeasonCandidates(validSport)
  const msfDate    = date.replace(/-/g, '')   // 'YYYY-MM-DD' → 'YYYYMMDD'

  // Use last word of team name for fuzzy matching (most distinctive part)
  // e.g. "Los Angeles Lakers" → "lakers"
  const homeWord = homeTeam.split(' ').pop()?.toLowerCase() ?? ''
  const awayWord = awayTeam.split(' ').pop()?.toLowerCase() ?? ''

  for (const season of candidates) {
    try {
      const data  = await msfFetch<any>(league, season, `date/${msfDate}/games`)
      const games: any[] = data.games || []

      if (games.length === 0) continue

      const match = games.find(g => {
        const homeAbbr = (g.schedule?.homeTeam?.abbreviation || '').toLowerCase()
        const awayAbbr = (g.schedule?.awayTeam?.abbreviation || '').toLowerCase()

        // Try last-word match against abbreviation (covers most cases)
        // Also try the reverse — abbreviation contained in the word
        const homeMatch =
          homeAbbr.includes(homeWord) || homeWord.includes(homeAbbr)
        const awayMatch =
          awayAbbr.includes(awayWord) || awayWord.includes(awayAbbr)

        return homeMatch && awayMatch
      })

      if (match) {
        return String(match.schedule?.id)
      }
    } catch {
      // This season candidate had no data for this date — try the next one
    }
  }

  return null
}

// ── Fetch final score from MSF ────────────────────────────────────────────────
// Tries all season candidates so cron resolves correctly during playoff months.
// Returns MSF-normalized field names: home_score / away_score (not homeScore / awayScore)
async function getMSFGameResult(
  gameId: string,
  sport:  string,
): Promise<{ status: string; home_score: number | null; away_score: number | null } | null> {
  const validSport: SportKey =
    (sport in MSF_LEAGUE) ? (sport as SportKey) : 'nba'

  const league     = MSF_LEAGUE[validSport]
  const candidates = getMSFSeasonCandidates(validSport)

  for (const season of candidates) {
    try {
      const data = await msfFetch<any>(league, season, 'games')
      const game = (data.games || []).find(
        (g: any) => String(g.schedule?.id) === gameId,
      )

      if (!game) continue

      // Normalize MSF playedStatus → our internal status string
      const s = (game.schedule?.playedStatus || '').toUpperCase()
      const status =
        s === 'COMPLETED'                  ? 'completed'  :
        s === 'LIVE' || s === 'INPROGRESS' ? 'inprogress' : 'scheduled'

      return {
        status,
        home_score: game.score?.homeScoreTotal ?? null,
        away_score: game.score?.awayScoreTotal ?? null,
      }
    } catch {
      // Try next season candidate
    }
  }

  return null
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
  const betType  = (pred.recommended_bet_type || '').toLowerCase()
  const topPick  = pred.recommended_line?.top_pick ?? {}
  const label    = (topPick.label || '').toLowerCase()

  // Grab market lines stored at sim time
  const marketSpread = pred.market_spread ?? pred.odds_snapshot?.spread ?? null
  const marketTotal  = pred.market_total  ?? pred.odds_snapshot?.total  ?? null

  const actualMargin = homeScore - awayScore   // positive = home won by this many
  const actualTotal  = homeScore + awayScore

  switch (betType) {
    // ── SPREAD ───────────────────────────────────────────────────────────────
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