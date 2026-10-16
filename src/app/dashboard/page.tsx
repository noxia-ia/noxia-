import { getSessionProfile } from "@/lib/auth";
import { UUID_RE } from "@/lib/validation";
import { getCurrentSubscription, effectiveStatus } from "@/lib/subscription";
import { HomeChat } from "@/components/chat/HomeChat";
import { attachmentsEnabled, maxUploadBytes } from "@/lib/attachments/service";
import { BANNER_COLUMNS, type AdBannerRow, type PublicBanner } from "@/lib/banners";
import type { ChatMessageView } from "@/modules/agents/types";

// Accueil = discussion. /dashboard → nouvelle discussion ; /dashboard?c=<id> → discussion existante.
export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { supabase, user, profile } = await getSessionProfile();
  const { c } = await searchParams;
  const fullName = profile?.full_name || (user.user_metadata?.full_name as string | undefined) || "";
  const firstName = fullName.split(/[\s@]/)[0] || "toi";

  let conversationId: string | null = null;
  let agentId: string | null = null;
  let active = true;
  let messages: ChatMessageView[] = [];
  if (c && UUID_RE.test(c)) {
    const { data: conv } = await supabase.from("agent_conversations").select("id,agent_id").eq("id", c).eq("user_id", user.id).maybeSingle<{ id: string; agent_id: string }>();
    if (conv) {
      conversationId = conv.id; agentId = conv.agent_id;
      const { data: agent } = await supabase.from("agents").select("status").eq("id", conv.agent_id).eq("user_id", user.id).maybeSingle<{ status: string }>();
      active = agent?.status === "active";
      const { data } = await supabase.from("agent_messages").select("id,role,content,status,error_message").eq("conversation_id", conv.id).eq("user_id", user.id).order("seq", { ascending: true }).limit(200);
      messages = (data ?? []).map(m => ({ id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content, status: m.status, error: m.error_message ?? null }));
    }
  }

  // Bande publicitaire : la base ne renvoie que les bandes actives et dans leurs dates (RLS). Un échec n'empêche jamais le chat.
  const sub = await getCurrentSubscription(supabase, user.id);
  const paid = effectiveStatus(sub) === "active" && !!sub && sub.plan !== "free";
  const { data: rows } = await supabase.from("ad_banners").select(BANNER_COLUMNS).eq("active", true).order("sort_order", { ascending: true }).returns<AdBannerRow[]>();
  const now = Date.now();
  const banners: PublicBanner[] = (rows ?? [])
    .filter(b => (!b.starts_at || Date.parse(b.starts_at) <= now) && (!b.ends_at || Date.parse(b.ends_at) > now) && !(paid && b.hide_for_paid))
    .map(b => ({ id: b.id, label: b.label, title: b.title, body: b.body, image_url: b.image_url, link_url: b.link_url, cta_label: b.cta_label }));

  return <HomeChat key={conversationId ?? "new"} firstName={firstName} conversationId={conversationId} agentId={agentId} messages={messages} active={active} banners={banners} attachmentsEnabled={attachmentsEnabled()} maxUploadMb={Math.round(maxUploadBytes() / 1024 / 1024)} />;
}
