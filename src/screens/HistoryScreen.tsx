import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

const winnerLabels: Record<string, string> = {
  citoyens: 'Citoyens',
  imposteur: 'Imposteur',
  mrWhite: 'Mr. White',
};

export function HistoryScreen() {
  const { history, setPhase } = useGame();

  return (
    <Layout title="Historique" onBack={() => setPhase('home')} backLabel="Accueil">
      <div className="space-y-4">
        {history.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400 text-center py-8">
            Aucune partie enregistrée.
          </p>
        ) : (
          <ul className="space-y-3">
            {[...history].reverse().slice(0, 30).map((entry) => (
              <li
                key={entry.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex justify-between items-center gap-4"
              >
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {winnerLabels[entry.winner]} gagnent
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {entry.playerCount} joueurs — {entry.wordPair.motCitoyens} / {entry.wordPair.motImposteur}
                  </p>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                  {new Date(entry.date).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button fullWidth variant="secondary" size="lg" onClick={() => setPhase('home')}>
          Retour à l&apos;accueil
        </Button>
      </div>
    </Layout>
  );
}
