import { useState, useEffect } from 'react';
import { useOnline } from '../context/OnlineContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { RoomConfigForm } from '../components/RoomConfigForm';
import { FriendsInLobbyPanel } from '../components/FriendsInLobbyPanel';
import { sendFriendRequestApi } from '../api/auth';
import type { OnlineGameConfig } from '../types/online';
import { Heart } from 'lucide-react';

export function OnlineLobbyScreen() {
  const { roomState, roomId, isHost, error, leaveRoom, startGame, updateRoomConfig, clearError, friendsList, loadFriends, fetchOnlineFriends } = useOnline();
  const { user } = useAuth();
  const [inviteSentFriendId, setInviteSentFriendId] = useState<number | null>(null);
  const [friendRequestSent, setFriendRequestSent] = useState<string | null>(null);
  const [friendRequestError, setFriendRequestError] = useState<string | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && user) loadFriends();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [user, loadFriends]);

  useEffect(() => {
    if (roomState && user) fetchOnlineFriends();
  }, [roomState, user, fetchOnlineFriends]);

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
          {friendRequestError && (
            <p className="text-rose-600 dark:text-rose-400 text-sm mb-2">{friendRequestError}</p>
          )}
          <ul className="space-y-2">
            {members.map((m) => {
              const isMe = user && m.name.trim().toLowerCase() === user.username.trim().toLowerCase();
              const isAlreadyFriend = friendsList.some((f) => f.username.trim().toLowerCase() === m.name.trim().toLowerCase());
              const canAddFriend = user && !isMe && !isAlreadyFriend;
              const justSent = friendRequestSent?.toLowerCase() === m.name.trim().toLowerCase();
              return (
                <li
                  key={m.socketId}
                  className="flex items-center justify-between gap-3 py-2 text-slate-800 dark:text-slate-100"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-medium shrink-0">
                      {m.isHost ? '★' : '·'}
                    </span>
                    <span className="truncate flex items-center gap-1">
                      {m.name}
                      {isAlreadyFriend && (
                        <Heart className="w-4 h-4 shrink-0 text-violet-500 fill-violet-500" aria-label="ami" />
                      )}
                      {justSent && (
                        <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">— Demande envoyée</span>
                      )}
                    </span>
                    {m.isHost && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">(host)</span>
                    )}
                  </div>
                  {canAddFriend && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setFriendRequestError(null);
                        sendFriendRequestApi(m.name)
                          .then(() => {
                            setFriendRequestSent(m.name);
                            setTimeout(() => setFriendRequestSent(null), 3000);
                          })
                          .catch((err) => {
                            setFriendRequestError(err instanceof Error ? err.message : 'Erreur');
                          });
                      }}
                    >
                      Demander en ami
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Utilise « Demander en ami » pour envoyer une demande. Une notification s&apos;affichera pour accepter ou refuser.
          </p>
        </div>

        {user && (
          <FriendsInLobbyPanel
            memberNames={members.map((m) => m.name)}
            onInviteClick={(friendId) => {
              setInviteSentFriendId(friendId);
              setTimeout(() => setInviteSentFriendId(null), 3000);
            }}
            inviteSentFriendId={inviteSentFriendId}
          />
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
