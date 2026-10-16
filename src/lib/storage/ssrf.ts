import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Protection SSRF : le serveur ne télécharge JAMAIS une URL fournie par un fournisseur sans ces contrôles.
// 1) HTTPS, sans identifiants, port 443 ; 2) hôte exact de la liste `assetHosts` du fournisseur (ou sous-domaine) ; 3) aucune adresse IP littérale ;
// 4) TOUTES les adresses résolues sont publiques. Limite connue : la résolution DNS refaite par fetch() n'est pas « épinglée » (voir docs/PROVIDERS.md).
const v4 = (ip: string) => ip.split(".").map(Number);
function privateV4(ip: string): boolean {
  const [a, b, c] = v4(ip);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}
function privateV6(raw: string): boolean {
  let ip: string;
  try { ip = new URL(`http://[${raw}]/`).hostname.slice(1, -1).toLowerCase(); } catch { return true; } // forme canonique ; illisible → refusé
  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("::ffff:")) { // IPv4 mappée : ::ffff:7f00:1
    const h = ip.slice(7).split(":");
    if (h.length === 2) { const n = (parseInt(h[0], 16) << 16) | parseInt(h[1], 16); return privateV4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")); }
    return true;
  }
  return /^(f[cd]|fe[89ab]|ff)/.test(ip) || ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8:") || ip.startsWith("100:");
}
const isPrivateIp = (ip: string) => (isIP(ip) === 4 ? privateV4(ip) : isIP(ip) === 6 ? privateV6(ip) : true);

export async function assertSafeSource(raw: string, allowedHosts: string[]): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("ssrf:url"); }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) throw new Error("ssrf:scheme");
  const host = u.hostname.toLowerCase();
  if (isIP(host) || host.startsWith("[")) throw new Error("ssrf:ip_literal");
  if (!allowedHosts.some(h => host === h || host.endsWith(`.${h}`))) throw new Error("ssrf:host_not_allowed");
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some(a => isPrivateIp(a.address))) throw new Error("ssrf:private_address");
  return u;
}
