// scripts/test-msf-odds-v2.ts
// Fixes from v1:
//   1. Uses 2025-2026-regular (current season) for NBA
//   2. Skips 200 responses with empty gameLines (keeps trying seasons)
//   3. Gamelogs: calls single-date path, iterates last 7 days to find games
//
// Run:
//   MSF_API_KEY=your_key MSF_PASSWORD=MYSPORTSFEEDS npx tsx scripts/test-msf-odds-v2.ts

const API_KEY  = process.env.MSF_API_KEY  || ''
const PASSWORD = process.env.MSF_PASSWORD || 'MYSPORTSFEEDS'
const BASE     = 'https://api.mysportsfeeds.com/v2.1/pull'
const AUTH     = 'Basic ' + Buffer.from(`${API_KEY}:${PASSWORD}`).toString('base64')

if (!API_KEY) { console.error('Set MSF_API_KEY'); process.exit(1) }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function get(url: string) {
  console.log(`  → ${url}`)
  const res  = await fetch(url, { headers: { Authorization: AUTH, Accept: 'application/json' } })
  const text = await res.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 200) } }
  return { status: res.status, ok: res.ok, data }
}

function toMSFDate(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
}

function printShape(obj: any, prefix = '', depth = 0): void {
  if (depth > 4 || obj == null) return
  if (Array.isArray(obj)) { console.log(`${prefix}: [Array(${obj.length})]`); if (obj[0] && typeof obj[0]==='object') printShape(obj[0],`${prefix}[0]`,depth+1); return }
  if (typeof obj==='object') { for (const k of Object.keys(obj)) { const v=obj[k]; if (v==null) console.log(`${prefix}.${k}: null`); else if (Array.isArray(v)) { console.log(`${prefix}.${k}: [Array(${v.length})]`); if (v[0]&&typeof v[0]==='object') printShape(v[0],`${prefix}.${k}[0]`,depth+1) } else if (typeof v==='object') printShape(v,`${prefix}.${k}`,depth+1); else console.log(`${prefix}.${k}: ${v}`) } }
}

async function run() {
  const today = new Date()
  const todayStr = toMSFDate(today)
  console.log(`=== MSF Odds + Gamelogs v2 ===`)
  console.log(`Today: ${todayStr}\n`)

  // ── NBA Odds: try seasons in most-likely-current order ───────────────────
  console.log('━━━ NBA ODDS (odds_gamelines) ━━━')
  const nbaSeasons = ['2025-2026-regular', '2025-2026-playoff', '2024-2025-playoff', 'current', 'latest']

  for (const season of nbaSeasons) {
    const url = `${BASE}/nba/${season}/date/${todayStr}/odds_gamelines.json`
    const r   = await get(url)
    const lines = r.data?.gameLines || []
    console.log(`  ${season}: ${r.ok ? '✅' : '❌'} ${r.status}  gameLines=${lines.length}`)

    if (r.ok && lines.length > 0) {
      console.log(`\n  ✅ Found ${lines.length} game lines for ${season}`)
      console.log('  Top-level keys:', Object.keys(r.data).join(', '))
      console.log('\n  --- First game line shape ---')
      printShape(lines[0], '  entry')
      console.log('\n  *** RAW JSON (first game line — CRITICAL for odds.ts mapping) ***')
      console.log(JSON.stringify(lines[0], null, 2))
      break
    }

    if (r.ok && lines.length === 0) {
      console.log(`  (Season found but no games today — checking tomorrow...)`)
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
      const r2 = await get(`${BASE}/nba/${season}/date/${toMSFDate(tomorrow)}/odds_gamelines.json`)
      const lines2 = r2.data?.gameLines || []
      console.log(`  Tomorrow ${toMSFDate(tomorrow)}: ${r2.ok ? '✅' : '❌'} ${r2.status}  gameLines=${lines2.length}`)
      if (r2.ok && lines2.length > 0) {
        console.log('\n  *** RAW JSON (first game line from tomorrow) ***')
        console.log(JSON.stringify(lines2[0], null, 2))
        break
      }
    }

    if (!r.ok && r.status !== 400) break  // 403 = wrong addon, stop trying
    await sleep(400)
  }

  await sleep(600)

  // ── NBA Gamelogs: iterate recent dates to find actual game days ──────────
  console.log('\n━━━ NBA TEAM GAMELOGS (single-date path) ━━━')
  console.log('Scanning last 7 days for BOS games...\n')

  let foundGamelog = false
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const dateStr = toMSFDate(d)
    // Correct URL: single YYYYMMDD in path, team as query param
    const url = `${BASE}/nba/2024-2025-regular/date/${dateStr}/team_gamelogs.json?team=bos`
    const r   = await get(url)
    const logs = r.data?.teamGamelogTotals || r.data?.gamelogs || []
    console.log(`  ${dateStr}: ${r.ok ? '✅' : '❌'} ${r.status}  logs=${logs.length}`)

    if (r.ok && logs.length > 0) {
      foundGamelog = true
      console.log('\n  --- Gamelog shape ---')
      printShape(logs[0], '  log')
      console.log('\n  *** RAW JSON (gamelog entry — for stats.ts rolling calc) ***')
      console.log(JSON.stringify(logs[0], null, 2))
      break
    }
    await sleep(300)
  }

  // Also try current season gamelogs
  if (!foundGamelog) {
    console.log('\n  Trying 2025-2026 season...')
    for (let i = 0; i < 5; i++) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const dateStr = toMSFDate(d)
      const url = `${BASE}/nba/2025-2026-regular/date/${dateStr}/team_gamelogs.json?team=bos`
      const r   = await get(url)
      const logs = r.data?.teamGamelogTotals || r.data?.gamelogs || []
      console.log(`  2025-2026/date/${dateStr}: ${r.ok ? '✅' : '❌'} ${r.status}  logs=${logs.length}`)
      if (r.ok && logs.length > 0) {
        console.log('\n  *** RAW JSON (gamelog entry) ***')
        console.log(JSON.stringify(logs[0], null, 2))
        break
      }
      await sleep(300)
    }
  }

  await sleep(600)

  // ── Also verify NFL odds endpoint resolves (off-season = empty OK) ───────
  console.log('\n━━━ NFL ODDS (confirm endpoint structure) ━━━')
  const nflSeasons = ['2025-regular', '2025-2026-regular', 'upcoming', 'latest']
  for (const season of nflSeasons) {
    const url = `${BASE}/nfl/${season}/date/${todayStr}/odds_gamelines.json`
    const r   = await get(url)
    const lines = r.data?.gameLines || []
    console.log(`  ${season}: ${r.ok ? '✅' : '❌'} ${r.status}  gameLines=${lines.length}`)
    if (r.ok) { console.log('  Keys:', Object.keys(r.data).join(', ')); break }
    await sleep(300)
  }

  console.log('\n=== COMPLETE ===')
  console.log('Paste back:')
  console.log('  1. The ✅ NBA season that had gameLines > 0')
  console.log('  2. RAW JSON of first game line entry (odds field names)')
  console.log('  3. RAW JSON of first gamelog entry (stats field names per game)')
}

run().catch(console.error)