import type { ReactNode } from 'react';
import { Button } from './Button';

interface LayoutProps {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** Pour les écrans sensibles (révélation de rôle), masquer le retour */
  hideBack?: boolean;
}

export function Layout({ title, children, onBack, backLabel = 'Retour', hideBack }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-6 max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-6">
        {!hideBack && onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            ← {backLabel}
          </Button>
        )}
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 truncate">
          {title}
        </h1>
      </header>
      <main className="flex-1 flex flex-col gap-6">{children}</main>
    </div>
  );
}
