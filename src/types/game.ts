/** Rôles possibles dans le jeu */
export type Role = 'citoyen' | 'imposteur' | 'mrWhite';

/** Paire de mots : mot des Citoyens et mot de l'Imposteur */
export interface WordPair {
  motCitoyens: string;
  motImposteur: string;
}

/** Joueur avec son rôle assigné (et mot éventuel) */
export interface Player {
  id: string;
  name: string;
  role: Role;
  /** Mot affiché au joueur (citoyen → mot A, imposteur → mot B, mrWhite → null) */
  word: string | null;
  /** true si le joueur a été éliminé ce tour */
  eliminated: boolean;
}

/** Phase actuelle de la partie */
export type GamePhase =
  | 'home'
  | 'rules'
  | 'history'
  | 'config'
  | 'roleReveal'
  | 'discussion'
  | 'vote'
  | 'eliminatedReveal'
  | 'mrWhiteGuess'
  | 'end';

/** Configuration de la partie (avant distribution des rôles) */
export interface GameConfig {
  playerCount: number;
  playerNames: string[];
  impostorCount: number;
  mrWhiteEnabled: boolean;
}

/** État complet de la partie en cours */
export interface GameState {
  phase: GamePhase;
  config: GameConfig;
  /** Paire de mots choisie pour cette partie */
  wordPair: WordPair | null;
  /** Joueurs avec rôles assignés (rempli après roleReveal) */
  players: Player[];
  /** Index du joueur en train de voir son rôle (phase roleReveal) */
  currentRevealIndex: number;
  /** ID du joueur éliminé au vote (pour afficher la révélation) */
  eliminatedPlayerId: string | null;
  /** Résultat du guess de Mr. White (true = trouvé) */
  mrWhiteGuessCorrect: boolean | null;
  /** Gagnant final : 'citoyens' | 'imposteur' | 'mrWhite' */
  winner: 'citoyens' | 'imposteur' | 'mrWhite' | null;
}

/** Entrée d'historique pour le mode best-of / scores */
export interface HistoryEntry {
  id: string;
  date: string;
  winner: 'citoyens' | 'imposteur' | 'mrWhite';
  playerCount: number;
  wordPair: WordPair;
}
