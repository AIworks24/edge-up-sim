// =============================================================
// MySportsFeeds (MSF) — NFL + NCAAB + NCAAF Diagnostic
//
// Tests every feed the simulation engine needs:
//   1. Schedule / Games   → NormalizedGame interface
//   2. Team Season Stats  → THE CRITICAL SECTION (stats engine input)
//   3. Game Logs          → last-N rolling stats
//   4. Odds               → spread / total / moneyline
//
// Setup in .env.local:
//   MSF_API_KEY=your_api_key_here
//   MSF_PASSWORD=MYSPORTSFEEDS        ← literal string (MSF default password)
//
// Run from repo root:
//   MSF_API_KEY=xxx MSF_PASSWORD=MYSPORTSFEEDS npx tsx scripts/test-mysportsfeeds.ts
//
// Or load .env.local first:
//   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/test-mysportsfeeds.ts
// =============================================================

const API_KEY  = process.env.MSF_API_KEY  || ''
const PASSWORD = process.env.MSF_PASSWORD || 'MYSPORTSFEEDS'
const BASE     = 'https://api.mysportsfeeds.com/v2.1/pull'

if (!API_KEY) {
  console.error('❌  MSF_API_KEY is not set. Run with:')
  console.error('    MSF_API_KEY=your_key MSF_PASSWORD=MYSPORTSFEEDS npx tsx scripts/test-mysportsfeeds.ts')
  process.exit(1)
}

// MSF uses HTTP Basic auth: base64(apikey:password)
const AUTH_HEADER = 'Basic ' + Buffer.from(`${API_KEY}:${PASSWORD}`).toString('base64')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Fetch wrapper ─────────────────────────────────────────────────────────────
async function msfGet(league: string, season: string, feed: string, params: Record<string, string> = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const url = new URL(`${BASE}/${league}/${season}/${feed}.json`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const fullUrl = url.toString()
  console.log(`  → GET ${fullUrl}`)

  try {
    const res = await fetch(fullUrl, {
      headers: {
        'Authorization': AUTH_HEADER,
        'Accept-Encoding': 'gzip',
        'Accept': 'application/json',
      },
    })
    const text = await res.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 500) } }
    return { ok: res.ok, status: res.status, data }
  } catch (err: any) {
    return { ok: false, status: 0, data: { error: err.message } }
  }
}

// ── Shape printer ─────────────────────────────────────────────────────────────
function printShape(obj: any, prefix = '', depth = 0): void {
  if (depth > 5 || obj === null || obj === undefined) return
  if (Array.isArray(obj)) {
    console.log(`${prefix}: [Array(${obj.length})]`)
    if (obj.length > 0 && typeof obj[0] === 'object') printShape(obj[0], `${prefix}[0]`, depth + 1)
    return
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val === null)               { console.log(`${prefix}.${key}: null`) }
      else if (Array.isArray(val))    { console.log(`${prefix}.${key}: [Array(${val.length})]`); if (val.length && typeof val[0] === 'object') printShape(val[0], `${prefix}.${key}[0]`, depth + 1) }
      else if (typeof val === 'object') printShape(val, `${prefix}.${key}`, depth + 1)
      else                            { console.log(`${prefix}.${key}: ${val}`) }
    }
  }
}

function section(title: string) {
  console.log(`\n${'═'.repeat(56)}`)
  console.log(title)
  console.log('═'.repeat(56))
}

function result(ok: boolean, status: number) {
  return ok ? `✅ ${status}` : `❌ ${status}`
}

// =============================================================================
// NFL DIAGNOSTIC
// Season format: {year}-regular   e.g. 2024-regular
// League slug:   nfl
// =============================================================================
async function testNFL() {
  console.log('\n\n' + '█'.repeat(56))
  console.log('█  NFL DIAGNOSTIC')
  console.log('█'.repeat(56))

  const league = 'nfl'
  // Use 2024-regular — completed season guarantees data
  // Also try 'current' — MSF alias for the active/most recent season
  const seasons = ['2024-regular', 'current']

  // ── SECTION NFL-1: Seasonal Games (schedule) ────────────────────────────
  section('NFL-1: SEASONAL GAMES (schedule + scores)')
  for (const season of seasons) {
    const r = await msfGet(league, season, 'seasonal_games')
    console.log(`  ${season}: ${result(r.ok, r.status)}`)
    if (r.ok) {
      const games = r.data.games || r.data.data || []
      console.log(`  Total games: ${Array.isArray(games) ? games.length : 'unknown'}`)
      const g = Array.isArray(games) ? games[0] : null
      if (g) {
        console.log('\n  --- Game object shape (first game) ---')
        printShape(g, '  game')
        console.log('\n  --- RAW JSON (first game) ---')
        console.log(JSON.stringify(g, null, 2))
      } else {
        console.log('  Top-level keys:', Object.keys(r.data).join(', '))
        console.log('  RAW (truncated):', JSON.stringify(r.data).slice(0, 800))
      }
      break  // Got data, stop trying seasons
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 300))
    }
    await sleep(600)
  }

  await sleep(600)

  // ── SECTION NFL-2: Weekly Games (week-based schedule) ───────────────────
  section('NFL-2: WEEKLY GAMES (week 1, 2024)')
  {
    const r = await msfGet(league, '2024-regular', 'weekly_games', { week: '1' })
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const games = r.data.games || r.data.data || []
      console.log(`  Week 1 games: ${Array.isArray(games) ? games.length : 'see raw'}`)
      const g = Array.isArray(games) ? games[0] : null
      if (g) {
        console.log('\n  --- Weekly game shape ---')
        printShape(g, '  game')
        console.log('\n  --- RAW JSON ---')
        console.log(JSON.stringify(g, null, 2))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 300))
    }
  }

  await sleep(600)

  // ── SECTION NFL-3: TEAM SEASON STATS ← THE CRITICAL SECTION ────────────
  section('NFL-3: SEASONAL TEAM STATS ← CRITICAL')
  console.log('  Need: points/game, yards/play, plays/game, turnovers, red zone, 3rd down')
  {
    // Try both with and without team filter to see structure
    const r = await msfGet(league, '2024-regular', 'seasonal_team_stats')
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const teams = r.data.teamStatsTotals || r.data.data || r.data.teams || []
      console.log(`  Teams returned: ${Array.isArray(teams) ? teams.length : 'see raw'}`)
      console.log('  Top-level keys:', Object.keys(r.data).join(', '))

      const t = Array.isArray(teams) ? teams[0] : null
      if (t) {
        console.log('\n  --- Team stats object shape ---')
        printShape(t, '  teamStats')
        console.log('\n  *** RAW JSON (COPY THIS — critical field names) ***')
        console.log(JSON.stringify(t, null, 2))
      } else {
        console.log('  No team array found. Full response (truncated):')
        console.log(JSON.stringify(r.data).slice(0, 1200))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 400))
      console.log('  → If 403: STATS addon not included in your trial/plan')
      console.log('  → Contact MSF support to confirm STATS addon is active')
    }
  }

  await sleep(600)

  // ── SECTION NFL-4: Single Team Stats (KC Chiefs = confirm filter works) ──
  section('NFL-4: SEASONAL TEAM STATS — single team filter (KC Chiefs)')
  {
    const r = await msfGet(league, '2024-regular', 'seasonal_team_stats', { team: 'KC' })
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const teams = r.data.teamStatsTotals || r.data.data || []
      const t = Array.isArray(teams) ? teams[0] : teams
      if (t) {
        console.log('\n  --- KC Chiefs stats (full JSON) ---')
        console.log(JSON.stringify(t, null, 2))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 300))
    }
  }

  await sleep(600)

  // ── SECTION NFL-5: Game Logs (last-N rolling stats) ─────────────────────
  section('NFL-5: SEASONAL PLAYER GAMELOGS (team filter, for rolling last-5)')
  {
    const r = await msfGet(league, '2024-regular', 'seasonal_player_gamelogs', { team: 'KC' })
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const logs = r.data.gamelogs || r.data.data || []
      console.log(`  Gamelog records: ${Array.isArray(logs) ? logs.length : 'see raw'}`)
      const l = Array.isArray(logs) ? logs[0] : null
      if (l) {
        console.log('\n  --- Gamelog entry shape ---')
        printShape(l, '  log')
        console.log('\n  --- RAW JSON ---')
        console.log(JSON.stringify(l, null, 2))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 300))
    }
  }

  await sleep(600)

  // ── SECTION NFL-6: Odds ──────────────────────────────────────────────────
  section('NFL-6: GAME ODDS (spread / total / moneyline)')
  {
    // Try current season odds
    for (const season of ['current', '2024-regular', '2025-regular']) {
      const r = await msfGet(league, season, 'odds')
      console.log(`  ${season}: ${result(r.ok, r.status)}`)
      if (r.ok) {
        const odds = r.data.gameodds || r.data.odds || r.data.data || []
        console.log(`  Odds records: ${Array.isArray(odds) ? odds.length : 'see raw'}`)
        const o = Array.isArray(odds) ? odds[0] : null
        if (o) {
          console.log('\n  --- Odds object shape ---')
          printShape(o, '  odds')
          console.log('\n  --- RAW JSON ---')
          console.log(JSON.stringify(o, null, 2))
        } else {
          console.log('  Top-level keys:', Object.keys(r.data).join(', '))
        }
        break
      } else {
        console.log('  Error:', JSON.stringify(r.data).slice(0, 200))
      }
      await sleep(600)
    }
  }
}

// =============================================================================
// NCAAB DIAGNOSTIC
// Season format: {year}-{year+1}-regular  e.g. 2024-2025-regular
// League slug:   ncaa-bb  (try ncaab and ncaamb as fallbacks)
// =============================================================================
async function testNCAAB() {
  console.log('\n\n' + '█'.repeat(56))
  console.log('█  NCAAB (College Basketball) DIAGNOSTIC')
  console.log('█'.repeat(56))

  // MSF uses different slugs — try all plausible ones
  const leagueSlugs = ['ncaa-bb', 'ncaab', 'ncaamb']
  const seasons     = ['2024-2025-regular', '2024-regular', 'current']

  let workingLeague = ''
  let workingSeason = ''

  // ── SECTION NCAAB-1: Find the correct league slug ───────────────────────
  section('NCAAB-1: FIND CORRECT LEAGUE SLUG + SEASON FORMAT')
  for (const league of leagueSlugs) {
    for (const season of seasons) {
      const r = await msfGet(league, season, 'seasonal_games')
      console.log(`  ${league}/${season}/seasonal_games → ${result(r.ok, r.status)}`)
      if (r.ok) {
        workingLeague = league
        workingSeason = season
        console.log(`\n  ✅ Confirmed: league="${league}" season="${season}"`)
        break
      }
      await sleep(400)
    }
    if (workingLeague) break
  }

  if (!workingLeague) {
    console.log('\n  ❌ Could not find working NCAAB league/season combination')
    console.log('  Possible causes:')
    console.log('    - NCAAB not included in your MSF plan')
    console.log('    - Season format is different — check MSF account for correct slug')
    return
  }

  await sleep(600)

  // ── SECTION NCAAB-2: Seasonal Games shape ───────────────────────────────
  section('NCAAB-2: SEASONAL GAMES — game object fields')
  {
    const r = await msfGet(workingLeague, workingSeason, 'seasonal_games')
    if (r.ok) {
      const games = r.data.games || r.data.data || []
      console.log(`  Games returned: ${Array.isArray(games) ? games.length : 'see raw'}`)
      const g = Array.isArray(games) ? games[0] : null
      if (g) {
        console.log('\n  --- Game object shape ---')
        printShape(g, '  game')
        console.log('\n  --- RAW JSON ---')
        console.log(JSON.stringify(g, null, 2))
      }
    }
  }

  await sleep(600)

  // ── SECTION NCAAB-3: TEAM SEASON STATS ← THE CRITICAL SECTION ──────────
  section('NCAAB-3: SEASONAL TEAM STATS ← CRITICAL')
  console.log('  Need: ppg, opp_ppg, fga, 3pa, fta, orb, drb, tov (maps to existing CBB engine)')
  {
    const r = await msfGet(workingLeague, workingSeason, 'seasonal_team_stats')
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const teams = r.data.teamStatsTotals || r.data.data || []
      console.log(`  Teams: ${Array.isArray(teams) ? teams.length : 'see raw'}`)
      console.log('  Top-level keys:', Object.keys(r.data).join(', '))
      const t = Array.isArray(teams) ? teams[0] : null
      if (t) {
        console.log('\n  --- Team stats shape ---')
        printShape(t, '  teamStats')
        console.log('\n  *** RAW JSON — COPY THIS ***')
        console.log(JSON.stringify(t, null, 2))
      } else {
        console.log('  Full response:', JSON.stringify(r.data).slice(0, 1200))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 400))
    }
  }

  await sleep(600)

  // ── SECTION NCAAB-4: Single Team Stats ──────────────────────────────────
  section('NCAAB-4: SEASONAL TEAM STATS — single team filter')
  {
    // Try Duke as a well-known team — MSF team filters can be abbreviation or full name
    for (const teamFilter of ['duke', 'DUKE', 'Duke Blue Devils']) {
      const r = await msfGet(workingLeague, workingSeason, 'seasonal_team_stats', { team: teamFilter })
      console.log(`  team="${teamFilter}": ${result(r.ok, r.status)}`)
      if (r.ok) {
        const teams = r.data.teamStatsTotals || r.data.data || []
        const t = Array.isArray(teams) ? teams[0] : teams
        if (t) {
          console.log('\n  --- Single team stats ---')
          console.log(JSON.stringify(t, null, 2))
        }
        break
      }
      await sleep(400)
    }
  }

  await sleep(600)

  // ── SECTION NCAAB-5: Odds ────────────────────────────────────────────────
  section('NCAAB-5: ODDS')
  {
    const r = await msfGet(workingLeague, workingSeason, 'odds')
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const odds = r.data.gameodds || r.data.data || []
      console.log(`  Records: ${Array.isArray(odds) ? odds.length : 'see raw'}`)
      const o = Array.isArray(odds) ? odds[0] : null
      if (o) {
        console.log('\n  --- Odds shape ---')
        printShape(o, '  odds')
        console.log('\n  --- RAW JSON ---')
        console.log(JSON.stringify(o, null, 2))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 300))
    }
  }
}

// =============================================================================
// NCAAF DIAGNOSTIC
// Season format: {year}-regular  e.g. 2024-regular
// League slug:   ncaa-fb  (try ncaaf as fallback)
// =============================================================================
async function testNCAAF() {
  console.log('\n\n' + '█'.repeat(56))
  console.log('█  NCAAF (College Football) DIAGNOSTIC')
  console.log('█'.repeat(56))

  const leagueSlugs = ['ncaa-fb', 'ncaaf', 'ncaafb']
  const seasons     = ['2024-regular', 'current', '2024-2025-regular']

  let workingLeague = ''
  let workingSeason = ''

  // ── SECTION NCAAF-1: Find correct slug ──────────────────────────────────
  section('NCAAF-1: FIND CORRECT LEAGUE SLUG + SEASON FORMAT')
  for (const league of leagueSlugs) {
    for (const season of seasons) {
      const r = await msfGet(league, season, 'seasonal_games')
      console.log(`  ${league}/${season}/seasonal_games → ${result(r.ok, r.status)}`)
      if (r.ok) {
        workingLeague = league
        workingSeason = season
        console.log(`\n  ✅ Confirmed: league="${league}" season="${season}"`)
        break
      }
      await sleep(400)
    }
    if (workingLeague) break
  }

  if (!workingLeague) {
    console.log('\n  ❌ Could not find working NCAAF league/season combination')
    console.log('  Possible causes:')
    console.log('    - NCAAF not included in your MSF plan')
    console.log('    - Season is offseason — try a historical season like 2024-regular')
    console.log('    - Check your MSF account dashboard for correct league slug')
    return
  }

  await sleep(600)

  // ── SECTION NCAAF-2: Seasonal Games ─────────────────────────────────────
  section('NCAAF-2: SEASONAL GAMES — game object fields')
  {
    const r = await msfGet(workingLeague, workingSeason, 'seasonal_games')
    if (r.ok) {
      const games = r.data.games || r.data.data || []
      console.log(`  Games returned: ${Array.isArray(games) ? games.length : 'see raw'}`)
      const g = Array.isArray(games) ? games[0] : null
      if (g) {
        console.log('\n  --- Game shape ---')
        printShape(g, '  game')
        console.log('\n  --- RAW JSON ---')
        console.log(JSON.stringify(g, null, 2))
      }
    }
  }

  await sleep(600)

  // ── SECTION NCAAF-3: TEAM SEASON STATS ← CRITICAL ───────────────────────
  section('NCAAF-3: SEASONAL TEAM STATS ← CRITICAL')
  console.log('  Need: same fields as NFL — points, yards, plays, turnovers, red zone, 3rd down')
  {
    const r = await msfGet(workingLeague, workingSeason, 'seasonal_team_stats')
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const teams = r.data.teamStatsTotals || r.data.data || []
      console.log(`  Teams: ${Array.isArray(teams) ? teams.length : 'see raw'}`)
      console.log('  Top-level keys:', Object.keys(r.data).join(', '))
      const t = Array.isArray(teams) ? teams[0] : null
      if (t) {
        console.log('\n  --- Team stats shape ---')
        printShape(t, '  teamStats')
        console.log('\n  *** RAW JSON — COPY THIS ***')
        console.log(JSON.stringify(t, null, 2))
      } else {
        console.log('  Full response:', JSON.stringify(r.data).slice(0, 1200))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 400))
    }
  }

  await sleep(600)

  // ── SECTION NCAAF-4: Weekly Games (football uses weekly, not daily) ──────
  section('NCAAF-4: WEEKLY GAMES — week 1')
  {
    const r = await msfGet(workingLeague, workingSeason, 'weekly_games', { week: '1' })
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const games = r.data.games || r.data.data || []
      console.log(`  Week 1 games: ${Array.isArray(games) ? games.length : 'see raw'}`)
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 200))
    }
  }

  await sleep(600)

  // ── SECTION NCAAF-5: Odds ────────────────────────────────────────────────
  section('NCAAF-5: ODDS')
  {
    const r = await msfGet(workingLeague, workingSeason, 'odds')
    console.log(`  ${result(r.ok, r.status)}`)
    if (r.ok) {
      const odds = r.data.gameodds || r.data.data || []
      console.log(`  Records: ${Array.isArray(odds) ? odds.length : 'see raw'}`)
      const o = Array.isArray(odds) ? odds[0] : null
      if (o) {
        console.log('\n  --- Odds shape ---')
        printShape(o, '  odds')
        console.log('\n  --- RAW JSON ---')
        console.log(JSON.stringify(o, null, 2))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 300))
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  console.log('=== MySportsFeeds Diagnostic: NFL + NCAAB + NCAAF ===')
  console.log(`API key: ${API_KEY.slice(0, 8)}...  Password: ${PASSWORD.slice(0, 4)}...`)
  console.log(`Auth header (first 30 chars): ${AUTH_HEADER.slice(0, 30)}...`)
  console.log('')
  console.log('Running all three leagues. This takes ~60 seconds.')
  console.log('Paste back Sections NFL-3, NCAAB-3, NCAAF-3 (team season stats) to Claude.')
  console.log('Also paste NFL-1/NCAAB-2/NCAAF-2 (game shapes) and the odds sections.')

  await testNFL()
  await sleep(1000)
  await testNCAAB()
  await sleep(1000)
  await testNCAAF()

  console.log('\n\n' + '='.repeat(56))
  console.log('DIAGNOSTIC COMPLETE')
  console.log('='.repeat(56))
  console.log('\nWhat to paste back to Claude:')
  console.log('  1. NFL-3  → team season stats JSON  (NFL sim engine inputs)')
  console.log('  2. NCAAB-3 → team season stats JSON (CBB sim engine — verify vs Sportradar fields)')
  console.log('  3. NCAAF-3 → team season stats JSON (NCAAF sim engine inputs)')
  console.log('  4. Any 401/403 errors with their section names')
  console.log('  5. The confirmed league slugs from NCAAB-1 and NCAAF-1')
}

main().catch(err => {
  console.error('\nFatal error:', err.message)
  process.exit(1)
})