import { useState, useEffect } from 'react';
import { Heart, Check, Clock, Loader2, ChevronDown } from 'lucide-react';
import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';
import { ViewMyWordModal } from '../components/ViewMyWordModal';
import { UserAvatar } from '../components/UserAvatar';

/** Valeur envoyée au backend pour un vote blanc (personne éliminée) */
const VOTE_BLANK = 'BLANK';

function isFriend(name: string, friendsList: { username: string }[]): boolean {
  const n = name.trim().toLowerCase();
  return friendsList.some((f) => f.username.trim().toLowerCase() === n);
}

function voteTargetLabel(
  targetId: string,
  players: { id: string; name: string }[]
): string {
  if (targetId === VOTE_BLANK) return 'vote blanc (personne)';
  const target = players.find((p) => p.id === targetId);
  return target ? `éliminer ${target.name}` : 'ton choix';
}

export function OnlineVoteScreen() {
  const { gameState, myWord, myPlayerId, error, vote, clearError, friendsList } = useOnline();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingVoteTarget, setPendingVoteTarget] = useState<string | null>(null);
  const [showMyWord, setShowMyWord] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const players = gameState?.players ?? [];
  const clues = gameState?.clues ?? [];
  const voteProgress = gameState?.voteProgress;
  const votable = players.filter((p) => !p.eliminated && p.id !== myPlayerId);
  const myPlayer = players.find((p) => p.id === myPlayerId);
  const amEliminated = myPlayer?.eliminated === true;
  const iAmDisconnected = myPlayer != null && !myPlayer.connected;

  const hasVotedOnServer =
    myPlayerId != null && voteProgress?.votedPlayerIds.includes(myPlayerId) === true;
  const hasVoted = hasVotedOnServer || pendingVoteTarget !== null;
  const myVoteTarget = pendingVoteTarget;

  useEffect(() => {
    if (gameState?.phase !== 'vote') {
      setPendingVoteTarget(null);
      setSelectedId(null);
      setSecondsLeft(null);
    }
  }, [gameState?.phase]);

  useEffect(() => {
    const startedAt = gameState?.voteStartedAt;
    const durationMs = gameState?.voteDurationMs ?? 30_000;
    if (gameState?.phase !== 'vote' || !startedAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((startedAt + durationMs - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [gameState?.phase, gameState?.voteStartedAt, gameState?.voteDurationMs]);

  useEffect(() => {
    if (hasVotedOnServer) setPendingVoteTarget(null);
  }, [hasVotedOnServer]);

  useEffect(() => {
    if (error) setPendingVoteTarget(null);
  }, [error]);

  const votedCount = voteProgress?.votedCount ?? (hasVoted ? 1 : 0);
  const eligibleCount = voteProgress?.eligibleCount ?? players.filter((p) => !p.eliminated).length;
  const progressPercent = eligibleCount > 0 ? Math.round((votedCount / eligibleCount) * 100) : 0;
  const canVote = !amEliminated && !hasVoted;

  const handleConfirm = () => {
    if (selectedId === null || hasVoted) return;
    clearError();
    setPendingVoteTarget(selectedId);
    vote(selectedId);
  };

  return (
    <Layout title="Vote" hideBack onBack={() => {}} backLabel="">
      <OnlineStatsBar />

      <div className="flex flex-col gap-4 pb-28">
        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1 text-center">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-violet-800 dark:text-violet-200">
            <Clock className="w-4 h-4 shrink-0" />
            {secondsLeft != null ? `${secondsLeft}s restantes` : 'Vote en cours'}
          </div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
            {votedCount}/{eligibleCount} votes
          </div>
        </div>

        <div className="h-2 bg-violet-200/80 dark:bg-violet-950/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-600 dark:bg-violet-400 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {amEliminated && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 p-4 text-center text-sm">
            <p className="font-medium text-slate-800 dark:text-slate-100">Tu as été éliminé</p>
            <p className="text-slate-600 dark:text-slate-400 mt-1">Observe le vote — tu ne peux plus voter.</p>
          </div>
        )}

        {hasVoted && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-center">
            <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto mb-1.5" />
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">Vote enregistré</p>
            {myVoteTarget && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                {voteTargetLabel(myVoteTarget, players)}
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 inline-flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              En attente des autres…
            </p>
          </div>
        )}

        {canVote && (
          <section aria-label="Choix de vote">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 text-center mb-3">
              Qui éliminer ?
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {votable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-pressed={selectedId === p.id}
                  className={`
                    flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-3 text-center transition-all
                    ${
                      selectedId === p.id
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 ring-2 ring-rose-300 dark:ring-rose-700'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                    }
                  `}
                >
                  <UserAvatar
                    username={p.name}
                    avatarUrl={p.avatarUrl}
                    size="md"
                    disconnected={!p.connected}
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                    {p.name}
                    {isFriend(p.name, friendsList) && (
                      <Heart className="w-3.5 h-3.5 inline ml-0.5 text-violet-500 fill-violet-500 shrink-0" aria-label="ami" />
                    )}
                  </span>
                  {!p.connected && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Déconnecté</span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedId(VOTE_BLANK)}
              aria-pressed={selectedId === VOTE_BLANK}
              className={`
                mt-2 w-full rounded-xl border-2 px-4 py-3 text-left transition-all
                ${
                  selectedId === VOTE_BLANK
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 ring-2 ring-violet-300 dark:ring-violet-700'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                }
              `}
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Vote blanc</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Personne n&apos;est éliminé ce tour
              </span>
            </button>
          </section>
        )}

        {iAmDisconnected && !hasVoted && (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Tu es déconnecté : un vote blanc sera enregistré automatiquement.
          </p>
        )}

        <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
            <span>Qui a voté ? ({votedCount}/{eligibleCount})</span>
            <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="border-t border-slate-200 dark:border-slate-700 px-2 pb-2">
            {players
              .filter((p) => !p.eliminated)
              .map((p) => {
                const isMe = p.id === myPlayerId;
                const hasPlayerVoted =
                  voteProgress?.votedPlayerIds.includes(p.id) ?? (isMe && pendingVoteTarget !== null);
                const autoBlank = hasPlayerVoted && !p.connected;
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 py-2 px-2 rounded-lg"
                  >
                    <UserAvatar
                      username={p.name}
                      avatarUrl={p.avatarUrl}
                      size="sm"
                      disconnected={!p.connected}
                    />
                    <span className="flex-1 min-w-0 truncate text-sm text-slate-800 dark:text-slate-100">
                      {p.name}
                      {isMe && ' (toi)'}
                    </span>
                    {hasPlayerVoted ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        {autoBlank ? 'Blanc (auto)' : 'A voté'}
                      </span>
                    ) : p.connected ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">…</span>
                    ) : (
                      <span className="text-xs text-slate-500 shrink-0">Off</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </details>

        {clues.length > 0 && (
          <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
              <span>Indices ({clues.length})</span>
              <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="border-t border-slate-200 dark:border-slate-700 px-4 pb-3 pt-1 space-y-2">
              {clues.map((c, i) => (
                <li key={`${c.playerId}-${i}`} className="text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                  <span className="text-slate-400 dark:text-slate-500"> · </span>
                  <span className="text-violet-700 dark:text-violet-300 font-medium break-words">{c.text}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {(hasVoted || !canVote) && (
          <button
            type="button"
            onClick={() => setShowMyWord(true)}
            className="w-full py-2 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors"
          >
            Voir mon mot
          </button>
        )}
      </div>

      {canVote && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 dark:border-slate-700 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-lg mx-auto flex gap-2">
            <Button
              fullWidth
              size="lg"
              variant={selectedId === VOTE_BLANK ? 'secondary' : 'danger'}
              onClick={handleConfirm}
              disabled={selectedId === null}
            >
              {selectedId === null
                ? 'Sélectionne un joueur'
                : selectedId === VOTE_BLANK
                  ? 'Confirmer — vote blanc'
                  : `Éliminer ${players.find((p) => p.id === selectedId)?.name ?? '…'}`}
            </Button>
            <button
              type="button"
              onClick={() => setShowMyWord(true)}
              className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-600 px-3 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Mot
            </button>
          </div>
        </div>
      )}

      <ViewMyWordModal
        isOpen={showMyWord}
        onClose={() => setShowMyWord(false)}
        myWord={myWord}
      />
    </Layout>
  );
}
