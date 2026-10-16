import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { getCurrentSubscription, effectiveStatus } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";
import { ENABLED_LOCALES, CURRENCIES, countryOptions, normalizeLocale, normalizeCurrency } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";
import { ProfileForm, RegionForm, PasswordForm, DeleteAccountForm } from "@/components/settings/SettingsForms";
import { PreferencesForm } from "@/components/settings/PreferencesForm";
import type { UserPreferences } from "./actions";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-md border border-noxia-silver/15 bg-noxia-night p-5 md:p-6"><h2 className="font-display text-xl text-noxia-silver">{title}</h2><div className="mt-4">{children}</div></section>;
}
export default async function SettingsPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const locale = normalizeLocale(profile?.locale);
  const labels = getMessages(locale);
  const sub = await getCurrentSubscription(supabase, user.id);
  const planId = effectiveStatus(sub) === "active" ? (sub?.plan ?? "free") : "free";
  const name = profile?.full_name || (user.user_metadata?.full_name as string | undefined) || "";
  const { data: storedPreferences } = await supabase.from("user_preferences").select("theme,notifications_enabled,voice_preset,voice_speed,voice_autoplay,response_style,memory_enabled").eq("user_id", user.id).maybeSingle();
  const preferences: UserPreferences = {
    theme: storedPreferences?.theme === "light" || storedPreferences?.theme === "system" ? storedPreferences.theme : "dark",
    notifications_enabled: storedPreferences?.notifications_enabled ?? true,
    voice_preset: ["nova","calm","warm","energetic"].includes(storedPreferences?.voice_preset ?? "") ? storedPreferences!.voice_preset : "nova",
    voice_speed: Number(storedPreferences?.voice_speed ?? 1),
    voice_autoplay: storedPreferences?.voice_autoplay ?? true,
    response_style: ["balanced","concise","creative","professional","friendly"].includes(storedPreferences?.response_style ?? "") ? storedPreferences!.response_style : "balanced",
    memory_enabled: storedPreferences?.memory_enabled ?? true,
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-5 md:p-10">
      <div>
        <h1 className="font-display text-3xl text-noxia-silver">{labels["settings.title"]}</h1>
        <p className="mt-2 text-noxia-ash">{labels["settings.intro"]}</p>
      </div>
      <Section title={labels["settings.profile"]}><ProfileForm labels={labels} name={name} email={profile?.email ?? user.email ?? ""} /></Section>
      <Section title={labels["settings.region"]}>
        <RegionForm labels={labels} countries={countryOptions(locale)} locales={ENABLED_LOCALES.map(l => ({ value: l.code, label: l.label }))}
          currencies={CURRENCIES.map(c => ({ value: c.code, label: c.label }))} country={profile?.country_code ?? ""} locale={locale} currency={normalizeCurrency(profile?.display_currency)} />
      </Section>
      <Section title={labels["settings.account"]}>
        <PasswordForm labels={labels} />
        <div className="mt-6 border-t border-noxia-silver/10 pt-4">
          <p className="text-sm text-noxia-silver">{labels["settings.delete"]}</p>
          <p className="mt-1 text-xs text-noxia-ash">{labels["settings.deleteWarning"]}</p>
          <DeleteAccountForm labels={labels} />
        </div>
      </Section>
      <Section title={labels["settings.plan"]}>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-noxia-ash">{labels["settings.planCurrent"]}</dt><dd className="mt-1 text-noxia-silver">{PLANS[planId].name}</dd></div>
          <div><dt className="text-noxia-ash">{labels["settings.credits"]}</dt><dd className="mt-1 text-noxia-silver">{profile?.credits ?? 0}</dd></div>
        </dl>
        <Link href="/dashboard/abonnements" className="mt-4 inline-flex min-h-11 items-center rounded-sm border border-noxia-silver/30 px-4 text-sm text-noxia-silver hover:border-noxia-violet hover:text-white">{labels["settings.manage"]}</Link>
      </Section>
      <Section title="Support NOXIA"><div className="flex flex-wrap gap-2"><a href="https://wa.me/22892688660" target="_blank" rel="noreferrer" className="min-h-11 rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">WhatsApp +228 92 68 86 60</a><a href="mailto:support.noxia@gmail.com" className="min-h-11 rounded-sm border border-noxia-silver/20 px-4 py-2 text-sm text-noxia-silver">support.noxia@gmail.com</a></div><p className="mt-2 text-xs text-noxia-ash">Support, achat de crédits et demandes de publicité.</p></Section>
      <Section title={labels["settings.prefs"]}>
        <PreferencesForm labels={labels} initial={preferences} />
      </Section>
    </main>
  );
}
