import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function DiscussionScreen() {
  const { state, setPhase, resetToConfig } = useGame();
  const { players } = state;
  const activePlayers = players.filter((p) => !p.eliminated);

  return (
    <Layout
      title="Discussion"
      onBack={() => setPhase('config')}
      backLabel="Config"
    >
      <div className="flex-1 flex flex-col justify-center gap-8">
        <div className="bg-violet-100 dark:bg-violet-900/30 rounded-2xl p-8 text-center border border-violet-200 dark:border-violet-800">
          <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            La discussion peut commencer
          </p>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Chaque joueur donne un indice oral à tour de rôle.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
            Ordre des joueurs (indices)
          </p>
          <ol className="space-y-2">
            {activePlayers.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 py-2 text-slate-800 dark:text-slate-100"
              >
                <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-medium">
                  {i + 1}
                </span>
                {p.name}
              </li>
            ))}
          </ol>
        </div>

        <Button fullWidth size="lg" onClick={() => setPhase('vote')}>
          Passer au vote
        </Button>
        <Button fullWidth variant="ghost" size="md" onClick={resetToConfig}>
          Recommencer la partie
        </Button>
      </div>
    </Layout>
  );
}
