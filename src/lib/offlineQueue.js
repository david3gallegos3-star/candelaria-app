const QUEUE_KEY = 'candelaria_offline_queue';

function load() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function save(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueue({ table, operation, data, filters }) {
  const queue = load();
  const item = {
    id:        crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    table,
    operation,
    data:    data ?? null,
    filters: filters ?? {},
    status:  'pending',
    error:   null,
    retries: 0,
  };
  queue.push(item);
  save(queue);
  return item;
}

export function getQueue() {
  return load();
}

export function getPendingCount() {
  return load().filter(i => i.status === 'pending').length;
}

export function getTotalCount() {
  return load().length;
}

export function markSyncing(id) {
  save(load().map(i => i.id === id ? { ...i, status: 'syncing' } : i));
}

export function markSynced(id) {
  save(load().filter(i => i.id !== id));
}

export function markError(id, errorMessage) {
  save(load().map(i =>
    i.id === id
      ? { ...i, status: 'error', error: errorMessage, retries: i.retries + 1 }
      : i
  ));
}

export function markPending(id) {
  save(load().map(i =>
    i.id === id ? { ...i, status: 'pending', error: null } : i
  ));
}

export function discard(id) {
  save(load().filter(i => i.id !== id));
}
