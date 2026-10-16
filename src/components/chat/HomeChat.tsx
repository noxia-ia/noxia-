"use client";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendHomeMessageAction } from "@/app/dashboard/chat-actions";
import { chatMessageCreditCost } from "@/lib/generation-costs";
import type { ChatMessageView } from "@/modules/agents/types";
import type { PublicBanner } from "@/lib/banners";
import { Icon, type IconName } from "@/components/ui/Icon";
import { AdBanner } from "@/components/ads/AdBanner";
import { MemoryButton } from "@/components/agents/MemoryButton";
import { NoxiaVoiceControls } from "@/components/voice/NoxiaVoiceControls";
import { AttachMenu, type ChatPlugin } from "@/components/chat/AttachMenu";
import { MessageContent, stripChatImages } from "@/components/chat/MessageContent";
import { ChatOptionsMenu, type ChatOptionHandlers } from "@/components/chat/ChatOptionsMenu";
import { classifyFile, folderToZip, SERVER_SUPPORT, UNSUPPORTED_MESSAGE, type PickKind } from "@/lib/attachments/client";

const QUICK: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard/image", label: "Image", icon: "image" },
  { href: "/dashboard/video", label: "Vidéo", icon: "video" },
  { href: "/dashboard/code", label: "Code", icon: "code" },
];

// L'affichage vient UNIQUEMENT de la base (props). Aucune réponse n'est jamais fabriquée côté client.
// Pièce jointe en cours de préparation (avant l'envoi du message). L'aperçu d'image est local au navigateur ; le fichier n'est envoyé qu'au serveur, jamais public.
interface Draft { key: string; id?: string; kind: PickKind; name: string; size: number; preview?: string; progress: number; state: "uploading" | "ready" | "error"; error?: string }
const fmtSize = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`;

export function HomeChat({ firstName, conversationId, agentId, messages, active, banners, attachmentsEnabled = false, maxUploadMb = 4, options = {}, pinned = false, inProject = false, plugins: initialPlugins = [] }: {
  firstName: string; conversationId: string | null; agentId: string | null; messages: ChatMessageView[]; active: boolean; banners: PublicBanner[]; attachmentsEnabled?: boolean; maxUploadMb?: number;
  /** Actions du menu ⋯ à brancher sur le serveur (épingler, archiver, supprimer…). Partager et Rechercher fonctionnent déjà côté navigateur. */
  options?: Omit<ChatOptionHandlers, "share" | "search">; pinned?: boolean; inProject?: boolean; plugins?: ChatPlugin[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "credits"; text: string } | null>(null);
  const [voice, setVoice] = useState(false);
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deepThink, setDeepThink] = useState(false);
  const [plugins, setPlugins] = useState<ChatPlugin[]>(initialPlugins);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const bubbles = useRef(new Map<string, HTMLDivElement>());
  const uploading = drafts.some(d => d.state === "uploading");
  const readyDrafts = drafts.filter(d => d.state === "ready" && d.id);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const latestAssistant = stripChatImages([...messages].reverse().find(m => m.role === "assistant" && m.status === "completed")?.content ?? "");
  const empty = messages.length === 0 && !pendingText;

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, pendingText]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  function patchDraft(key: string, p: Partial<Draft>) { setDrafts(ds => ds.map(d => d.key === key ? { ...d, ...p } : d)); }
  function addError(file: { name: string; size: number }, kind: PickKind, error: string) {
    setDrafts(ds => [...ds, { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, kind, name: file.name, size: file.size, progress: 0, state: "error", error }]);
  }
  function addFiles(incoming: File[]) {
    setNotice(null);
    if (incoming.length === 0) return;
    if (drafts.length + incoming.length > 4) { setNotice({ kind: "error", text: "4 pièces jointes maximum par message." }); return; }
    for (const file of incoming) {
      const kind = classifyFile(file);
      if (!kind) { addError(file, "image", "Type non pris en charge (image, ZIP)."); continue; }
      if (!SERVER_SUPPORT[kind]) { addError(file, kind, UNSUPPORTED_MESSAGE[kind]); continue; } // PDF/RAR : refusés ici tant que le serveur ne les gère pas
      if (file.size > maxUploadMb * 1024 * 1024) { addError(file, kind, `Fichier trop volumineux (${maxUploadMb} Mo maximum).`); continue; }
      upload(file, kind);
    }
  }
  async function addFolder(list: File[]) {
    setNotice(null);
    if (drafts.length >= 4) { setNotice({ kind: "error", text: "4 pièces jointes maximum par message." }); return; }
    const r = await folderToZip(list, maxUploadMb * 1024 * 1024);
    if (!r.ok) { setNotice({ kind: "error", text: r.message }); return; }
    upload(r.file, "zip");
  }
  function upload(file: File, kind: PickKind) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setDrafts(ds => [...ds, { key, kind, name: file.name, size: file.size, progress: 0, state: "uploading", preview: kind === "image" ? URL.createObjectURL(file) : undefined }]);
    const xhr = new XMLHttpRequest(); // XMLHttpRequest : seul moyen d'afficher une vraie progression d'envoi
    xhr.open("POST", "/api/chat/attachments");
    xhr.upload.onprogress = e => { if (e.lengthComputable) patchDraft(key, { progress: Math.round((e.loaded / e.total) * 100) }); };
    xhr.onerror = () => patchDraft(key, { state: "error", error: "Envoi impossible. Vérifie ta connexion." });
    xhr.onload = () => {
      let body: { attachment?: { id: string }; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* réponse non JSON */ }
      if (xhr.status === 201 && body.attachment?.id) patchDraft(key, { state: "ready", progress: 100, id: body.attachment.id });
      else patchDraft(key, { state: "error", error: body.error ?? "Envoi refusé." });
    };
    const fd = new FormData(); fd.append("file", file);
    xhr.send(fd);
  }
  function removeDraft(d: Draft) {
    if (d.preview) URL.revokeObjectURL(d.preview);
    setDrafts(ds => ds.filter(x => x.key !== d.key));
    if (d.id) void fetch(`/api/chat/attachments?id=${encodeURIComponent(d.id)}`, { method: "DELETE" }).catch(() => undefined);
  }

  function send(forced?: string) {
    if (uploading) return;
    const ids = readyDrafts.map(d => d.id as string);
    const fallback = readyDrafts.some(d => d.kind === "zip") ? "Analyse ce projet et explique-moi ce qu'il contient." : "Analyse cette image.";
    const text = (forced ?? input).trim() || (ids.length ? fallback : "");
    if (!text || pending) return;
    setNotice(null);
    start(async () => {
      setPendingText(text);
      const r = await sendHomeMessageAction(conversationId, text, ids);
      if (r.status === "success") { setInput(""); drafts.forEach(d => d.preview && URL.revokeObjectURL(d.preview)); setDrafts([]); }
      else setNotice({ kind: r.status === "insufficient_credits" ? "credits" : "error", text: r.message });
      setPendingText(null);
      if (r.conversationId) {
        if (r.conversationId !== conversationId) router.replace(`/dashboard?c=${r.conversationId}`);
        router.refresh();
      }
    });
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  }
  // Recherche locale : uniquement dans les messages déjà affichés (rien n'est envoyé au serveur).
  const q = query.trim().toLowerCase();
  const matches = finding && q ? messages.filter(m => m.status === "completed" && m.content.toLowerCase().includes(q)).map(m => m.id) : [];
  useEffect(() => { const id = matches[hit]; if (id) bubbles.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [hit, q]); // eslint-disable-line react-hooks/exhaustive-deps
  function closeFind() { setFinding(false); setQuery(""); setHit(0); }
  async function share() {
    const url = window.location.href;
    try { if (navigator.share) { await navigator.share({ title: "Discussion NOXIA", url }); return; } } catch (e) { if ((e as Error).name === "AbortError") return; }
    await navigator.clipboard.writeText(url); setNotice({ kind: "error", text: "Lien de la discussion copié." });
  }
  const cost = chatMessageCreditCost(readyDrafts.map(d => d.kind as "image" | "zip")); // seuls image/zip peuvent être « prêts »

  return (
    <div className="nx-chat">
      <div className="nx-chat-head">
        <ChatOptionsMenu pinned={pinned} inProject={inProject} handlers={{ ...options, share, search: () => setFinding(true) }} disabled={!conversationId} />
      </div>
      {finding && (
        <div className="nx-find" role="search">
          <Icon name="search" size={18} />
          <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setHit(0); }} placeholder="Rechercher dans cette discussion" aria-label="Rechercher dans cette discussion"
            onKeyDown={e => { if (e.key === "Escape") closeFind(); else if (e.key === "Enter") { e.preventDefault(); if (matches.length) setHit(h => (h + (e.shiftKey ? matches.length - 1 : 1)) % matches.length); } }} />
          <span className="nx-find-count" aria-live="polite">{query.trim() ? (matches.length ? `${hit + 1}/${matches.length}` : "Aucun résultat") : ""}</span>
          <button type="button" className="nx-attach-x" onClick={closeFind} aria-label="Fermer la recherche"><Icon name="close" size={16} /></button>
        </div>
      )}
      <div className="nx-chat-body">
        {empty ? (
          <div className="nx-welcome">
            <h1>Bonjour {firstName}</h1>
            <p>Que veux-tu créer ?</p>
            <div className="nx-quick" role="group" aria-label="Choisir un mode">
              <button type="button" className="nx-chip is-on" onClick={() => box.current?.focus()}><Icon name="chat" size={18} /> Discuter</button>
              {QUICK.map(q => <Link key={q.href} href={q.href} className="nx-chip"><Icon name={q.icon} size={18} /> {q.label}</Link>)}
              <button type="button" className="nx-chip" aria-pressed={voice} onClick={() => setVoice(v => !v)}><Icon name="mic" size={18} /> Voix</button>
            </div>
          </div>
        ) : (
          <div role="log" aria-live="polite" className="nx-thread">
            {messages.map(m => (
              <div key={m.id} className={`nx-msg ${m.role === "user" ? "is-user" : "is-bot"}`}>
                <div ref={el => { if (el) bubbles.current.set(m.id, el); else bubbles.current.delete(m.id); }} className={`nx-bubble ${m.status === "failed" ? "is-failed" : ""} ${matches.includes(m.id) ? (matches[hit] === m.id ? "is-hit-current" : "is-hit") : ""}`}>
                  {m.status === "pending" ? "Réponse en cours…" : m.status === "failed" ? `Échec : ${m.error ?? "NOXIA n’a pas répondu."} Aucun crédit n’a été débité.` : <MessageContent text={m.content} />}
                </div>
                {m.role === "user" && m.status === "completed" && conversationId && agentId && <MemoryButton agentId={agentId} conversationId={conversationId} content={m.content} />}
              </div>
            ))}
            {pendingText && <div className="nx-msg is-user"><div className="nx-bubble is-ghost">{pendingText}</div></div>}
            {pending && <p className="nx-typing" role="status">NOXIA réfléchit…</p>}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="nx-composer-wrap">
        <AdBanner banners={banners} />
        {voice && <div className="nx-voice"><NoxiaVoiceControls text={latestAssistant} onTranscript={setInput} onVoiceSubmit={v => send(v)} thinking={pending} disabled={!active || pending} /></div>}
        {notice && (
          <p role="alert" className="nx-notice">{notice.text}{notice.kind === "credits" && <> <Link href="/dashboard/credits">Obtenir des crédits</Link></>}</p>
        )}
        {drafts.length > 0 && (
          <ul className="nx-attach-list" aria-label="Pièces jointes">
            {drafts.map(d => (
              <li key={d.key} className={`nx-attach ${d.state === "error" ? "is-error" : ""}`}>
                {d.preview ? <img src={d.preview} alt="" className="nx-attach-thumb" /> : <span className="nx-attach-thumb nx-attach-file" aria-hidden="true">{d.kind === "image" ? "IMG" : d.kind.toUpperCase()}</span>}
                <span className="nx-attach-meta">
                  <span className="nx-attach-name">{d.name}</span>
                  <span className="nx-attach-sub">{d.state === "error" ? d.error : d.state === "uploading" ? `Envoi… ${d.progress} %` : `${d.kind === "zip" ? "Archive ZIP" : (d.name.split(".").pop() ?? "image").toUpperCase()} · ${fmtSize(d.size)} · prêt`}</span>
                  {d.state === "uploading" && <span className="nx-attach-bar" role="progressbar" aria-valuenow={d.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${d.progress}%` }} /></span>}
                </span>
                <button type="button" className="nx-attach-x" onClick={() => removeDraft(d)} aria-label={`Retirer ${d.name}`}><Icon name="close" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="nx-composer">
          <AttachMenu disabled={!active || pending} uploadsEnabled={attachmentsEnabled} deepThink={deepThink} onDeepThinkChange={setDeepThink}
            onPickImages={files => addFiles(files)} onPickFiles={addFiles} onPickFolder={list => void addFolder(list)}
            plugins={plugins} onTogglePlugin={(id, on) => setPlugins(ps => ps.map(p => p.id === id ? { ...p, enabled: on } : p))} />
          {deepThink && <span className="nx-mode-chip"><Icon name="brain" size={14} /><span>Réflexion</span><button type="button" onClick={() => setDeepThink(false)} aria-label="Désactiver la réflexion approfondie"><Icon name="close" size={14} /></button></span>}
          <textarea ref={box} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} rows={1} maxLength={4000} placeholder="Écris ici…" aria-label="Ton message" disabled={!active} />
          <button type="button" className="nx-icon-btn" aria-pressed={voice} aria-label="Parler à NOXIA" onClick={() => setVoice(v => !v)}><Icon name="mic" size={20} /></button>
          <button type="button" className="nx-send" onClick={() => send()} disabled={pending || uploading || !active || (!input.trim() && readyDrafts.length === 0)} aria-label="Envoyer"><Icon name="send" size={20} /></button>
        </div>
        <p className="nx-legal">{cost} crédit{cost > 1 ? "s" : ""} par message. NOXIA AI est réservé aux 15 ans et plus. Contenus sexuels, impliquant des mineurs ou des personnes réelles sans leur accord : interdits.</p>
      </div>
    </div>
  );
}
