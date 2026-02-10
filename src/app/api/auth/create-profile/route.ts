import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, email, fullName, state, timezone, preferredSports } = body

    // Validate required fields
    if (!userId || !email || !state) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create profile using admin client (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: email,
        full_name: fullName || '',
        verified_state: state,
        reset_timezone: timezone || 'America/New_York',
        preferred_sports: preferredSports || ['nfl', 'nba', 'ncaab', 'ncaaf'],
        subscription_status: 'none',
        subscription_tier: 'edge_starter',
        daily_simulation_limit: 3,
        daily_simulation_count: 0,
        monthly_simulation_count: 0,
        monthly_simulation_rollover: 0,
        last_simulation_reset: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('[API] Profile creation error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, profile: data })

  } catch (error: any) {
    console.error('[API] Profile creation failed:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}