import type { SubscriptionStatus } from "@/types/database";
import { STATUS_LABELS } from "@/lib/subscription";
const color: Record<SubscriptionStatus, string> = {
  active: "border-emerald-500/40 text-emerald-400", expired: "border-noxia-violet/50 text-noxia-violet",
  suspended: "border-amber-500/40 text-amber-400", cancelled: "border-noxia-silver/30 text-noxia-ash", pending: "border-noxia-silver/30 text-noxia-silver",
};
export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return <span className={`inline-block rounded-sm border px-2 py-0.5 text-xs ${color[status]}`}>{STATUS_LABELS[status]}</span>;
}
