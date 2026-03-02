export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          default_household_id: string | null
          preferences: Json
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          default_household_id?: string | null
          preferences?: Json
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          avatar_url?: string | null
          default_household_id?: string | null
          preferences?: Json
          created_at?: string
        }
      }
      households: {
        Row: {
          id: string
          name: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_by?: string
          created_at?: string
        }
      }
      household_members: {
        Row: {
          id: string
          household_id: string
          profile_id: string
          role: string
          display_name: string | null
          joined_at: string
          invited_by: string | null
        }
        Insert: {
          id?: string
          household_id: string
          profile_id: string
          role?: string
          display_name?: string | null
          joined_at?: string
          invited_by?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          profile_id?: string
          role?: string
          display_name?: string | null
          joined_at?: string
          invited_by?: string | null
        }
      }
      household_managed_members: {
        Row: {
          id: string
          household_id: string
          display_name: string
          avatar_url: string | null
          created_by: string
          linked_profile_id: string | null
        }
        Insert: {
          id?: string
          household_id: string
          display_name: string
          avatar_url?: string | null
          created_by: string
          linked_profile_id?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          display_name?: string
          avatar_url?: string | null
          created_by?: string
          linked_profile_id?: string | null
        }
      }
      household_invites: {
        Row: {
          id: string
          household_id: string
          email: string | null
          invite_code: string
          role: string
          expires_at: string
          accepted_at: string | null
          created_by: string
        }
        Insert: {
          id?: string
          household_id: string
          email?: string | null
          invite_code: string
          role?: string
          expires_at?: string
          accepted_at?: string | null
          created_by: string
        }
        Update: {
          id?: string
          household_id?: string
          email?: string | null
          invite_code?: string
          role?: string
          expires_at?: string
          accepted_at?: string | null
          created_by?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
