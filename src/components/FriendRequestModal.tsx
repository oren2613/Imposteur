import { useState } from 'react';
import { useOnline } from '../context/OnlineContext';
import { Button } from './Button';
import { acceptFriendRequestApi, refuseFriendRequestApi } from '../api/auth';

export function FriendRequestModal() {
  const { pendingFriendRequest, clearPendingFriendRequest } = useOnline();
  const [loading, setLoading] = useState(false);

  if (!pendingFriendRequest) return null;

  const handleAccept = async () => {
    setLoading(true);
    try {
      await acceptFriendRequestApi(pendingFriendRequest.requestId);
      clearPendingFriendRequest();
    } catch {
      // garder le modal ouvert en cas d'erreur
    } finally {
      setLoading(false);
    }
  };

  const handleRefuse = async () => {
    setLoading(true);
    try {
      await refuseFriendRequestApi(pendingFriendRequest.requestId);
      clearPendingFriendRequest();
    } catch {
      clearPendingFriendRequest();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700 max-w-sm w-full">
        <p className="text-lg font-medium text-slate-800 dark:text-slate-100 text-center mb-2">
          {pendingFriendRequest.fromUsername} veut t&apos;ajouter en ami
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
          Acceptes-tu la demande ?
        </p>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            fullWidth
            onClick={handleRefuse}
            disabled={loading}
          >
            Refuser
          </Button>
          <Button fullWidth onClick={handleAccept} disabled={loading}>
            {loading ? '…' : 'Accepter'}
          </Button>
        </div>
      </div>
    </div>
  );
}
