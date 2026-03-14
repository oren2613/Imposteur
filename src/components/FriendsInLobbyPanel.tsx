import { useState, useEffect } from 'react';
import { useOnline } from '../context/OnlineContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';
import type { Friend } from '../api/auth';
import { ChevronDown, ChevronUp, UserPlus } from 'lucide-react';

interface FriendsInLobbyPanelProps {
  /** Membres actuellement dans la room (pour masquer le bouton inviter si déjà dedans) */
  memberNames: string[];
  /** Appelé quand on invite un ami (pour feedback "Envoyé") */
  onInviteClick: (friendId: number) => void;
  /** ID de l'ami pour lequel l'invitation vient d'être envoyée (affiche "Envoyé") */
  inviteSentFriendId: number | null;
}

export function FriendsInLobbyPanel({
  memberNames,
  onInviteClick,
  inviteSentFriendId,
}: FriendsInLobbyPanelProps) {
  const { friendsList, onlineFriendIds, fetchOnlineFriends, inviteFriend, inviteError, clearInviteError } = useOnline();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    fetchOnlineFriends();
    const interval = setInterval(fetchOnlineFriends, 15000);
    return () => clearInterval(interval);
  }, [expanded, fetchOnlineFriends]);

  if (!user || friendsList.length === 0) return null;

  const normalizedMemberSet = new Set(
    memberNames.map((n) => n.trim().toLowerCase())
  );

  const isOnline = (f: Friend) => onlineFriendIds.includes(Number(f.id));

  const sortedFriends: Friend[] = [...friendsList].sort((a, b) => {
    const aOnline = isOnline(a);
    const bOnline = isOnline(b);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.username.localeCompare(b.username);
  });

  const onlineCount = sortedFriends.filter(isOnline).length;
  const offlineCount = sortedFriends.length - onlineCount;

  const summary =
    offlineCount === 0
      ? `${onlineCount} ami${onlineCount !== 1 ? 's' : ''} en ligne`
      : onlineCount === 0
        ? `${offlineCount} ami${offlineCount !== 1 ? 's' : ''} hors ligne`
        : `${onlineCount} ami${onlineCount !== 1 ? 's' : ''} en ligne • ${offlineCount} hors ligne`;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        aria-expanded={expanded}
        aria-controls="friends-lobby-list"
        id="friends-lobby-toggle"
      >
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Amis ({friendsList.length})
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1 mx-2">
          {summary}
        </span>
        {expanded ? (
          <ChevronUp className="w-5 h-5 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className="w-5 h-5 shrink-0 text-slate-400" aria-hidden />
        )}
      </button>

      {inviteError && (
        <div className="px-5 pb-2 flex items-center justify-between gap-2">
          <p className="text-rose-600 dark:text-rose-400 text-sm flex-1">{inviteError}</p>
          <button
            type="button"
            onClick={clearInviteError}
            className="text-xs text-slate-500 dark:text-slate-400 underline hover:no-underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {expanded && (
        <div
          id="friends-lobby-list"
          role="region"
          aria-labelledby="friends-lobby-toggle"
          className="border-t border-slate-200 dark:border-slate-700 max-h-56 overflow-y-auto"
        >
          <ul className="p-2 space-y-1">
            {sortedFriends.map((f) => {
              const friendOnline = isOnline(f);
              const isInRoom = normalizedMemberSet.has(f.username.trim().toLowerCase());
              const canInvite = friendOnline && !isInRoom;
              const justSent = inviteSentFriendId === Number(f.id);

              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`shrink-0 w-2 h-2 rounded-full ${
                        friendOnline
                          ? 'bg-violet-500 dark:bg-violet-400'
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                      aria-hidden
                    />
                    <span className="text-slate-800 dark:text-slate-100 truncate font-medium">
                      {f.username}
                    </span>
                    {isInRoom && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                        dans la room
                      </span>
                    )}
                  </div>
                  {canInvite && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const id = Number(f.id);
                        inviteFriend(id);
                        onInviteClick(id);
                      }}
                    >
                      <UserPlus className="w-4 h-4 mr-1" />
                      {justSent ? 'Envoyé' : 'Inviter'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
