// src/app/api/metrics/route.ts
//
// Returns performance metrics for the dashboard and MetricsBar.
//
// Query params:
//   ?scope=all         → all of this user's predictions (dashboard 4-tiles)
//   ?scope=hot_picks   → hot picks only (MetricsBar)
//   ?days=30           → look-back window (default: all time)
//
// Always scoped to the authenticated user — never global platform data.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET(req: NextRequest) {
  // ── Auth: verify session token ─────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  let userId: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '')
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user } } = await anonClient.auth.getUser(token)
    userId = user?.id ?? null
  }

  // ── Parse query params ─────────────────────────────────────────────────────
  const url   = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'all'      // 'all' | 'hot_picks'
  const days  = parseInt(url.searchParams.get('days') ?? '0') // 0 = all time

  // ── Build date filter ──────────────────────────────────────────────────────
  let afterDate: string | null = null
  if (days > 0) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    afterDate = d.toISOString()
  }

  // ── Query ai_predictions ───────────────────────────────────────────────────
  // Only resolved predictions (was_correct is not null) count toward outcomes.
  // Unresolved predictions (was_correct IS NULL) are excluded from win/loss math
  // but still count toward total picks run.

  let query = supabaseAdmin
    .from('ai_predictions')
    .select('sport, was_correct, edge_score, confidence_score, edge_tier, prediction_type, is_daily_pick, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  // Scope to the authenticated user if available
  if (userId) {
    query = query.eq('user_id', userId)
  }

  // Scope to hot picks only if requested (MetricsBar)
  if (scope === 'hot_picks') {
    query = query.eq('is_daily_pick', true)
  }

  // Apply date window
  if (afterDate) {
    query = query.gte('created_at', afterDate)
  }

  const { data: preds, error } = await query

  if (error) {
    console.error('[metrics] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!preds || preds.length === 0) {
    return NextResponse.json(buildEmpty())
  }

  // ── Resolved vs pending ────────────────────────────────────────────────────
  // was_correct === null  → game not yet graded (no icon shown in UI)
  // was_correct === true  → correct prediction
  // was_correct === false → incorrect prediction
  const resolved = preds.filter(p => p.was_correct !== null)
  const correct  = resolved.filter(p => p.was_correct === true).length
  const losses   = resolved.filter(p => p.was_correct === false).length
  const winRate  = resolved.length > 0 ? (correct / resolved.length) * 100 : 0

  // Avg edge across ALL predictions (resolved + unresolved), for the 4-tile "Avg Edge"
  const avgEdge       = avg(preds.map(p => p.edge_score       ?? 0))
  const avgConfidence = avg(resolved.map(p => p.confidence_score ?? 0))

  // ROI calculation — simple theoretical ROI at -110 odds
  // Win: profit = 0.909 units. Loss: -1 unit.
  // ROI = (correct × 0.909 - losses × 1) / resolved.length × 100
  const roi = resolved.length > 0
    ? ((correct * 0.909 - losses * 1) / resolved.length) * 100
    : 0

  // ── By sport breakdown ─────────────────────────────────────────────────────
  const bySport: Record<string, { total: number; wins: number; losses: number; win_rate: number }> = {}
  for (const p of resolved) {
    const s = p.sport || 'unknown'
    if (!bySport[s]) bySport[s] = { total: 0, wins: 0, losses: 0, win_rate: 0 }
    bySport[s].total++
    if (p.was_correct === true)  bySport[s].wins++
    if (p.was_correct === false) bySport[s].losses++
  }
  for (const s of Object.keys(bySport)) {
    const sp = bySport[s]
    sp.win_rate = sp.total > 0 ? round1(sp.wins / sp.total * 100) : 0
  }

  // ── Hot picks segment (for dashboard tiles when scope='all') ───────────────
  const hotPreds    = preds.filter(p => p.is_daily_pick)
  const hotResolved = hotPreds.filter(p => p.was_correct !== null)
  const hotCorrect  = hotResolved.filter(p => p.was_correct === true).length
  const hotLosses   = hotResolved.filter(p => p.was_correct === false).length
  const hotWinRate  = hotResolved.length > 0 ? (hotCorrect / hotResolved.length) * 100 : 0

  return NextResponse.json({
    // ── Core metrics (used by dashboard 4-tiles) ───────────────────────────
    total:            preds.length,        // all picks run (resolved + pending)
    resolved:         resolved.length,     // picks with a graded outcome
    wins:             correct,
    losses,
    win_rate:         round1(winRate),
    roi:              round1(roi),
    avg_edge_score:   round1(avgEdge),
    avg_confidence:   round1(avgConfidence),

    // ── Hot picks segment (used by MetricsBar) ─────────────────────────────
    hot_picks: {
      total:    hotPreds.length,
      resolved: hotResolved.length,
      wins:     hotCorrect,
      losses:   hotLosses,
      win_rate: round1(hotWinRate),
      avg_edge: round1(avg(hotPreds.map(p => p.edge_score ?? 0))),
    },

    // ── Sport breakdown ────────────────────────────────────────────────────
    by_sport: Object.entries(bySport).map(([sport, s]) => ({ sport, ...s })),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}
function round1(n: number) {
  return Math.round(n * 10) / 10
}
function buildEmpty() {
  return {
    total: 0, resolved: 0, wins: 0, losses: 0,
    win_rate: 0, roi: 0, avg_edge_score: 0, avg_confidence: 0,
    hot_picks: { total: 0, resolved: 0, wins: 0, losses: 0, win_rate: 0, avg_edge: 0 },
    by_sport: [],
  }
}