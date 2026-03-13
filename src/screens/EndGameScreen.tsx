import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

const roleLabels: Record<string, string> = {
  citoyen: 'Citoyen',
  imposteur: 'Imposteur',
  mrWhite: 'Mr. White',
};

const winnerLabels: Record<string, string> = {
  citoyens: 'Les Citoyens gagnent',
  imposteur: "L'Imposteur gagne",
  mrWhite: 'Mr. White gagne seul',
};

export function EndGameScreen() {
  const { state, setPhase, resetToConfig, resetToHome } = useGame();
  const { wordPair, players, winner, mrWhiteGuessCorrect } = state;

  return (
    <Layout title="Fin de partie" onBack={() => setPhase('home')} backLabel="Accueil">
      <div className="space-y-6">
        <div className="bg-violet-100 dark:bg-violet-900/30 rounded-2xl p-6 text-center border border-violet-200 dark:border-violet-800">
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {winner ? winnerLabels[winner] : 'Partie terminée'}
          </p>
          {winner === 'mrWhite' && mrWhiteGuessCorrect !== null && (
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              {mrWhiteGuessCorrect ? 'Il a trouvé le mot !' : 'Il n\'a pas trouvé le mot.'}
            </p>
          )}
        </div>

        {wordPair && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Paire de mots utilisée
            </p>
            <p className="text-slate-800 dark:text-slate-100">
              Citoyens : <strong>{wordPair.motCitoyens}</strong> — Imposteur : <strong>{wordPair.motImposteur}</strong>
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
            Rôles
          </p>
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex justify-between items-center py-1 text-slate-800 dark:text-slate-100"
              >
                <span>{p.name}</span>
                <span className="font-medium text-violet-600 dark:text-violet-400">
                  {roleLabels[p.role]}
                  {p.eliminated && ' (éliminé)'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Button fullWidth size="lg" onClick={resetToConfig}>
            Rejouer (même configuration)
          </Button>
          <Button fullWidth variant="secondary" size="lg" onClick={resetToHome}>
            Nouvelle configuration
          </Button>
        </div>
      </div>
    </Layout>
  );
}
