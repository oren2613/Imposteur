const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

function normalizeRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/** Extrait le code room depuis l'URL courante (?room= ou /join/CODE). */
export function parseRoomCodeFromUrl(
  search: string = window.location.search,
  pathname: string = window.location.pathname
): string | null {
  const params = new URLSearchParams(search);
  const fromQuery = params.get('room');
  if (fromQuery) {
    const code = normalizeRoomCode(fromQuery);
    if (code) return code;
  }

  const joinMatch = pathname.match(/^\/join\/([^/?#]+)\/?$/i);
  if (joinMatch?.[1]) {
    return normalizeRoomCode(joinMatch[1]);
  }

  return null;
}

/** Retire les paramètres d'invitation de l'URL sans recharger la page. */
export function clearRoomInviteFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  if (/^\/join\/[^/?#]+\/?$/i.test(url.pathname)) {
    url.pathname = '/';
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next === '' ? '/' : next);
}

/** Construit un lien d'invitation partageable pour une room. */
export function buildRoomInviteLink(roomId: string, origin: string = window.location.origin): string {
  const code = normalizeRoomCode(roomId);
  if (!code) throw new Error('Code de room invalide');
  return `${origin.replace(/\/$/, '')}/?room=${code}`;
}
