/**
 * Parse AI response into structured prediction
 */
export function parseAIResponse(response: string, betType: string): any {
  const sections = extractSections(response)
  
  return {
    predictedWinner: parseWinner(sections.prediction || ''),
    confidenceScore: parseConfidence(sections.confidence_level || ''),
    trueProbability: parseTrueProbability(sections.true_probability_estimate || ''),
    recommendedBetType: betType,
    recommendedLine: sections.recommended_bet || '',
    keyFactors: parseFactors(sections.key_factors || ''),
    aiAnalysis: sections.detailed_analysis || '',
    riskAssessment: sections.risk_assessment || ''
  }
}

function extractSections(response: string): any {
  const sections: any = {}
  
  // Split by ### headers - use [\s\S] instead of . with /s flag for compatibility
  const sectionRegex = /###\s*([A-Z\s]+)\n([\s\S]*?)(?=###|$)/g
  let match
  
  while ((match = sectionRegex.exec(response)) !== null) {
    const sectionName = match[1].trim().toLowerCase().replace(/\s+/g, '_')
    const sectionContent = match[2].trim()
    sections[sectionName] = sectionContent
  }
  
  return sections
}

function parseWinner(predictionText: string): string | null {
  if (predictionText.includes('NO BET')) return null
  if (predictionText.includes('HOME')) return 'home'
  if (predictionText.includes('AWAY')) return 'away'
  if (predictionText.includes('OVER')) return 'over'
  if (predictionText.includes('UNDER')) return 'under'
  return null
}

function parseConfidence(confidenceText: string): number {
  const match = confidenceText.match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function parseTrueProbability(probabilityText: string): number {
  const match = probabilityText.match(/(\d+\.?\d*)/)
  return match ? parseFloat(match[1]) : 0
}

function parseFactors(factorsText: string): string[] {
  return factorsText
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean)
}

/**
 * Parse edge calculation from response
 */
export function parseEdgeCalculation(response: string): number {
  const edgeRegex = /Edge Score:\s*([+-]?\d+\.?\d*)%/i
  const match = response.match(edgeRegex)
  return match ? parseFloat(match[1]) : 0
}

/**
 * Validate parsed prediction has minimum required fields
 */
export function validateParsedPrediction(prediction: any): boolean {
  return !!(
    prediction.confidenceScore &&
    prediction.confidenceScore > 0 &&
    prediction.aiAnalysis &&
    prediction.keyFactors &&
    prediction.keyFactors.length > 0
  )
}