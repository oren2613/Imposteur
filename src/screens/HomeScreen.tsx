import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { StickmanParade } from '../components/StickmanParade';

export function HomeScreen() {
  const { setPhase } = useGame();
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto relative pb-28">
      <div className="text-center mb-10 animate-fade-in">
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Imposteur
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-lg">
          + Mr. White
        </p>
      </div>

      <div className="w-full flex flex-col gap-4">
        <Button fullWidth size="lg" onClick={() => setPhase('config')}>
          Nouvelle partie
        </Button>
        <Button
          fullWidth
          variant="secondary"
          size="lg"
          onClick={() => setPhase('onlineCreateOrJoin')}
        >
          Jouer en ligne
        </Button>
        {user ? (
          <>
            <Button
              fullWidth
              variant="ghost"
              size="lg"
              onClick={() => setPhase('profile')}
            >
              Mon profil
            </Button>
            <Button
              fullWidth
              variant="ghost"
              size="lg"
              onClick={() => setPhase('friends')}
            >
              Mes amis
            </Button>
          </>
        ) : (
          <Button
            fullWidth
            variant="ghost"
            size="lg"
            onClick={() => setPhase('login')}
          >
            Se connecter
          </Button>
        )}
        <Button
          fullWidth
          variant="ghost"
          size="lg"
          onClick={() => setPhase('rules')}
        >
          Règles
        </Button>
        <Button
          fullWidth
          variant="ghost"
          size="lg"
          onClick={() => setPhase('history')}
        >
          Historique
        </Button>
      </div>

      <StickmanParade />
    </div>
  );
}
