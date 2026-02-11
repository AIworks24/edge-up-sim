import { NextRequest, NextResponse } from 'next/server'
import { oddsAPIClient, SPORT_KEYS } from '@/lib/odds-api/client'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

/**
 * Manual trigger endpoint for testing odds data fetching
 * Visit: https://your-app.vercel.app/api/admin/trigger-fetch
 * 
 * This endpoint allows you to manually trigger the sports data fetch
 * without waiting for the cron job to run.
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Manual Fetch] Starting sports events fetch...')
    
    const results = {
      fetched: 0,
      updated: 0,
      errors: [] as string[],
      details: {} as Record<string, any>
    }

    // Test all sports
    const sports: Array<keyof typeof SPORT_KEYS> = ['nfl', 'nba', 'ncaab', 'ncaaf']

    for (const sport of sports) {
      try {
        console.log(`[Manual Fetch] Fetching ${sport}...`)
        
        // Fetch odds from API
        const events = await oddsAPIClient.getOdds(sport)
        
        console.log(`[Manual Fetch] Received ${events.length} events for ${sport}`)
        
        // Store results for this sport
        results.details[sport] = {
          fetched: events.length,
          updated: 0,
          errors: [],
          sample: events.length > 0 ? {
            id: events[0].id,
            home: events[0].home_team,
            away: events[0].away_team,
            commence_time: events[0].commence_time
          } : null
        }
        
        // Process each event
        for (const event of events) {
          try {
            const { error } = await supabaseAdmin
              .from('sports_events')
              .upsert({
                external_event_id: event.id,
                sport_key: event.sport_key,
                sport_title: event.sport_title,
                commence_time: event.commence_time,
                home_team: event.home_team,
                away_team: event.away_team,
                odds_data: event.bookmakers,
                event_status: new Date(event.commence_time) > new Date() ? 'upcoming' : 'live',
                last_odds_update: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'external_event_id'
              })

            if (error) {
              console.error(`[Manual Fetch] Error upserting event ${event.id}:`, error)
              results.errors.push(`${sport}: ${event.id} - ${error.message}`)
              results.details[sport].errors.push(event.id)
            } else {
              results.updated++
              results.details[sport].updated++
            }
          } catch (eventError: any) {
            console.error(`[Manual Fetch] Error processing event:`, eventError)
            results.errors.push(`${sport}: ${eventError.message}`)
          }
        }

        results.fetched += events.length
        console.log(`[Manual Fetch] ✓ ${sport}: ${events.length} fetched, ${results.details[sport].updated} updated`)
        
      } catch (error: any) {
        console.error(`[Manual Fetch] Error fetching ${sport}:`, error.message)
        results.errors.push(`${sport}: ${error.message}`)
        results.details[sport] = {
          fetched: 0,
          updated: 0,
          error: error.message
        }
      }
    }

    console.log('[Manual Fetch] Completed:', results)

    // Return detailed response
    return NextResponse.json({
      success: results.errors.length === 0,
      summary: {
        totalFetched: results.fetched,
        totalUpdated: results.updated,
        errorCount: results.errors.length
      },
      details: results.details,
      errors: results.errors,
      timestamp: new Date().toISOString(),
      message: results.errors.length === 0 
        ? `Successfully fetched ${results.fetched} events and updated ${results.updated} in database`
        : `Completed with ${results.errors.length} errors. Check details below.`
    }, {
      status: results.errors.length === 0 ? 200 : 207 // 207 = Multi-Status
    })

  } catch (error: any) {
    console.error('[Manual Fetch] Fatal error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}