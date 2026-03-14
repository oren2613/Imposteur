/**
 * Serveur HTTP + Socket.IO pour le lobby et la partie Imposteur.
 * Gère create_room, join_room, start_game, auth, amis, invitations.
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
  getRoomHostName,
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
import {
  hashPassword,
  authenticateUser,
  signToken,
  getUserFromToken,
} from './auth.js';
import {
  createUser,
  listFriends,
  addFriend,
  removeFriend,
  type UserRow,
} from './db.js';

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// --- Auth (pas de middleware)
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'username et password requis' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    return;
  }
  try {
    const hash = await hashPassword(password);
    const user = createUser(username, hash);
    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (e) {
    if (e instanceof Error && (e.message === 'USERNAME_TAKEN' || e.message === 'USERNAME_INVALID')) {
      res.status(400).json({ error: e.message === 'USERNAME_TAKEN' ? 'Ce pseudo est déjà pris' : 'Pseudo invalide (2-30 caractères)' });
      return;
    }
    throw e;
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'username et password requis' });
    return;
  }
  const user = await authenticateUser(username, password);
  if (!user) {
    res.status(401).json({ error: 'Pseudo ou mot de passe incorrect' });
    return;
  }
  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username } });
});

// Requête authentifiée (après authMiddleware)
interface AuthReq extends express.Request {
  user: UserRow;
}

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Token requis' });
    return;
  }
  const user = getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
    return;
  }
  (req as AuthReq).user = user;
  next();
}

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: { id: (req as AuthReq).user.id, username: (req as AuthReq).user.username } });
});

app.get('/friends', authMiddleware, (req, res) => {
  const friends = listFriends((req as AuthReq).user.id);
  res.json({ friends });
});

app.post('/friends', authMiddleware, (req, res) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'username requis' });
    return;
  }
  const friend = addFriend((req as AuthReq).user.id, username.trim());
  if (!friend) {
    res.status(400).json({ error: 'Utilisateur introuvable ou déjà dans tes amis' });
    return;
  }
  res.json({ friend });
});

app.delete('/friends/:id', authMiddleware, (req, res) => {
  const friendId = Number(req.params.id);
  if (!Number.isInteger(friendId)) {
    res.status(400).json({ error: 'ID invalide' });
    return;
  }
  const removed = removeFriend((req as AuthReq).user.id, friendId);
  if (!removed) {
    res.status(404).json({ error: 'Ami introuvable' });
    return;
  }
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

/** Socket ID → User ID (pour envoyer les invitations aux amis) */
const socketToUserId = new Map<string, number>();
/** User ID → Socket ID (un seul socket par user pour les invites) */
const userIdToSocketId = new Map<number, string>();

io.on('connection', (socket) => {
  socket.on('authenticate', (payload: unknown) => {
    const token = payload && typeof payload === 'object' && 'token' in payload && typeof (payload as { token: string }).token === 'string'
      ? (payload as { token: string }).token
      : null;
    if (!token) return;
    const user = getUserFromToken(token);
    if (user) {
      const prev = userIdToSocketId.get(user.id);
      if (prev) socketToUserId.delete(prev);
      socketToUserId.set(socket.id, user.id);
      userIdToSocketId.set(user.id, socket.id);
      socket.emit('authenticated', { userId: user.id, username: user.username });
    }
  });

  socket.on('invite_to_room', (payload: unknown) => {
    const roomId = getRoomIdBySocket(socket.id);
    if (!roomId) {
      emitError(socket, 'not_in_room', 'Vous n\'êtes dans aucune room');
      return;
    }
    const hostUserId = socketToUserId.get(socket.id);
    if (hostUserId == null) {
      emitError(socket, 'not_authenticated', 'Connecte-toi pour inviter des amis');
      return;
    }
    const friendUserId = payload && typeof payload === 'object' && 'friendUserId' in payload && typeof (payload as { friendUserId: number }).friendUserId === 'number'
      ? (payload as { friendUserId: number }).friendUserId
      : null;
    if (friendUserId == null) {
      emitError(socket, 'invalid_payload', 'friendUserId requis');
      return;
    }
    const friendSocketId = userIdToSocketId.get(friendUserId);
    if (!friendSocketId) {
      socket.emit('invite_sent', { success: false, message: 'Ami hors ligne' });
      return;
    }
    const hostName = getRoomHostName(roomId) ?? 'Un ami';
    io.to(friendSocketId).emit('game_invite', { roomId, hostName });
    socket.emit('invite_sent', { success: true });
  });

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
    const uid = socketToUserId.get(socket.id);
    if (uid != null) {
      socketToUserId.delete(socket.id);
      if (userIdToSocketId.get(uid) === socket.id) userIdToSocketId.delete(uid);
    }
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

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur prêt sur http://0.0.0.0:${PORT}`);
});
