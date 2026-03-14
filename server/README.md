# Backend Imposteur — Mode en ligne

Serveur Node.js / TypeScript avec Socket.IO pour le lobby du jeu Imposteur (création et rejoindre une room, état en temps réel).

## Arborescence

```
server/
  src/
    index.ts      # Point d'entrée : Express, Socket.IO, événements create_room / join_room / disconnect
    roomStore.ts  # Rooms en mémoire (Map), createRoom, joinRoom, leaveRoom, validations
    types.ts      # GameConfig, RoomMember, RoomLobbyState, payloads des événements
  package.json
  tsconfig.json
  README.md
```

## Prérequis

- Node.js 18+

## Dépendances

- **express** — serveur HTTP et route `/health`
- **cors** — en-têtes CORS
- **socket.io** — temps réel (lobby)
- **typescript**, **tsx**, **@types/node**, **@types/express**, **@types/cors** — build et dev

## Installation

```bash
cd server
npm install
```

## Lancer en local

**Mode développement** (rechargement à chaque modification) :

```bash
npm run dev
```

Le serveur écoute sur `http://localhost:3001`. Le endpoint Socket.IO est sur le même host/port.

**Mode production** :

```bash
npm run build
npm start
```

## Endpoints HTTP

- `GET /health` — Health check (répond `{ "ok": true }`).

## Socket.IO

- **URL** : même origine que le serveur (ex. `http://localhost:3001`).
- **Événements (client → serveur)** : `create_room`, `join_room`.
- **Événements (serveur → client)** : `room_created`, `room_joined`, `room_state`, `room_closed`, `error`.

Voir `docs/CONTRAT_MODE_EN_LIGNE.md` pour les payloads et la logique.
