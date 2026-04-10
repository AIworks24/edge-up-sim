// =============================================================
// MySportsFeeds v2.1 — URL DISCOVERY SCRIPT
//
// Auth is confirmed working (403 → 404 means credentials OK).
// Problem: feed names and URL structure are wrong.
// This script tries every plausible combination and reports
// exactly which URLs return 200.
//
// Run:
//   MSF_API_KEY=your_key MSF_PASSWORD=MYSPORTSFEEDS npx tsx scripts/test-msf-discovery.ts
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

async function probe(url: string): Promise<{ status: number; preview: string }> {
  try {
    const res  = await fetch(url, { headers: { Authorization: AUTH, Accept: 'application/json' } })
    const text = await res.text()
    // Show first 120 chars of successful responses to identify structure
    const preview = res.ok ? text.slice(0, 120).replace(/\s+/g, ' ') : ''
    return { status: res.status, preview }
  } catch (err: any) {
    return { status: 0, preview: err.message }
  }
}

function log(status: number, url: string, preview: string) {
  const icon = status === 200 ? '✅' : status === 204 ? '📭' : status === 404 ? '  ' : `⚠️ ${status}`
  if (status === 200) {
    console.log(`${icon} ${url}`)
    console.log(`   Preview: ${preview}`)
  } else if (status !== 404) {
    // Show non-404 non-200 (403s, 401s, 500s are interesting)
    console.log(`${icon} ${url}`)
  }
  // 404s are silent — too many to print
}

async function run() {
  console.log('=== MSF URL Discovery ===')
  console.log(`Key: ${API_KEY.slice(0,8)}...  Pass: ${PASSWORD.slice(0,4)}...\n`)
  console.log('Testing URL combinations. Only ✅ 200 responses are shown (plus non-404 errors).')
  console.log('This takes ~3 minutes — do not interrupt.\n')

  // ── NFL ────────────────────────────────────────────────────────────────────
  console.log('━━━ NFL ━━━')

  const nflSeasons = ['2024-regular', '2025-regular', 'current', '2024-2025-regular', '2024-pre']

  // Flat feed names (no week segment)
  const flatFeeds = [
    'games', 'seasonal_games', 'game_scores', 'scoreboard',
    'team_stats', 'seasonal_team_stats', 'team_stats_totals', 'team_season_stats',
    'player_stats', 'seasonal_player_stats', 'player_gamelogs', 'seasonal_player_gamelogs',
    'standings', 'seasonal_standings',
    'odds', 'game_odds', 'seasonal_odds',
    'injuries', 'player_injuries',
    'rosters',
  ]

  for (const season of nflSeasons) {
    for (const feed of flatFeeds) {
      const url = `${BASE}/nfl/${season}/${feed}.json`
      const r = await probe(url)
      log(r.status, url, r.preview)
      if (r.status === 200) await sleep(300) // pause after success to read
    }
    await sleep(200)
  }

  // Week-scoped URL pattern: /nfl/{season}/week/{week}/{feed}.json
  console.log('\n  --- Testing week-scoped NFL URLs ---')
  const weekFeeds = ['games', 'game_scores', 'team_stats', 'player_stats', 'player_gamelogs', 'odds']
  for (const season of ['2024-regular', 'current']) {
    for (const week of ['1', '18']) {  // week 1 and final week
      for (const feed of weekFeeds) {
        const url = `${BASE}/nfl/${season}/week/${week}/${feed}.json`
        const r = await probe(url)
        log(r.status, url, r.preview)
      }
    }
    await sleep(200)
  }

  // Date-scoped: /nfl/{season}/date/{YYYYMMDD}/{feed}.json
  console.log('\n  --- Testing date-scoped NFL URLs ---')
  for (const feed of ['games', 'game_scores']) {
    const url = `${BASE}/nfl/2024-regular/date/20241215/${feed}.json`
    const r = await probe(url)
    log(r.status, url, r.preview)
  }

  await sleep(500)

  // ── NBA ────────────────────────────────────────────────────────────────────
  console.log('\n━━━ NBA ━━━')

  const nbaSeasons = ['2024-2025-regular', '2024-regular', 'current', '2025-regular']
  const nbaFlatFeeds = [
    'games', 'seasonal_games', 'daily_games', 'game_scores', 'scoreboard',
    'team_stats', 'seasonal_team_stats', 'team_stats_totals',
    'player_stats', 'seasonal_player_stats', 'player_gamelogs', 'seasonal_player_gamelogs',
    'standings', 'seasonal_standings',
    'odds',
    'injuries', 'player_injuries',
  ]

  for (const season of nbaSeasons) {
    for (const feed of nbaFlatFeeds) {
      const url = `${BASE}/nba/${season}/${feed}.json`
      const r = await probe(url)
      log(r.status, url, r.preview)
    }
    await sleep(200)
  }

  // Date-scoped NBA: /nba/{season}/date/{YYYYMMDD}/{feed}.json
  console.log('\n  --- Testing date-scoped NBA URLs ---')
  for (const feed of ['games', 'daily_games', 'game_scores', 'player_gamelogs']) {
    const url = `${BASE}/nba/2024-2025-regular/date/20250101/${feed}.json`
    const r = await probe(url)
    log(r.status, url, r.preview)
  }

  await sleep(500)

  // ── NCAAB ──────────────────────────────────────────────────────────────────
  console.log('\n━━━ NCAAB (try all slug variants) ━━━')

  const ncaabLeagues = ['ncaa-bb', 'ncaab', 'ncaamb', 'ncaa_bb', 'ncaabb']
  const ncaabSeasons = ['2024-2025-regular', '2024-regular', 'current', '2025-regular']
  const ncaabFeeds   = ['games', 'seasonal_games', 'daily_games', 'team_stats', 'seasonal_team_stats', 'player_stats', 'seasonal_player_stats']

  for (const league of ncaabLeagues) {
    for (const season of ncaabSeasons) {
      for (const feed of ncaabFeeds) {
        const url = `${BASE}/${league}/${season}/${feed}.json`
        const r = await probe(url)
        log(r.status, url, r.preview)
      }
    }
    await sleep(200)
  }

  await sleep(500)

  // ── NCAAF ──────────────────────────────────────────────────────────────────
  console.log('\n━━━ NCAAF (try all slug variants) ━━━')

  const ncaafLeagues = ['ncaa-fb', 'ncaaf', 'ncaafb', 'ncaa_fb', 'ncaa-football']
  const ncaafSeasons = ['2024-regular', 'current', '2024-2025-regular', '2025-regular']
  const ncaafFeeds   = ['games', 'seasonal_games', 'weekly_games', 'team_stats', 'seasonal_team_stats', 'player_stats']

  for (const league of ncaafLeagues) {
    for (const season of ncaafSeasons) {
      for (const feed of ncaafFeeds) {
        const url = `${BASE}/${league}/${season}/${feed}.json`
        const r = await probe(url)
        log(r.status, url, r.preview)
      }
    }
    await sleep(200)
  }

  // ── Final: fetch full JSON of any 200s found ───────────────────────────────
  console.log('\n\n=== DISCOVERY COMPLETE ===')
  console.log('All ✅ URLs above returned 200. Run this to see full JSON of any working URL:')
  console.log(`  curl -s -H "Authorization: ${AUTH.slice(0,35)}..." "<URL>" | head -c 2000`)
  console.log('\nPaste all ✅ lines back to Claude.')
  console.log('If NO ✅ lines appear: your trial may not include NFL/NBA yet.')
  console.log('Log into mysportsfeeds.com → Account → confirm NFL and NBA trials show "Active".')
}

run().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})