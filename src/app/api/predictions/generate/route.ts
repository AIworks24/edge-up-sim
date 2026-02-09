import { NextRequest, NextResponse } from 'next/server'
import { claudeAgent } from '@/lib/ai/claude-agent'

export async function POST(request: NextRequest) {
  try {
    const { eventId, sport, betType, userId } = await request.json()

    const prediction = await claudeAgent.generatePrediction({
      eventId,
      sport,
      betType,
      userId,
      isHotPick: false
    })

    return NextResponse.json(prediction)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}