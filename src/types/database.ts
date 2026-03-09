export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      household_invites: {
        Row: {
          accepted_at: string | null
          created_by: string
          email: string | null
          expires_at: string
          household_id: string
          id: string
          invite_code: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          created_by: string
          email?: string | null
          expires_at?: string
          household_id: string
          id?: string
          invite_code: string
          role?: string
        }
        Update: {
          accepted_at?: string | null
          created_by?: string
          email?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          invite_code?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_managed_members: {
        Row: {
          avatar_url: string | null
          created_by: string
          date_of_birth: string | null
          display_name: string
          household_id: string
          id: string
          linked_profile_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_by: string
          date_of_birth?: string | null
          display_name: string
          household_id: string
          id?: string
          linked_profile_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_by?: string
          date_of_birth?: string | null
          display_name?: string
          household_id?: string
          id?: string
          linked_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_managed_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_managed_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
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
      household_members: {
        Row: {
          display_name: string | null
          household_id: string
          id: string
          invited_by: string | null
          joined_at: string
          profile_id: string
          role: string
        }
        Insert: {
          display_name?: string | null
          household_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          profile_id: string
          role?: string
        }
        Update: {
          display_name?: string | null
          household_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          profile_id?: string
          role?: string
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
            foreignKeyName: "household_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          anthropic_api_key: string | null
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          anthropic_api_key?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          anthropic_api_key?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_household_id: string | null
          display_name: string | null
          email: string
          id: string
          preferences: Json | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_household_id?: string | null
          display_name?: string | null
          email: string
          id: string
          preferences?: Json | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_household_id?: string | null
          display_name?: string | null
          email?: string
          id?: string
          preferences?: Json | null
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
      recipe_images: {
        Row: {
          id: string
          recipe_id: string
          url: string
          type: string
          sort_order: number
        }
        Insert: {
          id?: string
          recipe_id: string
          url: string
          type?: string
          sort_order?: number
        }
        Update: {
          id?: string
          recipe_id?: string
          url?: string
          type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_images_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          recipe_id: string
          raw_text: string
          quantity: number | null
          unit: string | null
          name: string | null
          group: string | null
          optional: boolean
          notes: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          recipe_id: string
          raw_text: string
          quantity?: number | null
          unit?: string | null
          name?: string | null
          group?: string | null
          optional?: boolean
          notes?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          recipe_id?: string
          raw_text?: string
          quantity?: number | null
          unit?: string | null
          name?: string | null
          group?: string | null
          optional?: boolean
          notes?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_members: {
        Row: {
          created_at: string
          person_id: string
          recipe_id: string
        }
        Insert: {
          created_at?: string
          person_id: string
          recipe_id: string
        }
        Update: {
          created_at?: string
          person_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_members_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_tags: {
        Row: {
          id: string
          recipe_id: string
          tag_name: string
        }
        Insert: {
          id?: string
          recipe_id: string
          tag_name: string
        }
        Update: {
          id?: string
          recipe_id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          id: string
          household_id: string
          date: string
          meal_type: string
          recipe_id: string | null
          custom_name: string | null
          servings: number
          assigned_to: string[]
          created_by: string
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          date: string
          meal_type: string
          recipe_id?: string | null
          custom_name?: string | null
          servings?: number
          assigned_to?: string[]
          created_by: string
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          date?: string
          meal_type?: string
          recipe_id?: string | null
          custom_name?: string | null
          servings?: number
          assigned_to?: string[]
          created_by?: string
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_lists: {
        Row: {
          id: string
          household_id: string
          title: string
          list_type: string
          created_by: string
          color: string | null
          pinned: boolean
          archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          title: string
          list_type?: string
          created_by: string
          color?: string | null
          pinned?: boolean
          archived?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          title?: string
          list_type?: string
          created_by?: string
          color?: string | null
          pinned?: boolean
          archived?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_items: {
        Row: {
          id: string
          list_id: string
          title: string
          description: string | null
          status: string
          priority: string
          due_date: string | null
          assigned_to: string | null
          created_by: string
          sort_order: number
          parent_item_id: string | null
          recurrence_rule: string | null
          completed_at: string | null
          quantity: number | null
          unit: string | null
          tags: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          list_id: string
          title: string
          description?: string | null
          status?: string
          priority?: string
          due_date?: string | null
          assigned_to?: string | null
          created_by: string
          sort_order?: number
          parent_item_id?: string | null
          recurrence_rule?: string | null
          completed_at?: string | null
          quantity?: number | null
          unit?: string | null
          tags?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          list_id?: string
          title?: string
          description?: string | null
          status?: string
          priority?: string
          due_date?: string | null
          assigned_to?: string | null
          created_by?: string
          sort_order?: number
          parent_item_id?: string | null
          recurrence_rule?: string | null
          completed_at?: string | null
          quantity?: number | null
          unit?: string | null
          tags?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "todo_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "todo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      household_staples: {
        Row: {
          id: string
          household_id: string
          name: string
          default_quantity: number | null
          default_unit: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          default_quantity?: number | null
          default_unit?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          default_quantity?: number | null
          default_unit?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_staples_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          id: string
          title: string
          description: string | null
          servings: number
          prep_time: number | null
          cook_time: number | null
          instructions: Json
          source_url: string | null
          household_id: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          servings?: number
          prep_time?: number | null
          cook_time?: number | null
          instructions?: Json
          source_url?: string | null
          household_id: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          servings?: number
          prep_time?: number | null
          cook_time?: number | null
          instructions?: Json
          source_url?: string | null
          household_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      household_persons: {
        Row: {
          id: string
          household_id: string
          profile_id: string | null
          display_name: string | null
          date_of_birth: string | null
          person_type: string
        }
        Relationships: []
      }
    }
    Functions: {
      age_category: { Args: { dob: string }; Returns: string }
      get_my_admin_household_ids: { Args: never; Returns: string[] }
      get_my_household_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
