import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

const roleLabels: Record<string, string> = {
  citoyen: 'Citoyen',
  imposteur: 'Imposteur',
  mrWhite: 'Mr. White',
};

export function EliminatedRevealScreen() {
  const { state, continueAfterCitizenEliminated } = useGame();
  const { players, eliminatedPlayerId } = state;
  const eliminated = players.find((p) => p.id === eliminatedPlayerId);

  if (!eliminated) return null;

  return (
    <Layout title="Révélation" onBack={() => {}} backLabel="Retour" hideBack>
      <div className="flex-1 flex flex-col justify-center gap-8">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg border border-slate-200 dark:border-slate-700 text-center animate-reveal">
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            {eliminated.name} a été éliminé.
          </p>
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
            C&apos;était un {roleLabels[eliminated.role]}.
          </p>
        </div>
        <Button fullWidth size="lg" onClick={continueAfterCitizenEliminated}>
          Continuer la discussion
        </Button>
      </div>
    </Layout>
  );
}
