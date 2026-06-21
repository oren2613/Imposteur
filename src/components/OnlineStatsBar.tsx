import { Gamepad2, Trophy, Percent } from 'lucide-react';
import { useOnline } from '../context/OnlineContext';

export function OnlineStatsBar() {
  const { myStats } = useOnline();
  const { gamesPlayed, wins } = myStats;
  const pct = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : null;

  const items = [
    { icon: Gamepad2, label: 'Parties', value: gamesPlayed },
    { icon: Trophy, label: 'Victoires', value: wins },
    { icon: Percent, label: 'Réussite', value: pct == null ? '—' : `${pct}%` },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 py-3 px-2"
        >
          <Icon className="w-4 h-4 text-violet-500 dark:text-violet-400" />
          <span className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
            {value}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
