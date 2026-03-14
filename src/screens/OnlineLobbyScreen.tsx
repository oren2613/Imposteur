import { useState, useEffect } from 'react';
import { useOnline } from '../context/OnlineContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { RoomConfigForm } from '../components/RoomConfigForm';
import { fetchFriends, type Friend } from '../api/auth';
import type { OnlineGameConfig } from '../types/online';
import { UserPlus } from 'lucide-react';

export function OnlineLobbyScreen() {
  const { roomState, roomId, isHost, error, leaveRoom, startGame, updateRoomConfig, clearError, inviteFriend } = useOnline();
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteSent, setInviteSent] = useState<number | null>(null);

  useEffect(() => {
    if (user) fetchFriends().then(setFriends);
  }, [user]);

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
            {members.map((m) => (
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
              </li>
            ))}
          </ul>
        </div>

        {isHost && user && friends.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
              Inviter des amis
            </p>
            <ul className="space-y-2">
              {friends.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-slate-800 dark:text-slate-100 truncate">{f.username}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      inviteFriend(f.id);
                      setInviteSent(f.id);
                      setTimeout(() => setInviteSent(null), 3000);
                    }}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    {inviteSent === f.id ? 'Envoyé' : 'Inviter'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
