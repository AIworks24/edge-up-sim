// src/lib/sportradar/odds.ts
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

    const oddsMap = new Map<string, ReturnType<typeof parseOddsEvent>>()
    for (const event of events) {
      const parsed = parseOddsEvent(event)
      if (parsed) oddsMap.set(parsed.game_id, parsed)
    }

    return games.map(game => {
      const o = oddsMap.get(game.id)
      if (!o) return game
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
  } catch {
    return games
  }
}

function parseOddsEvent(event: any) {
  if (!event?.id) return null
  const markets: any[] = event.markets || []

  const spreadMkt = markets.find((m: any) => m.type === 'spread'    || m.name?.toLowerCase().includes('spread'))
  const totalMkt  = markets.find((m: any) => m.type === 'total'     || m.name?.toLowerCase().includes('total'))
  const mlMkt     = markets.find((m: any) => m.type === 'moneyline' || m.name?.toLowerCase().includes('moneyline'))

  const getOdds = (market: any, side: string): number => {
    if (!market) return -110
    const outcomes: any[] = market.books?.[0]?.outcomes || market.outcomes || []
    const outcome = outcomes.find((o: any) =>
      o.type?.toLowerCase() === side || o.name?.toLowerCase() === side
    )
    return outcome?.odds ?? -110
  }

  const getSpread = (market: any): number => {
    if (!market) return -3
    const outcomes: any[] = market.books?.[0]?.outcomes || market.outcomes || []
    const home = outcomes.find((o: any) => o.type === 'home' || o.name === 'home')
    return home?.spread ?? home?.handicap ?? -3
  }

  const getTotal = (market: any): number => {
    if (!market) return 140
    return market.total ?? market.books?.[0]?.total ?? 140
  }

  return {
    game_id:          event.id,
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