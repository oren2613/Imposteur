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
  `);
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
  const norm = username.trim().toLowerCase();
  return getDb().prepare('SELECT * FROM users WHERE lower(username) = ?').get(norm) as UserRow | null;
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

export function addFriend(userId: number, friendUsername: string): { id: number; username: string } | null {
  const friend = findUserByUsername(friendUsername);
  if (!friend || friend.id === userId) return null;
  const a = Math.min(userId, friend.id);
  const b = Math.max(userId, friend.id);
  try {
    getDb().prepare('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)').run(a, b);
    return { id: friend.id, username: friend.username };
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return { id: friend.id, username: friend.username };
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
