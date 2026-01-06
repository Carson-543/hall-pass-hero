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
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          id: string
          organization_id: string | null
          reason: string | null
          requested_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          reason?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          reason?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          class_id: string
          created_at: string | null
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string | null
          id: string
          is_queue_autonomous: boolean | null
          join_code: string
          max_concurrent_bathroom: number | null
          name: string
          organization_id: string | null
          period_order: number
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_queue_autonomous?: boolean | null
          join_code: string
          max_concurrent_bathroom?: number | null
          name: string
          organization_id?: string | null
          period_order: number
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_queue_autonomous?: boolean | null
          join_code?: string
          max_concurrent_bathroom?: number | null
          name?: string
          organization_id?: string | null
          period_order?: number
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          id: string
          joined_at: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          bathroom_expected_minutes: number | null
          default_period_count: number | null
          id: string
          locker_expected_minutes: number | null
          max_concurrent_bathroom: number | null
          office_expected_minutes: number | null
          organization_id: string
          require_deletion_approval: boolean | null
          semester_end_date: string | null
          updated_at: string | null
          weekly_bathroom_limit: number | null
        }
        Insert: {
          bathroom_expected_minutes?: number | null
          default_period_count?: number | null
          id?: string
          locker_expected_minutes?: number | null
          max_concurrent_bathroom?: number | null
          office_expected_minutes?: number | null
          organization_id: string
          require_deletion_approval?: boolean | null
          semester_end_date?: string | null
          updated_at?: string | null
          weekly_bathroom_limit?: number | null
        }
        Update: {
          bathroom_expected_minutes?: number | null
          default_period_count?: number | null
          id?: string
          locker_expected_minutes?: number | null
          max_concurrent_bathroom?: number | null
          office_expected_minutes?: number | null
          organization_id?: string
          require_deletion_approval?: boolean | null
          semester_end_date?: string | null
          updated_at?: string | null
          weekly_bathroom_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      pass_freezes: {
        Row: {
          class_id: string
          ends_at: string | null
          freeze_type: string
          id: string
          is_active: boolean | null
          started_at: string | null
          teacher_id: string
        }
        Insert: {
          class_id: string
          ends_at?: string | null
          freeze_type: string
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          teacher_id: string
        }
        Update: {
          class_id?: string
          ends_at?: string | null
          freeze_type?: string
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pass_freezes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      passes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_approved: boolean | null
          checked_in_at: string | null
          class_id: string
          confirmed_by: string | null
          denied_at: string | null
          denied_by: string | null
          destination: string
          expected_return_at: string | null
          id: string
          is_quota_override: boolean | null
          organization_id: string | null
          queue_position: number | null
          requested_at: string | null
          returned_at: string | null
          status: Database["public"]["Enums"]["pass_status"] | null
          student_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean | null
          checked_in_at?: string | null
          class_id: string
          confirmed_by?: string | null
          denied_at?: string | null
          denied_by?: string | null
          destination: string
          expected_return_at?: string | null
          id?: string
          is_quota_override?: boolean | null
          organization_id?: string | null
          queue_position?: number | null
          requested_at?: string | null
          returned_at?: string | null
          status?: Database["public"]["Enums"]["pass_status"] | null
          student_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_approved?: boolean | null
          checked_in_at?: string | null
          class_id?: string
          confirmed_by?: string | null
          denied_at?: string | null
          denied_by?: string | null
          destination?: string
          expected_return_at?: string | null
          id?: string
          is_quota_override?: boolean | null
          organization_id?: string | null
          queue_position?: number | null
          requested_at?: string | null
          returned_at?: string | null
          status?: Database["public"]["Enums"]["pass_status"] | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          is_passing_period: boolean | null
          name: string
          period_order: number
          schedule_id: string
          start_time: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          is_passing_period?: boolean | null
          name: string
          period_order: number
          schedule_id: string
          start_time: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          is_passing_period?: boolean | null
          name?: string
          period_order?: number
          schedule_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          is_approved: boolean | null
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id: string
          is_approved?: boolean | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          is_approved?: boolean | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_assignments: {
        Row: {
          created_at: string | null
          date: string
          id: string
          schedule_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          schedule_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_school_day: boolean | null
          name: string
          organization_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_school_day?: boolean | null
          name: string
          organization_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_school_day?: boolean | null
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      substitute_assignments: {
        Row: {
          class_id: string
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          organization_id: string
          original_teacher_id: string
          substitute_teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          organization_id: string
          original_teacher_id: string
          substitute_teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          organization_id?: string
          original_teacher_id?: string
          substitute_teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "substitute_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "substitute_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_quota_settings: {
        Row: {
          default_period_count: number | null
          id: string
          updated_at: string | null
          weekly_limit: number | null
        }
        Insert: {
          default_period_count?: number | null
          id?: string
          updated_at?: string | null
          weekly_limit?: number | null
        }
        Update: {
          default_period_count?: number | null
          id?: string
          updated_at?: string | null
          weekly_limit?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_sub_for_class: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      check_and_cleanup_semesters: { Args: never; Returns: undefined }
      cleanup_semester_data: { Args: { p_org_id: string }; Returns: undefined }
      delete_user_and_data: { Args: { _user_id: string }; Returns: undefined }
      generate_join_code: { Args: never; Returns: string }
      get_bathroom_queue_position: {
        Args: { _class_id: string; _pass_id: string }
        Returns: number
      }
      get_expected_return_time: {
        Args: { _class_id: string; _destination: string }
        Returns: string
      }
      get_organization_by_slug: {
        Args: { _slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      get_organization_pending_users: {
        Args: { _org_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_user_organization: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_weekly_pass_count: { Args: { _student_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_class_teacher: { Args: { _class_id: string }; Returns: boolean }
      is_enrolled_in_class: { Args: { _class_id: string }; Returns: boolean }
      is_same_organization: { Args: { _user_id: string }; Returns: boolean }
      join_class_by_code: { Args: { p_join_code: string }; Returns: Json }
      lookup_class_by_join_code: {
        Args: { _join_code: string }
        Returns: {
          id: string
          name: string
          period_order: number
          teacher_name: string
        }[]
      }
      student_check_in: { Args: { p_pass_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
      pass_status:
        | "pending"
        | "approved"
        | "denied"
        | "pending_return"
        | "returned"
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
  public: {
    Enums: {
      app_role: ["student", "teacher", "admin"],
      pass_status: [
        "pending",
        "approved",
        "denied",
        "pending_return",
        "returned",
      ],
    },
  },
} as const
