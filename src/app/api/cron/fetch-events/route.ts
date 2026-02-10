import { NextRequest, NextResponse } from 'next/server'
import { oddsAPIClient, SPORT_KEYS } from '@/lib/odds-api/client'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

// This endpoint should be called every 5 minutes via Vercel Cron
// Add to vercel.json: { "path": "/api/cron/fetch-events", "schedule": "*/5 * * * *" }

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Starting sports events fetch...')
    
    const results = {
      fetched: 0,
      updated: 0,
      errors: [] as string[]
    }

    // Fetch events for all sports (Tier 1 priority)
    const sports: Array<keyof typeof SPORT_KEYS> = ['nfl', 'nba', 'ncaab', 'ncaaf']

    for (const sport of sports) {
      try {
        const events = await oddsAPIClient.getOdds(sport)
        
        for (const event of events) {
          // Upsert event to database
          const { error } = await supabaseAdmin
            .from('sports_events')
            .upsert({
              external_event_id: event.id,
              sport_key: event.sport_key,
              sport_title: event.sport_title,
              commence_time: event.commence_time,
              home_team: event.home_team,
              away_team: event.away_team,
              odds_data: JSON.stringify(event.bookmakers),
              event_status: new Date(event.commence_time) > new Date() ? 'upcoming' : 'live',
              last_odds_update: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'external_event_id'
            })

          if (error) {
            console.error(`[Cron] Error upserting event ${event.id}:`, error)
            results.errors.push(`${sport}: ${event.id}`)
          } else {
            results.updated++
          }
        }

        results.fetched += events.length
        console.log(`[Cron] Fetched ${events.length} ${sport} events`)
        
      } catch (error: any) {
        console.error(`[Cron] Error fetching ${sport}:`, error.message)
        results.errors.push(`${sport}: ${error.message}`)
      }
    }

    // Clean up old events (completed > 7 days ago)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    await supabaseAdmin
      .from('sports_events')
      .delete()
      .eq('event_status', 'completed')
      .lt('commence_time', sevenDaysAgo.toISOString())

    console.log('[Cron] Sports events fetch completed:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('[Cron] Fatal error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}