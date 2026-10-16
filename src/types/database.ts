import type { ModuleId } from "./index";
import type { Personality, Creativity, AgentLanguage } from "@/lib/ai/agents/types";
export type Role = "user" | "admin";
export type Plan = "free" | "plus" | "pro" | "ultra" | "daily" | "weekly" | "monthly" | "annual";
export type SubscriptionStatus = "active" | "expired" | "cancelled" | "pending" | "suspended";
export type GenerationStatus = "pending" | "processing" | "completed" | "failed";
export interface Profile { id: string; user_id: string; full_name: string | null; email: string | null; avatar_url: string | null; role: Role; credits: number; date_of_birth: string | null; age_verified_at: string | null; country_code: string | null; locale: string; display_currency: string; created_at: string; updated_at: string; }
export interface Subscription { id: string; user_id: string; plan: Plan; status: SubscriptionStatus; starts_at: string | null; expires_at: string | null; credits_total: number; credits_remaining: number; created_at: string; updated_at: string; }
export interface Generation { id: string; user_id: string; module: ModuleId; prompt: string | null; status: GenerationStatus; credits_used: number; result_url: string | null; created_at: string; project_type: string | null; technology: string | null; result: unknown | null; error_message: string | null; completed_at: string | null; params: unknown | null; provider: string | null; provider_job_id: string | null; error_code: string | null; last_polled_at: string | null; }
export type HistoryAction = "activate" | "renew" | "suspend" | "expire" | "credits";
export interface SubscriptionHistory { id: string; user_id: string; subscription_id: string | null; admin_id: string | null; action: HistoryAction; old_plan: Plan | null; new_plan: Plan | null; old_status: SubscriptionStatus | null; new_status: SubscriptionStatus | null; old_expires_at: string | null; new_expires_at: string | null; credits_delta: number; created_at: string; }
export type AgentStatus = "active" | "inactive";
export interface Agent { id: string; user_id: string; name: string; description: string; icon: string; objective: string; role: string; instructions: string; domain: string; personality: Personality; personality_custom: string | null; creativity: Creativity; language: AgentLanguage; provider: string | null; status: AgentStatus; created_at: string; updated_at: string; }
export interface AgentConversation { id: string; user_id: string; agent_id: string; title: string; status: "active" | "archived"; last_message: string; last_message_at: string; created_at: string; updated_at: string; }
export interface AgentMessage { id: string; seq: number; conversation_id: string; user_id: string; role: "user" | "assistant"; content: string; status: "pending" | "completed" | "failed"; credits_used: number; error_message: string | null; provider: string | null; created_at: string; }
