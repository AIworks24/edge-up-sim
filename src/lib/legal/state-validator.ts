const LEGAL_STATES = [
  'AZ', 'CO', 'CT', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 
  'MD', 'MA', 'MI', 'MO', 'NJ', 'NY', 'NC', 'OH', 'PA', 'TN', 
  'VT', 'VA', 'WV', 'WY'
]

export function isLegalState(stateCode: string): boolean {
  return LEGAL_STATES.includes(stateCode.toUpperCase())
}

export function getLegalStates() {
  return LEGAL_STATES
}

// IP-based geolocation (free tier)
export async function getStateFromIP(ipAddress: string): Promise<string | null> {
  try {
    // Using ipapi.co free tier
    const response = await fetch(`https://ipapi.co/${ipAddress}/json/`)
    const data = await response.json()
    return data.region_code || null
  } catch (error) {
    console.error('Geolocation error:', error)
    return null
  }
}