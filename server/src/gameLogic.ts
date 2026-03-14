/**
 * Logique de tirage des rôles et des mots (côté serveur).
 * Utilisé au start_game pour générer les joueurs de partie.
 */

import type { GameConfig, WordPair } from './types.js';
import { getRandomWordPair } from './wordPairs.js';

type Role = 'citoyen' | 'imposteur' | 'mrWhite';

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
}

/** Membre lobby (pour construire les joueurs) */
interface Member {
  socketId: string;
  name: string;
  sessionId?: string;
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildRoles(config: GameConfig): Role[] {
  const { playerCount, impostorCount, mrWhiteEnabled } = config;
  const roles: Role[] = [];
  for (let i = 0; i < impostorCount; i++) roles.push('imposteur');
  if (mrWhiteEnabled) roles.push('mrWhite');
  const citizenCount = playerCount - roles.length;
  for (let i = 0; i < citizenCount; i++) roles.push('citoyen');
  return shuffle(roles);
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

export type VictoryResult = 'citoyens' | 'imposteur' | 'mrWhite' | null;

/**
 * Vérifie les conditions de victoire après une élimination.
 * - 2 restants dont Mr. White → Mr. White gagne
 * - 2 restants : 1 civil + 1 imposteur → l'imposteur gagne
 * - Sinon null (partie continue)
 */
export function checkVictoryAfterElimination(
  players: GamePlayerInternal[]
): VictoryResult {
  const alive = players.filter((p) => !p.eliminated);
  if (alive.length !== 2) return null;
  const roles = alive.map((p) => p.role);
  if (roles.includes('mrWhite')) return 'mrWhite';
  const hasCitizen = roles.includes('citoyen');
  const hasImpostor = roles.includes('imposteur');
  if (hasCitizen && hasImpostor) return 'imposteur';
  return null;
}
