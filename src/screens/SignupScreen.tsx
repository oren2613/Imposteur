import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function SignupScreen() {
  const { setPhase } = useGame();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      setError('Renseigne un pseudo et un mot de passe');
      return;
    }
    if (u.length < 2) {
      setError('Le pseudo doit faire au moins 2 caractères');
      return;
    }
    if (p.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    if (p !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      await register(u, p);
      setPhase('home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inscription échouée');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Inscription" onBack={() => setPhase('home')} backLabel="Accueil">
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
            placeholder="Choisis un pseudo (2-30 caractères)"
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
            placeholder="Au moins 6 caractères"
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
            Confirmer le mot de passe
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
        <Button fullWidth size="lg" type="submit" disabled={loading}>
          {loading ? 'Inscription…' : "S'inscrire"}
        </Button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Déjà un compte ?{' '}
          <button
            type="button"
            onClick={() => setPhase('login')}
            className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
          >
            Se connecter
          </button>
        </p>
      </form>
    </Layout>
  );
}
