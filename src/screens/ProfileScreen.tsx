import { useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function ProfileScreen() {
  const { setPhase } = useGame();
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!user) setPhase('home');
  }, [user, setPhase]);

  if (!user) return null;

  return (
    <Layout title="Mon profil" onBack={() => setPhase('home')} backLabel="Accueil">
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            Pseudo
          </p>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {user.username}
          </p>
        </div>
        <Button
          fullWidth
          variant="secondary"
          onClick={() => {
            logout();
            setPhase('home');
          }}
        >
          Se déconnecter
        </Button>
        <Button
          fullWidth
          variant="ghost"
          onClick={() => setPhase('friends')}
        >
          Mes amis
        </Button>
      </div>
    </Layout>
  );
}
