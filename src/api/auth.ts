/**
 * Appels API auth et amis (REST).
 */

const API_BASE = import.meta.env.VITE_API_URL ?? import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

function getToken(): string | null {
  return localStorage.getItem('imposteur_token');
}

function setToken(token: string) {
  localStorage.setItem('imposteur_token', token);
}

function clearToken() {
  localStorage.removeItem('imposteur_token');
}

export interface User {
  id: number;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Inscription échouée');
  return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Connexion échouée');
  return data;
}

export async function fetchMe(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user ?? null;
}

export { getToken, setToken, clearToken };

// --- Amis

export interface Friend {
  id: number;
  username: string;
}

export async function fetchFriends(): Promise<Friend[]> {
  const token = getToken();
  if (!token) return [];
  const res = await fetch(`${API_BASE}/friends`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.friends ?? [];
}

export async function addFriendApi(username: string): Promise<Friend> {
  const token = getToken();
  if (!token) throw new Error('Non connecté');
  const res = await fetch(`${API_BASE}/friends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username: username.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Impossible d\'ajouter');
  return data.friend;
}

export async function removeFriendApi(friendId: number): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Non connecté');
  const res = await fetch(`${API_BASE}/friends/${friendId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Impossible de retirer');
  }
}
