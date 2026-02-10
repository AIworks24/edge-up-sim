import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/database/supabase-admin'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

export interface PredictionInput {
  eventId: string
  sport: string
  betType: 'moneyline' | 'spread' | 'total'
  userId?: string
  isHotPick?: boolean
}

export interface PredictionOutput {
  predictionId: string
  predictedWinner: string | null
  confidenceScore: number
  edgeScore: number
  recommendedBetType: string
  recommendedLine: any
  aiAnalysis: string
  keyFactors: string[]
  riskAssessment: string
  modelVersion: string
}

class ClaudeAgent {
  private model = 'claude-sonnet-4-20250514'

  async generatePrediction(input: PredictionInput): Promise<PredictionOutput> {
    try {
      // 1. Fetch event data
      const event = await this.getEventData(input.eventId)
      
      // 2. Get active prompt for this sport/bet type
      const prompt = await this.getActivePrompt(input.sport, input.betType)
      
      // 3. Build context with all necessary data
      const context = this.buildPredictionContext(event, input.sport, input.betType)
      
      // 4. Build final prompt
      const fullPrompt = this.buildPrompt(prompt, context)
      
      // 5. Call Claude API
      const claudeResponse = await this.callClaude(fullPrompt)
      
      // 6. Parse response
      const parsed = this.parseAIResponse(claudeResponse, input.betType)
      
      // 7. Calculate edge score
      const edgeScore = this.calculateEdgeScore(
        parsed.trueProbability,
        context.odds
      )
      
      // 8. Validate prediction meets thresholds
      const validated = this.validatePrediction(parsed, edgeScore)
      
      // 9. Store prediction in database
      const stored = await this.storePrediction({
        event_id: input.eventId,
        prediction_type: input.isHotPick ? 'hot_pick' : 'user_simulation',
        requested_by: input.userId,
        model_version: this.model,
        predicted_winner: validated.predictedWinner,
        confidence_score: validated.confidenceScore,
        edge_score: edgeScore,
        recommended_bet_type: input.betType,
        recommended_line: validated.recommendedLine,
        ai_analysis: validated.aiAnalysis,
        key_factors: validated.keyFactors,
        risk_assessment: validated.riskAssessment,
        odds_snapshot: context.odds
      })
      
      return {
        predictionId: stored.id,
        ...validated,
        edgeScore,
        modelVersion: this.model
      }
      
    } catch (error) {
      console.error('Error generating prediction:', error)
      throw error
    }
  }

  private async getEventData(eventId: string) {
    const { data: event, error } = await supabaseAdmin
      .from('sports_events')
      .select('*')
      .eq('id', eventId)
      .single()
    
    if (error || !event) {
      throw new Error(`Event not found: ${eventId}`)
    }
    
    return event
  }

  private async getActivePrompt(sport: string, betType: string) {
    // For now, return a default prompt structure
    // Later we'll store these in the database
    return {
      id: 'default',
      sport_type: sport,
      bet_type: betType,
      system_instructions: `You are an elite sports betting analyst. Only recommend bets with >65% confidence and positive edge (>2% expected value).`,
      prompt_template: this.getDefaultPromptTemplate(sport, betType)
    }
  }

  private getDefaultPromptTemplate(sport: string, betType: string): string {
    return `
Analyze this ${sport.toUpperCase()} game for ${betType} betting opportunities.

## Game Details
{game_details}

## Current Betting Lines
{betting_lines}

## Team Statistics
{team_stats}

## Your Task
Provide your analysis in this EXACT format:

### PREDICTION
[State: "HOME", "AWAY", or "NO BET"]

### CONFIDENCE LEVEL
[Score 0-100. Only recommend if >65]

### TRUE PROBABILITY ESTIMATE
[Your calculated probability: XX.X%]

### RECOMMENDED BET
[Format: "Team Name {betType} at {odds}" or "NO BET"]

### KEY FACTORS
[List 3-5 specific factors with evidence]

### DETAILED ANALYSIS
[2-3 paragraphs explaining your reasoning]

### RISK ASSESSMENT
[One sentence stating the primary risk]

IMPORTANT: If confidence is <65% or edge is <2%, recommend "NO BET"
    `.trim()
  }

  private buildPredictionContext(event: any, sport: string, betType: string) {
    const odds = JSON.parse(event.odds_data)
    
    return {
      event,
      odds,
      game_details: `
Home Team: ${event.home_team}
Away Team: ${event.away_team}
Game Time: ${event.commence_time}
Sport: ${sport}
      `.trim(),
      betting_lines: JSON.stringify(odds, null, 2),
      team_stats: 'Team statistics would be fetched here'
    }
  }

  private buildPrompt(prompt: any, context: any): string {
    let fullPrompt = prompt.system_instructions + '\n\n'
    fullPrompt += prompt.prompt_template
    
    // Replace variables
    for (const [key, value] of Object.entries(context)) {
      const placeholder = `{${key}}`
      fullPrompt = fullPrompt.replace(new RegExp(placeholder, 'g'), String(value))
    }
    
    return fullPrompt
  }

  private async callClaude(prompt: string): Promise<string> {
    const message = await anthropic.messages.create({
      model: this.model,
      max_tokens: 2500,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
    
    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('\n')
    
    return responseText
  }

  private parseAIResponse(response: string, betType: string): any {
    // Extract sections using regex
    const predictionMatch = response.match(/### PREDICTION\s*(.*?)(?=###|$)/s)
    const confidenceMatch = response.match(/### CONFIDENCE LEVEL\s*(.*?)(?=###|$)/s)
    const probabilityMatch = response.match(/### TRUE PROBABILITY ESTIMATE\s*(.*?)(?=###|$)/s)
    const betMatch = response.match(/### RECOMMENDED BET\s*(.*?)(?=###|$)/s)
    const factorsMatch = response.match(/### KEY FACTORS\s*(.*?)(?=###|$)/s)
    const analysisMatch = response.match(/### DETAILED ANALYSIS\s*(.*?)(?=###|$)/s)
    const riskMatch = response.match(/### RISK ASSESSMENT\s*(.*?)(?=###|$)/s)

    const prediction = predictionMatch ? predictionMatch[1].trim() : ''
    const confidenceText = confidenceMatch ? confidenceMatch[1].trim() : '0'
    const probabilityText = probabilityMatch ? probabilityMatch[1].trim() : '0'
    
    // Extract numeric values
    const confidenceScore = parseInt(confidenceText.match(/\d+/)?.[0] || '0')
    const trueProbability = parseFloat(probabilityText.match(/\d+\.?\d*/)?.[0] || '0')
    
    // Parse factors
    const factorsText = factorsMatch ? factorsMatch[1].trim() : ''
    const keyFactors = factorsText
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(Boolean)

    return {
      predictedWinner: prediction.includes('NO BET') ? null : (prediction.includes('HOME') ? 'home' : 'away'),
      confidenceScore,
      trueProbability,
      recommendedLine: betMatch ? betMatch[1].trim() : 'NO BET',
      keyFactors,
      aiAnalysis: analysisMatch ? analysisMatch[1].trim() : '',
      riskAssessment: riskMatch ? riskMatch[1].trim() : ''
    }
  }

  private calculateEdgeScore(trueProbability: number, odds: any): number {
    // Simplified edge calculation
    // In production, use actual odds from the event
    const impliedProb = 50 // Placeholder
    const edge = trueProbability - impliedProb
    return edge
  }

  private validatePrediction(parsed: any, edgeScore: number) {
    let recommended = true
    
    if (parsed.confidenceScore < 65) {
      recommended = false
      parsed.predictedWinner = null
      parsed.recommendedLine = 'NO BET - Confidence below 65% threshold'
    }
    
    if (edgeScore < 2.0) {
      recommended = false
      parsed.predictedWinner = null
      parsed.recommendedLine = 'NO BET - Edge below 2% threshold'
    }
    
    return {
      ...parsed,
      recommended
    }
  }

  private async storePrediction(data: any) {
    const { data: stored, error } = await supabaseAdmin
      .from('ai_predictions')
      .insert(data)
      .select()
      .single()
    
    if (error) throw error
    
    return stored
  }
}

// Export singleton
export const claudeAgent = new ClaudeAgent()