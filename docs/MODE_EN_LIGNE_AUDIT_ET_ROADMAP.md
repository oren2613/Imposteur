# Mode en ligne — Audit, architecture MVP et roadmap

## 1. Ce qui doit passer du frontend vers le backend (mode en ligne)

### 1.1 Données à héberger côté backend

| Donnée | Aujourd’hui (local) | En ligne |
|--------|----------------------|----------|
| **Source de vérité de la partie** | `GameState` dans le React state (une seule machine) | Backend : état de la room (phase, joueurs, votes, mot, etc.) |
| **Configuration** | Saisie en local dans `ConfigScreen` | Créateur de la room envoie `GameConfig` au serveur (playerCount, impostorCount, mrWhiteEnabled) ; les noms viennent des pseudos des joueurs connectés |
| **Tirage des rôles et du mot** | `startGame()` dans le front (`gameLogic.ts`) | Backend : exécute l’équivalent de `startGame` (paire de mots aléatoire + `createPlayers`) pour que personne ne puisse tricher |
| **Distribution des rôles** | Phase `roleReveal` en local, index séquentiel sur la même machine | Backend envoie à chaque socket un payload **individuel** (ton mot ou “pas de mot”) ; le front n’a jamais la liste complète des rôles |
| **Votes** | Un seul utilisateur clique “Éliminer ce joueur” en local | Chaque joueur envoie son vote (playerId cible) au backend ; le backend agrège et détermine l’éliminé (ex. majorité) |
| **Guess Mr. White** | Saisie en local, `isMrWhiteGuessCorrect()` dans le front | Le joueur Mr. White envoie sa proposition au backend ; le backend vérifie et renvoie le résultat (victoire Mr. White ou citoyens) |
| **Historique** | `localStorage` dans le navigateur | Optionnel en MVP ; possiblement backend + affichage en ligne plus tard |

### 1.2 Responsabilités à déplacer

- **Création / démarrage de partie** : le backend crée la room, accepte les joueurs (lobby), et au “start” applique la config (nombre de joueurs = nombre dans la room), tire les rôles et le mot, et notifie chaque client de sa vue (mot ou “pas de mot”).
- **Avancement des phases** : le backend pilote les phases (`roleReveal` → `discussion` → `vote` → `eliminatedReveal` / `mrWhiteGuess` / `end`). Le front envoie des **actions** (ex. “j’ai vu mon rôle”, “je vote pour X”, “guess Mr. White : Y”) ; le serveur met à jour l’état et diffuse la phase + la vue par joueur si besoin.
- **Règles de victoire** : `checkVictoryAfterElimination` et `isMrWhiteGuessCorrect` doivent s’exécuter côté backend après un vote ou un guess, puis le serveur émet la phase `end` + le gagnant.
- **Autorité sur “qui est éliminé”** : à partir des votes reçus, le backend calcule l’éliminé et envoie `eliminatedPlayerId` (et la nouvelle phase) à tout le monde.

### 1.3 Ce qui reste côté frontend (les deux modes)

- **UI et navigation par phase** : les écrans existants (Home, Config, RoleReveal, Discussion, Vote, EliminatedReveal, MrWhiteGuess, End) restent ; en ligne ils sont pilotés par l’état reçu du serveur (et éventuellement par “vue joueur” pour RoleReveal / Vote).
- **Mode local** : inchangé. Le `GameContext` continue de gérer `GameState` en local et d’appeler `gameLogic` sans socket.
- **Décision “local vs en ligne”** : depuis l’accueil, l’utilisateur choisit “Nouvelle partie (local)” ou “Jouer en ligne” ; en ligne, on utilise un autre flux (lobby → room) et un state synchronisé par le backend (voir §2).

---

## 2. Architecture MVP simple et réaliste

### 2.1 Principe

- **Un repo, deux “entrées”** : frontend React (Vercel) + backend Node/TS (Railway).
- **Temps réel** : Socket.IO. Chaque joueur = une connexion socket ; la room = une salle Socket.IO (ou un `roomId` côté métier avec une Map en mémoire).
- **Pas de base de données en MVP** : état des rooms en mémoire (Map). Redémarrage backend = parties en cours perdues ; suffisant pour un MVP.
- **Frontend** : on garde le mode local tel quel. On ajoute un chemin “En ligne” qui utilise un `OnlineGameContext` (ou un couche au-dessus du `GameContext`) alimenté par les événements Socket.IO et qui expose un état “game” compatible avec les écrans existants (même types `GamePhase`, `Player[]`, etc.) pour réutiliser au maximum les écrans.

### 2.2 Schéma (texte)

```
[Client 1]  [Client 2]  …  [Client N]
     |            |              |
     v            v              v
  Socket.IO   Socket.IO     Socket.IO
     |            |              |
     +------------+--------------+
                  |
                  v
         [Backend Node/TS]
         - HTTP (health, CORS)
         - Socket.IO server
         - Map<roomId, RoomState>
         - gameLogic (startGame, votes, victory, mrWhite guess)
                  |
     +------------+--------------+
     |            |              |
     v            v              v
  Sync state  Sync state    Sync state
  (phase,     (phase,       (phase,
   players,    players,      players,
   myView)     myView)       myView)
```

- **Lobby** : liste des rooms (créer / rejoindre par code ou lien). Une room a un `host`, un `config` (playerCount, impostorCount, mrWhiteEnabled), une liste de `sockets` (pseudos). Le host lance la partie quand le nombre de joueurs = config.playerCount (ou un min accepté).
- **En jeu** : la room contient l’état de la partie (équivalent `GameState` côté serveur). Chaque émission Socket.IO vers la room envoie soit l’état public (phase, players avec noms et eliminated, wordPair pour l’affichage “mot” uniquement pour ceux qui ont le droit), soit un payload “vue joueur” (ton mot, ou null pour Mr. White).

### 2.3 Choix techniques MVP

- **Frontend** : React + TypeScript, Socket.IO client. Build Vite, déploiement Vercel.
- **Backend** : Node.js + TypeScript, Socket.IO server. Déploiement Railway. CORS configuré pour l’origine Vercel.
- **État en ligne** : le front reçoit des événements (ex. `game_state`, `your_role`) et met à jour un state qui alimente les mêmes écrans que le local (phase, players, eliminatedPlayerId, winner, etc.) + données privées (mon mot / pas de mot) pour l’écran RoleReveal et le vote.

### 2.4 Règles métier à respecter côté backend

- Les joueurs avec un mot ne voient **jamais** leur rôle (citoyen/imposteur) dans la réponse ; ils reçoivent uniquement leur `word` ou l’équivalent.
- Seul Mr. White reçoit une indication “pas de mot” (ou `word: null`).
- Si, après élimination, il reste exactement 1 civil et 1 imposteur → victoire imposteur.
- Si Mr. White est éliminé → phase `mrWhiteGuess` ; s’il devine correctement le mot citoyen → victoire Mr. White, sinon victoire citoyens.

---

## 3. Types TypeScript à prévoir (résumé pour la suite)

À détailler dans une prochaine étape ; à garder en tête pour l’architecture :

- **Partagés (front + back)** : `GameConfig`, `GamePhase`, `Player` (sans exposer `role`/`word` dans les payloads publics), `WordPair`, types de victoire. Eventuels DTO : `RoomSummary`, `RoomState`, `PlayerView` (mot ou null pour Mr. White).
- **Backend** : structure interne `RoomState` (config, hostSocketId, players avec rôles et mots, phase, votes en cours, eliminatedPlayerId, winner, etc.).
- **Socket.IO** : payloads typés pour chaque événement (join_room, start_game, vote, mr_white_guess, etc.) et pour les réponses (game_state, your_role, error).

---

## 4. Événements Socket.IO à définir (résumé pour la suite)

À lister exhaustivement à l’étape “types + events” ; idée :

- **Client → serveur** : `create_room`, `join_room`, `start_game` (host), `role_reveal_ack`, `go_to_discussion`, `go_to_vote`, `vote`, `mr_white_guess`.
- **Serveur → client** : `room_joined`, `room_state` (lobby), `game_started` / `game_state` (phase + players publics), `your_role` (mot ou null), `vote_result` (qui est éliminé), `game_over` (winner), `error`.

---

## 5. Roadmap de développement par étapes

### Phase 0 — Préparation (sans casser le local)

1. **Choix local / en ligne sur l’accueil**  
   - Depuis `HomeScreen`, deux boutons : “Nouvelle partie (local)” (comportement actuel → Config puis jeu) et “Jouer en ligne” (→ Lobby / création ou rejoindre une room).
2. **Structure du monorepo ou des dossiers**  
   - Créer un dossier `server/` (ou `backend/`) à la racine avec son propre `package.json`, TypeScript, et Socket.IO. Le front reste dans `src/`. Prévoir un `shared/` ou des types exportés si on veut partager les types entre front et back.
3. **Configuration et env**  
   - Variable d’environnement front (ex. `VITE_SOCKET_URL`) pour l’URL du backend Socket.IO en dev et en prod (Railway). Backend : port, CORS, origine autorisée.

### Phase 1 — Backend minimal et lobby

4. **Serveur Node/TS + Socket.IO**  
   - HTTP basique (health check) + Socket.IO. Connexion, ping/pong si besoin. CORS pour le front.
5. **Rooms en mémoire**  
   - Map `roomId → RoomState`. `RoomState` = { id, hostSocketId, config (playerCount, impostorCount, mrWhiteEnabled), players: { socketId, name } }, status: 'lobby' | 'playing'.
6. **Événements lobby**  
   - `create_room` (config + pseudo) → création room, retour `room_id` + `room_state`.  
   - `join_room` (room_id + pseudo) → ajout du joueur, broadcast `room_state` à la room.  
   - Affichage côté front : liste des joueurs, code room pour partage. Le host voit “Lancer la partie” quand le nombre de joueurs correspond à la config.

### Phase 2 — Lancement de partie et distribution des rôles

7. **Définir les types partagés et les événements**  
   - Finaliser les types (GameConfig, GamePhase, Player public/privé, WordPair, RoomState, payloads socket). Document ou fichier `shared/types.ts` (ou équivalent).
8. **Événement `start_game`**  
   - Le host envoie `start_game`. Backend : si nombre de joueurs OK, appeler la logique `startGame(config)` (adapter depuis `gameLogic`), stocker dans la room wordPair + players (avec rôles et mots). Passer status à 'playing', phase à 'roleReveal'.
9. **Distribution des rôles aux clients**  
   - Pour chaque socket de la room : envoyer `your_role` (ou équivalent) avec uniquement `word` (string | null). Ne jamais envoyer `role` ni la liste des rôles. Chaque client affiche l’écran “RoleReveal” avec son mot ou “Tu n’as pas de mot”.
10. **Phase roleReveal côté front**  
    - Chaque joueur voit son écran une fois ; pas d’index séquentiel. Un bouton “J’ai vu mon rôle” peut envoyer `role_reveal_ack`. Quand tout le monde a ack, le backend passe en `discussion` et envoie `game_state` (phase: 'discussion', players avec noms et eliminated).

### Phase 3 — Discussion, vote et élimination

11. **Phases discussion et vote**  
    - Backend envoie `game_state` avec phase 'discussion'. Bouton “Passer au vote” : uniquement le host envoie `go_to_vote` (ou tout le monde, selon le design). Backend passe en 'vote', broadcast.
12. **Collecte des votes**  
    - Chaque client envoie `vote` (playerId cible). Backend agrège (ex. majorité, ou premier atteint). À la fin du vote : calcul de l’éliminé, mise à jour des `players`, application de `checkVictoryAfterElimination`.
13. **Élimination et suites**  
    - Si victoire (citoyens / imposteur / mrWhite) : phase 'end', winner, broadcast.  
    - Si éliminé = Mr. White : phase 'mrWhiteGuess', broadcast.  
    - Si éliminé = citoyen : phase 'eliminatedReveal', eliminatedPlayerId, puis après révélation passage 'discussion'.  
    - Si éliminé = imposteur : phase 'end', winner 'citoyens'.

### Phase 4 — Mr. White guess et fin de partie

14. **Guess Mr. White**  
    - Le client Mr. White envoie `mr_white_guess` (string). Backend compare avec `wordPair.motCitoyens` (équivalent `isMrWhiteGuessCorrect`), détermine le gagnant, envoie phase 'end' + winner.
15. **Écran de fin et rejouer**  
    - Tous reçoivent `game_state` avec phase 'end' et winner. Affichage EndGameScreen. Option “Rejouer” : le host peut recréer une partie (même room ou nouvelle room) avec les mêmes joueurs (nouveau `start_game`).

### Phase 5 — Robustesse et déploiement

16. **Gestion des déconnexions**  
    - Déconnexion en lobby : retirer le joueur de la room, broadcast room_state. En jeu : politique claire (abandon = élimination automatique ou partie en pause selon le choix produit).
17. **Déploiement**  
    - Front : Vercel, build Vite, `VITE_SOCKET_URL` pointant vers Railway. Backend : Railway, Socket.IO + HTTP, variable d’origine CORS.
18. **Historique en ligne (optionnel)**  
    - Si besoin : backend enregistre les fins de partie (winner, wordPair, playerCount) et expose une route ou un événement pour l’historique ; le front “En ligne” affiche un historique basé sur ces données.

---

## 6. Prochaine étape : premier sprint de code minimal

Une fois cette roadmap validée, le premier sprint pourra couvrir :

- **Phase 0** (points 1 à 3) : choix “Local” / “En ligne” sur l’accueil, création du projet backend `server/` avec Socket.IO et health check, configuration CORS et env.
- **Phase 1** (points 4 à 6) : rooms en mémoire, `create_room` / `join_room`, écran Lobby côté front (créer ou rejoindre par code, liste des joueurs, bouton “Lancer” désactivé ou visible pour le host).

Cela posera les bases sans toucher au flux local existant et sans encore implémenter le tirage des rôles ni le jeu en ligne (réservés aux phases 2–4).
