"use client";
import { useActionState, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { submitSupportTicketAction, type SupportState } from "@/app/support/actions";
import { SUPPORT_CATEGORY_LABELS, type SupportCategory } from "@/lib/support-ticket";

const INITIAL: SupportState = { ok: false, message: "" };
const FIELD = "w-full min-h-11 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-purple-500/60";
const SIZE = 56, EDGE = 8, DRAG_THRESHOLD = 6, STEP = 24, STORAGE_KEY = "noxia-support-bubble-pos";
type Pos = { x: number; y: number };
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

// Bulle flottante « Support & Partenariats » DÉPLAÇABLE : glisse la bulle (doigt ou souris) où tu veux ; sa position est mémorisée sur cet appareil.
// Un simple toucher ouvre ou ferme le formulaire. Au clavier : flèches pour la déplacer, Entrée pour l'ouvrir.
export function SupportBubble() {
  const pathname = usePathname();
  const inApp = pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory>("assistance");
  const [state, action, pending] = useActionState(submitSupportTicketAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);   // null = position par défaut (en bas à droite) avant la mesure de l'écran
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const bounds = useCallback((w: number, h: number) => ({ maxX: w - SIZE - EDGE, maxY: h - SIZE - EDGE }), []);
  const place = useCallback((p: Pos, w: number, h: number): Pos => { const b = bounds(w, h); return { x: clamp(p.x, EDGE, b.maxX), y: clamp(p.y, EDGE, b.maxY) }; }, [bounds]);
  const save = (p: Pos) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* stockage indisponible : position non mémorisée */ } };

  useEffect(() => {
    const w = window.innerWidth, h = window.innerHeight;
    setVp({ w, h });
    let start: Pos = { x: w - SIZE - 16, y: h - SIZE - (inApp ? 104 : 16) };
    try { const r = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Pos | null; if (r && Number.isFinite(r.x) && Number.isFinite(r.y)) start = r; } catch { /* valeur illisible : position par défaut */ }
    setPos(place(start, w, h));
    const onResize = () => { const nw = window.innerWidth, nh = window.innerHeight; setVp({ w: nw, h: nh }); setPos(p => (p ? place(p, nw, nh) : p)); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [inApp, place]);

  useEffect(() => { if (state.ok) formRef.current?.reset(); }, [state]);
  useEffect(() => { const k = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, moved: false };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPos(place({ x: d.x + dx, y: d.y + dy }, window.innerWidth, window.innerHeight));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current; drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* capture déjà relâchée */ }
    if (d?.moved) { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0); setPos(p => { if (p) save(p); return p; }); }
  }
  function onClick() { if (suppressClick.current) return; setOpen(o => !o); }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const dir: Record<string, Pos> = { ArrowLeft: { x: -STEP, y: 0 }, ArrowRight: { x: STEP, y: 0 }, ArrowUp: { x: 0, y: -STEP }, ArrowDown: { x: 0, y: STEP } };
    const d = dir[e.key]; if (!d || !pos) return;
    e.preventDefault();
    const next = place({ x: pos.x + d.x, y: pos.y + d.y }, window.innerWidth, window.innerHeight);
    setPos(next); save(next);
  }

  // Le formulaire s'ouvre vers le haut si la bulle est dans la moitié basse de l'écran, vers le bas sinon ; aligné à droite ou à gauche selon sa position.
  const below = pos ? pos.y < vp.h / 2 : false;
  const alignRight = pos ? pos.x + SIZE / 2 > vp.w / 2 : true;
  const style = pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: inApp ? 104 : 16 };

  return (
    <div className="fixed z-40 print:hidden" style={{ width: SIZE, height: SIZE, ...style }}>
      {open && (
        <section role="dialog" aria-label="Support et partenariats" className={`absolute ${below ? "top-[calc(100%+12px)]" : "bottom-[calc(100%+12px)]"} ${alignRight ? "right-0" : "left-0"} w-[min(92vw,22rem)] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b14]/90 p-4 shadow-2xl shadow-purple-500/10 backdrop-blur-md`}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div><h2 className="text-base font-semibold text-white">Support & Partenariats</h2><p className="text-xs text-white/60">Réponse rapide de l'équipe NOXIA.</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10">✕</button>
          </div>
          {state.ok ? <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">{state.message}</p> : (
            <form ref={formRef} action={action} className="space-y-2.5">
              <div className="grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Type de demande">
                {(Object.keys(SUPPORT_CATEGORY_LABELS) as SupportCategory[]).map(c => (
                  <label key={c} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${category === c ? "border-purple-500/60 bg-purple-500/10 text-white" : "border-white/10 text-white/70"}`}>
                    <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} className="accent-purple-500" />{SUPPORT_CATEGORY_LABELS[c]}
                  </label>
                ))}
              </div>
              <input name="name" placeholder="Ton nom (facultatif)" autoComplete="name" maxLength={80} className={FIELD} />
              <input name="email" type="email" required placeholder="Ton e-mail" autoComplete="email" maxLength={254} className={FIELD} />
              {category === "partnership" && <input name="company" required placeholder="Nom de l'entreprise" maxLength={120} className={FIELD} />}
              <textarea name="message" required minLength={10} maxLength={2000} rows={4} placeholder={category === "partnership" ? "Décris ta demande de publicité ou de partenariat…" : "Explique ton problème…"} className={`${FIELD} resize-none`} />
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" /> {/* champ piège anti-robots */}
              {state.message && <p role="alert" className="text-xs text-red-300">{state.message}</p>}
              <button type="submit" disabled={pending} className="min-h-11 w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Envoi…" : "Envoyer"}</button>
            </form>
          )}
        </section>
      )}
      <button type="button" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClick={onClick} onKeyDown={onKeyDown}
        aria-expanded={open} aria-label="Support et partenariats. Glisse pour déplacer, flèches du clavier pour déplacer, Entrée pour ouvrir." title="Glisse pour déplacer"
        style={{ touchAction: "none" }} className="grid h-14 w-14 cursor-grab select-none place-items-center rounded-full border border-white/15 bg-gradient-to-br from-purple-600 to-indigo-600 text-2xl text-white shadow-lg shadow-purple-500/30 transition-shadow hover:shadow-purple-500/50 active:cursor-grabbing">{open ? "✕" : "💬"}</button>
    </div>
  );
}
