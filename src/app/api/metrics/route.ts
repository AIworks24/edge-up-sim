// src/app/api/metrics/route.ts
//
// FIX: column is requested_by (not user_id) on ai_predictions table.
// Supports ?scope=all|hot_picks and ?days=N query params.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin }            from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') ?? 'all'
  const days  = parseInt(searchParams.get('days') ?? '0')

  // ── Build query — global, no user scoping ─────────────────────────────────
  let query = supabaseAdmin
    .from('ai_predictions')
    .select(
      'sport, was_correct, edge_score, confidence_score, edge_tier, ' +
      'prediction_type, is_daily_pick, created_at'
    )

  if (scope === 'hot_picks') {
    query = query.eq('is_daily_pick', true)
  }

  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('created_at', since)
  }

  query = query.order('created_at', { ascending: false }).limit(1000)

  const { data: preds, error } = await query as unknown as { data: any[] | null, error: any }

  if (error) {
    console.error('[metrics] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!preds || preds.length === 0) {
    return NextResponse.json(emptyResponse())
  }

  // ── Calculate totals ──────────────────────────────────────────────────────
  const total    = preds.length
  const resolved = preds.filter(p => p.was_correct !== null)
  const wins     = resolved.filter(p => p.was_correct === true).length
  const losses   = resolved.filter(p => p.was_correct === false).length
  const winRate  = resolved.length > 0 ? Math.round((wins / resolved.length) * 1000) / 10 : 0

  // Theoretical ROI at -110 (win $100 on $110 bet)
  // ROI = (wins × 100 - losses × 110) / (resolved × 110) × 100
  const roi = resolved.length > 0
    ? Math.round(((wins * 100 - losses * 110) / (resolved.length * 110)) * 1000) / 10
    : 0

  const avgEdge       = avg(preds.map(p => p.edge_score       ?? 0))
  const avgConfidence = avg(preds.map(p => p.confidence_score ?? 0))

  // ── Hot picks segment ─────────────────────────────────────────────────────
  const hp         = preds.filter(p => p.is_daily_pick)
  const hpResolved = hp.filter(p => p.was_correct !== null)
  const hpWins     = hpResolved.filter(p => p.was_correct === true).length
  const hpLosses   = hpResolved.filter(p => p.was_correct === false).length
  const hpWinRate  = hpResolved.length > 0
    ? Math.round((hpWins / hpResolved.length) * 1000) / 10
    : 0
  const hpAvgEdge  = avg(hp.map(p => p.edge_score ?? 0))

  // ── By sport ──────────────────────────────────────────────────────────────
  const sportMap: Record<string, { total: number; wins: number; losses: number }> = {}
  for (const p of resolved) {
    const s = p.sport ?? 'unknown'
    if (!sportMap[s]) sportMap[s] = { total: 0, wins: 0, losses: 0 }
    sportMap[s].total++
    if (p.was_correct === true)  sportMap[s].wins++
    if (p.was_correct === false) sportMap[s].losses++
  }
  const bySport = Object.entries(sportMap).map(([sport, d]) => ({
    sport,
    total:    d.total,
    wins:     d.wins,
    losses:   d.losses,
    win_rate: d.total > 0 ? Math.round((d.wins / d.total) * 1000) / 10 : 0,
  }))

  return NextResponse.json({
    total,
    resolved:        resolved.length,
    wins,
    losses,
    win_rate:        winRate,
    roi,
    avg_edge_score:  Math.round(avgEdge       * 10) / 10,
    avg_confidence:  Math.round(avgConfidence * 10) / 10,
    hot_picks: {
      total:    hp.length,
      resolved: hpResolved.length,
      wins:     hpWins,
      losses:   hpLosses,
      win_rate: hpWinRate,
      avg_edge: Math.round(hpAvgEdge * 10) / 10,
    },
    by_sport: bySport,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const avg = (nums: number[]) =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0

function emptyResponse() {
  return {
    total: 0, resolved: 0, wins: 0, losses: 0,
    win_rate: 0, roi: 0, avg_edge_score: 0, avg_confidence: 0,
    hot_picks: { total: 0, resolved: 0, wins: 0, losses: 0, win_rate: 0, avg_edge: 0 },
    by_sport:  [],
  }
}