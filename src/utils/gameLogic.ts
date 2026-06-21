import type { Player, WordPair, GameConfig } from '../types/game';
import { buildRoles } from '@shared/gameLogic';
import { getRandomWordPair } from '@shared/wordPairs';

export {
  buildRoles,
  checkVictoryAfterElimination,
  isMrWhiteGuessCorrect,
  getMaxImpostors,
  shouldContinueAfterImpostorEliminated,
  shouldContinueAfterMrWhiteWrongGuess,
} from '@shared/gameLogic';
export type { VictoryResult } from '@shared/gameLogic';

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

export type { Role } from '../types/game';
