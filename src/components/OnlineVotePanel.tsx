import { useState, useEffect } from 'react';
import { Heart, Check, Loader2 } from 'lucide-react';
import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { UserAvatar } from '../components/UserAvatar';

const VOTE_BLANK = 'BLANK';

function isFriend(name: string, friendsList: { username: string }[]): boolean {
  const n = name.trim().toLowerCase();
  return friendsList.some((f) => f.username.trim().toLowerCase() === n);
}

function voteTargetLabel(
  targetId: string,
  players: { id: string; name: string }[]
): string {
  if (targetId === VOTE_BLANK) return 'vote blanc';
  const target = players.find((p) => p.id === targetId);
  return target ? target.name : 'ton choix';
}

/** Panneau de vote compact, conçu pour tenir sans scroll sur l'écran principal. */
export function OnlineVotePanel() {
  const { gameState, myPlayerId, vote, friendsList, leaveRoom } = useOnline();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingVoteTarget, setPendingVoteTarget] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const players = gameState?.players ?? [];
  const voteProgress = gameState?.voteProgress;
  const votable = players.filter((p) => !p.eliminated && p.id !== myPlayerId);
  const myPlayer = players.find((p) => p.id === myPlayerId);
  const amEliminated = myPlayer?.eliminated === true;

  const hasVotedOnServer =
    myPlayerId != null && voteProgress?.votedPlayerIds.includes(myPlayerId) === true;
  const hasVoted = hasVotedOnServer || pendingVoteTarget !== null;
  const canVote = !amEliminated && !hasVoted;

  useEffect(() => {
    if (gameState?.phase !== 'vote') {
      setPendingVoteTarget(null);
      setSelectedId(null);
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

  const votedCount = voteProgress?.votedCount ?? (hasVoted ? 1 : 0);
  const eligibleCount = voteProgress?.eligibleCount ?? players.filter((p) => !p.eliminated).length;
  const progressPercent = eligibleCount > 0 ? Math.round((votedCount / eligibleCount) * 100) : 0;
  const liveVotes = voteProgress?.votes ?? [];
  const nameOf = (id: string): string =>
    id === VOTE_BLANK ? 'Blanc' : (players.find((p) => p.id === id)?.name ?? '?');

  const handleConfirm = () => {
    if (selectedId === null || hasVoted) return;
    setPendingVoteTarget(selectedId);
    vote(selectedId);
  };

  const voteOptions = [
    ...votable.map((p) => ({ id: p.id, type: 'player' as const, player: p })),
    { id: VOTE_BLANK, type: 'blank' as const, player: null },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-3 py-2.5 shrink-0">
        <span className="text-sm font-semibold text-violet-800 dark:text-violet-200 tabular-nums">
          {secondsLeft != null ? `${secondsLeft}s` : 'Vote'}
        </span>
        <span className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">
          {votedCount}/{eligibleCount}
        </span>
      </div>

      <div className="h-1.5 bg-violet-200/80 dark:bg-violet-950/50 rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-violet-600 dark:bg-violet-400 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {liveVotes.length > 0 && (
        <div className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 space-y-1 max-h-28 overflow-y-auto">
          {liveVotes.map((v) => (
            <div key={v.voterId} className="flex items-center gap-1.5 text-xs">
              <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-300">
                {nameOf(v.voterId)}
                {v.voterId === myPlayerId && ' (toi)'}
              </span>
              <span className="text-slate-400 dark:text-slate-500 shrink-0">→</span>
              <span
                className={`shrink-0 font-medium ${
                  v.targetId === VOTE_BLANK
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {nameOf(v.targetId)}
              </span>
            </div>
          ))}
        </div>
      )}

      {amEliminated && (
        <div className="shrink-0 space-y-2">
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Tu es éliminé — observe le vote.
          </p>
          {confirmQuit ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmQuit(false)}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => leaveRoom()}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors"
              >
                Quitter
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmQuit(true)}
              className="w-full py-2 px-3 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-rose-200 dark:border-rose-800 transition-colors"
            >
              Quitter la partie
            </button>
          )}
        </div>
      )}

      {hasVoted && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-center shrink-0">
          <p className="font-semibold text-emerald-800 dark:text-emerald-200 inline-flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            Vote enregistré
            {myPlayerId && pendingVoteTarget && (
              <span className="font-normal text-sm">· {voteTargetLabel(pendingVoteTarget, players)}</span>
            )}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            En attente des autres…
          </p>
        </div>
      )}

      {canVote && (
        <>
          <p className="text-center text-sm font-semibold text-slate-800 dark:text-slate-100 shrink-0">
            Qui éliminer ?
          </p>

          <div className="grid grid-cols-3 gap-2 flex-1 min-h-0 content-start">
            {voteOptions.map((opt) => {
              if (opt.type === 'blank') {
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedId(VOTE_BLANK)}
                    aria-pressed={selectedId === VOTE_BLANK}
                    className={`
                      flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 min-h-[5.5rem] transition-all
                      ${
                        selectedId === VOTE_BLANK
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 ring-2 ring-violet-300 dark:ring-violet-700'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                      }
                    `}
                  >
                    <span className="text-xl leading-none">∅</span>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight text-center">
                      Blanc
                    </span>
                  </button>
                );
              }

              const p = opt.player!;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-pressed={selectedId === p.id}
                  className={`
                    flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2 min-h-[5.5rem] transition-all
                    ${
                      selectedId === p.id
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 ring-2 ring-rose-300 dark:ring-rose-700'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }
                  `}
                >
                  <UserAvatar username={p.name} avatarUrl={p.avatarUrl} size="sm" disconnected={!p.connected} />
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight text-center w-full">
                    {p.name}
                    {isFriend(p.name, friendsList) && (
                      <Heart className="w-3 h-3 inline ml-0.5 text-violet-500 fill-violet-500" aria-label="ami" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="shrink-0 pt-1">
            <Button
              fullWidth
              size="lg"
              variant={selectedId === VOTE_BLANK ? 'secondary' : 'danger'}
              onClick={handleConfirm}
              disabled={selectedId === null}
            >
              {selectedId === null
                ? 'Choisis un joueur'
                : selectedId === VOTE_BLANK
                  ? 'Vote blanc'
                  : `Éliminer ${players.find((p) => p.id === selectedId)?.name ?? '…'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
