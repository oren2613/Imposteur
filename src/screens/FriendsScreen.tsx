import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { addFriendApi, removeFriendApi, fetchFriends, type Friend } from '../api/auth';
import { UserMinus, UserPlus } from 'lucide-react';

export function FriendsScreen() {
  const { setPhase } = useGame();
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user) {
      setPhase('home');
      return;
    }
    fetchFriends().then(setFriends).finally(() => setLoading(false));
  }, [user, setPhase]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    const name = newUsername.trim();
    if (!name) return;
    setAdding(true);
    try {
      const friend = await addFriendApi(name);
      setFriends((prev) => (prev.some((f) => f.id === friend.id) ? prev : [...prev, friend]));
      setNewUsername('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (friendId: number) => {
    try {
      await removeFriendApi(friendId);
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  return (
    <Layout title="Mes amis" onBack={() => setPhase('profile')} backLabel="Profil">
      <div className="space-y-6">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newUsername}
            onChange={(e) => { setNewUsername(e.target.value); setAddError(''); }}
            placeholder="Pseudo d'un ami"
            maxLength={30}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <Button type="submit" disabled={adding || !newUsername.trim()} size="lg" className="shrink-0">
            <UserPlus className="w-5 h-5" />
          </Button>
        </form>
        {addError && (
          <p className="text-rose-600 dark:text-rose-400 text-sm">{addError}</p>
        )}

        {loading ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-4">Chargement…</p>
        ) : friends.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-4">
            Aucun ami. Ajoute un ami avec son pseudo.
          </p>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 py-3 px-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">{f.username}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(f.id)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  aria-label={`Retirer ${f.username} des amis`}
                >
                  <UserMinus className="w-5 h-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
