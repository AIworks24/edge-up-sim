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
// NFL:  single year  → "2024-regular"
// NBA:  two year     → "2024-2025-regular"
// Both confirmed working from live API
export function getMSFSeason(sport: SportKey, type: 'regular' | 'playoff' = 'regular'): string {
  const now   = new Date()
  const month = now.getMonth() + 1   // 1-12
  const year  = now.getFullYear()

  switch (sport) {
    case 'nfl':
    case 'ncaaf':
      // NFL/NCAAF season: single year, starts September
      // If before September use previous year's season
      return month >= 9
        ? `${year}-${type}`
        : `${year - 1}-${type}`

    case 'nba':
    case 'ncaab':
      // NBA/NCAAB: two-year format, season starts October
      // 2025-26 season = "2025-2026-regular"
      const startYear = month >= 10 ? year : year - 1
      return `${startYear}-${startYear + 1}-${type}`
  }
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
  ATL: 'Atlanta Hawks',        BOS: 'Boston Celtics',
  BKN: 'Brooklyn Nets',        CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls',        CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks',     DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons',      GS:  'Golden State Warriors',
  HOU: 'Houston Rockets',      IND: 'Indiana Pacers',
  LAC: 'LA Clippers',          LAL: 'Los Angeles Lakers',
  MEM: 'Memphis Grizzlies',    MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks',      MIN: 'Minnesota Timberwolves',
  NO:  'New Orleans Pelicans', NY:  'New York Knicks',
  OKC: 'Oklahoma City Thunder',ORL: 'Orlando Magic',
  PHI: 'Philadelphia 76ers',   PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers',SA:  'San Antonio Spurs',
  SAC: 'Sacramento Kings',     TOR: 'Toronto Raptors',
  UTA: 'Utah Jazz',            WAS: 'Washington Wizards',
}

export function getTeamName(abbr: string, sport: SportKey): string {
  if (sport === 'nfl' || sport === 'ncaaf') return NFL_TEAM_NAMES[abbr] || abbr
  if (sport === 'nba' || sport === 'ncaab') return NBA_TEAM_NAMES[abbr] || abbr
  return abbr
}