import { useState, useEffect } from 'react';
import { Heart, Check, Clock, Loader2 } from 'lucide-react';
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

  const handleConfirm = () => {
    if (selectedId === null || hasVoted) return;
    clearError();
    setPendingVoteTarget(selectedId);
    vote(selectedId);
  };

  return (
    <Layout title="Vote d'élimination" hideBack onBack={() => {}} backLabel="">
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

        {amEliminated && (
          <div className="bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 text-center">
            <p className="font-medium text-slate-800 dark:text-slate-100">
              Tu as été éliminé
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Observe le vote en cours. Tu ne peux plus voter.
            </p>
          </div>
        )}

        <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-5 border border-violet-200 dark:border-violet-800">
          <p className="text-sm font-medium text-violet-800 dark:text-violet-200 mb-1">
            Phase de vote
          </p>
          <p className="text-slate-700 dark:text-slate-300 text-sm mb-3">
            Désignez qui vous pensez être l&apos;Imposteur, ou votez blanc si vous n&apos;êtes pas sûr.
            {secondsLeft != null && (
              <span className="block mt-2 font-medium text-violet-700 dark:text-violet-300 tabular-nums">
                Temps restant : {secondsLeft}s — vote blanc automatique à l&apos;expiration
              </span>
            )}
          </p>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Votes reçus
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
              {votedCount} / {eligibleCount}
            </span>
          </div>
          <div className="h-2.5 bg-violet-200/80 dark:bg-violet-950/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-600 dark:bg-violet-400 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {hasVoted && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 border border-emerald-200 dark:border-emerald-800 text-center">
            <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">
              Ton vote est enregistré
            </p>
            {myVoteTarget && (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                Tu as choisi de {voteTargetLabel(myVoteTarget, players)}.
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 inline-flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              En attente des autres joueurs…
            </p>
          </div>
        )}

        {clues.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
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

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
            Qui a voté ?
          </p>
          <ul className="space-y-2">
            {players
              .filter((p) => !p.eliminated)
              .map((p) => {
                const isMe = p.id === myPlayerId;
                const hasPlayerVoted = voteProgress?.votedPlayerIds.includes(p.id) ?? (isMe && pendingVoteTarget !== null);
                const autoBlank = hasPlayerVoted && !p.connected;
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
                  >
                    <UserAvatar
                      username={p.name}
                      avatarUrl={p.avatarUrl}
                      size="sm"
                      disconnected={!p.connected}
                    />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {p.name}
                      {isMe && ' (toi)'}
                    </span>
                    {hasPlayerVoted ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        {autoBlank ? 'Vote blanc (auto)' : 'A voté'}
                      </span>
                    ) : p.connected ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">En cours…</span>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Déconnecté…</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>

        {!amEliminated && !hasVoted && (
          <>
            <p className="text-slate-600 dark:text-slate-400 text-center text-sm font-medium">
              Sélectionne ta cible puis confirme
            </p>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setSelectedId(VOTE_BLANK)}
                className={`
                  w-full py-4 px-5 rounded-2xl text-left font-medium border-2 transition-all
                  ${selectedId === VOTE_BLANK
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'}
                `}
              >
                <span className="block text-base">Vote blanc</span>
                <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  Personne n&apos;est éliminé ce tour
                </span>
              </button>
              {votable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`
                    w-full py-4 px-5 rounded-2xl text-left font-medium
                    border-2 transition-all
                    ${
                      selectedId === p.id
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-500 ring-2 ring-rose-300 dark:ring-rose-700'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                    }
                  `}
                >
                  <span className="inline-flex items-center gap-2">
                    <UserAvatar
                      username={p.name}
                      avatarUrl={p.avatarUrl}
                      size="sm"
                      disconnected={!p.connected}
                    />
                    <span>
                      Éliminer {p.name}
                      {isFriend(p.name, friendsList) && (
                        <Heart className="w-4 h-4 inline ml-1 text-violet-500 fill-violet-500 shrink-0" aria-label="ami" />
                      )}
                    </span>
                  </span>
                  {!p.connected && (
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-1 ml-10">
                      Déconnecté — vote blanc automatique
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3 items-center">
              <Button
                fullWidth
                size="lg"
                variant={selectedId === VOTE_BLANK ? 'secondary' : 'danger'}
                onClick={handleConfirm}
                disabled={selectedId === null}
              >
                {selectedId === null
                  ? 'Choisis une option'
                  : selectedId === VOTE_BLANK
                    ? 'Confirmer — vote blanc'
                    : `Confirmer — éliminer ${players.find((p) => p.id === selectedId)?.name ?? '…'}`}
              </Button>
              <button
                type="button"
                onClick={() => setShowMyWord(true)}
                className="shrink-0 py-2 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                Voir mon mot
              </button>
            </div>
          </>
        )}

        {iAmDisconnected && !hasVoted && (
          <div className="bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 text-center text-sm text-slate-600 dark:text-slate-400">
            Tu es déconnecté : un vote blanc sera enregistré automatiquement pour toi.
          </div>
        )}

        {hasVoted && (
          <button
            type="button"
            onClick={() => setShowMyWord(true)}
            className="w-full py-2 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors"
          >
            Voir mon mot
          </button>
        )}
      </div>

      <ViewMyWordModal
        isOpen={showMyWord}
        onClose={() => setShowMyWord(false)}
        myWord={myWord}
      />
    </Layout>
  );
}
