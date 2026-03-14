import type { OnlineGameConfig } from '../types/online';

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
/** Mr. White ne peut être activé qu'à partir de 4 joueurs */
const MIN_PLAYERS_FOR_MR_WHITE = 4;

/** impostorCount <= civilCount => max = floor((playerCount - (mw?1:0)) / 2) */
function getMaxImpostors(config: OnlineGameConfig): number {
  const civilsSlot = config.playerCount - (config.mrWhiteEnabled ? 1 : 0);
  return Math.max(1, Math.floor(civilsSlot / 2));
}

interface RoomConfigFormProps {
  config: OnlineGameConfig;
  onChange: (config: OnlineGameConfig) => void;
  disabled?: boolean;
  /** Nombre de membres déjà dans la room (playerCount ne peut pas être inférieur) */
  currentMemberCount: number;
}

export function RoomConfigForm({
  config,
  onChange,
  disabled = false,
  currentMemberCount,
}: RoomConfigFormProps) {
  const maxImp = getMaxImpostors(config);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
          Nombre de joueurs
        </label>
        <select
          value={config.playerCount}
          onChange={(e) => {
            const playerCount = Number(e.target.value);
            const mrWhiteEnabled = config.mrWhiteEnabled && playerCount >= MIN_PLAYERS_FOR_MR_WHITE;
            const newMaxImp = Math.max(1, playerCount - (mrWhiteEnabled ? 2 : 1));
            onChange({
              ...config,
              playerCount,
              mrWhiteEnabled,
              impostorCount: Math.min(config.impostorCount, newMaxImp),
            });
          }}
          disabled={disabled}
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-60"
        >
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(
            (n) => (
              <option key={n} value={n}>
                {n}
              </option>
            )
          )}
        </select>
        {currentMemberCount > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Minimum {currentMemberCount} (joueurs présents)
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
          Nombre d&apos;imposteurs
        </label>
        <select
          value={config.impostorCount}
          onChange={(e) =>
            onChange({ ...config, impostorCount: Number(e.target.value) })
          }
          disabled={disabled}
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-60"
        >
          {Array.from({ length: maxImp }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Max {maxImp} (imposteurs ≤ civils)
        </p>
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.mrWhiteEnabled}
          onChange={(e) => {
            const mrWhiteEnabled = e.target.checked;
            const newMaxImp = Math.max(1, config.playerCount - (mrWhiteEnabled ? 2 : 1));
            onChange({
              ...config,
              mrWhiteEnabled,
              impostorCount: Math.min(config.impostorCount, newMaxImp),
            });
          }}
          disabled={disabled || config.playerCount < MIN_PLAYERS_FOR_MR_WHITE}
          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span className={`text-sm ${config.playerCount < MIN_PLAYERS_FOR_MR_WHITE ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
          Mr. White activé
        </span>
      </label>
      {config.playerCount < MIN_PLAYERS_FOR_MR_WHITE && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mr. White disponible à partir de 4 joueurs
        </p>
      )}
    </div>
  );
}
