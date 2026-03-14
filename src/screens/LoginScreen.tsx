import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function LoginScreen() {
  const { setPhase } = useGame();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      setError('Renseigne ton pseudo et ton mot de passe');
      return;
    }
    setLoading(true);
    try {
      await login(u, p);
      setPhase('home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion échouée');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Connexion" onBack={() => setPhase('home')} backLabel="Accueil">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && (
          <p className="text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            {error}
          </p>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
            Pseudo
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={30}
            autoComplete="username"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
        <Button fullWidth size="lg" type="submit" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Pas encore de compte ?{' '}
          <button
            type="button"
            onClick={() => setPhase('signup')}
            className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
          >
            S'inscrire
          </button>
        </p>
      </form>
    </Layout>
  );
}
