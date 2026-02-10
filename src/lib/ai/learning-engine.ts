import { supabaseAdmin } from '@/lib/database/supabase-admin'

interface LearningData {
  predictionId: string
  sport: string
  betType: string
  confidenceScore: number
  edgeScore: number
  wasCorrect: boolean
  factors: string[]
  userFeedback?: 'accurate' | 'inaccurate' | 'helpful' | 'not_helpful'
  adminFlagged: boolean
  adminReason?: string
}

/**
 * Process prediction outcome and create learning data
 */
export async function processPredictionOutcome(
  predictionId: string,
  gameResult: {
    winner: 'home' | 'away'
    homeScore: number
    awayScore: number
  }
) {
  try {
    // Get prediction
    const { data: prediction } = await supabaseAdmin
      .from('ai_predictions')
      .select('*')
      .eq('id', predictionId)
      .single()

    if (!prediction) {
      console.error('[Learning] Prediction not found:', predictionId)
      return
    }

    // Determine if correct
    const wasCorrect = evaluatePrediction(prediction, gameResult)

    // Update prediction with result
    await supabaseAdmin
      .from('ai_predictions')
      .update({
        actual_winner: gameResult.winner,
        actual_score: {
          home: gameResult.homeScore,
          away: gameResult.awayScore
        },
        was_correct: wasCorrect,
        resolved_at: new Date().toISOString()
      })
      .eq('id', predictionId)

    // Create learning data entry
    await createLearningDataEntry(prediction, gameResult, wasCorrect)

    console.log('[Learning] Processed outcome for prediction:', predictionId)
  } catch (error) {
    console.error('[Learning] Error processing outcome:', error)
  }
}

/**
 * Evaluate if prediction was correct
 */
function evaluatePrediction(prediction: any, gameResult: any): boolean {
  if (prediction.recommended_bet_type === 'moneyline') {
    return prediction.predicted_winner === gameResult.winner
  }

  if (prediction.recommended_bet_type === 'spread') {
    // Extract spread value from recommended_line
    // Implementation depends on format
    return false // Placeholder
  }

  if (prediction.recommended_bet_type === 'total') {
    // Compare total points vs line
    return false // Placeholder
  }

  return false
}

/**
 * Create learning data entry
 */
async function createLearningDataEntry(
  prediction: any,
  gameResult: any,
  wasCorrect: boolean
) {
  const learningData = {
    prediction_id: prediction.id,
    sport_type: prediction.event?.sport_key || 'unknown',
    bet_type: prediction.recommended_bet_type,
    model_version: prediction.model_version,

    confidence_vs_outcome: {
      predicted_confidence: prediction.confidence_score,
      was_correct: wasCorrect,
      actual_confidence: wasCorrect ? prediction.confidence_score : (100 - prediction.confidence_score)
    },

    edge_vs_outcome: {
      predicted_edge: prediction.edge_score,
      actual_edge: calculateActualEdge(prediction, gameResult)
    },

    factors_vs_outcome: {
      factors: prediction.key_factors,
      relevance: {} // Would analyze which factors were predictive
    },

    training_weight: calculateTrainingWeight(prediction, wasCorrect)
  }

  await supabaseAdmin
    .from('ai_learning_data')
    .insert(learningData)
}

/**
 * Calculate actual edge that was realized
 */
function calculateActualEdge(prediction: any, gameResult: any): number {
  // Simplified calculation
  // In production, compare actual odds vs outcome
  return prediction.edge_score
}

/**
 * Calculate training weight for this prediction
 */
function calculateTrainingWeight(prediction: any, wasCorrect: boolean): number {
  let weight = 1.0

  // Higher weight for high-confidence predictions that were wrong
  if (!wasCorrect && prediction.confidence_score > 80) {
    weight *= 1.5
  }

  // Higher weight if admin flagged
  if (prediction.admin_marked_bad) {
    weight *= 1.8
  }

  // Higher weight for recent predictions
  const daysSince = (Date.now() - new Date(prediction.created_at).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince < 30) {
    weight *= 1.2
  }

  return weight
}

/**
 * Generate learning insights from historical data
 */
export async function generateLearningInsights(sport: string, betType: string) {
  const { data: learningData } = await supabaseAdmin
    .from('ai_learning_data')
    .select('*')
    .eq('sport_type', sport)
    .eq('bet_type', betType)
    .eq('used_for_training', false)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (!learningData || learningData.length < 50) {
    return {
      message: 'Insufficient data for learning insights',
      sampleSize: learningData?.length || 0
    }
  }

  // Calculate metrics
  const totalPredictions = learningData.length
  const correctPredictions = learningData.filter(d =>
    d.confidence_vs_outcome?.was_correct === true
  ).length

  const winRate = (correctPredictions / totalPredictions) * 100

  // Analyze confidence calibration
  const confidenceBuckets = calculateConfidenceBuckets(learningData)

  // Analyze factor performance
  const factorAnalysis = analyzeFactorPerformance(learningData)

  // Generate insights text
  const insights = formatLearningInsights({
    sport,
    betType,
    winRate,
    sampleSize: totalPredictions,
    confidenceBuckets,
    topFactors: factorAnalysis.top,
    overvaluedFactors: factorAnalysis.overvalued
  })

  return insights
}

/**
 * Calculate confidence bucket accuracy
 */
function calculateConfidenceBuckets(learningData: any[]) {
  const buckets: { [key: string]: { predictions: number, wins: number } } = {
    '65-70': { predictions: 0, wins: 0 },
    '70-75': { predictions: 0, wins: 0 },
    '75-80': { predictions: 0, wins: 0 },
    '80-85': { predictions: 0, wins: 0 },
    '85-90': { predictions: 0, wins: 0 },
    '90-95': { predictions: 0, wins: 0 },
    '95-100': { predictions: 0, wins: 0 }
  }

  for (const data of learningData) {
    const confidence = data.confidence_vs_outcome?.predicted_confidence
    if (!confidence) continue

    let bucket: string
    if (confidence >= 95) bucket = '95-100'
    else if (confidence >= 90) bucket = '90-95'
    else if (confidence >= 85) bucket = '85-90'
    else if (confidence >= 80) bucket = '80-85'
    else if (confidence >= 75) bucket = '75-80'
    else if (confidence >= 70) bucket = '70-75'
    else bucket = '65-70'

    buckets[bucket].predictions++
    if (data.confidence_vs_outcome?.was_correct) {
      buckets[bucket].wins++
    }
  }

  // Calculate win rates
  const result: { [key: string]: number } = {}
  for (const [bucket, data] of Object.entries(buckets)) {
    result[bucket] = data.predictions > 0
      ? (data.wins / data.predictions) * 100
      : 0
  }

  return result
}

/**
 * Analyze which factors are most predictive
 */
function analyzeFactorPerformance(learningData: any[]) {
  const factorStats: {
    [factor: string]: { uses: number, wins: number }
  } = {}

  for (const data of learningData) {
    const factors = data.factors_vs_outcome?.factors || []
    const wasCorrect = data.confidence_vs_outcome?.was_correct

    for (const factor of factors) {
      if (!factorStats[factor]) {
        factorStats[factor] = { uses: 0, wins: 0 }
      }
      factorStats[factor].uses++
      if (wasCorrect) {
        factorStats[factor].wins++
      }
    }
  }

  // Calculate win rates for each factor
  const factorsWithRates = Object.entries(factorStats)
    .map(([factor, stats]) => ({
      factor,
      uses: stats.uses,
      winRate: (stats.wins / stats.uses) * 100
    }))
    .filter(f => f.uses >= 10)  // Only factors used 10+ times

  // Sort by win rate
  factorsWithRates.sort((a, b) => b.winRate - a.winRate)

  const avgWinRate = factorsWithRates.reduce((sum, f) => sum + f.winRate, 0) / factorsWithRates.length

  return {
    top: factorsWithRates.slice(0, 5),  // Top 5 factors
    overvalued: factorsWithRates
      .filter(f => f.winRate < avgWinRate - 5)
      .slice(0, 3)
  }
}

/**
 * Format learning insights as text
 */
function formatLearningInsights(insights: any): string {
  let text = `
LEARNING INSIGHTS FOR ${insights.sport.toUpperCase()} ${insights.betType.toUpperCase()}
Sample Size: ${insights.sampleSize} predictions | Win Rate: ${insights.winRate.toFixed(1)}%

CONFIDENCE CALIBRATION:
`

  for (const [bucket, rate] of Object.entries(insights.confidenceBuckets)) {
    const [min, max] = bucket.split('-').map(Number)
    const midpoint = (min + max) / 2
    const diff = Math.abs((rate as number) - midpoint)

    if (diff < 3) {
      text += `✓ ${bucket}% confidence → ${(rate as number).toFixed(1)}% actual (well calibrated)\n`
    } else if ((rate as number) < midpoint) {
      text += `⚠ ${bucket}% confidence → ${(rate as number).toFixed(1)}% actual (overconfident)\n`
    }
  }

  if (insights.topFactors.length > 0) {
    text += `\nTOP PREDICTIVE FACTORS:\n`
    insights.topFactors.forEach((f: any, i: number) => {
      text += `${i + 1}. "${f.factor}" → ${f.winRate.toFixed(1)}% win rate\n`
    })
  }

  if (insights.overvaluedFactors.length > 0) {
    text += `\nOVERVALUED FACTORS (Use Less):\n`
    insights.overvaluedFactors.forEach((f: any) => {
      text += `- "${f.factor}" → Only ${f.winRate.toFixed(1)}% win rate\n`
    })
  }

  return text
}

/**
 * Mark prediction as bad (admin function)
 */
export async function markPredictionBad(
  predictionId: string,
  adminId: string,
  reason: string,
  categories: string[]
) {
  try {
    await supabaseAdmin
      .from('ai_predictions')
      .update({
        admin_marked_bad: true,
        admin_reason: reason,
        admin_marked_by: adminId,
        admin_marked_at: new Date().toISOString()
      })
      .eq('id', predictionId)

    // Log admin action
    await supabaseAdmin
      .from('admin_logs')
      .insert({
        admin_id: adminId,
        action: 'mark_prediction_bad',
        target_type: 'prediction',
        target_id: predictionId,
        details: { reason, categories }
      })

    console.log('[Learning] Prediction marked as bad:', predictionId)
  } catch (error) {
    console.error('[Learning] Error marking prediction:', error)
    throw error
  }
}