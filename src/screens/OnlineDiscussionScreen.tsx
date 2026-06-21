import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Heart, Send } from 'lucide-react';
import { useOnline } from '../context/OnlineContext';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';
import { ViewMyWordModal } from '../components/ViewMyWordModal';
import { UserAvatar } from '../components/UserAvatar';
import { OnlineVotePanel } from '../components/OnlineVotePanel';
import { OnlineErrorBanner } from '../components/OnlineErrorBanner';

const TICK_MS = 200;

function isFriend(name: string, friendsList: { username: string }[]): boolean {
  const n = name.trim().toLowerCase();
  return friendsList.some((f) => f.username.trim().toLowerCase() === n);
}

export function OnlineDiscussionScreen() {
  const {
    gameState,
    myPlayerId,
    myWord,
    error,
    discussionPass,
    submitClue,
    clearError,
    friendsList,
    getSocket,
  } = useOnline();
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [showMyWord, setShowMyWord] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [clueText, setClueText] = useState('');
  const passedForTurnRef = useRef(false);

  const order = gameState?.discussionOrder ?? [];
  const currentIndex = gameState?.currentSpeakerIndex ?? 0;
  const turnStartedAt = gameState?.turnStartedAt ?? 0;
  const turnDurationMs = gameState?.turnDurationMs ?? 20_000;
  const discussionStartedAt = gameState?.discussionStartedAt ?? 0;
  const discussionDurationMs = gameState?.discussionDurationMs ?? 120_000;
  const players = gameState?.players ?? [];
  const clues = gameState?.clues ?? [];
  const isVote = gameState?.phase === 'vote';
  const myPlayer = myPlayerId != null ? players.find((p) => p.id === myPlayerId) : null;
  const amEliminated = myPlayer?.eliminated === true;

  const currentPlayerId = order[currentIndex] ?? null;
  const currentPlayer = currentPlayerId
    ? players.find((p) => p.id === currentPlayerId)
    : null;
  const isMyTurn = !amEliminated && myPlayerId !== null && currentPlayerId === myPlayerId;

  const peerPlayerIds = players
    .filter((p) => !p.eliminated && p.id !== myPlayerId)
    .map((p) => p.id);

  const voiceActive = gameState?.phase === 'discussion' && !isVote;

  const { permissionError, isMicLive, clearPermissionError } = useVoiceChat({
    getSocket,
    active: voiceActive,
    myPlayerId,
    peerPlayerIds,
    isMyTurn,
    micEnabled: isMicEnabled,
  });

  useEffect(() => {
    if (!voiceActive) {
      setIsMicEnabled(false);
    }
  }, [voiceActive]);

  useEffect(() => {
    if (!gameState || currentIndex >= order.length) return;
    passedForTurnRef.current = false;
  }, [gameState, currentIndex, order.length]);

  useEffect(() => {
    setClueText('');
  }, [currentIndex]);

  const handleSubmitClue = () => {
    const text = clueText.trim();
    if (!text || !isMyTurn) return;
    clearError();
    submitClue(text);
    setClueText('');
  };

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

  const micStatusLabel = !isMicEnabled
    ? 'Activer le micro'
    : !isMyTurn
      ? 'Micro prêt (attends ton tour)'
      : isMicLive
        ? 'Micro actif'
        : 'Micro activé';

  return (
    <Layout title={isVote ? 'Vote' : 'Discussion'} hideBack onBack={() => {}} backLabel="" fillHeight={isVote}>
      {!isVote && <OnlineStatsBar />}
      <OnlineErrorBanner error={error} onDismiss={clearError} />

      {isVote ? (
        <OnlineVotePanel />
      ) : (
      <div className="flex flex-col gap-6 flex-1 min-h-0">
        {permissionError && (
          <div className="flex items-center justify-between gap-3 text-amber-700 dark:text-amber-300 text-sm bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1">{permissionError}</span>
            <button
              type="button"
              onClick={() => {
                clearPermissionError();
                setIsMicEnabled(false);
              }}
              className="shrink-0 underline hover:no-underline"
            >
              Fermer
            </button>
          </div>
        )}

        {amEliminated ? (
          <div className="bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 text-center space-y-3">
            <p className="text-lg font-medium text-slate-800 dark:text-slate-100">
              Tu as été éliminé
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Observe la discussion en silence. Tu ne peux plus prendre la parole.
            </p>
            <button
              type="button"
              onClick={() => setShowMyWord(true)}
              className="py-2 px-4 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors"
            >
              Voir mon mot
            </button>
          </div>
        ) : allSpoken ? (
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
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                {currentPlayer && (
                  <UserAvatar
                    username={currentPlayer.name}
                    avatarUrl={currentPlayer.avatarUrl}
                    size="md"
                    disconnected={!currentPlayer.connected}
                  />
                )}
                <span className="inline-flex items-center gap-2">
                  {currentPlayer?.name ?? '…'}
                  {currentPlayer && !currentPlayer.connected && (
                    <span className="text-sm font-normal text-slate-500 dark:text-slate-400">(déconnecté)</span>
                  )}
                  {currentPlayer?.name && isFriend(currentPlayer.name, friendsList) && (
                    <Heart className="w-6 h-6 text-violet-500 fill-violet-500 shrink-0" aria-label="ami" />
                  )}
                </span>
              </p>
            </div>

            {clues.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Indices donnés
                </p>
                <ul className="space-y-2">
                  {clues.map((c, i) => (
                    <li key={`${c.playerId}-${i}`} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <span className="text-violet-700 dark:text-violet-300 font-medium break-words">
                        {c.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                      <UserAvatar
                        username={p?.name ?? '?'}
                        avatarUrl={p?.avatarUrl}
                        size="sm"
                        disconnected={p ? !p.connected : false}
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-1">
                        {p?.name ?? '…'}
                        {p && !p.connected && (
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(déco.)</span>
                        )}
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

            {isMyTurn && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Ton indice (un mot ou une courte expression)
                </p>
                <div className="flex gap-2 items-stretch">
                  <input
                    type="text"
                    value={clueText}
                    onChange={(e) => setClueText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmitClue();
                    }}
                    maxLength={60}
                    placeholder="Écris ton indice…"
                    className="flex-1 min-w-0 px-4 py-4 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    autoFocus
                  />
                  <Button
                    size="lg"
                    onClick={handleSubmitClue}
                    disabled={!clueText.trim()}
                    aria-label="Envoyer mon indice"
                    className="shrink-0 !px-5"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}

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
                  ${
                    isMicEnabled && isMyTurn && isMicLive
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                      : isMicEnabled
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-600 dark:text-amber-400'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                  }
                `}
                title={micStatusLabel}
                aria-label={isMicEnabled ? 'Couper le micro' : 'Activer le micro'}
                aria-pressed={isMicEnabled}
              >
                {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
            </div>
            {isMicEnabled && !isMyTurn && (
              <p className="text-center text-amber-600 dark:text-amber-400 text-xs">
                Micro activé — tu pourras parler quand ce sera ton tour.
              </p>
            )}
            {!isMyTurn && !isMicEnabled && (
              <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
                Attends ton tour pour parler
              </p>
            )}
          </>
        )}

        <ViewMyWordModal
          isOpen={showMyWord}
          onClose={() => setShowMyWord(false)}
          myWord={myWord}
        />
      </div>
      )}
    </Layout>
  );
}
