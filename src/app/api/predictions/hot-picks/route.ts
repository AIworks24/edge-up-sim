// src/app/api/predictions/hot-picks/route.ts
//
// Returns today's hot picks. When a user auth token is present,
// any pick for which the user has their own user_simulation is
// replaced with that row — ensuring dashboard and history match exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const today = new Date().toISOString().split('T')[0]

    // ── 1. Get base picks (curated or fallback) ───────────────────────────
    let picks: any[] = []
    let source = 'curated'

    const { data: marked, error: markedError } = await supabaseAdmin
      .from('ai_predictions')
      .select(`
        id, event_id, home_team, away_team, sport, game_time,
        edge_score, edge_tier, confidence_score,
        recommended_bet_type, recommended_line,
        projected_home_score, projected_away_score,
        ai_analysis, market_spread, market_total,
        fair_spread, fair_total,
        sim_home_win_pct, sim_home_cover_pct, sim_over_pct,
        daily_pick_rank, prediction_type, key_factors,
        full_response
      `)
      .eq('is_daily_pick', true)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .not('market_spread', 'is', null)
      .order('daily_pick_rank', { ascending: true })
      .limit(5)

    if (markedError) {
      console.error('[HOT PICKS API] Error:', markedError)
      return NextResponse.json({ error: markedError.message }, { status: 500 })
    }

    if (marked && marked.length > 0) {
      picks = marked
    } else {
      // Fallback: cron hasn't run yet
      source = 'auto'
      const { data: topToday, error: topError } = await supabaseAdmin
        .from('ai_predictions')
        .select(`
          id, event_id, home_team, away_team, sport, game_time,
          edge_score, edge_tier, confidence_score,
          recommended_bet_type, recommended_line,
          projected_home_score, projected_away_score,
          ai_analysis, market_spread, market_total,
          fair_spread, fair_total,
          sim_home_win_pct, sim_home_cover_pct, sim_over_pct,
          prediction_type, key_factors, full_response
        `)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .gt('game_time', new Date().toISOString())
        .order('edge_score', { ascending: false })
        .limit(5)

      if (topError) {
        console.error('[HOT PICKS API] Fallback error:', topError)
        return NextResponse.json({ picks: [] })
      }

      // Dedup by game
      const seenGames = new Set<string>()
      picks = (topToday || []).filter((p: any) => {
        const key = `${p.home_team}|${p.away_team}`
        if (seenGames.has(key)) return false
        seenGames.add(key)
        return true
      })
    }

    if (picks.length === 0) {
      return NextResponse.json({ picks: [], source })
    }

    // ── 2. If user is authenticated, substitute their own simulations ─────
    // This ensures the dashboard and history page show identical numbers.
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const anonClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        const { data: { user } } = await anonClient.auth.getUser(
          authHeader.replace('Bearer ', '')
        )

        if (user) {
          // Get all event_ids from the picks (skip nulls)
          const eventIds = picks.map((p: any) => p.event_id).filter(Boolean)

          if (eventIds.length > 0) {
            // Find any user_simulation rows for these events
            const { data: userSims } = await supabaseAdmin
              .from('ai_predictions')
              .select(`
                id, event_id, home_team, away_team, sport, game_time,
                edge_score, edge_tier, confidence_score,
                recommended_bet_type, recommended_line,
                projected_home_score, projected_away_score,
                ai_analysis, market_spread, market_total,
                fair_spread, fair_total,
                sim_home_win_pct, sim_home_cover_pct, sim_over_pct,
                prediction_type, key_factors, full_response,
                daily_pick_rank
              `)
              .eq('requested_by', user.id)
              .eq('prediction_type', 'user_simulation')
              .in('event_id', eventIds)
              .order('created_at', { ascending: false })

            if (userSims && userSims.length > 0) {
              // Build a map: event_id → user's most recent simulation
              const userSimMap = new Map<string, any>()
              for (const sim of userSims) {
                if (sim.event_id && !userSimMap.has(sim.event_id)) {
                  userSimMap.set(sim.event_id, sim)
                }
              }

              // Substitute picks with user's own simulation where available
              picks = picks.map((pick: any) => {
                if (pick.event_id && userSimMap.has(pick.event_id)) {
                  const userSim = userSimMap.get(pick.event_id)
                  // Keep daily_pick_rank from the official pick for ordering
                  return { ...userSim, daily_pick_rank: pick.daily_pick_rank }
                }
                return pick
              })
            }
          }
        }
      } catch (authErr) {
        // Auth lookup failed — return base picks unchanged
        console.warn('[HOT PICKS API] Auth lookup failed, using base picks:', authErr)
      }
    }

    return NextResponse.json({ picks, source })

  } catch (err: any) {
    console.error('[HOT PICKS API] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}