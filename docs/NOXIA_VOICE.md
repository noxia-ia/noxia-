# NOXIA Voice — conversation mains libres

La Voice NOXIA reste séparée de l'ASMR et utilise le pipeline serveur :

`microphone → capture → STT serveur → conversation NOXIA → TTS serveur → lecture`

## Mode conversation vocale

Le bouton « Conversation vocale » active un mode mains libres lorsque `MediaRecorder` et le microphone sont disponibles.

- capture automatique après chaque réponse vocale ;
- arrêt après environ 1,2 s de silence suivant le début de la parole ;
- durée maximale d'une capture : 12 s ;
- chaque capture est envoyée au endpoint STT serveur, donc la facturation/limite STT existante reste appliquée ;
- après le TTS, la capture suivante est réarmée avec un court délai pour éviter de reprendre immédiatement la voix de NOXIA ;
- désactiver le mode vocal arrête immédiatement capture et lecture.

## Sécurité

Le navigateur ne reçoit aucune clé fournisseur. Les endpoints `/api/voice/transcribe` et `/api/voice/tts` vérifient l'utilisateur et réservent/finalisent les crédits côté serveur.

## Limites navigateur

Si `MediaRecorder`/`getUserMedia` n'est pas disponible, le bouton mains libres est désactivé et la reconnaissance vocale native peut rester disponible en mode ponctuel lorsque le navigateur expose `SpeechRecognition`.

Le build/typecheck complet doit être exécuté dans l'environnement avec les dépendances installées avant le déploiement.
