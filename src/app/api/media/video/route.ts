import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSubscription } from "@/lib/subscription";
import { canDownloadWithoutFilingram } from "@/lib/download-policy";
import { VIDEO_BUCKET, STORED_VIDEO_PATH_RE } from "@/lib/storage/policy";

export const runtime = "nodejs";

function ffmpegPath() { return process.env.FFMPEG_PATH?.trim() || "ffmpeg"; }

async function runFfmpeg(input: string, output: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y", "-i", input,
      "-vf", "drawtext=text='NOXIA AI - Filingram':fontcolor=white@0.58:fontsize=28:box=1:boxcolor=black@0.25:boxborderw=10:x=w-tw-24:y=h-th-24",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "copy", "-movflags", "+faststart", output,
    ];
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", b => { stderr += String(b).slice(-4000); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`ffmpeg:${code}:${stderr}`)));
  });
}

async function cleanup(...files: string[]) {
  await Promise.all(files.map(f => fs.rm(f, { force: true }).catch(() => undefined)));
}

// Lecture protégée. Le bucket reste privé. Les téléchargements vidéo Free doivent passer par Filingram.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pathValue = params.get("path") ?? "";
  const download = params.get("download") === "1";
  const filingramParam = params.get("filingram");
  if (!STORED_VIDEO_PATH_RE.test(pathValue)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const db = createAdminClient();
  const { data: asset, error: assetError } = await db.from("stored_assets")
    .select("id,user_id,storage_provider,path,mime_type")
    .eq("user_id", user.id).eq("storage_provider", "supabase-storage").eq("path", pathValue).maybeSingle();
  if (assetError || !asset || !String(asset.mime_type).startsWith("video/")) return new NextResponse("Not found", { status: 404 });

  if (!download) {
    const { data, error } = await db.storage.from(VIDEO_BUCKET).createSignedUrl(pathValue, 300);
    if (error || !data?.signedUrl) return new NextResponse("Unavailable", { status: 503 });
    return NextResponse.redirect(data.signedUrl, 302);
  }

  const sub = await getCurrentSubscription(supabase, user.id);
  const paid = canDownloadWithoutFilingram(sub);
  const wantsUnwatermarked = filingramParam === "0";
  if (wantsUnwatermarked && !paid) {
    return NextResponse.json({ code: "SUBSCRIPTION_REQUIRED", message: "Un téléchargement sans Filingram nécessite un abonnement NOXIA actif." }, { status: 402 });
  }

  // filingram=1 is the default for every Free download. Paid users may explicitly choose filingram=0.
  const withFilingram = !wantsUnwatermarked;
  if (!withFilingram) {
    const { data, error } = await db.storage.from(VIDEO_BUCKET).createSignedUrl(pathValue, 300, { download: true });
    if (error || !data?.signedUrl) return new NextResponse("Unavailable", { status: 503 });
    return NextResponse.redirect(data.signedUrl, 302);
  }

  const workDir = path.join("/tmp", "noxia-downloads");
  const token = randomUUID();
  const input = path.join(workDir, `${token}.input.mp4`);
  const output = path.join(workDir, `${token}.filingram.mp4`);
  try {
    await fs.mkdir(workDir, { recursive: true });
    const { data: blob, error: downloadError } = await db.storage.from(VIDEO_BUCKET).download(pathValue);
    if (downloadError || !blob) return new NextResponse("Unavailable", { status: 503 });
    await fs.writeFile(input, Buffer.from(await blob.arrayBuffer()));
    await runFfmpeg(input, output);
    const bytes = await fs.readFile(output);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="NOXIA-Filingram-${asset.id}.mp4"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Filingram video download failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ code: "FILINGRAM_UNAVAILABLE", message: "Le téléchargement avec Filingram est temporairement indisponible." }, { status: 503 });
  } finally {
    await cleanup(input, output);
  }
}
