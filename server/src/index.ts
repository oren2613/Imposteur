/**
 * Serveur HTTP + Socket.IO pour le lobby et la partie Imposteur.
 * Gère create_room, join_room, start_game, auth, amis, invitations.
 */

import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  relayVoiceSignal,
} from './roomStore.js';
import {
  addToMatchmakingQueue,
  removeFromMatchmakingQueue,
  tryFormMatchmaking,
  getAllMatchmakingSocketIds,
  getMatchmakingQueueSize,
  MATCH_TARGET,
  MATCH_MIN,
  setMatchmakingTimeoutHandler,
  getMatchmakingStatus,
} from './matchmaking.js';
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
  initDb,
  createUser,
  findUserById,
  listFriends,
  listUserIdsWhoHaveAsFriend,
  addFriend,
  removeFriend,
  createFriendRequest,
  listPendingFriendRequests,
  acceptFriendRequest,
  refuseFriendRequest,
  updateUserAvatar,
  areFriends,
  type UserRow,
} from './db.js';
import { toPublicUser } from './user.js';

const MAX_AVATAR_LENGTH = 200_000;
const AVATAR_DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function isValidAvatarDataUrl(value: string): boolean {
  return value.length <= MAX_AVATAR_LENGTH && AVATAR_DATA_URL_RE.test(value);
}

async function getAvatarUrlFromAuthToken(authToken: string | undefined): Promise<string | null> {
  if (!authToken || typeof authToken !== 'string') return null;
  const user = await getUserFromToken(authToken);
  return user?.avatar_url ?? null;
}

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
    const user = await createUser(username, hash);
    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: toPublicUser(user) });
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
  res.json({ token, user: toPublicUser(user) });
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
  void getUserFromToken(token).then((user) => {
    if (!user) {
      res.status(401).json({ error: 'Token invalide ou expiré' });
      return;
    }
    (req as AuthReq).user = user;
    next();
  });
}

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: toPublicUser((req as AuthReq).user) });
});

app.patch('/auth/me/avatar', authMiddleware, async (req, res) => {
  const { avatarDataUrl } = req.body ?? {};
  if (!avatarDataUrl || typeof avatarDataUrl !== 'string' || !isValidAvatarDataUrl(avatarDataUrl)) {
    res.status(400).json({ error: 'Image invalide (JPEG, PNG ou WebP, max ~150 Ko)' });
    return;
  }
  const updated = await updateUserAvatar((req as AuthReq).user.id, avatarDataUrl);
  if (!updated) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return;
  }
  res.json({ user: toPublicUser(updated) });
});

app.delete('/auth/me/avatar', authMiddleware, async (req, res) => {
  const updated = await updateUserAvatar((req as AuthReq).user.id, null);
  if (!updated) {
    res.status(404).json({ error: 'Utilisateur introuvable' });
    return;
  }
  res.json({ user: toPublicUser(updated) });
});

app.get('/friends', authMiddleware, async (req, res) => {
  const friends = await listFriends((req as AuthReq).user.id);
  res.json({ friends });
});

app.post('/friends', authMiddleware, async (req, res) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'username requis', code: 'INVALID_INPUT' });
    return;
  }
  const result = await addFriend((req as AuthReq).user.id, username.trim());
  if (!result.ok) {
    const message =
      result.code === 'not_found'
        ? 'Utilisateur introuvable. Vérifie le pseudo.'
        : result.code === 'self'
          ? 'Tu ne peux pas t\'ajouter toi-même.'
          : 'Déjà dans tes amis.';
    res.status(result.code === 'not_found' ? 404 : 400).json({ error: message, code: result.code.toUpperCase() });
    return;
  }
  res.json({ friend: result.friend });
});

app.delete('/friends/:id', authMiddleware, async (req, res) => {
  const friendId = Number(req.params.id);
  if (!Number.isInteger(friendId)) {
    res.status(400).json({ error: 'ID invalide' });
    return;
  }
  const removed = await removeFriend((req as AuthReq).user.id, friendId);
  if (!removed) {
    res.status(404).json({ error: 'Ami introuvable' });
    return;
  }
  res.json({ ok: true });
});

// --- Demandes d'ami (envoyer, lister, accepter, refuser)
app.post('/friend_requests', authMiddleware, async (req, res) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'username requis' });
    return;
  }
  const result = await createFriendRequest((req as AuthReq).user.id, username.trim());
  if (!result.ok) {
    const message =
      result.code === 'not_found'
        ? 'Utilisateur introuvable.'
        : result.code === 'self'
          ? 'Tu ne peux pas t\'envoyer une demande à toi-même.'
          : result.code === 'already_friends'
            ? 'Vous êtes déjà amis.'
            : 'Demande déjà envoyée.';
    res.status(result.code === 'not_found' ? 404 : 400).json({ error: message, code: result.code });
    return;
  }
  res.json({ requestId: result.requestId, toUsername: result.toUsername });
  // Émettre en temps réel au destinataire s'il est connecté (io et userIdToSocketId définis plus bas)
  setImmediate(() => {
    const recipientSocketId = userIdToSocketId.get(result.toUserId);
    if (recipientSocketId && io) {
      io.to(recipientSocketId).emit('friend_request', {
        requestId: result.requestId,
        fromUserId: (req as AuthReq).user.id,
        fromUsername: (req as AuthReq).user.username,
        fromAvatarUrl: (req as AuthReq).user.avatar_url ?? null,
      });
    }
  });
});

app.get('/friend_requests', authMiddleware, async (req, res) => {
  const requests = await listPendingFriendRequests((req as AuthReq).user.id);
  res.json({ requests });
});

app.post('/friend_requests/:id/accept', authMiddleware, async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId)) {
    res.status(400).json({ error: 'ID invalide' });
    return;
  }
  const friend = await acceptFriendRequest(requestId, (req as AuthReq).user.id);
  if (!friend) {
    res.status(404).json({ error: 'Demande introuvable ou expirée' });
    return;
  }
  res.json({ friend });
});

app.post('/friend_requests/:id/refuse', authMiddleware, async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId)) {
    res.status(400).json({ error: 'ID invalide' });
    return;
  }
  const refused = await refuseFriendRequest(requestId, (req as AuthReq).user.id);
  if (!refused) {
    res.status(404).json({ error: 'Demande introuvable ou expirée' });
    return;
  }
  res.json({ ok: true });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.join(__dirname, '..', 'public');

/** Anciens liens /join/CODE → redirection vers l'app React */
app.get('/join/:code', (req, res) => {
  const raw = typeof req.params.code === 'string' ? req.params.code.trim().toUpperCase() : '';
  res.redirect(302, raw ? `/?room=${encodeURIComponent(raw)}` : '/');
});

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

setMatchmakingTimeoutHandler(() => {
  const match = tryFormMatchmaking({ forceMin: true });
  void applyMatchmakingMatch(match).then(() => {
    broadcastMatchmakingUpdate();
  });
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

interface JoinMatchmakingPayload {
  playerName: string;
  clientSessionId?: string;
  authToken?: string;
}

function isJoinMatchmakingPayload(p: unknown): p is JoinMatchmakingPayload {
  return (
    p !== null &&
    typeof p === 'object' &&
    'playerName' in p &&
    typeof (p as JoinMatchmakingPayload).playerName === 'string'
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

function broadcastMatchmakingUpdate(): void {
  const status = getMatchmakingStatus();
  for (const socketId of getAllMatchmakingSocketIds()) {
    io.to(socketId).emit('matchmaking_update', {
      searching: true,
      queueSize: status.queueSize,
      targetSize: status.targetSize,
      minSize: status.minSize,
      timeoutAt: status.timeoutAt,
    });
  }
}

async function applyMatchmakingMatch(
  match: ReturnType<typeof tryFormMatchmaking>
): Promise<void> {
  if (!match) return;
  const finalRoomState = match.players[match.players.length - 1]?.roomState;
  for (const player of match.players) {
    const peer = io.sockets.sockets.get(player.socketId);
    if (!peer) continue;
    peer.join(match.roomId);
    if (player.isHost) {
      peer.emit('room_created', {
        roomId: match.roomId,
        roomState: player.roomState,
      });
    } else {
      peer.emit('room_joined', {
        roomId: match.roomId,
        roomState: player.roomState,
        youAreHost: false,
      });
    }
    peer.emit('matchmaking_update', { searching: false, queueSize: 0, targetSize: MATCH_TARGET });
  }
  if (finalRoomState) {
    io.to(match.roomId).emit('room_state', { roomState: finalRoomState });
  }
}

async function associateSocketWithUser(socket: import('socket.io').Socket, authToken: string | undefined): Promise<void> {
  if (!authToken || typeof authToken !== 'string') return;
  const user = await getUserFromToken(authToken);
  if (user) {
    const uid = Number(user.id);
    const prev = userIdToSocketId.get(uid);
    if (prev) socketToUserId.delete(prev);
    socketToUserId.set(socket.id, uid);
    userIdToSocketId.set(uid, socket.id);
  }
}

/** Socket ID → User ID (pour envoyer les invitations aux amis) */
const socketToUserId = new Map<string, number>();
/** User ID → Socket ID (un seul socket par user pour les invites) */
const userIdToSocketId = new Map<number, string>();

const DEBUG_PRESENCE = process.env.DEBUG_PRESENCE === '1';

/** Notifie les amis d'un utilisateur que son statut en ligne a changé */
async function broadcastFriendStatus(userId: number, online: boolean): Promise<void> {
  const friendIds = await listUserIdsWhoHaveAsFriend(userId);
  const payload = { friendId: Number(userId), online };
  for (const friendUserId of friendIds) {
    const socketId = userIdToSocketId.get(Number(friendUserId));
    if (socketId) {
      io.to(socketId).emit('friend_status', payload);
    }
  }
  if (DEBUG_PRESENCE) {
    console.log(`[presence] userId=${userId} online=${online} notified ${friendIds.length} friend(s)`);
  }
}

io.on('connection', (socket) => {
  socket.on('authenticate', (payload: unknown) => {
    const token = payload && typeof payload === 'object' && 'token' in payload && typeof (payload as { token: string }).token === 'string'
      ? (payload as { token: string }).token
      : null;
    if (!token) return;
    void getUserFromToken(token).then((user) => {
      if (!user) return;
      const uid = Number(user.id);
      const prev = userIdToSocketId.get(uid);
      if (prev) socketToUserId.delete(prev);
      socketToUserId.set(socket.id, uid);
      userIdToSocketId.set(uid, socket.id);
      socket.emit('authenticated', { userId: uid, username: user.username });
      void broadcastFriendStatus(uid, true);
    });
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
    const rawFriendUserId = payload && typeof payload === 'object' && 'friendUserId' in payload
      ? (payload as { friendUserId: unknown }).friendUserId
      : null;
    const friendUserId = rawFriendUserId != null ? Number(rawFriendUserId) : NaN;
    if (Number.isNaN(friendUserId)) {
      emitError(socket, 'invalid_payload', 'friendUserId requis');
      return;
    }
    void areFriends(hostUserId, friendUserId).then((friends) => {
      if (!friends) {
        emitError(socket, 'not_friends', 'Cet utilisateur n\'est pas dans vos amis');
        return;
      }
      const friendSocketId = userIdToSocketId.get(friendUserId);
      if (!friendSocketId) {
        socket.emit('invite_sent', { success: false, message: 'Ami hors ligne' });
        return;
      }
      const hostName = getRoomHostName(roomId) ?? 'Un ami';
      void findUserById(hostUserId).then((hostUser) => {
        io.to(friendSocketId).emit('game_invite', {
          roomId,
          hostName,
          hostAvatarUrl: hostUser?.avatar_url ?? null,
        });
        socket.emit('invite_sent', { success: true });
      });
    });
  });

  socket.on('get_online_friends', (ack: (res: { friendIds: number[] }) => void) => {
    if (typeof ack !== 'function') return;
    const userId = socketToUserId.get(socket.id);
    if (userId == null) {
      if (DEBUG_PRESENCE) console.log('[presence] get_online_friends: socket not associated');
      ack({ friendIds: [] });
      return;
    }
    void listFriends(userId).then((friends) => {
      const friendIds = friends
        .filter((f) => userIdToSocketId.has(Number(f.id)))
        .map((f) => Number(f.id));
      if (DEBUG_PRESENCE) {
        console.log(`[presence] get_online_friends userId=${userId} totalFriends=${friends.length} online=${friendIds.length} ids=${JSON.stringify(friendIds)}`);
      }
      ack({ friendIds });
    });
  });

  socket.on('create_room', (payload: unknown) => {
    if (!isCreateRoomPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload create_room invalide');
      return;
    }

    void (async () => {
      const authToken = payload && typeof payload === 'object' && 'authToken' in payload && typeof (payload as { authToken: string }).authToken === 'string'
        ? (payload as { authToken: string }).authToken
        : undefined;
      const avatarUrl = await getAvatarUrlFromAuthToken(authToken);
      const result = createRoom(payload.config, payload.playerName, socket.id, payload.clientSessionId, avatarUrl);
      if (!result.ok) {
        emitError(socket, result.code, result.message);
        return;
      }

      await associateSocketWithUser(socket, authToken);
      const uidCreate = socketToUserId.get(socket.id);
      if (uidCreate != null) void broadcastFriendStatus(uidCreate, true);
      socket.join(result.roomId);
      socket.emit('room_created', {
        roomId: result.roomId,
        roomState: result.roomState,
      });
    })();
  });

  socket.on('join_matchmaking', (payload: unknown) => {
    if (!isJoinMatchmakingPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload join_matchmaking invalide');
      return;
    }

    void (async () => {
      const authToken =
        payload.authToken && typeof payload.authToken === 'string'
          ? payload.authToken
          : undefined;
      const avatarUrl = await getAvatarUrlFromAuthToken(authToken);
      const result = addToMatchmakingQueue(
        socket.id,
        payload.playerName,
        payload.clientSessionId,
        avatarUrl
      );
      if (!result.ok) {
        emitError(socket, result.code, result.message);
        return;
      }

      await associateSocketWithUser(socket, authToken);
      const uid = socketToUserId.get(socket.id);
      if (uid != null) void broadcastFriendStatus(uid, true);

      socket.emit('matchmaking_update', {
        searching: true,
        queueSize: result.queueSize,
        targetSize: result.targetSize,
        minSize: result.minSize,
        timeoutAt: result.timeoutAt,
      });
      broadcastMatchmakingUpdate();

      const match = tryFormMatchmaking();
      await applyMatchmakingMatch(match);
      if (match) {
        broadcastMatchmakingUpdate();
      }
    })();
  });

  socket.on('leave_matchmaking', () => {
    removeFromMatchmakingQueue(socket.id);
    socket.emit('matchmaking_update', {
      searching: false,
      queueSize: 0,
      targetSize: MATCH_TARGET,
    });
    broadcastMatchmakingUpdate();
  });

  socket.on('join_room', (payload: unknown) => {
    if (!isJoinRoomPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload join_room invalide');
      return;
    }

    void (async () => {
      const authToken = payload && typeof payload === 'object' && 'authToken' in payload && typeof (payload as { authToken: string }).authToken === 'string'
        ? (payload as { authToken: string }).authToken
        : undefined;
      const avatarUrl = await getAvatarUrlFromAuthToken(authToken);
      const result = joinRoom(payload.roomId, payload.playerName, socket.id, payload.clientSessionId, avatarUrl);
      if (!result.ok) {
        emitError(socket, result.code, result.message);
        return;
      }

      await associateSocketWithUser(socket, authToken);
      const uidJoin = socketToUserId.get(socket.id);
      if (uidJoin != null) void broadcastFriendStatus(uidJoin, true);
      socket.join(payload.roomId);
      socket.emit('room_joined', {
        roomId: payload.roomId,
        roomState: result.roomState,
        youAreHost: result.youAreHost,
      });
      io.to(payload.roomId).emit('room_state', { roomState: result.roomState });
    })();
  });

  socket.on('reconnect_to_room', (payload: unknown) => {
    if (!isReconnectToRoomPayload(payload)) {
      emitError(socket, 'invalid_payload', 'Payload reconnect_to_room invalide');
      return;
    }
    void (async () => {
      const roomId = payload.roomId.trim().toUpperCase();
      const authToken = payload && typeof payload === 'object' && 'authToken' in payload && typeof (payload as { authToken: string }).authToken === 'string'
        ? (payload as { authToken: string }).authToken
        : undefined;
      const avatarUrl = await getAvatarUrlFromAuthToken(authToken);
      const result = reconnectToRoom(roomId, socket.id, payload.playerSessionId, payload.playerName, avatarUrl);
      if (!result.ok) {
        emitError(socket, result.code, result.message);
        return;
      }
      await associateSocketWithUser(socket, authToken);
      const uidReconnect = socketToUserId.get(socket.id);
      if (uidReconnect != null) void broadcastFriendStatus(uidReconnect, true);
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
    })();
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

  socket.on('voice_signal', (payload: unknown) => {
    const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    const toPlayerId = raw?.toPlayerId;
    const signal = raw?.signal;
    const result = relayVoiceSignal(socket.id, toPlayerId, signal);
    if (!result.ok) {
      emitError(socket, result.code, result.message);
      return;
    }
    io.to(result.targetSocketId).emit('voice_signal', {
      fromPlayerId: result.fromPlayerId,
      signal,
    });
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
    const result = continueAfterEliminated(roomId, socket.id);
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
    removeFromMatchmakingQueue(socket.id);
    broadcastMatchmakingUpdate();
    const uid = socketToUserId.get(socket.id);
    if (uid != null) {
      void broadcastFriendStatus(uid, false);
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

async function startServer() {
  await initDb();
  httpServer.listen(PORT, '0.0.0.0', () => {
    const client = fs.existsSync(clientDistDir) ? ' + frontend' : '';
    console.log(`Serveur prêt sur http://0.0.0.0:${PORT} (${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}${client})`);
  });
}

startServer().catch((err) => {
  console.error('Impossible de démarrer le serveur:', err);
  process.exit(1);
});
