/**
 * Persistance des comptes : PostgreSQL en production (DATABASE_URL),
 * SQLite en local (SQLITE_PATH).
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_PATH ?? path.join(__dirname, '..', 'data', 'imposteur.db');
const databaseUrl = process.env.DATABASE_URL?.trim();

let sqliteDb: Database.Database | null = null;
let pgPool: pg.Pool | null = null;

const usePostgres = Boolean(databaseUrl);

function getSqliteDb(): Database.Database {
  if (!sqliteDb) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    sqliteDb = new Database(dbPath);
    initSqliteSchema(sqliteDb);
  }
  return sqliteDb;
}

function getPgPool(): pg.Pool {
  if (!pgPool) {
    throw new Error('Base PostgreSQL non initialisée');
  }
  return pgPool;
}

function initSqliteSchema(database: Database.Database) {
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

async function initPostgresSchema(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
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
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      UNIQUE(from_user_id, to_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
  `);
}

export async function initDb(): Promise<void> {
  if (usePostgres) {
    pgPool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl!.includes('railway.internal') ? false : { rejectUnauthorized: false },
    });
    await initPostgresSchema(pgPool);
    return;
  }
  getSqliteDb();
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

function mapUserRow(row: pg.QueryResultRow): UserRow {
  return {
    id: Number(row.id),
    username: String(row.username),
    password_hash: String(row.password_hash),
    created_at: Number(row.created_at),
  };
}

export async function findUserById(id: number): Promise<UserRow | null> {
  if (usePostgres) {
    const result = await getPgPool().query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }
  return getSqliteDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | null;
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const trimmed = username.trim();
  if (!trimmed) return null;

  if (usePostgres) {
    const exact = await getPgPool().query('SELECT * FROM users WHERE username = $1', [trimmed]);
    if (exact.rows[0]) return mapUserRow(exact.rows[0]);
    const norm = trimmed.toLowerCase();
    const ci = await getPgPool().query(
      'SELECT * FROM users WHERE lower(trim(username)) = $1',
      [norm]
    );
    return ci.rows[0] ? mapUserRow(ci.rows[0]) : null;
  }

  const db = getSqliteDb();
  let row = db.prepare('SELECT * FROM users WHERE username = ?').get(trimmed) as UserRow | null;
  if (row) return row;
  const norm = trimmed.toLowerCase();
  row = db.prepare('SELECT * FROM users WHERE lower(trim(username)) = ?').get(norm) as UserRow | null;
  return row;
}

export async function createUser(username: string, passwordHash: string): Promise<UserRow> {
  const name = username.trim();
  if (name.length < 2 || name.length > 30) {
    throw new Error('USERNAME_INVALID');
  }

  if (usePostgres) {
    try {
      const result = await getPgPool().query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *',
        [name, passwordHash]
      );
      return mapUserRow(result.rows[0]);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
        throw new Error('USERNAME_TAKEN');
      }
      throw e;
    }
  }

  const d = getSqliteDb();
  try {
    const result = d.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(name, passwordHash);
    return d.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as UserRow;
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('USERNAME_TAKEN');
    }
    throw e;
  }
}

export async function listFriends(userId: number): Promise<{ id: number; username: string }[]> {
  const query = `
    SELECT u.id, u.username FROM users u
    INNER JOIN friends f ON (f.friend_id = u.id AND f.user_id = $1) OR (f.user_id = u.id AND f.friend_id = $1)
  `;

  if (usePostgres) {
    const result = await getPgPool().query(query.replace(/\$1/g, '$1'), [userId]);
    return result.rows.map((row) => ({ id: Number(row.id), username: String(row.username) }));
  }

  return getSqliteDb().prepare(`
    SELECT u.id, u.username FROM users u
    INNER JOIN friends f ON (f.friend_id = u.id AND f.user_id = ?) OR (f.user_id = u.id AND f.friend_id = ?)
  `).all(userId, userId) as { id: number; username: string }[];
}

/** IDs des utilisateurs qui ont userId dans leur liste d'amis (pour notifier présence en ligne) */
export async function listUserIdsWhoHaveAsFriend(userId: number): Promise<number[]> {
  const query = `
    SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END AS other_id
    FROM friends WHERE user_id = $1 OR friend_id = $1
  `;

  if (usePostgres) {
    const result = await getPgPool().query(query, [userId]);
    return result.rows.map((row) => Number(row.other_id));
  }

  const rows = getSqliteDb().prepare(`
    SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END AS other_id
    FROM friends WHERE user_id = ? OR friend_id = ?
  `).all(userId, userId, userId) as { other_id: number }[];
  return rows.map((r) => Number(r.other_id));
}

export type AddFriendResult =
  | { ok: true; friend: { id: number; username: string } }
  | { ok: false; code: 'not_found' | 'self' | 'already_friends' };

export async function addFriend(userId: number, friendUsername: string): Promise<AddFriendResult> {
  const friend = await findUserByUsername(friendUsername);
  if (!friend) return { ok: false, code: 'not_found' };
  if (friend.id === userId) return { ok: false, code: 'self' };
  const a = Math.min(userId, friend.id);
  const b = Math.max(userId, friend.id);

  if (usePostgres) {
    try {
      await getPgPool().query('INSERT INTO friends (user_id, friend_id) VALUES ($1, $2)', [a, b]);
      return { ok: true, friend: { id: friend.id, username: friend.username } };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
        return { ok: true, friend: { id: friend.id, username: friend.username } };
      }
      throw e;
    }
  }

  try {
    getSqliteDb().prepare('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)').run(a, b);
    return { ok: true, friend: { id: friend.id, username: friend.username } };
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return { ok: true, friend: { id: friend.id, username: friend.username } };
    }
    throw e;
  }
}

export async function removeFriend(userId: number, friendId: number): Promise<boolean> {
  const a = Math.min(userId, friendId);
  const b = Math.max(userId, friendId);

  if (usePostgres) {
    const result = await getPgPool().query(
      'DELETE FROM friends WHERE user_id = $1 AND friend_id = $2',
      [a, b]
    );
    return (result.rowCount ?? 0) > 0;
  }

  const result = getSqliteDb().prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(a, b);
  return result.changes > 0;
}

export type CreateFriendRequestResult =
  | { ok: true; requestId: number; toUserId: number; toUsername: string }
  | { ok: false; code: 'not_found' | 'self' | 'already_friends' | 'already_requested' };

export async function createFriendRequest(fromUserId: number, toUsername: string): Promise<CreateFriendRequestResult> {
  const toUser = await findUserByUsername(toUsername);
  if (!toUser) return { ok: false, code: 'not_found' };
  if (toUser.id === fromUserId) return { ok: false, code: 'self' };
  const a = Math.min(fromUserId, toUser.id);
  const b = Math.max(fromUserId, toUser.id);

  if (usePostgres) {
    const pool = getPgPool();
    const existingFriend = await pool.query(
      'SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2',
      [a, b]
    );
    if (existingFriend.rows.length > 0) return { ok: false, code: 'already_friends' };
    try {
      const result = await pool.query(
        'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING id',
        [fromUserId, toUser.id]
      );
      return {
        ok: true,
        requestId: Number(result.rows[0].id),
        toUserId: toUser.id,
        toUsername: toUser.username,
      };
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505') {
        return { ok: false, code: 'already_requested' };
      }
      throw e;
    }
  }

  const d = getSqliteDb();
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

export async function listPendingFriendRequests(
  toUserId: number
): Promise<{ id: number; fromUserId: number; fromUsername: string }[]> {
  const query = `
    SELECT r.id, r.from_user_id AS "fromUserId", u.username AS "fromUsername"
    FROM friend_requests r
    INNER JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = $1
    ORDER BY r.created_at DESC
  `;

  if (usePostgres) {
    const result = await getPgPool().query(query, [toUserId]);
    return result.rows.map((row) => ({
      id: Number(row.id),
      fromUserId: Number(row.fromUserId),
      fromUsername: String(row.fromUsername),
    }));
  }

  return getSqliteDb().prepare(`
    SELECT r.id, r.from_user_id AS fromUserId, u.username AS fromUsername
    FROM friend_requests r
    INNER JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = ?
    ORDER BY r.created_at DESC
  `).all(toUserId) as { id: number; fromUserId: number; fromUsername: string }[];
}

export async function getFriendRequestById(id: number, toUserId: number): Promise<FriendRequestRow | null> {
  if (usePostgres) {
    const result = await getPgPool().query(
      'SELECT * FROM friend_requests WHERE id = $1 AND to_user_id = $2',
      [id, toUserId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      from_user_id: Number(row.from_user_id),
      to_user_id: Number(row.to_user_id),
      created_at: Number(row.created_at),
    };
  }

  return getSqliteDb().prepare('SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ?').get(id, toUserId) as FriendRequestRow | null;
}

export async function acceptFriendRequest(
  requestId: number,
  toUserId: number
): Promise<{ id: number; username: string } | null> {
  const req = await getFriendRequestById(requestId, toUserId);
  if (!req) return null;
  const a = Math.min(req.from_user_id, req.to_user_id);
  const b = Math.max(req.from_user_id, req.to_user_id);

  if (usePostgres) {
    const pool = getPgPool();
    await pool.query(
      'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [a, b]
    );
    await pool.query('DELETE FROM friend_requests WHERE id = $1', [requestId]);
    const fromUser = await findUserById(req.from_user_id);
    return fromUser ? { id: fromUser.id, username: fromUser.username } : null;
  }

  const d = getSqliteDb();
  d.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)').run(a, b);
  d.prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
  const fromUser = await findUserById(req.from_user_id);
  return fromUser ? { id: fromUser.id, username: fromUser.username } : null;
}

export async function refuseFriendRequest(requestId: number, toUserId: number): Promise<boolean> {
  if (usePostgres) {
    const result = await getPgPool().query(
      'DELETE FROM friend_requests WHERE id = $1 AND to_user_id = $2',
      [requestId, toUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  const result = getSqliteDb().prepare('DELETE FROM friend_requests WHERE id = ? AND to_user_id = ?').run(requestId, toUserId);
  return result.changes > 0;
}
