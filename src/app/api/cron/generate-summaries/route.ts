// src/app/api/cron/generate-summaries/route.ts
//
// Daily cron — generates game_summary predictions for all upcoming games.
// Marks top 3 by edge_score as is_daily_pick = true to feed the Hot Picks feed.
// Runs after trigger-fetch so sports_events are populated.
//
// Add to vercel.json crons:
//   { "path": "/api/cron/generate-summaries", "schedule": "30 15 * * *" }
//   (15:30 UTC = ~11:30am EST, after trigger-fetch at 14:00 UTC)
//
// Manual trigger (browser):
//   /api/cron/generate-summaries?secret=YOUR_CRON_SECRET
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { runGameSimulation }         from '@/lib/ai/claude-agent'
import { supabaseAdmin }             from '@/lib/database/supabase-admin'

// Only generate for sports where the simulation engine is active
const ACTIVE_SPORTS = ['ncaab', 'nba'] as const

export async function GET(req: NextRequest) {
  const authHeader  = req.headers.get('authorization')
  const querySecret = new URL(req.url).searchParams.get('secret')
  const provided    = authHeader?.replace('Bearer ', '') || querySecret
  const force       = new URL(req.url).searchParams.get('force') === 'true'

  if (provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today   = new Date().toISOString().split('T')[0]
  const results: Record<string, any> = {}
  const errors:  string[] = []

  for (const sport of ACTIVE_SPORTS) {
    console.log(`\n[generate-summaries] ── ${sport} ──`)

    try {
      // ── Check if already ran today ─────────────────────────────────────
      const { data: existing } = await supabaseAdmin
        .from('simulation_batch_runs')
        .select('id, status, games_processed')
        .eq('run_date', today)
        .eq('sport_key', sport)
        .single()

      if (existing?.status === 'completed' && !force) {
        console.log(`[generate-summaries] ${sport} already completed today — skipping (use ?force=true to override)`)
        results[sport] = { skipped: true, games_processed: existing.games_processed }
        continue
      }

      // ── Create / reset batch run record ───────────────────────────────
      const { data: batchRun } = await supabaseAdmin
        .from('simulation_batch_runs')
        .upsert({
          run_date:   today,
          sport_key:  sport,
          status:     'running',
          started_at: new Date().toISOString(),
          games_processed: 0,
        }, { onConflict: 'run_date,sport_key' })
        .select('id')
        .single()

      // ── Fetch upcoming events for this sport ───────────────────────────
      const threeDays = new Date()
      threeDays.setDate(threeDays.getDate() + 3)

      const { data: events, error: eventsError } = await supabaseAdmin
        .from('sports_events')
        .select('id, external_event_id, home_team, away_team, commence_time, sport_key, home_team_sr_id, away_team_sr_id, neutral_site, odds_data')
        .eq('sport_key', sport)
        .eq('event_status', 'upcoming')
        .gte('commence_time', new Date().toISOString())
        .lte('commence_time', threeDays.toISOString())
        .not('home_team_sr_id', 'is', null)
        .not('away_team_sr_id', 'is', null)
        .order('commence_time', { ascending: true })

      if (eventsError || !events?.length) {
        console.log(`[generate-summaries] ${sport}: no events with SR IDs found`)
        await supabaseAdmin.from('simulation_batch_runs').update({
          status: 'completed', games_processed: 0, completed_at: new Date().toISOString(),
        }).eq('id', batchRun?.id)
        results[sport] = { processed: 0, reason: 'no events with SR IDs' }
        continue
      }

      let processed = 0
      const gameErrors: string[] = []

      for (const event of events) {
        try {
          // Skip if a game_summary already exists for this event today
          const { data: existingSummary } = await supabaseAdmin
            .from('ai_predictions')
            .select('id')
            .eq('event_id', event.id)
            .eq('prediction_type', 'game_summary')
            .gte('created_at', `${today}T00:00:00.000Z`)
            .maybeSingle()

          if (existingSummary && !force) {
            console.log(`[generate-summaries] already have summary for ${event.home_team} — skipping`)
            continue
          }

          // Parse odds — stored as flat object
          const o = typeof event.odds_data === 'string'
            ? JSON.parse(event.odds_data)
            : (event.odds_data ?? {})

          // Skip if we don't have enough odds data
          if (o.spread_home == null && o.total == null) {
            console.log(`[generate-summaries] no odds for ${event.home_team} — skipping`)
            continue
          }

          // Skip if either team name is still an abbreviation (stats lookup will fail)
          const isAbbr = (name: string) => /^[A-Z]{2,3}$/.test(name)
          if (isAbbr(event.home_team) || isAbbr(event.away_team)) {
            console.log(`[generate-summaries] unresolved team name for ${event.away_team} @ ${event.home_team} — skipping`)
            continue
          }

          console.log(`[generate-summaries] Simulating: ${event.away_team} @ ${event.home_team}`)

          await runGameSimulation({
            event_id:        event.id,
            home_team:       event.home_team,
            away_team:       event.away_team,
            home_team_sr_id: event.home_team_sr_id,
            away_team_sr_id: event.away_team_sr_id,
            sport:           event.sport_key as 'ncaab' | 'nba',
            spread_home:     o.spread_home      ?? 0,
            total:           o.total            ?? 140,
            odds_spread:     o.spread_home_odds ?? -110,
            odds_total:      o.total_over_odds  ?? -110,
            odds_ml_home:    o.moneyline_home   ?? -110,
            odds_ml_away:    o.moneyline_away   ?? -110,
            neutral_site:    event.neutral_site ?? false,
            game_time:       event.commence_time,
            is_hot_pick:     false,
            is_game_summary: true,   // ← new flag — stores as prediction_type='game_summary'
          })

          processed++
          console.log(`[generate-summaries] ✓ ${event.away_team} @ ${event.home_team}`)

          // Small delay to avoid rate-limiting SR/Claude APIs
          await new Promise(r => setTimeout(r, 1500))

        } catch (eventErr: any) {
          console.error(`[generate-summaries] Error on ${event.home_team}:`, eventErr.message)
          gameErrors.push(`${event.away_team} @ ${event.home_team}: ${eventErr.message}`)
        }
      }

      // ── Mark top 3 by edge_score as is_daily_pick ─────────────────────
      // This feeds the Hot Picks feed on the dashboard
      const { data: topPicks } = await supabaseAdmin
        .from('ai_predictions')
        .select('id, edge_score')
        .eq('prediction_type', 'game_summary')
        .gte('created_at', `${today}T00:00:00.000Z`)
        .order('edge_score', { ascending: false })
        .limit(3)

      if (topPicks?.length) {
        for (let i = 0; i < topPicks.length; i++) {
          await supabaseAdmin.from('ai_predictions').update({
            is_daily_pick:  true,
            daily_pick_rank: i + 1,
          }).eq('id', topPicks[i].id)
        }
        console.log(`[generate-summaries] Marked ${topPicks.length} as daily picks`)
      }

      // ── Mark batch complete ────────────────────────────────────────────
      await supabaseAdmin.from('simulation_batch_runs').update({
        status:       'completed',
        games_processed: processed,
        completed_at: new Date().toISOString(),
      }).eq('id', batchRun?.id)

      results[sport] = { processed, total: events.length, game_errors: gameErrors }
      console.log(`[generate-summaries] ${sport} done: ${processed}/${events.length}`)

    } catch (err: any) {
      console.error(`[generate-summaries] Fatal error on ${sport}:`, err.message)
      errors.push(`${sport}: ${err.message}`)
      results[sport] = { error: err.message }
      await supabaseAdmin.from('simulation_batch_runs').update({
        status: 'failed', error_message: err.message,
      }).eq('run_date', today).eq('sport_key', sport)
    }
  }

  return NextResponse.json({
    success:   errors.length === 0,
    date:      today,
    results,
    errors,
    timestamp: new Date().toISOString(),
  })
}