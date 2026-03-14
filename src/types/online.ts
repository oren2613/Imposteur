/**
 * Types pour le mode en ligne (lobby, contrat backend).
 * Alignés sur docs/CONTRAT_MODE_EN_LIGNE.md et server.
 */

/** Configuration partie (création de room, sans playerNames) */
export interface OnlineGameConfig {
  playerCount: number;
  impostorCount: number;
  mrWhiteEnabled: boolean;
}

/** Membre dans le lobby (avec stats de victoire) */
export interface RoomMember {
  socketId: string;
  name: string;
  isHost: boolean;
  gamesPlayed?: number;
  wins?: number;
}

/** État public d'une room en lobby */
export interface RoomLobbyState {
  status: 'lobby';
  roomId: string;
  config: OnlineGameConfig;
  members: RoomMember[];
  hostSocketId: string;
}

// --- Partie online (game_state, your_role)

export type OnlineBackendPhase =
  | 'roleReveal'
  | 'discussion'
  | 'vote'
  | 'eliminatedReveal'
  | 'mrWhiteGuess'
  | 'end';

/** Joueur tel que vu par toute la room (sans rôle ni mot) */
export interface PlayerPublic {
  id: string;
  name: string;
  eliminated: boolean;
}

/** État public d'une room en partie (reçu via game_state) */
export interface RoomGameState {
  status: 'playing';
  roomId: string;
  config: OnlineGameConfig;
  phase: OnlineBackendPhase;
  players: PlayerPublic[];
  eliminatedPlayerId: string | null;
  winner: 'citoyens' | 'imposteur' | 'mrWhite' | null;
  wordPair: { motCitoyens: string; motImposteur: string } | null;
  discussionOrder?: string[];
  currentSpeakerIndex?: number;
  turnStartedAt?: number;
  turnDurationMs?: number;
  /** Début de la phase discussion (epoch ms), pour timer global 2 min */
  discussionStartedAt?: number;
  /** Durée max discussion en ms (120 000) */
  discussionDurationMs?: number;
}

/** Payload your_role (mot + id du joueur) */
export interface YourRolePayload {
  word: string | null;
  playerId: string;
}
