import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Heart } from 'lucide-react';
import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';
import { ViewMyWordModal } from '../components/ViewMyWordModal';

const TICK_MS = 200;

function isFriend(name: string, friendsList: { username: string }[]): boolean {
  const n = name.trim().toLowerCase();
  return friendsList.some((f) => f.username.trim().toLowerCase() === n);
}

export function OnlineDiscussionScreen() {
  const { gameState, myPlayerId, myWord, error, discussionPass, clearError, friendsList } = useOnline();
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [showMyWord, setShowMyWord] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const passedForTurnRef = useRef(false);

  const order = gameState?.discussionOrder ?? [];
  const currentIndex = gameState?.currentSpeakerIndex ?? 0;
  const turnStartedAt = gameState?.turnStartedAt ?? 0;
  const turnDurationMs = gameState?.turnDurationMs ?? 20_000;
  const discussionStartedAt = gameState?.discussionStartedAt ?? 0;
  const discussionDurationMs = gameState?.discussionDurationMs ?? 120_000;
  const players = gameState?.players ?? [];

  const currentPlayerId = order[currentIndex] ?? null;
  const currentPlayer = currentPlayerId
    ? players.find((p) => p.id === currentPlayerId)
    : null;
  const isMyTurn = myPlayerId !== null && currentPlayerId === myPlayerId;

  useEffect(() => {
    if (!gameState || currentIndex >= order.length) return;
    passedForTurnRef.current = false;
  }, [gameState, currentIndex, order.length]);

  useEffect(() => {
    if (order.length === 0 || currentIndex >= order.length) {
      setRemainingMs(null);
      return;
    }
    const update = () => {
      const elapsed = Date.now() - turnStartedAt;
      const left = Math.max(0, turnDurationMs - elapsed);
      setRemainingMs(left);
      if (left <= 0 && isMyTurn && !passedForTurnRef.current) {
        passedForTurnRef.current = true;
        discussionPass();
      }
    };
    update();
    const id = setInterval(update, TICK_MS);
    return () => clearInterval(id);
  }, [turnStartedAt, turnDurationMs, currentIndex, order.length, isMyTurn, discussionPass]);

  const allSpoken = currentIndex >= order.length;
  const progressPercent =
    turnDurationMs > 0 && remainingMs !== null
      ? ((turnDurationMs - remainingMs) / turnDurationMs) * 100
      : 0;

  return (
    <Layout title="Discussion" hideBack onBack={() => {}} backLabel="">
      <OnlineStatsBar />
      <div className="flex flex-col gap-6">
        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1 text-center">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}

        {allSpoken ? (
          <div className="bg-violet-100 dark:bg-violet-900/30 rounded-2xl p-6 border border-violet-200 dark:border-violet-800 text-center">
            <p className="text-lg font-medium text-slate-800 dark:text-slate-100">
              Tout le monde a parlé
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
              En attente du vote…
            </p>
          </div>
        ) : (
          <>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                En train de parler
              </p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {currentPlayer?.name ?? '…'}
                {currentPlayer?.name && isFriend(currentPlayer.name, friendsList) && (
                  <Heart className="w-6 h-6 text-violet-500 fill-violet-500 shrink-0" aria-label="ami" />
                )}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Ordre de passage
              </p>
              <ul className="space-y-2">
                {order.map((playerId, idx) => {
                  const p = players.find((x) => x.id === playerId);
                  const status =
                    idx < currentIndex
                      ? 'passed'
                      : idx === currentIndex
                        ? 'speaking'
                        : 'upcoming';
                  return (
                    <li
                      key={playerId}
                      className={`
                        flex items-center gap-3 py-2 px-3 rounded-xl text-sm
                        ${status === 'speaking' ? 'bg-violet-100 dark:bg-violet-900/30 border-2 border-violet-400 dark:border-violet-500' : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'}
                      `}
                    >
                      <span
                        className={`
                          w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                          ${status === 'speaking' ? 'bg-violet-500 text-white' : status === 'passed' ? 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}
                        `}
                      >
                        {status === 'passed' ? '✓' : idx + 1}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-1">
                        {p?.name ?? '…'}
                        {p?.name && isFriend(p.name, friendsList) && (
                          <Heart className="w-3.5 h-3.5 text-violet-500 fill-violet-500 shrink-0" aria-label="ami" />
                        )}
                      </span>
                      {status === 'speaking' && (
                        <span className="ml-auto text-xs text-violet-600 dark:text-violet-400 font-medium">
                          Parle
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              {discussionStartedAt > 0 && discussionDurationMs > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Discussion (max 2 min)</span>
                  <span className="font-mono">
                    {Math.max(0, Math.ceil((discussionDurationMs - (Date.now() - discussionStartedAt)) / 1000))} s
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Temps restant (ton tour)</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                  {remainingMs !== null
                    ? `${Math.ceil(remainingMs / 1000)} s`
                    : '—'}
                </span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 dark:bg-violet-400 transition-all duration-300 ease-linear"
                  style={{ width: `${100 - progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex gap-3 items-center">
              {isMyTurn && (
                <Button
                  fullWidth
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    clearError();
                    discussionPass();
                  }}
                >
                  Passer mon tour
                </Button>
              )}
              <button
                type="button"
                onClick={() => setShowMyWord(true)}
                className="shrink-0 py-2 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                Voir mon mot
              </button>
              <button
                type="button"
                onClick={() => setIsMicEnabled((v) => !v)}
                className={`
                  shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                  transition-colors border
                  ${isMicEnabled ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'}
                `}
                title={isMicEnabled ? 'Micro activé' : 'Micro coupé'}
                aria-label={isMicEnabled ? 'Couper le micro' : 'Activer le micro'}
              >
                {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
            </div>
            <ViewMyWordModal
              isOpen={showMyWord}
              onClose={() => setShowMyWord(false)}
              myWord={myWord}
            />
            {!isMyTurn && (
              <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
                Attends ton tour pour parler
              </p>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
