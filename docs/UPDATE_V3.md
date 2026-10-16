# Mise à jour v3 : identité, support, design, voix, fournisseurs

## À faire, dans cet ordre
1. **Supabase** : SQL Editor → exécuter `supabase/migrations/0055_support_and_jobs.sql` (après 0054).
2. **Netlify → Environment variables** (puis redéployer) :
```
AGENT_PROVIDER=cloudflare
CODE_PROVIDER=cloudflare
IMAGE_PROVIDER=pollinations
VIDEO_PROVIDER=pollinations
MUSIC_PROVIDER=elevenlabs        # voir « Suno » plus bas : NE PAS mettre suno
STORAGE_PROVIDER=supabase-storage

POLLINATIONS_API_KEY=...         # clé de gen.pollinations.ai (enter.pollinations.ai)
POLLINATIONS_MODEL_VIDEO=...     # modèle vidéo : à choisir dans la liste gen.pollinations.ai/video/models
POLLINATIONS_MODEL_IMAGE=flux    # facultatif (« flux » par défaut)
POLLINATIONS_MODEL_IMAGE_ANIME=  # facultatif : modèle utilisé pour le style « anime » (nom exact dans gen.pollinations.ai/image/models)

NOXIA_JOB_SECRET=...             # NOUVEAU : au moins 32 caractères aléatoires ; active la vidéo en tâche de fond
NOXIA_SITE_URL=https://ton-site.netlify.app   # NOUVEAU : adresse https du site (sinon l'URL fournie par Netlify est utilisée)
```
3. Vérifier que `SUPABASE_SECRET_KEY` et `NEXT_PUBLIC_SUPABASE_URL` existent aussi (la fonction de fond en a besoin).
4. Pousser sur GitHub : Netlify détecte automatiquement `netlify/functions/video-render-background.mts`.

## Ce qui est livré
| Demande | Fichiers |
|---|---|
| Identité du créateur | `src/lib/ai/identity.ts`, `providers/agents/shared.ts` |
| Bulle Support & Partenariats | `components/support/SupportBubble.tsx`, `app/support/actions.ts`, `lib/support-ticket.ts`, `app/admin/support/page.tsx`, migration 0055 |
| Admin | déjà conforme (voir ci-dessous) + `lib/auth.ts` (redirection vers `/`) |
| Design Glassmorphism | `styles/globals.css` (classe `.nx-ui2`), `components/shell/AppShell.tsx` |
| Orbe vocale | `components/voice/VoiceOrb.tsx`, `NoxiaVoiceControls.tsx`, `globals.css` |
| Image Pollinations | `lib/ai/providers/image/pollinations.ts`, `lib/providers/register.ts` |
| Vidéo asynchrone | `netlify/functions/video-render-background.mts`, `lib/jobs/sign.ts`, `providers/video/pollinations.ts`, `components/video/VideoHistory.tsx`, migration 0055 |

## Limites à connaître
- **Suno : non branché.** Suno ne propose pas d'API publique officielle (vérifié en 2026) ; seuls des intermédiaires non officiels existent (risque contractuel, juridique et de continuité). Aucun fournisseur Suno n'est inventé : la musique reste sur ElevenLabs (`MUSIC_PROVIDER=elevenlabs`). Si `MUSIC_PROVIDER=suno` est défini sans fournisseur, le module musique répond « aucun fournisseur disponible ».
- **Deepgram Aura ne parle pas français** (aura-1 et aura-2-en : anglais ; aura-2-es : espagnol). Pour le français, la voix passe par le modèle défini dans `CLOUDFLARE_MODEL_TTS` et, en cas d'échec, par la synthèse vocale du navigateur (voix française de l'appareil). Transcription : Whisper turbo de Cloudflare par défaut (bon en français) ; `CLOUDFLARE_MODEL_STT=@cf/deepgram/nova-3` n'a pas été testé avec ce code.
- **Latence < 500 ms : non garantie.** Le parcours enchaîne capture micro, transcription, réponse du modèle et synthèse ; la durée dépend de Cloudflare et du réseau.
- **Voix = 5 crédits par réponse parlée** (barème v2) : en conversation vocale continue, chaque réponse de NOXIA parlée par le serveur est débitée. La synthèse du navigateur (repli) est gratuite.
- **Image Pollinations** : réponse synchrone, délai propre de 24 s. Si Netlify coupe plus tôt (limite de ta formule), la génération échoue proprement ; le modèle `flux` et les paramètres viennent de la documentation publique, non testés ici.
- **ASMR vidéo** utilise encore l'ancien mode synchrone (non passé en tâche de fond).
- Les tests de cette mise à jour couvrent le contrat du code ; **aucun appel réel** (Pollinations, Cloudflare, Netlify, Supabase) n'a été exécuté ici.

## Accès admin
Le lien « Centre Admin » (menu) n'est rendu que si `profiles.role = 'admin'` ; il n'existe pas de barre de navigation basse dans ce projet (seulement le menu latéral/tiroir). `/admin` est protégé côté serveur (`requireAdmin`) : non connecté → `/login`, non admin → `/`.

## Complément v3.1 : voix Deepgram, image dans le chat, bulle déplaçable, design
**Variables Netlify pour la voix Deepgram (via Cloudflare)**
```
CLOUDFLARE_MODEL_STT=@cf/deepgram/nova-3     # transcription ; la langue « fr » est envoyée à chaque requête
CLOUDFLARE_MODEL_TTS=@cf/deepgram/aura-1     # synthèse vocale
CLOUDFLARE_VOICE=asteria                      # voix Aura : angus, asteria, arcas, orion, orpheus, athena, luna, zeus, perseus, helios, hera, stella
```
- Les voix Aura sont **anglaises** : un texte français sera prononcé avec un accent anglais. En cas d'échec du service, la voix du navigateur prend le relais.
- Sans `CLOUDFLARE_MODEL_STT`, la transcription reste Whisper (très bon en français).
- Le format de réponse de Nova-3 vient de la documentation Cloudflare ; il n'a pas été testé avec un vrai appel.

**Image directe dans le chat** : « fais-moi une image de … », « dessine-moi … », « génère une illustration de … » créent l'image sans passer par le modèle de texte (4 crédits, image affichée dans la discussion). Les questions (« comment générer une image ? ») ne déclenchent rien. Le résultat dépend du modèle Pollinations (`POLLINATIONS_MODEL_IMAGE`).

**Bulle de support** : glisse-la où tu veux (doigt ou souris) ; sa position est mémorisée sur l'appareil. Flèches du clavier pour la déplacer, Entrée pour l'ouvrir.

**Design** : les règles existantes du tableau de bord (`.noxia-*` : cartes, topbar, panneaux) et du chat (`.nx-*`) sont passées en verre sombre, avec lueur violette au survol et boutons en dégradé violet/indigo.

## Complément v3.2 : bande défilante, statistiques publicitaires, campagnes
- **Migration `0056_banner_stats.sql`** (après 0055) : table `banner_events`, fonctions `track_banner_event` (serveur seulement) et `admin_banner_stats` (admin seulement).
- **Bande d'annonces** : défile de droite à gauche en boucle (pause au survol et au clavier ; « moins de mouvement » : plus de défilement). Elle n'apparaît que si au moins une annonce est ACTIVE dans `/admin/banners`.
- **Statistiques** (visibles par l'administrateur seulement) : `/admin/analytics` (campagnes + bande) et `/admin/banners` (bande). Affichages comptés une fois par personne et par 30 minutes, clics anti-doublon de 10 s.
- **Pubs récompensées** (`/dashboard/rewards`) : +2 crédits, 5 pubs et 10 crédits par jour maximum, validation côté serveur ; les crédits gagnés expirent après 60 jours comme les autres.
