/**
 * Logique de tirage des rôles et des mots (côté serveur).
 */

import type { GameConfig, WordPair } from './types.js';
import {
  buildRoles,
  checkVictoryAfterElimination,
} from '../shared/gameLogic.js';
import type { Role } from '../shared/types.js';
import { getRandomWordPair } from '../shared/wordPairs.js';

export type { VictoryResult } from '../shared/gameLogic.js';
export { checkVictoryAfterElimination } from '../shared/gameLogic.js';

/** Joueur interne (avec rôle et mot, jamais exposé tel quel au client) */
export interface GamePlayerInternal {
  id: string;
  name: string;
  /** socketId du client connecté, ou '' si déconnecté (refresh) */
  socketId: string;
  /** Session client pour reconnexion */
  sessionId?: string;
  role: Role;
  word: string | null;
  eliminated: boolean;
  avatarUrl?: string | null;
  /** Joueur IA (pas de socket réel, actions pilotées par le moteur de bots) */
  isBot?: boolean;
}

/** Membre lobby (pour construire les joueurs) */
interface Member {
  socketId: string;
  name: string;
  sessionId?: string;
  avatarUrl?: string | null;
  isBot?: boolean;
}

/**
 * Crée les joueurs de partie à partir des membres du lobby.
 * playerId stable : player-0, player-1, ... (ordre des members).
 */
export function createGamePlayers(
  members: Member[],
  config: GameConfig,
  wordPair: WordPair
): GamePlayerInternal[] {
  const roles = buildRoles(config);
  return members.map((m, index) => {
    const role = roles[index];
    let word: string | null = null;
    if (role === 'citoyen') word = wordPair.motCitoyens;
    if (role === 'imposteur') word = wordPair.motImposteur;
    return {
      id: `player-${index}`,
      name: m.name,
      socketId: m.socketId,
      sessionId: m.sessionId,
      role,
      word,
      eliminated: false,
      avatarUrl: m.avatarUrl ?? null,
      isBot: m.isBot ?? false,
    };
  });
}

/**
 * Démarre une partie : tirage d'une paire de mots et création des joueurs.
 */
export function startGameLogic(
  members: Member[],
  config: GameConfig
): { wordPair: WordPair; players: GamePlayerInternal[] } {
  const wordPair = getRandomWordPair();
  const players = createGamePlayers(members, config, wordPair);
  return { wordPair, players };
}
