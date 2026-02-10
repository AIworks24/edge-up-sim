import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { isAfter, startOfDay } from 'date-fns'

/**
 * Get user's current time in their timezone
 */
export function getUserTime(timezone: string): Date {
  return toZonedTime(new Date(), timezone)
}

/**
 * Get user's midnight (start of day) in their timezone
 */
export function getUserMidnight(timezone: string, date?: Date): Date {
  const targetDate = date || new Date()
  const zonedDate = toZonedTime(targetDate, timezone)
  return startOfDay(zonedDate)
}

/**
 * Check if it's past midnight in user's timezone since last reset
 */
export function shouldResetDaily(
  lastResetTime: Date,
  userTimezone: string
): boolean {
  const userMidnightToday = getUserMidnight(userTimezone)
  return isAfter(userMidnightToday, lastResetTime)
}

/**
 * Check if we're in a new month for the user
 */
export function shouldResetMonthly(
  lastResetTime: Date,
  userTimezone: string
): boolean {
  const lastResetZoned = toZonedTime(lastResetTime, userTimezone)
  const nowZoned = toZonedTime(new Date(), userTimezone)
  
  return (
    lastResetZoned.getMonth() !== nowZoned.getMonth() ||
    lastResetZoned.getFullYear() !== nowZoned.getFullYear()
  )
}

/**
 * Format date for display in user's timezone
 */
export function formatUserDate(
  date: Date,
  timezone: string,
  format: string = 'MMM d, yyyy h:mm a'
): string {
  return formatInTimeZone(date, timezone, format)
}

/**
 * Calculate rollover simulations
 * Unused sims from today get added to rollover, capped at 3x daily limit
 */
export function calculateRollover(
  dailyLimit: number,
  dailyUsed: number,
  currentRollover: number
): number {
  const unusedToday = Math.max(0, dailyLimit - dailyUsed)
  const newRollover = currentRollover + unusedToday
  const maxRollover = dailyLimit * 3
  
  return Math.min(newRollover, maxRollover)
}

/**
 * Get available simulations (daily + rollover)
 */
export function getAvailableSimulations(
  dailyLimit: number,
  dailyUsed: number,
  rollover: number
): number {
  const remainingDaily = Math.max(0, dailyLimit - dailyUsed)
  return remainingDaily + rollover
}

/**
 * Deduct simulation from available pool
 * Returns: { success: boolean, newDailyUsed: number, newRollover: number }
 */
export function deductSimulation(
  dailyLimit: number,
  dailyUsed: number,
  rollover: number
): { success: boolean; newDailyUsed: number; newRollover: number } {
  // Check if user has any sims available
  const available = getAvailableSimulations(dailyLimit, dailyUsed, rollover)
  
  if (available <= 0) {
    return { success: false, newDailyUsed: dailyUsed, newRollover: rollover }
  }

  // Use daily allowance first
  if (dailyUsed < dailyLimit) {
    return {
      success: true,
      newDailyUsed: dailyUsed + 1,
      newRollover: rollover
    }
  }

  // Use rollover
  return {
    success: true,
    newDailyUsed: dailyUsed,
    newRollover: rollover - 1
  }
}

/**
 * Common US timezones mapping
 */
export const US_TIMEZONES = {
  'ET': 'America/New_York',
  'CT': 'America/Chicago',
  'MT': 'America/Denver',
  'PT': 'America/Los_Angeles',
  'AKT': 'America/Anchorage',
  'HT': 'Pacific/Honolulu'
}

/**
 * Detect timezone from browser
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'America/New_York' // Default fallback
  }
}