"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useDismiss, menuKeyDown } from "@/hooks/useDismiss";

export type ChatOptionId = "share" | "pin" | "unproject" | "files" | "search" | "archive" | "delete";
export type ChatOptionHandlers = Partial<Record<ChatOptionId, () => void | Promise<void>>>;

interface Props {
  /** Action de chaque ligne. Une ligne sans action est grisée (fonction pas encore branchée), jamais cachée. */
  handlers: ChatOptionHandlers;
  pinned?: boolean;
  /** « Retirer du projet » n'apparaît que si la discussion appartient à un projet. */
  inProject?: boolean;
  disabled?: boolean;
}

const ROWS: { id: ChatOptionId; icon: IconName; label: string; danger?: boolean; group: number }[] = [
  { id: "share", icon: "share", label: "Partager", group: 0 },
  { id: "pin", icon: "pin", label: "Épingler", group: 0 },
  { id: "unproject", icon: "folderMinus", label: "Retirer du projet", group: 0 },
  { id: "files", icon: "files", label: "Fichiers envoyés", group: 1 },
  { id: "search", icon: "search", label: "Rechercher dans le chat", group: 1 },
  { id: "archive", icon: "archive", label: "Archiver", group: 2 },
  { id: "delete", icon: "trash", label: "Supprimer", danger: true, group: 2 },
];

// Menu « ⋯ » en haut à droite de la discussion. Ordinateur : liste déroulante sous le bouton. Mobile : feuille ancrée en bas.
export function ChatOptionsMenu({ handlers, pinned = false, inProject = false, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<ChatOptionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => setOpen(false);
  useDismiss(open, close, [root], trigger);

  async function run(id: ChatOptionId) {
    const fn = handlers[id]; if (!fn) return;
    if (id === "delete") { setOpen(false); setConfirming(true); return; } // la suppression demande toujours une confirmation
    setError(null); setBusy(id);
    try { await fn(); setOpen(false); }
    catch { setError("Action impossible pour le moment. Réessaie."); }
    finally { setBusy(null); }
  }

  return (
    <div className="nx-pop-root" ref={root}>
      <button ref={trigger} type="button" className="nx-icon-btn" aria-label="Options de la discussion" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled}
        onClick={() => { setError(null); setOpen(v => !v); if (!open) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()); }}>
        <Icon name="dots" size={20} className="nx-rot-90" />
      </button>

      {open && <div className="nx-pop-backdrop" aria-hidden onClick={close} />}
      {open && (
        <div id={menuId} className="nx-pop nx-pop-down" role="menu" aria-label="Options de la discussion" onKeyDown={menuKeyDown}>
          {ROWS.filter(r => r.id !== "unproject" || inProject).map((r, i, all) => {
            const label = r.id === "pin" && pinned ? "Désépingler" : r.label;
            const off = !handlers[r.id] || busy !== null;
            return (
              <div key={r.id} style={{ display: "contents" }}>
                {i > 0 && all[i - 1].group !== r.group && <div className="nx-pop-sep" role="separator" />}
                <button type="button" role="menuitem" className={`nx-pop-item ${r.danger ? "is-danger" : ""}`} disabled={off} aria-busy={busy === r.id} onClick={() => run(r.id)} title={!handlers[r.id] ? "Bientôt disponible" : undefined}>
                  <span className="nx-pop-ico"><Icon name={r.id === "pin" && pinned ? "pin" : r.icon} size={18} /></span>
                  <span className="nx-pop-text"><span>{label}</span></span>
                </button>
              </div>
            );
          })}
          {error && <p className="nx-pop-note is-error" role="alert">{error}</p>}
        </div>
      )}

      {confirming && <ConfirmDelete onCancel={() => { setConfirming(false); trigger.current?.focus(); }} onConfirm={async () => { await handlers.delete?.(); setConfirming(false); }} />}
    </div>
  );
}

function ConfirmDelete({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId(), descId = useId();
  useEffect(() => {
    cancelBtn.current?.focus(); // focus sur « Annuler » : la suppression n'est jamais l'action par défaut
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
      if (e.key === "Tab") { // le focus reste enfermé dans la boîte de dialogue
        const f = Array.from(box.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="nx-modal-wrap" onPointerDown={e => { if (e.target === e.currentTarget && !pending) onCancel(); }}>
      <div ref={box} className="nx-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <h2 id={titleId}>Supprimer cette discussion ?</h2>
        <p id={descId}>Elle sera définitivement supprimée, avec tous ses messages. Cette action est irréversible.</p>
        {failed && <p role="alert" className="nx-pop-note is-error">La suppression a échoué. Réessaie.</p>}
        <div className="nx-modal-actions">
          <button ref={cancelBtn} type="button" className="nx-btn" onClick={onCancel} disabled={pending}>Annuler</button>
          <button type="button" className="nx-btn is-danger" disabled={pending} onClick={async () => { setPending(true); setFailed(false); try { await onConfirm(); } catch { setFailed(true); setPending(false); } }}>{pending ? "Suppression…" : "Supprimer"}</button>
        </div>
      </div>
    </div>
  );
}
