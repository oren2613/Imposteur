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
}

export function UserAvatar({ username, avatarUrl, size = 'md', className = '' }: UserAvatarProps) {
  const sizeClass = sizeClasses[size];
  const initials = getAvatarInitials(username);
  const colorClass = getAvatarColor(username);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`Photo de ${username}`}
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-600 ${className}`}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} ${colorClass} rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-white border border-white/20 ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}
