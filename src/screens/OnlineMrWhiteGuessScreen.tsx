import { useState } from 'react';
import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';

export function OnlineMrWhiteGuessScreen() {
  const { gameState, myPlayerId, error, submitMrWhiteGuess, clearError } = useOnline();
  const [guess, setGuess] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const players = gameState?.players ?? [];
  const eliminatedPlayerId = gameState?.eliminatedPlayerId ?? null;
  const mrWhite = eliminatedPlayerId
    ? players.find((p) => p.id === eliminatedPlayerId)
    : null;
  const isMrWhite = myPlayerId !== null && eliminatedPlayerId !== null && myPlayerId === eliminatedPlayerId;

  const handleSubmit = () => {
    if (!guess.trim() || submitted) return;
    setSubmitted(true);
    clearError();
    submitMrWhiteGuess(guess.trim());
  };

  return (
    <Layout title="Dernière chance" hideBack onBack={() => {}} backLabel="">
      <OnlineStatsBar />
      <div className="space-y-6">
        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1 text-center">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}
        <p className="text-slate-600 dark:text-slate-400 text-center">
          {mrWhite?.name ?? 'Mr. White'} a été éliminé. Il peut tenter de deviner le mot des Citoyens.
        </p>
        {isMrWhite ? (
          <>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                Proposition du mot des Citoyens
              </label>
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
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
          </div>
        )}
      </div>
    </Layout>
  );
}
