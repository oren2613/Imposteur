# Contrat technique — Mode en ligne

Document de référence pour le backend et le frontend. À verrouiller avant le sprint backend.

---

## 1. Types TypeScript (mode en ligne)

### 1.1 Rôles et mots

```ts
/** Rôle (côté serveur uniquement ; jamais exposé au client) */
export type Role = 'citoyen' | 'imposteur' | 'mrWhite';

/** Paire de mots — utilisée côté serveur et exposée à tous uniquement en phase `end` */
export interface WordPair {
  motCitoyens: string;
  motImposteur: string;
}
```

### 1.2 Winner et GameResult

```ts
/** Gagnant de la partie */
export type Winner = 'citoyens' | 'imposteur' | 'mrWhite';

/** Résultat final de la partie (envoyé en phase `end`) */
export interface GameResult {
  winner: Winner;
  wordPair: WordPair;
}
```

### 1.3 GameConfig (création de room)

En ligne, les noms des joueurs viennent des pseudos à l’entrée en room, pas d’une liste saisie par l’hôte. La config ne contient que les paramètres de partie.

```ts
/** Configuration de la partie (création de room ou démarrage) */
export interface GameConfig {
  playerCount: number;
  impostorCount: number;
  mrWhiteEnabled: boolean;
}
```

Contraintes : `playerCount` entre 3 et 12 ; `impostorCount` entre 1 et `playerCount - (mrWhiteEnabled ? 2 : 1)`.

### 1.4 GamePhase (phases en ligne)

Les phases « écran » purement locales (home, rules, history, config) ne sont pas gérées par le serveur. Seules les phases de partie en room sont concernées.

```ts
/** Phases de partie gérées par le serveur (mode en ligne) */
export type GamePhase =
  | 'roleReveal'
  | 'discussion'
  | 'vote'
  | 'eliminatedReveal'
  | 'mrWhiteGuess'
  | 'end';
```

### 1.5 Player (joueur en partie)

- **Côté serveur** : représentation complète (id, name, role, word, eliminated, socketId).
- **Côté client / public** : aucun rôle ni mot ; uniquement ce qui est nécessaire pour afficher la liste et le vote.

```ts
/** Joueur tel que vu par toute la room (données publiques) */
export interface PlayerPublic {
  id: string;
  name: string;
  eliminated: boolean;
}
```

Le type `Player` complet (avec `role` et `word`) reste un type interne serveur ; il n’apparaît dans aucun payload Socket.IO.

### 1.6 Vote

```ts
/** Vote envoyé par un joueur (client → serveur) */
export interface VotePayload {
  targetPlayerId: string;
}
```

Le serveur stocke les votes (ex. `Map<socketId, targetPlayerId>`) et ne renvoie pas le détail des votes aux clients ; il envoie uniquement l’éliminé et la nouvelle phase.

### 1.7 Lobby : membre de room

En lobby, on identifie les joueurs par leur socket et leur pseudo. Pas encore de `playerId` (assigné au `start_game`).

```ts
/** Membre de la room en phase lobby */
export interface RoomMember {
  socketId: string;
  name: string;
  isHost: boolean;
}
```

### 1.8 Room — état public (lobby)

Ce que tout le monde reçoit pour une room en lobby.

```ts
/** État public d’une room en lobby */
export interface RoomLobbyState {
  status: 'lobby';
  roomId: string;
  config: GameConfig;
  members: RoomMember[];
  hostSocketId: string;
}
```

### 1.9 Room — état public (en jeu)

Ce que toute la room reçoit pendant et en fin de partie. `wordPair` n’est envoyé qu’en phase `end` pour l’affichage du résultat.

```ts
/** État public d’une room en cours de partie */
export interface RoomGameState {
  status: 'playing';
  roomId: string;
  phase: GamePhase;
  players: PlayerPublic[];
  eliminatedPlayerId: string | null;
  winner: Winner | null;
  /** Présent uniquement quand phase === 'end' */
  wordPair: WordPair | null;
}
```

### 1.10 RoomPublicState (union)

```ts
export type RoomPublicState = RoomLobbyState | RoomGameState;
```

### 1.11 PlayerPrivateView (données privées)

Envoyé une seule fois par joueur au démarrage de la partie. Le client ne doit jamais recevoir son rôle (citoyen/imposteur/mrWhite) ; uniquement son mot ou l’absence de mot.

```ts
/** Vue privée du joueur (mot ou pas de mot pour Mr. White) */
export interface PlayerPrivateView {
  /** Mot du joueur, ou null pour Mr. White */
  word: string | null;
}
```

### 1.12 Room (côté serveur, interne)

Type interne backend : structure complète de la room (config, host, membres, état de jeu, votes, etc.). Non exposé tel quel sur le réseau ; utilisé pour dériver `RoomPublicState` et `PlayerPrivateView`.

*(Pas de définition TypeScript exhaustive ici ; à implémenter dans le backend. Contient notamment : `id`, `hostSocketId`, `config`, `members`, `status`, et en jeu `phase`, `players` (avec rôles/mots), `wordPair`, `votes`, `eliminatedPlayerId`, `winner`, etc.)*

---

## 2. Séparation stricte : données publiques / données privées

### 2.1 Données publiques (envoyées à toute la room)

- **Lobby** : `RoomLobbyState` (roomId, config, members avec socketId, name, isHost, hostSocketId).
- **En jeu** : `RoomGameState` (phase, players en `PlayerPublic[]`, eliminatedPlayerId, winner, wordPair uniquement si phase === 'end').

Règles :
- Aucun `role` ni `word` dans les payloads publics.
- `wordPair` n’est inclus que lorsque `phase === 'end'`.

### 2.2 Données privées (envoyées à un seul socket)

- **Au démarrage de la partie** : pour chaque socket, envoi de `PlayerPrivateView` (champ `word: string | null`) via l’événement dédié. Aucun autre joueur ne reçoit cette donnée.

Le client déduit « je suis Mr. White » uniquement par `word === null`, sans jamais recevoir la chaîne `"mrWhite"`.

---

## 3. Événements Socket.IO

Convention : **nom en snake_case**, payloads typés. Pour chaque événement : sens, payload, validations serveur, réponse attendue.

---

### 3.1 `create_room`  
**Sens :** Client → Serveur  

**Payload :**
```ts
{
  config: GameConfig;
  playerName: string;
}
```

**Validations :**
- `playerName` : non vide, longueur raisonnable (ex. 1–30 caractères).
- `config` : playerCount entre 3 et 12, impostorCount entre 1 et max autorisé, mrWhiteEnabled booléen.

**Réponse :**
- Émission vers le socket émetteur : `room_created` avec payload :
```ts
{
  roomId: string;
  roomState: RoomLobbyState;
}
```
- Le socket rejoint la room Socket.IO de même `roomId`.

---

### 3.2 `join_room`  
**Sens :** Client → Serveur  

**Payload :**
```ts
{
  roomId: string;
  playerName: string;
}
```

**Validations :**
- La room existe.
- La room est en `status: 'lobby'`.
- Nombre de membres actuel < `config.playerCount`.
- `playerName` non vide et non déjà pris dans la room (comparaison insensible à la casse).

**Réponse :**
- Au socket qui rejoint : `room_joined` :
```ts
{
  roomId: string;
  roomState: RoomPublicState;
  youAreHost: boolean;
}
```
- À toute la room (y compris le nouveau) : `room_state` :
```ts
{
  roomState: RoomPublicState;
}
```
- Le socket rejoint la room Socket.IO.

**En cas d’erreur :** émission vers le socket uniquement : `error` avec `{ code: string, message: string }` (ex. `room_full`, `name_taken`, `room_not_found`).

---

### 3.3 `start_game`  
**Sens :** Client → Serveur  

**Payload :** `{}` (aucun champ requis).

**Validations :**
- L’émetteur est le host (`socket.id === hostSocketId`).
- La room est en `status: 'lobby'`.
- Nombre de membres === `config.playerCount` (exact).

**Réponse :**
1. Le serveur exécute la logique de tirage (équivalent `startGame` : paire de mots, création des joueurs avec rôles/mots, `playerId` stables).
2. Pour chaque socket de la room : émission **privée** `your_role` :
```ts
{
  word: string | null;
}
```
3. À toute la room : `game_state` :
```ts
{
  roomState: RoomGameState;  // phase: 'roleReveal', players, eliminatedPlayerId: null, winner: null, wordPair: null
}
```
4. Mise à jour interne : `status: 'playing'`, `phase: 'roleReveal'`.

**En cas d’erreur :** `error` vers le host uniquement (ex. `not_host`, `player_count_mismatch`).

---

### 3.4 `role_reveal_ack`  
**Sens :** Client → Serveur  

**Payload :** `{}`.

**Validations :**
- La room est en jeu, `phase === 'roleReveal'`.
- Ce socket n’a pas encore envoyé d’ack pour cette phase.

**Réponse :**
- Immédiate : aucune.
- Quand **tous** les joueurs ont ack : passage en `phase: 'discussion'`, puis émission à toute la room de `game_state` avec le nouvel état (phase, players, etc.).

---

### 3.5 `go_to_vote`  
**Sens :** Client → Serveur  

**Payload :** `{}`.

**Validations :**
- La room est en jeu, `phase === 'discussion'`.
- L’émetteur est le host.

**Réponse :**
- Passage en `phase: 'vote'`.
- À toute la room : `game_state` avec `phase: 'vote'`.

**En cas d’erreur :** `error` vers l’émetteur si pas host ou phase invalide.

---

### 3.6 `vote`  
**Sens :** Client → Serveur  

**Payload :**
```ts
VotePayload = { targetPlayerId: string; }
```

**Validations :**
- La room est en jeu, `phase === 'vote'`.
- Ce socket n’a pas encore voté pour ce tour.
- `targetPlayerId` correspond à un joueur existant et **non éliminé** de la partie.

**Réponse :**
- Immédiate : aucune (ou optionnellement un ack `vote_registered`).
- Quand **tous les joueurs éligibles** ont voté (voir §5) : calcul de l’éliminé, mise à jour des `players`, application des règles de victoire, puis émission à toute la room de `game_state` avec :
  - `phase: 'eliminatedReveal' | 'mrWhiteGuess' | 'end'`,
  - `eliminatedPlayerId` renseigné,
  - `winner` et éventuellement `wordPair` si phase `end`.

**En cas d’erreur :** `error` vers l’émetteur (ex. `already_voted`, `invalid_target`, `wrong_phase`).

---

### 3.7 `continue_after_eliminated`  
**Sens :** Client → Serveur  

**Payload :** `{}`.

**Validations :**
- La room est en jeu, `phase === 'eliminatedReveal'`.

**Réponse :**
- Passage en `phase: 'discussion'`, `eliminatedPlayerId` remis à null (ou conservé selon besoin d’affichage ; à trancher côté implémentation).
- À toute la room : `game_state` avec phase `discussion`.

*Note : on peut restreindre au host pour déclencher la suite ; à préciser en implémentation (recommandation : host uniquement).*

---

### 3.8 `mr_white_guess`  
**Sens :** Client → Serveur  

**Payload :**
```ts
{
  guess: string;
}
```

**Validations :**
- La room est en jeu, `phase === 'mrWhiteGuess'`.
- L’émetteur est le joueur Mr. White (celui éliminé qui a le droit de deviner).

**Réponse :**
- Comparaison avec `wordPair.motCitoyens` (insensible à la casse et aux espaces).
- Passage en `phase: 'end'`, `winner: 'mrWhite' | 'citoyens'`, `wordPair` inclus.
- À toute la room : `game_state` avec phase `end`, winner, wordPair.

**En cas d’erreur :** `error` si phase invalide ou émetteur n’est pas Mr. White.

---

### 3.9 Événements Serveur → Client (résumé)

| Événement         | Quand                         | Payload                        |
|-------------------|-------------------------------|--------------------------------|
| `room_created`    | Après `create_room` réussi    | `{ roomId, roomState }`        |
| `room_joined`     | Après `join_room` réussi     | `{ roomId, roomState, youAreHost }` |
| `room_state`      | Mise à jour lobby (join/leave)| `{ roomState }`                |
| `game_state`      | Changement d’état de partie   | `{ roomState: RoomGameState }` |
| `your_role`       | Au `start_game`, à chaque joueur | `PlayerPrivateView`         |
| `error`           | Erreur de validation         | `{ code: string, message: string }` |

---

## 4. Cycle des phases du jeu

| Phase actuelle   | Action possible            | Qui déclenche        | Phase suivante      | Conditions |
|------------------|----------------------------|----------------------|---------------------|------------|
| `roleReveal`     | `role_reveal_ack`          | Chaque joueur        | `discussion`        | Quand tous ont ack |
| `discussion`     | `go_to_vote`               | Host uniquement      | `vote`              | — |
| `vote`           | `vote`                     | Chaque joueur non éliminé | (voir règles vote) | Quand tous ont voté ; calcul éliminé puis règles victoire |
| — (après vote)   | —                          | —                    | `eliminatedReveal`  | Éliminé = citoyen |
| — (après vote)   | —                          | —                    | `mrWhiteGuess`      | Éliminé = Mr. White |
| — (après vote)   | —                          | —                    | `end`               | Éliminé = imposteur, ou victoire 2 restants (imposteur / mrWhite) |
| `eliminatedReveal` | `continue_after_eliminated` | Host (recommandé)   | `discussion`        | — |
| `mrWhiteGuess`   | `mr_white_guess`           | Mr. White (joueur éliminé) | `end`        | Guess évalué ; winner = mrWhite ou citoyens |
| `end`            | (aucune action serveur)    | —                    | —                   | Fin de partie ; rejouer = nouveau `start_game` depuis le lobby |

---

## 5. Règles exactes de vote

### 5.1 Quand le vote se termine

Le vote se termine lorsque **tous les joueurs encore non éliminés** ont envoyé exactement un `vote` pour ce tour. Pas de timer en MVP.

### 5.2 Choix de l’éliminé

- On compte les votes par `targetPlayerId`.
- **Éliminé** = le joueur qui a reçu le **plus grand nombre de voix**.
- En cas d’**égalité** : on applique une règle déterministe. **Choix retenu pour le MVP** : **départage par ordre des playerId** (ordre lexicographique). Ex. si A et B ont le même nombre de voix, on élimine celui dont l’`id` est « plus petit » (ordre alphabétique). Alternative possible : aucun éliminé ce tour (tour nul) ; à documenter si on change.

### 5.3 Égalité stricte (tous à égalité)

Si tous les joueurs votables ont exactement le même nombre de voix (ex. 2–2–2), appliquer la même règle déterministe (ex. plus petit `playerId` parmi les ex æquo).

### 5.4 Joueur déjà éliminé

Un joueur **déjà éliminé** ne vote **pas** : il n’est pas compté parmi les « tous ont voté » et ne peut pas envoyer `vote`. Le serveur rejette `vote` si l’émetteur est éliminé.

### 5.5 Joueur déconnecté

Un joueur **déconnecté** pendant la phase vote **ne vote pas** et **ne compte pas** dans « tous ont voté ». Dès qu’il se déconnecte, le serveur le retire des joueurs (voir §6) ; le vote se clôture quand tous les joueurs **encore connectés et non éliminés** ont voté. Pas de vote par défaut pour le déconnecté.

---

## 6. Cas limites à gérer dans le MVP

### 6.1 Host quitte

- **En lobby** : la room est **supprimée** ou un nouveau host est désigné. **Choix MVP** : **supprimer la room** et déconnecter tous les membres (émission `room_closed` ou équivalent, raison « host_left »). Les clients reviennent à l’écran de sélection de room.
- **En partie** : traiter le host comme un joueur qui quitte (voir 6.3). Pas de transfert de host en cours de partie en MVP.

### 6.2 Joueur quitte pendant le lobby

- Retirer le membre de la room.
- Broadcast `room_state` à toute la room (liste des members mise à jour).
- Si la room est vide après départ, supprimer la room.

### 6.3 Joueur quitte pendant la partie

- **Choix MVP** : le joueur est considéré **éliminé** (ou « abandon »). On met à jour la liste des joueurs (marquer comme éliminé ou le retirer de la liste selon le modèle). Puis **réévaluer les conditions de victoire** (ex. il ne reste que 2 joueurs → possible fin de partie). Si la partie continue, les autres joueurs restent en phase courante (discussion / vote, etc.). Pas de reconnexion en MVP.

### 6.4 Room pleine

- Lors d’un `join_room` : si `members.length >= config.playerCount`, répondre `error` avec code `room_full`, ne pas ajouter le joueur.

### 6.5 Pseudo déjà pris

- Lors de `join_room` (ou `create_room` pour cohérence) : si un membre a déjà le même `name` (insensible à la casse), répondre `error` avec code `name_taken`.

### 6.6 Start sans assez de joueurs

- Lors de `start_game` : si `members.length !== config.playerCount`, répondre `error` vers le host avec code `player_count_mismatch`, ne pas démarrer la partie.

### 6.7 Double clic / double vote

- Le serveur enregistre au plus **un vote par socket par tour** (phase vote). Si le même socket envoie un second `vote` pour le même tour, répondre `error` avec code `already_voted` et ignorer le second payload.

### 6.8 Reconnexion simple

- **MVP** : **pas de reconnexion**. Une déconnexion = sortie de la room (et en partie = traitement comme 6.3). Pas de token de session ni de rejoin par roomId + pseudo pour reprendre la même place. À prévoir en v2 si besoin.

---

## 7. Codes d’erreur (référence)

| Code                    | Contexte        | Message type (ex.)                    |
|-------------------------|-----------------|--------------------------------------|
| `room_not_found`        | join_room       | « Room introuvable »                 |
| `room_full`             | join_room       | « Room pleine »                      |
| `name_taken`            | join_room       | « Ce pseudo est déjà pris »          |
| `room_not_lobby`        | join_room       | « La partie a déjà commencé »        |
| `not_host`              | start_game, go_to_vote | « Seul le host peut faire cette action » |
| `player_count_mismatch` | start_game      | « Nombre de joueurs incorrect »      |
| `wrong_phase`           | vote, etc.      | « Action non autorisée dans cette phase » |
| `already_voted`         | vote            | « Vous avez déjà voté »              |
| `invalid_target`        | vote            | « Cible de vote invalide »           |
| `host_left`             | (broadcast)     | « Le host a quitté la room »         |

---

Ce document constitue le **contrat technique** du mode en ligne. Les implémentations backend et frontend doivent s’y conformer pour assurer l’interopérabilité et la cohérence des phases, votes et données publiques/privées.
