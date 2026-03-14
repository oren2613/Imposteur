import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { RoomConfigForm } from '../components/RoomConfigForm';
import type { OnlineGameConfig } from '../types/online';

export function OnlineLobbyScreen() {
  const { roomState, roomId, isHost, error, leaveRoom, startGame, updateRoomConfig, clearError } = useOnline();

  if (!roomState || !roomId) {
    return (
      <Layout title="Lobby" onBack={() => leaveRoom()} backLabel="Quitter">
        <p className="text-slate-600 dark:text-slate-400">Chargement…</p>
      </Layout>
    );
  }

  const { members, config } = roomState;
  const canStart = isHost && members.length === config.playerCount;

  const handleConfigChange = (newConfig: OnlineGameConfig) => {
    clearError();
    updateRoomConfig(newConfig);
  };

  return (
    <Layout
      title="Lobby"
      onBack={() => leaveRoom()}
      backLabel="Quitter"
    >
      <div className="space-y-6">
        <div className="bg-violet-100 dark:bg-violet-900/30 rounded-2xl p-5 border border-violet-200 dark:border-violet-800">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
            Code de la room
          </p>
          <p className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-100 tracking-wider">
            {roomId}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Partager ce code pour inviter des joueurs
          </p>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
            Joueurs ({members.length} / {config.playerCount})
          </p>
          <ul className="space-y-2">
            {members.map((m) => {
              const games = m.gamesPlayed ?? 0;
              const wins = m.wins ?? 0;
              const pct = games > 0 ? ((wins / games) * 100).toFixed(1) : '—';
              return (
                <li
                  key={m.socketId}
                  className="flex items-center justify-between gap-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-medium shrink-0">
                      {m.isHost ? '★' : '·'}
                    </span>
                    <span className="truncate">{m.name}</span>
                    {m.isHost && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">(host)</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    {games} partie{games !== 1 ? 's' : ''}, {wins} victoire{wins !== 1 ? 's' : ''}, {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {isHost && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
              Paramètres de la partie
            </p>
            <RoomConfigForm
              config={config}
              onChange={handleConfigChange}
              currentMemberCount={members.length}
            />
          </div>
        )}

        {isHost && (
          <Button
            fullWidth
            size="lg"
            onClick={() => { clearError(); startGame(); }}
            disabled={!canStart}
          >
            Lancer la partie
          </Button>
        )}

        {isHost && !canStart && (
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
            En attente de {config.playerCount - members.length} joueur(s)…
          </p>
        )}
      </div>
    </Layout>
  );
}
