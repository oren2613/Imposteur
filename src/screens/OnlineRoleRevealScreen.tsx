import { useState, useEffect } from 'react';
import { useOnline } from '../context/OnlineContext';
import { Layout } from '../components/Layout';
import { OnlineStatsBar } from '../components/OnlineStatsBar';

const COUNTDOWN_SECONDS = 10;

export function OnlineRoleRevealScreen() {
  const { myWord, myPlayerId, error, clearError } = useOnline();
  const [secondsLeft, setSecondsLeft] = useState<number>(COUNTDOWN_SECONDS);
  const roleReceived = myPlayerId !== null;

  useEffect(() => {
    if (!roleReceived) return;
    setSecondsLeft(COUNTDOWN_SECONDS);
    const endAt = Date.now() + COUNTDOWN_SECONDS * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 200);
    return () => clearInterval(id);
  }, [roleReceived]);

  return (
    <Layout title="Ton mot" hideBack onBack={() => {}} backLabel="">
      <OnlineStatsBar />
      <div className="flex-1 flex flex-col justify-center gap-8">
        {error && (
          <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl">
            <span className="min-w-0 flex-1 text-center">{error}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline hover:no-underline">
              Fermer
            </button>
          </div>
        )}

        {!roleReceived ? (
          <p className="text-center text-slate-500 dark:text-slate-400">Chargement…</p>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg border border-slate-200 dark:border-slate-700">
            {myWord !== null && myWord !== '' ? (
              <div className="text-center">
                <p className="text-slate-500 dark:text-slate-400 text-sm block mb-2">
                  Ton mot secret
                </p>
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                  {myWord}
                </p>
              </div>
            ) : (
              <p className="text-center text-slate-600 dark:text-slate-300 text-lg">
                Tu n&apos;as pas de mot.
                <br />
                <span className="text-slate-500 dark:text-slate-400 text-base">
                  Improvise et fais deviner sans te faire repérer.
                </span>
              </p>
            )}
          </div>
        )}

        {roleReceived && (
          <p className="text-center text-slate-500 dark:text-slate-400 text-sm font-medium">
            La partie commence dans {secondsLeft} seconde{secondsLeft !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </Layout>
  );
}
