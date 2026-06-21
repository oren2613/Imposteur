/**
 * Persistance temporaire des rooms en base (survit aux redémarrages Railway).
 */

import { saveGameRoom, deleteGameRoom, loadActiveGameRooms } from './db.js';
import { importPersistedRoom, exportPersistedRoom } from './roomStore.js';

const ROOM_TTL_MS = 4 * 60 * 60 * 1000;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleRoomPersist(roomId: string): void {
  const prev = persistTimers.get(roomId);
  if (prev) clearTimeout(prev);
  persistTimers.set(
    roomId,
    setTimeout(() => {
      persistTimers.delete(roomId);
      void persistRoomNow(roomId);
    }, 400)
  );
}

export async function persistRoomNow(roomId: string): Promise<void> {
  const data = exportPersistedRoom(roomId);
  if (!data) {
    await deleteGameRoom(roomId);
    return;
  }
  await saveGameRoom(roomId, JSON.stringify(data), Date.now() + ROOM_TTL_MS);
}

export async function removePersistedRoom(roomId: string): Promise<void> {
  const t = persistTimers.get(roomId);
  if (t) {
    clearTimeout(t);
    persistTimers.delete(roomId);
  }
  await deleteGameRoom(roomId);
}

export async function loadPersistedRoomsIntoMemory(): Promise<number> {
  const rows = await loadActiveGameRooms();
  let count = 0;
  for (const row of rows) {
    try {
      const data = JSON.parse(row.state) as unknown;
      importPersistedRoom(String(row.id), data);
      count++;
    } catch {
      await deleteGameRoom(String(row.id));
    }
  }
  return count;
}
