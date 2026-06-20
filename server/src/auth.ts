/**
 * JWT et vérification des mots de passe.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { findUserByUsername, findUserById, type UserRow } from './db.js';

const JWT_SECRET = resolveJwtSecret();
const SALT_ROUNDS = 10;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'imposteur-dev-secret-change-in-production';
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  userId: number;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function authenticateUser(username: string, password: string): Promise<UserRow | null> {
  const user = await findUserByUsername(username);
  if (!user) return null;
  const ok = await comparePassword(password, user.password_hash);
  return ok ? user : null;
}

export async function getUserFromToken(token: string): Promise<UserRow | null> {
  const payload = verifyToken(token);
  if (!payload) return null;
  return findUserById(payload.userId);
}
