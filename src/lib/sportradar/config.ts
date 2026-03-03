// src/lib/sportradar/config.ts

export const SR_CONFIG = {
  BASE:           'https://api.sportradar.com',
  API_KEY:        process.env.SPORTRADAR_API_KEY || '',
  RATE_LIMIT_MS:      1000,  // 1 req/sec on trial tier
  RATE_LIMIT_MS_PROD:  200,  // 5 req/sec on paid tier
  ENDPOINTS: {
    ncaab: {
      schedule:     '/ncaamb/trial/v8/en/games/{year}/{month}/{day}/schedule.json',
      team_stats:   '/ncaamb/trial/v8/en/seasons/{year}/REG/teams/{teamId}/statistics.json',
      team_games:   '/ncaamb/trial/v8/en/teams/{teamId}/profile.json',
      game_summary: '/ncaamb/trial/v8/en/games/{gameId}/summary.json',
      standings:    '/ncaamb/trial/v8/en/seasons/{year}/REG/standings.json',
    },
    nba: {
      schedule:     '/nba/trial/v8/en/games/{year}/{month}/{day}/schedule.json',
      team_stats:   '/nba/trial/v8/en/seasons/{year}/REG/teams/{teamId}/statistics.json',
      game_summary: '/nba/trial/v8/en/games/{gameId}/summary.json',
    },
    nfl: {
      schedule:     '/nfl/official/trial/v7/en/games/{year}/{month}/{day}/schedule.json',
      team_stats:   '/nfl/official/trial/v7/en/seasons/{year}/REG/teams/{teamId}/statistics.json',
      game_summary: '/nfl/official/trial/v7/en/games/{gameId}/summary.json',
    },
    odds: {
      basketball:   '/oddscomparison/trial/v2/en/sports/basketball/events.json',
      football:     '/oddscomparison/trial/v2/en/sports/americanfootball/events.json',
    },
  },
}

// Standalone function — avoids TypeScript method-on-object-literal issues
export function getCurrentSeasonYear(): number {
  const month = new Date().getMonth() + 1  // 1-12
  const year  = new Date().getFullYear()
  // Seasons start in Sept/Oct — if before Sept, use previous year
  return month >= 9 ? year : year - 1
}

// Human-readable sport key used throughout the app
export type SportKey = 'ncaab' | 'nba' | 'nfl'

// Map app sport key → SportRadar URL path segment
// CRITICAL: ncaab → ncaamb (ncaab returns 404 on live API)
export const SR_SPORT_PATH: Record<SportKey, string> = {
  ncaab: 'ncaamb',
  nba:   'nba',
  nfl:   'nfl/official',
}