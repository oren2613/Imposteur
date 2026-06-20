/** Rôles possibles dans le jeu */
export type Role = 'citoyen' | 'imposteur' | 'mrWhite';

/** Paire de mots : mot des Citoyens et mot de l'Imposteur */
export interface WordPair {
  motCitoyens: string;
  motImposteur: string;
}

/** Configuration de base (local et en ligne) */
export interface GameConfigCore {
  playerCount: number;
  impostorCount: number;
  mrWhiteEnabled: boolean;
}
