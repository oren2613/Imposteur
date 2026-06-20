import type { GameConfigCore, Role } from './types.js';

export type VictoryResult = 'citoyens' | 'imposteur' | 'mrWhite' | null;

export interface PlayerWithRole {
  role: Role;
  eliminated: boolean;
}

/**
 * Nombre max d'imposteurs : impostorCount <= civilCount
 * civilCount = playerCount - impostorCount - (mrWhiteEnabled ? 1 : 0)
 * => impostorCount <= floor((playerCount - (mrWhiteEnabled ? 1 : 0)) / 2)
 */
export function getMaxImpostors(config: GameConfigCore): number {
  const civilsSlot = config.playerCount - (config.mrWhiteEnabled ? 1 : 0);
  return Math.max(1, Math.floor(civilsSlot / 2));
}

/** Mélange Fisher-Yates */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Génère la liste des rôles pour une configuration donnée.
 * Répartition : 1 ou N imposteurs, 0 ou 1 Mr. White, le reste Citoyens.
 */
export function buildRoles(config: GameConfigCore): Role[] {
  const { playerCount, impostorCount, mrWhiteEnabled } = config;
  const roles: Role[] = [];

  for (let i = 0; i < impostorCount; i++) roles.push('imposteur');
  if (mrWhiteEnabled) roles.push('mrWhite');
  const citizenCount = playerCount - roles.length;
  for (let i = 0; i < citizenCount; i++) roles.push('citoyen');

  return shuffle(roles);
}

/**
 * Compare la proposition de Mr. White au mot des Citoyens (insensible à la casse et aux espaces).
 */
export function isMrWhiteGuessCorrect(guess: string, motCitoyens: string): boolean {
  const n = guess.trim().toLowerCase();
  const m = motCitoyens.trim().toLowerCase();
  return n === m;
}

/**
 * Vérifie les conditions de victoire après une élimination.
 * - S'il ne reste que 2 joueurs vivants et que l'un d'eux est Mr. White → Mr. White gagne.
 * - Sinon, si ce sont exactement 1 Civil + 1 Imposteur → l'Imposteur gagne.
 * - Retourne null si la partie doit continuer (pas de victoire immédiate).
 */
export function checkVictoryAfterElimination(players: PlayerWithRole[]): VictoryResult {
  const alive = players.filter((p) => !p.eliminated);
  if (alive.length !== 2) return null;
  const roles = alive.map((p) => p.role);
  if (roles.includes('mrWhite')) return 'mrWhite';
  const hasCitizen = roles.includes('citoyen');
  const hasImpostor = roles.includes('imposteur');
  if (hasCitizen && hasImpostor) return 'imposteur';
  return null;
}

/** Mr. White est encore en jeu après l'élimination d'un imposteur. */
export function shouldContinueAfterImpostorEliminated(
  players: PlayerWithRole[],
  mrWhiteEnabled: boolean
): boolean {
  return (
    mrWhiteEnabled &&
    players.some((p) => p.role === 'mrWhite' && !p.eliminated)
  );
}
