/**
 * Calculate edge score (expected value)
 * Edge = (True Probability × Decimal Odds) - 1
 */
export function calculateEdgeScore(
  trueProbability: number,
  americanOdds: number
): number {
  const decimalOdds = americanToDecimal(americanOdds)
  const edge = (trueProbability / 100 * decimalOdds) - 1
  
  return edge * 100  // Convert to percentage
}

/**
 * Convert American odds to Decimal odds
 */
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1
  } else {
    return (100 / Math.abs(americanOdds)) + 1
  }
}

/**
 * Convert Decimal odds to American odds
 */
export function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2.0) {
    return Math.round((decimalOdds - 1) * 100)
  } else {
    return Math.round(-100 / (decimalOdds - 1))
  }
}

/**
 * Calculate implied probability from American odds
 */
export function calculateImpliedProbability(americanOdds: number): number {
  if (americanOdds > 0) {
    return (100 / (americanOdds + 100)) * 100
  } else {
    return (Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)) * 100
  }
}

/**
 * Calculate expected value for a bet
 * EV = (Win Probability × Win Amount) - (Loss Probability × Stake)
 */
export function calculateExpectedValue(
  winProbability: number,  // 0-100
  americanOdds: number,
  stake: number = 100
): number {
  const decimalOdds = americanToDecimal(americanOdds)
  const winAmount = stake * (decimalOdds - 1)
  const lossProbability = 100 - winProbability
  
  const ev = (winProbability / 100 * winAmount) - (lossProbability / 100 * stake)
  
  return ev
}

/**
 * Calculate ROI (Return on Investment) percentage
 */
export function calculateROI(
  expectedValue: number,
  stake: number = 100
): number {
  return (expectedValue / stake) * 100
}

/**
 * Find the best odds from multiple bookmakers
 */
export function findBestOdds(bookmakers: any[]): {
  bookmaker: string
  odds: number
  impliedProb: number
} | null {
  if (!bookmakers || bookmakers.length === 0) return null
  
  let bestOdds = -Infinity
  let bestBookmaker = ''
  
  for (const bookmaker of bookmakers) {
    const odds = bookmaker.price || bookmaker.odds
    if (odds > bestOdds) {
      bestOdds = odds
      bestBookmaker = bookmaker.bookmaker || bookmaker.key
    }
  }
  
  return {
    bookmaker: bestBookmaker,
    odds: bestOdds,
    impliedProb: calculateImpliedProbability(bestOdds)
  }
}

/**
 * Calculate fair odds (true odds with no vig)
 */
export function calculateFairOdds(trueProbability: number): number {
  const decimalOdds = 100 / trueProbability
  return decimalToAmerican(decimalOdds)
}

/**
 * Calculate the vig (bookmaker's commission)
 */
export function calculateVig(homeOdds: number, awayOdds: number): number {
  const homeProb = calculateImpliedProbability(homeOdds)
  const awayProb = calculateImpliedProbability(awayOdds)
  const totalProb = homeProb + awayProb
  
  // Vig is the overround percentage
  return totalProb - 100
}

/**
 * Remove vig to get true probabilities
 */
export function removeVig(homeOdds: number, awayOdds: number): {
  homeProb: number
  awayProb: number
} {
  const homeImplied = calculateImpliedProbability(homeOdds)
  const awayImplied = calculateImpliedProbability(awayOdds)
  const totalImplied = homeImplied + awayImplied
  
  return {
    homeProb: (homeImplied / totalImplied) * 100,
    awayProb: (awayImplied / totalImplied) * 100
  }
}