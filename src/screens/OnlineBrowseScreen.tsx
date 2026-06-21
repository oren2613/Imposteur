import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Lock, Users, Loader2, DoorOpen } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { useOnline } from '../context/OnlineContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { UserAvatar } from '../components/UserAvatar';
import type { PublicRoomSummary } from '../types/online';

export function OnlineBrowseScreen() {
  const { setPhase } = useGame();
  const { fetchPublicRooms, joinRoom, error, clearError, storedSession } = useOnline();
  const { user } = useAuth();
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState(user?.username ?? storedSession?.playerName ?? '');
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchPublicRooms();
    setRooms(list);
    setLoading(false);
  }, [fetchPublicRooms]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const nameReady = playerName.trim().length > 0;

  const handleJoin = (room: PublicRoomSummary) => {
    if (!nameReady || !room.joinable) return;
    clearError();
    if (room.hasPassword) {
      setPasswordFor(room.roomId);
      setPasswordInput('');
      return;
    }
    joinRoom(room.roomId, playerName.trim());
  };

  const handleConfirmPassword = () => {
    if (!passwordFor || !nameReady) return;
    clearError();
    joinRoom(passwordFor, playerName.trim(), passwordInput.trim());
    setPasswordFor(null);
    setPasswordInput('');
  };

  return (
    <Layout title="Rooms en ligne" onBack={() => setPhase('onlineCreateOrJoin')} backLabel="Retour">
      <div className="space-y-5">
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

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Rooms publiques ({rooms.length})
          </p>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>

        {loading && rooms.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
            <DoorOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
            Aucune room publique pour le moment.
            <br />
            Crée la tienne pour lancer une partie !
          </div>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room) => (
              <li
                key={room.roomId}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar username={room.hostName} avatarUrl={room.hostAvatarUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                      {room.hostName}
                      {room.hasPassword && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <span className="font-mono">{room.roomId}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {room.memberCount}/{room.playerCount}
                      </span>
                      <span
                        className={
                          room.status === 'lobby'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        {room.status === 'lobby' ? 'En attente' : 'En partie'}
                      </span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleJoin(room)}
                    disabled={!nameReady || !room.joinable}
                  >
                    {room.joinable ? 'Rejoindre' : 'Complet'}
                  </Button>
                </div>

                {passwordFor === room.roomId && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Mot de passe"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleConfirmPassword()}
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <Button size="sm" onClick={handleConfirmPassword} disabled={!passwordInput.trim()}>
                      OK
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
