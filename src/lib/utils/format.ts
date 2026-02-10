/**
 * Format American odds with + or - sign
 */
export function formatOdds(odds: number): string {
  if (odds > 0) {
    return `+${odds}`
  }
  return odds.toString()
}

/**
 * Format currency (USD)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
}

/**
 * Format percentage with decimals
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format edge score with color class
 */
export function formatEdge(edge: number): {
  text: string
  className: string
} {
  const edgeText = edge > 0 ? `+${edge.toFixed(1)}%` : `${edge.toFixed(1)}%`
  
  let className = 'text-gray-600'
  if (edge >= 5) className = 'text-green-600 font-bold'
  else if (edge >= 2) className = 'text-green-600'
  else if (edge >= 0) className = 'text-yellow-600'
  else className = 'text-red-600'
  
  return { text: edgeText, className }
}

/**
 * Format confidence score with color
 */
export function formatConfidence(confidence: number): {
  text: string
  bgClass: string
  textClass: string
} {
  const text = `${confidence.toFixed(0)}%`
  
  let bgClass = 'bg-gray-100'
  let textClass = 'text-gray-800'
  
  if (confidence >= 90) {
    bgClass = 'bg-green-100'
    textClass = 'text-green-800'
  } else if (confidence >= 75) {
    bgClass = 'bg-blue-100'
    textClass = 'text-blue-800'
  } else if (confidence >= 65) {
    bgClass = 'bg-yellow-100'
    textClass = 'text-yellow-800'
  } else {
    bgClass = 'bg-red-100'
    textClass = 'text-red-800'
  }
  
  return { text, bgClass, textClass }
}

/**
 * Format team name (shorten if needed)
 */
export function formatTeamName(teamName: string, maxLength: number = 20): string {
  if (teamName.length <= maxLength) return teamName
  
  // Try to keep important parts
  const parts = teamName.split(' ')
  if (parts.length > 1) {
    // Return last word (usually the team name)
    return parts[parts.length - 1]
  }
  
  return teamName.substring(0, maxLength) + '...'
}

/**
 * Format sport key to readable name
 */
export function formatSportName(sportKey: string): string {
  const sportNames: { [key: string]: string } = {
    'nfl': 'NFL',
    'nba': 'NBA',
    'ncaaf': 'NCAA Football',
    'ncaab': 'NCAA Basketball',
    'mlb': 'MLB',
    'nhl': 'NHL',
    'americanfootball_nfl': 'NFL',
    'basketball_nba': 'NBA',
    'americanfootball_ncaa': 'NCAA Football',
    'basketball_ncaab': 'NCAA Basketball',
    'baseball_mlb': 'MLB',
    'icehockey_nhl': 'NHL'
  }
  
  return sportNames[sportKey] || sportKey.toUpperCase()
}

/**
 * Format bet type to readable name
 */
export function formatBetType(betType: string): string {
  const betTypes: { [key: string]: string } = {
    'moneyline': 'Moneyline',
    'spread': 'Spread',
    'total': 'Over/Under',
    'over_under': 'Over/Under',
    'parlay': 'Parlay',
    'prop': 'Player Prop'
  }
  
  return betTypes[betType] || betType
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const then = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
  
  return then.toLocaleDateString()
}

/**
 * Format countdown to event
 */
export function formatCountdown(eventDate: Date | string): string {
  const now = new Date()
  const event = typeof eventDate === 'string' ? new Date(eventDate) : eventDate
  const diffMs = event.getTime() - now.getTime()

  if (diffMs < 0) return 'Started'

  const diffMin = Math.floor(diffMs / (1000 * 60))
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMin < 60) return `in ${diffMin} min`
  if (diffHour < 24) return `in ${diffHour}h`
  if (diffDay < 7) return `in ${diffDay}d`
  
  return event.toLocaleDateString()
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Format record (e.g., "12-5-1")
 */
export function formatRecord(wins: number, losses: number, ties: number = 0): string {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`
  }
  return `${wins}-${losses}`
}

/**
 * Format win rate as percentage
 */
export function formatWinRate(wins: number, total: number): string {
  if (total === 0) return '0.0%'
  return ((wins / total) * 100).toFixed(1) + '%'
}