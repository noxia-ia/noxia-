import type { ReactNode } from "react";

// Affiche le texte d'un message du chat. Les images créées par NOXIA (![texte](/api/media/image?path=…)) sont rendues en vraies images ;
// SEULE la route privée de NOXIA est acceptée (jamais d'image externe, donc aucun pixel espion ni contenu distant).
const IMAGE_MD = /!\[([^\]]{0,120})\]\((\/api\/media\/image\?path=[^)\s]{1,400})\)/g;

export function stripChatImages(text: string): string { return text.replace(IMAGE_MD, "").replace(/\n{3,}/g, "\n\n").trim(); }

export function MessageContent({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0, k = 0, m: RegExpExecArray | null;
  IMAGE_MD.lastIndex = 0;
  while ((m = IMAGE_MD.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={`i${k++}`} href={m[2]} target="_blank" rel="noreferrer" className="mt-2 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m[2]} alt={m[1] || "Image créée par NOXIA"} loading="lazy" className="max-h-[420px] w-full max-w-md rounded-2xl border border-white/10 object-contain shadow-lg shadow-purple-500/10" />
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
