import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUDIO_BUCKET, STORED_AUDIO_PATH_RE } from "@/lib/storage/policy";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const path = params.get("path") ?? "";
  const download = params.get("download") === "1"; // téléchargement : l'URL signée force « attachment »
  if (!STORED_AUDIO_PATH_RE.test(path)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const db = createAdminClient();
  const { data: asset, error } = await db.from("stored_assets").select("id,user_id,storage_provider,path,mime_type").eq("user_id", user.id).eq("storage_provider", "supabase-storage").eq("path", path).maybeSingle();
  if (error || !asset || !String(asset.mime_type).startsWith("audio/")) return new NextResponse("Not found", { status: 404 });

  const { data, error: signError } = await db.storage.from(AUDIO_BUCKET).createSignedUrl(path, 300, download ? { download: true } : undefined);
  if (signError || !data?.signedUrl) return new NextResponse("Unavailable", { status: 503 });
  return NextResponse.redirect(data.signedUrl, 302);
}
