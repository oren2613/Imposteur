import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';
import { OnlineErrorBanner } from '../components/OnlineErrorBanner';

const GUESS_DURATION_MS = 30_000;

function isFriend(name: string, friendsList: { username: string }[]): boolean {
  const n = name.trim().toLowerCase();
  return friendsList.some((f) => f.username.trim().toLowerCase() === n);
}

export function OnlineMrWhiteGuessScreen() {
  const { gameState, myPlayerId, error, submitMrWhiteGuess, clearError, friendsList } = useOnline();
  const [guess, setGuess] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const players = gameState?.players ?? [];
  const eliminatedPlayerId = gameState?.eliminatedPlayerId ?? null;
  const mrWhite = eliminatedPlayerId
    ? players.find((p) => p.id === eliminatedPlayerId)
    : null;
  const isMrWhite = myPlayerId !== null && eliminatedPlayerId !== null && myPlayerId === eliminatedPlayerId;

  useEffect(() => {
    if (gameState?.phase !== 'mrWhiteGuess') {
      setGuess('');
      setSubmitted(false);
      setSecondsLeft(null);
    }
  }, [gameState?.phase]);

  useEffect(() => {
    const startedAt = gameState?.mrWhiteGuessStartedAt;
    const durationMs = gameState?.mrWhiteGuessDurationMs ?? GUESS_DURATION_MS;
    if (gameState?.phase !== 'mrWhiteGuess' || !startedAt || !isMrWhite || submitted) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((startedAt + durationMs - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [gameState?.phase, gameState?.mrWhiteGuessStartedAt, gameState?.mrWhiteGuessDurationMs, isMrWhite, submitted]);

  const handleSubmit = () => {
    if (!guess.trim() || submitted) return;
    setSubmitted(true);
    clearError();
    submitMrWhiteGuess(guess.trim());
  };

  return (
    <Layout title="Dernière chance" hideBack onBack={() => {}} backLabel="">
      <OnlineStatsBar />
      <OnlineErrorBanner error={error} onDismiss={clearError} />
      <div className="space-y-5">
        <p className="text-slate-600 dark:text-slate-400 text-center flex flex-wrap items-center justify-center gap-1.5 text-sm">
          <span className="inline-flex items-center gap-1.5">
            {mrWhite?.name ?? 'Mr. White'}
            {mrWhite?.name && isFriend(mrWhite.name, friendsList) && (
              <Heart className="w-4 h-4 text-violet-500 fill-violet-500 shrink-0" aria-label="ami" />
            )}
          </span>
          {' '}a été éliminé. Devine le mot des Citoyens.
        </p>

        {isMrWhite ? (
          <>
            {secondsLeft != null && (
              <p className="text-center text-sm font-semibold text-violet-700 dark:text-violet-300 tabular-nums">
                {secondsLeft}s restantes — réponse vide si le temps expire
              </p>
            )}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                Mot des Citoyens
              </label>
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                placeholder="Saisir le mot"
                disabled={submitted}
                className="w-full px-4 py-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-lg placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-70"
                autoFocus
              />
            </div>
            <Button
              fullWidth
              size="lg"
              onClick={handleSubmit}
              disabled={!guess.trim() || submitted}
            >
              {submitted ? 'Envoi en cours…' : 'Valider la réponse'}
            </Button>
          </>
        ) : (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 text-center">
            <p className="text-slate-600 dark:text-slate-400">
              En attente de la réponse de Mr. White…
            </p>
            {secondsLeft != null && (
              <p className="text-sm text-violet-600 dark:text-violet-400 mt-2 tabular-nums">
                {secondsLeft}s restantes
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
