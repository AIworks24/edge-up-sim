// src/app/api/predictions/track-bet/route.ts
//
// PATCH — toggle user_placed_bet on a simulation the user owns
// GET   — return tracked bet stats for the current user
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const { data: { user } } = await getAnonClient().auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  return user ?? null
}

// ── PATCH — toggle bet tracking ───────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { predictionId, placed } = body as { predictionId: string; placed: boolean }

  if (!predictionId || typeof placed !== 'boolean') {
    return NextResponse.json({ error: 'predictionId and placed (boolean) required' }, { status: 400 })
  }

  // Verify ownership first
  const { data: existing } = await supabaseAdmin
    .from('ai_predictions')
    .select('id, requested_by')
    .eq('id', predictionId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Prediction not found' }, { status: 404 })
  if (existing.requested_by !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('ai_predictions')
    .update({
      user_placed_bet: placed,
      bet_placed_at:   placed ? new Date().toISOString() : null,
    })
    .eq('id', predictionId)
    .eq('requested_by', user.id)

  if (error) {
    console.error('[track-bet PATCH] error:', error.message)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, predictionId, placed })
}

// ── GET — return tracked bet stats ────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tracked, error } = await supabaseAdmin
    .from('ai_predictions')
    .select('id, sport, game_time, edge_score, edge_tier, was_correct, bet_placed_at, recommended_bet_type')
    .eq('requested_by', user.id)
    .eq('user_placed_bet', true)
    .order('bet_placed_at', { ascending: false })

  if (error) {
    console.error('[track-bet GET] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const bets     = tracked ?? []
  const resolved = bets.filter(b => b.was_correct !== null)
  const wins     = resolved.filter(b => b.was_correct === true).length
  const losses   = resolved.filter(b => b.was_correct === false).length
  const pending  = bets.length - resolved.length

  // Per-sport breakdown
  const bySport: Record<string, { total: number; wins: number; losses: number }> = {}
  for (const b of resolved) {
    const s = b.sport || 'Unknown'
    if (!bySport[s]) bySport[s] = { total: 0, wins: 0, losses: 0 }
    bySport[s].total++
    if (b.was_correct) bySport[s].wins++
    else               bySport[s].losses++
  }

  const avgEdge = bets.length
    ? Math.round((bets.reduce((sum, b) => sum + (b.edge_score ?? 0), 0) / bets.length) * 10) / 10
    : null

  return NextResponse.json({
    stats: {
      totalTracked: bets.length,
      pending,
      resolved:  resolved.length,
      wins,
      losses,
      winRate:   resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : null,
      avgEdge,
      bySport,
    },
  })
}