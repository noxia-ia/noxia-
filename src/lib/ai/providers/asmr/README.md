# Fournisseurs ASMR

## ElevenLabs

`elevenlabs` est le fournisseur ASMR audio réel actuellement enregistré.

- API : ElevenLabs Text-to-Sound Effects (`/v1/sound-generation`)
- Modèle : `eleven_text_to_sound_v2`
- Variable serveur : `ELEVENLABS_API_KEY`
- Activation : `ASMR_PROVIDER=elevenlabs`
- Stockage requis : `STORAGE_PROVIDER=supabase-storage`
- Bucket : `dracula-audio` (privé)
- Le fournisseur renvoie des octets MP3 ; le serveur les valide puis les stocke.
- Cette intégration ne prétend pas générer de vidéo ou d'image avec ElevenLabs.
