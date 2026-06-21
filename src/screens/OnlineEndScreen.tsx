import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';
import { LobbyReadyPanel } from '../components/LobbyReadyPanel';
import { Fireworks } from '../components/Fireworks';
import { Trophy } from 'lucide-react';

const winnerLabels: Record<string, string> = {
  citoyens: 'Les Citoyens gagnent',
  imposteur: "L'Imposteur gagne",
  mrWhite: 'Mr. White gagne seul',
};

const winnerAccent: Record<string, string> = {
  citoyens: 'from-emerald-400 to-teal-500',
  imposteur: 'from-rose-400 to-red-500',
  mrWhite: 'from-amber-400 to-orange-500',
};

export function OnlineEndScreen() {
  const {
    gameState,
    roomState,
    localPlayerName,
    error,
    leaveRoom,
    setLobbyReady,
    clearError,
  } = useOnline();
  const winner = gameState?.winner ?? null;
  const wordPair = gameState?.wordPair ?? null;
  const config = gameState?.config ?? roomState?.config;
  const countdownEndsAt = gameState?.nextRoundCountdownEndsAt ?? null;
  const readySocketIds = gameState?.nextRoundReadySocketIds ?? [];
  const connectedMembers = roomState?.members.filter((m) => m.socketId) ?? [];
  const myMember = connectedMembers.find(
    (m) => localPlayerName && m.name.trim().toLowerCase() === localPlayerName.trim().toLowerCase()
  );
  const amReady = myMember ? readySocketIds.includes(myMember.socketId) : false;
  const readyCount = connectedMembers.filter((m) => readySocketIds.includes(m.socketId)).length;
  const totalCount = connectedMembers.length;

  return (
    <Layout title="Fin de partie" onBack={() => leaveRoom()} backLabel="Quitter">
      <Fireworks active={winner != null} />
      <div className="space-y-6 relative z-10">
        <div
          className={`rounded-3xl p-8 text-center text-white shadow-lg bg-gradient-to-br ${
            winner ? winnerAccent[winner] : 'from-violet-400 to-purple-500'
          } animate-pop-in`}
        >
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center animate-bounce-slow">
              <Trophy className="w-8 h-8" />
            </div>
          </div>
          <p className="text-xs uppercase tracking-widest text-white/80 mb-1">Vainqueur</p>
          <p className="text-3xl font-extrabold drop-shadow-sm">
            {winner ? winnerLabels[winner] : 'Partie terminée'}
          </p>
        </div>

        <OnlineStatsBar />

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

        {config && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Prochaine manche
            </p>
            <p className="text-sm text-slate-800 dark:text-slate-100">
              {totalCount} joueur{totalCount > 1 ? 's' : ''} · {config.impostorCount} imposteur{config.impostorCount > 1 ? 's' : ''}
              {config.mrWhiteEnabled ? ' · Mr. White activé' : ''}
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

        {totalCount >= 3 ? (
          <>
            <LobbyReadyPanel
              countdownEndsAt={countdownEndsAt}
              readyCount={readyCount}
              totalCount={totalCount}
              isReady={amReady}
              onToggleReady={(ready) => {
                clearError();
                setLobbyReady(ready);
              }}
              countdownTitle="Exclusion des absents dans"
              allReadyTitle="Tout le monde rejoue !"
              note="valide pour lancer plus vite"
              readyLabel="Rejouer"
              notReadyLabel="Prêt à rejouer — annuler"
              waitingLabel="En attente des autres joueurs…"
            />
            <p className="text-center text-xs text-slate-400 dark:text-slate-500">
              Les joueurs qui ne valident pas avant la fin du compte à rebours
              seront retirés de la room.
            </p>
          </>
        ) : (
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
            Pas assez de joueurs pour une nouvelle manche.
          </p>
        )}

        <Button fullWidth variant="secondary" size="lg" onClick={() => leaveRoom()}>
          Quitter la partie
        </Button>
      </div>
    </Layout>
  );
}
