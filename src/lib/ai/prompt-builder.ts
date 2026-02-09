/**
 * Build complete prompt from template and context
 */
export function buildPrompt(
  promptTemplate: any,
  context: any,
  learningInsights?: string
): string {
  let prompt = promptTemplate.system_instructions + '\n\n'
  
  // Add learning insights if available
  if (learningInsights) {
    prompt = prompt.replace('{learning_insights}', learningInsights)
  }
  
  // Add prompt template with variables replaced
  prompt += promptTemplate.prompt_template
  
  // Replace all variables in template
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{${key}}`
    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
    prompt = prompt.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), valueStr)
  }
  
  return prompt
}

/**
 * NFL-specific prompt template
 */
export const NFL_MONEYLINE_PROMPT = {
  sport_type: 'nfl',
  bet_type: 'moneyline',
  system_instructions: `You are an elite NFL betting analyst. Only recommend bets with >65% confidence and positive edge (>2% expected value).`,
  prompt_template: `
Analyze this NFL game for moneyline betting opportunities.

## Game Details
Home Team: {home_team}
Away Team: {away_team}
Game Time: {commence_time}

## Current Betting Lines
{betting_lines}

## Your Task
Provide your analysis in this EXACT format:

### PREDICTION
[State: "HOME", "AWAY", or "NO BET"]

### CONFIDENCE LEVEL
[Score 0-100. Only recommend if >65]

### TRUE PROBABILITY ESTIMATE
[Your calculated probability: XX.X%]

### EDGE CALCULATION
Show your math for expected value calculation

### RECOMMENDED BET
[Format: "Team Name Moneyline at odds" or "NO BET"]

### KEY FACTORS
- Factor 1 with specific evidence
- Factor 2 with numbers/stats
- Factor 3 with context

### DETAILED ANALYSIS
[2-3 paragraphs explaining your reasoning]

### RISK ASSESSMENT
[One sentence stating the primary risk]

IMPORTANT: If confidence is <65% or edge is <2%, recommend "NO BET"
  `.trim()
}

/**
 * NBA-specific prompt template
 */
export const NBA_SPREAD_PROMPT = {
  sport_type: 'nba',
  bet_type: 'spread',
  system_instructions: `You are an elite NBA betting analyst. Only recommend bets with >65% confidence and positive edge (>2% expected value).`,
  prompt_template: `
Analyze this NBA game for spread betting opportunities.

## Game Details
Home Team: {home_team}
Away Team: {away_team}
Game Time: {commence_time}
Spread: {spread}

## Current Betting Lines
{betting_lines}

## Your Task
Provide your analysis in this EXACT format:

### PREDICTION
[State which team will cover: "HOME", "AWAY", or "NO BET"]

### CONFIDENCE LEVEL
[Score 0-100. Only recommend if >65]

### TRUE PROBABILITY ESTIMATE
[Your calculated probability: XX.X%]

### EDGE CALCULATION
Show your math for expected value calculation

### RECOMMENDED BET
[Format: "Team Name +/- spread at odds" or "NO BET"]

### KEY FACTORS
- Factor 1 with specific evidence
- Factor 2 with numbers/stats
- Factor 3 with context

### DETAILED ANALYSIS
[2-3 paragraphs explaining your reasoning]

### RISK ASSESSMENT
[One sentence stating the primary risk]

IMPORTANT: If confidence is <65% or edge is <2%, recommend "NO BET"
  `.trim()
}

/**
 * Get appropriate prompt template based on sport and bet type
 */
export function getPromptTemplate(sport: string, betType: string) {
  // For now, return default templates
  // Later these will be fetched from database
  
  if (sport === 'nfl' && betType === 'moneyline') {
    return NFL_MONEYLINE_PROMPT
  }
  
  if (sport === 'nba' && betType === 'spread') {
    return NBA_SPREAD_PROMPT
  }
  
  // Default template
  return {
    sport_type: sport,
    bet_type: betType,
    system_instructions: `You are an elite sports betting analyst. Only recommend bets with >65% confidence and positive edge (>2% expected value).`,
    prompt_template: `
Analyze this ${sport.toUpperCase()} game for ${betType} betting opportunities.

## Game Details
{game_details}

## Current Betting Lines
{betting_lines}

Provide analysis with >65% confidence and >2% edge, or recommend "NO BET".
    `.trim()
  }
}