export interface EdgeClassification {
  tier: 'EXCEPTIONAL' | 'STRONG' | 'MODERATE' | 'RISKY' | 'NO_VALUE'
  label: string
  description: string
  color: string         // Tailwind color class
  badge_color: string   // For UI badge
  recommend: boolean    // Whether to show as a recommendation
  min_score: number
  max_score: number
}

export const EDGE_TIERS: EdgeClassification[] = [
  {
    tier: 'EXCEPTIONAL',
    label: '🔥 Exceptional Edge',
    description: 'Strong model confidence. Highest-value bet of the day.',
    color: 'text-emerald-400',
    badge_color: 'bg-emerald-500',
    recommend: true,
    min_score: 28,
    max_score: 999,
  },
  {
    tier: 'STRONG',
    label: '✅ Strong Edge',
    description: 'Model shows clear value. High confidence recommendation.',
    color: 'text-green-400',
    badge_color: 'bg-green-500',
    recommend: true,
    min_score: 20,
    max_score: 27.99,
  },
  {
    tier: 'MODERATE',
    label: '⚡ Moderate Edge',
    description: 'Some model value detected. Proceed with smaller sizing.',
    color: 'text-yellow-400',
    badge_color: 'bg-yellow-500',
    recommend: true,  // Show but flag as moderate
    min_score: 12,
    max_score: 19.99,
  },
  {
    tier: 'RISKY',
    label: '⚠️ Risky / Low Edge',
    description: 'Minimal model edge. High variance outcome likely.',
    color: 'text-orange-400',
    badge_color: 'bg-orange-500',
    recommend: false,
    min_score: 0.1,
    max_score: 11.99,
  },
  {
    tier: 'NO_VALUE',
    label: '❌ No Value Found',
    description: 'Model finds no betting edge. Skip this game.',
    color: 'text-gray-400',
    badge_color: 'bg-gray-600',
    recommend: false,
    min_score: -999,
    max_score: 0,
  },
]

export function classifyEdgeScore(edgeScore: number): EdgeClassification {
  return EDGE_TIERS.find(t => edgeScore >= t.min_score && edgeScore <= t.max_score)
    ?? EDGE_TIERS[4]  // Default to NO_VALUE
}

// Update the system prompt threshold — changed from 65% confidence to 20% edge score
export const RECOMMENDATION_THRESHOLD = {
  MIN_EDGE_SCORE: 20,       // Your confirmed threshold
  MIN_CONFIDENCE: 55,        // Simulation win probability floor
  HOT_PICK_MIN_EDGE: 20,    // Only feature picks with 20%+ edge
}