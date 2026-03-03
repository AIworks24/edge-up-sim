import { classifyEdgeScore } from '@/lib/ai/edge-classifier'

interface EdgeScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function EdgeScoreBadge({ score, size = 'md', showLabel = true }: EdgeScoreBadgeProps) {
  const classification = classifyEdgeScore(score)

  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-2',
    lg: 'text-2xl px-5 py-3 font-bold',
  }

  return (
    <div className={`inline-flex flex-col items-center rounded-lg ${sizeClasses[size]}`}
         style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: `2px solid currentColor` }}
    >
      {showLabel && (
        <span className="text-xs text-gray-400 uppercase tracking-wide mb-1">
          Edge Up Score
        </span>
      )}
      <span className={`font-bold ${classification.color}`}>
        {score > 0 ? score.toFixed(1) : '0.0'}%
      </span>
      <span className={`text-xs mt-1 font-medium ${classification.color}`}>
        {classification.label}
      </span>
    </div>
  )
}