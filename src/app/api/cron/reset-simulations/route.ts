import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

// This endpoint should be called every hour via Vercel Cron
// Add to vercel.json: { "path": "/api/cron/reset-simulations", "schedule": "0 * * * *" }

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Cron] Starting simulation reset check...')
    
    const results = {
      usersReset: 0,
      monthlyResets: 0,
      errors: [] as string[]
    }

    // Get all active users
    const { data: users } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .in('subscription_status', ['active', 'trialing'])

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, message: 'No active users' })
    }

    for (const user of users) {
      try {
        // Get user's current time
        const userTimezone = user.reset_timezone || 'America/New_York'
        const userNow = new Date().toLocaleString('en-US', { timeZone: userTimezone })
        const userDate = new Date(userNow)
        
        // Get user's midnight today
        const userMidnight = new Date(userDate)
        userMidnight.setHours(0, 0, 0, 0)

        // Check if last reset was before today's midnight
        const lastReset = new Date(user.last_simulation_reset)
        
        if (lastReset < userMidnight) {
          // Time to reset!
          const unusedSims = user.daily_simulation_limit - user.daily_simulation_count
          const newRollover = Math.min(
            user.monthly_simulation_rollover + unusedSims,
            user.daily_simulation_limit * 3  // Cap at 3x daily limit
          )

          await supabaseAdmin
            .from('profiles')
            .update({
              daily_simulation_count: 0,
              monthly_simulation_rollover: newRollover,
              last_simulation_reset: userMidnight.toISOString()
            })
            .eq('id', user.id)

          results.usersReset++
          console.log(`[Cron] Reset simulations for user ${user.id}. Rollover: ${newRollover}`)
        }

        // Check for monthly reset (first of month)
        const lastResetMonth = lastReset.getMonth()
        const currentMonth = userDate.getMonth()

        if (lastResetMonth !== currentMonth) {
          await supabaseAdmin
            .from('profiles')
            .update({
              monthly_simulation_count: 0,
              monthly_simulation_rollover: 0
            })
            .eq('id', user.id)

          results.monthlyResets++
          console.log(`[Cron] Monthly reset for user ${user.id}`)
        }

      } catch (error: any) {
        console.error(`[Cron] Error resetting user ${user.id}:`, error)
        results.errors.push(`User ${user.id}: ${error.message}`)
      }
    }

    console.log('[Cron] Simulation reset completed:', results)

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