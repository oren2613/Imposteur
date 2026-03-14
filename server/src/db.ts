/**
 * SQLite database : users et amis.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_PATH ?? path.join(__dirname, '..', 'data', 'imposteur.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(dbPath);
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

    CREATE TABLE IF NOT EXISTS friends (
      user_id INTEGER NOT NULL REFERENCES users(id),
      friend_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (user_id, friend_id),
      CHECK (user_id < friend_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
    CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);

    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(from_user_id, to_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
  `);
}

export interface FriendRequestRow {
  id: number;
  from_user_id: number;
  to_user_id: number;
  created_at: number;
}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
}

export function findUserById(id: number): UserRow | null {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | null;
}

export function findUserByUsername(username: string): UserRow | null {
  const trimmed = username.trim();
  if (!trimmed) return null;
  const db = getDb();
  // Essai correspondance exacte d'abord
  let row = db.prepare('SELECT * FROM users WHERE username = ?').get(trimmed) as UserRow | null;
  if (row) return row;
  // Puis insensible à la casse
  const norm = trimmed.toLowerCase();
  row = db.prepare('SELECT * FROM users WHERE lower(trim(username)) = ?').get(norm) as UserRow | null;
  return row;
}

export function createUser(username: string, passwordHash: string): UserRow {
  const d = getDb();
  const name = username.trim();
  if (name.length < 2 || name.length > 30) {
    throw new Error('USERNAME_INVALID');
  }
  try {
    const result = d.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(name, passwordHash);
    const row = d.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as UserRow;
    return row;
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('USERNAME_TAKEN');
    }
    throw e;
  }
}

export function listFriends(userId: number): { id: number; username: string }[] {
  const rows = getDb().prepare(`
    SELECT u.id, u.username FROM users u
    INNER JOIN friends f ON (f.friend_id = u.id AND f.user_id = ?) OR (f.user_id = u.id AND f.friend_id = ?)
  `).all(userId, userId) as { id: number; username: string }[];
  return rows;
}

export type AddFriendResult =
  | { ok: true; friend: { id: number; username: string } }
  | { ok: false; code: 'not_found' | 'self' | 'already_friends' };

export function addFriend(userId: number, friendUsername: string): AddFriendResult {
  const friend = findUserByUsername(friendUsername);
  if (!friend) return { ok: false, code: 'not_found' };
  if (friend.id === userId) return { ok: false, code: 'self' };
  const a = Math.min(userId, friend.id);
  const b = Math.max(userId, friend.id);
  try {
    getDb().prepare('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)').run(a, b);
    return { ok: true, friend: { id: friend.id, username: friend.username } };
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return { ok: true, friend: { id: friend.id, username: friend.username } };
    }
    throw e;
  }
}

export function removeFriend(userId: number, friendId: number): boolean {
  const a = Math.min(userId, friendId);
  const b = Math.max(userId, friendId);
  const result = getDb().prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(a, b);
  return result.changes > 0;
}

// --- Demandes d'ami

export type CreateFriendRequestResult =
  | { ok: true; requestId: number; toUserId: number; toUsername: string }
  | { ok: false; code: 'not_found' | 'self' | 'already_friends' | 'already_requested' };

export function createFriendRequest(fromUserId: number, toUsername: string): CreateFriendRequestResult {
  const toUser = findUserByUsername(toUsername);
  if (!toUser) return { ok: false, code: 'not_found' };
  if (toUser.id === fromUserId) return { ok: false, code: 'self' };
  const a = Math.min(fromUserId, toUser.id);
  const b = Math.max(fromUserId, toUser.id);
  const d = getDb();
  const existingFriend = d.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(a, b);
  if (existingFriend) return { ok: false, code: 'already_friends' };
  try {
    const result = d.prepare(
      'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)'
    ).run(fromUserId, toUser.id);
    return {
      ok: true,
      requestId: Number(result.lastInsertRowid),
      toUserId: toUser.id,
      toUsername: toUser.username,
    };
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { ok: false, code: 'already_requested' };
    }
    throw e;
  }
}

export function listPendingFriendRequests(toUserId: number): { id: number; fromUserId: number; fromUsername: string }[] {
  const rows = getDb().prepare(`
    SELECT r.id, r.from_user_id AS fromUserId, u.username AS fromUsername
    FROM friend_requests r
    INNER JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = ?
    ORDER BY r.created_at DESC
  `).all(toUserId) as { id: number; fromUserId: number; fromUsername: string }[];
  return rows;
}

export function getFriendRequestById(id: number, toUserId: number): FriendRequestRow | null {
  return getDb().prepare('SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ?').get(id, toUserId) as FriendRequestRow | null;
}

export function acceptFriendRequest(requestId: number, toUserId: number): { id: number; username: string } | null {
  const req = getFriendRequestById(requestId, toUserId);
  if (!req) return null;
  const a = Math.min(req.from_user_id, req.to_user_id);
  const b = Math.max(req.from_user_id, req.to_user_id);
  getDb().prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)').run(a, b);
  getDb().prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
  const fromUser = findUserById(req.from_user_id);
  return fromUser ? { id: fromUser.id, username: fromUser.username } : null;
}

export function refuseFriendRequest(requestId: number, toUserId: number): boolean {
  const result = getDb().prepare('DELETE FROM friend_requests WHERE id = ? AND to_user_id = ?').run(requestId, toUserId);
  return result.changes > 0;
}
