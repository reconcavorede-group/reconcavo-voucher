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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      locations: {
        Row: {
          active: boolean
          created_at: string
          gateway_ip: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          gateway_ip?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          gateway_ip?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      mikrotik_config: {
        Row: {
          enabled: boolean
          host: string
          id: string
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          password: string
          port: number
          updated_at: string
          use_https: boolean
          username: string
        }
        Insert: {
          enabled?: boolean
          host?: string
          id?: string
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          password?: string
          port?: number
          updated_at?: string
          use_https?: boolean
          username?: string
        }
        Update: {
          enabled?: boolean
          host?: string
          id?: string
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          password?: string
          port?: number
          updated_at?: string
          use_https?: boolean
          username?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          abacatepay_payment_id: string | null
          abacatepay_status: string | null
          amount: number
          completed_at: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          duration_minutes: number
          id: string
          location_id: string | null
          mercadopago_payment_id: string | null
          mercadopago_status: string | null
          notes: string | null
          payment_method: string
          plan_id: string | null
          plan_name: string
          status: string
          voucher_id: string | null
        }
        Insert: {
          abacatepay_payment_id?: string | null
          abacatepay_status?: string | null
          amount: number
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          duration_minutes: number
          id?: string
          location_id?: string | null
          mercadopago_payment_id?: string | null
          mercadopago_status?: string | null
          notes?: string | null
          payment_method: string
          plan_id?: string | null
          plan_name: string
          status?: string
          voucher_id?: string | null
        }
        Update: {
          abacatepay_payment_id?: string | null
          abacatepay_status?: string | null
          amount?: number
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          duration_minutes?: number
          id?: string
          location_id?: string | null
          mercadopago_payment_id?: string | null
          mercadopago_status?: string | null
          notes?: string | null
          payment_method?: string
          plan_id?: string | null
          plan_name?: string
          status?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_config: {
        Row: {
          enabled: boolean
          id: string
          key_type: string
          merchant_city: string
          merchant_name: string
          pix_key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          key_type?: string
          merchant_city?: string
          merchant_name?: string
          pix_key?: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          key_type?: string
          merchant_city?: string
          merchant_name?: string
          pix_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          active: boolean
          created_at: string
          duration_minutes: number
          id: string
          location_id: string | null
          mikrotik_profile: string | null
          plan_name: string
          price: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_minutes: number
          id?: string
          location_id?: string | null
          mikrotik_profile?: string | null
          plan_name: string
          price: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_minutes?: number
          id?: string
          location_id?: string | null
          mikrotik_profile?: string | null
          plan_name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          activated_at: string | null
          batch_id: string | null
          code: string
          created_at: string
          duration_minutes: number
          duration_type: string
          expires_at: string | null
          id: string
          imported_at: string | null
          location_id: string | null
          mac_address: string | null
          mikrotik_error: string | null
          mikrotik_profile: string | null
          mikrotik_synced: boolean
          mikrotik_synced_at: string | null
          password: string
          price: number
          status: string
        }
        Insert: {
          activated_at?: string | null
          batch_id?: string | null
          code: string
          created_at?: string
          duration_minutes: number
          duration_type: string
          expires_at?: string | null
          id?: string
          imported_at?: string | null
          location_id?: string | null
          mac_address?: string | null
          mikrotik_error?: string | null
          mikrotik_profile?: string | null
          mikrotik_synced?: boolean
          mikrotik_synced_at?: string | null
          password: string
          price: number
          status?: string
        }
        Update: {
          activated_at?: string | null
          batch_id?: string | null
          code?: string
          created_at?: string
          duration_minutes?: number
          duration_type?: string
          expires_at?: string | null
          id?: string
          imported_at?: string | null
          location_id?: string | null
          mac_address?: string | null
          mikrotik_error?: string | null
          mikrotik_profile?: string | null
          mikrotik_synced?: boolean
          mikrotik_synced_at?: string | null
          password?: string
          price?: number
          status?: string
        }
        Relationships: []
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
    Enums: {},
  },
} as const
