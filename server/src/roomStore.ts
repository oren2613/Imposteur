/**
 * Gestion des rooms en mémoire (lobby + démarrage de partie).
 * Logique de partie : start_game, role_reveal_ack. Pas encore : vote, élimination, fin.
 */

import type {
  GameConfig,
  RoomLobbyState,
  RoomMember,
  LobbyMemberPublic,
  RoomGameState,
  GamePhase,
  PlayerPublic,
  PlayerPrivateView,
  WordPair,
  Winner,
} from './types.js';
import type { GamePlayerInternal } from './gameLogic.js';
import { startGameLogic, checkVictoryAfterElimination } from './gameLogic.js';

/** Stats par sessionId (persistantes sur la room) */
interface PlayerStats {
  gamesPlayed: number;
  wins: number;
}

/** Room interne : lobby ou en partie */
interface Room {
  id: string;
  hostSocketId: string;
  config: GameConfig;
  status: 'lobby' | 'playing';
  members: RoomMember[];
  /** Stats de victoire par sessionId (persistantes entre manches) */
  stats: Map<string, PlayerStats>;
  /** Uniquement quand status === 'playing' */
  phase?: GamePhase;
  gamePlayers?: GamePlayerInternal[];
  wordPair?: WordPair;
  roleRevealAcked?: Set<string>;
  /** ID du joueur éliminé au vote (ou par disconnect) */
  eliminatedPlayerId?: string | null;
  /** Gagnant quand phase === 'end' */
  winner?: Winner | null;
  /** Votes du tour courant : socketId → targetPlayerId */
  votes?: Map<string, string>;
  /** Discussion : ordre des playerIds, index du joueur courant, début du tour */
  discussionOrder?: string[];
  currentSpeakerIndex?: number;
  turnStartedAt?: number;
  turnDurationMs?: number;
  /** Début de la phase discussion (epoch ms) pour plafond 2 min */
  discussionStartedAt?: number;
}

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
/** Mr. White ne peut être activé qu'à partir de 4 joueurs */
const MIN_PLAYERS_FOR_MR_WHITE = 4;
const ROOM_ID_LENGTH = 6;
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 30;

const rooms = new Map<string, Room>();
const socketToRoomId = new Map<string, string>();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomId(): string {
  let id: string;
  do {
    id = '';
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  } while (rooms.has(id));
  return id;
}

/**
 * Nombre max d'imposteurs : impostorCount <= civilCount
 * civilCount = playerCount - impostorCount - (mrWhiteEnabled ? 1 : 0)
 * => impostorCount <= floor((playerCount - (mrWhiteEnabled ? 1 : 0)) / 2)
 */
function getMaxImpostors(config: GameConfig): number {
  const civilsSlot = config.playerCount - (config.mrWhiteEnabled ? 1 : 0);
  return Math.max(1, Math.floor(civilsSlot / 2));
}

export function validateConfig(config: GameConfig): { ok: boolean; code?: string; message?: string } {
  if (
    typeof config.playerCount !== 'number' ||
    config.playerCount < MIN_PLAYERS ||
    config.playerCount > MAX_PLAYERS
  ) {
    return { ok: false, code: 'invalid_config', message: 'Nombre de joueurs invalide (3–12)' };
  }
  const maxImp = getMaxImpostors(config);
  if (
    typeof config.impostorCount !== 'number' ||
    config.impostorCount < 1 ||
    config.impostorCount > maxImp
  ) {
    return {
      ok: false,
      code: 'invalid_config',
      message: 'Le nombre d\'imposteurs ne peut pas dépasser le nombre de civils',
    };
  }
  if (typeof config.mrWhiteEnabled !== 'boolean') {
    return { ok: false, code: 'invalid_config', message: 'mrWhiteEnabled invalide' };
  }
  if (config.mrWhiteEnabled && config.playerCount < MIN_PLAYERS_FOR_MR_WHITE) {
    return {
      ok: false,
      code: 'invalid_config',
      message: 'Mr. White disponible uniquement à partir de 4 joueurs',
    };
  }
  return { ok: true };
}

export function validatePlayerName(name: unknown): { ok: boolean; code?: string; message?: string } {
  if (typeof name !== 'string' || name.trim().length < NAME_MIN_LENGTH) {
    return { ok: false, code: 'invalid_name', message: 'Le pseudo est requis' };
  }
  const trimmed = name.trim();
  if (trimmed.length > NAME_MAX_LENGTH) {
    return { ok: false, code: 'invalid_name', message: 'Pseudo trop long' };
  }
  return { ok: true };
}

function nameTakenInRoom(room: Room, playerName: string): boolean {
  const lower = playerName.trim().toLowerCase();
  return room.members.some((m) => m.name.trim().toLowerCase() === lower);
}

function toLobbyState(room: Room): RoomLobbyState {
  const statsMap = room.stats ?? new Map<string, PlayerStats>();
  const members: LobbyMemberPublic[] = room.members.map((m) => {
    const s = statsMap.get(m.sessionId ?? '') ?? { gamesPlayed: 0, wins: 0 };
    return { socketId: m.socketId, name: m.name, isHost: m.isHost, gamesPlayed: s.gamesPlayed, wins: s.wins };
  });
  return {
    status: 'lobby',
    roomId: room.id,
    config: room.config,
    members,
    hostSocketId: room.hostSocketId,
  };
}

const TURN_DURATION_MS = 20_000;
/** Durée max de la discussion avant passage automatique au vote */
const DISCUSSION_MAX_DURATION_MS = 120_000;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toGameState(room: Room): RoomGameState {
  const players = (room.gamePlayers ?? []).map(
    (p): PlayerPublic => ({ id: p.id, name: p.name, eliminated: p.eliminated })
  );
  const phase = room.phase ?? 'roleReveal';
  const state: RoomGameState = {
    status: 'playing',
    roomId: room.id,
    config: room.config,
    phase,
    players,
    eliminatedPlayerId: room.eliminatedPlayerId ?? null,
    winner: room.winner ?? null,
    wordPair: phase === 'end' ? (room.wordPair ?? null) : null,
  };
  if (phase === 'discussion' && room.discussionOrder != null) {
    state.discussionOrder = room.discussionOrder;
    state.currentSpeakerIndex = room.currentSpeakerIndex ?? 0;
    state.turnStartedAt = room.turnStartedAt;
    state.turnDurationMs = room.turnDurationMs ?? TURN_DURATION_MS;
    state.discussionStartedAt = room.discussionStartedAt;
    state.discussionDurationMs = DISCUSSION_MAX_DURATION_MS;
  }
  return state;
}

export type CreateRoomResult =
  | { ok: true; roomId: string; roomState: RoomLobbyState }
  | { ok: false; code: string; message: string };

export function createRoom(
  config: GameConfig,
  playerName: string,
  socketId: string,
  clientSessionId?: string
): CreateRoomResult {
  const configCheck = validateConfig(config);
  if (!configCheck.ok) return { ok: false, code: configCheck.code!, message: configCheck.message! };

  const nameCheck = validatePlayerName(playerName);
  if (!nameCheck.ok) return { ok: false, code: nameCheck.code!, message: nameCheck.message! };

  const id = generateRoomId();
  const member: RoomMember = {
    socketId,
    name: playerName.trim(),
    isHost: true,
    ...(clientSessionId && { sessionId: clientSessionId }),
  };
  const room: Room = {
    id,
    hostSocketId: socketId,
    config,
    status: 'lobby',
    members: [member],
    stats: new Map(),
  };
  rooms.set(id, room);
  socketToRoomId.set(socketId, id);

  return {
    ok: true,
    roomId: id,
    roomState: toLobbyState(room),
  };
}

export type JoinRoomResult =
  | { ok: true; roomState: RoomLobbyState; youAreHost: boolean }
  | { ok: false; code: string; message: string };

export function joinRoom(
  roomId: string,
  playerName: string,
  socketId: string,
  clientSessionId?: string
): JoinRoomResult {
  const nameCheck = validatePlayerName(playerName);
  if (!nameCheck.ok) return { ok: false, code: nameCheck.code!, message: nameCheck.message! };

  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }

  if (room.members.length >= room.config.playerCount) {
    return { ok: false, code: 'room_full', message: 'La room est pleine' };
  }

  if (nameTakenInRoom(room, playerName)) {
    return { ok: false, code: 'name_taken', message: 'Ce pseudo est déjà pris' };
  }

  const member: RoomMember = {
    socketId,
    name: playerName.trim(),
    isHost: false,
    ...(clientSessionId && { sessionId: clientSessionId }),
  };
  room.members.push(member);
  socketToRoomId.set(socketId, roomId);

  const youAreHost = socketId === room.hostSocketId;
  return {
    ok: true,
    roomState: toLobbyState(room),
    youAreHost,
  };
}

export type LeaveRoomResult =
  | { action: 'closed'; roomId: string; wasHost: true; socketIdsInRoom: string[] }
  | { action: 'updated'; roomId: string; wasHost: false; roomState: RoomLobbyState }
  | { action: 'empty'; roomId: string; wasHost: boolean }
  | { action: 'game_state'; roomId: string; roomState: RoomGameState }
  | null;

/** Résultat de handleDisconnect : soit disconnected (sans éliminer), soit LeaveRoomResult */
export type HandleDisconnectResult =
  | { action: 'disconnected'; roomId: string }
  | LeaveRoomResult;

/**
 * Retire un socket de sa room (appelé à la déconnexion).
 * - Lobby : closed / updated / empty comme avant.
 * - En partie : le joueur est marqué éliminé, game_state cohérent à broadcaster, victoire éventuelle.
 */
export function leaveRoom(socketId: string): LeaveRoomResult {
  const roomId = socketToRoomId.get(socketId);
  if (!roomId) return null;

  const room = rooms.get(roomId);
  if (!room) {
    socketToRoomId.delete(socketId);
    return null;
  }

  if (room.status === 'playing' && room.gamePlayers) {
    const player = room.gamePlayers.find((p) => p.socketId === socketId);
    socketToRoomId.delete(socketId);
    if (!player) return null;
    player.eliminated = true;
    const victory = checkVictoryAfterElimination(room.gamePlayers);
    if (victory) {
      room.phase = 'end';
      room.winner = victory;
    }
    return { action: 'game_state', roomId, roomState: toGameState(room) };
  }

  const wasHost = room.hostSocketId === socketId;
  const index = room.members.findIndex((m) => m.socketId === socketId);
  if (index === -1) {
    socketToRoomId.delete(socketId);
    return null;
  }

  room.members.splice(index, 1);
  socketToRoomId.delete(socketId);

  if (wasHost) {
    const socketIdsInRoom = room.members.map((m) => m.socketId);
    rooms.delete(roomId);
    for (const sid of socketIdsInRoom) {
      socketToRoomId.delete(sid);
    }
    return { action: 'closed', roomId, wasHost: true, socketIdsInRoom };
  }

  if (room.members.length === 0) {
    rooms.delete(roomId);
    return { action: 'empty', roomId, wasHost: false };
  }

  return {
    action: 'updated',
    roomId,
    wasHost: false,
    roomState: toLobbyState(room),
  };
}

export function getRoomIdBySocket(socketId: string): string | null {
  return socketToRoomId.get(socketId) ?? null;
}

/** Nom du host d'une room (pour les invitations) */
export function getRoomHostName(roomId: string): string | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'lobby') return null;
  const host = room.members.find((m) => m.socketId === room.hostSocketId);
  return host?.name ?? null;
}

/**
 * Appelé à la déconnexion socket (refresh, fermeture onglet).
 * En partie : ne pas éliminer le joueur, juste libérer le socket pour reconnexion.
 * En lobby : même comportement que leaveRoom.
 */
export function handleDisconnect(socketId: string): HandleDisconnectResult | null {
  const roomId = socketToRoomId.get(socketId);
  if (!roomId) return null;

  const room = rooms.get(roomId);
  if (!room) {
    socketToRoomId.delete(socketId);
    return null;
  }

  if (room.status === 'playing' && room.gamePlayers) {
    const player = room.gamePlayers.find((p) => p.socketId === socketId);
    if (player) player.socketId = '';
    socketToRoomId.delete(socketId);
    return { action: 'disconnected', roomId };
  }

  return leaveRoom(socketId);
}

export type ReconnectToRoomResult =
  | { ok: true; kind: 'lobby'; roomState: RoomLobbyState; youAreHost: boolean }
  | { ok: true; kind: 'playing'; roomState: RoomGameState; privateView: PlayerPrivateView & { playerId: string } }
  | { ok: false; code: string; message: string };

/**
 * Reconnexion d'un joueur après refresh. Réassocie le socket au joueur existant via sessionId.
 */
export function reconnectToRoom(
  roomId: string,
  socketId: string,
  playerSessionId: string,
  _playerName: string
): ReconnectToRoomResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }

  if (room.status === 'lobby') {
    const member = room.members.find((m) => m.sessionId === playerSessionId);
    if (!member) {
      return { ok: false, code: 'session_not_found', message: 'Session introuvable. Rejoins la room avec ton pseudo.' };
    }
    member.socketId = socketId;
    socketToRoomId.set(socketId, roomId);
    return {
      ok: true,
      kind: 'lobby',
      roomState: toLobbyState(room),
      youAreHost: member.isHost,
    };
  }

  if (room.status === 'playing' && room.gamePlayers) {
    const player = room.gamePlayers.find((p) => p.sessionId === playerSessionId);
    if (!player) {
      return { ok: false, code: 'session_not_found', message: 'Session introuvable. Rejoins la room avec ton pseudo.' };
    }
    if (player.eliminated) {
      return { ok: false, code: 'eliminated', message: 'Tu as été éliminé de cette partie.' };
    }
    player.socketId = socketId;
    socketToRoomId.set(socketId, roomId);
    const privateView = getPrivateView(roomId, socketId);
    if (!privateView) {
      return { ok: false, code: 'internal', message: 'Erreur interne' };
    }
    return {
      ok: true,
      kind: 'playing',
      roomState: toGameState(room),
      privateView,
    };
  }

  return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
}

// --- Démarrage de partie et role_reveal_ack

export type StartGameResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

export function startGame(roomId: string, socketId: string): StartGameResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }
  if (room.status !== 'lobby') {
    return { ok: false, code: 'wrong_phase', message: 'La partie a déjà commencé' };
  }
  if (room.hostSocketId !== socketId) {
    return { ok: false, code: 'not_host', message: 'Seul le host peut lancer la partie' };
  }
  if (room.members.length !== room.config.playerCount) {
    return {
      ok: false,
      code: 'player_count_mismatch',
      message: `Il faut exactement ${room.config.playerCount} joueurs`,
    };
  }

  const { wordPair, players: gamePlayers } = startGameLogic(room.members, room.config);
  room.status = 'playing';
  room.phase = 'roleReveal';
  room.gamePlayers = gamePlayers;
  room.wordPair = wordPair;
  room.roleRevealAcked = new Set();

  return { ok: true, roomState: toGameState(room) };
}

export function getGameState(roomId: string): RoomGameState | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return null;
  return toGameState(room);
}

const ROLE_REVEAL_COUNTDOWN_MS = 10_000;

/**
 * Passe la room de roleReveal à discussion après le countdown (mode online).
 * Appelé par le serveur après 10 s. Retourne le nouvel état à broadcaster ou null.
 */
export function transitionRoleRevealToDiscussion(roomId: string): RoomGameState | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || room.phase !== 'roleReveal' || !room.gamePlayers) {
    return null;
  }
  const aliveIds = room.gamePlayers.filter((p) => !p.eliminated).map((p) => p.id);
  room.phase = 'discussion';
  room.discussionOrder = shuffle(aliveIds);
  room.currentSpeakerIndex = 0;
  room.turnStartedAt = Date.now();
  room.turnDurationMs = TURN_DURATION_MS;
  room.discussionStartedAt = Date.now();
  return toGameState(room);
}

export { ROLE_REVEAL_COUNTDOWN_MS, DISCUSSION_MAX_DURATION_MS };

/** Vue privée + playerId pour que le client sache qui il est */
export function getPrivateView(roomId: string, socketId: string): (PlayerPrivateView & { playerId: string }) | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.gamePlayers) return null;
  const player = room.gamePlayers.find((p) => p.socketId === socketId);
  if (!player) return null;
  return { word: player.word, playerId: player.id };
}

export type RoleRevealAckResult =
  | { ok: true; allAcked: true; roomState: RoomGameState }
  | { ok: true; allAcked: false }
  | { ok: false; code: string; message: string };

/**
 * Enregistre l'ack d'un joueur pour la phase roleReveal.
 * socketIdsInRoom : ensemble des socketId actuellement dans la room (ex. via Socket.IO).
 * Quand tous les joueurs encore dans la room ont ack, on passe en discussion.
 */
export function roleRevealAck(
  roomId: string,
  socketId: string,
  socketIdsInRoom: string[]
): RoleRevealAckResult {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.gamePlayers || !room.roleRevealAcked) {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'roleReveal') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }

  const player = room.gamePlayers.find((p) => p.socketId === socketId);
  if (!player) {
    return { ok: false, code: 'not_in_game', message: 'Joueur non trouvé' };
  }

  room.roleRevealAcked.add(socketId);

  const gamePlayerSocketIds = new Set(room.gamePlayers.map((p) => p.socketId));
  const presentInRoom = socketIdsInRoom.filter((id) => gamePlayerSocketIds.has(id));
  const allAcked = presentInRoom.every((id) => room.roleRevealAcked!.has(id));

  if (!allAcked) {
    return { ok: true, allAcked: false };
  }

  const aliveIds = room.gamePlayers!.filter((p) => !p.eliminated).map((p) => p.id);
  room.phase = 'discussion';
  room.discussionOrder = shuffle(aliveIds);
  room.currentSpeakerIndex = 0;
  room.turnStartedAt = Date.now();
  room.turnDurationMs = TURN_DURATION_MS;
  return { ok: true, allAcked: true, roomState: toGameState(room) };
}

// --- go_to_vote, vote, continue_after_eliminated

export type GoToVoteResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

export function goToVote(roomId: string, socketId: string): GoToVoteResult {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'discussion') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }
  if (room.hostSocketId !== socketId) {
    return { ok: false, code: 'not_host', message: 'Seul le host peut lancer le vote' };
  }
  room.phase = 'vote';
  room.votes = new Map();
  return { ok: true, roomState: toGameState(room) };
}

/** Valeur de targetPlayerId pour un vote blanc (personne n'est éliminé) */
export const VOTE_BLANK = 'BLANK';

function computeEliminated(
  gamePlayers: GamePlayerInternal[],
  votes: Map<string, string>
): string | null {
  const voteCount = new Map<string, number>();
  for (const targetId of votes.values()) {
    voteCount.set(targetId, (voteCount.get(targetId) ?? 0) + 1);
  }
  let maxCount = 0;
  for (const c of voteCount.values()) {
    if (c > maxCount) maxCount = c;
  }
  const tied = [...voteCount.entries()]
    .filter(([, c]) => c === maxCount)
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));
  if (tied.length === 0) return null;
  if (tied.includes(VOTE_BLANK)) return null;
  return tied[0];
}

export type VoteResult =
  | { ok: true; complete: true; roomState: RoomGameState }
  | { ok: true; complete: false }
  | { ok: false; code: string; message: string };

export function vote(
  roomId: string,
  socketId: string,
  targetPlayerId: string,
  socketIdsInRoom: string[]
): VoteResult {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.gamePlayers || !room.votes) {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'vote') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }

  const voter = room.gamePlayers.find((p) => p.socketId === socketId);
  if (!voter) return { ok: false, code: 'not_in_game', message: 'Joueur non trouvé' };
  if (voter.eliminated) return { ok: false, code: 'eliminated', message: 'Vous êtes éliminé' };
  if (room.votes.has(socketId)) return { ok: false, code: 'already_voted', message: 'Vous avez déjà voté' };

  if (targetPlayerId !== VOTE_BLANK) {
    const target = room.gamePlayers.find((p) => p.id === targetPlayerId);
    if (!target) return { ok: false, code: 'invalid_target', message: 'Cible invalide' };
    if (target.eliminated) return { ok: false, code: 'invalid_target', message: 'Ce joueur est éliminé' };
    if (target.id === voter.id) return { ok: false, code: 'invalid_target', message: 'Vous ne pouvez pas voter contre vous-même' };
  }

  room.votes.set(socketId, targetPlayerId);

  const eligibleSocketIds = new Set(
    room.gamePlayers
      .filter((p) => !p.eliminated)
      .map((p) => p.socketId)
      .filter((id) => socketIdsInRoom.includes(id))
  );
  const allVoted = eligibleSocketIds.size > 0 && [...eligibleSocketIds].every((id) => room.votes!.has(id));
  if (!allVoted) {
    return { ok: true, complete: false };
  }

  const eliminatedId = computeEliminated(room.gamePlayers, room.votes);
  room.votes = new Map();

  if (!eliminatedId) {
    const aliveIds = room.gamePlayers.filter((p) => !p.eliminated).map((p) => p.id);
    room.phase = 'discussion';
    room.discussionOrder = shuffle(aliveIds);
    room.currentSpeakerIndex = 0;
    room.turnStartedAt = Date.now();
    room.discussionStartedAt = Date.now();
    return { ok: true, complete: true, roomState: toGameState(room) };
  }

  const eliminated = room.gamePlayers.find((p) => p.id === eliminatedId)!;
  eliminated.eliminated = true;
  room.eliminatedPlayerId = eliminatedId;

  const victory = checkVictoryAfterElimination(room.gamePlayers);
  if (victory) {
    room.phase = 'end';
    room.winner = victory;
    return { ok: true, complete: true, roomState: toGameState(room) };
  }
  if (eliminated.role === 'imposteur') {
    const mrWhiteStillAlive =
      room.config.mrWhiteEnabled &&
      room.gamePlayers.some((p) => p.role === 'mrWhite' && !p.eliminated);
    if (mrWhiteStillAlive) {
      room.phase = 'eliminatedReveal';
      return { ok: true, complete: true, roomState: toGameState(room) };
    }
    room.phase = 'end';
    room.winner = 'citoyens';
    return { ok: true, complete: true, roomState: toGameState(room) };
  }
  if (eliminated.role === 'mrWhite') {
    room.phase = 'mrWhiteGuess';
    return { ok: true, complete: true, roomState: toGameState(room) };
  }
  room.phase = 'eliminatedReveal';
  return { ok: true, complete: true, roomState: toGameState(room) };
}

// --- discussion_pass

export type DiscussionPassResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

export function discussionPass(roomId: string, socketId: string): DiscussionPassResult {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.gamePlayers || !room.discussionOrder) {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'discussion') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }

  const idx = room.currentSpeakerIndex ?? 0;
  const currentPlayerId = room.discussionOrder[idx];
  const currentPlayer = room.gamePlayers.find((p) => p.id === currentPlayerId);
  if (!currentPlayer || currentPlayer.socketId !== socketId) {
    return { ok: false, code: 'not_your_turn', message: 'Ce n\'est pas votre tour' };
  }

  room.currentSpeakerIndex = idx + 1;
  if (room.currentSpeakerIndex >= room.discussionOrder.length) {
    room.phase = 'vote';
    room.votes = new Map();
    return { ok: true, roomState: toGameState(room) };
  }
  room.turnStartedAt = Date.now();
  return { ok: true, roomState: toGameState(room) };
}

/**
 * Si l'orateur actuel est déconnecté et que le temps du tour est écoulé, avance automatiquement.
 * Appelé périodiquement côté serveur pour ne pas bloquer la partie au refresh d'un joueur.
 */
export function advanceDiscussionIfSpeakerDisconnected(
  roomId: string,
  socketIdsInRoom: string[]
): RoomGameState | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || room.phase !== 'discussion' || !room.gamePlayers || !room.discussionOrder) {
    return null;
  }
  const idx = room.currentSpeakerIndex ?? 0;
  if (idx >= room.discussionOrder.length) return null;
  const currentPlayerId = room.discussionOrder[idx];
  const currentPlayer = room.gamePlayers.find((p) => p.id === currentPlayerId);
  if (!currentPlayer) return null;
  const isConnected = currentPlayer.socketId !== '' && socketIdsInRoom.includes(currentPlayer.socketId);
  if (isConnected) return null;
  const turnStartedAt = room.turnStartedAt ?? 0;
  const turnDurationMs = room.turnDurationMs ?? TURN_DURATION_MS;
  if (Date.now() - turnStartedAt < turnDurationMs) return null;

  room.currentSpeakerIndex = idx + 1;
  if (room.currentSpeakerIndex >= room.discussionOrder.length) {
    room.phase = 'vote';
    room.votes = new Map();
  } else {
    room.turnStartedAt = Date.now();
  }
  return toGameState(room);
}

/** Liste des roomId en phase discussion (pour le tick de timeout orateur déconnecté) */
export function getDiscussionRoomIds(): string[] {
  const ids: string[] = [];
  for (const [id, room] of rooms) {
    if (room.status === 'playing' && room.phase === 'discussion') ids.push(id);
  }
  return ids;
}

export type ContinueAfterEliminatedResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

export function continueAfterEliminated(roomId: string): ContinueAfterEliminatedResult {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'eliminatedReveal') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }
  room.phase = 'discussion';
  room.eliminatedPlayerId = null;
  room.discussionStartedAt = Date.now();
  return { ok: true, roomState: toGameState(room) };
}

/**
 * Passe forcément au vote quand la durée max de discussion (2 min) est atteinte.
 * Appelé par le tick serveur.
 */
export function forceDiscussionToVoteIfTimeout(roomId: string): RoomGameState | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || room.phase !== 'discussion') return null;
  const started = room.discussionStartedAt ?? 0;
  if (Date.now() - started < DISCUSSION_MAX_DURATION_MS) return null;
  room.phase = 'vote';
  room.votes = new Map();
  return toGameState(room);
}

export type MrWhiteGuessResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

/**
 * Mr. White (joueur éliminé) soumet sa proposition pour le mot des Citoyens.
 * Comparaison insensible à la casse et aux espaces.
 */
export function mrWhiteGuess(roomId: string, socketId: string, guess: string): MrWhiteGuessResult {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.gamePlayers || !room.wordPair) {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'mrWhiteGuess') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }
  const eliminatedId = room.eliminatedPlayerId ?? null;
  if (!eliminatedId) {
    return { ok: false, code: 'wrong_phase', message: 'Aucun joueur éliminé' };
  }
  const mrWhite = room.gamePlayers.find((p) => p.id === eliminatedId);
  if (!mrWhite || mrWhite.role !== 'mrWhite') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }
  if (mrWhite.socketId !== socketId) {
    return { ok: false, code: 'not_mr_white', message: 'Seul Mr. White peut proposer le mot' };
  }
  const normalizedGuess = guess.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedCitizen = room.wordPair.motCitoyens.trim().toLowerCase().replace(/\s+/g, ' ');
  const correct = normalizedGuess === normalizedCitizen;
  room.phase = 'end';
  room.winner = correct ? 'mrWhite' : 'citoyens';
  return { ok: true, roomState: toGameState(room) };
}

// --- update_room_config, start_next_round (room persistante, manches multiples)

function updateStatsFromGame(room: Room): void {
  if (room.phase !== 'end' || !room.gamePlayers || !room.winner) return;
  const statsMap = room.stats ?? new Map<string, PlayerStats>();
  const winner = room.winner;
  for (const p of room.gamePlayers) {
    const sid = p.sessionId ?? '';
    const cur = statsMap.get(sid) ?? { gamesPlayed: 0, wins: 0 };
    cur.gamesPlayed += 1;
    const won =
      (winner === 'citoyens' && p.role === 'citoyen') ||
      (winner === 'imposteur' && p.role === 'imposteur') ||
      (winner === 'mrWhite' && p.role === 'mrWhite');
    if (won) cur.wins += 1;
    statsMap.set(sid, cur);
  }
  room.stats = statsMap;
}

function clearGameState(room: Room): void {
  room.phase = undefined;
  room.gamePlayers = undefined;
  room.wordPair = undefined;
  room.roleRevealAcked = undefined;
  room.eliminatedPlayerId = undefined;
  room.winner = undefined;
  room.votes = undefined;
  room.discussionOrder = undefined;
  room.currentSpeakerIndex = undefined;
  room.turnStartedAt = undefined;
  room.turnDurationMs = undefined;
  room.discussionStartedAt = undefined;
}

export type UpdateRoomConfigResult =
  | { ok: true; roomState: RoomLobbyState } | { ok: true; gameState: RoomGameState }
  | { ok: false; code: string; message: string };

/**
 * Met à jour la config de la room (host uniquement).
 * Autorisé en lobby ou en phase 'end'.
 * playerCount ne peut pas être inférieur au nombre de membres présents.
 */
export function updateRoomConfig(
  roomId: string,
  socketId: string,
  config: GameConfig
): UpdateRoomConfigResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }
  if (room.hostSocketId !== socketId) {
    return { ok: false, code: 'not_host', message: 'Seul le host peut modifier la config' };
  }
  const canUpdate =
    room.status === 'lobby' || (room.status === 'playing' && room.phase === 'end');
  if (!canUpdate) {
    return { ok: false, code: 'wrong_phase', message: 'Config modifiable uniquement en lobby ou en fin de partie' };
  }
  const configCheck = validateConfig(config);
  if (!configCheck.ok) {
    return { ok: false, code: configCheck.code!, message: configCheck.message! };
  }
  if (config.playerCount < room.members.length) {
    return {
      ok: false,
      code: 'invalid_config',
      message: `Le nombre de joueurs ne peut pas être inférieur aux ${room.members.length} déjà présents`,
    };
  }
  room.config = config;
  if (room.status === 'lobby') {
    return { ok: true, roomState: toLobbyState(room) };
  }
  return { ok: true, gameState: toGameState(room) };
}

export type StartNextRoundResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

/**
 * Enchaîne une nouvelle manche : nettoie les déconnectés, enregistre les stats, relance avec nouveau tirage.
 * Host uniquement, uniquement en phase 'end'.
 * socketIdsInRoom : ensemble des socketId actuellement dans la room (pour exclure les déconnectés).
 */
export function startNextRound(
  roomId: string,
  socketId: string,
  socketIdsInRoom: string[]
): StartNextRoundResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }
  if (room.status !== 'playing' || room.phase !== 'end') {
    return { ok: false, code: 'wrong_phase', message: 'Une manche est déjà en cours ou la partie n\'est pas terminée' };
  }
  if (room.hostSocketId !== socketId) {
    return { ok: false, code: 'not_host', message: 'Seul le host peut lancer une nouvelle manche' };
  }

  const connectedSet = new Set(socketIdsInRoom);
  room.members = room.members.filter((m) => m.socketId !== '' && connectedSet.has(m.socketId));

  if (room.members.length === 0) {
    return { ok: false, code: 'no_players', message: 'Aucun joueur connecté dans la room' };
  }

  const hostStillPresent = room.members.some((m) => m.socketId === room.hostSocketId);
  if (!hostStillPresent) {
    room.hostSocketId = room.members[0].socketId;
    room.members.forEach((m, i) => {
      m.isHost = i === 0;
    });
  }

  const newPlayerCount = room.members.length;
  const mrWhiteEnabled = room.config.mrWhiteEnabled && newPlayerCount >= MIN_PLAYERS_FOR_MR_WHITE;
  const maxImp = Math.max(1, newPlayerCount - (mrWhiteEnabled ? 2 : 1));
  room.config = {
    playerCount: newPlayerCount,
    impostorCount: Math.min(room.config.impostorCount, maxImp),
    mrWhiteEnabled,
  };

  updateStatsFromGame(room);
  clearGameState(room);
  room.status = 'lobby';
  const { wordPair, players: gamePlayers } = startGameLogic(room.members, room.config);
  room.status = 'playing';
  room.phase = 'roleReveal';
  room.gamePlayers = gamePlayers;
  room.wordPair = wordPair;
  room.roleRevealAcked = new Set();
  return { ok: true, roomState: toGameState(room) };
}
