import type { Role, Player, WordPair, GameConfig } from '../types/game';
import { getRandomWordPair } from '../data/wordPairs';

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
export function buildRoles(config: GameConfig): Role[] {
  const { playerCount, impostorCount, mrWhiteEnabled } = config;
  const roles: Role[] = [];

  for (let i = 0; i < impostorCount; i++) roles.push('imposteur');
  if (mrWhiteEnabled) roles.push('mrWhite');
  const citizenCount = playerCount - roles.length;
  for (let i = 0; i < citizenCount; i++) roles.push('citoyen');

  return shuffle(roles);
}

/**
 * Crée les joueurs avec rôles et mots assignés.
 */
export function createPlayers(config: GameConfig, wordPair: WordPair): Player[] {
  const roles = buildRoles(config);
  return config.playerNames.slice(0, config.playerCount).map((name, index) => {
    const role = roles[index];
    let word: string | null = null;
    if (role === 'citoyen') word = wordPair.motCitoyens;
    if (role === 'imposteur') word = wordPair.motImposteur;
    return {
      id: `player-${index}-${Date.now()}`,
      name,
      role,
      word,
      eliminated: false,
    };
  });
}

/**
 * Démarre une nouvelle partie : choisit une paire de mots et crée les joueurs.
 */
export function startGame(config: GameConfig): { wordPair: WordPair; players: Player[] } {
  const wordPair = getRandomWordPair();
  const players = createPlayers(config, wordPair);
  return { wordPair, players };
}

/**
 * Compare la proposition de Mr. White au mot des Citoyens (insensible à la casse et aux espaces).
 */
export function isMrWhiteGuessCorrect(guess: string, motCitoyens: string): boolean {
  const n = guess.trim().toLowerCase();
  const m = motCitoyens.trim().toLowerCase();
  return n === m;
}

export type VictoryResult = 'citoyens' | 'imposteur' | 'mrWhite' | null;

/**
 * Vérifie les conditions de victoire après une élimination.
 * - S'il ne reste que 2 joueurs vivants et que l'un d'eux est Mr. White → Mr. White gagne.
 * - Sinon, si ce sont exactement 1 Civil + 1 Imposteur → l'Imposteur gagne.
 * - Retourne null si la partie doit continuer (pas de victoire immédiate).
 */
export function checkVictoryAfterElimination(players: Player[]): VictoryResult {
  const alive = players.filter((p) => !p.eliminated);
  if (alive.length !== 2) return null;
  const roles = alive.map((p) => p.role);
  if (roles.includes('mrWhite')) return 'mrWhite';
  const hasCitizen = roles.includes('citoyen');
  const hasImpostor = roles.includes('imposteur');
  if (hasCitizen && hasImpostor) return 'imposteur';
  return null;
}
