// src/lib/sportradar/odds.ts
//
// BUG FIX: Old code keyed the odds map on event.id — but the SportRadar odds API
// uses sport_event_id (not id) to reference the schedule game UUID.
// This meant zero games ever matched → all showed "Odds not yet posted".
// FIX: Key map on sport_event_id (primary) and id (fallback).

import { srFetch }        from './client'
import { NormalizedGame } from './games'

const SPORT_ODDS_PATH: Record<string, string> = {
  ncaab: '/oddscomparison/trial/v2/en/sports/basketball/events.json',
  nba:   '/oddscomparison/trial/v2/en/sports/basketball/events.json',
  nfl:   '/oddscomparison/trial/v2/en/sports/americanfootball/events.json',
  ncaaf: '/oddscomparison/trial/v2/en/sports/americanfootball/events.json',
}

export async function attachOddsToGames(
  games: NormalizedGame[],
  sport: string
): Promise<NormalizedGame[]> {
  try {
    const path = SPORT_ODDS_PATH[sport] ?? SPORT_ODDS_PATH['ncaab']
    const data: any = await srFetch(path)
    const events: any[] = data.events || []

    console.log(`[odds] API returned ${events.length} events for ${sport}`)

    // FIXED: key on sport_event_id (the schedule game UUID) AND id as fallback
    const oddsMap = new Map<string, ReturnType<typeof parseOddsEvent>>()
    for (const event of events) {
      const parsed = parseOddsEvent(event)
      if (!parsed) continue
      if (event.sport_event_id) oddsMap.set(event.sport_event_id, parsed)
      if (event.id && event.id !== event.sport_event_id) oddsMap.set(event.id, parsed)
    }

    console.log(`[odds] Odds map: ${oddsMap.size} entries`)

    let matched = 0
    const result = games.map(game => {
      const o = oddsMap.get(game.id)
      if (!o) return game
      matched++
      return {
        ...game,
        spread_home:      o.spread_home,
        spread_home_odds: o.spread_home_odds,
        spread_away_odds: o.spread_away_odds,
        total:            o.total,
        total_over_odds:  o.total_over_odds,
        total_under_odds: o.total_under_odds,
        moneyline_home:   o.moneyline_home,
        moneyline_away:   o.moneyline_away,
      }
    })

    console.log(`[odds] Matched ${matched}/${games.length} games`)
    return result

  } catch (err: any) {
    console.error('[odds] error:', err.message)
    return games
  }
}

function parseOddsEvent(event: any) {
  if (!event) return null

  const markets: any[] = event.markets || []

  const spreadMkt = markets.find((m: any) =>
    m.market_type_id === 'spread' || m.type === 'spread' ||
    m.name?.toLowerCase().includes('point spread') ||
    m.name?.toLowerCase().includes('spread')
  )
  const totalMkt = markets.find((m: any) =>
    m.market_type_id === 'total' || m.type === 'total' ||
    m.name?.toLowerCase().includes('total points') ||
    m.name?.toLowerCase().includes('over/under')
  )
  const mlMkt = markets.find((m: any) =>
    m.market_type_id === 'moneyline' || m.type === 'moneyline' ||
    m.name?.toLowerCase().includes('moneyline') ||
    m.name?.toLowerCase().includes('money line')
  )

  // SR nests outcomes under books[0].outcomes OR directly under market.outcomes
  const getOutcomes = (market: any): any[] => {
    if (!market) return []
    if (Array.isArray(market.outcomes) && market.outcomes.length > 0) return market.outcomes
    const books: any[] = market.books || []
    if (books.length === 0) return []
    const consensus = books.find((b: any) => b.name?.toLowerCase().includes('consensus'))
    return (consensus || books[0])?.outcomes || []
  }

  const getOdds = (market: any, side: string): number | null => {
    const outcomes = getOutcomes(market)
    const outcome  = outcomes.find((o: any) =>
      (o.type || o.name || '').toLowerCase().includes(side)
    )
    return outcome?.odds ?? outcome?.american_odds ?? null
  }

  const getSpread = (market: any): number | null => {
    const outcomes = getOutcomes(market)
    const home = outcomes.find((o: any) =>
      (o.type || o.name || '').toLowerCase().includes('home')
    )
    return home?.spread ?? home?.handicap ?? home?.line ?? null
  }

  const getTotal = (market: any): number | null => {
    if (!market) return null
    if (market.total != null)             return market.total
    if (market.books?.[0]?.total != null) return market.books[0].total
    const outcomes = getOutcomes(market)
    const over = outcomes.find((o: any) => (o.type || o.name || '').toLowerCase().includes('over'))
    return over?.total ?? over?.line ?? null
  }

  return {
    game_id:          event.sport_event_id || event.id,
    spread_home:      getSpread(spreadMkt),
    spread_home_odds: getOdds(spreadMkt, 'home'),
    spread_away_odds: getOdds(spreadMkt, 'away'),
    total:            getTotal(totalMkt),
    total_over_odds:  getOdds(totalMkt, 'over'),
    total_under_odds: getOdds(totalMkt, 'under'),
    moneyline_home:   getOdds(mlMkt, 'home'),
    moneyline_away:   getOdds(mlMkt, 'away'),
  }
}