import { useOnline } from '../context/OnlineContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';

export function GameInviteModal() {
  const { pendingInvite, clearPendingInvite, joinRoom } = useOnline();
  const { user } = useAuth();

  if (!pendingInvite) return null;

  const handleJoin = () => {
    const name = user?.username ?? 'Joueur';
    joinRoom(pendingInvite.roomId, name);
    clearPendingInvite();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 max-w-sm w-full">
        <p className="text-lg font-medium text-slate-800 dark:text-slate-100 text-center mb-2">
          {pendingInvite.hostName} t&apos;invite à une partie
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
          Rejoins la room pour jouer avec tes amis.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={clearPendingInvite}>
            Refuser
          </Button>
          <Button fullWidth onClick={handleJoin}>
            Rejoindre
          </Button>
        </div>
      </div>
    </div>
  );
}
