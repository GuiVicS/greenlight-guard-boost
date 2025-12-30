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
      access_logs: {
        Row: {
          action: string
          asset_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          asset_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          asset_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_logs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          checkout_base_url: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          checkout_base_url?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          checkout_base_url?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          block_reason: string | null
          checkout_description: string | null
          checkout_favicon_url: string | null
          checkout_logo_url: string | null
          checkout_message: string | null
          checkout_primary_color: string | null
          checkout_theme: string | null
          checkout_title: string | null
          client_id: string
          created_at: string
          id: string
          infoproduct_url: string | null
          name: string
          public_key: string
          status: Database["public"]["Enums"]["asset_status"]
          type: Database["public"]["Enums"]["asset_type"]
          updated_at: string
        }
        Insert: {
          block_reason?: string | null
          checkout_description?: string | null
          checkout_favicon_url?: string | null
          checkout_logo_url?: string | null
          checkout_message?: string | null
          checkout_primary_color?: string | null
          checkout_theme?: string | null
          checkout_title?: string | null
          client_id: string
          created_at?: string
          id?: string
          infoproduct_url?: string | null
          name: string
          public_key?: string
          status?: Database["public"]["Enums"]["asset_status"]
          type?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
        }
        Update: {
          block_reason?: string | null
          checkout_description?: string | null
          checkout_favicon_url?: string | null
          checkout_logo_url?: string | null
          checkout_message?: string | null
          checkout_primary_color?: string | null
          checkout_theme?: string | null
          checkout_title?: string | null
          client_id?: string
          created_at?: string
          id?: string
          infoproduct_url?: string | null
          name?: string
          public_key?: string
          status?: Database["public"]["Enums"]["asset_status"]
          type?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_attempts: {
        Row: {
          attempt_number: number
          attempt_type: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          sent_to: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          attempt_number?: number
          attempt_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          sent_to?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          attempt_number?: number
          attempt_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          sent_to?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_attempts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          created_at: string
          email_message_template: string | null
          email_subject_template: string | null
          evolution_api_url: string | null
          evolution_instance: string | null
          id: string
          is_enabled: boolean | null
          max_auto_charge_attempts: number | null
          notification_days_before_block: number | null
          sender_email: string | null
          sender_name: string | null
          updated_at: string
          whatsapp_message_template: string | null
        }
        Insert: {
          created_at?: string
          email_message_template?: string | null
          email_subject_template?: string | null
          evolution_api_url?: string | null
          evolution_instance?: string | null
          id?: string
          is_enabled?: boolean | null
          max_auto_charge_attempts?: number | null
          notification_days_before_block?: number | null
          sender_email?: string | null
          sender_name?: string | null
          updated_at?: string
          whatsapp_message_template?: string | null
        }
        Update: {
          created_at?: string
          email_message_template?: string | null
          email_subject_template?: string | null
          evolution_api_url?: string | null
          evolution_instance?: string | null
          id?: string
          is_enabled?: boolean | null
          max_auto_charge_attempts?: number | null
          notification_days_before_block?: number | null
          sender_email?: string | null
          sender_name?: string | null
          updated_at?: string
          whatsapp_message_template?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          status: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mercadopago_settings: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          id: string
          is_configured: boolean | null
          is_enabled: boolean
          is_sandbox: boolean
          public_key: string | null
          sandbox_access_token_encrypted: string | null
          sandbox_public_key: string | null
          updated_at: string
          webhook_secret_encrypted: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          id?: string
          is_configured?: boolean | null
          is_enabled?: boolean
          is_sandbox?: boolean
          public_key?: string | null
          sandbox_access_token_encrypted?: string | null
          sandbox_public_key?: string | null
          updated_at?: string
          webhook_secret_encrypted?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          id?: string
          is_configured?: boolean | null
          is_enabled?: boolean
          is_sandbox?: boolean
          public_key?: string | null
          sandbox_access_token_encrypted?: string | null
          sandbox_public_key?: string | null
          updated_at?: string
          webhook_secret_encrypted?: string | null
        }
        Relationships: []
      }
      payment_methods_config: {
        Row: {
          country: string
          created_at: string
          gateway_type: string
          id: string
          is_enabled: boolean
          method_name: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          gateway_type: string
          id?: string
          is_enabled?: boolean
          method_name: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          gateway_type?: string
          id?: string
          is_enabled?: boolean
          method_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id: string | null
          subscription_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id?: string | null
          subscription_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_intent_id?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_products: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          interval: string
          name: string
          stripe_price_id: string | null
          stripe_product_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          name: string
          stripe_price_id?: string | null
          stripe_product_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          name?: string
          stripe_price_id?: string | null
          stripe_product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_settings: {
        Row: {
          created_at: string
          id: string
          is_configured: boolean | null
          is_enabled: boolean
          is_sandbox: boolean
          publishable_key: string | null
          secret_key_encrypted: string | null
          updated_at: string
          webhook_secret_encrypted: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_configured?: boolean | null
          is_enabled?: boolean
          is_sandbox?: boolean
          publishable_key?: string | null
          secret_key_encrypted?: string | null
          updated_at?: string
          webhook_secret_encrypted?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_configured?: boolean | null
          is_enabled?: boolean
          is_sandbox?: boolean
          publishable_key?: string | null
          secret_key_encrypted?: string | null
          updated_at?: string
          webhook_secret_encrypted?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          asset_id: string
          auto_charge_enabled: boolean
          billing_type: string
          country: string
          created_at: string
          due_date: string
          failed_charge_count: number | null
          id: string
          last_charge_attempt: string | null
          monthly_value: number
          next_billing_date: string | null
          notification_days_count: number | null
          notification_started_at: string | null
          plan_name: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          auto_charge_enabled?: boolean
          billing_type?: string
          country?: string
          created_at?: string
          due_date: string
          failed_charge_count?: number | null
          id?: string
          last_charge_attempt?: string | null
          monthly_value: number
          next_billing_date?: string | null
          notification_days_count?: number | null
          notification_started_at?: string | null
          plan_name: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          auto_charge_enabled?: boolean
          billing_type?: string
          country?: string
          created_at?: string
          due_date?: string
          failed_charge_count?: number | null
          id?: string
          last_charge_attempt?: string | null
          monthly_value?: number
          next_billing_date?: string | null
          notification_days_count?: number | null
          notification_started_at?: string | null
          plan_name?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          last_attempt_at: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          status: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          error_message?: string | null
          event_id?: string
          event_type: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          events: string[]
          headers: Json | null
          id: string
          is_enabled: boolean
          name: string
          retry_count: number
          secret: string
          timeout_ms: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          headers?: Json | null
          id?: string
          is_enabled?: boolean
          name: string
          retry_count?: number
          secret?: string
          timeout_ms?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          headers?: Json | null
          id?: string
          is_enabled?: boolean
          name?: string
          retry_count?: number
          secret?: string
          timeout_ms?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff"
      asset_status: "active" | "blocked"
      asset_type: "wordpress" | "shopify" | "custom" | "other" | "infoproduct"
      payment_method: "pix" | "card" | "boleto"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      subscription_status: "active" | "overdue" | "cancelled"
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
      app_role: ["admin", "staff"],
      asset_status: ["active", "blocked"],
      asset_type: ["wordpress", "shopify", "custom", "other", "infoproduct"],
      payment_method: ["pix", "card", "boleto"],
      payment_status: ["pending", "completed", "failed", "refunded"],
      subscription_status: ["active", "overdue", "cancelled"],
    },
  },
} as const
