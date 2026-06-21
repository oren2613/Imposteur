/**
 * File d'attente matchmaking : regroupe les joueurs en room automatiquement.
 *
 * Joueurs IA : tant qu'un humain attend et que la room n'est pas pleine, un bot
 * est ajouté à la file toutes les BOT_ADD_INTERVAL_MS (20 s par défaut). La file
 * affichée grandit donc progressivement (1/4 → 2/4 → 3/4 → 4/4), puis la partie
 * démarre. Si de vrais joueurs arrivent entre-temps, ils prennent la place des bots.
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
/** Délai (sans bots) avant un match humain forcé à 3+ */
export const MATCH_TIMEOUT_MS = 20_000;
/** Intervalle d'ajout d'un joueur IA quand un humain attend (toutes les 20 s) */
export const BOT_ADD_INTERVAL_MS = Number(process.env.BOT_ADD_INTERVAL_MS) || 20_000;
/** Activation des joueurs IA (compléter le matchmaking). Désactivable via BOTS_ENABLED=0. */
export const BOTS_ENABLED = process.env.BOTS_ENABLED !== '0';
/**
 * Mot de passe interne des rooms de matchmaking : elles sont « private » donc
 * NON listées dans le navigateur de rooms, mais createRoom/joinRoom exigent un
 * mot de passe pour une room privée. On en utilise un fixe, invisible des joueurs.
 */
const MATCHMAKING_PASSWORD = '__mm__';

interface QueueEntry {
  socketId: string;
  playerName: string;
  sessionId?: string;
  avatarUrl?: string | null;
  /** Entrée IA (pas de socket réel) ajoutée pour compléter une attente. */
  isBot?: boolean;
}

const queue: QueueEntry[] = [];
let matchTimer: ReturnType<typeof setTimeout> | null = null;
let matchTimeoutAt: number | null = null;
let onTimeoutMatch: (() => void) | null = null;
let botQueueCounter = 0;

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

function humanQueueCount(): number {
  return queue.filter((e) => !e.isBot).length;
}

/**
 * Planifie le prochain « tick » de matchmaking.
 * - Bots activés : toutes les BOT_ADD_INTERVAL_MS dès qu'un humain attend (ajout d'un bot).
 * - Bots désactivés : un seul match humain forcé après MATCH_TIMEOUT_MS à partir de MATCH_MIN.
 */
export function scheduleMatchmakingTimeout(): number | null {
  if (matchTimer) return matchTimeoutAt;
  if (queue.length >= MATCH_PREFERRED) return null;
  if (humanQueueCount() < 1) return null;
  if (!BOTS_ENABLED && humanQueueCount() < MATCH_MIN) return null;

  const delay = BOTS_ENABLED ? BOT_ADD_INTERVAL_MS : MATCH_TIMEOUT_MS;
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
  return queue.some((e) => !e.isBot && e.socketId === socketId);
}

export function getAllMatchmakingSocketIds(): string[] {
  return queue.filter((e) => !e.isBot && e.socketId).map((e) => e.socketId);
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
  const nameTaken = queue.some(
    (e) => !e.isBot && e.playerName.trim().toLowerCase() === trimmed.toLowerCase()
  );
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

/** Retire tous les bots actuellement en file (quand plus aucun humain n'attend). */
function purgeQueuedBots(): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].isBot) queue.splice(i, 1);
  }
}

export function removeFromMatchmakingQueue(socketId: string): boolean {
  const idx = queue.findIndex((e) => !e.isBot && e.socketId === socketId);
  if (idx === -1) return false;
  queue.splice(idx, 1);

  if (humanQueueCount() === 0) {
    purgeQueuedBots();
    clearMatchTimer();
  } else if (queue.length >= MATCH_PREFERRED) {
    clearMatchTimer();
  } else {
    scheduleMatchmakingTimeout();
  }
  return true;
}

/**
 * Ajoute un joueur IA à la file si un humain attend et que la room n'est pas pleine.
 * Retourne true si un bot a été ajouté.
 */
export function addBotToQueueIfWaiting(): boolean {
  if (!BOTS_ENABLED) return false;
  if (humanQueueCount() < 1) return false;
  if (queue.length >= MATCH_PREFERRED) return false;
  queue.push({ socketId: '', playerName: `__bot__${++botQueueCounter}`, isBot: true });
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
  /** État final du lobby (avec d'éventuels bots), pour le room_state diffusé. */
  finalRoomState: RoomLobbyState;
}

/**
 * Forme une room à partir d'un ensemble d'entrées (humains + bots déjà retirés de la file).
 * Le 1er humain devient hôte. En cas d'échec, les entrées sont remises en file.
 */
function formMatchFromEntries(entries: QueueEntry[]): MatchmakingFormedMatch | null {
  const humans = entries.filter((e) => !e.isBot);
  const botEntries = entries.filter((e) => e.isBot);
  if (humans.length < 1) {
    queue.unshift(...entries);
    return null;
  }

  clearMatchTimer();
  const [host, ...restHumans] = humans;
  const config = buildConfigForCount(entries.length);

  const createResult = createRoom(
    config,
    host.playerName,
    host.socketId,
    host.sessionId,
    host.avatarUrl,
    'private',
    MATCHMAKING_PASSWORD
  );
  if (!createResult.ok) {
    queue.unshift(...entries);
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

  for (const entry of restHumans) {
    const joinResult = joinRoom(
      createResult.roomId,
      entry.playerName,
      entry.socketId,
      entry.sessionId,
      entry.avatarUrl,
      MATCHMAKING_PASSWORD
    );
    if (!joinResult.ok || joinResult.kind !== 'lobby') continue;
    players.push({
      socketId: entry.socketId,
      sessionId: entry.sessionId,
      isHost: false,
      roomState: joinResult.roomState,
    });
  }

  for (let i = 0; i < botEntries.length; i++) {
    const result = addBotToRoom(createResult.roomId);
    if (!result.ok) break;
  }

  const finalRoomState = getLobbyState(createResult.roomId) ?? createResult.roomState;
  return { roomId: createResult.roomId, players, finalRoomState };
}

/**
 * Forme une room :
 * - dès que la file (humains + bots) atteint MATCH_PREFERRED ;
 * - ou, sans bots, un match humain à 3+ si `forceMin`.
 */
export function tryFormMatchmaking(options?: { forceMin?: boolean }): MatchmakingFormedMatch | null {
  if (queue.length >= MATCH_PREFERRED) {
    return formMatchFromEntries(queue.splice(0, MATCH_PREFERRED));
  }
  if (options?.forceMin && humanQueueCount() >= MATCH_MIN) {
    return formMatchFromEntries(queue.splice(0, queue.length));
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
