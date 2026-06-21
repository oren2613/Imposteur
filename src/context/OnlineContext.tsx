/**
 * Contexte pour le mode en ligne : socket et état du lobby.
 * Connexion établie uniquement quand on est dans le flux online (createOrJoin ou lobby).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useGame } from './GameContext';
import { getToken, fetchFriends } from '../api/auth';
import type { Friend } from '../api/auth';
import type {
  RoomLobbyState,
  RoomGameState,
  OnlineGameConfig,
  PublicRoomSummary,
  YourRolePayload as OnlineYourRolePayload,
} from '../types/online';
import { clearRoomInviteFromUrl, parseRoomCodeFromUrl } from '../utils/roomInviteLink';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL
  ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
const SESSION_STORAGE_KEY = 'imposteur_online_session';

interface StoredSession {
  playerSessionId: string;
  roomId: string;
  playerName: string;
}

/**
 * Lit la session brute (roomId peut être vide : cas create_room / matchmaking
 * où le code n'est pas encore attribué). Sert à mettre à jour la session.
 */
function getRawStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s?.playerSessionId || !s?.playerName) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Session exploitable pour une reconnexion : nécessite un roomId.
 * Utilisée par l'effet de reconnexion et l'UI de reprise.
 */
function getStoredSession(): StoredSession | null {
  const s = getRawStoredSession();
  if (!s || !s.roomId) return null;
  return s;
}

function resolveSessionId(roomId: string, playerName: string): string {
  const stored = getStoredSession();
  const trimmed = playerName.trim();
  const roomNorm = roomId.trim().toUpperCase();
  if (
    stored &&
    stored.roomId === roomNorm &&
    stored.playerName.trim().toLowerCase() === trimmed.toLowerCase()
  ) {
    return stored.playerSessionId;
  }
  return generateSessionId();
}

const RECONNECT_FATAL_ERROR_CODES = new Set(['room_not_found', 'room_closed', 'eliminated']);

function saveSession(playerSessionId: string, roomId: string, playerName: string) {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ playerSessionId, roomId, playerName })
  );
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function generateSessionId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const DEFAULT_CONFIG: OnlineGameConfig = {
  playerCount: 4,
  impostorCount: 1,
  mrWhiteEnabled: true,
};

const BACKEND_PHASE_TO_FRONT: Record<string, import('../types/game').GamePhase> = {
  roleReveal: 'onlineRoleReveal',
  discussion: 'onlineDiscussion',
  vote: 'onlineVote',
  eliminatedReveal: 'onlineEliminatedReveal',
  mrWhiteGuess: 'onlineMrWhiteGuess',
  end: 'onlineEnd',
};

interface OnlineContextValue {
  /** État du lobby (null si pas encore en room) */
  roomState: RoomLobbyState | null;
  /** État de la partie (reçu via game_state) */
  gameState: RoomGameState | null;
  /** Mon mot (ou null pour Mr. White) */
  myWord: string | null;
  /** Mon playerId (pour savoir si c'est mon tour) */
  myPlayerId: string | null;
  /** Code de la room (pour partage) */
  roomId: string | null;
  /** True si ce client est le créateur de la room (config uniquement) */
  isHost: boolean;
  /** Pseudo local dans la room */
  localPlayerName: string | null;
  /** Message d'erreur à afficher */
  error: string | null;
  /** True pendant une tentative de reconnexion au chargement */
  isReconnecting: boolean;
  /** Session sauvegardée (reprise après déconnexion) */
  storedSession: StoredSession | null;
  /** Mes stats (parties jouées, victoires) — en partie uniquement */
  myStats: { gamesPlayed: number; wins: number };
  /** Créer une room avec le pseudo et une config par défaut */
  createRoom: (playerName: string, options?: { visibility?: 'public' | 'private'; password?: string }) => void;
  /** Rejoindre une room par code (mot de passe optionnel pour les rooms privées) */
  joinRoom: (roomId: string, playerName: string, password?: string) => void;
  /** Récupérer la liste des rooms publiques (navigateur de rooms) */
  fetchPublicRooms: () => Promise<import('../types/online').PublicRoomSummary[]>;
  /** Rechercher une partie (matchmaking) */
  joinMatchmaking: (playerName: string) => void;
  /** Annuler la recherche de partie */
  leaveMatchmaking: () => void;
  /** True pendant une recherche matchmaking */
  isMatchmaking: boolean;
  /** Joueurs déjà en file / cible pour former une room */
  matchmakingQueueSize: number;
  matchmakingTargetSize: number;
  matchmakingMinSize: number;
  /** Epoch ms : match auto à 3 joueurs si la 4e n'arrive pas */
  matchmakingTimeoutAt: number | null;
  /** Code room extrait d'un lien d'invitation (?room= ou /join/CODE) */
  inviteLinkRoomCode: string | null;
  /** Effacer le code extrait d'un lien d'invitation */
  clearInviteLinkRoomCode: () => void;
  /** Quitter le lobby (déconnexion socket + retour accueil) */
  leaveRoom: () => void;
  /** Marquer prêt / pas prêt (lobby plein ou fin de manche) */
  setLobbyReady: (ready: boolean) => void;
  /** Passer mon tour en discussion (émet discussion_pass) */
  discussionPass: () => void;
  /** Écrire mon indice pendant mon tour (émet submit_clue, passe au suivant) */
  submitClue: (text: string) => void;
  /** Voter pour éliminer un joueur (émet vote) */
  vote: (targetPlayerId: string) => void;
  /** Continuer après révélation de l'éliminé (émet continue_after_eliminated) */
  continueAfterEliminated: () => void;
  /** Mr. White propose le mot des Citoyens (émet mr_white_guess) */
  submitMrWhiteGuess: (guess: string) => void;
  /** Mettre à jour la config de la room (créateur, émet update_room_config) */
  updateRoomConfig: (config: OnlineGameConfig) => void;
  /** Effacer l'erreur affichée */
  clearError: () => void;
  /** Invitation en cours (reçu via game_invite) */
  pendingInvite: { roomId: string; hostName: string; hostAvatarUrl?: string | null } | null;
  /** Fermer l'invitation sans rejoindre */
  clearPendingInvite: () => void;
  /** Inviter un ami (par son userId) */
  inviteFriend: (friendUserId: number) => void;
  /** Demande d'ami reçue en temps réel (pour afficher la notification) */
  pendingFriendRequest: { requestId: number; fromUserId: number; fromUsername: string; fromAvatarUrl?: string | null } | null;
  /** Fermer la notification de demande d'ami sans accepter/refuser */
  clearPendingFriendRequest: () => void;
  /** Liste d'amis (pour afficher l'icône ami partout) */
  friendsList: Friend[];
  /** Recharger la liste d'amis (après acceptation d'une demande, etc.) */
  loadFriends: () => Promise<void>;
  /** IDs des amis actuellement en ligne (socket connecté et authentifié) */
  onlineFriendIds: number[];
  /** Rafraîchir la liste des amis en ligne (émet get_online_friends) */
  fetchOnlineFriends: () => void;
  /** Erreur d'invitation (ex. "Ami hors ligne" si invite_sent success: false) */
  inviteError: string | null;
  /** Effacer l'erreur d'invitation */
  clearInviteError: () => void;
  /** Socket.IO (pour le vocal WebRTC) */
  getSocket: () => Socket | null;
}

const OnlineContext = createContext<OnlineContextValue | null>(null);

export function OnlineProvider({ children }: { children: ReactNode }) {
  const { setPhase } = useGame();
  const [roomState, setRoomState] = useState<RoomLobbyState | null>(null);
  const [gameState, setGameState] = useState<RoomGameState | null>(null);
  const [myWord, setMyWord] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [localPlayerName, setLocalPlayerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(() => {
    const s = getStoredSession();
    return !!(s?.roomId && s?.playerSessionId && s?.playerName);
  });
  const [pendingInvite, setPendingInvite] = useState<{ roomId: string; hostName: string; hostAvatarUrl?: string | null } | null>(null);
  const [pendingFriendRequest, setPendingFriendRequest] = useState<{
    requestId: number;
    fromUserId: number;
    fromUsername: string;
    fromAvatarUrl?: string | null;
  } | null>(null);
  const [friendsList, setFriendsList] = useState<Friend[]>([]);
  const [onlineFriendIds, setOnlineFriendIds] = useState<number[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLinkRoomCode, setInviteLinkRoomCode] = useState<string | null>(null);
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchmakingQueueSize, setMatchmakingQueueSize] = useState(0);
  const [matchmakingTargetSize, setMatchmakingTargetSize] = useState(4);
  const [matchmakingMinSize, setMatchmakingMinSize] = useState(3);
  const [matchmakingTimeoutAt, setMatchmakingTimeoutAt] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const inviteErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectingRef = useRef(false);
  const inPlayingGameRef = useRef(false);
  const sessionKilledRef = useRef(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearErrorTimeout = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, []);

  const setErrorWithAutoDismiss = useCallback((message: string) => {
    clearErrorTimeout();
    setError(message);
    errorTimeoutRef.current = setTimeout(() => {
      errorTimeoutRef.current = null;
      setError(null);
    }, 10_000);
  }, [clearErrorTimeout]);

  const connect = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const socket = io(SOCKET_URL, { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (sessionKilledRef.current) return;
      const token = getToken();
      if (token) socket.emit('authenticate', { token });
    });

    socket.on('game_invite', (payload: { roomId: string; hostName: string; hostAvatarUrl?: string | null }) => {
      setPendingInvite({
        roomId: payload.roomId,
        hostName: payload.hostName,
        hostAvatarUrl: payload.hostAvatarUrl ?? null,
      });
    });

    socket.on('friend_request', (payload: { requestId: number; fromUserId: number; fromUsername: string; fromAvatarUrl?: string | null }) => {
      setPendingFriendRequest(payload);
    });

    socket.on('friend_status', (payload: { friendId: number; online: boolean }) => {
      const id = Number(payload.friendId);
      if (Number.isNaN(id)) return;
      setOnlineFriendIds((prev) => {
        const has = prev.includes(id);
        if (payload.online && !has) return [...prev, id];
        if (!payload.online && has) return prev.filter((x) => x !== id);
        return prev;
      });
    });

    socket.on('invite_sent', (payload: { success: boolean; message?: string }) => {
      if (inviteErrorTimeoutRef.current) {
        clearTimeout(inviteErrorTimeoutRef.current);
        inviteErrorTimeoutRef.current = null;
      }
      if (payload.success) {
        setInviteError(null);
      } else {
        setInviteError(payload.message ?? 'Ami hors ligne');
        inviteErrorTimeoutRef.current = setTimeout(() => {
          inviteErrorTimeoutRef.current = null;
          setInviteError(null);
        }, 5000);
      }
    });

    socket.on('room_created', (payload: { roomId: string; roomState: RoomLobbyState }) => {
      setPendingInvite(null);
      clearErrorTimeout();
      setError(null);
      setIsMatchmaking(false);
      setMatchmakingQueueSize(0);
      const prev = getRawStoredSession();
      if (prev) saveSession(prev.playerSessionId, payload.roomId, prev.playerName);
      setRoomId(payload.roomId);
      setRoomState(payload.roomState);
      setIsHost(true);
      if (reconnectingRef.current) {
        reconnectingRef.current = false;
        setIsReconnecting(false);
      }
      setPhase('onlineLobby');
    });

    socket.on('room_joined', (payload: { roomId: string; roomState: RoomLobbyState; youAreHost: boolean }) => {
      clearErrorTimeout();
      setError(null);
      setPendingInvite(null);
      setIsMatchmaking(false);
      setMatchmakingQueueSize(0);
      const prevJoin = getRawStoredSession();
      if (prevJoin) saveSession(prevJoin.playerSessionId, payload.roomId, prevJoin.playerName);
      setRoomId(payload.roomId);
      setRoomState(payload.roomState);
      setIsHost(payload.youAreHost);
      if (reconnectingRef.current) {
        reconnectingRef.current = false;
        setIsReconnecting(false);
      }
      if (inPlayingGameRef.current) return;
      setPhase('onlineLobby');
    });

    socket.on('room_state', (payload: { roomState: RoomLobbyState }) => {
      clearErrorTimeout();
      setError(null);
      setRoomId(payload.roomState.roomId);
      setRoomState(payload.roomState);
    });

    socket.on('game_state', (payload: { roomState: RoomGameState }) => {
      clearErrorTimeout();
      setError(null);
      setRoomId(payload.roomState.roomId);
      setGameState(payload.roomState);
      inPlayingGameRef.current = payload.roomState.status === 'playing';
      const prev = getRawStoredSession();
      if (prev) {
        saveSession(prev.playerSessionId, payload.roomState.roomId, prev.playerName);
      }
      if (reconnectingRef.current) {
        reconnectingRef.current = false;
        setIsReconnecting(false);
      }
      const phase = BACKEND_PHASE_TO_FRONT[payload.roomState.phase];
      if (phase) setPhase(phase);
    });

    socket.on('your_role', (payload: OnlineYourRolePayload) => {
      setMyWord(payload.word);
      setMyPlayerId(payload.playerId);
    });

    socket.on('session_replaced', (payload: { message: string }) => {
      sessionKilledRef.current = true;
      clearStoredSession();
      inPlayingGameRef.current = false;
      disconnect({ permanent: true });
      setPhase('home');
      setErrorWithAutoDismiss(payload.message);
    });

    socket.on('removed_from_room', (payload: { code: string; message: string }) => {
      sessionKilledRef.current = true;
      clearStoredSession();
      inPlayingGameRef.current = false;
      disconnect({ permanent: true });
      setPhase('home');
      setErrorWithAutoDismiss(payload.message);
    });

    socket.on('room_closed', (payload: { code: string; message: string }) => {
      clearStoredSession();
      inPlayingGameRef.current = false;
      setErrorWithAutoDismiss(payload.message);
      setRoomState(null);
      setGameState(null);
      setMyWord(null);
      setMyPlayerId(null);
      setRoomId(null);
      setIsMatchmaking(false);
      setMatchmakingQueueSize(0);
      socketRef.current = null;
      socket.disconnect();
      socket.removeAllListeners();
      setPhase('home');
    });

    socket.on(
      'matchmaking_update',
      (payload: { searching?: boolean; queueSize?: number; targetSize?: number; minSize?: number; timeoutAt?: number | null }) => {
        const searching = payload.searching === true;
        setIsMatchmaking(searching);
        if (typeof payload.queueSize === 'number') {
          setMatchmakingQueueSize(payload.queueSize);
        }
        if (typeof payload.targetSize === 'number') {
          setMatchmakingTargetSize(payload.targetSize);
        }
        if (typeof payload.minSize === 'number') {
          setMatchmakingMinSize(payload.minSize);
        }
        if (payload.timeoutAt !== undefined) {
          setMatchmakingTimeoutAt(payload.timeoutAt);
        }
        if (!searching) {
          setMatchmakingQueueSize(0);
          setMatchmakingTimeoutAt(null);
        }
      }
    );

    socket.on('error', (payload: { code: string; message: string }) => {
      setIsMatchmaking(false);
      setMatchmakingQueueSize(0);
      setMatchmakingTimeoutAt(null);
      if (reconnectingRef.current) {
        const session = getStoredSession();
        const retryableCodes = new Set([
          'session_not_found',
          'session_active',
          'internal',
          'wrong_phase',
          'game_in_progress',
        ]);
        if (session?.roomId && retryableCodes.has(payload.code)) {
          const token = getToken();
          socket.emit('join_room', {
            roomId: session.roomId,
            playerName: session.playerName,
            clientSessionId: session.playerSessionId,
            ...(token && { authToken: token }),
          });
          return;
        }
        reconnectingRef.current = false;
        setIsReconnecting(false);
        if (RECONNECT_FATAL_ERROR_CODES.has(payload.code)) {
          clearStoredSession();
        }
        setErrorWithAutoDismiss(payload.message);
        setPhase('onlineCreateOrJoin');
      } else {
        setErrorWithAutoDismiss(payload.message);
      }
    });

    return socket;
  }, [setPhase, clearErrorTimeout, setErrorWithAutoDismiss]);

  const disconnect = useCallback((options?: { permanent?: boolean }) => {
    clearErrorTimeout();
    if (inviteErrorTimeoutRef.current) {
      clearTimeout(inviteErrorTimeoutRef.current);
      inviteErrorTimeoutRef.current = null;
    }
    setInviteError(null);
    setOnlineFriendIds([]);
    if (socketRef.current) {
      if (options?.permanent) {
        socketRef.current.io.opts.reconnection = false;
      }
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }
    setRoomState(null);
    setGameState(null);
    inPlayingGameRef.current = false;
    setMyWord(null);
    setMyPlayerId(null);
    setRoomId(null);
    setIsHost(false);
    setError(null);
    setIsMatchmaking(false);
    setMatchmakingQueueSize(0);
  }, [clearErrorTimeout]);

  useEffect(() => {
    return () => {
      disconnect({ permanent: true });
    };
  }, [disconnect]);

  useEffect(() => {
    const code = parseRoomCodeFromUrl();
    if (!code) return;
    setInviteLinkRoomCode(code);
    setPhase('onlineCreateOrJoin');
    clearRoomInviteFromUrl();
  }, [setPhase]);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.roomId || !session.playerSessionId || !session.playerName) return;
    setLocalPlayerName(session.playerName);
    reconnectingRef.current = true;
    setIsReconnecting(true);
    setError(null);
    const socket = connect();
    const doReconnect = () => {
      const token = getToken();
      socket.emit('reconnect_to_room', {
        roomId: session.roomId,
        playerSessionId: session.playerSessionId,
        playerName: session.playerName,
        ...(token && { authToken: token }),
      });
    };
    if (socket.connected) {
      doReconnect();
    } else {
      socket.once('connect', doReconnect);
    }
    const timeout = setTimeout(() => {
      if (reconnectingRef.current) {
        reconnectingRef.current = false;
        setIsReconnecting(false);
        setErrorWithAutoDismiss('Reconnexion lente. Réessaie ou rejoins avec ton pseudo.');
        setPhase('onlineCreateOrJoin');
      }
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [connect, setPhase, setErrorWithAutoDismiss]);

  const createRoom = useCallback(
    (playerName: string, options?: { visibility?: 'public' | 'private'; password?: string }) => {
      sessionKilledRef.current = false;
      setError(null);
      const trimmed = playerName.trim();
      setLocalPlayerName(trimmed);
      const playerSessionId = generateSessionId();
      saveSession(playerSessionId, '', trimmed);
      const socket = connect();
      const token = getToken();
      socket.emit('create_room', {
        config: DEFAULT_CONFIG,
        playerName: trimmed,
        clientSessionId: playerSessionId,
        visibility: options?.visibility ?? 'public',
        ...(options?.password && { password: options.password }),
        ...(token && { authToken: token }),
      });
    },
    [connect]
  );

  const joinRoom = useCallback(
    (code: string, playerName: string, password?: string) => {
      sessionKilledRef.current = false;
      setError(null);
      const trimmed = playerName.trim();
      setLocalPlayerName(trimmed);
      const roomIdNorm = code.trim().toUpperCase();
      const playerSessionId = resolveSessionId(roomIdNorm, trimmed);
      saveSession(playerSessionId, roomIdNorm, trimmed);
      const socket = connect();
      const token = getToken();
      socket.emit('join_room', {
        roomId: roomIdNorm,
        playerName: trimmed,
        clientSessionId: playerSessionId,
        ...(password && { password }),
        ...(token && { authToken: token }),
      });
    },
    [connect]
  );

  const fetchPublicRooms = useCallback((): Promise<PublicRoomSummary[]> => {
    return new Promise((resolve) => {
      const socket = connect();
      let settled = false;
      const done = (rooms: PublicRoomSummary[]) => {
        if (settled) return;
        settled = true;
        resolve(rooms);
      };
      const emit = () => {
        socket.timeout(5000).emit('list_public_rooms', (err: unknown, res: { rooms?: PublicRoomSummary[] }) => {
          if (err) return done([]);
          done(Array.isArray(res?.rooms) ? res.rooms : []);
        });
      };
      if (socket.connected) emit();
      else socket.once('connect', emit);
      setTimeout(() => done([]), 6000);
    });
  }, [connect]);

  const joinMatchmaking = useCallback(
    (playerName: string) => {
      sessionKilledRef.current = false;
      setError(null);
      const trimmed = playerName.trim();
      setLocalPlayerName(trimmed);
      const playerSessionId = generateSessionId();
      saveSession(playerSessionId, '', trimmed);
      const socket = connect();
      const token = getToken();
      const payload = {
        playerName: trimmed,
        clientSessionId: playerSessionId,
        ...(token && { authToken: token }),
      };
      const emitJoin = () => {
        socket.emit('join_matchmaking', payload);
      };
      if (socket.connected) {
        emitJoin();
      } else {
        socket.once('connect', emitJoin);
      }
    },
    [connect]
  );

  const leaveMatchmaking = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave_matchmaking');
    }
    setIsMatchmaking(false);
    setMatchmakingQueueSize(0);
    setMatchmakingTimeoutAt(null);
  }, []);

  const leaveRoom = useCallback(() => {
    clearStoredSession();
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave_room');
    }
    disconnect({ permanent: true });
    setPhase('home');
  }, [disconnect, setPhase]);

  const setLobbyReady = useCallback((ready: boolean) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('lobby_ready', { ready });
  }, []);

  const discussionPass = useCallback(() => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('discussion_pass');
  }, []);

  const submitClue = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!socketRef.current || !trimmed) return;
    setError(null);
    socketRef.current.emit('submit_clue', { text: trimmed });
  }, []);

  const vote = useCallback((targetPlayerId: string) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('vote', { targetPlayerId });
  }, []);

  const continueAfterEliminated = useCallback(() => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('continue_after_eliminated');
  }, []);

  const submitMrWhiteGuess = useCallback((guess: string) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('mr_white_guess', { guess: guess.trim() });
  }, []);

  const updateRoomConfig = useCallback((config: OnlineGameConfig) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('update_room_config', { config });
  }, []);

  const clearError = useCallback(() => {
    clearErrorTimeout();
    setError(null);
  }, [clearErrorTimeout]);

  const clearPendingInvite = useCallback(() => setPendingInvite(null), []);

  const clearInviteLinkRoomCode = useCallback(() => setInviteLinkRoomCode(null), []);

  const clearPendingFriendRequest = useCallback(() => setPendingFriendRequest(null), []);

  const loadFriends = useCallback(async () => {
    if (!getToken()) return;
    const list = await fetchFriends();
    setFriendsList(list);
  }, []);

  useEffect(() => {
    if ((roomState || gameState) && getToken()) {
      fetchFriends().then(setFriendsList);
    } else {
      setFriendsList([]);
    }
  }, [roomState, gameState]);

  const inviteFriend = useCallback((friendUserId: number) => {
    setInviteError(null);
    if (socketRef.current?.connected) {
      socketRef.current.emit('invite_to_room', { friendUserId });
    }
  }, []);

  const fetchOnlineFriends = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('get_online_friends', (res: { friendIds?: unknown }) => {
      const raw = res?.friendIds;
      const ids = Array.isArray(raw)
        ? raw.map((x) => Number(x)).filter((n) => !Number.isNaN(n))
        : [];
      setOnlineFriendIds(ids);
    });
  }, []);

  const clearInviteError = useCallback(() => {
    if (inviteErrorTimeoutRef.current) {
      clearTimeout(inviteErrorTimeoutRef.current);
      inviteErrorTimeoutRef.current = null;
    }
    setInviteError(null);
  }, []);

  const getSocket = useCallback(() => socketRef.current, []);

  const myStats = useMemo(() => {
    if (!gameState || !roomState || myPlayerId == null) return { gamesPlayed: 0, wins: 0 };
    const myPlayer = gameState.players.find((p) => p.id === myPlayerId);
    const myName = myPlayer?.name;
    if (!myName) return { gamesPlayed: 0, wins: 0 };
    const member = roomState.members.find((m) => m.name === myName);
    return {
      gamesPlayed: member?.gamesPlayed ?? 0,
      wins: member?.wins ?? 0,
    };
  }, [gameState, roomState, myPlayerId]);

  const storedSession = useMemo(() => getStoredSession(), [roomState, gameState, roomId, error, isReconnecting]);

  const value = useMemo<OnlineContextValue>(
    () => ({
      roomState,
      gameState,
      myWord,
      myPlayerId,
      roomId,
      isHost,
      localPlayerName,
      error,
      isReconnecting,
      storedSession,
      myStats,
      createRoom,
      joinRoom,
      fetchPublicRooms,
      joinMatchmaking,
      leaveMatchmaking,
      isMatchmaking,
      matchmakingQueueSize,
      matchmakingTargetSize,
      matchmakingMinSize,
      matchmakingTimeoutAt,
      inviteLinkRoomCode,
      clearInviteLinkRoomCode,
      leaveRoom,
      setLobbyReady,
      discussionPass,
      submitClue,
      vote,
      continueAfterEliminated,
      submitMrWhiteGuess,
      updateRoomConfig,
      clearError,
      pendingInvite,
      clearPendingInvite,
      inviteFriend,
      pendingFriendRequest,
      clearPendingFriendRequest,
      friendsList,
      loadFriends,
      onlineFriendIds,
      fetchOnlineFriends,
      inviteError,
      clearInviteError,
      getSocket,
    }),
    [
      roomState,
      gameState,
      myWord,
      myPlayerId,
      roomId,
      isHost,
      localPlayerName,
      error,
      isReconnecting,
      storedSession,
      myStats,
      pendingInvite,
      pendingFriendRequest,
      friendsList,
      onlineFriendIds,
      inviteError,
      inviteLinkRoomCode,
      isMatchmaking,
      matchmakingQueueSize,
      matchmakingTargetSize,
      createRoom,
      joinRoom,
      fetchPublicRooms,
      joinMatchmaking,
      leaveMatchmaking,
      clearInviteLinkRoomCode,
      leaveRoom,
      setLobbyReady,
      discussionPass,
      submitClue,
      vote,
      continueAfterEliminated,
      submitMrWhiteGuess,
      updateRoomConfig,
      clearError,
      clearPendingInvite,
      clearPendingFriendRequest,
      loadFriends,
      inviteFriend,
      fetchOnlineFriends,
      clearInviteError,
      getSocket,
    ]
  );

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline() {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error('useOnline must be used within OnlineProvider');
  return ctx;
}
