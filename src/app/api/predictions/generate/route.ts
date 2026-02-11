import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventId, sport, betType, userId } = body

    console.log('[API] Prediction request received:', { eventId, sport, betType, userId })

    // Validate inputs
    if (!eventId || !sport || !betType || !userId) {
      console.error('[API] Missing required fields:', { eventId, sport, betType, userId })
      return NextResponse.json(
        { error: 'Missing required fields: eventId, sport, betType, userId' },
        { status: 400 }
      )
    }

    console.log('[API] Fetching user profile for userId:', userId)

    // Use ADMIN client to check user's simulation limits (bypasses RLS)
    // Use select('*') to get all columns
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('[API] Profile query error:', {
        error: profileError,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
        code: profileError.code
      })
      return NextResponse.json(
        { error: `Failed to fetch user profile: ${profileError.message}` },
        { status: 500 }
      )
    }

    if (!profile) {
      console.error('[API] Profile not found for userId:', userId)
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    console.log('[API] Profile found:', {
      userId: profile.id,
      dailyCount: profile.daily_simulation_count,
      dailyLimit: profile.daily_simulation_limit,
      rollover: profile.monthly_simulation_rollover
    })

    // Check simulation limits
    const dailyLimit = profile.daily_simulation_limit || 3
    const currentCount = profile.daily_simulation_count || 0
    const rollover = profile.monthly_simulation_rollover || 0
    const totalAvailable = dailyLimit + rollover

    console.log('[API] Simulation limits:', {
      currentCount,
      dailyLimit,
      rollover,
      totalAvailable
    })

    if (currentCount >= totalAvailable) {
      return NextResponse.json(
        { error: `Daily simulation limit reached (${currentCount}/${totalAvailable})` },
        { status: 429 }
      )
    }

    // Get event data
    console.log('[API] Fetching event data for eventId:', eventId)
    
    const { data: event, error: eventError } = await supabaseAdmin
      .from('sports_events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError) {
      console.error('[API] Event query error:', eventError)
      return NextResponse.json(
        { error: `Event not found: ${eventError.message}` },
        { status: 404 }
      )
    }

    if (!event) {
      console.error('[API] Event not found for eventId:', eventId)
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    console.log('[API] Event found:', {
      eventId: event.id,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      sportKey: event.sport_key
    })

    // Generate mock prediction
    // TODO: Replace with actual AI prediction generation
    const mockPrediction = {
      predictionId: `pred_${Date.now()}`,
      predictedWinner: event.home_team,
      confidenceScore: Math.floor(Math.random() * (85 - 65) + 65), // Random 65-85%
      edgeScore: Math.floor(Math.random() * (10 - 3) + 3) / 10, // Random 0.3-1.0%
      recommendedBetType: betType,
      recommendedLine: betType === 'moneyline' ? `${event.home_team} -150` : `${event.home_team} -3.5`,
      aiAnalysis: `Based on recent performance and matchup analysis, ${event.home_team} has a strong advantage in this ${betType} bet. Key factors include home court advantage, recent form, and head-to-head history.`,
      keyFactors: [
        `${event.home_team} has won 4 of their last 5 games`,
        'Strong home court advantage in recent matchups',
        'Favorable matchup against opposing defense',
        'Key players healthy and available for this game'
      ],
      riskAssessment: 'Medium risk - confident in outcome but consider line value and betting limits',
      modelVersion: 'mock-v1.0'
    }

    console.log('[API] Generated mock prediction:', {
      winner: mockPrediction.predictedWinner,
      confidence: mockPrediction.confidenceScore,
      edge: mockPrediction.edgeScore
    })

    // Store prediction in database
    console.log('[API] Storing prediction in database...')
    
    const { data: storedPrediction, error: storeError } = await supabaseAdmin
      .from('ai_predictions')
      .insert({
        event_id: eventId,
        prediction_type: 'user_simulation',
        requested_by: userId,
        predicted_winner: mockPrediction.predictedWinner,
        confidence_score: mockPrediction.confidenceScore,
        edge_score: mockPrediction.edgeScore,
        recommended_bet_type: betType,
        ai_analysis: mockPrediction.aiAnalysis,
        key_factors: mockPrediction.keyFactors,
        risk_assessment: mockPrediction.riskAssessment,
        model_version: mockPrediction.modelVersion,
        odds_snapshot: event.odds_data || {}
      })
      .select()
      .single()

    if (storeError) {
      console.error('[API] Error storing prediction:', storeError)
      // Continue anyway - don't fail the request
    } else {
      console.log('[API] Prediction stored successfully with id:', storedPrediction?.id)
    }

    // Increment user's simulation count
    console.log('[API] Updating user simulation count...')
    
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        daily_simulation_count: currentCount + 1,
        monthly_simulation_count: (profile.monthly_simulation_count || 0) + 1
      })
      .eq('id', userId)

    if (updateError) {
      console.error('[API] Error updating simulation count:', updateError)
      // Continue anyway
    } else {
      console.log('[API] Simulation count updated successfully')
    }

    console.log('[API] Prediction generation completed successfully')

    return NextResponse.json({
      success: true,
      prediction: storedPrediction || mockPrediction
    })

  } catch (error: any) {
    console.error('[API] Unexpected error in prediction generation:', {
      error: error,
      message: error.message,
      stack: error.stack
    })
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}