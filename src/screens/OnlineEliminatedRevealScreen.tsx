import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';

export function OnlineEliminatedRevealScreen() {
  const { gameState, error, continueAfterEliminated, clearError } = useOnline();
  const players = gameState?.players ?? [];
  const eliminatedPlayerId = gameState?.eliminatedPlayerId ?? null;
  const eliminated = eliminatedPlayerId
    ? players.find((p) => p.id === eliminatedPlayerId)
    : null;

  if (!eliminated) {
    return (
      <Layout title="Révélation" hideBack onBack={() => {}} backLabel="">
        <OnlineStatsBar />
        <p className="text-center text-slate-500 dark:text-slate-400">Chargement…</p>
      </Layout>
    );
  }

  return (
    <Layout title="Révélation" hideBack onBack={() => {}} backLabel="">
      <OnlineStatsBar />
      <div className="flex-1 flex flex-col justify-center gap-8">
        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1 text-center">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg border border-slate-200 dark:border-slate-700 text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            {eliminated.name} a été éliminé.
          </p>
        </div>
        <Button
          fullWidth
          size="lg"
          onClick={() => {
            clearError();
            continueAfterEliminated();
          }}
        >
          Continuer la discussion
        </Button>
      </div>
    </Layout>
  );
}
