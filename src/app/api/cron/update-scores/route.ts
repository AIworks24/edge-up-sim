import { NextRequest, NextResponse } from 'next/server'
import { oddsAPIClient, SPORT_KEYS } from '@/lib/odds-api/client'
import { supabaseAdmin } from '@/lib/database/supabase-admin'
import { processPredictionOutcome } from '@/lib/ai/learning-engine'

// This endpoint should be called every 15 minutes via Vercel Cron
// Add to vercel.json: { "path": "/api/cron/update-scores", "schedule": "*/15 * * * *" }

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Starting score updates...')
    
    const results = {
      updated: 0,
      completed: 0,
      errors: [] as string[]
    }

    // Fetch scores for all sports
    const sports: Array<keyof typeof SPORT_KEYS> = ['nfl', 'nba', 'ncaab', 'ncaaf']

    for (const sport of sports) {
      try {
        const scores = await oddsAPIClient.getScores(sport, 1) // Last 1 day
        
        for (const score of scores) {
          // Find matching event in database
          const { data: event } = await supabaseAdmin
            .from('sports_events')
            .select('id')
            .eq('external_event_id', score.id)
            .single()

          if (!event) continue

          // Determine winner
          let winner: 'home' | 'away' | null = null
          let homeScore = 0
          let awayScore = 0

          if (score.scores && score.scores.length >= 2) {
            const homeTeamScore = score.scores.find(s => s.name === score.home_team)
            const awayTeamScore = score.scores.find(s => s.name === score.away_team)

            if (homeTeamScore && awayTeamScore) {
              homeScore = parseInt(homeTeamScore.score)
              awayScore = parseInt(awayTeamScore.score)

              if (homeScore > awayScore) {
                winner = 'home'
              } else if (awayScore > homeScore) {
                winner = 'away'
              }
            }
          }

          // Update event
          const { error } = await supabaseAdmin
            .from('sports_events')
            .update({
              event_status: score.completed ? 'completed' : 'live',
              final_score: {
                home: homeScore,
                away: awayScore,
                winner
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', event.id)

          if (error) {
            console.error(`[Cron] Error updating score for ${score.id}:`, error)
            results.errors.push(score.id)
          } else {
            results.updated++

            // If game is completed, process predictions
            if (score.completed && winner) {
              await processCompletedGame(event.id, {
                winner,
                homeScore,
                awayScore
              })
              results.completed++
            }
          }
        }

        console.log(`[Cron] Updated ${scores.length} ${sport} scores`)
        
      } catch (error: any) {
        console.error(`[Cron] Error fetching ${sport} scores:`, error.message)
        results.errors.push(`${sport}: ${error.message}`)
      }
    }

    console.log('[Cron] Score updates completed:', results)

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

async function processCompletedGame(
  eventId: string,
  result: { winner: 'home' | 'away', homeScore: number, awayScore: number }
) {
  try {
    // Get all predictions for this event
    const { data: predictions } = await supabaseAdmin
      .from('ai_predictions')
      .select('id')
      .eq('event_id', eventId)
      .is('was_correct', null)

    if (!predictions || predictions.length === 0) return

    // Process each prediction
    for (const prediction of predictions) {
      await processPredictionOutcome(prediction.id, result)
    }

    console.log(`[Cron] Processed ${predictions.length} predictions for event ${eventId}`)
  } catch (error) {
    console.error('[Cron] Error processing predictions:', error)
  }
}