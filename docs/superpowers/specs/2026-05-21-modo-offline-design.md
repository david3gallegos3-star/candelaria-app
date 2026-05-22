# Modo Offline (Option C) — Diseño

## Goal

Cuando se pierde la conexión a internet, la app sigue funcionando: las escrituras se guardan en una cola local y se sincronizan automáticamente al volver la conexión. Las lecturas sirven datos desde caché local. Cubre todos los módulos actuales y futuros sin modificar su código.

## Architecture

Un wrapper alrededor del cliente Supabase intercepta todas las llamadas. Cuando hay internet, ejecuta normal. Cuando no hay, las escrituras van a una cola en localStorage y las lecturas sirven desde IndexedDB. Al reconectar, la cola se vacía en orden. El resto de la app no cambia.

## Tech Stack

React, localStorage (cola de escrituras), IndexedDB via `idb` npm package (caché de lecturas), `window.online/offline` events.

---

## Archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Crear | `src/lib/offlineQueue.js` | CRUD de la cola en localStorage |
| Crear | `src/lib/readCache.js` | Caché de lecturas en IndexedDB |
| Crear | `src/lib/supabaseOffline.js` | Wrapper que intercepta todas las llamadas Supabase |
| Crear | `src/hooks/useNetworkStatus.js` | Detecta online/offline, expone estado y dispara sync |
| Crear | `src/components/OfflineBanner.js` | Banner de estado + panel de errores |
| Modificar | `src/supabase.js` | Exportar cliente wrapped en lugar del original |
| Modificar | `src/App.js` | Montar OfflineBanner + beforeunload guard |

---

## Cola de escrituras (localStorage)

Clave: `candelaria_offline_queue`

Estructura de cada item:
```json
{
  "id": "uuid-v4",
  "timestamp": "2026-05-21T16:30:00.000Z",
  "table": "produccion_inyeccion",
  "operation": "insert | update | delete | upsert",
  "data": { },
  "filters": { },
  "status": "pending | syncing | error",
  "error": null,
  "retries": 0
}
```

- `data`: payload del insert/update/upsert
- `filters`: condiciones del .eq() para update/delete
- `status`: pending → syncing → (eliminado si ok) | error si falla
- `retries`: número de intentos fallidos

---

## Caché de lecturas (IndexedDB)

Base de datos: `candelaria_cache`, store: `queries`

Clave: string con formato `tabla||filtros-ordenados` (hash determinístico)

Valor:
```json
{
  "key": "produccion_inyeccion||fecha=2026-05-21",
  "data": [ ],
  "cachedAt": "2026-05-21T16:00:00.000Z",
  "expiresAt": "2026-05-22T00:00:00.000Z"
}
```

- Expira a las 8 horas
- Se actualiza cada vez que la misma query se ejecuta online
- Si está expirado y se está offline → retorna datos igual con flag `stale: true`
- Si no existe caché para esa query offline → retorna `[]` con flag `noCache: true`

---

## supabaseOffline.js — Wrapper

Envuelve el cliente Supabase real. Expone la misma interfaz `.from(tabla)` con métodos `.select()`, `.insert()`, `.update()`, `.delete()`, `.upsert()`.

**Flujo de escritura:**
```
.insert() / .update() / .delete() / .upsert()
    ├── Online  → ejecuta en Supabase real → actualiza caché si aplica
    └── Offline → serializa a offlineQueue → retorna { data: payload, error: null }
```

**Flujo de lectura:**
```
.select()
    ├── Online  → ejecuta en Supabase real → guarda resultado en readCache → retorna data
    └── Offline → busca en readCache
                    ├── Hit (fresco)   → retorna { data, fromCache: true }
                    ├── Hit (expirado) → retorna { data, fromCache: true, stale: true }
                    └── Miss           → retorna { data: [], fromCache: true, noCache: true }
```

**Operaciones que NO se interceptan (siempre requieren internet):**
- `supabase.auth.*` — login, logout, checkSession
- `supabase.channel()` — realtime/presencia
- `supabase.storage.*` — archivos
- Llamadas a `/api/emitir-factura` (Dátil/SRI) — se quedan en cola y se ejecutan al reconectar

---

## useNetworkStatus.js

```js
// Retorna:
{
  isOnline: boolean,
  wasOffline: boolean,       // true si acaba de reconectar
  queueCount: number,        // operaciones pendientes
  syncErrors: SyncError[],   // errores del último sync
  syncNow: () => Promise     // forzar sync manual
}
```

Al detectar `online`:
1. Llama `syncQueue()` automáticamente
2. `syncQueue()` procesa items de la cola en orden de timestamp
3. Por cada item: ejecuta en Supabase real
4. Si éxito → elimina de la cola
5. Si error → marca como `error`, guarda mensaje, continúa con el siguiente
6. Al terminar → actualiza `syncErrors` con los que fallaron

---

## OfflineBanner.js

Banner fijo en la parte superior de la app (z-index alto). Tres estados:

**Offline con cola:**
```
🔴 Sin conexión · 3 operaciones pendientes · hace 12 min
```

**Sincronizando:**
```
🟡 Sincronizando... 2 de 3
```

**Online limpio (se oculta después de 5 seg):**
```
🟢 Conectado · todo sincronizado  [✕]
```

**Panel de errores** (aparece debajo del banner cuando `syncErrors.length > 0`):

Por cada error muestra:
- Módulo (derivado del `table` name)
- Operación y timestamp
- Mensaje de error
- Botones de acción según el módulo:

| tabla | Advertencia | Acciones |
|-------|-------------|----------|
| `produccion_*` | "Verifica inventario MP — posible desface" | [🔁 Reintentar] [📦 Ir a Inventario] |
| `inventario_*` | "Stock puede estar incorrecto" | [🔁 Reintentar] [📦 Ir a Inventario] |
| `facturas` / `facturas_detalle` | "Factura no emitida al SRI" | [🔁 Reintentar] [✏️ Ir a Facturación] |
| `compras` / `compras_detalle` | "Ingreso de MP puede no haberse registrado" | [🔁 Reintentar] [🛒 Ir a Compras] |
| `nomina` / `empleados` | Sin riesgo inmediato | [🔁 Reintentar] [🗑️ Descartar] |
| otros | — | [🔁 Reintentar] [🗑️ Descartar] |

"Reintentar" vuelve a poner el item en `pending` y llama `syncNow()`.
"Descartar" elimina el item de la cola con confirmación.
"Ver datos" muestra el JSON del payload en un modal.

---

## Advertencia al cerrar (beforeunload)

Se activa en `App.js` solo cuando `queueCount > 0`:

```js
window.addEventListener('beforeunload', (e) => {
  if (queueCount > 0) {
    e.preventDefault();
    e.returnValue = '';  // muestra diálogo nativo del navegador
  }
});
```

El navegador muestra su propio diálogo de confirmación. No se puede personalizar el texto (limitación del browser), pero el usuario ve la opción de cancelar o salir.

---

## Flujo completo — Registro de producción offline

1. Operario abre Producción → app carga datos, guarda en caché
2. Se cae internet → banner rojo aparece
3. Operario registra inyección 150kg → `supabaseOffline` detecta offline → guarda 2 items en cola:
   - Op.1: insert en `produccion_inyeccion`
   - Op.2: update en `inventario_mp` (descuento)
4. App responde "guardado" — operario no nota diferencia
5. Operario navega a Inventario → ve datos del caché (los últimos cargados online)
6. Vuelve el internet → sync automático:
   - Ejecuta Op.1 ✅
   - Ejecuta Op.2 ✅
   - Banner verde: "Sincronizado — 2 operaciones enviadas"
7. Si Op.2 falla → panel de errores: "Verifica inventario MP" con botón "Ir a Inventario"

---

## Lo que NO cambia

- Roles y permisos existentes
- Código de todos los módulos (Producción, Inventario, Facturación, etc.)
- Flujo de login y whitelist de dispositivos
- Cualquier tabla nueva que se agregue en el futuro queda cubierta automáticamente

---

## Dependencias npm

- `idb` — wrapper moderno para IndexedDB (4kb, sin otras dependencias)

---

## Lo que NO cubre este diseño

- Conflictos entre dos usuarios que editan el mismo registro offline (no aplica: mismo WiFi, se desconectan juntos)
- Facturación electrónica en tiempo real a Dátil/SRI (requiere internet — se encola y envía al reconectar)
- Modo offline de más de 8 horas (caché expira, lecturas de secciones no visitadas mostrarán "sin datos")
