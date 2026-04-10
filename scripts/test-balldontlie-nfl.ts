// =============================================================
// BallDontLie NFL API — RAW STRUCTURE DIAGNOSTIC
//
// Purpose: Print the exact JSON field names returned by BDL so
//          we can map them correctly in the library files.
//          Do NOT write library code until this output is confirmed.
//
// Setup:
//   1. Add to .env:  BALLDONTLIE_API_KEY=your_key_here
//   2. Run from repo root:
//      npx ts-node --project tsconfig.json scripts/test-balldontlie-nfl.ts
//
//   If ts-node isn't available:
//      npx tsx scripts/test-balldontlie-nfl.ts
// =============================================================

const API_KEY = process.env.BALLDONTLIE_API_KEY || ''
const BASE    = 'https://api.balldontlie.io/nfl/v1'

if (!API_KEY) {
  console.error('❌  BALLDONTLIE_API_KEY is not set in environment')
  process.exit(1)
}

const HEADERS = { 'Authorization': API_KEY }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function bdlGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  console.log(`  → GET ${url.toString()}`)
  const res = await fetch(url.toString(), { headers: HEADERS })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HTTP ${res.status}: ${body}`)
  }
  return res.json()
}

// Print every key in an object, with primitive values shown inline
// and array/object children summarised — stops at depth 4
function printShape(obj: any, prefix = '', depth = 0): void {
  if (depth > 4 || obj === null || obj === undefined) return
  if (Array.isArray(obj)) {
    console.log(`${prefix}: [Array(${obj.length})]`)
    if (obj.length > 0 && typeof obj[0] === 'object') {
      printShape(obj[0], `${prefix}[0]`, depth + 1)
    }
    return
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val === null)                         console.log(`${prefix}.${key}: null`)
      else if (Array.isArray(val))              { console.log(`${prefix}.${key}: [Array(${val.length})]`); if (val.length && typeof val[0] === 'object') printShape(val[0], `${prefix}.${key}[0]`, depth + 1) }
      else if (typeof val === 'object')         printShape(val, `${prefix}.${key}`, depth + 1)
      else                                      console.log(`${prefix}.${key}: ${val}`)
    }
  }
}

async function run() {
  console.log('=== BallDontLie NFL Raw Structure Diagnostic ===\n')
  console.log(`API key present: ${API_KEY.slice(0, 8)}...\n`)

  let teamId   = ''
  let gameId   = ''
  let teamAbbr = ''

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 1: Teams — grab two team IDs for downstream tests
  // ─────────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════')
  console.log('SECTION 1: TEAMS LIST (first 4 teams)')
  console.log('══════════════════════════════════════════════')
  try {
    const data = await bdlGet('/teams')
    const teams = data.data || []
    console.log(`\nTotal teams in response: ${teams.length}`)
    console.log('\n--- Full team object structure (first team) ---')
    if (teams[0]) printShape(teams[0], 'team')

    // Pick two real teams for tests
    const kc  = teams.find((t: any) => t.abbreviation === 'KC'  || t.name?.includes('Chiefs'))
    const buf = teams.find((t: any) => t.abbreviation === 'BUF' || t.name?.includes('Bills'))
    const pick = kc || teams[0]
    teamId   = String(pick?.id || '')
    teamAbbr = pick?.abbreviation || pick?.name || ''
    console.log(`\n✅ Test team: ${teamAbbr} (id=${teamId})`)

    // Print first 4 teams for reference
    console.log('\n--- First 4 teams (id, name, abbreviation) ---')
    teams.slice(0, 4).forEach((t: any) => console.log(`  id=${t.id}  name=${t.name || t.full_name}  abbr=${t.abbreviation}`))
  } catch (err: any) {
    console.log(`❌ ${err.message}`)
  }

  await sleep(400)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 2: Games — shape of a game object, find a recent game ID
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('SECTION 2: GAMES — season 2025, week 1')
  console.log('══════════════════════════════════════════════')
  try {
    const data = await bdlGet('/games', { seasons: '2025', weeks: '1' })
    const games = data.data || []
    console.log(`\nGames returned: ${games.length}`)

    if (games[0]) {
      gameId = String(games[0].id)
      console.log('\n--- Full game object structure (game[0]) ---')
      printShape(games[0], 'game')

      console.log('\n--- RAW JSON of game[0] ---')
      console.log(JSON.stringify(games[0], null, 2))
    }

    // Print key fields across first 3 games
    console.log('\n--- First 3 games summary ---')
    games.slice(0, 3).forEach((g: any) => {
      console.log(`  id=${g.id}  ${g.away_team?.full_name || g.away_team?.name} @ ${g.home_team?.full_name || g.home_team?.name}  status=${g.status}  date=${g.date || g.start_date}`)
    })
    console.log(`\n✅ Test game ID: ${gameId}`)
  } catch (err: any) {
    console.log(`❌ ${err.message}`)
  }

  await sleep(400)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 3: Upcoming games — THIS is what the cron uses
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('SECTION 3: UPCOMING GAMES (current season, no week filter)')
  console.log('══════════════════════════════════════════════')
  try {
    const currentYear = new Date().getMonth() >= 8
      ? new Date().getFullYear()
      : new Date().getFullYear() - 1
    const data = await bdlGet('/games', { seasons: String(currentYear) })
    const games = data.data || []
    const upcoming = games.filter((g: any) => {
      const status = (g.status || '').toLowerCase()
      return status.includes('scheduled') || status.includes('ns') || g.home_score === null
    })
    console.log(`\nTotal games for season ${currentYear}: ${games.length}`)
    console.log(`Upcoming (unplayed): ${upcoming.length}`)
    if (upcoming[0]) {
      console.log('\n--- Upcoming game[0] ---')
      printShape(upcoming[0], 'upcoming_game')
      console.log('\n--- RAW JSON ---')
      console.log(JSON.stringify(upcoming[0], null, 2))
    }
  } catch (err: any) {
    console.log(`❌ ${err.message}`)
  }

  await sleep(400)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 4: TEAM SEASON STATS — THE CRITICAL SECTION
  // Need: points, yards, plays, turnovers, red zone, third down
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('SECTION 4: TEAM SEASON STATS ← CRITICAL')
  console.log('══════════════════════════════════════════════')
  if (!teamId) {
    console.log('⚠️  Skipping — no team ID from Section 1')
  } else {
    try {
      const data = await bdlGet('/team_season_stats', {
        team_id: teamId,
        season:  '2024',  // Use last completed season for guaranteed data
      })
      console.log(`\n--- Top-level keys ---`)
      console.log(Object.keys(data).join(', '))

      const stats = data.data
      if (stats) {
        console.log('\n--- Team Season Stats full structure ---')
        printShape(stats, 'team_season_stats')

        console.log('\n--- RAW JSON (copy this — field names are critical) ---')
        console.log(JSON.stringify(stats, null, 2))
      } else {
        console.log('\n⚠️  data.data is empty — response structure:')
        console.log(JSON.stringify(data, null, 2))
      }
    } catch (err: any) {
      console.log(`❌ ${err.message}`)
      console.log('   → If 401: Team Season Stats requires ALL-STAR tier or higher')
      console.log('   → Check your trial includes this endpoint')
    }
  }

  await sleep(400)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 5: TEAM STATS (per-game stats — fallback if season stats missing)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('SECTION 5: TEAM STATS (per-game)')
  console.log('══════════════════════════════════════════════')
  if (!teamId) {
    console.log('⚠️  Skipping — no team ID')
  } else {
    try {
      const data = await bdlGet('/team_stats', {
        team_id: teamId,
        season:  '2024',
      })
      console.log(`\n--- Top-level keys ---`)
      console.log(Object.keys(data).join(', '))

      const stats = data.data
      if (stats) {
        console.log('\n--- Team Stats structure ---')
        printShape(stats, 'team_stats')
        console.log('\n--- RAW JSON ---')
        console.log(JSON.stringify(Array.isArray(stats) ? stats[0] : stats, null, 2))
      } else {
        console.log('⚠️  Empty:', JSON.stringify(data, null, 2))
      }
    } catch (err: any) {
      console.log(`❌ ${err.message}`)
    }
  }

  await sleep(400)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 6: SEASON STATS (player-level, filtered by team)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('SECTION 6: SEASON STATS endpoint (team filter)')
  console.log('══════════════════════════════════════════════')
  if (!teamId) {
    console.log('⚠️  Skipping')
  } else {
    try {
      const data = await bdlGet('/season_stats', {
        team_id: teamId,
        season:  '2024',
      })
      const stats = data.data || []
      console.log(`\nRecords returned: ${stats.length}`)
      if (stats[0]) {
        console.log('\n--- season_stats[0] structure ---')
        printShape(stats[0], 'season_stats[0]')
        console.log('\n--- RAW JSON of stats[0] ---')
        console.log(JSON.stringify(stats[0], null, 2))
      }
    } catch (err: any) {
      console.log(`❌ ${err.message}`)
    }
  }

  await sleep(400)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 7: BETTING ODDS — shape of odds response
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('SECTION 7: BETTING ODDS')
  console.log('══════════════════════════════════════════════')
  try {
    // Try to get odds for the current season
    const currentYear = new Date().getMonth() >= 8
      ? new Date().getFullYear()
      : new Date().getFullYear() - 1
    const data = await bdlGet('/odds', { season: String(currentYear) })
    const odds = data.data || []
    console.log(`\nOdds records returned: ${odds.length}`)
    if (odds[0]) {
      console.log('\n--- Odds object[0] structure ---')
      printShape(odds[0], 'odds')
      console.log('\n--- RAW JSON of odds[0] ---')
      console.log(JSON.stringify(odds[0], null, 2))
    } else {
      console.log('⚠️  No odds returned — trying with game_id filter...')
      if (gameId) {
        const data2 = await bdlGet('/odds', { game_id: gameId })
        const odds2 = data2.data || []
        console.log(`Game-specific odds records: ${odds2.length}`)
        if (odds2[0]) {
          console.log('\n--- RAW JSON of odds[0] ---')
          console.log(JSON.stringify(odds2[0], null, 2))
        }
      }
    }
  } catch (err: any) {
    console.log(`❌ ${err.message}`)
    console.log('   → If 401: Betting Odds requires GOAT tier')
    console.log('   → If empty: No lines posted yet for current season')
  }

  await sleep(400)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 8: INJURIES
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('SECTION 8: PLAYER INJURIES')
  console.log('══════════════════════════════════════════════')
  try {
    const data = await bdlGet('/player_injuries')
    const injuries = data.data || []
    console.log(`\nInjury records: ${injuries.length}`)
    if (injuries[0]) {
      console.log('\n--- injury[0] structure ---')
      printShape(injuries[0], 'injury')
    }
  } catch (err: any) {
    console.log(`❌ ${err.message}`)
  }

  console.log('\n\n=== DIAGNOSTIC COMPLETE ===')
  console.log('\nNext steps:')
  console.log('1. Paste the SECTION 4 output (team_season_stats JSON) back to Claude')
  console.log('2. Paste the SECTION 2 output (game JSON) back to Claude')
  console.log('3. Paste the SECTION 7 output (odds JSON) back to Claude')
  console.log('Claude will then write the library files using confirmed field names.')
}

run().catch(console.error)