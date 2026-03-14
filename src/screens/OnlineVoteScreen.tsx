import { useState } from 'react';
import { useOnline } from '../context/OnlineContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { ViewMyWordModal } from '../components/ViewMyWordModal';

/** Valeur envoyée au backend pour un vote blanc (personne éliminée) */
const VOTE_BLANK = 'BLANK';

export function OnlineVoteScreen() {
  const { gameState, myWord, myPlayerId, error, vote, clearError } = useOnline();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMyWord, setShowMyWord] = useState(false);

  const players = gameState?.players ?? [];
  const votable = players.filter((p) => !p.eliminated && p.id !== myPlayerId);

  const handleConfirm = () => {
    if (selectedId !== null) {
      clearError();
      vote(selectedId);
    }
  };

  return (
    <Layout title="Vote" hideBack onBack={() => {}} backLabel="">
      <div className="flex flex-col gap-6">
        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1 text-center">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}

        <p className="text-slate-600 dark:text-slate-400 text-center text-sm">
          Choisissez le joueur à éliminer ou votez blanc.
        </p>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setSelectedId(VOTE_BLANK)}
            className={`
              w-full py-4 px-5 rounded-2xl text-left font-medium border-2 transition-all
              ${selectedId === VOTE_BLANK
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-500'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'}
            `}
          >
            Vote blanc (personne)
          </button>
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

        <div className="flex gap-3 items-center">
          <Button
            fullWidth
            size="lg"
            onClick={handleConfirm}
            disabled={selectedId === null}
          >
            {selectedId === VOTE_BLANK ? 'Voter blanc' : 'Éliminer ce joueur'}
          </Button>
          <button
            type="button"
            onClick={() => setShowMyWord(true)}
            className="shrink-0 py-2 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-600 transition-colors"
          >
            Voir mon mot
          </button>
        </div>
      </div>

      <ViewMyWordModal
        isOpen={showMyWord}
        onClose={() => setShowMyWord(false)}
        myWord={myWord}
      />
    </Layout>
  );
}
