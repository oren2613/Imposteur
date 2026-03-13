import { useEffect, useState } from 'react';

const STORAGE_KEY = 'imposteur-dark-mode';

export function useDarkMode(): [boolean, (dark: boolean) => void] {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === '1';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? '1' : '0');
    } catch {
      // ignore
    }
  }, [dark]);

  return [dark, setDark];
}
