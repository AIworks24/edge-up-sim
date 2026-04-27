#!/usr/bin/env node
// scripts/msf-field-audit.js
//
// Run from repo root in Codespaces (where env vars are set):
//   node scripts/msf-field-audit.js
//
// Dumps every MSF endpoint relevant to football (NFL + NCAAF) to:
//   scripts/msf-audit-output/
//
// Output files:
//   nfl_team_stats_totals_FULL.json   — full first-team structure (all stat fields)
//   nfl_team_stats_totals_ALL.json    — all 32 teams (team + stats shape)
//   nfl_player_stats_totals.json      — player-level stat fields (first player)
//   nfl_games_sample.json             — schedule shape (first few games)
//   nfl_standings.json                — standings shape
//   nfl_field_map.txt                 — flat dot-notation list of every field path
//   ncaaf_team_stats_totals_FULL.json — same for NCAAF (if subscription active)

const https  = require('https')
const fs     = require('fs')
const path   = require('path')

// ── Load .env.local (Next.js convention — not auto-loaded by plain node) ─────
function loadEnvLocal() {
  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '.env.local'),
  ]
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let   val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
    console.log('  Loaded env from: ' + envPath)
    return true
  }
  console.warn('  Warning: .env.local not found — falling back to shell env vars')
  return false
}
loadEnvLocal()

const API_KEY  = process.env.MSF_API_KEY
const PASSWORD = process.env.MSF_PASSWORD || 'MYSPORTSFEEDS'
const BASE     = 'api.mysportsfeeds.com'
const OUT_DIR  = path.join(__dirname, 'msf-audit-output')

if (!API_KEY) {
  console.error('\n❌  MSF_API_KEY not set. Run from Codespaces or set it first:\n')
  console.error('   export MSF_API_KEY=your_key_here')
  console.error('   node scripts/msf-field-audit.js\n')
  process.exit(1)
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const AUTH = 'Basic ' + Buffer.from(`${API_KEY}:${PASSWORD}`).toString('base64')

// ── HTTP helper ───────────────────────────────────────────────────────────────
function msfGet(league, season, feed, params = {}) {
  const query = Object.entries(params).map(([k,v]) => `${k}=${v}`).join('&')
  const p     = `/v2.1/pull/${league}/${season}/${feed}.json${query ? '?' + query : ''}`
  return new Promise((resolve, reject) => {
    const opts = { hostname: BASE, path: p, method: 'GET',
      headers: { Authorization: AUTH, Accept: 'application/json' } }
    const req = https.request(opts, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }) }
        catch(e) { resolve({ status: res.statusCode, data: { raw: body.slice(0,500) } }) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// ── Flatten object to dot-notation paths ─────────────────────────────────────
function flattenKeys(obj, prefix = '', result = new Set()) {
  if (obj === null || obj === undefined) return result
  if (typeof obj !== 'object') { result.add(prefix); return result }
  if (Array.isArray(obj)) {
    if (obj.length > 0) flattenKeys(obj[0], `${prefix}[0]`, result)
    return result
  }
  for (const [k, v] of Object.entries(obj)) {
    flattenKeys(v, prefix ? `${prefix}.${k}` : k, result)
  }
  return result
}

// ── Write helper ─────────────────────────────────────────────────────────────
function write(filename, content) {
  const fp = path.join(OUT_DIR, filename)
  fs.writeFileSync(fp, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  console.log(`  ✓ ${filename}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🏈  MSF Field Audit — NFL + NCAAF\n')
  console.log(`Output directory: ${OUT_DIR}\n`)

  const sleep = ms => new Promise(r => setTimeout(r, 600))  // respect rate limits

  // ── 1. NFL team_stats_totals ──────────────────────────────────────────────
  console.log('Fetching NFL team_stats_totals (2025-regular)...')
  const nflTeamStats = await msfGet('nfl', '2025-regular', 'team_stats_totals')
  await sleep()

  if (nflTeamStats.status === 200) {
    const teams = nflTeamStats.data.teamStatsTotals || []
    console.log(`  Found ${teams.length} teams`)

    if (teams.length > 0) {
      // Full structure of first team
      write('nfl_team_stats_totals_FULL.json', teams[0])

      // All teams (team identity + stats summary)
      const summary = teams.map(t => ({
        id:           t.team?.id,
        abbreviation: t.team?.abbreviation,
        name:         t.team?.name,
        city:         t.team?.city,
        stats_keys:   Object.keys(t.stats || {}),
      }))
      write('nfl_team_stats_totals_ALL.json', { teams: summary })

      // Flat field map
      const keys = flattenKeys(teams[0])
      const sorted = Array.from(keys).sort()
      write('nfl_field_map.txt',
        '# NFL team_stats_totals — every available field path\n' +
        '# Generated: ' + new Date().toISOString() + '\n\n' +
        sorted.join('\n')
      )

      // Print all top-level stats categories
      console.log('\n  Stats categories in NFL team_stats_totals:')
      Object.keys(teams[0].stats || {}).forEach(k => {
        const val = teams[0].stats[k]
        const fields = typeof val === 'object' && val !== null
          ? Object.keys(val).join(', ')
          : String(val)
        console.log(`    stats.${k}: { ${fields} }`)
      })
    }
  } else {
    console.log(`  ⚠  Status ${nflTeamStats.status}`)
    write('nfl_team_stats_totals_ERROR.json', nflTeamStats.data)
  }

  // ── 2. NFL player_stats_totals (first player) ─────────────────────────────
  console.log('\nFetching NFL player_stats_totals (first player)...')
  const nflPlayerStats = await msfGet('nfl', '2025-regular', 'player_stats_totals', { limit: 1 })
  await sleep()

  if (nflPlayerStats.status === 200) {
    const players = nflPlayerStats.data.playerStatsTotals || []
    if (players.length > 0) {
      write('nfl_player_stats_totals.json', players[0])
      const keys = flattenKeys(players[0])
      write('nfl_player_field_map.txt',
        '# NFL player_stats_totals — every available field path\n\n' +
        Array.from(keys).sort().join('\n')
      )
      console.log(`  ✓ Player fields: ${keys.size} paths`)
      console.log('  Player stats categories:')
      Object.keys(players[0].stats || {}).forEach(k => {
        const val = players[0].stats[k]
        const fields = typeof val === 'object' && val !== null
          ? Object.keys(val).join(', ')
          : String(val)
        console.log(`    stats.${k}: { ${fields} }`)
      })
    }
  } else {
    console.log(`  ⚠  Status ${nflPlayerStats.status}`)
    write('nfl_player_stats_ERROR.json', nflPlayerStats.data)
  }

  // ── 3. NFL standings ──────────────────────────────────────────────────────
  console.log('\nFetching NFL standings...')
  const nflStandings = await msfGet('nfl', '2025-regular', 'standings')
  await sleep()
  if (nflStandings.status === 200) {
    write('nfl_standings.json', nflStandings.data)
    const teams = nflStandings.data.teams || []
    if (teams.length > 0) {
      const keys = flattenKeys(teams[0])
      write('nfl_standings_field_map.txt',
        '# NFL standings — every available field path\n\n' +
        Array.from(keys).sort().join('\n')
      )
    }
    console.log(`  ✓ ${teams.length} teams in standings`)
  } else {
    console.log(`  ⚠  Standings status ${nflStandings.status}`)
    write('nfl_standings_ERROR.json', nflStandings.data)
  }

  // ── 4. NFL games sample ───────────────────────────────────────────────────
  console.log('\nFetching NFL 2025 season games (first 5)...')
  const nflGames = await msfGet('nfl', '2025-regular', 'games')
  await sleep()
  if (nflGames.status === 200) {
    const games = nflGames.data.games || []
    write('nfl_games_sample.json', { first5: games.slice(0, 5), total: games.length })
    if (games.length > 0) {
      const keys = flattenKeys(games[0])
      write('nfl_games_field_map.txt',
        '# NFL games — every available field path\n\n' +
        Array.from(keys).sort().join('\n')
      )
    }
    console.log(`  ✓ ${games.length} total games in season`)
  } else {
    console.log(`  ⚠  Games status ${nflGames.status}`)
    write('nfl_games_ERROR.json', nflGames.data)
  }

  // ── 5. NFL team gamelogs (one team, last 5 games) ─────────────────────────
  // Use KC Chiefs as sample — need to get their ID from team_stats_totals first
  console.log('\nFetching NFL team gamelogs (sample team, last game)...')
  const nflGL = await msfGet('nfl', '2025-regular', 'team_gamelogs', {
    team: 'KC', limit: 3
  })
  await sleep()
  if (nflGL.status === 200) {
    const logs = nflGL.data.teamGamelogs || []
    write('nfl_team_gamelogs_sample.json', { first3: logs.slice(0, 3) })
    if (logs.length > 0) {
      const keys = flattenKeys(logs[0])
      write('nfl_gamelog_field_map.txt',
        '# NFL team_gamelogs — every available field path\n\n' +
        Array.from(keys).sort().join('\n')
      )
      console.log('  Gamelog stats categories:')
      Object.keys(logs[0].stats || {}).forEach(k => {
        const val = logs[0].stats[k]
        const fields = typeof val === 'object' && val !== null
          ? Object.keys(val).join(', ')
          : String(val)
        console.log(`    stats.${k}: { ${fields} }`)
      })
    }
    console.log(`  ✓ ${logs.length} gamelog entries`)
  } else {
    console.log(`  ⚠  Gamelogs status ${nflGL.status}`)
    write('nfl_gamelogs_ERROR.json', nflGL.data)
  }

  // ── 6. NCAAF team_stats_totals (if subscription active) ──────────────────
  console.log('\nFetching NCAAF team_stats_totals (2025-regular)...')
  const ncaafStats = await msfGet('ncaa-fb', '2025-regular', 'team_stats_totals')
  await sleep()
  if (ncaafStats.status === 200) {
    const teams = ncaafStats.data.teamStatsTotals || []
    console.log(`  Found ${teams.length} NCAAF teams`)
    if (teams.length > 0) {
      write('ncaaf_team_stats_totals_FULL.json', teams[0])
      const keys = flattenKeys(teams[0])
      write('ncaaf_field_map.txt',
        '# NCAAF team_stats_totals — every available field path\n\n' +
        Array.from(keys).sort().join('\n')
      )
      console.log('  NCAAF stats categories:')
      Object.keys(teams[0].stats || {}).forEach(k => {
        const val = teams[0].stats[k]
        const fields = typeof val === 'object' && val !== null
          ? Object.keys(val).join(', ')
          : String(val)
        console.log(`    stats.${k}: { ${fields} }`)
      })
    }
  } else {
    console.log(`  ⚠  NCAAF status ${ncaafStats.status} — subscription may not be active`)
    write('ncaaf_team_stats_ERROR.json', ncaafStats.data)
  }

  // ── 7. Print summary ──────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('AUDIT COMPLETE')
  console.log('═'.repeat(60))
  console.log(`\nAll files written to: ${OUT_DIR}`)
  console.log('\nKey files to review:')
  console.log('  nfl_field_map.txt          — every dot-notation field path')
  console.log('  nfl_team_stats_totals_FULL.json  — full first-team JSON')
  console.log('  nfl_gamelog_field_map.txt  — per-game fields (for rolling stats)')
  console.log('  ncaaf_field_map.txt        — NCAAF fields (if active)\n')
}

main().catch(e => {
  console.error('\n❌  Error:', e.message)
  process.exit(1)
})