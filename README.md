# Imposteur + Mr. White

Jeu d'ambiance en local : les joueurs découvrent leur rôle et leur mot secret sur un seul appareil, puis jouent hors écran. L'application gère la configuration, la distribution des rôles, le vote, la dernière chance de Mr. White et la fin de partie.

## Aperçu

![Menu principal — Nouvelle partie, Jouer en ligne, Règles, Historique](screenshot-menu.png)

## Lancer le projet

```bash
npm install
npm run dev
```

Ouvrir l’URL affichée (souvent `http://localhost:5173`) dans le navigateur.

## Build

```bash
npm run build
npm run preview
```

## Technologies

- React 19, TypeScript, Vite
- Tailwind CSS
- Stockage local (localStorage) pour l’historique et le mode sombre

## Structure

- `src/types/game.ts` — types (rôles, phases, joueurs)
- `src/data/wordPairs.ts` — 30 paires de mots (Citoyens / Imposteur)
- `src/context/GameContext.tsx` — état global de la partie
- `src/utils/gameLogic.ts` — répartition des rôles, création des joueurs
- `src/screens/` — écrans (accueil, config, révélation, discussion, vote, fin, règles, historique)
- `src/components/` — boutons, layout

## Règles (résumé)

- **Citoyens** : même mot, doivent repérer l’Imposteur et/ou Mr. White.
- **Imposteur** : mot proche mais différent, doit se fondre.
- **Mr. White** : aucun mot, improvise ; s’il est éliminé, il peut deviner le mot des Citoyens — s’il trouve, il gagne seul.
- Vote → révélation du rôle de l’éliminé → Imposteur éliminé = Citoyens gagnent ; Citoyen éliminé = la partie continue ; Mr. White éliminé = dernière chance puis fin.
