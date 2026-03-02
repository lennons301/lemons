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
        Relationships: [
          {
            foreignKeyName: "profiles_default_household_fk"
            columns: ["default_household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "households_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "household_managed_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_managed_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_managed_members_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
