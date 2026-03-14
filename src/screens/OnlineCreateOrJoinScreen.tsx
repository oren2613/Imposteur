import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useOnline } from '../context/OnlineContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function OnlineCreateOrJoinScreen() {
  const { setPhase } = useGame();
  const { createRoom, joinRoom, error, clearError } = useOnline();
  const { user } = useAuth();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    if (user?.username && !playerName) setPlayerName(user.username);
  }, [user?.username, playerName]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    if (!name) return;
    createRoom(name);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const name = playerName.trim();
    const code = roomCode.trim().toUpperCase();
    if (!name || !code) return;
    joinRoom(code, name);
  };

  return (
    <Layout
      title="Jouer en ligne"
      onBack={() => { clearError(); setPhase('home'); }}
      backLabel="Accueil"
    >
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
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
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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

        <div className="space-y-3">
          <Button
            fullWidth
            size="lg"
            onClick={handleCreate}
            disabled={!playerName.trim()}
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
              disabled={!playerName.trim() || !roomCode.trim()}
            >
              Rejoindre avec le code
            </Button>
          </div>
        </div>
      </form>
    </Layout>
  );
}
