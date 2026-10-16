// Signature HMAC des appels vers la fonction de fond Netlify. Fichier PUR (node:crypto uniquement) : même algorithme que netlify/functions/video-render-background.mts.
import { createHmac, timingSafeEqual } from "node:crypto";
export const SIGNATURE_MAX_AGE_MS = 5 * 60_000;
export const signJobBody = (secret: string, timestamp: number, body: string): string => createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
export function verifyJobSignature(secret: string, timestamp: number, body: string, signature: string, now: number = Date.now()): boolean {
  if (!secret || !Number.isFinite(timestamp) || Math.abs(now - timestamp) > SIGNATURE_MAX_AGE_MS) return false;
  const expected = Buffer.from(signJobBody(secret, timestamp, body), "hex"), given = Buffer.from(String(signature), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
