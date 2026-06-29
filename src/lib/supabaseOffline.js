import * as queue from './offlineQueue';
import * as cache from './readCache';
import * as connectionStatus from './connectionStatus';

// Estado de conexión sincronizado (no React — módulo puro)
let _online = true;
window.addEventListener('online',  () => { _online = true;  });
window.addEventListener('offline', () => { _online = false; });

export function isOnline() { return _online; }

export function createOfflineClient(realClient) {
  return new Proxy(realClient, {
    get(target, prop) {
      if (prop === 'from') {
        return (table) => buildOfflineQuery(target.from(table), table);
      }
      return Reflect.get(target, prop);
    },
  });
}

// ── Builder proxy ─────────────────────────────────────────

function buildOfflineQuery(realBuilder, table) {
  const state = {
    type:      null,   // 'read' | 'write'
    operation: null,   // 'select' | 'insert' | 'update' | 'delete' | 'upsert'
    data:      null,
    filters:   {},
  };
  return makeBuilderProxy(realBuilder, table, state);
}

function makeBuilderProxy(target, table, state) {
  return new Proxy(target, {
    get(t, prop) {

      // ── Interceptar ejecución (await / .then()) ──────────
      if (prop === 'then') {
        return (resolve, reject) => {
          execute(t, table, state).then(resolve, reject);
        };
      }

      const value = Reflect.get(t, prop);
      if (typeof value !== 'function') return value;

      // ── Interceptar métodos del builder ─────────────────
      return (...args) => {
        trackCall(prop, args, state);
        const result = value.apply(t, args);
        // Siempre re-envolver builders (incluyendo cuando devuelven `this`)
        // Sin esto, .order()/.eq()/.limit() rompen la cadena y el execute() nunca corre offline
        if (result && typeof result === 'object' && typeof result.then === 'function') {
          return makeBuilderProxy(result, table, state);
        }
        return result;
      };
    },
  });
}

// ── Seguimiento del tipo de operación ────────────────────

function trackCall(prop, args, state) {
  if (!state.type) {
    if (prop === 'select')                            { state.type = 'read';  state.operation = 'select'; }
    if (prop === 'insert')                            { state.type = 'write'; state.operation = 'insert'; state.data = args[0]; }
    if (prop === 'update')                            { state.type = 'write'; state.operation = 'update'; state.data = args[0]; }
    if (prop === 'delete')                            { state.type = 'write'; state.operation = 'delete'; }
    if (prop === 'upsert')                            { state.type = 'write'; state.operation = 'upsert'; state.data = args[0]; }
  }
  // Capturar filtros para cache key y replay
  if (['eq','neq','gt','lt','gte','lte','in','is'].includes(prop)) {
    state.filters[`${prop}:${args[0]}`] = args[1];
  }
}

// ── Ejecución online/offline ──────────────────────────────

async function execute(realBuilder, table, state) {
  if (_online) {
    let result;
    try {
      result = await realBuilder;
    } catch (err) {
      connectionStatus.reportError();
      throw err;
    }
    connectionStatus.reportSuccess();
    // Cachear resultado de lecturas
    if (state.type === 'read' && result?.data) {
      const key = cache.makeKey(table, state.filters);
      await cache.set(key, result.data);
    }
    return result;
  }

  // ── OFFLINE ──────────────────────────────────────────────
  if (state.type === 'read' || !state.type) {
    const key = cache.makeKey(table, state.filters);
    let cached = await cache.get(key);

    // Fallback: si no hay caché exacto, usar tabla completa y filtrar en JS
    if (!cached && Object.keys(state.filters).length > 0) {
      const fullKey = cache.makeKey(table, {});
      const full = await cache.get(fullKey);
      if (full) {
        return {
          data:       applyFiltersToData(full.data, state.filters),
          error:      null,
          _fromCache: true,
          _stale:     !!full.stale,
          _noCache:   false,
        };
      }
    }

    return {
      data:        cached?.data ?? [],
      error:       null,
      _fromCache:  true,
      _stale:      !!cached?.stale,
      _noCache:    !cached,
    };
  }

  if (state.type === 'write') {
    queue.enqueue({
      table,
      operation: state.operation,
      data:      state.data,
      filters:   state.filters,
    });
    return { data: state.data, error: null, _queued: true };
  }

  return { data: null, error: null };
}

// ── Filtrar datos en memoria cuando no hay caché exacto ──

function applyFiltersToData(data, filters) {
  if (!data) return [];
  let result = data;
  for (const [key, val] of Object.entries(filters || {})) {
    const colonIdx = key.indexOf(':');
    const op  = key.slice(0, colonIdx);
    const col = key.slice(colonIdx + 1);
    if      (op === 'eq')  result = result.filter(r => r[col] === val);
    else if (op === 'neq') result = result.filter(r => r[col] !== val);
    else if (op === 'gt')  result = result.filter(r => r[col] > val);
    else if (op === 'lt')  result = result.filter(r => r[col] < val);
    else if (op === 'gte') result = result.filter(r => r[col] >= val);
    else if (op === 'lte') result = result.filter(r => r[col] <= val);
    else if (op === 'is')  result = val === null
      ? result.filter(r => r[col] === null || r[col] === undefined)
      : result.filter(r => r[col] !== null && r[col] !== undefined);
  }
  return result;
}
