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
import {
  getMaxImpostors,
  shouldContinueAfterImpostorEliminated,
} from '../shared/gameLogic.js';

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
  /** Votes du tour courant : playerId → targetPlayerId */
  votes?: Map<string, string>;
  /** Début de la phase vote (epoch ms) pour timer 30 s */
  voteStartedAt?: number;
  /** Discussion : ordre des playerIds, index du joueur courant, début du tour */
  discussionOrder?: string[];
  currentSpeakerIndex?: number;
  turnStartedAt?: number;
  turnDurationMs?: number;
  /** Début de la phase discussion (epoch ms) pour plafond 2 min */
  discussionStartedAt?: number;
  /** Lobby : décompte auto avant le début (epoch ms) */
  countdownEndsAt?: number | null;
  /** Lobby : joueurs ayant cliqué « Prêt » */
  readySocketIds?: Set<string>;
  /** Fin de manche : décompte avant la prochaine */
  nextRoundCountdownEndsAt?: number | null;
  /** Fin de manche : joueurs prêts */
  nextRoundReadySocketIds?: Set<string>;
}

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
/** Mr. White ne peut être activé qu'à partir de 4 joueurs */
const MIN_PLAYERS_FOR_MR_WHITE = 4;
/** Délai avant le début auto quand la room est pleine */
export const LOBBY_COUNTDOWN_MS = 10_000;
const ROOM_ID_LENGTH = 6;
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 30;

const rooms = new Map<string, Room>();
const socketToRoomId = new Map<string, string>();
/** Sockets remplacés par une nouvelle connexion (ne pas traiter comme déconnexion joueur). */
const replacingSockets = new Set<string>();

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

function findMemberForGamePlayer(room: Room, player: GamePlayerInternal): RoomMember | undefined {
  return room.members.find(
    (m) =>
      (player.sessionId && m.sessionId === player.sessionId) ||
      m.name.trim().toLowerCase() === player.name.trim().toLowerCase()
  );
}

/** Membre déconnecté ou avec un socketId fantôme (onglet fermé sans nettoyage). */
function isMemberReconnectable(member: RoomMember): boolean {
  return member.socketId === '' || !socketToRoomId.has(member.socketId);
}

function findReconnectableMemberByName(room: Room, playerName: string): RoomMember | undefined {
  const lower = playerName.trim().toLowerCase();
  return room.members.find(
    (m) => m.name.trim().toLowerCase() === lower && isMemberReconnectable(m)
  );
}

type AttachSocketResult =
  | { ok: true; kind: 'lobby'; roomState: RoomLobbyState; youAreHost: boolean; replacedSocketId?: string }
  | { ok: true; kind: 'playing'; roomState: RoomGameState; privateView: PlayerPrivateView & { playerId: string }; replacedSocketId?: string }
  | { ok: false; code: string; message: string };

export function markSocketBeingReplaced(socketId: string): void {
  replacingSockets.add(socketId);
}

export function consumeSocketBeingReplaced(socketId: string): boolean {
  if (!replacingSockets.has(socketId)) return false;
  replacingSockets.delete(socketId);
  return true;
}

/** Réassocie un socket à un membre existant (reconnexion ou reprise de place). */
function attachSocketToMember(
  room: Room,
  roomId: string,
  member: RoomMember,
  socketId: string,
  avatarUrl?: string | null,
  clientSessionId?: string
): AttachSocketResult {
  let replacedSocketId: string | undefined;
  if (member.socketId !== '' && member.socketId !== socketId) {
    replacedSocketId = member.socketId;
    socketToRoomId.delete(replacedSocketId);
    if (room.readySocketIds) room.readySocketIds.delete(replacedSocketId);
    if (room.nextRoundReadySocketIds) room.nextRoundReadySocketIds.delete(replacedSocketId);
    if (room.gamePlayers) {
      const oldPlayer = room.gamePlayers.find((p) => p.socketId === replacedSocketId);
      if (oldPlayer) oldPlayer.socketId = '';
    }
  }

  member.socketId = socketId;
  if (clientSessionId) member.sessionId = clientSessionId;
  if (avatarUrl !== undefined) member.avatarUrl = avatarUrl;
  if (member.isHost) room.hostSocketId = socketId;
  socketToRoomId.set(socketId, roomId);

  if (room.status === 'playing') {
    if (!room.gamePlayers) {
      return { ok: false, code: 'internal', message: 'État de partie incohérent' };
    }
    const player = room.gamePlayers.find(
      (p) =>
        (member.sessionId && p.sessionId === member.sessionId) ||
        p.name.trim().toLowerCase() === member.name.trim().toLowerCase()
    );
    if (!player) {
      return { ok: false, code: 'session_not_found', message: 'Session introuvable. Rejoins la room avec ton pseudo.' };
    }
    player.socketId = socketId;
    if (member.sessionId) player.sessionId = member.sessionId;
    if (avatarUrl !== undefined) player.avatarUrl = avatarUrl;
    const privateView = getPrivateView(roomId, socketId);
    if (!privateView) {
      return { ok: false, code: 'internal', message: 'Erreur interne' };
    }
    return {
      ok: true,
      kind: 'playing',
      roomState: toGameState(room),
      privateView,
      ...(replacedSocketId && { replacedSocketId }),
    };
  }

  if (room.status !== 'lobby') {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }

  return {
    ok: true,
    kind: 'lobby',
    roomState: toLobbyState(room),
    youAreHost: member.isHost,
    ...(replacedSocketId && { replacedSocketId }),
  };
}

function toLobbyState(room: Room): RoomLobbyState {
  const statsMap = room.stats ?? new Map<string, PlayerStats>();
  const readySet = room.readySocketIds ?? new Set<string>();
  const members: LobbyMemberPublic[] = room.members.map((m) => {
    const s = statsMap.get(m.sessionId ?? '') ?? { gamesPlayed: 0, wins: 0 };
    return {
      socketId: m.socketId,
      name: m.name,
      isHost: m.isHost,
      ready: readySet.has(m.socketId),
      gamesPlayed: s.gamesPlayed,
      wins: s.wins,
      avatarUrl: m.avatarUrl ?? null,
    };
  });
  return {
    status: 'lobby',
    roomId: room.id,
    config: room.config,
    members,
    hostSocketId: room.hostSocketId,
    countdownEndsAt: room.countdownEndsAt ?? null,
  };
}

const TURN_DURATION_MS = 20_000;
/** Durée max de la discussion avant passage automatique au vote */
const DISCUSSION_MAX_DURATION_MS = 120_000;
/** Durée max pour voter avant vote blanc automatique */
export const VOTE_MAX_DURATION_MS = 30_000;

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
    (p): PlayerPublic => ({
      id: p.id,
      name: p.name,
      eliminated: p.eliminated,
      connected: p.socketId !== '',
      avatarUrl: p.avatarUrl ?? null,
    })
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
  if (phase === 'end') {
    state.nextRoundCountdownEndsAt = room.nextRoundCountdownEndsAt ?? null;
    state.nextRoundReadySocketIds = room.nextRoundReadySocketIds
      ? [...room.nextRoundReadySocketIds]
      : [];
  }
  if (phase === 'vote' && room.votes && room.gamePlayers) {
    const eligible = room.gamePlayers.filter((p) => !p.eliminated);
    const votedPlayerIds = eligible
      .filter((p) => room.votes!.has(p.id))
      .map((p) => p.id);
    state.voteProgress = {
      votedCount: votedPlayerIds.length,
      eligibleCount: eligible.length,
      votedPlayerIds,
    };
    state.voteStartedAt = room.voteStartedAt;
    state.voteDurationMs = VOTE_MAX_DURATION_MS;
  }
  return state;
}

function clearLobbyCountdownState(room: Room): void {
  room.countdownEndsAt = null;
  room.readySocketIds?.clear();
}

function clearEndIntermissionState(room: Room): void {
  room.nextRoundCountdownEndsAt = null;
  room.nextRoundReadySocketIds?.clear();
}

function ensureReadySet(room: Room): Set<string> {
  if (!room.readySocketIds) room.readySocketIds = new Set();
  return room.readySocketIds;
}

function ensureNextRoundReadySet(room: Room): Set<string> {
  if (!room.nextRoundReadySocketIds) room.nextRoundReadySocketIds = new Set();
  return room.nextRoundReadySocketIds;
}

function isLobbyFull(room: Room): boolean {
  return room.status === 'lobby' && room.members.length === room.config.playerCount;
}

function allLobbyMembersReady(room: Room): boolean {
  if (!isLobbyFull(room)) return false;
  const ready = room.readySocketIds ?? new Set<string>();
  return room.members.every((m) => ready.has(m.socketId));
}

function allConnectedMembersReadyForNextRound(room: Room, socketIdsInRoom: string[]): boolean {
  if (room.status !== 'playing' || room.phase !== 'end') return false;
  const connected = room.members.filter((m) => m.socketId !== '' && socketIdsInRoom.includes(m.socketId));
  if (connected.length === 0) return false;
  const ready = room.nextRoundReadySocketIds ?? new Set<string>();
  return connected.every((m) => ready.has(m.socketId));
}

function enterEndPhase(room: Room, winner: Winner): RoomGameState {
  room.phase = 'end';
  room.winner = winner;
  room.nextRoundCountdownEndsAt = Date.now() + LOBBY_COUNTDOWN_MS;
  room.nextRoundReadySocketIds = new Set();
  return toGameState(room);
}

export type LobbyCountdownChange = 'started' | 'cancelled' | 'unchanged';

/** Démarre ou annule le décompte lobby selon le remplissage de la room. */
export function syncLobbyCountdown(roomId: string): { change: LobbyCountdownChange; roomState: RoomLobbyState | null } {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'lobby') {
    return { change: 'unchanged', roomState: null };
  }
  if (isLobbyFull(room)) {
    if (!room.countdownEndsAt) {
      room.countdownEndsAt = Date.now() + LOBBY_COUNTDOWN_MS;
      ensureReadySet(room).clear();
      return { change: 'started', roomState: toLobbyState(room) };
    }
    return { change: 'unchanged', roomState: toLobbyState(room) };
  }
  if (room.countdownEndsAt) {
    clearLobbyCountdownState(room);
    return { change: 'cancelled', roomState: toLobbyState(room) };
  }
  return { change: 'unchanged', roomState: toLobbyState(room) };
}

export function getLobbyState(roomId: string): RoomLobbyState | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'lobby') return null;
  return toLobbyState(room);
}

/** Snapshot membres + config (lobby ou partie en cours) pour reconnexion / UI */
export function getRoomMemberSnapshot(roomId: string): RoomLobbyState | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  return toLobbyState(room);
}

export type SetLobbyReadyResult =
  | { ok: true; roomState: RoomLobbyState; allReady: boolean }
  | { ok: true; gameState: RoomGameState; allReady: boolean }
  | { ok: false; code: string; message: string };

export function setLobbyReady(
  roomId: string,
  socketId: string,
  ready: boolean,
  socketIdsInRoom: string[]
): SetLobbyReadyResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }

  if (room.status === 'lobby') {
    if (!isLobbyFull(room)) {
      return { ok: false, code: 'room_not_full', message: 'La room n\'est pas encore pleine' };
    }
    if (!room.members.some((m) => m.socketId === socketId)) {
      return { ok: false, code: 'not_in_room', message: 'Joueur introuvable' };
    }
    const readySet = ensureReadySet(room);
    if (ready) readySet.add(socketId);
    else readySet.delete(socketId);
    const allReady = allLobbyMembersReady(room);
    return { ok: true, roomState: toLobbyState(room), allReady };
  }

  if (room.status === 'playing' && room.phase === 'end') {
    const member = room.members.find((m) => m.socketId === socketId);
    if (!member || !socketIdsInRoom.includes(socketId)) {
      return { ok: false, code: 'not_in_room', message: 'Joueur introuvable' };
    }
    const readySet = ensureNextRoundReadySet(room);
    if (ready) readySet.add(socketId);
    else readySet.delete(socketId);
    const allReady = allConnectedMembersReadyForNextRound(room, socketIdsInRoom);
    return { ok: true, gameState: toGameState(room), allReady };
  }

  return { ok: false, code: 'wrong_phase', message: 'Prêt indisponible dans cette phase' };
}

export type CreateRoomResult =
  | { ok: true; roomId: string; roomState: RoomLobbyState }
  | { ok: false; code: string; message: string };

export function createRoom(
  config: GameConfig,
  playerName: string,
  socketId: string,
  clientSessionId?: string,
  avatarUrl?: string | null
): CreateRoomResult {
  if (socketToRoomId.has(socketId)) {
    return { ok: false, code: 'already_in_room', message: 'Tu es déjà dans une room' };
  }

  const configCheck = validateConfig(config);
  if (!configCheck.ok) return { ok: false, code: configCheck.code!, message: configCheck.message! };

  const nameCheck = validatePlayerName(playerName);
  if (!nameCheck.ok) return { ok: false, code: nameCheck.code!, message: nameCheck.message! };

  const id = generateRoomId();
  const member: RoomMember = {
    socketId,
    name: playerName.trim(),
    isHost: true,
    avatarUrl: avatarUrl ?? null,
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

export type JoinRoomResult = AttachSocketResult;

export function joinRoom(
  roomId: string,
  playerName: string,
  socketId: string,
  clientSessionId?: string,
  avatarUrl?: string | null
): JoinRoomResult {
  const nameCheck = validatePlayerName(playerName);
  if (!nameCheck.ok) return { ok: false, code: nameCheck.code!, message: nameCheck.message! };

  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }

  const existingRoomId = socketToRoomId.get(socketId);
  if (existingRoomId && existingRoomId !== roomId) {
    return { ok: false, code: 'already_in_room', message: 'Tu es déjà dans une autre room' };
  }

  const trimmedName = playerName.trim();

  if (clientSessionId) {
    const bySession = room.members.find((m) => m.sessionId === clientSessionId);
    if (bySession) {
      return attachSocketToMember(room, roomId, bySession, socketId, avatarUrl, clientSessionId);
    }
  }

  const byName = findReconnectableMemberByName(room, trimmedName);
  if (byName) {
    return attachSocketToMember(room, roomId, byName, socketId, avatarUrl, clientSessionId);
  }

  if (room.status === 'playing') {
    return {
      ok: false,
      code: 'game_in_progress',
      message: 'La partie est en cours. Rejoins avec le même pseudo pour reprendre ta place.',
    };
  }

  if (room.members.length >= room.config.playerCount) {
    return { ok: false, code: 'room_full', message: 'La room est pleine' };
  }

  if (nameTakenInRoom(room, playerName)) {
    return { ok: false, code: 'name_taken', message: 'Ce pseudo est déjà pris' };
  }

  const member: RoomMember = {
    socketId,
    name: trimmedName,
    isHost: false,
    avatarUrl: avatarUrl ?? null,
    ...(clientSessionId && { sessionId: clientSessionId }),
  };
  room.members.push(member);
  socketToRoomId.set(socketId, roomId);

  return {
    ok: true,
    kind: 'lobby',
    roomState: toLobbyState(room),
    youAreHost: false,
  };
}

export type LeaveRoomResult =
  | { action: 'closed'; roomId: string; wasHost: true; socketIdsInRoom: string[] }
  | { action: 'updated'; roomId: string; wasHost: boolean; roomState: RoomLobbyState }
  | { action: 'empty'; roomId: string; wasHost: boolean }
  | { action: 'game_state'; roomId: string; roomState: RoomGameState }
  | null;

/** Résultat de handleDisconnect : soit disconnected (sans éliminer), soit LeaveRoomResult */
export type HandleDisconnectResult =
  | { action: 'disconnected'; roomId: string; roomState: RoomGameState }
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
      return { action: 'game_state', roomId, roomState: enterEndPhase(room, victory) };
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

  if (room.members.length === 0) {
    rooms.delete(roomId);
    return { action: 'empty', roomId, wasHost };
  }

  if (wasHost) {
    room.hostSocketId = room.members[0].socketId;
    room.members.forEach((m, i) => {
      m.isHost = i === 0;
    });
  }

  clearLobbyCountdownState(room);
  return {
    action: 'updated',
    roomId,
    wasHost,
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
  const host = room.members.find((m) => m.isHost);
  return host?.name ?? null;
}

/**
 * Appelé à la déconnexion socket (refresh, fermeture onglet).
 * En partie ou en lobby : ne pas retirer le joueur, libérer le socket pour reconnexion.
 * leaveRoom reste réservé au départ volontaire (leave_room).
 */
export function handleDisconnect(socketId: string): HandleDisconnectResult | null {
  if (consumeSocketBeingReplaced(socketId)) {
    socketToRoomId.delete(socketId);
    return null;
  }

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
    player.socketId = '';
    const member = findMemberForGamePlayer(room, player);
    if (member) member.socketId = '';

    if (room.phase === 'vote' && room.votes && !player.eliminated && !room.votes.has(player.id)) {
      room.votes.set(player.id, VOTE_BLANK);
      const finalized = tryFinalizeVote(room);
      if (finalized) {
        return { action: 'game_state', roomId, roomState: finalized.roomState };
      }
    }

    return { action: 'disconnected', roomId, roomState: toGameState(room) };
  }

  const member = room.members.find((m) => m.socketId === socketId);
  if (!member) {
    socketToRoomId.delete(socketId);
    return null;
  }
  member.socketId = '';
  if (room.readySocketIds) room.readySocketIds.delete(socketId);
  socketToRoomId.delete(socketId);
  clearLobbyCountdownState(room);
  return {
    action: 'updated',
    roomId,
    wasHost: member.isHost,
    roomState: toLobbyState(room),
  };
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
  playerName: string,
  avatarUrl?: string | null
): ReconnectToRoomResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }

  if (room.status === 'playing' && room.gamePlayers) {
    const memberBySession = room.members.find((m) => m.sessionId === playerSessionId);
    if (memberBySession) {
      return attachSocketToMember(room, roomId, memberBySession, socketId, avatarUrl, playerSessionId);
    }

    const memberByName = findReconnectableMemberByName(room, playerName);
    if (memberByName) {
      return attachSocketToMember(room, roomId, memberByName, socketId, avatarUrl, playerSessionId);
    }

    const player = room.gamePlayers.find(
      (p) =>
        !p.eliminated &&
        p.name.trim().toLowerCase() === playerName.trim().toLowerCase()
    );
    if (player) {
      const member = ensureMemberForGamePlayer(room, player);
      return attachSocketToMember(room, roomId, member, socketId, avatarUrl, playerSessionId);
    }

    return { ok: false, code: 'session_not_found', message: 'Session introuvable. Rejoins la room avec ton pseudo.' };
  }

  const member =
    room.members.find((m) => m.sessionId === playerSessionId) ??
    findReconnectableMemberByName(room, playerName);
  if (member) {
    return attachSocketToMember(room, roomId, member, socketId, avatarUrl, playerSessionId);
  }

  return { ok: false, code: 'session_not_found', message: 'Session introuvable. Rejoins la room avec ton pseudo.' };
}

// --- Démarrage de partie et role_reveal_ack

export type StartGameResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

export function startGameInternal(roomId: string): StartGameResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }
  if (room.status !== 'lobby') {
    return { ok: false, code: 'wrong_phase', message: 'La partie a déjà commencé' };
  }
  if (room.members.length !== room.config.playerCount) {
    return {
      ok: false,
      code: 'player_count_mismatch',
      message: `Il faut exactement ${room.config.playerCount} joueurs`,
    };
  }

  clearLobbyCountdownState(room);
  const { wordPair, players: gamePlayers } = startGameLogic(room.members, room.config);
  room.status = 'playing';
  room.phase = 'roleReveal';
  room.gamePlayers = gamePlayers;
  room.wordPair = wordPair;
  room.roleRevealAcked = new Set();

  return { ok: true, roomState: toGameState(room) };
}

/** @deprecated Utiliser startGameInternal — conservé pour compatibilité */
export function startGame(roomId: string, _socketId: string): StartGameResult {
  return startGameInternal(roomId);
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

/** Valeur de targetPlayerId pour un vote blanc (personne n'est éliminé) */
export const VOTE_BLANK = 'BLANK';

function getAlivePlayers(room: Room): GamePlayerInternal[] {
  return (room.gamePlayers ?? []).filter((p) => !p.eliminated);
}

/** Démarre la phase vote : timer 30 s + vote blanc immédiat pour les déconnectés. */
function beginVotePhase(room: Room): RoomGameState | null {
  room.phase = 'vote';
  room.votes = new Map();
  room.voteStartedAt = Date.now();
  applyBlankVotesForDisconnected(room);
  return tryFinalizeVote(room)?.roomState ?? null;
}

function applyBlankVotesForDisconnected(room: Room): void {
  if (!room.votes || !room.gamePlayers) return;
  for (const p of getAlivePlayers(room)) {
    if (p.socketId === '' && !room.votes.has(p.id)) {
      room.votes.set(p.id, VOTE_BLANK);
    }
  }
}

function applyBlankVotesForRemaining(room: Room): void {
  if (!room.votes || !room.gamePlayers) return;
  for (const p of getAlivePlayers(room)) {
    if (!room.votes.has(p.id)) {
      room.votes.set(p.id, VOTE_BLANK);
    }
  }
}

function allPlayersVoted(room: Room): boolean {
  if (!room.votes) return false;
  const alive = getAlivePlayers(room);
  return alive.length > 0 && alive.every((p) => room.votes!.has(p.id));
}

function resolveVotePhase(room: Room): RoomGameState {
  const eliminatedId = computeEliminated(room.gamePlayers!, room.votes!);
  room.votes = new Map();
  room.voteStartedAt = undefined;

  if (!eliminatedId) {
    const aliveIds = room.gamePlayers!.filter((p) => !p.eliminated).map((p) => p.id);
    room.phase = 'discussion';
    room.discussionOrder = shuffle(aliveIds);
    room.currentSpeakerIndex = 0;
    room.turnStartedAt = Date.now();
    room.discussionStartedAt = Date.now();
    return toGameState(room);
  }

  const eliminated = room.gamePlayers!.find((p) => p.id === eliminatedId)!;
  eliminated.eliminated = true;
  room.eliminatedPlayerId = eliminatedId;

  const victory = checkVictoryAfterElimination(room.gamePlayers!);
  if (victory) {
    return enterEndPhase(room, victory);
  }
  if (eliminated.role === 'imposteur') {
    if (shouldContinueAfterImpostorEliminated(room.gamePlayers!, room.config.mrWhiteEnabled)) {
      room.phase = 'eliminatedReveal';
      return toGameState(room);
    }
    return enterEndPhase(room, 'citoyens');
  }
  if (eliminated.role === 'mrWhite') {
    room.phase = 'mrWhiteGuess';
    return toGameState(room);
  }
  room.phase = 'eliminatedReveal';
  return toGameState(room);
}

function tryFinalizeVote(room: Room): { roomState: RoomGameState } | null {
  if (room.phase !== 'vote' || !allPlayersVoted(room)) return null;
  return { roomState: resolveVotePhase(room) };
}

function ensureMemberForGamePlayer(room: Room, player: GamePlayerInternal): RoomMember {
  const existing = findMemberForGamePlayer(room, player);
  if (existing) return existing;
  const member: RoomMember = {
    socketId: '',
    name: player.name,
    isHost: false,
    sessionId: player.sessionId,
    avatarUrl: player.avatarUrl ?? null,
  };
  room.members.push(member);
  return member;
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
  const finalized = beginVotePhase(room);
  return { ok: true, roomState: finalized ?? toGameState(room) };
}

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
  | { ok: true; complete: false; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

export function vote(
  roomId: string,
  socketId: string,
  targetPlayerId: string
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
  if (room.votes.has(voter.id)) return { ok: false, code: 'already_voted', message: 'Vous avez déjà voté' };

  if (targetPlayerId !== VOTE_BLANK) {
    const target = room.gamePlayers.find((p) => p.id === targetPlayerId);
    if (!target) return { ok: false, code: 'invalid_target', message: 'Cible invalide' };
    if (target.eliminated) return { ok: false, code: 'invalid_target', message: 'Ce joueur est éliminé' };
    if (target.id === voter.id) return { ok: false, code: 'invalid_target', message: 'Vous ne pouvez pas voter contre vous-même' };
  }

  room.votes.set(voter.id, targetPlayerId);

  const finalized = tryFinalizeVote(room);
  if (finalized) {
    return { ok: true, complete: true, roomState: finalized.roomState };
  }
  return { ok: true, complete: false, roomState: toGameState(room) };
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
    const finalized = beginVotePhase(room);
    return { ok: true, roomState: finalized ?? toGameState(room) };
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
    beginVotePhase(room);
  } else {
    room.turnStartedAt = Date.now();
  }
  return toGameState(room);
}

/**
 * Si tous les joueurs ont parlé mais la phase est encore « discussion », lancer le vote.
 * Filet de sécurité (ex. reprise après élimination sans reset d'index).
 */
export function advanceDiscussionToVoteIfComplete(roomId: string): RoomGameState | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || room.phase !== 'discussion' || !room.discussionOrder) {
    return null;
  }
  const idx = room.currentSpeakerIndex ?? 0;
  if (idx < room.discussionOrder.length) return null;
  const finalized = beginVotePhase(room);
  return finalized ?? toGameState(room);
}

/** Liste des roomId en phase discussion (pour le tick de timeout orateur déconnecté) */
export function getDiscussionRoomIds(): string[] {
  const ids: string[] = [];
  for (const [id, room] of rooms) {
    if (room.status === 'playing' && room.phase === 'discussion') ids.push(id);
  }
  return ids;
}

/** Liste des roomId en phase vote (pour le tick de timeout vote) */
export function getVoteRoomIds(): string[] {
  const ids: string[] = [];
  for (const [id, room] of rooms) {
    if (room.status === 'playing' && room.phase === 'vote') ids.push(id);
  }
  return ids;
}

/**
 * À l'expiration du timer vote (30 s), vote blanc automatique pour les joueurs restants.
 */
export function forceVoteIfTimeout(roomId: string): RoomGameState | null {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || room.phase !== 'vote' || !room.voteStartedAt) {
    return null;
  }
  if (Date.now() - room.voteStartedAt < VOTE_MAX_DURATION_MS) return null;
  applyBlankVotesForRemaining(room);
  const finalized = tryFinalizeVote(room);
  return finalized?.roomState ?? toGameState(room);
}

export type RelayVoiceSignalResult =
  | { ok: true; targetSocketId: string; fromPlayerId: string }
  | { ok: false; code: string; message: string };

/**
 * Relaie une signalisation WebRTC entre joueurs de la même room en phase discussion.
 */
export function relayVoiceSignal(
  socketId: string,
  toPlayerId: unknown,
  signal: unknown
): RelayVoiceSignalResult {
  const roomId = socketToRoomId.get(socketId);
  if (!roomId) {
    return { ok: false, code: 'not_in_room', message: 'Vous n\'êtes dans aucune room' };
  }
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.gamePlayers) {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'discussion') {
    return { ok: false, code: 'wrong_phase', message: 'Vocal disponible uniquement en discussion' };
  }
  if (typeof toPlayerId !== 'string' || !toPlayerId) {
    return { ok: false, code: 'invalid_payload', message: 'toPlayerId requis' };
  }
  if (!signal || typeof signal !== 'object' || !('type' in signal)) {
    return { ok: false, code: 'invalid_payload', message: 'signal invalide' };
  }
  const signalType = (signal as { type: unknown }).type;
  if (signalType !== 'offer' && signalType !== 'answer' && signalType !== 'ice-candidate' && signalType !== 'hangup') {
    return { ok: false, code: 'invalid_payload', message: 'type de signal invalide' };
  }

  const sender = room.gamePlayers.find((p) => p.socketId === socketId && !p.eliminated);
  if (!sender) {
    return { ok: false, code: 'not_a_player', message: 'Action non autorisée' };
  }
  const target = room.gamePlayers.find((p) => p.id === toPlayerId && !p.eliminated);
  if (!target || !target.socketId) {
    return { ok: false, code: 'player_not_found', message: 'Joueur introuvable' };
  }
  if (target.id === sender.id) {
    return { ok: false, code: 'invalid_payload', message: 'Destinataire invalide' };
  }

  return { ok: true, targetSocketId: target.socketId, fromPlayerId: sender.id };
}

export type ContinueAfterEliminatedResult =
  | { ok: true; roomState: RoomGameState }
  | { ok: false; code: string; message: string };

export function continueAfterEliminated(
  roomId: string,
  socketId: string
): ContinueAfterEliminatedResult {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.gamePlayers) {
    return { ok: false, code: 'wrong_phase', message: 'Action non autorisée' };
  }
  if (room.phase !== 'eliminatedReveal') {
    return { ok: false, code: 'wrong_phase', message: 'Phase incorrecte' };
  }
  const player = room.gamePlayers.find((p) => p.socketId === socketId);
  if (!player || player.eliminated) {
    return { ok: false, code: 'not_a_player', message: 'Action non autorisée' };
  }
  const aliveIds = room.gamePlayers.filter((p) => !p.eliminated).map((p) => p.id);
  room.phase = 'discussion';
  room.eliminatedPlayerId = null;
  room.discussionOrder = shuffle(aliveIds);
  room.currentSpeakerIndex = 0;
  room.turnStartedAt = Date.now();
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
  beginVotePhase(room);
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
  return { ok: true, roomState: enterEndPhase(room, correct ? 'mrWhite' : 'citoyens') };
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
  room.voteStartedAt = undefined;
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
export function startNextRoundInternal(
  roomId: string,
  socketIdsInRoom: string[]
): StartNextRoundResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, code: 'room_not_found', message: 'Room introuvable' };
  }
  if (room.status !== 'playing' || room.phase !== 'end') {
    return { ok: false, code: 'wrong_phase', message: 'Une manche est déjà en cours ou la partie n\'est pas terminée' };
  }

  clearEndIntermissionState(room);

  const connectedSet = new Set(socketIdsInRoom);
  room.members = room.members.filter((m) => m.socketId !== '' && connectedSet.has(m.socketId));

  if (room.members.length === 0) {
    return { ok: false, code: 'no_players', message: 'Aucun joueur connecté dans la room' };
  }

  if (room.members.length < MIN_PLAYERS) {
    return { ok: false, code: 'not_enough_players', message: `Il faut au moins ${MIN_PLAYERS} joueurs` };
  }

  if (!room.members.some((m) => m.socketId === room.hostSocketId)) {
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

export function startNextRound(
  roomId: string,
  _socketId: string,
  socketIdsInRoom: string[]
): StartNextRoundResult {
  return startNextRoundInternal(roomId, socketIdsInRoom);
}

/** Snapshot sérialisable pour la base (sans sockets actifs). */
interface PersistedRoom {
  id: string;
  hostSocketId: string;
  config: GameConfig;
  status: 'lobby' | 'playing';
  members: RoomMember[];
  stats: [string, PlayerStats][];
  phase?: GamePhase;
  gamePlayers?: GamePlayerInternal[];
  wordPair?: WordPair;
  roleRevealAcked?: string[];
  eliminatedPlayerId?: string | null;
  winner?: Winner | null;
  votes?: [string, string][];
  voteStartedAt?: number;
  discussionOrder?: string[];
  currentSpeakerIndex?: number;
  turnStartedAt?: number;
  turnDurationMs?: number;
  discussionStartedAt?: number;
  countdownEndsAt?: number | null;
  readySocketIds?: string[];
  nextRoundCountdownEndsAt?: number | null;
  nextRoundReadySocketIds?: string[];
}

function roomToPersisted(room: Room): PersistedRoom {
  return {
    id: room.id,
    hostSocketId: room.hostSocketId,
    config: room.config,
    status: room.status,
    members: room.members.map((m) => ({ ...m })),
    stats: [...(room.stats ?? new Map()).entries()],
    phase: room.phase,
    gamePlayers: room.gamePlayers?.map((p) => ({ ...p })),
    wordPair: room.wordPair,
    roleRevealAcked: room.roleRevealAcked ? [...room.roleRevealAcked] : undefined,
    eliminatedPlayerId: room.eliminatedPlayerId,
    winner: room.winner,
    votes: room.votes ? [...room.votes.entries()] : undefined,
    voteStartedAt: room.voteStartedAt,
    discussionOrder: room.discussionOrder,
    currentSpeakerIndex: room.currentSpeakerIndex,
    turnStartedAt: room.turnStartedAt,
    turnDurationMs: room.turnDurationMs,
    discussionStartedAt: room.discussionStartedAt,
    countdownEndsAt: room.countdownEndsAt ?? null,
    readySocketIds: room.readySocketIds ? [...room.readySocketIds] : undefined,
    nextRoundCountdownEndsAt: room.nextRoundCountdownEndsAt ?? null,
    nextRoundReadySocketIds: room.nextRoundReadySocketIds
      ? [...room.nextRoundReadySocketIds]
      : undefined,
  };
}

function clearSocketBindings(room: Room): void {
  room.hostSocketId = '';
  for (const m of room.members) m.socketId = '';
  if (room.gamePlayers) {
    for (const p of room.gamePlayers) p.socketId = '';
  }
  room.readySocketIds = new Set();
  room.nextRoundReadySocketIds = new Set();
  room.roleRevealAcked = new Set();
}

function persistedToRoom(data: PersistedRoom): Room {
  const room: Room = {
    id: data.id,
    hostSocketId: data.hostSocketId,
    config: data.config,
    status: data.status,
    members: data.members,
    stats: new Map(data.stats),
    phase: data.phase,
    gamePlayers: data.gamePlayers,
    wordPair: data.wordPair,
    roleRevealAcked: data.roleRevealAcked ? new Set(data.roleRevealAcked) : undefined,
    eliminatedPlayerId: data.eliminatedPlayerId,
    winner: data.winner ?? null,
    votes: data.votes ? new Map(data.votes) : undefined,
    voteStartedAt: data.voteStartedAt,
    discussionOrder: data.discussionOrder,
    currentSpeakerIndex: data.currentSpeakerIndex,
    turnStartedAt: data.turnStartedAt,
    turnDurationMs: data.turnDurationMs,
    discussionStartedAt: data.discussionStartedAt,
    countdownEndsAt: data.countdownEndsAt ?? null,
    readySocketIds: data.readySocketIds ? new Set(data.readySocketIds) : undefined,
    nextRoundCountdownEndsAt: data.nextRoundCountdownEndsAt ?? null,
    nextRoundReadySocketIds: data.nextRoundReadySocketIds
      ? new Set(data.nextRoundReadySocketIds)
      : undefined,
  };
  clearSocketBindings(room);
  return room;
}

export function exportPersistedRoom(roomId: string): PersistedRoom | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  return roomToPersisted(room);
}

export function importPersistedRoom(roomId: string, data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const parsed = data as PersistedRoom;
  if (parsed.id !== roomId || !parsed.config || !Array.isArray(parsed.members)) return;
  rooms.set(roomId, persistedToRoom(parsed));
}
