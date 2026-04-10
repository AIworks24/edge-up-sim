// =============================================================
// MySportsFeeds — TARGETED STATS DIAGNOSTIC
//
// Uses exact feed names from official API docs:
//   Feed: team_stats_totals  (confirmed from PDF docs)
//   Feed: games              (confirmed working from discovery)
//   Feed: game_lines         (odds feed name from docs)
//
// Season formats confirmed:
//   NBA:  2025-2026-regular
//   NFL:  2024-regular  OR  2024-2025-regular (both worked for games)
//
// Run:
//   MSF_API_KEY=your_key MSF_PASSWORD=MYSPORTSFEEDS npx tsx scripts/test-msf-stats.ts
// =============================================================

const API_KEY  = process.env.MSF_API_KEY  || ''
const PASSWORD = process.env.MSF_PASSWORD || 'MYSPORTSFEEDS'
const BASE     = 'https://api.mysportsfeeds.com/v2.1/pull'

if (!API_KEY) {
  console.error('❌  MSF_API_KEY not set')
  process.exit(1)
}

const AUTH = 'Basic ' + Buffer.from(`${API_KEY}:${PASSWORD}`).toString('base64')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function get(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  console.log(`  → GET ${url}`)
  const res  = await fetch(url, {
    headers: { Authorization: AUTH, Accept: 'application/json', 'Accept-Encoding': 'gzip' },
  })
  const text = await res.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { data = { _raw: text.slice(0, 600) } }
  return { ok: res.ok, status: res.status, data }
}

function printShape(obj: any, prefix = '', depth = 0): void {
  if (depth > 5 || obj == null) return
  if (Array.isArray(obj)) {
    console.log(`${prefix}: [Array(${obj.length})]`)
    if (obj.length > 0 && typeof obj[0] === 'object') printShape(obj[0], `${prefix}[0]`, depth + 1)
    return
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      if (v == null)               console.log(`${prefix}.${k}: null`)
      else if (Array.isArray(v))   { console.log(`${prefix}.${k}: [Array(${v.length})]`); if (v.length && typeof v[0] === 'object') printShape(v[0], `${prefix}.${k}[0]`, depth + 1) }
      else if (typeof v === 'object') printShape(v, `${prefix}.${k}`, depth + 1)
      else                         console.log(`${prefix}.${k}: ${v}`)
    }
  }
}

function section(t: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(t)
  console.log('═'.repeat(60))
}

// ─── NBA ─────────────────────────────────────────────────────────────────────
async function testNBA() {
  console.log('\n\n' + '█'.repeat(60))
  console.log('█  NBA')
  console.log('█'.repeat(60))

  // Season formats to try (most likely first)
  const seasons = ['2025-2026-regular', '2024-2025-regular', 'current', 'latest']

  // ── NBA Games (shape confirmation) ────────────────────────────────────────
  section('NBA-1: GAMES — confirm game object shape')
  for (const season of seasons) {
    const r = await get(`${BASE}/nba/${season}/games.json?limit=2`)
    console.log(`  ${season}: ${r.ok ? '✅' : '❌'} ${r.status}`)
    if (r.ok) {
      const games = r.data.games || []
      if (games[0]) {
        console.log('\n  --- Game object shape ---')
        printShape(games[0], '  game')
        console.log('\n  --- RAW JSON (first game) ---')
        console.log(JSON.stringify(games[0], null, 2))
      }
      break
    }
    await sleep(400)
  }

  await sleep(600)

  // ── NBA Team Stats Totals ← CRITICAL ─────────────────────────────────────
  section('NBA-2: TEAM_STATS_TOTALS ← CRITICAL (STATS addon required)')
  for (const season of seasons) {
    const r = await get(`${BASE}/nba/${season}/team_stats_totals.json`)
    console.log(`  ${season}: ${r.ok ? '✅' : '❌'} ${r.status}`)
    if (r.ok) {
      const teams = r.data.teamStatsTotals || r.data.teams || r.data.data || []
      console.log(`\n  Top-level keys: ${Object.keys(r.data).join(', ')}`)
      console.log(`  Teams returned: ${Array.isArray(teams) ? teams.length : 'see raw'}`)
      const t = Array.isArray(teams) ? teams[0] : null
      if (t) {
        console.log('\n  --- Team stats object shape ---')
        printShape(t, '  teamStats')
        console.log('\n  *** RAW JSON — COPY THIS (field names are critical) ***')
        console.log(JSON.stringify(t, null, 2))
      } else {
        console.log('\n  Full response (first 2000 chars):')
        console.log(JSON.stringify(r.data).slice(0, 2000))
      }
      break
    } else {
      console.log(`  Error: ${JSON.stringify(r.data).slice(0, 200)}`)
      if (r.status === 403) console.log('  → STATS addon still not active for this season')
    }
    await sleep(400)
  }

  await sleep(600)

  // ── NBA Team Gamelogs (for rolling last-N stats) ──────────────────────────
  section('NBA-3: DAILY_TEAM_GAMELOGS (for rolling last-5 calculation)')
  {
    // Filter to one team to keep response small
    const r = await get(`${BASE}/nba/2024-2025-regular/team_gamelogs.json?team=bos&limit=5`)
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status}`)
    if (r.ok) {
      const logs = r.data.teamGamelogTotals || r.data.gamelogs || r.data.data || []
      console.log(`  Top-level keys: ${Object.keys(r.data).join(', ')}`)
      console.log(`  Gamelog records: ${Array.isArray(logs) ? logs.length : 'see raw'}`)
      const l = Array.isArray(logs) ? logs[0] : null
      if (l) {
        console.log('\n  --- Gamelog entry shape ---')
        printShape(l, '  log')
        console.log('\n  --- RAW JSON ---')
        console.log(JSON.stringify(l, null, 2))
      } else {
        console.log('  Full response:', JSON.stringify(r.data).slice(0, 1000))
      }
    } else {
      console.log('  Error:', JSON.stringify(r.data).slice(0, 300))
      // Try alternate feed names
      console.log('\n  Trying alternate names...')
      for (const feed of ['daily_team_gamelogs', 'seasonal_team_gamelogs', 'team_gamelogs']) {
        const r2 = await get(`${BASE}/nba/2024-2025-regular/${feed}.json?team=bos&limit=3`)
        console.log(`  ${feed}: ${r2.ok ? '✅' : '❌'} ${r2.status}`)
        if (r2.ok) {
          console.log('  Top-level keys:', Object.keys(r2.data).join(', '))
          break
        }
        await sleep(300)
      }
    }
  }

  await sleep(600)

  // ── NBA Odds ──────────────────────────────────────────────────────────────
  section('NBA-4: GAME_LINES (odds — ODDS addon required)')
  {
    const oddsFeeds = ['game_lines', 'daily_game_lines', 'odds', 'game_odds', 'daily_odds']
    for (const season of ['2025-2026-regular', 'current', 'upcoming']) {
      for (const feed of oddsFeeds) {
        const r = await get(`${BASE}/nba/${season}/${feed}.json?date=today`)
        console.log(`  ${season}/${feed}: ${r.ok ? '✅' : '❌'} ${r.status}`)
        if (r.ok) {
          console.log('  Top-level keys:', Object.keys(r.data).join(', '))
          const odds = r.data.gameLines || r.data.odds || r.data.data || []
          const o = Array.isArray(odds) ? odds[0] : null
          if (o) {
            console.log('\n  --- Odds shape ---')
            printShape(o, '  odds')
            console.log('\n  --- RAW JSON ---')
            console.log(JSON.stringify(o, null, 2))
          }
          break
        }
        await sleep(300)
      }
    }
  }
}

// ─── NFL ─────────────────────────────────────────────────────────────────────
async function testNFL() {
  console.log('\n\n' + '█'.repeat(60))
  console.log('█  NFL')
  console.log('█'.repeat(60))

  const seasons = ['2024-regular', '2024-2025-regular', '2025-regular', 'latest']

  // ── NFL Games (shape confirmation) ────────────────────────────────────────
  section('NFL-1: GAMES — confirm game object shape (already working)')
  {
    const r = await get(`${BASE}/nfl/2024-regular/games.json?limit=2`)
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.status}`)
    if (r.ok) {
      const games = r.data.games || []
      if (games[0]) {
        console.log('\n  --- Game object shape ---')
        printShape(games[0], '  game')
        console.log('\n  --- RAW JSON (first game) ---')
        console.log(JSON.stringify(games[0], null, 2))
      }
    }
  }

  await sleep(600)

  // ── NFL Team Stats Totals ← CRITICAL ─────────────────────────────────────
  section('NFL-2: TEAM_STATS_TOTALS ← CRITICAL (STATS addon required)')
  for (const season of seasons) {
    const r = await get(`${BASE}/nfl/${season}/team_stats_totals.json`)
    console.log(`  ${season}: ${r.ok ? '✅' : '❌'} ${r.status}`)
    if (r.ok) {
      const teams = r.data.teamStatsTotals || r.data.teams || r.data.data || []
      console.log(`\n  Top-level keys: ${Object.keys(r.data).join(', ')}`)
      console.log(`  Teams returned: ${Array.isArray(teams) ? teams.length : 'see raw'}`)
      const t = Array.isArray(teams) ? teams[0] : null
      if (t) {
        console.log('\n  --- Team stats object shape ---')
        printShape(t, '  teamStats')
        console.log('\n  *** RAW JSON — COPY THIS ***')
        console.log(JSON.stringify(t, null, 2))
      } else {
        console.log('\n  Full response (first 2000 chars):')
        console.log(JSON.stringify(r.data).slice(0, 2000))
      }
      break
    } else {
      console.log(`  Error: ${JSON.stringify(r.data).slice(0, 200)}`)
    }
    await sleep(400)
  }

  await sleep(600)

  // ── NFL Team Gamelogs ─────────────────────────────────────────────────────
  section('NFL-3: TEAM_GAMELOGS (for rolling last-5)')
  {
    for (const feed of ['team_gamelogs', 'daily_team_gamelogs', 'weekly_team_gamelogs']) {
      const r = await get(`${BASE}/nfl/2024-regular/${feed}.json?team=KC&limit=5`)
      console.log(`  ${feed}: ${r.ok ? '✅' : '❌'} ${r.status}`)
      if (r.ok) {
        console.log('  Top-level keys:', Object.keys(r.data).join(', '))
        const logs = r.data.teamGamelogTotals || r.data.gamelogs || r.data.data || []
        const l = Array.isArray(logs) ? logs[0] : null
        if (l) {
          console.log('\n  --- Gamelog entry shape ---')
          printShape(l, '  log')
          console.log('\n  --- RAW JSON ---')
          console.log(JSON.stringify(l, null, 2))
        }
        break
      }
      await sleep(300)
    }
  }

  await sleep(600)

  // ── NFL Odds ──────────────────────────────────────────────────────────────
  section('NFL-4: GAME_LINES (odds — ODDS addon required)')
  {
    const oddsFeeds = ['game_lines', 'daily_game_lines', 'odds', 'weekly_game_lines']
    for (const season of ['2025-regular', '2024-regular', 'upcoming', 'latest']) {
      for (const feed of oddsFeeds) {
        const r = await get(`${BASE}/nfl/${season}/${feed}.json`)
        console.log(`  ${season}/${feed}: ${r.ok ? '✅' : '❌'} ${r.status}`)
        if (r.ok) {
          console.log('  Top-level keys:', Object.keys(r.data).join(', '))
          const lines = r.data.gameLines || r.data.odds || r.data.data || []
          const o = Array.isArray(lines) ? lines[0] : null
          if (o) {
            console.log('\n  --- Game lines shape ---')
            printShape(o, '  lines')
            console.log('\n  --- RAW JSON ---')
            console.log(JSON.stringify(o, null, 2))
          } else {
            console.log('  Response (empty season or off-season):', JSON.stringify(r.data).slice(0, 300))
          }
          break
        }
        await sleep(300)
      }
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== MySportsFeeds Targeted Stats Diagnostic ===')
  console.log(`Key: ${API_KEY.slice(0,8)}...`)
  console.log('\nUsing confirmed feed names from official API docs:')
  console.log('  team_stats_totals  (STATS addon)')
  console.log('  team_gamelogs      (STATS addon)')
  console.log('  game_lines         (ODDS addon)')
  console.log('  games              (CORE)\n')

  await testNBA()
  await sleep(1000)
  await testNFL()

  console.log('\n\n' + '='.repeat(60))
  console.log('DIAGNOSTIC COMPLETE')
  console.log('='.repeat(60))
  console.log('\nPaste back to Claude:')
  console.log('  1. NBA-2 raw JSON  (team_stats_totals — CBB engine field verification)')
  console.log('  2. NFL-2 raw JSON  (team_stats_totals — NFL engine fields)')
  console.log('  3. NBA-1 and NFL-1 raw game JSON  (NormalizedGame field mapping)')
  console.log('  4. Any remaining 403 errors (tells us which addons still need activating)')
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })