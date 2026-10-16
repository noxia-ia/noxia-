import type { Subscription } from "@/types/database";

/** A paid active plan may request an unwatermarked video download. Free users must use Filingram. */
export function canDownloadWithoutFilingram(sub: Pick<Subscription, "status" | "plan" | "expires_at"> | null): boolean {
  if (!sub || sub.status !== "active" || sub.plan === "free") return false;
  if (sub.plan !== "plus" && sub.plan !== "pro" && sub.plan !== "ultra") return false;
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) return false;
  return true;
}
