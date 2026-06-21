/**
 * Types pour le sprint lobby (create_room, join_room, disconnect).
 * Alignés sur docs/CONTRAT_MODE_EN_LIGNE.md.
 */

/** Configuration de la partie (création de room) */
export interface GameConfig {
  playerCount: number;
  impostorCount: number;
  mrWhiteEnabled: boolean;
}

/** Membre de la room en phase lobby */
export interface RoomMember {
  socketId: string;
  name: string;
  isHost: boolean;
  /** Identifiant de session client pour reconnexion (optionnel) */
  sessionId?: string;
  /** Photo de profil (null = avatar par défaut) */
  avatarUrl?: string | null;
  /** Joueur contrôlé par l'IA (complète le matchmaking). Pas de socket réel. */
  isBot?: boolean;
}

/** Membre tel qu'exposé dans le lobby (avec stats, sans sessionId) */
export interface LobbyMemberPublic {
  socketId: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  gamesPlayed: number;
  wins: number;
  avatarUrl?: string | null;
  /** Joueur IA (exposé sans être mis en avant côté UI) */
  isBot?: boolean;
}

/** État public d'une room en lobby */
export interface RoomLobbyState {
  status: 'lobby';
  roomId: string;
  config: GameConfig;
  members: LobbyMemberPublic[];
  hostSocketId: string;
  /** Début auto de partie (epoch ms), null si room pas pleine ou pas en attente */
  countdownEndsAt: number | null;
}

// --- Types partie (sprint start_game + role_reveal_ack)

/** Phases de partie gérées par le serveur */
export type GamePhase =
  | 'roleReveal'
  | 'discussion'
  | 'vote'
  | 'eliminatedReveal'
  | 'mrWhiteGuess'
  | 'end';

/** Paire de mots (interne + exposée uniquement en phase end) */
export interface WordPair {
  motCitoyens: string;
  motImposteur: string;
}

/** Joueur tel que vu par toute la room (aucun rôle ni mot) */
export interface PlayerPublic {
  id: string;
  name: string;
  eliminated: boolean;
  /** false si le joueur a perdu sa connexion (refresh, onglet fermé) */
  connected: boolean;
  avatarUrl?: string | null;
  /** Joueur IA (exposé sans être mis en avant côté UI) */
  isBot?: boolean;
}

/** Indice écrit donné par un joueur pendant son tour de discussion */
export interface ClueEntry {
  playerId: string;
  name: string;
  text: string;
}

/** Vue privée du joueur (mot ou null pour Mr. White) */
export interface PlayerPrivateView {
  word: string | null;
}

/** État public d'une room en cours de partie */
export interface RoomGameState {
  status: 'playing';
  roomId: string;
  config: GameConfig;
  phase: GamePhase;
  players: PlayerPublic[];
  eliminatedPlayerId: string | null;
  winner: Winner | null;
  /** Présent uniquement quand phase === 'end' */
  wordPair: WordPair | null;
  /** Indices écrits donnés pendant la discussion en cours (réinitialisés à chaque discussion) */
  clues?: ClueEntry[];
  /** Phase discussion : ordre de passage (playerIds) */
  discussionOrder?: string[];
  /** Index du joueur qui parle */
  currentSpeakerIndex?: number;
  /** Début du tour en ms (epoch) */
  turnStartedAt?: number;
  /** Durée d’un tour en ms */
  turnDurationMs?: number;
  /** Début de la phase discussion (epoch ms), pour timer global 2 min */
  discussionStartedAt?: number;
  /** Durée max discussion en ms (120 000) */
  discussionDurationMs?: number;
  /** Fin de partie : décompte avant la manche suivante (epoch ms) */
  nextRoundCountdownEndsAt?: number | null;
  /** Fin de partie : socketIds des joueurs prêts pour la manche suivante */
  nextRoundReadySocketIds?: string[];
  /** Phase vote : progression + détail des cibles (révélé en direct) */
  voteProgress?: {
    votedCount: number;
    eligibleCount: number;
    votedPlayerIds: string[];
    /** Qui a voté pour qui (targetId = 'BLANK' pour un vote blanc). Révélé en direct. */
    votes: { voterId: string; targetId: string }[];
  };
  /** Début de la phase vote (epoch ms) */
  voteStartedAt?: number;
  /** Durée max du vote en ms (30 000) */
  voteDurationMs?: number;
  /** Début de la devinette Mr. White (epoch ms) */
  mrWhiteGuessStartedAt?: number;
  /** Durée max de la devinette Mr. White en ms */
  mrWhiteGuessDurationMs?: number;
}

/** Gagnant (pour typage, pas utilisé dans ce sprint) */
export type Winner = 'citoyens' | 'imposteur' | 'mrWhite';

// --- Payloads client → serveur

export interface CreateRoomPayload {
  config: GameConfig;
  playerName: string;
  /** Session client pour reconnexion après refresh */
  clientSessionId?: string;
  /** Visibilité de la room : publique (listée) ou privée (sur code) */
  visibility?: 'public' | 'private';
  /** Mot de passe (rooms privées) */
  password?: string;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
  /** Session client pour reconnexion après refresh */
  clientSessionId?: string;
  /** Mot de passe (rooms protégées) */
  password?: string;
}

/** Payload pour reconnexion à une room (après refresh) */
export interface ReconnectToRoomPayload {
  roomId: string;
  playerSessionId: string;
  playerName: string;
}

/** Mise à jour de la config par le host (entre deux manches ou en lobby) */
export interface UpdateRoomConfigPayload {
  config: GameConfig;
}

/** Marquer prêt / pas prêt (lobby plein ou fin de manche) */
export interface LobbyReadyPayload {
  ready: boolean;
}

/** Vote (client → serveur) */
export interface VotePayload {
  targetPlayerId: string;
}

/** Indice écrit pendant son tour de discussion (client → serveur) */
export interface SubmitCluePayload {
  text: string;
}

// --- Payloads serveur → client

export interface RoomCreatedPayload {
  roomId: string;
  roomState: RoomLobbyState;
}

export interface RoomJoinedPayload {
  roomId: string;
  roomState: RoomLobbyState;
  youAreHost: boolean;
}

export interface RoomStatePayload {
  roomState: RoomLobbyState;
}

/** Émission serveur : état de partie (phase, players publics, etc.) */
export interface GameStatePayload {
  roomState: RoomGameState;
}

/** Émission serveur : vue privée du joueur (mot ou null) + playerId */
export interface YourRolePayload {
  word: string | null;
  playerId: string;
}

export interface RoomClosedPayload {
  code: string;
  message: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}
