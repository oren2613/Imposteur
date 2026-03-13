import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function RulesScreen() {
  const { setPhase } = useGame();

  return (
    <Layout title="Règles" onBack={() => setPhase('home')} backLabel="Accueil">
      <div className="space-y-6 text-slate-700 dark:text-slate-300">
        <ul className="space-y-4 list-none">
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            Les Citoyens ont tous le même mot.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            L&apos;Imposteur a un mot proche mais différent.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            Mr. White n&apos;a aucun mot.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            Chacun donne un indice oral à tour de rôle.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            Après discussion, les joueurs votent pour éliminer un suspect.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            Si Mr. White est éliminé, il peut tenter de deviner le mot des Citoyens.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            S&apos;il trouve, il gagne seul. Sinon, les Citoyens gagnent.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            Si l&apos;Imposteur est éliminé, les Citoyens gagnent.
          </li>
          <li className="flex gap-3">
            <span className="text-violet-500 font-bold shrink-0">•</span>
            Si un Citoyen est éliminé, la partie continue.
          </li>
        </ul>
        <Button fullWidth size="lg" onClick={() => setPhase('home')}>
          Retour à l&apos;accueil
        </Button>
      </div>
    </Layout>
  );
}
