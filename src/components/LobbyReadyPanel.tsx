import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Check } from 'lucide-react';

function useCountdownSeconds(endsAt: number | null | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  return secondsLeft;
}

interface LobbyReadyPanelProps {
  countdownEndsAt: number | null | undefined;
  readyCount: number;
  totalCount: number;
  isReady: boolean;
  onToggleReady: (ready: boolean) => void;
  waitingLabel?: string;
}

export function LobbyReadyPanel({
  countdownEndsAt,
  readyCount,
  totalCount,
  isReady,
  onToggleReady,
  waitingLabel = 'En attente de joueurs…',
}: LobbyReadyPanelProps) {
  const secondsLeft = useCountdownSeconds(countdownEndsAt);
  const allReady = readyCount === totalCount && totalCount > 0;
  const countdownActive = countdownEndsAt != null;

  if (!countdownActive) {
    return (
      <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
        {waitingLabel}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-4 border border-violet-200 dark:border-violet-800 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
          {allReady ? 'Tous prêts — lancement imminent !' : 'Début automatique dans'}
        </p>
        {!allReady && (
          <p className="text-3xl font-bold text-violet-700 dark:text-violet-300 tabular-nums">
            {secondsLeft ?? '…'} s
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          {readyCount} / {totalCount} prêt{readyCount > 1 ? 's' : ''}
          {!allReady && ' — tout le monde prêt pour lancer plus vite'}
        </p>
      </div>

      <Button
        fullWidth
        size="lg"
        variant={isReady ? 'secondary' : 'primary'}
        onClick={() => onToggleReady(!isReady)}
      >
        {isReady ? (
          <>
            <Check className="w-5 h-5" />
            Prêt — cliquer pour annuler
          </>
        ) : (
          'Je suis prêt'
        )}
      </Button>
    </div>
  );
}
