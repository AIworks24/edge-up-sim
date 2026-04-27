// src/lib/msf/config.ts
// MySportsFeeds v2.1 configuration
// Field names confirmed from live API diagnostic (April 2026)

export const MSF_CONFIG = {
  BASE:    'https://api.mysportsfeeds.com/v2.1/pull',
  API_KEY: process.env.MSF_API_KEY  || '',
  PASSWORD: process.env.MSF_PASSWORD || 'MYSPORTSFEEDS',
}

// Human-readable sport key used throughout the app
// Matches existing SportKey type — drop-in replacement for Sportradar
export type SportKey = 'ncaab' | 'nba' | 'nfl' | 'ncaaf'

// MSF league slug per sport
// Confirmed from live API: nfl and nba work; ncaab/ncaaf need subscription
export const MSF_LEAGUE: Record<SportKey, string> = {
  ncaab: 'ncaa-bb',   // requires NCAAB subscription
  nba:   'nba',       // confirmed working
  nfl:   'nfl',       // confirmed working
  ncaaf: 'ncaa-fb',   // requires NCAAF subscription
}

// Season format per sport
// Both confirmed working from live API
export function getMSFSeason(sport: SportKey, type: 'regular' | 'playoff' = 'regular'): string {
  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  switch (sport) {
    case 'nfl':
    case 'ncaaf':
      return month >= 9
        ? `${year}-${type}`
        : `${year - 1}-${type}`

    case 'nba':
    case 'ncaab':
      const startYear = month >= 10 ? year : year - 1
      return `${startYear}-${startYear + 1}-${type}`
  }
}

// Returns candidate seasons to try in priority order for a given sport.
// Playoff slug is tried first during playoff months (April–June for NBA).
export function getMSFSeasonCandidates(sport: SportKey): string[] {
  const month = new Date().getMonth() + 1  // 1-12

  if (sport === 'nba' || sport === 'ncaab') {
    // NBA playoffs: April–June. Try playoff first, then regular as fallback.
    if (month >= 4 && month <= 6) {
      return [getMSFSeason(sport, 'playoff'), getMSFSeason(sport, 'regular')]
    }
    return [getMSFSeason(sport, 'regular')]
  }

  if (sport === 'nfl' || sport === 'ncaaf') {
    // NFL playoffs: January. Try playoff first in January, else regular.
    if (month === 1) {
      return [getMSFSeason(sport, 'playoff'), getMSFSeason(sport, 'regular')]
    }
    return [getMSFSeason(sport, 'regular')]
  }

  return [getMSFSeason(sport, 'regular')]
}

// Static NFL team abbreviation → full name map
// Used when game object only returns abbreviation (MSF schedule doesn't include full name)
export const NFL_TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Cardinals',   ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',    BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',   CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',      DEN: 'Denver Broncos',
  DET: 'Detroit Lions',       GB:  'Green Bay Packers',
  HOU: 'Houston Texans',      IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',KC:  'Kansas City Chiefs',
  LV:  'Las Vegas Raiders',   LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',    MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',   NE:  'New England Patriots',
  NO:  'New Orleans Saints',  NYG: 'New York Giants',
  NYJ: 'New York Jets',       PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
  SF:  'San Francisco 49ers', TB:  'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',    WAS: 'Washington Commanders',
}

// Static NBA team abbreviation → full name map
export const NBA_TEAM_NAMES: Record<string, string> = {
  GS:  'Golden State Warriors', GSW: 'Golden State Warriors',
  HOU: 'Houston Rockets',       IND: 'Indiana Pacers',
  LAC: 'LA Clippers',           LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies',     MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks',       MIN: 'Minnesota Timberwolves',
  NO:  'New Orleans Pelicans',  NOP: 'New Orleans Pelicans',
  NY:  'New York Knicks',       NYK: 'New York Knicks',
  OKC: 'Oklahoma City Thunder', OKL: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers',    PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers',
  SA:  'San Antonio Spurs',     SAS: 'San Antonio Spurs',
}

export function getTeamName(abbr: string, sport: SportKey): string {
  if (sport === 'nfl' || sport === 'ncaaf') return NFL_TEAM_NAMES[abbr] || abbr
  if (sport === 'nba' || sport === 'ncaab') return NBA_TEAM_NAMES[abbr] || abbr
  return abbr
}