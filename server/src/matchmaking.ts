/**
 * File d'attente matchmaking : regroupe les joueurs en room automatiquement.
 */

import {
  createRoom,
  joinRoom,
  getRoomIdBySocket,
  validatePlayerName,
} from './roomStore.js';
import type { GameConfig, RoomLobbyState } from './types.js';

/** Minimum pour lancer une partie */
export const MATCH_MIN = 3;
/** Nombre idéal de joueurs dans une room matchmaking */
export const MATCH_PREFERRED = 4;
/** @deprecated alias */
export const MATCH_TARGET = MATCH_PREFERRED;
/** Délai avant match à 3 joueurs si la 4e personne n'arrive pas */
export const MATCH_TIMEOUT_MS = 20_000;

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

/** Planifie un match à MATCH_MIN joueurs si personne d'autre n'arrive. */
export function scheduleMatchmakingTimeout(): number | null {
  if (matchTimer) return matchTimeoutAt;
  if (queue.length >= MATCH_PREFERRED || queue.length < MATCH_MIN) {
    return null;
  }
  matchTimeoutAt = Date.now() + MATCH_TIMEOUT_MS;
  matchTimer = setTimeout(() => {
    matchTimer = null;
    matchTimeoutAt = null;
    onTimeoutMatch?.();
  }, MATCH_TIMEOUT_MS);
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
  } else if (queue.length >= MATCH_MIN) {
    timeoutAt = scheduleMatchmakingTimeout();
  } else {
    clearMatchTimer();
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
  if (queue.length >= MATCH_MIN && queue.length < MATCH_PREFERRED) {
    scheduleMatchmakingTimeout();
  } else {
    clearMatchTimer();
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
}

function formMatchWithCount(count: number): MatchmakingFormedMatch | null {
  if (queue.length < count || count < MATCH_MIN) return null;

  clearMatchTimer();
  const group = queue.splice(0, count);
  const [host, ...rest] = group;
  const config = buildConfigForCount(count);

  const createResult = createRoom(
    config,
    host.playerName,
    host.socketId,
    host.sessionId,
    host.avatarUrl
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
    if (!joinResult.ok) {
      continue;
    }
    players.push({
      socketId: entry.socketId,
      sessionId: entry.sessionId,
      isHost: false,
      roomState: joinResult.roomState,
    });
  }

  if (players.length < MATCH_MIN) {
    return null;
  }

  return { roomId: createResult.roomId, players };
}

/** Match immédiat à 4 joueurs, ou à 3+ si forceMin (timeout). */
export function tryFormMatchmaking(options?: { forceMin?: boolean }): MatchmakingFormedMatch | null {
  if (queue.length >= MATCH_PREFERRED) {
    return formMatchWithCount(MATCH_PREFERRED);
  }
  if (options?.forceMin && queue.length >= MATCH_MIN) {
    return formMatchWithCount(queue.length);
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
