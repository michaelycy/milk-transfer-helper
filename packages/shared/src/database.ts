/**
 * 手写的 Database 类型（与 supabase/migrations 中 schema 保持一致）。
 * 生产项目建议用 `supabase gen types typescript --linked > src/types/database.ts` 自动生成。
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          openid: string | null
          nickname: string | null
          avatar: string | null
          created_at: string
        }
        Insert: {
          id: string
          openid?: string | null
          nickname?: string | null
          avatar?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          openid?: string | null
          nickname?: string | null
          avatar?: string | null
          created_at?: string
        }
        Relationships: []
      }
      babies: {
        Row: {
          id: string
          user_id: string
          nickname: string
          birth_date: string
          gender: 'male' | 'female' | 'unknown'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          nickname?: string
          birth_date: string
          gender?: 'male' | 'female' | 'unknown'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nickname?: string
          birth_date?: string
          gender?: 'male' | 'female' | 'unknown'
          updated_at?: string
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          id: string
          user_id: string
          baby_id: string
          weight_g: number
          measured_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          baby_id: string
          weight_g: number
          measured_at: string
          created_at?: string
        }
        Update: {
          weight_g?: number
          measured_at?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          user_id: string
          email: string
          note: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          email: string
          note?: string | null
          created_at?: string
        }
        Update: {
          user_id?: string
          email?: string
          note?: string | null
          created_at?: string
        }
        Relationships: []
      },
      milk_products: {
        Row: {
          id: string
          brand: string
          name: string
          stage: number
          protein_type: string
          region: 'domestic' | 'overseas'
          reg_no: string | null
          ingredients: Json
          mix_ratio: string | null
          price_range: string | null
          status: 'on_shelf' | 'off_shelf'
          updated_at: string
        }
        Insert: {
          id?: string
          brand: string
          name: string
          stage: number
          protein_type: string
          region?: 'domestic' | 'overseas'
          reg_no?: string | null
          ingredients?: Json
          mix_ratio?: string | null
          price_range?: string | null
          status?: 'on_shelf' | 'off_shelf'
          updated_at?: string
        }
        Update: {
          brand?: string
          name?: string
          stage?: number
          protein_type?: string
          region?: 'domestic' | 'overseas'
          reg_no?: string | null
          ingredients?: Json
          mix_ratio?: string | null
          price_range?: string | null
          status?: 'on_shelf' | 'off_shelf'
          updated_at?: string
        }
        Relationships: []
      }
      plan_templates: {
        Row: {
          id: string
          method: 'mixed' | 'interval'
          name: string
          days: Json
          version: number
          is_default: boolean
          enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          method: 'mixed' | 'interval'
          name: string
          days: Json
          version?: number
          is_default?: boolean
          enabled?: boolean
          created_at?: string
        }
        Update: {
          method?: 'mixed' | 'interval'
          name?: string
          days?: Json
          version?: number
          is_default?: boolean
          enabled?: boolean
        }
        Relationships: []
      }
      transfer_plans: {
        Row: {
          id: string
          user_id: string
          baby_id: string
          from_product_id: string | null
          to_product_id: string | null
          from_brand_text: string
          to_brand_text: string
          reason: PlanReason
          method: PlanMethod
          template_id: string | null
          template_version: number
          start_date: string
          status: PlanStatus
          terminate_reason: string | null
          rollback_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          baby_id: string
          from_product_id?: string | null
          to_product_id?: string | null
          from_brand_text: string
          to_brand_text: string
          reason: PlanReason
          method: PlanMethod
          template_id?: string | null
          template_version?: number
          start_date: string
          status?: PlanStatus
          terminate_reason?: string | null
          rollback_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: PlanStatus
          terminate_reason?: string | null
          rollback_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      feed_records: {
        Row: {
          id: string
          user_id: string
          baby_id: string
          plan_id: string | null
          plan_day: number | null
          product_id: string | null
          brand_text: string | null
          milk_brand: string
          feed_amount: number
          finish_state: 'finished' | 'partial' | 'refused'
          feed_time: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          baby_id: string
          plan_id?: string | null
          plan_day?: number | null
          product_id?: string | null
          brand_text?: string | null
          milk_brand: string
          feed_amount: number
          finish_state?: 'finished' | 'partial' | 'refused'
          feed_time: string
          note?: string | null
          created_at?: string
        }
        Update: {
          baby_id?: string
          plan_id?: string | null
          plan_day?: number | null
          product_id?: string | null
          brand_text?: string | null
          milk_brand?: string
          feed_amount?: number
          finish_state?: 'finished' | 'partial' | 'refused'
          feed_time?: string
          note?: string | null
        }
        Relationships: []
      }
      symptom_logs: {
        Row: {
          id: string
          user_id: string
          baby_id: string
          log_date: string
          stool_count: number
          stool_texture: string | null
          stool_color: string | null
          has_rash: boolean
          has_vomit: boolean
          has_bloating: boolean
          has_fever: boolean
          crying_level: 'normal' | 'fussy' | 'crying_a_lot'
          sleep_quality: 'normal' | 'poor'
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          baby_id: string
          log_date: string
          stool_count?: number
          stool_texture?: string | null
          stool_color?: string | null
          has_rash?: boolean
          has_vomit?: boolean
          has_bloating?: boolean
          has_fever?: boolean
          crying_level?: 'normal' | 'fussy' | 'crying_a_lot'
          sleep_quality?: 'normal' | 'poor'
          note?: string | null
          created_at?: string
        }
        Update: {
          stool_count?: number
          stool_texture?: string | null
          stool_color?: string | null
          has_rash?: boolean
          has_vomit?: boolean
          has_bloating?: boolean
          has_fever?: boolean
          crying_level?: 'normal' | 'fussy' | 'crying_a_lot'
          sleep_quality?: 'normal' | 'poor'
          note?: string | null
        }
        Relationships: []
      }
      alerts: {
        Row: {
          id: string
          user_id: string
          baby_id: string
          plan_id: string | null
          level: 'red' | 'yellow' | 'green'
          rule_code: string
          payload: Json
          status: 'new' | 'acked' | 'resolved'
          acked_at: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          baby_id: string
          plan_id?: string | null
          level: 'red' | 'yellow' | 'green'
          rule_code: string
          payload?: Json
          status?: 'new' | 'acked' | 'resolved'
          acked_at?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Update: {
          status?: 'new' | 'acked' | 'resolved'
          acked_at?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          id: string
          user_id: string
          name: string
          props: Json
          occurred_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          props?: Json
          occurred_at?: string
        }
        Update: {
          name?: string
          props?: Json
        }
        Relationships: []
      }
      records: {
        Row: {
          id: string
          user_id: string
          milk_brand: string
          feed_amount: number
          feed_time: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          /** 有默认值 auth.uid()，客户端不应传入 */
          user_id?: string
          milk_brand: string
          feed_amount: number
          feed_time: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          milk_brand?: string
          feed_amount?: number
          feed_time?: string
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          id: string
          title: string
          content: string
          category: string
          author: string | null
          read_count: number
          review_status: 'pending' | 'approved' | 'rejected'
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          category: string
          author?: string | null
          read_count?: number
          review_status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
        }
        Update: {
          title?: string
          content?: string
          category?: string
          author?: string | null
          read_count?: number
          review_status?: 'pending' | 'approved' | 'rejected'
        }
        Relationships: []
      }
      favorites: {
        Row: {
          id: string
          user_id: string
          article_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          article_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          article_id?: string
          created_at?: string
        }
        Relationships: []
      }
      ai_configs: {
        Row: {
          id: string
          scene: AiScene
          provider: string
          model: string
          base_url: string | null
          temperature: number
          max_tokens: number
          daily_limit_per_user: number
          enabled: boolean
          fallback_provider: string | null
          fallback_model: string | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scene: AiScene
          provider?: string
          model: string
          base_url?: string | null
          temperature?: number
          max_tokens?: number
          daily_limit_per_user?: number
          enabled?: boolean
          fallback_provider?: string | null
          fallback_model?: string | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scene?: AiScene
          provider?: string
          model?: string
          base_url?: string | null
          temperature?: number
          max_tokens?: number
          daily_limit_per_user?: number
          enabled?: boolean
          fallback_provider?: string | null
          fallback_model?: string | null
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompt_templates: {
        Row: {
          id: string
          scene: AiScene
          version: number
          system_prompt: string
          review_status: AiReviewStatus
          review_note: string | null
          reviewed_at: string | null
          enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          scene: AiScene
          version?: number
          system_prompt: string
          review_status?: AiReviewStatus
          review_note?: string | null
          reviewed_at?: string | null
          enabled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          scene?: AiScene
          version?: number
          system_prompt?: string
          review_status?: AiReviewStatus
          review_note?: string | null
          reviewed_at?: string | null
          enabled?: boolean
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          id: string
          user_id: string
          scene: AiScene
          success: boolean
          tokens: number
          fallback_used: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          scene: AiScene
          success?: boolean
          tokens?: number
          fallback_used?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          success?: boolean
          tokens?: number
          fallback_used?: boolean
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          id: string
          name: string
          base_url: string
          note: string | null
          enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          base_url: string
          note?: string | null
          enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          base_url?: string
          note?: string | null
          enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          id: string
          user_id: string
          baby_id: string | null
          role: 'user' | 'assistant'
          scene: AiScene
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          baby_id?: string | null
          role: 'user' | 'assistant'
          scene?: AiScene
          content: string
          created_at?: string
        }
        Update: {
          content?: string
        }
        Relationships: []
      }
      ai_analyses: {
        Row: {
          id: string
          user_id: string
          baby_id: string | null
          scene: 'poop' | 'bottle' | 'can'
          result: Json
          confidence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          baby_id?: string | null
          scene: 'poop' | 'bottle' | 'can'
          result: Json
          confidence?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          result?: Json
          confidence?: number | null
        }
        Relationships: []
      }
      milk_product_submissions: {
        Row: {
          id: string
          user_id: string
          source: 'ai_can' | 'barcode'
          payload: Json
          image_path: string | null
          status: 'pending' | 'processed' | 'dismissed'
          created_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string
          source?: 'ai_can' | 'barcode'
          payload: Json
          image_path?: string | null
          status?: 'pending' | 'processed' | 'dismissed'
          created_at?: string
          processed_at?: string | null
        }
        Update: {
          id?: string
          status?: 'pending' | 'processed' | 'dismissed'
          processed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_record_stats: {
        Args: Record<string, never>
        Returns: Json
      }
      increment_read_count: {
        Args: { article_id: string }
        Returns: undefined
      }
    }
  }
}

/** 计划状态机（FR-C4）：active→paused→active；active→rollback→active；→completed/terminated */
export type PlanStatus = 'active' | 'paused' | 'rollback' | 'completed' | 'terminated'
export type PlanMethod = 'mixed' | 'interval'
export type PlanReason = 'stage' | 'brand' | 'medical' | 'other'
export type ProteinType = 'intact' | 'partially_hydrolyzed' | 'extensively_hydrolyzed' | 'amino_acid'
export type AlertLevel = 'red' | 'yellow' | 'green'
export type AlertStatus = 'new' | 'acked' | 'resolved'
export type Gender = 'male' | 'female' | 'unknown'

/** AI 场景（FR-K1，glossary §1）：问答 / 便便 / 奶瓶 / 奶粉罐 */
export type AiScene = 'chat' | 'poop' | 'bottle' | 'can'
/** AI 提示词审核流（NFR-1）：仅 approved 且 enabled 的版本可生效 */
export type AiReviewStatus = 'pending' | 'approved' | 'rejected'

/**
 * 方法模板的逐日定义（plan_templates.days jsonb 的元素契约，两端共用）。
 * 用 type 而非 interface：保持对 Json 索引签名类型的结构可赋值性。
 */
export type PlanDaySpec = {
  /** 当日新奶占比 0–1 */
  ratio: number
  /** 展示用文案，如「新奶 1/3」 */
  label: string
}
