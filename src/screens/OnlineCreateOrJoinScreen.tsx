import { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { useOnline } from '../context/OnlineContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function OnlineCreateOrJoinScreen() {
  const { setPhase } = useGame();
  const {
    createRoom,
    joinRoom,
    joinMatchmaking,
    leaveMatchmaking,
    isMatchmaking,
    matchmakingQueueSize,
    matchmakingTargetSize,
    error,
    clearError,
    inviteLinkRoomCode,
    clearInviteLinkRoomCode,
  } = useOnline();
  const { user } = useAuth();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    if (user?.username && !playerName) setPlayerName(user.username);
  }, [user?.username, playerName]);

  useEffect(() => {
    if (inviteLinkRoomCode) setRoomCode(inviteLinkRoomCode);
  }, [inviteLinkRoomCode]);

  const handleBack = () => {
    if (isMatchmaking) leaveMatchmaking();
    clearError();
    clearInviteLinkRoomCode();
    setPhase('home');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    if (!name || isMatchmaking) return;
    createRoom(name);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    const code = roomCode.trim().toUpperCase();
    if (!name || !code || isMatchmaking) return;
    clearInviteLinkRoomCode();
    joinRoom(code, name);
  };

  const handleMatchmaking = () => {
    const name = playerName.trim();
    if (!name || isMatchmaking) return;
    clearError();
    joinMatchmaking(name);
  };

  const nameReady = playerName.trim().length > 0;

  return (
    <Layout title="Jouer en ligne" onBack={handleBack} backLabel="Accueil">
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        {inviteLinkRoomCode && !isMatchmaking && (
          <div className="text-sm text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 p-3 rounded-xl">
            Tu as reçu une invitation pour rejoindre la room{' '}
            <span className="font-mono font-semibold">{inviteLinkRoomCode}</span>.
            Entre ton pseudo puis rejoins la partie.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
            Ton pseudo
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Pseudo"
            maxLength={30}
            disabled={isMatchmaking}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-60"
          />
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}

        {isMatchmaking ? (
          <div className="bg-violet-50 dark:bg-violet-900/25 border border-violet-200 dark:border-violet-800 rounded-2xl p-6 text-center space-y-4">
            <div className="flex justify-center">
              <Loader2 className="w-10 h-10 text-violet-600 dark:text-violet-400 animate-spin" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Recherche en cours…
              </p>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                {matchmakingQueueSize}/{matchmakingTargetSize} joueur
                {matchmakingTargetSize > 1 ? 's' : ''} trouvé
                {matchmakingQueueSize > 1 ? 's' : ''}
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Une room se crée automatiquement dès {matchmakingTargetSize} joueurs.
            </p>
            <Button fullWidth variant="secondary" onClick={leaveMatchmaking}>
              Annuler la recherche
            </Button>
          </div>
        ) : (
          <>
            <Button
              fullWidth
              size="lg"
              onClick={handleMatchmaking}
              disabled={!nameReady}
              className="gap-2"
            >
              <Search className="w-5 h-5 shrink-0" />
              Rechercher une partie
            </Button>

            <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
              ou jouer entre amis
            </p>

            <div className="space-y-3">
              <Button
                fullWidth
                size="lg"
                variant="secondary"
                onClick={handleCreate}
                disabled={!nameReady}
              >
                Créer une room
              </Button>

              <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
                ou
              </p>

              <div className="space-y-2">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Code de la room (ex. ABC123)"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent uppercase"
                />
                <Button
                  fullWidth
                  variant="secondary"
                  size="lg"
                  onClick={handleJoin}
                  disabled={!nameReady || !roomCode.trim()}
                >
                  Rejoindre avec le code
                </Button>
              </div>
            </div>
          </>
        )}
      </form>
    </Layout>
  );
}
