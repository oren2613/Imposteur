interface OnlineErrorBannerProps {
  error: string | null;
  onDismiss: () => void;
}

/** N'affiche pas les erreurs techniques transitoires (ex. vocal en changement de phase). */
export function OnlineErrorBanner({ error, onDismiss }: OnlineErrorBannerProps) {
  if (!error) return null;
  if (error === 'Joueur introuvable') return null;

  return (
    <div className="flex items-center justify-between gap-3 text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl shrink-0">
      <span className="min-w-0 flex-1 text-center">{error}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 underline hover:no-underline">
        Fermer
      </button>
    </div>
  );
}
