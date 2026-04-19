/** Minimal generated-style types for Mirror public schema (expand as needed). */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      tryon_jobs: {
        Row: {
          id: string;
          user_id: string;
          product_id: string | null;
          product_image_url: string;
          product_image_hash: string;
          product_metadata: Json;
          mode: string;
          reference_photo_id: string;
          status: string;
          priority: number;
          provider: string | null;
          attempts: number;
          error_code: string | null;
          error_message: string | null;
          result_id: string | null;
          trace_id: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      fit_score_jobs: {
        Row: {
          id: string;
          user_id: string;
          product_id: string | null;
          product_fingerprint: string;
          product_metadata: Json;
          closet_revision_hash: string;
          prompt_version: number;
          status: string;
          priority: number;
          error_code: string | null;
          error_message: string | null;
          result_id: string | null;
          trace_id: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      fit_score_results: {
        Row: {
          id: string;
          job_id: string;
          user_id: string;
          product_id: string | null;
          product_fingerprint: string;
          closet_revision_hash: string;
          prompt_version: number;
          overall_score: number;
          breakdown: Json;
          matching_items: Json;
          conflicts: Json;
          explanation: string;
          confidence: string;
          generated_at: string;
          deleted_at: string | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          tryon_result_id: string | null;
          product_id: string | null;
          image_url: string;
          caption: string | null;
          visibility: string;
          moderation_status: string;
          reaction_count: number;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      reactions: {
        Row: {
          id: string;
          post_id: string;
          user_id: string;
          reaction_type: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      product_detection_rules: {
        Row: {
          id: string;
          domain: string;
          priority: number;
          selector_config: Json;
          confidence: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
