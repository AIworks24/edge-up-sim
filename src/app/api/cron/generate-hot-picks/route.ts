import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'
import { claudeAgent } from '@/lib/ai/claude-agent'

// This endpoint should be called once daily at 6 AM via Vercel Cron
// Add to vercel.json: { "path": "/api/cron/generate-hot-picks", "schedule": "0 6 * * *" }

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Starting hot picks generation...')
    
    const results = {
      usersProcessed: 0,
      picksGenerated: 0,
      errors: [] as string[]
    }

    const today = new Date().toISOString().split('T')[0]

    // Get all active users
    const { data: users } = await supabaseAdmin
      .from('profiles')
      .select('id, preferred_sports')
      .in('subscription_status', ['active', 'trialing'])

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, message: 'No active users' })
    }

    for (const user of users) {
      try {
        const userSports = user.preferred_sports || ['nfl', 'nba', 'ncaab', 'ncaaf']
        const picksAssigned: string[] = []

        // Generate up to 3 picks (one per sport preference, up to 3)
        for (let i = 0; i < Math.min(3, userSports.length); i++) {
          const sport = userSports[i]

          // Get upcoming games for this sport (today)
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)

          const { data: events } = await supabaseAdmin
            .from('sports_events')
            .select('id, sport_key, home_team, away_team')
            .eq('sport_key', sport === 'nfl' ? 'americanfootball_nfl' : 
                            sport === 'nba' ? 'basketball_nba' :
                            sport === 'ncaab' ? 'basketball_ncaab' :
                            sport === 'ncaaf' ? 'americanfootball_ncaa' : sport)
            .eq('event_status', 'upcoming')
            .gte('commence_time', new Date().toISOString())
            .lt('commence_time', tomorrow.toISOString())
            .order('commence_time', { ascending: true })
            .limit(5)

          if (!events || events.length === 0) continue

          // Pick a random game from available
          const randomEvent = events[Math.floor(Math.random() * events.length)]

          // Check if we already have a prediction for this event today
          const { data: existingPrediction } = await supabaseAdmin
            .from('ai_predictions')
            .select('id')
            .eq('event_id', randomEvent.id)
            .eq('prediction_type', 'hot_pick')
            .gte('created_at', today)
            .single()

          let predictionId: string

          if (existingPrediction) {
            // Reuse existing prediction
            predictionId = existingPrediction.id
          } else {
            // Generate new prediction
            const prediction = await claudeAgent.generatePrediction({
              eventId: randomEvent.id,
              sport: sport,
              betType: 'moneyline',
              isHotPick: true
            })

            predictionId = prediction.predictionId
          }

          // Assign to user
          await supabaseAdmin
            .from('daily_hot_picks')
            .insert({
              user_id: user.id,
              prediction_id: predictionId,
              sport_key: randomEvent.sport_key,
              assigned_date: today,
              pick_rank: i + 1
            })

          picksAssigned.push(predictionId)
          results.picksGenerated++
        }

        results.usersProcessed++
        console.log(`[Cron] Generated ${picksAssigned.length} picks for user ${user.id}`)

      } catch (error: any) {
        console.error(`[Cron] Error generating picks for user ${user.id}:`, error)
        results.errors.push(`User ${user.id}: ${error.message}`)
      }
    }

    console.log('[Cron] Hot picks generation completed:', results)

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