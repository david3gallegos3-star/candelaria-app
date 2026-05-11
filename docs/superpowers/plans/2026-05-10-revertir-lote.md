# Revertir Lote — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar recuperación automática ante crashes del wizard de producción y botón manual para revertir lotes completados con devolución completa al inventario.

**Architecture:** Una función utilitaria centralizada `revertirLote` en `src/utils/revertirLote.js` maneja toda la lógica de revert. `TabMaduracion` la consume en tres contextos: (1) crash momento1 detectado al cargar, (2) crash momento2 detectado al cargar, (3) botón manual en historial con flag de seguridad.

**Tech Stack:** React, Supabase (PostgREST), tabla `auditoria` via `registrarAuditoria`.

---

## Archivos

| Archivo | Acción |
|---------|--------|
| `src/utils/revertirLote.js` | NUEVO — función núcleo + función revert momento2 parcial |
| `src/components/produccion/TabMaduracion.js` | Modificar: crash detection en cargar() + query updated_at + modal revert + botón en historial |

---

## Task 1: revertirLote.js — función núcleo

**Files:**
- Create: `src/utils/revertirLote.js`

- [ ] **Step 1: Crear el archivo con la función revertirLote**

```javascript
// src/utils/revertirLote.js
import { supabase } from '../supabase';
import { registrarAuditoria } from './helpers';

/**
 * Revierte completamente un lote de producción:
 * - Devuelve kg al inventario (carne + salmuera + rub + adicional + mermas)
 * - Elimina stock_lotes_inyectados, lotes_maduracion, produccion_inyeccion
 * - Registra en auditoría
 * Usa flag estado='revirtiendo' para recuperación ante crashes.
 */
export async function revertirLote(loteId, currentUser) {
  // 1. Marcar como 'revirtiendo' (flag de seguridad)
  await supabase.from('lotes_maduracion')
    .update({ estado: 'revirtiendo' })
    .eq('lote_id', loteId);

  // 2. Obtener datos del lote
  const { data: lote } = await supabase.from('lotes_maduracion')
    .select('id, produccion_id, fecha_entrada, lote_id')
    .eq('lote_id', loteId).maybeSingle();
  if (!lote) return;

  const produccionId = lote.produccion_id;

  // 3. Obtener produccion_inyeccion para saber la formula_salmuera y el nombre del producto
  const { data: produccion } = await supabase.from('produccion_inyeccion')
    .select('id, formula_salmuera, producto_nombre')
    .eq('id', produccionId).maybeSingle();

  // 4. Obtener materia_prima_id de la carne desde produccion_inyeccion_cortes
  const { data: cortes } = await supabase.from('produccion_inyeccion_cortes')
    .select('materia_prima_id, kg_carne_cruda, corte_nombre')
    .eq('produccion_id', produccionId);

  const carneEntry = (cortes || [])[0];
  const carneMpId  = carneEntry?.materia_prima_id;
  const kgCarne    = parseFloat(carneEntry?.kg_carne_cruda || 0);
  const nombreProducto = produccion?.producto_nombre || carneEntry?.corte_nombre || loteId;

  // 5. Revertir todos los movimientos del wizard (motivo contiene loteId)
  const { data: wizardMovs } = await supabase.from('inventario_movimientos')
    .select('id, materia_prima_id, tipo, kg')
    .ilike('motivo', `%Lote ${loteId}%`);

  for (const mov of (wizardMovs || [])) {
    const { data: inv } = await supabase.from('inventario_mp')
      .select('id, stock_kg').eq('materia_prima_id', mov.materia_prima_id).maybeSingle();
    if (inv) {
      const delta = mov.tipo === 'salida' ? mov.kg : -mov.kg; // invertir
      await supabase.from('inventario_mp')
        .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) + delta) })
        .eq('id', inv.id);
    }
  }

  // 6. Revertir movimiento de carne (motivo: "Producción — {nombre}")
  if (carneMpId && kgCarne > 0) {
    const { data: carneInv } = await supabase.from('inventario_mp')
      .select('id, stock_kg').eq('materia_prima_id', carneMpId).maybeSingle();
    if (carneInv) {
      await supabase.from('inventario_mp')
        .update({ stock_kg: (carneInv.stock_kg || 0) + kgCarne })
        .eq('id', carneInv.id);
    }
    // Eliminar movimiento de carne (fecha_entrada + materia_prima_id)
    await supabase.from('inventario_movimientos')
      .delete()
      .eq('materia_prima_id', carneMpId)
      .eq('tipo', 'salida')
      .eq('fecha', lote.fecha_entrada);
  }

  // 7. Eliminar movimientos del wizard
  await supabase.from('inventario_movimientos')
    .delete().ilike('motivo', `%Lote ${loteId}%`);

  // 8. Eliminar stock_lotes_inyectados
  await supabase.from('stock_lotes_inyectados')
    .delete().eq('lote_id', loteId);

  // 9. Eliminar lotes_maduracion
  await supabase.from('lotes_maduracion')
    .delete().eq('lote_id', loteId);

  // 10. Eliminar produccion_inyeccion_cortes y produccion_inyeccion
  if (produccionId) {
    await supabase.from('produccion_inyeccion_cortes')
      .delete().eq('produccion_id', produccionId);
    await supabase.from('produccion_inyeccion')
      .delete().eq('id', produccionId);
  }

  // 11. Registrar en auditoría
  await registrarAuditoria({
    tipo:            'lote_revertido',
    usuario_nombre:  currentUser?.email || 'sistema',
    user_id:         currentUser?.id    || null,
    producto_nombre: nombreProducto,
    campo_modificado: 'lote',
    valor_antes:     `${kgCarne.toFixed(3)} kg — Lote ${loteId}`,
    valor_despues:   'revertido',
    mensaje:         `Lote ${loteId} revertido por ${currentUser?.email || 'sistema'}`,
  });
}

/**
 * Revierte solo los pasos de momento2 de un lote (crash post-pesaje).
 * Mantiene carne y salmuera de momento1.
 * Resetea el lote a estado='activo' para reintentar desde pesaje.
 */
export async function revertirMomento2(loteId, formulaSalmuera) {
  // 1. Obtener todos los movimientos del lote
  const { data: allMovs } = await supabase.from('inventario_movimientos')
    .select('id, materia_prima_id, tipo, kg, motivo')
    .ilike('motivo', `%Lote ${loteId}%`);

  // 2. Filtrar solo momento2 (excluir movimientos de salmuera momento1)
  const salLower = (formulaSalmuera || '').toLowerCase();
  const momento2Movs = (allMovs || []).filter(m =>
    !salLower || !m.motivo.toLowerCase().includes(salLower)
  );

  // 3. Revertir movimientos de momento2 en inventario_mp
  for (const mov of momento2Movs) {
    const { data: inv } = await supabase.from('inventario_mp')
      .select('id, stock_kg').eq('materia_prima_id', mov.materia_prima_id).maybeSingle();
    if (inv) {
      const delta = mov.tipo === 'salida' ? mov.kg : -mov.kg;
      await supabase.from('inventario_mp')
        .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) + delta) })
        .eq('id', inv.id);
    }
  }

  // 4. Eliminar movimientos de momento2
  for (const mov of momento2Movs) {
    await supabase.from('inventario_movimientos').delete().eq('id', mov.id);
  }

  // 5. Limpiar pasos de momento2 en bloques_resultado (mantener solo momento1)
  const { data: lote } = await supabase.from('lotes_maduracion')
    .select('bloques_resultado').eq('lote_id', loteId).maybeSingle();

  const pasosM1 = (lote?.bloques_resultado?.pasos || []).filter(p =>
    ['merma', 'inyeccion'].includes(p.tipo)
  );
  await supabase.from('lotes_maduracion').update({
    estado: 'activo',
    bloques_resultado: { momento1: true, pasos: pasosM1 },
  }).eq('lote_id', loteId);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/revertirLote.js
git commit -m "feat: revertirLote y revertirMomento2 — funciones nucleo"
```

---

## Task 2: TabMaduracion — updated_at en query historial + import

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

### Contexto
El historial query (línea ~140) no incluye `updated_at`. Lo necesitamos para calcular si el lote fue completado hace menos de 24h.

- [ ] **Step 1: Agregar import de revertirLote al inicio del archivo**

Busca la línea `import { crearNotificacion } from '../../utils/helpers';` y agrega debajo:

```javascript
import { revertirLote, revertirMomento2 } from '../../utils/revertirLote';
```

- [ ] **Step 2: Agregar updated_at al select del historial**

Busca el select del historial (línea ~140, `eq('estado', 'completado')`). La línea select dice:
```javascript
.select(`*, lotes_maduracion_cortes(*),
  produccion_inyeccion ( formula_salmuera, ...
```

Cambia `*` por `*, updated_at` — en Supabase `*` ya incluye `updated_at`, pero necesitamos asegurar que esté en el select del activos también para la detección de crashes. Agrega `updated_at` explícitamente:

```javascript
supabase.from('lotes_maduracion')
  .select(`id, lote_id, estado, fecha_entrada, fecha_salida, kg_inicial, bloques_resultado, produccion_id, updated_at,
    lotes_maduracion_cortes(*),
    produccion_inyeccion ( formula_salmuera, porcentaje_inyeccion, kg_carne_total, kg_salmuera_requerida,
      produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_carne_limpia, kg_salmuera_asignada, costo_carne, costo_salmuera_asignado, costo_final_kg )
    )`)
  .eq('estado', 'completado')
  .order('fecha_entrada', { ascending: false })
  .limit(30),
```

Hacer el mismo cambio en el select de activos (línea ~132) para la crash detection:

```javascript
supabase.from('lotes_maduracion')
  .select(`id, lote_id, estado, fecha_entrada, fecha_salida, kg_inicial, bloques_resultado, produccion_id, updated_at,
    lotes_maduracion_cortes(*),
    produccion_inyeccion ( formula_salmuera, porcentaje_inyeccion, kg_carne_total, kg_salmuera_requerida,
      produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_carne_limpia, kg_salmuera_asignada, costo_carne, costo_salmuera_asignado, costo_final_kg )
    )`)
  .neq('estado', 'completado')
  .order('fecha_entrada', { ascending: true }),
```

- [ ] **Step 3: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "TabMaduracion: updated_at en queries + import revertirLote"
```

---

## Task 3: TabMaduracion — crash detection en cargar()

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

### Contexto
En `cargar()` (línea ~130), después de obtener `activos` y `completados`, agregar detección de 3 casos: flag 'revirtiendo', crash momento1, crash momento2.

- [ ] **Step 1: Agregar estado para toasts de recovery**

Busca los useState al inicio del componente y agrega:

```javascript
const [recoveryMsg, setRecoveryMsg] = useState('');
```

- [ ] **Step 2: Agregar crash detection al final de cargar()**

Después de `setHistorial(completados || []);` y antes de `setCargando(false);`, agregar:

```javascript
    // ── Crash recovery ────────────────────────────────────────────
    // Caso 0: lote con flag 'revirtiendo' (revert interrumpido por crash)
    const { data: revirtiendo } = await supabase.from('lotes_maduracion')
      .select('lote_id').eq('estado', 'revirtiendo').limit(5);
    for (const r of (revirtiendo || [])) {
      await revertirLote(r.lote_id, currentUser);
      setRecoveryMsg('⚠️ Se completó un revert interrumpido');
    }

    // Caso 1: crash momento1 — activo + bloques_resultado IS NULL + tiene bloques config
    for (const lote of (activos || [])) {
      if (lote.bloques_resultado !== null) continue;
      if (lote.estado !== 'activo') continue;
      // Verificar si el producto tiene bloques configurados
      const formulaSal = (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
      const tieneBloques = horneadoCfgs.some(hc =>
        (hc.config?.formula_salmuera || '').toLowerCase() === formulaSal &&
        (hc.config?.bloques || []).some(b => b.activo)
      );
      if (!tieneBloques) continue; // lote válido sin bloques
      // Crash detectado → revertir completo
      await revertirLote(lote.lote_id, currentUser);
      setRecoveryMsg('⚠️ Se limpió 1 lote incompleto');
    }

    // Caso 2: crash momento2 — completado + sin stock_lotes_inyectados
    for (const lote of (completados || [])) {
      const { count } = await supabase.from('stock_lotes_inyectados')
        .select('id', { count: 'exact', head: true }).eq('lote_id', lote.lote_id);
      if ((count || 0) > 0) continue; // tiene stock → OK
      const formulaSal = lote.produccion_inyeccion?.formula_salmuera || '';
      await revertirMomento2(lote.lote_id, formulaSal);
      setRecoveryMsg('⚠️ 1 lote retomado — continúa el registro de pesaje');
    }
    // ─────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Mostrar recoveryMsg como toast**

Busca donde se muestra `exito` (el toast de éxito verde) en el JSX y agrega justo después:

```jsx
{recoveryMsg && (
  <div style={{
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    background: '#f39c12', color: 'white', padding: '12px 20px',
    borderRadius: 10, fontWeight: 'bold', fontSize: 13,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
  }}>
    {recoveryMsg}
  </div>
)}
```

Y en el useEffect de cargar, limpiar el mensaje después de 5 segundos:

```javascript
useEffect(() => {
  if (!recoveryMsg) return;
  const t = setTimeout(() => setRecoveryMsg(''), 5000);
  return () => clearTimeout(t);
}, [recoveryMsg]);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "TabMaduracion: crash recovery momento1 y momento2 en cargar()"
```

---

## Task 4: TabMaduracion — botón Revertir en historial + modal confirmación

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

### Contexto
Agregar estado para modal de confirmación y el botón "Revertir" en cada lote del historial.

- [ ] **Step 1: Agregar estados para modal revert**

Junto a los otros useState, agregar:

```javascript
const [modalRevertir,   setModalRevertir]   = useState(null); // lote a revertir
const [revirtiendo,     setRevirtiendo]     = useState(false);
const [errorRevertir,   setErrorRevertir]   = useState('');
```

- [ ] **Step 2: Agregar función confirmarRevertir**

Después de la función `abrirPesaje`, agregar:

```javascript
async function confirmarRevertir() {
  if (!modalRevertir) return;
  setRevirtiendo(true);
  setErrorRevertir('');
  try {
    await revertirLote(modalRevertir.lote_id, currentUser);
    setModalRevertir(null);
    setExito('✅ Lote revertido correctamente');
    setTimeout(() => setExito(''), 6000);
    await cargar();
  } catch (e) {
    setErrorRevertir('Error al revertir: ' + e.message);
  }
  setRevirtiendo(false);
}
```

- [ ] **Step 3: Agregar botón Revertir en cada fila del historial**

En el `historial.map(lote => ...)` (línea ~1366), busca donde termina la información del lote (antes del cierre `</div>` del card) y agrega:

```jsx
{/* Botón revertir — solo si tiene permiso */}
{(() => {
  const esAdmin = currentUser?.rol === 'admin';
  const esProd  = currentUser?.rol === 'produccion';
  const hace24h = lote.updated_at
    ? (Date.now() - new Date(lote.updated_at).getTime()) < 24 * 60 * 60 * 1000
    : false;
  if (!esAdmin && !(esProd && hace24h)) return null;
  return (
    <button
      onClick={() => setModalRevertir(lote)}
      style={{
        background: 'none', border: '1.5px solid #e74c3c',
        color: '#e74c3c', borderRadius: 8, padding: '6px 14px',
        cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
        marginTop: 8,
      }}>
      🔄 Revertir
    </button>
  );
})()}
```

- [ ] **Step 4: Agregar modal de confirmación en el return JSX**

Antes del cierre del `</div>` principal del componente, agregar:

```jsx
{/* ── Modal confirmación revertir lote ── */}
{modalRevertir && (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
  }}>
    <div style={{
      background: 'white', borderRadius: 14, padding: 28,
      maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 8 }}>
        🔄 Revertir lote
      </div>
      <div style={{ fontSize: 14, color: '#555', marginBottom: 16 }}>
        ¿Revertir <b>Lote {modalRevertir.lote_id}</b>?
      </div>
      <div style={{ background: '#fdf2f2', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c0392b' }}>
        ⚠️ Se devolverán todos los kg al inventario.<br/>
        El lote desaparecerá del historial.<br/>
        <b>Esta acción no se puede deshacer.</b>
      </div>
      {errorRevertir && (
        <div style={{ color: '#e74c3c', fontSize: 13, marginBottom: 10 }}>{errorRevertir}</div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setModalRevertir(null); setErrorRevertir(''); }}
          disabled={revirtiendo}
          style={{ padding: '10px 20px', background: '#f0f2f5', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Cancelar
        </button>
        <button
          onClick={confirmarRevertir}
          disabled={revirtiendo}
          style={{
            padding: '10px 20px', background: revirtiendo ? '#aaa' : '#e74c3c',
            color: 'white', border: 'none', borderRadius: 8,
            cursor: revirtiendo ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold',
          }}>
          {revirtiendo ? 'Revirtiendo...' : 'Confirmar revertir'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "TabMaduracion: boton revertir lote en historial con modal confirmacion"
```

---

## Prueba manual al finalizar

1. **Crash momento1**: Registrar inyección → cerrar el navegador antes de completar el wizard → reabrir → debe desaparecer el lote y mostrar toast naranja
2. **Crash momento2**: Completar pesaje → cerrar antes de que termine el wizard momento2 → reabrir → lote debe volver a "LISTO PARA PESAJE"
3. **Revertir manual**: Completar una producción → ir a historial → admin ve el botón siempre, operario solo en 24h → confirmar → lote desaparece, kg vuelve al inventario, aparece en auditoría como `lote_revertido`
