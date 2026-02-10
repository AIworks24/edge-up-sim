/**
 * Legal US states where sports betting is allowed
 */
export const LEGAL_STATES = [
  'AZ', 'CO', 'CT', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 
  'MD', 'MA', 'MI', 'MO', 'NJ', 'NY', 'NC', 'OH', 'PA', 'TN', 
  'VT', 'VA', 'WV', 'WY'
] as const

/**
 * State names mapping
 */
export const STATE_NAMES: { [key: string]: string } = {
  'AZ': 'Arizona',
  'CO': 'Colorado',
  'CT': 'Connecticut',
  'IL': 'Illinois',
  'IN': 'Indiana',
  'IA': 'Iowa',
  'KS': 'Kansas',
  'KY': 'Kentucky',
  'LA': 'Louisiana',
  'ME': 'Maine',
  'MD': 'Maryland',
  'MA': 'Massachusetts',
  'MI': 'Michigan',
  'MO': 'Missouri',
  'NJ': 'New Jersey',
  'NY': 'New York',
  'NC': 'North Carolina',
  'OH': 'Ohio',
  'PA': 'Pennsylvania',
  'TN': 'Tennessee',
  'VT': 'Vermont',
  'VA': 'Virginia',
  'WV': 'West Virginia',
  'WY': 'Wyoming'
}

/**
 * Subscription tiers and limits
 */
export const SUBSCRIPTION_TIERS = {
  edge_starter: {
    name: 'Edge Starter',
    price: 29,
    dailySimLimit: 3,
    features: [
      '3 personalized hot picks daily',
      '3 custom simulations per day',
      'Moneyline, Spread, Total analysis',
      'Basic edge score display',
      'Performance tracking'
    ]
  },
  edge_pro: {
    name: 'Edge Pro',
    price: 99,
    dailySimLimit: 10,
    features: [
      '3 personalized hot picks daily',
      '10 custom simulations per day',
      'All bet types including Player Props',
      'Advanced edge breakdown',
      'Historical performance analytics',
      'Priority support'
    ]
  },
  edge_elite: {
    name: 'Edge Elite',
    price: 249,
    dailySimLimit: 50,
    features: [
      '3 personalized hot picks daily',
      '50 custom simulations per day',
      'All bet types + advanced analysis',
      'Full advanced analytics',
      'Bankroll management tools',
      'Dedicated support',
      'Early access to new features'
    ]
  }
} as const

/**
 * Parlay add-on
 */
export const PARLAY_ADDON = {
  name: 'Parlay Analysis',
  price: 50,
  features: [
    'Parlay recommendations',
    'Same-game parlay analysis',
    'Multi-leg correlation analysis',
    'Parlay-specific edge calculation'
  ]
}

/**
 * Sports configuration (Tier 1 Priority)
 */
export const SPORTS = {
  nfl: {
    name: 'NFL',
    key: 'nfl',
    icon: '🏈',
    priority: 1,
    oddsApiKey: 'americanfootball_nfl'
  },
  nba: {
    name: 'NBA',
    key: 'nba',
    icon: '🏀',
    priority: 1,
    oddsApiKey: 'basketball_nba'
  },
  ncaaf: {
    name: 'NCAA Football',
    key: 'ncaaf',
    icon: '🏈',
    priority: 1,
    oddsApiKey: 'americanfootball_ncaa'
  },
  ncaab: {
    name: 'NCAA Basketball',
    key: 'ncaab',
    icon: '🏀',
    priority: 1,
    oddsApiKey: 'basketball_ncaab'
  },
  mlb: {
    name: 'MLB',
    key: 'mlb',
    icon: '⚾',
    priority: 2,
    oddsApiKey: 'baseball_mlb'
  },
  nhl: {
    name: 'NHL',
    key: 'nhl',
    icon: '🏒',
    priority: 2,
    oddsApiKey: 'icehockey_nhl'
  }
} as const

/**
 * Bet types
 */
export const BET_TYPES = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Over/Under',
  parlay: 'Parlay',
  prop: 'Player Prop'
} as const

/**
 * AI Configuration
 */
export const AI_CONFIG = {
  minConfidence: 65,  // Minimum confidence threshold
  minEdge: 2.0,       // Minimum edge percentage
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2500,
  temperature: 0.3
} as const

/**
 * Trial configuration
 */
export const TRIAL_CONFIG = {
  durationDays: 3,
  requireCard: true,
  annualDiscountPercent: 20
} as const

/**
 * Cache TTL (Time to Live) in seconds
 */
export const CACHE_TTL = {
  hotPicks: 86400,          // 24 hours
  oddsData: 300,            // 5 minutes
  learningInsights: 86400,  // 24 hours
  userProfile: 3600         // 1 hour
} as const

/**
 * API Rate Limits
 */
export const RATE_LIMITS = {
  oddsAPI: {
    requestsPerMonth: 10000,
    requestsPerMinute: 100
  },
  claudeAPI: {
    requestsPerMinute: 50,
    tokensPerDay: 100000
  }
} as const

/**
 * Email types
 */
export const EMAIL_TYPES = {
  WELCOME: 'welcome',
  TRIAL_ENDING: 'trial_ending',
  SUBSCRIPTION_CONFIRMED: 'subscription_confirmed',
  PAYMENT_FAILED: 'payment_failed',
  MARKETING: 'marketing'
} as const

/**
 * Admin permissions
 */
export const ADMIN_PERMISSIONS = {
  VIEW_USERS: 'view_users',
  MANAGE_USERS: 'manage_users',
  VIEW_PREDICTIONS: 'view_predictions',
  MARK_PREDICTIONS: 'mark_predictions',
  MANAGE_PROMO_CODES: 'manage_promo_codes',
  MANAGE_INVITES: 'manage_invites',
  VIEW_ANALYTICS: 'view_analytics'
} as const

/**
 * Problem gambling resources
 */
export const RESPONSIBLE_GAMBLING = {
  hotline: '1-800-GAMBLER',
  website: 'https://www.ncpgambling.org/',
  disclaimer: 'For entertainment and educational purposes only. Never bet more than you can afford to lose. If you or someone you know has a gambling problem, call 1-800-GAMBLER.'
} as const