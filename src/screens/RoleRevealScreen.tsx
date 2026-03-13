import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';

export function RoleRevealScreen() {
  const { state, nextReveal } = useGame();
  const { players, currentRevealIndex, wordPair } = state;
  const [revealed, setRevealed] = useState(false);

  const currentPlayer = players[currentRevealIndex];
  const isLast = currentRevealIndex >= players.length - 1;

  const handleNext = () => {
    if (revealed) {
      setRevealed(false);
      nextReveal();
    }
  };

  // À la distribution : on n'affiche jamais "Citoyen" ni "Imposteur".
  // Les joueurs avec un mot voient uniquement leur mot ; celui sans mot voit qu'il n'en a pas.
  const hasWord = currentPlayer.word != null;

  if (!currentPlayer || !wordPair) return null;

  return (
    <Layout
      title={`${currentPlayer.name}`}
      hideBack
      onBack={() => {}}
    >
      <div className="flex-1 flex flex-col justify-center gap-8">
        {!revealed ? (
          <>
            <p className="text-center text-slate-600 dark:text-slate-400 text-lg">
              Passe l&apos;appareil à <strong>{currentPlayer.name}</strong>.
              Personne d&apos;autre ne doit regarder l&apos;écran.
            </p>
            <Button
              fullWidth
              size="lg"
              onClick={() => setRevealed(true)}
              className="animate-reveal"
            >
              Voir mon mot
            </Button>
          </>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg border border-slate-200 dark:border-slate-700 animate-reveal">
            {hasWord ? (
              <p className="text-center">
                <span className="text-slate-500 dark:text-slate-400 text-sm block mb-1">
                  Ton mot secret
                </span>
                <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                  {currentPlayer.word}
                </span>
              </p>
            ) : (
              <p className="text-center text-slate-600 dark:text-slate-300">
                Tu n&apos;as pas de mot. Improvise et fais deviner sans te faire repérer.
              </p>
            )}
          </div>
        )}

        {revealed && (
          <div className="flex flex-col gap-3">
            <Button fullWidth size="lg" variant="secondary" onClick={() => setRevealed(false)}>
              Cacher
            </Button>
            <Button fullWidth size="lg" onClick={handleNext}>
              {isLast ? 'Commencer la partie' : 'Passer au joueur suivant'}
            </Button>
          </div>
        )}
      </div>
      <p className="text-center text-slate-400 dark:text-slate-500 text-sm mt-4">
        Joueur {currentRevealIndex + 1} / {players.length}
      </p>
    </Layout>
  );
}
