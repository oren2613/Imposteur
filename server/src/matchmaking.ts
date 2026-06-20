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

export const MATCH_TARGET = 4;

const MATCHMAKING_CONFIG: GameConfig = {
  playerCount: MATCH_TARGET,
  impostorCount: 1,
  mrWhiteEnabled: true,
};

interface QueueEntry {
  socketId: string;
  playerName: string;
  sessionId?: string;
  avatarUrl?: string | null;
}

const queue: QueueEntry[] = [];

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
  | { ok: true; queueSize: number; targetSize: number }
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
    return { ok: true, queueSize: queue.length, targetSize: MATCH_TARGET };
  }

  queue.push({
    socketId,
    playerName: trimmed,
    sessionId: clientSessionId,
    avatarUrl: avatarUrl ?? null,
  });

  return { ok: true, queueSize: queue.length, targetSize: MATCH_TARGET };
}

export function removeFromMatchmakingQueue(socketId: string): boolean {
  const idx = queue.findIndex((e) => e.socketId === socketId);
  if (idx === -1) return false;
  queue.splice(idx, 1);
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

/** Forme une room dès que la file atteint MATCH_TARGET joueurs. */
export function tryFormMatchmaking(): MatchmakingFormedMatch | null {
  if (queue.length < MATCH_TARGET) return null;

  const group = queue.splice(0, MATCH_TARGET);
  const [host, ...rest] = group;

  const createResult = createRoom(
    MATCHMAKING_CONFIG,
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

  return { roomId: createResult.roomId, players };
}
