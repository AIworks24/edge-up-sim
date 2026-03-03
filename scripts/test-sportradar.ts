// =============================================================
// SportRadar NCAAMB — RAW STRUCTURE DIAGNOSTIC
// 
// Purpose: Print raw JSON from each endpoint so we can map
// the EXACT field paths needed for stats.ts
//
// Run: SPORTRADAR_API_KEY=your-key npx ts-node scripts/test-sportradar-raw.ts
// =============================================================

const API_KEY = process.env.SPORTRADAR_API_KEY || 'OYmrtgA8zt2M9DN4kb3xWrb4R4FZKKfD1NoUne5a'
const BASE    = 'https://api.sportradar.com'

const HEADERS = {
  'accept': 'application/json',
  'x-api-key': API_KEY,
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function srGet(url: string): Promise<any> {
  console.log(`  → GET ${url}`)
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Pretty print only the keys/values we care about — no giant arrays
function printStructure(obj: any, prefix = '', depth = 0): void {
  if (depth > 4) return
  if (obj === null || obj === undefined) { console.log(`${prefix}: null`); return }
  if (Array.isArray(obj)) {
    console.log(`${prefix}: [Array of ${obj.length}]`)
    if (obj.length > 0 && typeof obj[0] === 'object') {
      printStructure(obj[0], `${prefix}[0]`, depth + 1)
    }
    return
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (Array.isArray(val)) {
        console.log(`${prefix}.${key}: [Array(${val.length})]`)
        if (val.length > 0 && typeof val[0] === 'object' && depth < 3) {
          printStructure(val[0], `${prefix}.${key}[0]`, depth + 1)
        }
      } else if (val !== null && typeof val === 'object') {
        printStructure(val, `${prefix}.${key}`, depth + 1)
      } else {
        console.log(`${prefix}.${key}: ${val}`)
      }
    }
  }
}

async function runDiagnostic() {
  console.log('=== SportRadar NCAAMB Raw Structure Diagnostic ===\n')

  // Yesterday's date
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const YEAR  = d.getFullYear()
  const MONTH = String(d.getMonth() + 1).padStart(2, '0')
  const DAY   = String(d.getDate()).padStart(2, '0')

  let homeTeamId = ''
  let gameId     = ''

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 1: Schedule — raw game object structure
  // ─────────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════')
  console.log('SECTION 1: RAW GAME OBJECT (from Daily Schedule)')
  console.log('══════════════════════════════════════════════════')

  try {
    const url = `${BASE}/ncaamb/trial/v8/en/games/${YEAR}/${MONTH}/${DAY}/schedule.json`
    const data = await srGet(url)
    const games = data.games || []
    console.log(`\nTotal games: ${games.length}`)

    if (games.length > 0) {
      const g = games[0]
      gameId = g.id
      console.log('\n--- Full game object (first game) ---')
      printStructure(g, 'game')

      // Specifically find team IDs
      homeTeamId = g.home?.id || ''
      console.log(`\n✅ Home team ID for next tests: ${homeTeamId}`)
      console.log(`✅ Game ID for next tests: ${gameId}`)
    }
  } catch (err: any) {
    console.log(`❌ ${err.message}`)
  }

  await sleep(1200)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 2: Team Stats — this is the most important one
  // We need to find: points, FGA, 3PA, FTA, ORB, TOV for own + opponents
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════')
  console.log('SECTION 2: RAW TEAM STATS (Seasonal Statistics)')
  console.log('══════════════════════════════════════════════════')

  const seasonYear = parseInt(MONTH) >= 9 ? YEAR : YEAR - 1

  if (!homeTeamId) {
    homeTeamId = '2778d005-cc14-4e58-9bf2-3fc37bffb62f' // Maryland from your test
    console.log(`Using Maryland team ID: ${homeTeamId}`)
  }

  try {
    const url = `${BASE}/ncaamb/trial/v8/en/seasons/${seasonYear}/REG/teams/${homeTeamId}/statistics.json`
    const data = await srGet(url)

    console.log('\n--- Top-level keys ---')
    console.log(Object.keys(data).join(', '))

    // Print team info
    console.log(`\n--- Team info ---`)
    console.log(`id:     ${data.id}`)
    console.log(`name:   ${data.name}`)
    console.log(`market: ${data.market}`)

    // Print season node
    if (data.season) {
      console.log('\n--- season node ---')
      printStructure(data.season, 'season')
    }

    // Check own_record (we saw this in your output)
    if (data.own_record !== undefined) {
      console.log('\n--- own_record node (full structure) ---')
      printStructure(data.own_record, 'own_record')
    }

    // Check own (the original guess)
    if (data.own !== undefined && data.own !== '') {
      console.log('\n--- own node ---')
      printStructure(data.own, 'own')
    }

    // Check opponents
    if (data.opponents) {
      console.log('\n--- opponents node (full structure) ---')
      printStructure(data.opponents, 'opponents')
    }

    // Check players (to confirm structure)
    if (data.players && data.players.length > 0) {
      console.log('\n--- players[0] structure (first player) ---')
      printStructure(data.players[0], 'players[0]')
    }

    // Print the RAW JSON of own_record if it exists (most important)
    if (data.own_record) {
      console.log('\n--- RAW JSON of own_record (copy this!) ---')
      console.log(JSON.stringify(data.own_record, null, 2))
    }

    // If own_record is empty, check if stats are at top level
    console.log('\n--- Searching for "points" anywhere in response ---')
    const jsonStr = JSON.stringify(data)
    const pointsIdx = jsonStr.indexOf('"points"')
    if (pointsIdx >= 0) {
      console.log(`Found "points" key at position ${pointsIdx}`)
      console.log('Context: ...', jsonStr.slice(Math.max(0, pointsIdx - 20), pointsIdx + 100), '...')
    } else {
      console.log('⚠️  "points" key NOT found anywhere in response')
    }

    console.log('\n--- Searching for "average" anywhere in response ---')
    const avgIdx = jsonStr.indexOf('"average"')
    if (avgIdx >= 0) {
      console.log('Context: ...', jsonStr.slice(Math.max(0, avgIdx - 50), avgIdx + 100), '...')
    } else {
      console.log('⚠️  "average" key NOT found anywhere in response')
    }

  } catch (err: any) {
    console.log(`❌ ${err.message}`)
  }

  await sleep(1200)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 3: Game Summary raw structure
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════')
  console.log('SECTION 3: RAW GAME SUMMARY')
  console.log('══════════════════════════════════════════════════')

  if (!gameId) {
    console.log('⚠️  Skipping — no game ID')
  } else {
    try {
      const url = `${BASE}/ncaamb/trial/v8/en/games/${gameId}/summary.json`
      const data = await srGet(url)

      console.log('\n--- Top-level keys ---')
      console.log(Object.keys(data).join(', '))

      // The game object
      if (data.game) {
        console.log('\n--- game node structure ---')
        printStructure(data.game, 'game', 0)
      }

      // Print raw JSON of just the game scores area
      if (data.game?.home) {
        console.log('\n--- RAW game.home (scores + team info) ---')
        const home = { ...data.game.home }
        delete home.statistics  // skip stats to keep output short
        delete home.players
        console.log(JSON.stringify(home, null, 2))
      }

    } catch (err: any) {
      console.log(`❌ ${err.message}`)
    }
  }

  await sleep(1200)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 4: Try the Game Boxscore — may have per-team stats
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════')
  console.log('SECTION 4: GAME BOXSCORE (may have team stats)')
  console.log('══════════════════════════════════════════════════')

  if (!gameId) {
    console.log('⚠️  Skipping — no game ID')
  } else {
    try {
      const url = `${BASE}/ncaamb/trial/v8/en/games/${gameId}/boxscore.json`
      const data = await srGet(url)

      console.log('\n--- Top-level keys ---')
      console.log(Object.keys(data).join(', '))

      if (data.game?.home?.statistics) {
        console.log('\n--- RAW game.home.statistics ---')
        console.log(JSON.stringify(data.game.home.statistics, null, 2))
      }

      if (data.game?.away?.statistics) {
        console.log('\n--- RAW game.away.statistics ---')
        console.log(JSON.stringify(data.game.away.statistics, null, 2))
      }

    } catch (err: any) {
      console.log(`❌ ${err.message}`)
    }
  }

  await sleep(1200)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 5: Try League Leaders — confirms what stats are available
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════')
  console.log('SECTION 5: SEASONS LIST (find correct season ID)')
  console.log('══════════════════════════════════════════════════')

  try {
    const url = `${BASE}/ncaamb/trial/v8/en/league/seasons.json`
    const data = await srGet(url)

    console.log('\n--- Available seasons ---')
    const seasons = data.seasons || []
    seasons.slice(-5).forEach((s: any) => {
      console.log(`  Year: ${s.year} | Type: ${s.type} | ID: ${s.id} | Status: ${s.status}`)
    })

  } catch (err: any) {
    console.log(`❌ ${err.message}`)
  }

  await sleep(1200)

  // ─────────────────────────────────────────────────────────────────────
  // SECTION 6: Try fetching stats with a known good team from your test
  // Using Rutgers: b03bb029-4499-4a2c-9074-5071ed360b21
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════')
  console.log('SECTION 6: ALTERNATE STATS ENDPOINTS TO TRY')
  console.log('══════════════════════════════════════════════════')

  // Try different season year (maybe 2025-26 = year 2025)
  for (const yr of [seasonYear, seasonYear - 1, seasonYear + 1]) {
    try {
      const url = `${BASE}/ncaamb/trial/v8/en/seasons/${yr}/REG/teams/${homeTeamId}/statistics.json`
      const data = await srGet(url)
      console.log(`\n✅ Season ${yr} works!`)
      console.log(`   Top-level keys: ${Object.keys(data).join(', ')}`)

      // Check if own_record has actual stats in this year
      const rec = data.own_record
      if (rec && typeof rec === 'object' && Object.keys(rec).length > 0) {
        console.log(`   own_record keys: ${Object.keys(rec).join(', ')}`)
        console.log('\n--- RAW own_record for season', yr, '---')
        console.log(JSON.stringify(rec, null, 2))
        break  // Found it — stop trying
      } else {
        console.log(`   own_record appears empty for season ${yr}`)
      }
      await sleep(1200)
    } catch (err: any) {
      console.log(`   Season ${yr}: ❌ ${err.message}`)
      await sleep(1200)
    }
  }

  console.log('\n════════════════════════════════════════════════════════════')
  console.log('DIAGNOSTIC COMPLETE')
  console.log('Paste the full output above into chat so we can')
  console.log('map the exact field paths for stats.ts')
  console.log('════════════════════════════════════════════════════════════\n')
}

runDiagnostic().catch(err => {
  console.error('\n❌ FATAL:', err.message)
  process.exit(1)
})