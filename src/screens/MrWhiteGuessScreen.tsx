import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

const GUESS_DURATION_MS = 30_000;

export function MrWhiteGuessScreen() {
  const { state, submitMrWhiteGuess } = useGame();
  const { players, eliminatedPlayerId } = state;
  const [guess, setGuess] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(GUESS_DURATION_MS / 1000);
  const [startedAt] = useState(() => Date.now());

  const mrWhite = players.find((p) => p.id === eliminatedPlayerId);

  useEffect(() => {
    if (submitted) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((startedAt + GUESS_DURATION_MS - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setSubmitted(true);
        submitMrWhiteGuess('');
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [submitted, startedAt, submitMrWhiteGuess]);

  const handleSubmit = () => {
    if (!guess.trim() || submitted) return;
    setSubmitted(true);
    submitMrWhiteGuess(guess.trim());
  };

  return (
    <Layout title="Dernière chance" onBack={() => {}} backLabel="Retour" hideBack>
      <div className="space-y-5">
        <p className="text-slate-600 dark:text-slate-400 text-center text-sm">
          {mrWhite?.name} (Mr. White) a été éliminé. Devine le mot des Citoyens.
        </p>
        <p className="text-center text-sm font-semibold text-violet-700 dark:text-violet-300 tabular-nums">
          {secondsLeft}s restantes
        </p>
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
          {submitted ? 'Envoi…' : 'Valider la réponse'}
        </Button>
      </div>
    </Layout>
  );
}
