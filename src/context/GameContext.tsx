import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { GameState, GamePhase, HistoryEntry } from '../types/game';
import { startGame, isMrWhiteGuessCorrect, checkVictoryAfterElimination } from '../utils/gameLogic';

const HISTORY_KEY = 'imposteur-history';
const MAX_HISTORY = 50;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-MAX_HISTORY)));
  } catch {
    // ignore
  }
}

interface GameContextValue {
  state: GameState;
  setPhase: (phase: GamePhase) => void;
  setConfig: (config: GameState['config']) => void;
  startNewGame: () => void;
  nextReveal: () => void;
  eliminatePlayer: (playerId: string) => void;
  continueAfterCitizenEliminated: () => void;
  submitMrWhiteGuess: (guess: string) => boolean;
  resetToConfig: () => void;
  resetToHome: () => void;
  history: HistoryEntry[];
  addToHistory: (entry: Omit<HistoryEntry, 'id' | 'date'>) => void;
}

const initialState: GameState = {
  phase: 'home',
  config: {
    playerCount: 4,
    playerNames: ['', '', '', ''],
    impostorCount: 1,
    mrWhiteEnabled: false,
  },
  wordPair: null,
  players: [],
  currentRevealIndex: 0,
  eliminatedPlayerId: null,
  mrWhiteGuessCorrect: null,
  winner: null,
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const setPhase = useCallback((phase: GamePhase) => {
    setState((s) => ({ ...s, phase }));
  }, []);

  const setConfig = useCallback((config: GameState['config']) => {
    setState((s) => ({ ...s, config }));
  }, []);

  const startNewGame = useCallback(() => {
    const { wordPair, players } = startGame(state.config);
    setState((s) => ({
      ...s,
      phase: 'roleReveal',
      wordPair,
      players,
      currentRevealIndex: 0,
      eliminatedPlayerId: null,
      mrWhiteGuessCorrect: null,
      winner: null,
    }));
  }, [state.config]);

  const nextReveal = useCallback(() => {
    setState((s) => {
      if (s.currentRevealIndex >= s.players.length - 1) {
        return { ...s, phase: 'discussion', currentRevealIndex: 0 };
      }
      return { ...s, currentRevealIndex: s.currentRevealIndex + 1 };
    });
  }, []);

  const eliminatePlayer = useCallback((playerId: string) => {
    setState((s) => {
      const players = s.players.map((p) =>
        p.id === playerId ? { ...p, eliminated: true } : p
      );
      const eliminated = s.players.find((p) => p.id === playerId);
      if (!eliminated) return s;

      // Vérification centralisée des conditions de victoire (2 joueurs restants)
      const victory = checkVictoryAfterElimination(players);
      if (victory === 'mrWhite') {
        const newHistory = [
          ...history,
          {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            winner: 'mrWhite' as const,
            playerCount: s.players.length,
            wordPair: s.wordPair!,
          },
        ];
        setHistory(newHistory);
        saveHistory(newHistory);
        return {
          ...s,
          players,
          eliminatedPlayerId: playerId,
          phase: 'end',
          winner: 'mrWhite',
        };
      }
      if (victory === 'imposteur') {
        const newHistory = [
          ...history,
          {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            winner: 'imposteur' as const,
            playerCount: s.players.length,
            wordPair: s.wordPair!,
          },
        ];
        setHistory(newHistory);
        saveHistory(newHistory);
        return {
          ...s,
          players,
          eliminatedPlayerId: playerId,
          phase: 'end',
          winner: 'imposteur',
        };
      }

      if (eliminated.role === 'imposteur') {
        const newHistory = [
          ...history,
          {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            winner: 'citoyens' as const,
            playerCount: s.players.length,
            wordPair: s.wordPair!,
          },
        ];
        setHistory(newHistory);
        saveHistory(newHistory);
        return {
          ...s,
          players,
          eliminatedPlayerId: playerId,
          phase: 'end',
          winner: 'citoyens',
        };
      }

      if (eliminated.role === 'mrWhite') {
        return {
          ...s,
          players,
          eliminatedPlayerId: playerId,
          phase: 'mrWhiteGuess',
        };
      }

      // Citoyen éliminé : révélation puis la partie continue
      return {
        ...s,
        players,
        eliminatedPlayerId: playerId,
        phase: 'eliminatedReveal',
      };
    });
  }, [history]);

  const continueAfterCitizenEliminated = useCallback(() => {
    setState((s) => ({ ...s, phase: 'discussion', eliminatedPlayerId: null }));
  }, []);

  const submitMrWhiteGuess = useCallback((guess: string): boolean => {
    let correct = false;
    setState((s) => {
      if (!s.wordPair) return s;
      correct = isMrWhiteGuessCorrect(guess, s.wordPair.motCitoyens);
      const winner: 'citoyens' | 'mrWhite' = correct ? 'mrWhite' : 'citoyens';
      const newEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        winner,
        playerCount: s.players.length,
        wordPair: s.wordPair,
      };
      const newHistory = [...history, newEntry];
      setHistory(newHistory);
      saveHistory(newHistory);
      return {
        ...s,
        mrWhiteGuessCorrect: correct,
        phase: 'end',
        winner,
      };
    });
    return correct;
  }, [history]);

  const resetToConfig = useCallback(() => {
    setState((s) => ({
      ...initialState,
      config: s.config,
      phase: 'config',
    }));
  }, []);

  const resetToHome = useCallback(() => {
    setState(initialState);
  }, []);

  const addToHistory = useCallback((entry: Omit<HistoryEntry, 'id' | 'date'>) => {
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
    };
    setHistory((h) => {
      const next = [...h, newEntry];
      saveHistory(next);
      return next;
    });
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      setPhase,
      setConfig,
      startNewGame,
      nextReveal,
      eliminatePlayer,
      continueAfterCitizenEliminated,
      submitMrWhiteGuess,
      resetToConfig,
      resetToHome,
      history,
      addToHistory,
    }),
    [
      state,
      setPhase,
      setConfig,
      startNewGame,
      nextReveal,
      eliminatePlayer,
      continueAfterCitizenEliminated,
      submitMrWhiteGuess,
      resetToConfig,
      resetToHome,
      history,
      addToHistory,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
