import { useOnline } from '../context/OnlineContext';

export function OnlineStatsBar() {
  const { myStats } = useOnline();
  const { gamesPlayed, wins } = myStats;
  const pct = gamesPlayed > 0 ? ((wins / gamesPlayed) * 100).toFixed(1) : '—';
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
      {gamesPlayed} partie{gamesPlayed !== 1 ? 's' : ''}, {wins} victoire{wins !== 1 ? 's' : ''}, {pct}%
    </p>
  );
}
