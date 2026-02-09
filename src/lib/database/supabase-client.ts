import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client (for use in browser components)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to create a new client instance
export const createBrowserClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey)
}

// Database types
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          subscription_tier: string
          subscription_status: string
          has_parlay_addon: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          daily_simulation_count: number
          daily_simulation_limit: number
          monthly_simulation_count: number
          monthly_simulation_rollover: number
          last_simulation_reset: string
          reset_timezone: string
          preferred_sports: string[]
          verified_state: string | null
          ip_address: string | null
          location_verified_at: string | null
          last_login_at: string | null
          login_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          subscription_tier?: string
          subscription_status?: string
          has_parlay_addon?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          daily_simulation_count?: number
          daily_simulation_limit?: number
          monthly_simulation_count?: number
          monthly_simulation_rollover?: number
          last_simulation_reset?: string
          reset_timezone?: string
          preferred_sports?: string[]
          verified_state?: string | null
          ip_address?: string | null
          location_verified_at?: string | null
          last_login_at?: string | null
          login_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          subscription_tier?: string
          subscription_status?: string
          has_parlay_addon?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          daily_simulation_count?: number
          daily_simulation_limit?: number
          monthly_simulation_count?: number
          monthly_simulation_rollover?: number
          last_simulation_reset?: string
          reset_timezone?: string
          preferred_sports?: string[]
          verified_state?: string | null
          ip_address?: string | null
          location_verified_at?: string | null
          last_login_at?: string | null
          login_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      sports_events: {
        Row: {
          id: string
          external_event_id: string
          sport_key: string
          sport_title: string
          commence_time: string
          home_team: string
          away_team: string
          odds_data: any
          event_status: string
          final_score: any | null
          last_odds_update: string
          created_at: string
          updated_at: string
        }
      }
      ai_predictions: {
        Row: {
          id: string
          event_id: string
          prediction_type: string
          requested_by: string | null
          model_version: string
          prompt_version_id: string | null
          predicted_winner: string | null
          confidence_score: number
          edge_score: number
          recommended_bet_type: string
          recommended_line: any
          ai_analysis: string
          key_factors: any
          risk_assessment: string
          odds_snapshot: any
          actual_winner: string | null
          actual_score: any | null
          was_correct: boolean | null
          user_feedback: string | null
          user_feedback_note: string | null
          feedback_at: string | null
          admin_marked_bad: boolean
          admin_reason: string | null
          admin_marked_by: string | null
          admin_marked_at: string | null
          created_at: string
          resolved_at: string | null
        }
      }
    }
  }
}