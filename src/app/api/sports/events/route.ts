// src/app/api/sports/events/route.ts
//
// Converted from Sportradar → MySportsFeeds (MSF).
// Fetches upcoming games + odds live on every request.
// Upserts to DB in background so simulation engine has current team IDs.

import { NextRequest, NextResponse } from "next/server"
import { getUpcomingGames }  from "@/lib/msf/games"
import { attachOddsToGames } from "@/lib/msf/odds"
import { supabaseAdmin }     from "@/lib/database/supabase-admin"
import { SportKey }          from "@/lib/msf/config"

function sportTitle(sport: string): string {
  const titles: Record<string, string> = {
    ncaab: "NCAA Men's Basketball",
    nba:   "NBA",
    nfl:   "NFL Football",
    ncaaf: "NCAA Football",
  }
  return titles[sport] ?? sport.toUpperCase()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sport = (searchParams.get("sport") || "nba") as SportKey

  console.log("[events] MSF live fetch sport=" + sport)

  try {
    let games = await getUpcomingGames(sport, 7)
    console.log("[events] Schedule: " + games.length + " games")

    if (games.length === 0) {
      return NextResponse.json({
        events:  [],
        source:  "live",
        message: "No upcoming games scheduled",
      })
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
      // MSF uses numeric IDs stored as strings — field renamed from _sr_id
      // but kept as home_team_sr_id in DB schema for backward compat
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

    // Upsert to DB in background — non-blocking
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
    console.error("[events] MSF error:", err.message)
    return NextResponse.json(
      { error: "MSF fetch failed: " + err.message, events: [] },
      { status: 500 }
    )
  }
}