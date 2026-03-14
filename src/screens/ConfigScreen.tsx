import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const DUPLICATE_ERROR_DURATION_MS = 5000;

export function ConfigScreen() {
  const { state, setConfig, setPhase, startNewGame } = useGame();
  const { config } = state;
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const names = [...config.playerNames];
  while (names.length < config.playerCount) names.push('');
  while (names.length > config.playerCount) names.pop();

  useEffect(() => {
    if (!showDuplicateError) return;
    const t = setTimeout(() => setShowDuplicateError(false), DUPLICATE_ERROR_DURATION_MS);
    return () => clearTimeout(t);
  }, [showDuplicateError]);

  const setPlayerCount = (n: number) => {
    const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n));
    const newNames = [...config.playerNames];
    while (newNames.length < count) newNames.push('');
    const slice = newNames.slice(0, count);
    setConfig({
      ...config,
      playerCount: count,
      playerNames: slice,
    });
  };

  const setPlayerName = (index: number, value: string) => {
    const newNames = [...config.playerNames];
    while (newNames.length < config.playerCount) newNames.push('');
    newNames[index] = value;
    setConfig({ ...config, playerNames: newNames });
  };

  const canStart =
    config.playerCount >= MIN_PLAYERS &&
    config.playerNames.slice(0, config.playerCount).every((n) => n.trim().length > 0);
  const uniqueNames = new Set(
    config.playerNames.slice(0, config.playerCount).map((n) => n.trim().toLowerCase())
  );
  const hasDuplicates = uniqueNames.size < config.playerCount;

  const handleLaunch = () => {
    if (hasDuplicates) {
      setShowDuplicateError(true);
      return;
    }
    startNewGame();
  };

  const maxImpostors = Math.max(1, config.playerCount - (config.mrWhiteEnabled ? 2 : 1));
  const impostorCount = Math.min(config.impostorCount, maxImpostors);

  return (
    <Layout
      title="Configuration"
      onBack={() => setPhase('home')}
      backLabel="Accueil"
    >
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
            Nombre de joueurs
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setPlayerCount(config.playerCount - 1)}
              disabled={config.playerCount <= MIN_PLAYERS}
              className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xl disabled:opacity-50"
            >
              −
            </button>
            <span className="text-2xl font-semibold w-8 text-center">
              {config.playerCount}
            </span>
            <button
              type="button"
              onClick={() => setPlayerCount(config.playerCount + 1)}
              disabled={config.playerCount >= MAX_PLAYERS}
              className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xl disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
            Noms des joueurs
          </label>
          <div className="space-y-3">
            {names.map((name, i) => (
              <input
                key={i}
                type="text"
                value={name}
                onChange={(e) => setPlayerName(i, e.target.value)}
                placeholder={`Joueur ${i + 1}`}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
            Nombre d&apos;Imposteurs
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() =>
                setConfig({
                  ...config,
                  impostorCount: Math.max(1, config.impostorCount - 1),
                })
              }
              disabled={config.impostorCount <= 1}
              className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xl disabled:opacity-50"
            >
              −
            </button>
            <span className="text-2xl font-semibold w-8 text-center">
              {impostorCount}
            </span>
            <button
              type="button"
              onClick={() =>
                setConfig({
                  ...config,
                  impostorCount: Math.min(maxImpostors, config.impostorCount + 1),
                })
              }
              disabled={config.impostorCount >= maxImpostors}
              className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xl disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-slate-700 dark:text-slate-200 font-medium">
            Mr. White
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={config.mrWhiteEnabled}
            onClick={() =>
              setConfig({
                ...config,
                mrWhiteEnabled: !config.mrWhiteEnabled,
              })
            }
            className={`relative w-14 h-8 rounded-full transition-colors ${
              config.mrWhiteEnabled
                ? 'bg-violet-600'
                : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                config.mrWhiteEnabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>

        {showDuplicateError && (
          <p className="text-rose-600 dark:text-rose-400 text-sm">
            Les noms doivent être différents.
          </p>
        )}

        <Button
          fullWidth
          size="lg"
          onClick={handleLaunch}
          disabled={!canStart || hasDuplicates}
        >
          Lancer la partie
        </Button>
      </div>
    </Layout>
  );
}
