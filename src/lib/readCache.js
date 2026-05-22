import { openDB } from 'idb';

const DB_NAME = 'candelaria_cache';
const STORE   = 'queries';
const TTL_MS  = 8 * 60 * 60 * 1000; // 8 horas

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'key' });
      }
    },
  });
}

export function makeKey(table, filters) {
  return `${table}||${JSON.stringify(filters ?? {})}`;
}

export async function get(key) {
  try {
    const store = await db();
    const entry = await store.get(STORE, key);
    if (!entry) return null;
    return { data: entry.data, stale: Date.now() > entry.expiresAt };
  } catch {
    return null;
  }
}

export async function set(key, data) {
  try {
    const store = await db();
    await store.put(STORE, {
      key,
      data,
      cachedAt:  Date.now(),
      expiresAt: Date.now() + TTL_MS,
    });
  } catch {
    // IndexedDB unavailable — silently ignore
  }
}

export async function clear() {
  try {
    const store = await db();
    await store.clear(STORE);
  } catch {}
}
