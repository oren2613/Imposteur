/**
 * File d'attente matchmaking : regroupe les joueurs en room automatiquement.
 */

import {
  createRoom,
  joinRoom,
  getRoomIdBySocket,
  validatePlayerName,
  addBotToRoom,
  getLobbyState,
} from './roomStore.js';
import type { GameConfig, RoomLobbyState } from './types.js';

/** Minimum pour lancer une partie */
export const MATCH_MIN = 3;
/** Nombre idéal de joueurs dans une room matchmaking */
export const MATCH_PREFERRED = 4;
/** @deprecated alias */
export const MATCH_TARGET = MATCH_PREFERRED;
/** Délai avant complétion par des bots quand il manque peu de monde (3 joueurs en attente) */
export const MATCH_TIMEOUT_MS = 20_000;
/** Délai plus long avant de compléter par des bots quand il manque beaucoup de monde (1-2 joueurs) */
export const BOT_BACKFILL_TIMEOUT_MS = Number(process.env.BOT_BACKFILL_TIMEOUT_MS) || 35_000;
/** Activation des joueurs IA (compléter le matchmaking). Désactivable via BOTS_ENABLED=0. */
export const BOTS_ENABLED = process.env.BOTS_ENABLED !== '0';

interface QueueEntry {
  socketId: string;
  playerName: string;
  sessionId?: string;
  avatarUrl?: string | null;
}

const queue: QueueEntry[] = [];
let matchTimer: ReturnType<typeof setTimeout> | null = null;
let matchTimeoutAt: number | null = null;
let onTimeoutMatch: (() => void) | null = null;

export function setMatchmakingTimeoutHandler(handler: () => void): void {
  onTimeoutMatch = handler;
}

function buildConfigForCount(playerCount: number): GameConfig {
  return {
    playerCount,
    impostorCount: 1,
    mrWhiteEnabled: playerCount >= 4,
  };
}

function clearMatchTimer(): void {
  if (matchTimer) {
    clearTimeout(matchTimer);
    matchTimer = null;
  }
  matchTimeoutAt = null;
}

/**
 * Planifie la formation d'une room quand l'attente devient trop longue.
 * Avec les bots activés : on programme dès 1 joueur (délai plus long en dessous de
 * MATCH_MIN) afin de compléter par des bots. Sans bots : comportement historique
 * (uniquement à partir de MATCH_MIN, match humain forcé).
 */
export function scheduleMatchmakingTimeout(): number | null {
  if (matchTimer) return matchTimeoutAt;
  if (queue.length >= MATCH_PREFERRED) return null;
  const minToSchedule = BOTS_ENABLED ? 1 : MATCH_MIN;
  if (queue.length < minToSchedule) return null;
  const delay = queue.length >= MATCH_MIN ? MATCH_TIMEOUT_MS : BOT_BACKFILL_TIMEOUT_MS;
  matchTimeoutAt = Date.now() + delay;
  matchTimer = setTimeout(() => {
    matchTimer = null;
    matchTimeoutAt = null;
    onTimeoutMatch?.();
  }, delay);
  return matchTimeoutAt;
}

export function getMatchmakingQueueSize(): number {
  return queue.length;
}

export function isInMatchmakingQueue(socketId: string): boolean {
  return queue.some((e) => e.socketId === socketId);
}

export function getAllMatchmakingSocketIds(): string[] {
  return queue.map((e) => e.socketId);
}

export type AddToMatchmakingResult =
  | { ok: true; queueSize: number; targetSize: number; minSize: number; timeoutAt: number | null }
  | { ok: false; code: string; message: string };

export function addToMatchmakingQueue(
  socketId: string,
  playerName: string,
  clientSessionId?: string,
  avatarUrl?: string | null
): AddToMatchmakingResult {
  if (getRoomIdBySocket(socketId)) {
    return { ok: false, code: 'already_in_room', message: 'Tu es déjà dans une room' };
  }

  const nameCheck = validatePlayerName(playerName);
  if (!nameCheck.ok) {
    return { ok: false, code: nameCheck.code!, message: nameCheck.message! };
  }

  const trimmed = playerName.trim();
  const nameTaken = queue.some((e) => e.playerName.trim().toLowerCase() === trimmed.toLowerCase());
  if (nameTaken && !isInMatchmakingQueue(socketId)) {
    return { ok: false, code: 'name_taken', message: 'Ce pseudo est déjà dans la file d\'attente' };
  }

  if (isInMatchmakingQueue(socketId)) {
    return {
      ok: true,
      queueSize: queue.length,
      targetSize: MATCH_PREFERRED,
      minSize: MATCH_MIN,
      timeoutAt: matchTimeoutAt,
    };
  }

  queue.push({
    socketId,
    playerName: trimmed,
    sessionId: clientSessionId,
    avatarUrl: avatarUrl ?? null,
  });

  let timeoutAt: number | null = null;
  if (queue.length >= MATCH_PREFERRED) {
    clearMatchTimer();
  } else {
    timeoutAt = scheduleMatchmakingTimeout();
  }

  return {
    ok: true,
    queueSize: queue.length,
    targetSize: MATCH_PREFERRED,
    minSize: MATCH_MIN,
    timeoutAt,
  };
}

export function removeFromMatchmakingQueue(socketId: string): boolean {
  const idx = queue.findIndex((e) => e.socketId === socketId);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  if (queue.length === 0 || queue.length >= MATCH_PREFERRED) {
    clearMatchTimer();
  } else {
    scheduleMatchmakingTimeout();
  }
  return true;
}

export interface MatchedPlayer {
  socketId: string;
  sessionId?: string;
  isHost: boolean;
  roomState: RoomLobbyState;
}

export interface MatchmakingFormedMatch {
  roomId: string;
  players: MatchedPlayer[];
  /** État final du lobby (avec d'éventuels bots ajoutés), pour le room_state diffusé. */
  finalRoomState: RoomLobbyState;
}

/**
 * Forme une room avec `humanCount` joueurs de la file et complète jusqu'à
 * `targetSize` avec des bots (0 bot si humanCount === targetSize).
 */
function formMatch(humanCount: number, targetSize: number): MatchmakingFormedMatch | null {
  if (queue.length < humanCount || humanCount < 1) return null;

  clearMatchTimer();
  const group = queue.splice(0, humanCount);
  const [host, ...rest] = group;
  const config = buildConfigForCount(targetSize);

  const createResult = createRoom(
    config,
    host.playerName,
    host.socketId,
    host.sessionId,
    host.avatarUrl,
    'private'
  );

  if (!createResult.ok) {
    queue.unshift(...group);
    return null;
  }

  const players: MatchedPlayer[] = [
    {
      socketId: host.socketId,
      sessionId: host.sessionId,
      isHost: true,
      roomState: createResult.roomState,
    },
  ];

  for (const entry of rest) {
    const joinResult = joinRoom(
      createResult.roomId,
      entry.playerName,
      entry.socketId,
      entry.sessionId,
      entry.avatarUrl
    );
    if (!joinResult.ok || joinResult.kind !== 'lobby') {
      continue;
    }
    players.push({
      socketId: entry.socketId,
      sessionId: entry.sessionId,
      isHost: false,
      roomState: joinResult.roomState,
    });
  }

  if (players.length < 1) {
    return null;
  }

  // Compléter avec des bots jusqu'à la taille cible.
  const botsToAdd = Math.max(0, targetSize - players.length);
  for (let i = 0; i < botsToAdd; i++) {
    const result = addBotToRoom(createResult.roomId);
    if (!result.ok) break;
  }

  const finalRoomState = getLobbyState(createResult.roomId) ?? createResult.roomState;
  return { roomId: createResult.roomId, players, finalRoomState };
}

/**
 * Forme une room :
 * - à 4 humains : immédiatement, sans bot ;
 * - si `fillWithBots` (timeout) et bots activés : avec les humains présents + bots jusqu'à 4 ;
 * - sinon si `forceMin` (timeout, bots désactivés) : match humain à 3+.
 */
export function tryFormMatchmaking(options?: {
  forceMin?: boolean;
  fillWithBots?: boolean;
}): MatchmakingFormedMatch | null {
  if (queue.length >= MATCH_PREFERRED) {
    return formMatch(MATCH_PREFERRED, MATCH_PREFERRED);
  }
  if (options?.fillWithBots && BOTS_ENABLED && queue.length >= 1) {
    return formMatch(queue.length, MATCH_PREFERRED);
  }
  if (options?.forceMin && queue.length >= MATCH_MIN) {
    return formMatch(queue.length, queue.length);
  }
  return null;
}

export function getMatchmakingStatus(): {
  queueSize: number;
  targetSize: number;
  minSize: number;
  timeoutAt: number | null;
} {
  return {
    queueSize: queue.length,
    targetSize: MATCH_PREFERRED,
    minSize: MATCH_MIN,
    timeoutAt: matchTimeoutAt,
  };
}
