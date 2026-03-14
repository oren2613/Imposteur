/**
 * Serveur HTTP + Socket.IO pour le lobby et la partie Imposteur.
 * Gère create_room, join_room, start_game, role_reveal_ack, go_to_vote, vote,
 * continue_after_eliminated, mr_white_guess, disconnect. Pas encore : rejouer.
 */

import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  handleDisconnect,
  reconnectToRoom,
  startGame,
  startNextRound,
  getPrivateView,
  getRoomIdBySocket,
  transitionRoleRevealToDiscussion,
  ROLE_REVEAL_COUNTDOWN_MS,
  goToVote,
  vote,
  discussionPass,
  continueAfterEliminated,
  mrWhiteGuess,
  updateRoomConfig,
  advanceDiscussionIfSpeakerDisconnected,
  forceDiscussionToVoteIfTimeout,
  getDiscussionRoomIds,
} from './roomStore.js';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  ReconnectToRoomPayload,
  UpdateRoomConfigPayload,
  VotePayload,
  RoomClosedPayload,
  ErrorPayload,
  YourRolePayload,
  GameStatePayload,
} from './types.js';

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

/** Timers de countdown roleReveal → discussion (roomId → timeout) */
const roleRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();

function isCreateRoomPayload(p: unknown): p is CreateRoomPayload {
  return (
    p !== null &&
    typeof p === 'object' &&
    'config' in p &&
    typeof (p as CreateRoomPayload).config === 'object' &&
    'playerName' in p &&
    typeof (p as CreateRoomPayload).playerName === 'string'
  );
}

function isJoinRoomPayload(p: unknown): p is JoinRoomPayload {
  return (
    p !== null &&
    typeof p === 'object' &&
    'roomId' in p &&
    typeof (p as JoinRoomPayload).roomId === 'string' &&
    'playerName' in p &&
    typeof (p as JoinRoomPayload).playerName === 'string'
  );
}

function isReconnectToRoomPayload(p: unknown): p is ReconnectToRoomPayload {
  return (
    p !== null &&
    typeof p === 'object' &&
    'roomId' in p &&
    typeof (p as ReconnectToRoomPayload).roomId === 'string' &&
    'playerSessionId' in p &&
    typeof (p as ReconnectToRoomPayload).playerSessionId === 'string' &&
    'playerName' in p &&
    typeof (p as ReconnectToRoomPayload).playerName === 'string'
  );
}

function isUpdateRoomConfigPayload(p: unknown): p is UpdateRoomConfigPayload {
  return (
    p !== null &&
    typeof p === 'object' &&
    'config' in p &&
    typeof (p as UpdateRoomConfigPayload).config === 'object' &&
    typeof (p as UpdateRoomConfigPayload).config.playerCount === 'number' &&
    typeof (p as UpdateRoomConfigPayload).config.impostorCount === 'number' &&
    typeof (p as UpdateRoomConfigPayload).config.mrWhiteEnabled === 'boolean'
  );
}

function emitError(socket: import('socket.io').Socket, code: string, message: string) {
  const payload: ErrorPayload = { code, message };
  socket.emit('error', payload);
}

io.on('connection', (socket) => {
  socket.on('create_room', (payload: unknown) => {
    if (!isCreateRoomPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload create_room invalide');
      return;
    }

    const result = createRoom(payload.config, payload.playerName, socket.id, payload.clientSessionId);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }

    socket.join(result.roomId);
    socket.emit('room_created', {
      roomId: result.roomId,
      roomState: result.roomState,
    });
  });

  socket.on('join_room', (payload: unknown) => {
    if (!isJoinRoomPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload join_room invalide');
      return;
    }

    const result = joinRoom(payload.roomId, payload.playerName, socket.id, payload.clientSessionId);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }

    socket.join(payload.roomId);
    socket.emit('room_joined', {
      roomId: payload.roomId,
      roomState: result.roomState,
      youAreHost: result.youAreHost,
    });
    io.to(payload.roomId).emit('room_state', { roomState: result.roomState });
  });

  socket.on('reconnect_to_room', (payload: unknown) => {
    if (!isReconnectToRoomPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload reconnect_to_room invalide');
      return;
    }
    const roomId = payload.roomId.trim().toUpperCase();
    const result = reconnectToRoom(roomId, socket.id, payload.playerSessionId, payload.playerName);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    socket.join(roomId);
    if (result.kind === 'lobby') {
      socket.emit('room_joined', {
        roomId,
        roomState: result.roomState,
        youAreHost: result.youAreHost,
      });
      io.to(roomId).emit('room_state', { roomState: result.roomState });
    } else {
      socket.emit('your_role', { word: result.privateView.word, playerId: result.privateView.playerId });
      socket.emit('game_state', { roomState: result.roomState });
    }
  });

  socket.on('start_game', () => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }

    const result = startGame(roomId, socket.id);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }

    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sid of roomSockets) {
        const view = getPrivateView(roomId, sid);
        if (view) {
          const payload: YourRolePayload = { word: view.word, playerId: view.playerId };
          io.to(sid).emit('your_role', payload);
        }
      }
    }

    const gameStatePayload: GameStatePayload = { roomState: result.roomState };
    io.to(roomId).emit('game_state', gameStatePayload);

    const existing = roleRevealTimers.get(roomId);
    if (existing) clearTimeout(existing);
    roleRevealTimers.set(
      roomId,
      setTimeout(() => {
        roleRevealTimers.delete(roomId);
        const newState = transitionRoleRevealToDiscussion(roomId);
        if (newState) {
          io.to(roomId).emit('game_state', { roomState: newState });
        }
      }, ROLE_REVEAL_COUNTDOWN_MS)
    );
  });

  socket.on('discussion_pass', () => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    const result = discussionPass(roomId, socket.id);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    const gameStatePayload: GameStatePayload = { roomState: result.roomState };
    io.to(roomId).emit('game_state', gameStatePayload);
  });

  socket.on('go_to_vote', () => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    const result = goToVote(roomId, socket.id);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    const gameStatePayload: GameStatePayload = { roomState: result.roomState };
    io.to(roomId).emit('game_state', gameStatePayload);
  });

  socket.on('vote', (payload: unknown) => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    if (
      payload === null ||
      typeof payload !== 'object' ||
      !('targetPlayerId' in payload) ||
      typeof (payload as VotePayload).targetPlayerId !== 'string'
    ) {
      emitError(socket, 'invalid_payload', 'Payload vote invalide');
      return;
    }
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    const socketIdsInRoom = roomSockets ? [...roomSockets] : [];
    const result = vote(
      roomId,
      socket.id,
      (payload as VotePayload).targetPlayerId,
      socketIdsInRoom
    );
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    if (result.complete) {
      const gameStatePayload: GameStatePayload = { roomState: result.roomState };
      io.to(roomId).emit('game_state', gameStatePayload);
    }
  });

  socket.on('continue_after_eliminated', () => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    const result = continueAfterEliminated(roomId);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    const gameStatePayload: GameStatePayload = { roomState: result.roomState };
    io.to(roomId).emit('game_state', gameStatePayload);
  });

  socket.on('update_room_config', (payload: unknown) => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    if (!isUpdateRoomConfigPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload update_room_config invalide');
      return;
    }
    const result = updateRoomConfig(roomId, socket.id, payload.config);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    if ('roomState' in result) {
      io.to(roomId).emit('room_state', { roomState: result.roomState });
    } else {
      io.to(roomId).emit('game_state', { roomState: result.gameState });
    }
  });

  socket.on('start_next_round', () => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    const nextRoundSockets = io.sockets.adapter.rooms.get(roomId);
    const socketIdsInRoom = nextRoundSockets ? [...nextRoundSockets] : [];
    const result = startNextRound(roomId, socket.id, socketIdsInRoom);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    if (nextRoundSockets) {
      for (const sid of nextRoundSockets) {
        const view = getPrivateView(roomId, sid);
        if (view) {
          const payload: YourRolePayload = { word: view.word, playerId: view.playerId };
          io.to(sid).emit('your_role', payload);
        }
      }
    }
    io.to(roomId).emit('game_state', { roomState: result.roomState });
    const existing = roleRevealTimers.get(roomId);
    if (existing) clearTimeout(existing);
    roleRevealTimers.set(
      roomId,
      setTimeout(() => {
        roleRevealTimers.delete(roomId);
        const newState = transitionRoleRevealToDiscussion(roomId);
        if (newState) {
          io.to(roomId).emit('game_state', { roomState: newState });
        }
      }, ROLE_REVEAL_COUNTDOWN_MS)
    );
  });

  socket.on('mr_white_guess', (payload: unknown) => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    if (
      payload === null ||
      typeof payload !== 'object' ||
      !('guess' in payload) ||
      typeof (payload as { guess: string }).guess !== 'string'
    ) {
      emitError(socket, 'invalid_payload', 'Payload mr_white_guess invalide');
      return;
    }
    const result = mrWhiteGuess(roomId, socket.id, (payload as { guess: string }).guess.trim());
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    const gameStatePayload: GameStatePayload = { roomState: result.roomState };
    io.to(roomId).emit('game_state', gameStatePayload);
  });

  socket.on('leave_room', () => {
    const result = leaveRoom(socket.id);
    if (!result) return;

    if (result.action === 'closed') {
      roleRevealTimers.delete(result.roomId);
      const roomClosedPayload: RoomClosedPayload = {
        code: 'host_left',
        message: 'Le host a quitté la room',
      };
      io.to(result.roomId).emit('room_closed', roomClosedPayload);
      return;
    }

    if (result.action === 'updated') {
      io.to(result.roomId).emit('room_state', { roomState: result.roomState });
    }
    if (result.action === 'game_state') {
      io.to(result.roomId).emit('game_state', { roomState: result.roomState });
    }
    // action === 'empty' : rien à broadcaster, la room est supprimée
  });

  socket.on('disconnect', () => {
    const result = handleDisconnect(socket.id);
    if (!result) return;
    if (result.action === 'disconnected') {
      return;
    }

    if (result.action === 'closed') {
      roleRevealTimers.delete(result.roomId);
      const roomClosedPayload: RoomClosedPayload = {
        code: 'host_left',
        message: 'Le host a quitté la room',
      };
      io.to(result.roomId).emit('room_closed', roomClosedPayload);
      return;
    }

    if (result.action === 'updated') {
      io.to(result.roomId).emit('room_state', { roomState: result.roomState });
    }
    if (result.action === 'game_state') {
      io.to(result.roomId).emit('game_state', { roomState: result.roomState });
    }
  });
});

const DISCUSSION_TIMEOUT_CHECK_MS = 5000;
setInterval(() => {
  const roomIds = getDiscussionRoomIds();
  for (const roomId of roomIds) {
    const timeoutState = forceDiscussionToVoteIfTimeout(roomId);
    if (timeoutState) {
      io.to(roomId).emit('game_state', { roomState: timeoutState });
      continue;
    }
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    const socketIdsInRoom = roomSockets ? [...roomSockets] : [];
    const newState = advanceDiscussionIfSpeakerDisconnected(roomId, socketIdsInRoom);
    if (newState) {
      io.to(roomId).emit('game_state', { roomState: newState });
    }
  }
}, DISCUSSION_TIMEOUT_CHECK_MS);

httpServer.listen(PORT, () => {
  console.log(`Serveur prêt sur http://localhost:${PORT}`);
});
