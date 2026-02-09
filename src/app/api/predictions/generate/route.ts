import { NextRequest, NextResponse } from 'next/server'
import { claudeAgent } from '@/lib/ai/claude-agent'
import { supabase } from '@/lib/database/supabase-client'

export async function POST(request: NextRequest) {
  try {
    const { eventId, sport, betType, userId } = await request.json()

    // Validate inputs
    if (!eventId || !sport || !betType || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check user's simulation limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('daily_simulation_count, daily_simulation_limit')
      .eq('id', userId)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (profile.daily_simulation_count >= profile.daily_simulation_limit) {
      return NextResponse.json(
        { error: 'Daily simulation limit reached' },
        { status: 429 }
      )
    }

    // Generate prediction
    const prediction = await claudeAgent.generatePrediction({
      eventId,
      sport,
      betType,
      userId,
      isHotPick: false
    })

    return NextResponse.json(prediction)
  } catch (error: any) {
    console.error('[API] Prediction generation error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}