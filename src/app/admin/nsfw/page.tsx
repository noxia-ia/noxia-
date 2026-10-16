import { requireAdmin } from "@/lib/auth";
import { fetchContentSettings, fetchNsfwStats } from "@/lib/admin/nsfw";
import { NsfwSettingsForm } from "./NsfwSettingsForm";

export default async function AdminNsfwPage() {
  const { supabase } = await requireAdmin();
  const [settings, stats] = await Promise.all([
    fetchContentSettings(supabase),
    fetchNsfwStats(supabase, 30),
  ]);

  return (
    <>
      <h1 className="font-display text-3xl text-noxia-silver">Contenus sensibles & NSFW</h1>
      <p className="mt-2 max-w-2xl text-sm text-noxia-ash">
        Paramètres globaux et compteurs de sécurité. Les conversations utilisateurs ne sont jamais
        lues ni exposées ici. La vérification d&apos;âge s&apos;applique au niveau des accès et des
        paiements, pas au contenu des messages.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Blocages contenu (30 j)", stats.content_blocked_generations],
          ["Refus âge (30 j)", stats.age_restricted_generations],
          ["Utilisateurs âge vérifié", stats.age_verified_users],
          ["Utilisateurs non vérifiés", stats.age_unverified_users],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-noxia-silver/15 bg-noxia-night p-4">
            <dt className="text-xs text-noxia-ash">{label}</dt>
            <dd className="mt-1 font-display text-2xl text-noxia-silver">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10 rounded-md border border-noxia-silver/15 bg-noxia-night p-4 sm:p-5">
        <h2 className="font-display text-lg text-noxia-silver">Paramètres</h2>
        <p className="mt-1 text-xs text-noxia-ash">
          Mode politique : <strong className="text-noxia-silver">{settings.content_policy_mode}</strong>
          {" "}(imposé côté serveur). Si NSFW est activé, la vérification d&apos;âge est obligatoire.
        </p>
        <div className="mt-6">
          <NsfwSettingsForm initial={settings} />
        </div>
      </section>

      <section className="mt-8 rounded-md border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-noxia-ash">
        <h2 className="font-display text-base text-amber-200/90">Garde-fous légaux</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Aucun accès admin au texte des messages, prompts ou mémoires d&apos;agents.</li>
          <li>La modération serveur bloque CSAM / mineurs indépendamment de ces réglages.</li>
          <li>Le checkout appelle <code className="text-noxia-silver">user_payment_eligibility()</code> pour vérifier l&apos;âge sans lire les chats.</li>
          <li>Les mini-séries NSFW restent soumises aux mêmes règles d&apos;âge et de plan.</li>
        </ul>
      </section>
    </>
  );
}
