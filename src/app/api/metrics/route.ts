// src/app/api/metrics/route.ts
//
// Returns win rate, edge accuracy, and per-sport breakdowns.
// FIX: uses ai_predictions table (NOT predictions).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function GET() {
  // Pull predictions that have been resolved
  const { data: preds } = await supabaseAdmin
    .from('ai_predictions')
    .select('sport, was_correct, edge_score, confidence_score, edge_tier, prediction_type, is_daily_pick')
    .not('was_correct', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!preds || preds.length === 0) {
    return NextResponse.json({
      total:            0,
      win_rate:         0,
      avg_edge_score:   0,
      avg_confidence:   0,
      by_sport:         {},
      by_tier:          {},
      hot_picks:        { total: 0, win_rate: 0 },
    })
  }

  const total   = preds.length
  const correct = preds.filter(p => p.was_correct).length
  const winRate = total > 0 ? (correct / total) * 100 : 0

  const avgEdge       = avg(preds.map(p => p.edge_score       || 0))
  const avgConfidence = avg(preds.map(p => p.confidence_score || 0))

  // By sport
  const bySport: Record<string, { total: number; correct: number; win_rate: number }> = {}
  for (const p of preds) {
    const s = p.sport || 'unknown'
    if (!bySport[s]) bySport[s] = { total: 0, correct: 0, win_rate: 0 }
    bySport[s].total++
    if (p.was_correct) bySport[s].correct++
  }
  for (const s of Object.keys(bySport)) {
    bySport[s].win_rate = (bySport[s].correct / bySport[s].total) * 100
  }

  // By edge tier
  const byTier: Record<string, { total: number; correct: number; win_rate: number }> = {}
  for (const p of preds) {
    const t = p.edge_tier || 'UNKNOWN'
    if (!byTier[t]) byTier[t] = { total: 0, correct: 0, win_rate: 0 }
    byTier[t].total++
    if (p.was_correct) byTier[t].correct++
  }
  for (const t of Object.keys(byTier)) {
    byTier[t].win_rate = (byTier[t].correct / byTier[t].total) * 100
  }

  // Hot picks only
  const hotPicks   = preds.filter(p => p.is_daily_pick)
  const hpCorrect  = hotPicks.filter(p => p.was_correct).length
  const hpWinRate  = hotPicks.length > 0 ? (hpCorrect / hotPicks.length) * 100 : 0

  return NextResponse.json({
    total,
    win_rate:       Math.round(winRate * 10)       / 10,
    avg_edge_score: Math.round(avgEdge * 10)        / 10,
    avg_confidence: Math.round(avgConfidence * 10)  / 10,
    by_sport:       bySport,
    by_tier:        byTier,
    hot_picks: {
      total:    hotPicks.length,
      win_rate: Math.round(hpWinRate * 10) / 10,
    },
  })
}

const avg = (nums: number[]) =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0