import type { UserRow } from './db.js';

export interface PublicUser {
  id: number;
  username: string;
  avatarUrl: string | null;
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatar_url ?? null,
  };
}
