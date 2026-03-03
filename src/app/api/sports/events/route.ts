// src/app/api/sports/events/route.ts
//
// Always fetches LIVE from SportRadar on every request. No cache reads.
// Odds and schedules change frequently, so we never serve stale data.
// After fetching, upserts to DB in background so simulation engine has team IDs.

import { NextRequest, NextResponse } from "next/server"
import { getUpcomingGames }  from "@/lib/sportradar/games"
import { attachOddsToGames } from "@/lib/sportradar/odds"
import { supabaseAdmin }     from "@/lib/database/supabase-admin"
import { SportKey }          from "@/lib/sportradar/config"

function sportTitle(sport: string): string {
  const titles: Record<string, string> = {
    ncaab: "NCAA Men's Basketball",
    nba:   "NBA",
    nfl:   "NFL Football",
  }
  return titles[sport] ?? sport.toUpperCase()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sport = (searchParams.get("sport") || "ncaab") as SportKey

  console.log("[events] LIVE fetch sport=" + sport)

  try {
    let games = await getUpcomingGames(sport, 3)
    console.log("[events] Schedule: " + games.length + " games")

    if (games.length === 0) {
      return NextResponse.json({ events: [], source: "live", message: "No upcoming games scheduled" })
    }

    games = await attachOddsToGames(games, sport)
    console.log("[events] Odds attached")

    const shaped = games.map(g => ({
      id:                g.id,
      external_event_id: g.id,
      sport_key:         g.sport,
      sport_title:       sportTitle(g.sport),
      commence_time:     g.commence_time,
      home_team:         g.home_team,
      away_team:         g.away_team,
      event_status:      "upcoming",
      home_team_sr_id:   g.home_team_id,
      away_team_sr_id:   g.away_team_id,
      neutral_site:      g.neutral_site,
      venue_name:        g.venue_name,
      odds_data: {
        spread_home:      g.spread_home,
        spread_home_odds: g.spread_home_odds,
        spread_away_odds: g.spread_away_odds,
        total:            g.total,
        total_over_odds:  g.total_over_odds,
        total_under_odds: g.total_under_odds,
        moneyline_home:   g.moneyline_home,
        moneyline_away:   g.moneyline_away,
      },
    }))

    // Write to DB in background so simulation engine has current team SR IDs
    supabaseAdmin
      .from("sports_events")
      .upsert(
        shaped.map(g => ({
          external_event_id: g.id,
          sport_key:         g.sport_key,
          sport_title:       g.sport_title,
          commence_time:     g.commence_time,
          home_team:         g.home_team,
          away_team:         g.away_team,
          event_status:      "upcoming",
          odds_data:         g.odds_data,
          home_team_sr_id:   g.home_team_sr_id,
          away_team_sr_id:   g.away_team_sr_id,
          neutral_site:      g.neutral_site,
          venue_name:        g.venue_name,
          last_odds_update:  new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        })),
        { onConflict: "external_event_id" }
      )
      .then(({ error }) => {
        if (error) console.error("[events] DB write error:", error.message)
      })

    return NextResponse.json({ events: shaped, source: "live" })

  } catch (err: any) {
    console.error("[events] SportRadar error:", err.message)
    return NextResponse.json(
      { error: "SportRadar fetch failed: " + err.message, events: [] },
      { status: 500 }
    )
  }
}