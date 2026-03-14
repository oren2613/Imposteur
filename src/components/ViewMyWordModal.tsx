import { useEffect } from 'react';

interface ViewMyWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  myWord: string | null;
}

export function ViewMyWordModal({ isOpen, onClose, myWord }: ViewMyWordModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasWord = myWord !== null && myWord !== '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Voir mon mot"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/60 backdrop-blur-sm"
        aria-label="Fermer"
      />
      <div
        className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Ton mot secret
        </p>
        {hasWord ? (
          <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            {myWord}
          </p>
        ) : (
          <p className="text-slate-600 dark:text-slate-300">
            Tu n&apos;as pas de mot.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
