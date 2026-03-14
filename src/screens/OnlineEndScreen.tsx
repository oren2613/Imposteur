import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';
import { RoomConfigForm } from '../components/RoomConfigForm';
import type { OnlineGameConfig } from '../types/online';

const DEFAULT_CONFIG: OnlineGameConfig = {
  playerCount: 4,
  impostorCount: 1,
  mrWhiteEnabled: true,
};

const winnerLabels: Record<string, string> = {
  citoyens: 'Les Citoyens gagnent',
  imposteur: "L'Imposteur gagne",
  mrWhite: 'Mr. White gagne seul',
};

export function OnlineEndScreen() {
  const { gameState, roomState, isHost, error, leaveRoom, updateRoomConfig, startNextRound, clearError } = useOnline();
  const winner = gameState?.winner ?? null;
  const wordPair = gameState?.wordPair ?? null;
  const config = gameState?.config ?? roomState?.config ?? DEFAULT_CONFIG;
  const currentMemberCount = roomState?.members.length ?? config.playerCount;

  const handleConfigChange = (newConfig: OnlineGameConfig) => {
    clearError();
    updateRoomConfig(newConfig);
  };

  return (
    <Layout title="Fin de partie" onBack={() => leaveRoom()} backLabel="Quitter">
      <OnlineStatsBar />
      <div className="space-y-6">
        <div className="bg-violet-100 dark:bg-violet-900/30 rounded-2xl p-6 text-center border border-violet-200 dark:border-violet-800">
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {winner ? winnerLabels[winner] : 'Partie terminée'}
          </p>
        </div>

        {wordPair && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Paire de mots utilisée
            </p>
            <p className="text-slate-800 dark:text-slate-100">
              Citoyens : <strong>{wordPair.motCitoyens}</strong> — Imposteur : <strong>{wordPair.motImposteur}</strong>
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}

        {isHost && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
              Paramètres pour la prochaine manche
            </p>
            <RoomConfigForm
              config={config}
              onChange={handleConfigChange}
              currentMemberCount={currentMemberCount}
            />
          </div>
        )}

        <Button
          fullWidth
          size="lg"
          onClick={() => {
            clearError();
            startNextRound();
          }}
          disabled={!isHost}
        >
          {isHost ? 'Nouvelle manche' : 'En attente du host…'}
        </Button>

        <Button fullWidth variant="secondary" size="lg" onClick={() => leaveRoom()}>
          Quitter la partie
        </Button>
      </div>
    </Layout>
  );
}
