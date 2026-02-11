import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const { eventId, sport, betType, userId } = await request.json()

    console.log('[API] Prediction request:', { eventId, sport, betType, userId })

    // Validate inputs
    if (!eventId || !sport || !betType || !userId) {
      console.error('[API] Missing required fields:', { eventId, sport, betType, userId })
      return NextResponse.json(
        { error: 'Missing required fields: eventId, sport, betType, userId' },
        { status: 400 }
      )
    }

    // Use ADMIN client to check user's simulation limits (bypasses RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('daily_simulation_count, daily_simulation_limit, monthly_simulation_rollover, monthly_simulation_count')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('[API] Profile query error:', profileError)
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      )
    }

    if (!profile) {
      console.error('[API] User not found:', userId)
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    console.log('[API] User limits:', profile)

    // Check simulation limits
    const dailyLimit = profile.daily_simulation_limit || 3
    const currentCount = profile.daily_simulation_count || 0
    const rollover = profile.monthly_simulation_rollover || 0
    const totalAvailable = dailyLimit + rollover

    if (currentCount >= totalAvailable) {
      return NextResponse.json(
        { error: `Daily simulation limit reached (${currentCount}/${totalAvailable})` },
        { status: 429 }
      )
    }

    // Get event data
    const { data: event, error: eventError } = await supabaseAdmin
      .from('sports_events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      console.error('[API] Event not found:', eventId, eventError)
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    console.log('[API] Generating prediction for:', event.home_team, 'vs', event.away_team)

    // TODO: Replace with actual AI prediction generation
    // For now, return a mock prediction
    const mockPrediction = {
      predictionId: `pred_${Date.now()}`,
      predictedWinner: event.home_team,
      confidenceScore: 72,
      edgeScore: 5.3,
      recommendedBetType: betType,
      recommendedLine: betType === 'moneyline' ? 'Home -150' : 'Home -3.5',
      aiAnalysis: `Based on recent performance and matchup analysis, ${event.home_team} has a strong advantage in this game. Key factors include home court advantage, recent form, and head-to-head history.`,
      keyFactors: [
        `${event.home_team} has won 4 of their last 5 games`,
        'Strong home court advantage',
        'Favorable matchup against opposing defense',
        'Key players healthy and available'
      ],
      riskAssessment: 'Medium risk - confident in outcome but consider line value',
      modelVersion: 'mock-v1'
    }

    // Store prediction in database
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
      // Don't fail the request, just log the error
    }

    // Increment user's simulation count
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        daily_simulation_count: currentCount + 1,
        monthly_simulation_count: (profile.monthly_simulation_count || 0) + 1
      })
      .eq('id', userId)

    if (updateError) {
      console.error('[API] Error updating simulation count:', updateError)
    }

    console.log('[API] Prediction generated successfully')

    return NextResponse.json({
      success: true,
      prediction: storedPrediction || mockPrediction
    })

  } catch (error: any) {
    console.error('[API] Prediction generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}