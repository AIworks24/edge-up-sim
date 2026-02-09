import axios from 'axios'

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY!
const BASE_URL = 'https://api.the-odds-api.com/v4'

// Sport keys mapping
export const SPORT_KEYS = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  ncaab: 'basketball_ncaab',
  ncaaf: 'americanfootball_ncaa',
  mlb: 'baseball_mlb',
  nhl: 'icehockey_nhl'
} as const

export type SportKey = keyof typeof SPORT_KEYS

interface OddsAPIEvent {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: Array<{
    key: string
    title: string
    markets: Array<{
      key: string
      outcomes: Array<{
        name: string
        price: number
        point?: number
      }>
    }>
  }>
}

interface OddsAPIScore {
  id: string
  sport_key: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  scores: Array<{
    name: string
    score: string
  }>
}

class OddsAPIClient {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = ODDS_API_KEY
    this.baseUrl = BASE_URL
  }

  /**
   * Get upcoming and live events with odds for a sport
   */
  async getOdds(sportKey: SportKey, markets: string[] = ['h2h', 'spreads', 'totals']) {
    try {
      const response = await axios.get<OddsAPIEvent[]>(
        `${this.baseUrl}/sports/${SPORT_KEYS[sportKey]}/odds`,
        {
          params: {
            apiKey: this.apiKey,
            regions: 'us',
            markets: markets.join(','),
            oddsFormat: 'american',
            dateFormat: 'iso'
          }
        }
      )

      console.log(`[OddsAPI] Fetched ${response.data.length} events for ${sportKey}`)
      return response.data
    } catch (error: any) {
      console.error(`[OddsAPI] Error fetching odds for ${sportKey}:`, error.message)
      throw new Error(`Failed to fetch odds: ${error.message}`)
    }
  }

  /**
   * Get scores for completed and live events
   */
  async getScores(sportKey: SportKey, daysFrom: number = 3) {
    try {
      const response = await axios.get<OddsAPIScore[]>(
        `${this.baseUrl}/sports/${SPORT_KEYS[sportKey]}/scores`,
        {
          params: {
            apiKey: this.apiKey,
            daysFrom: daysFrom,
            dateFormat: 'iso'
          }
        }
      )

      console.log(`[OddsAPI] Fetched ${response.data.length} scores for ${sportKey}`)
      return response.data
    } catch (error: any) {
      console.error(`[OddsAPI] Error fetching scores for ${sportKey}:`, error.message)
      throw new Error(`Failed to fetch scores: ${error.message}`)
    }
  }

  /**
   * Get list of available sports
   */
  async getSports() {
    try {
      const response = await axios.get(`${this.baseUrl}/sports`, {
        params: {
          apiKey: this.apiKey
        }
      })

      return response.data
    } catch (error: any) {
      console.error('[OddsAPI] Error fetching sports:', error.message)
      throw new Error(`Failed to fetch sports: ${error.message}`)
    }
  }

  /**
   * Calculate average odds across bookmakers
   */
  calculateAverageOdds(event: OddsAPIEvent, market: 'h2h' | 'spreads' | 'totals') {
    const allOutcomes: { [key: string]: number[] } = {}

    event.bookmakers.forEach(bookmaker => {
      const marketData = bookmaker.markets.find(m => m.key === market)
      if (marketData) {
        marketData.outcomes.forEach(outcome => {
          const key = outcome.point !== undefined 
            ? `${outcome.name}_${outcome.point}` 
            : outcome.name
          
          if (!allOutcomes[key]) {
            allOutcomes[key] = []
          }
          allOutcomes[key].push(outcome.price)
        })
      }
    })

    // Calculate averages
    const averages: { [key: string]: number } = {}
    Object.keys(allOutcomes).forEach(key => {
      const odds = allOutcomes[key]
      averages[key] = Math.round(odds.reduce((a, b) => a + b, 0) / odds.length)
    })

    return averages
  }

  /**
   * Get best odds (most favorable for bettor) across bookmakers
   */
  getBestOdds(event: OddsAPIEvent, market: 'h2h' | 'spreads' | 'totals') {
    const bestOdds: { [key: string]: { odds: number, bookmaker: string } } = {}

    event.bookmakers.forEach(bookmaker => {
      const marketData = bookmaker.markets.find(m => m.key === market)
      if (marketData) {
        marketData.outcomes.forEach(outcome => {
          const key = outcome.point !== undefined 
            ? `${outcome.name}_${outcome.point}` 
            : outcome.name
          
          // For American odds: higher positive or less negative is better
          if (!bestOdds[key] || outcome.price > bestOdds[key].odds) {
            bestOdds[key] = {
              odds: outcome.price,
              bookmaker: bookmaker.title
            }
          }
        })
      }
    })

    return bestOdds
  }

  /**
   * Check remaining API quota
   */
  async checkQuota() {
    try {
      const response = await axios.get(`${this.baseUrl}/sports`, {
        params: {
          apiKey: this.apiKey
        }
      })

      const remaining = response.headers['x-requests-remaining']
      const used = response.headers['x-requests-used']

      return {
        remaining: parseInt(remaining || '0'),
        used: parseInt(used || '0')
      }
    } catch (error: any) {
      console.error('[OddsAPI] Error checking quota:', error.message)
      return null
    }
  }
}

// Export singleton instance
export const oddsAPIClient = new OddsAPIClient()

// Helper functions
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1
  } else {
    return (100 / Math.abs(americanOdds)) + 1
  }
}

export function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100)
  } else {
    return Math.round(-100 / (decimalOdds - 1))
  }
}

export function calculateImpliedProbability(americanOdds: number): number {
  if (americanOdds > 0) {
    return (100 / (americanOdds + 100)) * 100
  } else {
    return (Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)) * 100
  }
}