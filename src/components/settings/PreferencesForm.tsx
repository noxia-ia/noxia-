"use client";

import { useActionState, useEffect, useState } from "react";
import { savePreferencesAction, type SettingsState, type UserPreferences } from "@/app/dashboard/settings/actions";
import type { MessageKey } from "@/lib/i18n/messages";

type Labels = Record<MessageKey, string>;
const input = "mt-1 min-h-11 w-full rounded-sm border border-noxia-silver/20 bg-noxia-night px-4 py-3 text-base text-noxia-silver focus:border-noxia-violet";
const idle: SettingsState = { status: "idle" };

function applyTheme(theme: UserPreferences["theme"]) {
  const root = document.documentElement;
  root.dataset.noxiaTheme = theme;
  if (theme === "light") root.classList.add("noxia-theme-light");
  else if (theme === "dark") root.classList.remove("noxia-theme-light");
  else root.classList.toggle("noxia-theme-light", window.matchMedia("(prefers-color-scheme: light)").matches);
}

export function PreferencesForm({ labels, initial }: { labels: Labels; initial: UserPreferences }) {
  const [state, action, pending] = useActionState(savePreferencesAction, idle);
  const [theme, setTheme] = useState(initial.theme);

  useEffect(() => { applyTheme(initial.theme); }, [initial.theme]);
  useEffect(() => {
    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const update = () => applyTheme("system");
      media.addEventListener?.("change", update);
      return () => media.removeEventListener?.("change", update);
    }
  }, [theme]);

  return (
    <form action={action} onChange={(e) => {
      const el = e.target as unknown as HTMLInputElement | HTMLSelectElement;
      if (el.name === "theme") {
        const next = el.value as UserPreferences["theme"];
        setTheme(next);
        applyTheme(next);
      }
    }} className="space-y-5">
      <div>
        <label className="block text-sm text-noxia-ash">{labels["settings.theme"]}
          <select name="theme" defaultValue={initial.theme} className={input}>
            <option value="dark">{labels["settings.themeDark"]}</option>
            <option value="light">{labels["settings.themeLight"]}</option>
            <option value="system">{labels["settings.themeSystem"]}</option>
          </select>
        </label>
      </div>

      <label className="flex min-h-12 items-center justify-between gap-4 border-t border-noxia-silver/10 pt-4">
        <span><span className="block text-sm text-noxia-silver">{labels["settings.notifications"]}</span><span className="text-xs text-noxia-ash">{labels["settings.notificationsHint"]}</span></span>
        <input type="checkbox" name="notifications_enabled" defaultChecked={initial.notifications_enabled} className="h-5 w-5 accent-noxia-violet" />
      </label>

      <div className="grid gap-4 border-t border-noxia-silver/10 pt-4 md:grid-cols-2">
        <label className="block text-sm text-noxia-ash">{labels["settings.voice"]}
          <select name="voice_preset" defaultValue={initial.voice_preset} className={input}>
            <option value="nova">{labels["settings.voiceNova"]}</option>
            <option value="calm">{labels["settings.voiceCalm"]}</option>
            <option value="warm">{labels["settings.voiceWarm"]}</option>
            <option value="energetic">{labels["settings.voiceEnergetic"]}</option>
          </select>
        </label>
        <label className="block text-sm text-noxia-ash">{labels["settings.voiceSpeed"]}
          <select name="voice_speed" defaultValue={String(initial.voice_speed)} className={input}>
            <option value="0.75">0,75×</option><option value="1">1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="2">2×</option>
          </select>
        </label>
      </div>

      <label className="flex min-h-12 items-center justify-between gap-4 border-t border-noxia-silver/10 pt-4">
        <span><span className="block text-sm text-noxia-silver">{labels["settings.voiceAutoplay"]}</span><span className="text-xs text-noxia-ash">{labels["settings.voiceAutoplayHint"]}</span></span>
        <input type="checkbox" name="voice_autoplay" defaultChecked={initial.voice_autoplay} className="h-5 w-5 accent-noxia-violet" />
      </label>

      <div className="grid gap-4 border-t border-noxia-silver/10 pt-4 md:grid-cols-2">
        <label className="block text-sm text-noxia-ash">{labels["settings.noxia"]}
          <select name="response_style" defaultValue={initial.response_style} className={input}>
            <option value="balanced">{labels["settings.styleBalanced"]}</option>
            <option value="concise">{labels["settings.styleConcise"]}</option>
            <option value="creative">{labels["settings.styleCreative"]}</option>
            <option value="professional">{labels["settings.styleProfessional"]}</option>
            <option value="friendly">{labels["settings.styleFriendly"]}</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 self-end pb-3 text-sm text-noxia-silver">
          <input type="checkbox" name="memory_enabled" defaultChecked={initial.memory_enabled} className="h-5 w-5 accent-noxia-violet" />
          {labels["settings.memoryEnabled"]}
        </label>
      </div>

      {state.status !== "idle" && <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-red-300" : "text-noxia-blue"}`}>
        {state.status === "ok" ? labels[state.key] : (state.key ? labels[state.key] : state.message)}
      </p>}
      <button disabled={pending} className="min-h-11 rounded-sm bg-noxia-violet px-5 py-2 text-sm font-medium text-white shadow-glow disabled:opacity-60">
        {pending ? labels["settings.saving"] : labels["settings.savePreferences"]}
      </button>
    </form>
  );
}
