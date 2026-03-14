# Analyse : affichage partie online (révélation + discussion)

## 1. Ce qu’il manque entre backend et frontend pour que « Lancer la partie » affiche quelque chose

**Backend (déjà en place)** :
- Au `start_game`, le serveur envoie à chaque client `your_role` { word } et à toute la room `game_state` { roomState } avec `phase: 'roleReveal'`.

**Frontend (manquant)** :
- Aucun listener sur `game_state` ni `your_role` dans `OnlineContext` → pas de stockage de l’état de partie ni du mot.
- Aucune mise à jour de la phase d’écran quand la partie démarre → on reste sur le lobby.
- Pas d’écrans « révélation online » ni « discussion online » ni de phases dédiées dans le routeur.

**À faire** :
- Écouter `game_state` et `your_role`, stocker `gameState` et `myWord` (et `myPlayerId`), et passer en phase `onlineRoleReveal` / `onlineDiscussion` selon `roomState.phase`.
- Ajouter les phases `onlineRoleReveal` et `onlineDiscussion` au routeur et créer les écrans correspondants.
- En révélation : afficher le mot (ou « Tu n’as pas de mot »), bouton « J’ai vu » qui émet `role_reveal_ack`.
- En discussion : ordre de passage, joueur courant, timer 20 s, bouton Passer, bouton micro (UI seulement).

---

## 2. Nouveaux types pour la discussion online

- **Côté backend (server)** : étendre `RoomGameState` (ou payload `game_state`) avec des champs optionnels en phase `discussion` :
  - `discussionOrder: string[]` (playerIds, ordre de passage)
  - `currentSpeakerIndex: number`
  - `turnStartedAt: number` (timestamp ms)
  - `turnDurationMs: number` (ex. 20000)
- **Côté frontend** : même forme pour l’état de partie reçu ; type pour la vue privée : `{ word: string | null, playerId: string }` (pour savoir « c’est mon tour »).

---

## 3. Changements backend pour ordre, joueur courant, timer, passage

- **À l’entrée en discussion** (dans `roleRevealAck` quand tout le monde a ack) :
  - Construire la liste des `playerId` des joueurs non éliminés, la mélanger (ordre aléatoire).
  - Stocker dans la room : `discussionOrder`, `currentSpeakerIndex = 0`, `turnStartedAt = Date.now()`, `turnDurationMs = 20000`.
  - Inclure ces champs dans `toGameState(room)` lorsque `phase === 'discussion'`.
- **Nouvel événement `discussion_pass`** (client → serveur) :
  - Vérifier que l’émetteur est bien le joueur courant (ou autoriser tout le monde / seulement le courant selon les règles).
  - Incrémenter `currentSpeakerIndex`.
  - Si `currentSpeakerIndex >= discussionOrder.length` : passer en phase `vote` (et broadcast `game_state`).
  - Sinon : mettre à jour `turnStartedAt = Date.now()`, broadcast `game_state` avec le nouvel orateur et le nouveau `turnStartedAt`.
- **Timer** : le frontend calcule le temps restant avec `turnStartedAt` et `turnDurationMs` ; à 0, il peut émettre `discussion_pass` (ou le serveur peut avoir un timer côté serveur plus tard ; pour ce sprint, timer piloté côté front à partir de `turnStartedAt` / `turnDurationMs`).

---

## 4. Changements frontend

- **OnlineContext** :
  - Écouter `game_state` et `your_role`.
  - Stocker `gameState` (RoomGameState online), `myWord`, `myPlayerId`.
  - Sur `game_state` avec `status: 'playing'`, mettre à jour `gameState` et appeler `setPhase(onlineRoleReveal | onlineDiscussion | …)` selon `roomState.phase`.
  - Exposer `roleRevealAck()`, `discussionPass()`, et réinitialiser `gameState` / `myWord` / `myPlayerId` en quittant ou en fin de partie.
- **Nouvelles phases** : `onlineRoleReveal`, `onlineDiscussion` (et plus tard `onlineVote`, etc.).
- **Écrans** : `OnlineRoleRevealScreen`, `OnlineDiscussionScreen` (ordre, joueur courant, timer circulaire ou barre, Passer, micro on/off).
- **App** : branches de routing pour ces phases.

---

## 5–7. Composants, branchement start_game et discussion

- **OnlineRoleRevealScreen** : affiche `myWord` ou « Tu n’as pas de mot », bouton « J’ai vu » → `role_reveal_ack`.
- **OnlineDiscussionScreen** : affiche ordre de passage, nom du joueur courant, timer (calculé avec `turnStartedAt` / `turnDurationMs`), états (à venir / en cours / passé / éliminé), bouton « Passer son tour » (si c’est mon tour → `discussion_pass`), bouton micro (état local `isMicEnabled`, pas d’audio).
- **Branchement** : dès réception de `game_state` (phase `roleReveal`) et `your_role`, le contexte met à jour state et phase → l’App affiche `OnlineRoleRevealScreen` ; après passage en `discussion` (nouveau `game_state`), affichage de `OnlineDiscussionScreen`.
