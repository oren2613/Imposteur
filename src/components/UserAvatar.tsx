import { WifiOff } from 'lucide-react';
import { getAvatarColor, getAvatarInitials } from '../utils/avatar';

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-2xl',
} as const;

interface UserAvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
  /** Affiche l'avatar grisé avec badge hors ligne */
  disconnected?: boolean;
}

export function UserAvatar({
  username,
  avatarUrl,
  size = 'md',
  className = '',
  disconnected = false,
}: UserAvatarProps) {
  const sizeClass = sizeClasses[size];
  const initials = getAvatarInitials(username);
  const colorClass = getAvatarColor(username);
  const offlineClass = disconnected ? 'opacity-45 grayscale' : '';

  const avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={`Photo de ${username}`}
      className={`${sizeClass} rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-600 ${offlineClass} ${className}`}
    />
  ) : (
    <span
      className={`${sizeClass} ${colorClass} rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-white border border-white/20 ${offlineClass} ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  );

  if (!disconnected) return avatar;

  return (
    <span className="relative inline-flex shrink-0" title={`${username} — déconnecté`}>
      {avatar}
      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-700 dark:bg-slate-600 border-2 border-white dark:border-slate-800 flex items-center justify-center">
        <WifiOff className="w-2.5 h-2.5 text-white" aria-hidden />
      </span>
    </span>
  );
}
