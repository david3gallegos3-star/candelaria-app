# Modo Offline (Option C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando se va el internet, las escrituras se encolan localmente y se sincronizan al reconectar; las lecturas sirven desde caché IndexedDB — sin modificar ningún módulo existente.

**Architecture:** Un wrapper Proxy alrededor del cliente Supabase intercepta todas las llamadas `.from()`. Cuando offline, las escrituras van a `offlineQueue` (localStorage) y las lecturas sirven de `readCache` (IndexedDB). Al reconectar, `useNetworkStatus` vacía la cola automáticamente. Solo `src/supabase.js` y `src/App.js` se modifican.

**Tech Stack:** React, localStorage (cola escrituras), IndexedDB via `idb` npm package, ES6 Proxy, `window.online/offline` events.

---

## Archivos

| Acción | Archivo |
|--------|---------|
| Crear | `src/lib/offlineQueue.js` |
| Crear | `src/lib/readCache.js` |
| Crear | `src/lib/supabaseOffline.js` |
| Crear | `src/hooks/useNetworkStatus.js` |
| Crear | `src/components/OfflineBanner.js` |
| Modificar | `src/supabase.js` |
| Modificar | `src/App.js` |

---

## Task 1: Instalar `idb` + crear `src/lib/offlineQueue.js`

**Files:**
- Create: `src/lib/offlineQueue.js`

- [ ] **Step 1: Instalar idb**

```bash
npm install idb
```

Expected: `idb` aparece en `package.json` dependencies.

- [ ] **Step 2: Crear `src/lib/offlineQueue.js`**

```js
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
```

- [ ] **Step 3: Verificación manual**

Abre DevTools → Console y ejecuta:
```js
import('/src/lib/offlineQueue.js').then(m => {
  m.enqueue({ table: 'test', operation: 'insert', data: { x: 1 }, filters: {} });
  console.log(m.getQueue()); // debe mostrar 1 item
  console.log(m.getTotalCount()); // 1
});
```
Y en Application → Local Storage: debe aparecer `candelaria_offline_queue` con 1 item.

- [ ] **Step 4: Commit**

```bash
git add src/lib/offlineQueue.js package.json package-lock.json
git commit -m "feat: instalar idb y crear offlineQueue localStorage"
```

---

## Task 2: Crear `src/lib/readCache.js`

**Files:**
- Create: `src/lib/readCache.js`

- [ ] **Step 1: Crear el archivo**

```js
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
```

- [ ] **Step 2: Verificación manual**

En DevTools Console:
```js
// Simula guardar y leer del caché
const { set, get, makeKey } = await import('/src/lib/readCache.js');
await set(makeKey('test_table', {}), [{ id: 1, name: 'test' }]);
const cached = await get(makeKey('test_table', {}));
console.log(cached); // { data: [{id:1, name:'test'}], stale: false }
```
En Application → IndexedDB → candelaria_cache → queries: debe aparecer el registro.

- [ ] **Step 3: Commit**

```bash
git add src/lib/readCache.js
git commit -m "feat: readCache IndexedDB con TTL 8 horas"
```

---

## Task 3: Crear `src/lib/supabaseOffline.js`

**Files:**
- Create: `src/lib/supabaseOffline.js`

Este es el wrapper Proxy. Intercepta `.from()` en el cliente real. Cuando se llama `await` en una query, decide si ejecutar en Supabase o redirigir a cola/caché.

- [ ] **Step 1: Crear el archivo**

```js
import * as queue from './offlineQueue';
import * as cache from './readCache';

// Estado de conexión sincronizado (no React — módulo puro)
let _online = navigator.onLine;
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
        // Si el resultado es otro builder (encadenamiento), proxearlo también
        if (result && typeof result === 'object' && result !== t && typeof result.then === 'function') {
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
    const result = await realBuilder;
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
    const cached = await cache.get(key);
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
```

- [ ] **Step 2: Verificación rápida (sin correr la app)**

Revisar que el archivo no tiene errores de sintaxis:
```bash
node --input-type=module < src/lib/supabaseOffline.js 2>&1 | head -5
```
Expected: sin errores (o solo warnings de import que no se pueden resolver en Node sin bundle).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabaseOffline.js
git commit -m "feat: wrapper supabaseOffline Proxy - intercept reads/writes"
```

---

## Task 4: Modificar `src/supabase.js`

**Files:**
- Modify: `src/supabase.js`

- [ ] **Step 1: Reemplazar el contenido completo de `src/supabase.js`**

Archivo actual:
```js
import { createClient } from '@supabase/supabase-js';

    const supabaseUrl = 'https://cfrcdtxkdomwlnqnzgvb.supabase.co';
    const supabaseKey = 'sb_publishable_R43VL--d2q7HZ6uLKvhqag_PPUyR32J';

    export const supabase = createClient(supabaseUrl, supabaseKey);
```

Reemplazar por:
```js
import { createClient } from '@supabase/supabase-js';
import { createOfflineClient } from './lib/supabaseOffline';

const supabaseUrl = 'https://cfrcdtxkdomwlnqnzgvb.supabase.co';
const supabaseKey = 'sb_publishable_R43VL--d2q7HZ6uLKvhqag_PPUyR32J';

export const supabaseReal = createClient(supabaseUrl, supabaseKey);
export const supabase     = createOfflineClient(supabaseReal);
```

- [ ] **Step 2: Verificar que la app compila**

```bash
npm run build 2>&1 | tail -10
```

Expected: `The build folder is ready to be deployed.` sin errores. Si hay errores de TypeScript/lint sobre `supabaseReal` no exportado antes, son warnings ignorables.

- [ ] **Step 3: Verificar manualmente en el navegador**

```
npm start
```

1. Abre la app, inicia sesión normalmente → debe funcionar igual que antes
2. Abre DevTools → Network → desactiva "Online" en el throttling → navega a cualquier módulo → debe ver datos del caché (primera vez puede estar vacío si no se había cargado antes)
3. Reactiva "Online" → debe seguir funcionando

- [ ] **Step 4: Commit**

```bash
git add src/supabase.js
git commit -m "feat: exportar supabase como cliente offline-aware"
```

---

## Task 5: Crear `src/hooks/useNetworkStatus.js`

**Files:**
- Create: `src/hooks/useNetworkStatus.js`

Este hook detecta cambios de conexión, mantiene el conteo de la cola, y ejecuta el sync automático al reconectar. Usa `supabaseReal` (no el wrapper) para ejecutar las operaciones encoladas.

- [ ] **Step 1: Crear el archivo**

```js
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseReal } from '../supabase';
import * as offlineQueue from '../lib/offlineQueue';

export function useNetworkStatus() {
  const [isOnline,    setIsOnline]    = useState(navigator.onLine);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useNetworkStatus.js
git commit -m "feat: hook useNetworkStatus con sync automatico al reconectar"
```

---

## Task 6: Crear `src/components/OfflineBanner.js`

**Files:**
- Create: `src/components/OfflineBanner.js`

Banner fijo en la parte superior. Tres estados: offline con cola, sincronizando, online (se oculta sola). Panel de errores debajo cuando hay fallos.

- [ ] **Step 1: Crear el archivo**

```js
import React, { useState } from 'react';

const MODULE_META = {
  produccion_inyeccion:      { label: 'Producción',  warn: 'Verifica inventario MP — posible desface',          link: 'inventario'   },
  produccion_diaria:         { label: 'Producción',  warn: 'Verifica inventario MP — posible desface',          link: 'inventario'   },
  lotes_maduracion:          { label: 'Maduración',  warn: 'Verifica stock de lotes',                           link: 'inventario'   },
  inventario_mp:             { label: 'Inventario',  warn: 'Stock puede estar incorrecto',                      link: 'inventario'   },
  inventario_movimientos:    { label: 'Inventario',  warn: 'Stock puede estar incorrecto',                      link: 'inventario'   },
  facturas:                  { label: 'Facturación', warn: 'Factura no emitida al SRI — re-emitir manualmente', link: 'facturacion'  },
  facturas_detalle:          { label: 'Facturación', warn: 'Factura no emitida al SRI — re-emitir manualmente', link: 'facturacion'  },
  compras:                   { label: 'Compras',     warn: 'Ingreso de MP puede no haberse registrado',         link: 'compras'      },
  compras_detalle:           { label: 'Compras',     warn: 'Ingreso de MP puede no haberse registrado',         link: 'compras'      },
  nomina:                    { label: 'RRHH',        warn: 'Sin riesgo inmediato',                              link: null           },
  empleados:                 { label: 'RRHH',        warn: 'Sin riesgo inmediato',                              link: null           },
};

function getMeta(table) {
  return MODULE_META[table] || { label: table, warn: null, link: null };
}

export default function OfflineBanner({
  isOnline, queueCount, syncErrors, isSyncing, lastSynced,
  onRetry, onDiscard, onNavigate,
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Mostrar mensaje de éxito brevemente al sincronizar
  React.useEffect(() => {
    if (lastSynced) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [lastSynced]);

  // No mostrar nada si está online, no hay cola, no hay errores, ni éxito reciente
  if (isOnline && queueCount === 0 && syncErrors.length === 0 && !showSuccess) return null;

  const bgColor = !isOnline
    ? '#991b1b'           // rojo — offline
    : isSyncing
      ? '#92400e'         // amarillo — sincronizando
      : syncErrors.length > 0
        ? '#7c2d12'       // naranja oscuro — errores
        : '#14532d';      // verde — ok

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, fontFamily: 'Arial, sans-serif' }}>

      {/* ── Barra principal ────────────────────────────── */}
      <div style={{
        background: bgColor, color: 'white',
        padding: '8px 16px', fontSize: '13px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>
          {!isOnline && `🔴 Sin conexión${queueCount > 0 ? ` · ${queueCount} operación${queueCount > 1 ? 'es' : ''} pendiente${queueCount > 1 ? 's' : ''}` : ''}`}
          {isOnline && isSyncing && `🟡 Sincronizando...`}
          {isOnline && !isSyncing && syncErrors.length > 0 && `⚠️ ${syncErrors.length} error${syncErrors.length > 1 ? 'es' : ''} al sincronizar`}
          {isOnline && !isSyncing && syncErrors.length === 0 && showSuccess && `🟢 Sincronizado · ${lastSynced?.count} operación${lastSynced?.count > 1 ? 'es' : ''} enviada${lastSynced?.count > 1 ? 's' : ''}`}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {syncErrors.length > 0 && (
            <button onClick={() => setExpanded(e => !e)} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
              borderRadius: '6px', padding: '2px 10px', cursor: 'pointer', fontSize: '12px',
            }}>
              {expanded ? 'Ocultar' : 'Ver errores'}
            </button>
          )}
        </div>
      </div>

      {/* ── Panel de errores ────────────────────────────── */}
      {expanded && syncErrors.length > 0 && (
        <div style={{
          background: '#1c1917', borderBottom: '1px solid #44403c',
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          {syncErrors.map(item => {
            const meta = getMeta(item.table);
            return (
              <div key={item.id} style={{
                background: '#292524', borderRadius: '8px', padding: '10px 12px',
                border: '1px solid #57534e', fontSize: '12px', color: '#e7e5e4',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#fb923c' }}>❌ {meta.label}</span>
                    <span style={{ color: '#a8a29e', marginLeft: '8px' }}>
                      {item.operation} · {new Date(item.timestamp).toLocaleTimeString('es-EC')}
                    </span>
                  </div>
                  <button onClick={() => onDiscard(item.id)} style={{
                    background: 'none', border: 'none', color: '#a8a29e',
                    cursor: 'pointer', fontSize: '16px', lineHeight: 1,
                  }} title="Descartar">×</button>
                </div>

                <div style={{ color: '#f87171', fontSize: '11px', marginBottom: '6px' }}>
                  {item.error}
                </div>

                {meta.warn && (
                  <div style={{ color: '#fbbf24', fontSize: '11px', marginBottom: '8px' }}>
                    ⚠️ {meta.warn}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => onRetry(item.id)} style={{
                    background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)',
                    color: '#60a5fa', borderRadius: '6px', padding: '3px 10px',
                    cursor: 'pointer', fontSize: '11px',
                  }}>🔁 Reintentar</button>

                  {meta.link && onNavigate && (
                    <button onClick={() => onNavigate(meta.link)} style={{
                      background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                      color: '#fbbf24', borderRadius: '6px', padding: '3px 10px',
                      cursor: 'pointer', fontSize: '11px',
                    }}>📦 Ir a {meta.label}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/OfflineBanner.js
git commit -m "feat: OfflineBanner con panel de errores por modulo"
```

---

## Task 7: Modificar `src/App.js`

**Files:**
- Modify: `src/App.js`

Tres cambios: importar el hook y el banner, montarlo en el render, y agregar el guard `beforeunload`.

- [ ] **Step 1: Agregar imports**

Localizar en `src/App.js` el bloque de imports de hooks (cerca de la línea 43):
```js
import { useAuth }           from './hooks/useAuth';
import { verificarDispositivo } from './hooks/useDeviceAuth';
import DispositivoBloqueado      from './components/DispositivoBloqueado';
import { usePresence }       from './hooks/usePresence';
```

Agregar después:
```js
import { useNetworkStatus }  from './hooks/useNetworkStatus';
import OfflineBanner         from './components/OfflineBanner';
```

- [ ] **Step 2: Instanciar `useNetworkStatus` en el componente App**

Localizar en el body del componente la línea:
```js
  const { presentes: presentesRaw } = usePresence(user, userRol, pantalla);
```

Agregar justo debajo:
```js
  const {
    isOnline, queueCount, syncErrors, isSyncing, lastSynced,
    syncNow, retryItem, discardItem,
  } = useNetworkStatus();
```

- [ ] **Step 3: Agregar beforeunload guard**

Localizar el `useEffect` de `checkSession` (cerca de línea 274):
```js
  useEffect(() => {
    checkSession(async (authUser, authRol) => {
```

Agregar ANTES de ese useEffect (con línea en blanco):
```js
  useEffect(() => {
    const handler = (e) => {
      if (queueCount > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [queueCount]);

```

- [ ] **Step 4: Agregar `<OfflineBanner>` en el render**

Localizar en el render la sección que empieza con:
```js
  if (dispositivoEstado === 'pendiente' || dispositivoEstado === 'rechazado') {
```

Agregar ANTES de esa línea (con línea en blanco):
```js
  // El banner se monta como fragmento envolvente en cada pantalla
  // Para evitar duplicar en todos los returns, usamos un helper
  const banner = (
    <OfflineBanner
      isOnline={isOnline}
      queueCount={queueCount}
      syncErrors={syncErrors}
      isSyncing={isSyncing}
      lastSynced={lastSynced}
      onRetry={retryItem}
      onDiscard={discardItem}
      onNavigate={(destino) => navegarA(destino)}
    />
  );

```

- [ ] **Step 5: Agregar `{banner}` a los renders principales**

El render de `menuPrincipal` y el render de `login` necesitan mostrar el banner. Localizar:

```js
  if (pantalla === 'login') return (
    <LoginScreen
```

Reemplazar por:
```js
  if (pantalla === 'login') return (
    <>
      {banner}
      <LoginScreen
        email={email}       setEmail={setEmail}
        password={password} setPassword={setPassword}
        loading={loading}
        login={() => login(async (authUser, authRol) => {
          const estado = await verificarDispositivo(authUser.id, authRol?.rol);
          if (estado === 'aprobado') {
            await cargarTodo();
            setPantalla('menuPrincipal');
          } else {
            setDispositivoUser(authUser);
            setDispositivoRol(authRol);
            setDispositivoEstado(estado);
          }
        })}
      />
    </>
  );
```

Y localizar donde arranca `if (pantalla === 'menuPrincipal') return (`:
```js
  if (pantalla === 'menuPrincipal') return (
    <>
      <MenuPrincipal
```

Agregar `{banner}` como primer hijo del Fragment (si ya hay un `<>`, agregar dentro):
```js
  if (pantalla === 'menuPrincipal') return (
    <>
      {banner}
      <MenuPrincipal
```

- [ ] **Step 6: Verificar build**

```bash
npm run build 2>&1 | tail -10
```

Expected: `The build folder is ready to be deployed.` sin errores de compilación.

- [ ] **Step 7: Verificar manualmente en el navegador**

```bash
npm start
```

1. Inicia sesión → banner no debe aparecer (online, cola vacía)
2. En DevTools → Network → "Offline" → navega a cualquier módulo → debe aparecer banner 🔴
3. Realiza alguna operación (ej. busca algo, cambia un dato) → banner debe mostrar "1 operación pendiente"
4. Vuelve a "Online" → banner debe cambiar a 🟡 Sincronizando... → luego 🟢 Sincronizado
5. Intenta cerrar el tab con cola pendiente → debe aparecer diálogo del browser

- [ ] **Step 8: Commit**

```bash
git add src/App.js
git commit -m "feat: integrar OfflineBanner y beforeunload guard en App"
```

---

## Task 8: Build + Push + Deploy

- [ ] **Step 1: Build final**

```bash
npm run build 2>&1 | tail -5
```

Expected: `The build folder is ready to be deployed.`

- [ ] **Step 2: Push a main**

```bash
git push origin main
```

El commit message del merge/push debe incluir: `Gestion candelaria offline 21 02 2026`

- [ ] **Step 3: Confirmar deploy en Vercel**

Verificar en Vercel dashboard que el build pasa y la app está activa.
