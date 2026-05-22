import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseReal } from '../supabase';
import * as offlineQueue from '../lib/offlineQueue';

export function useNetworkStatus() {
  const [isOnline,    setIsOnline]    = useState(true);
  const [queueCount,  setQueueCount]  = useState(() => offlineQueue.getTotalCount());
  const [syncErrors,  setSyncErrors]  = useState([]);
  const [isSyncing,   setIsSyncing]   = useState(false);
  const [lastSynced,  setLastSynced]  = useState(null); // { count, time }
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(() => {
    setQueueCount(offlineQueue.getTotalCount());
    setSyncErrors(offlineQueue.getQueue().filter(i => i.status === 'error'));
  }, []);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const pending = offlineQueue.getQueue().filter(i => i.status === 'pending');
    if (pending.length === 0) { refreshQueue(); return; }

    syncingRef.current = true;
    setIsSyncing(true);
    let synced = 0;

    for (const item of pending) {
      offlineQueue.markSyncing(item.id);
      try {
        await executeItem(item);
        offlineQueue.markSynced(item.id);
        synced++;
      } catch (e) {
        offlineQueue.markError(item.id, e.message || 'Error desconocido');
      }
    }

    setIsSyncing(false);
    syncingRef.current = false;
    if (synced > 0) setLastSynced({ count: synced, time: new Date() });
    refreshQueue();
    return synced;
  }, [refreshQueue]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      syncQueue();
    };
    const onOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    // Refresca conteo cada 2s (para mostrar cambios en tiempo real)
    const interval = setInterval(refreshQueue, 2000);

    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [syncQueue, refreshQueue]);

  return {
    isOnline,
    queueCount,
    syncErrors,
    isSyncing,
    lastSynced,
    syncNow:     syncQueue,
    retryItem:   (id) => { offlineQueue.markPending(id); syncQueue(); },
    discardItem: (id) => { offlineQueue.discard(id); refreshQueue(); },
  };
}

// ── Ejecutar un item de la cola en Supabase real ──────────

async function executeItem(item) {
  const { table, operation, data, filters } = item;
  let query = supabaseReal.from(table);

  if      (operation === 'insert') query = query.insert(data);
  else if (operation === 'upsert') query = query.upsert(data);
  else if (operation === 'update') query = applyFilters(query.update(data), filters);
  else if (operation === 'delete') query = applyFilters(query.delete(), filters);
  else throw new Error(`Operación desconocida: ${operation}`);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

function applyFilters(query, filters) {
  for (const [key, val] of Object.entries(filters || {})) {
    const colonIdx = key.indexOf(':');
    const op  = key.slice(0, colonIdx);
    const col = key.slice(colonIdx + 1);
    if      (op === 'eq')  query = query.eq(col, val);
    else if (op === 'neq') query = query.neq(col, val);
    else if (op === 'gt')  query = query.gt(col, val);
    else if (op === 'lt')  query = query.lt(col, val);
    else if (op === 'gte') query = query.gte(col, val);
    else if (op === 'lte') query = query.lte(col, val);
  }
  return query;
}
