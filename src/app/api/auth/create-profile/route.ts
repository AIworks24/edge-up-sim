import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, email, fullName, state, timezone, preferredSports } = body

    console.log('[API] Creating profile for:', { userId, email, state })

    // Validate required fields
    if (!userId || !email || !state) {
      console.error('[API] Missing required fields:', { userId, email, state })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create profile using admin client (bypasses RLS)
    const profileData = {
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
    }

    console.log('[API] Attempting to insert profile:', profileData)

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert(profileData)
      .select()
      .single()

    if (error) {
      console.error('[API] Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json(
        { error: error.message, details: error.details, hint: error.hint },
        { status: 500 }
      )
    }

    console.log('[API] Profile created successfully:', data)
    return NextResponse.json({ success: true, profile: data })

  } catch (error: any) {
    console.error('[API] Profile creation exception:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', stack: error.stack },
      { status: 500 }
    )
  }
}