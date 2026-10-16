// Moteur utilisé pour chaque type d'ASMR (identifiants du registre, voir register.ts). Hors des dossiers d'interface : les noms de fournisseurs
// ne doivent jamais apparaître dans le code d'affichage (test provider-visibility).
export const ASMR_AUDIO_ENGINE = "elevenlabs";
export const ASMR_VIDEO_ENGINE = "pollinations-video";
export const asmrEngineFor = (type: "audio" | "video") => (type === "audio" ? ASMR_AUDIO_ENGINE : ASMR_VIDEO_ENGINE);
