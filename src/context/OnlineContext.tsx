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
import type {
  RoomLobbyState,
  RoomGameState,
  OnlineGameConfig,
  YourRolePayload as OnlineYourRolePayload,
} from '../types/online';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';
const SESSION_STORAGE_KEY = 'imposteur_online_session';

interface StoredSession {
  playerSessionId: string;
  roomId: string;
  playerName: string;
}

function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s?.playerSessionId || !s?.roomId || !s?.playerName) return null;
    return s;
  } catch {
    return null;
  }
}

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
  /** True si ce client est le host */
  isHost: boolean;
  /** Message d'erreur à afficher */
  error: string | null;
  /** True pendant une tentative de reconnexion au chargement */
  isReconnecting: boolean;
  /** Mes stats (parties jouées, victoires) — en partie uniquement */
  myStats: { gamesPlayed: number; wins: number };
  /** Créer une room avec le pseudo et une config par défaut */
  createRoom: (playerName: string) => void;
  /** Rejoindre une room par code */
  joinRoom: (roomId: string, playerName: string) => void;
  /** Quitter le lobby (déconnexion socket + retour accueil) */
  leaveRoom: () => void;
  /** Lancer la partie (host uniquement, émet start_game) */
  startGame: () => void;
  /** Passer mon tour en discussion (émet discussion_pass) */
  discussionPass: () => void;
  /** Voter pour éliminer un joueur (émet vote) */
  vote: (targetPlayerId: string) => void;
  /** Continuer après révélation de l'éliminé (émet continue_after_eliminated) */
  continueAfterEliminated: () => void;
  /** Mr. White propose le mot des Citoyens (émet mr_white_guess) */
  submitMrWhiteGuess: (guess: string) => void;
  /** Mettre à jour la config de la room (host, émet update_room_config) */
  updateRoomConfig: (config: OnlineGameConfig) => void;
  /** Lancer une nouvelle manche (host, émet start_next_round) */
  startNextRound: () => void;
  /** Effacer l'erreur affichée */
  clearError: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const reconnectingRef = useRef(false);
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
    if (socketRef.current?.connected) return socketRef.current;
    const socket = io(SOCKET_URL, { autoConnect: true });
    socketRef.current = socket;

    socket.on('room_created', (payload: { roomId: string; roomState: RoomLobbyState }) => {
      clearErrorTimeout();
      setError(null);
      const prev = getStoredSession();
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
      setRoomId(payload.roomId);
      setRoomState(payload.roomState);
      setIsHost(payload.youAreHost);
      if (reconnectingRef.current) {
        reconnectingRef.current = false;
        setIsReconnecting(false);
      }
      setPhase('onlineLobby');
    });

    socket.on('room_state', (payload: { roomState: RoomLobbyState }) => {
      clearErrorTimeout();
      setError(null);
      setRoomState(payload.roomState);
    });

    socket.on('game_state', (payload: { roomState: RoomGameState }) => {
      clearErrorTimeout();
      setError(null);
      setGameState(payload.roomState);
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

    socket.on('room_closed', (payload: { code: string; message: string }) => {
      clearStoredSession();
      setErrorWithAutoDismiss(payload.message);
      setRoomState(null);
      setGameState(null);
      setMyWord(null);
      setMyPlayerId(null);
      setRoomId(null);
      socketRef.current = null;
      socket.disconnect();
      socket.removeAllListeners();
      setPhase('home');
    });

    socket.on('error', (payload: { code: string; message: string }) => {
      if (reconnectingRef.current) {
        reconnectingRef.current = false;
        setIsReconnecting(false);
        clearStoredSession();
        setErrorWithAutoDismiss(payload.message);
        setPhase('onlineCreateOrJoin');
      } else {
        setErrorWithAutoDismiss(payload.message);
      }
    });

    return socket;
  }, [setPhase, clearErrorTimeout, setErrorWithAutoDismiss]);

  const disconnect = useCallback(() => {
    clearErrorTimeout();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.removeAllListeners();
      socketRef.current = null;
    }
    setRoomState(null);
    setGameState(null);
    setMyWord(null);
    setMyPlayerId(null);
    setRoomId(null);
    setIsHost(false);
    setError(null);
  }, [clearErrorTimeout]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.roomId || !session.playerSessionId || !session.playerName) return;
    reconnectingRef.current = true;
    setIsReconnecting(true);
    setError(null);
    const socket = connect();
    const doReconnect = () => {
      socket.emit('reconnect_to_room', {
        roomId: session.roomId,
        playerSessionId: session.playerSessionId,
        playerName: session.playerName,
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
        clearStoredSession();
        setErrorWithAutoDismiss('Reconnexion impossible. Rejoins la room avec ton pseudo.');
        setPhase('onlineCreateOrJoin');
      }
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [connect, setPhase, setErrorWithAutoDismiss]);

  const createRoom = useCallback(
    (playerName: string) => {
      setError(null);
      const playerSessionId = generateSessionId();
      saveSession(playerSessionId, '', playerName);
      const socket = connect();
      socket.emit('create_room', {
        config: DEFAULT_CONFIG,
        playerName,
        clientSessionId: playerSessionId,
      });
    },
    [connect]
  );

  const joinRoom = useCallback(
    (code: string, playerName: string) => {
      setError(null);
      const roomIdNorm = code.trim().toUpperCase();
      const playerSessionId = generateSessionId();
      saveSession(playerSessionId, roomIdNorm, playerName);
      const socket = connect();
      socket.emit('join_room', {
        roomId: roomIdNorm,
        playerName,
        clientSessionId: playerSessionId,
      });
    },
    [connect]
  );

  const leaveRoom = useCallback(() => {
    clearStoredSession();
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave_room');
    }
    disconnect();
    setPhase('home');
  }, [disconnect, setPhase]);

  const startGame = useCallback(() => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('start_game');
  }, []);

  const discussionPass = useCallback(() => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('discussion_pass');
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

  const startNextRound = useCallback(() => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('start_next_round');
  }, []);

  const clearError = useCallback(() => {
    clearErrorTimeout();
    setError(null);
  }, [clearErrorTimeout]);

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

  const value = useMemo<OnlineContextValue>(
    () => ({
      roomState,
      gameState,
      myWord,
      myPlayerId,
      roomId,
      isHost,
      error,
      isReconnecting,
      myStats,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      discussionPass,
      vote,
      continueAfterEliminated,
      submitMrWhiteGuess,
      updateRoomConfig,
      startNextRound,
      clearError,
    }),
    [
      roomState,
      gameState,
      myWord,
      myPlayerId,
      roomId,
      isHost,
      error,
      isReconnecting,
      myStats,
      createRoom,
      joinRoom,
      leaveRoom,
      startGame,
      discussionPass,
      vote,
      continueAfterEliminated,
      submitMrWhiteGuess,
      updateRoomConfig,
      startNextRound,
      clearError,
    ]
  );

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline() {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error('useOnline must be used within OnlineProvider');
  return ctx;
}
