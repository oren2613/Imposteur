import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function VoteScreen() {
  const { state, eliminatePlayer } = useGame();
  const { players } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const votable = players.filter((p) => !p.eliminated);

  const handleConfirm = () => {
    if (selectedId) {
      eliminatePlayer(selectedId);
    }
  };

  return (
    <Layout title="Vote" onBack={() => {}} backLabel="Discussion" hideBack>
      <div className="space-y-6">
        <p className="text-slate-600 dark:text-slate-400 text-center">
          Choisissez le joueur à éliminer.
        </p>
        <div className="grid gap-3">
          {votable.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`
                w-full py-4 px-5 rounded-2xl text-left font-medium
                border-2 transition-all
                ${
                  selectedId === p.id
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-500'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                }
              `}
            >
              {p.name}
            </button>
          ))}
        </div>
        <Button
          fullWidth
          size="lg"
          onClick={handleConfirm}
          disabled={!selectedId}
        >
          Éliminer ce joueur
        </Button>
      </div>
    </Layout>
  );
}
