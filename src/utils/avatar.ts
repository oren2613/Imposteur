/** Couleur de fond stable pour l'avatar par défaut (dérivée du pseudo). */
export function getAvatarColor(username: string): string {
  const colors = [
    'bg-violet-500',
    'bg-indigo-500',
    'bg-blue-500',
    'bg-cyan-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-orange-500',
    'bg-rose-500',
    'bg-fuchsia-500',
  ];
  let hash = 0;
  const name = username.trim().toLowerCase();
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Initiales affichées sur l'avatar par défaut (1 ou 2 caractères). */
export function getAvatarInitials(username: string): string {
  const parts = username.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  const word = parts[0] ?? '?';
  return word.slice(0, 2).toUpperCase();
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
