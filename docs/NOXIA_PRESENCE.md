# Présence NOXIA

La présence visuelle accompagne le pipeline vocal sans créer un second moteur de conversation.

États :
- `idle` : NOXIA est prête.
- `listening` : le microphone est actif.
- `transcribing` : l'audio est envoyé au serveur pour transcription.
- `thinking` : la réponse conversationnelle est en cours.
- `speaking` : la réponse TTS est en lecture.

La présence est purement visuelle : elle ne crédite aucun compte, ne déclenche aucune génération et ne remplace pas les contrôles serveur.
