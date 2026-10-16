"use client";
import { useId, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useDismiss, menuKeyDown } from "@/hooks/useDismiss";
import { FILE_ACCEPT } from "@/lib/attachments/client";

export interface ChatPlugin { id: string; name: string; description?: string; enabled: boolean }

interface Props {
  disabled?: boolean;
  /** false = les envois de fichiers sont coupés côté serveur : les lignes d'envoi sont grisées, le mode réflexion reste utilisable. */
  uploadsEnabled?: boolean;
  deepThink: boolean;
  onDeepThinkChange: (on: boolean) => void;
  onPickImages: (files: File[], source: "camera" | "photos") => void;
  onPickFiles: (files: File[]) => void;
  onPickFolder: (files: File[]) => void;
  plugins?: ChatPlugin[];
  onTogglePlugin?: (id: string, enabled: boolean) => void;
}

function Item({ icon, label, hint, onClick, off }: { icon: IconName; label: string; hint?: string; onClick: () => void; off?: boolean }) {
  return (
    <button type="button" role="menuitem" className="nx-pop-item" disabled={off} onClick={onClick}>
      <span className="nx-pop-ico"><Icon name={icon} size={18} /></span>
      <span className="nx-pop-text"><span>{label}</span>{hint && <small>{hint}</small>}</span>
    </button>
  );
}

// Menu « + » du compositeur : Caméra · Photos · Fichiers (PDF, ZIP, RAR, dossier) · Plugins · Réflexion approfondie.
// Sur ordinateur c'est une bulle au-dessus du « + » ; sur mobile, une feuille ancrée en bas (voir .nx-pop dans globals.css).
export function AttachMenu({ disabled, uploadsEnabled = true, deepThink, onDeepThinkChange, onPickImages, onPickFiles, onPickFolder, plugins = [], onTogglePlugin }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "plugins">("main");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const camera = useRef<HTMLInputElement>(null), photos = useRef<HTMLInputElement>(null), files = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const close = () => { setOpen(false); setView("main"); };
  useDismiss(open, close, [root], trigger);

  function toggle() { if (open) close(); else { setView("main"); setOpen(true); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()); } }
  function read(e: React.ChangeEvent<HTMLInputElement>, fn: (f: File[]) => void) {
    const list = Array.from(e.target.files ?? []); e.target.value = ""; // permet de rechoisir le même fichier
    if (list.length) { close(); fn(list); }
  }
  const activePlugins = plugins.filter(p => p.enabled).length;
  const up = !uploadsEnabled;

  return (
    <div className="nx-pop-root" ref={root}>
      <button ref={trigger} type="button" className="nx-icon-btn" aria-label="Ajouter" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled} onClick={toggle}>
        <Icon name="plus" size={20} className={open ? "nx-rot" : ""} />
      </button>

      {open && <div className="nx-pop-backdrop" aria-hidden onClick={close} />}
      {open && (
        <div id={menuId} className="nx-pop nx-pop-up" role="menu" aria-label="Ajouter à la discussion" onKeyDown={menuKeyDown}>
          {view === "main" ? (
            <>
              {up && <p className="nx-pop-note" role="status">Les envois de fichiers ne sont pas activés pour le moment.</p>}
              <Item icon="camera" label="Caméra" hint="Prendre une photo" off={up} onClick={() => camera.current?.click()} />
              <Item icon="image" label="Photos" hint="PNG, JPEG, WebP" off={up} onClick={() => photos.current?.click()} />
              <Item icon="files" label="Fichiers" hint="PDF, ZIP, RAR" off={up} onClick={() => files.current?.click()} />
              <Item icon="folder" label="Dossier" hint="Envoyé comme archive ZIP" off={up} onClick={() => folder.current?.click()} />
              <div className="nx-pop-sep" role="separator" />
              <button type="button" role="menuitem" className="nx-pop-item" onClick={() => setView("plugins")} aria-haspopup="true">
                <span className="nx-pop-ico"><Icon name="plug" size={18} /></span>
                <span className="nx-pop-text"><span>Plugins</span><small>{plugins.length === 0 ? "Aucun disponible" : `${activePlugins} actif${activePlugins > 1 ? "s" : ""}`}</small></span>
                <Icon name="chevron" size={16} className="nx-pop-chev" />
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={deepThink} className="nx-pop-item" onClick={() => onDeepThinkChange(!deepThink)}>
                <span className="nx-pop-ico"><Icon name="brain" size={18} /></span>
                <span className="nx-pop-text"><span>Réflexion approfondie</span><small>Réponses plus posées et détaillées</small></span>
                <span className={`nx-switch ${deepThink ? "is-on" : ""}`} aria-hidden><i /></span>
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="nx-pop-item nx-pop-back" onClick={() => setView("main")}>
                <span className="nx-pop-ico"><Icon name="chevron" size={18} className="nx-rot-left" /></span><span className="nx-pop-text"><span>Plugins</span></span>
              </button>
              <div className="nx-pop-sep" role="separator" />
              {plugins.length === 0 && <p className="nx-pop-note" role="status">Aucun plugin n’est disponible pour le moment.</p>}
              {plugins.map(p => (
                <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={p.enabled} className="nx-pop-item" onClick={() => onTogglePlugin?.(p.id, !p.enabled)}>
                  <span className="nx-pop-ico"><Icon name="plug" size={18} /></span>
                  <span className="nx-pop-text"><span>{p.name}</span>{p.description && <small>{p.description}</small>}</span>
                  <span className={`nx-switch ${p.enabled ? "is-on" : ""}`} aria-hidden><i /></span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={e => read(e, f => onPickImages(f, "camera"))} />
      <input ref={photos} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={e => read(e, f => onPickImages(f, "photos"))} />
      <input ref={files} type="file" hidden multiple accept={FILE_ACCEPT} onChange={e => read(e, onPickFiles)} />
      <input ref={folder} type="file" hidden multiple onChange={e => read(e, onPickFolder)} {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
    </div>
  );
}
