import { z } from 'zod'

/**
 * Registration form validation
 */
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  state: z.string().length(2, 'Please select a state'),
  ageVerified: z.boolean().refine(val => val === true, {
    message: 'You must be 18+ to use this service'
  }),
  preferredSports: z.array(z.string()).min(1, 'Select at least one sport')
})

export type RegisterInput = z.infer<typeof registerSchema>

/**
 * Login form validation
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * Simulation request validation
 */
export const simulationSchema = z.object({
  eventId: z.string().uuid('Invalid event ID'),
  sport: z.enum(['nfl', 'nba', 'ncaaf', 'ncaab', 'mlb', 'nhl']),
  betType: z.enum(['moneyline', 'spread', 'total', 'parlay'])
})

export type SimulationInput = z.infer<typeof simulationSchema>

/**
 * Promo code validation
 */
export const promoCodeSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters').max(50)
})

export type PromoCodeInput = z.infer<typeof promoCodeSchema>

/**
 * Profile update validation
 */
export const profileUpdateSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').optional(),
  preferredSports: z.array(z.string()).min(1, 'Select at least one sport')
})

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

/**
 * Admin prediction marking validation
 */
export const markPredictionSchema = z.object({
  predictionId: z.string().uuid('Invalid prediction ID'),
  reason: z.string().min(10, 'Please provide a detailed reason'),
  categories: z.array(z.enum([
    'overconfident',
    'missed_injury',
    'weather_factor',
    'poor_matchup_analysis',
    'line_movement_misread',
    'other'
  ]))
})

export type MarkPredictionInput = z.infer<typeof markPredictionSchema>

/**
 * Helper to validate and return errors
 */
export function validateData<T>(
  schema: z.Schema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  const errors = result.error.issues.map((err: z.ZodIssue) => 
    `${err.path.join('.')}: ${err.message}`
  )
  
  return { success: false, errors }
}