# Editar/Anular Compras Unificado — Implementation Design

**Goal:** Reemplazar los 3 formatos de edición distintos que existen hoy (modal "Editar cuenta" en Pagos, modal nuevo en Personales, ninguno en Compras pagadas al contado) por un único formulario de edición — igual al de "Nueva compra" — usable para cualquier compra (personal o empresa, contado o crédito), con sincronización automática hacia Libro Diario, inventario y cuentas por pagar, y una acción separada de Anular.

**Architecture:** Se extrae la UI de campos de `TabIngresoCompra.js` a un componente compartido `CompraForm.js` (presentacional + estado de campos, sin lógica de guardado). `TabIngresoCompra.js` lo envuelve para crear; un `EditarCompraModal.js` nuevo lo envuelve para editar, precargando `compras` + `compras_detalle`. Las reglas de quién puede editar/anular (ventana de 7 días, luego solo admin) y la sincronización con `libro_diario`/`inventario_mp`/`cuentas_pagar` viven en `EditarCompraModal.js` y en nuevas funciones de `asientosContables.js`.

**Tech Stack:** React 18, Supabase (PostgREST). Reutiliza `calcularResumenItems` (`utils/comprasCalc.js`), `insertarAsiento` (`utils/asientosContables.js`).

---

## 1. Alcance

**Entra:**
- Un único modal de edición (`EditarCompraModal.js`) usado desde 3 lugares: Personales, Pagos (crédito pendiente/vencida/pagada), Pagos (pagadas al contado).
- Una acción de Anular, separada de Editar, con sus propias reglas.
- Ventana de 7 días + rol admin para controlar quién puede editar/anular y cuándo.
- Sincronización automática: Libro Diario (asiento), inventario (solo empresa), cuentas_pagar (solo crédito).
- Extracción de `CompraForm.js` desde `TabIngresoCompra.js` para que Nueva Compra y Editar comparta exactamente los mismos campos.

**No entra (fuera de alcance):**
- Cambiar la forma de pago de una compra ya creada (crédito ↔ contado). Para eso: anular y crear de nuevo.
- Tocar el flujo de pagos parciales (`registrarPago` en `TabPagosUnificado.js`) — sigue igual.
- Revisar/cambiar el mecanismo de confirmación de asientos en `TabResumen.js` — solo se usa su `estado` para decidir la estrategia de sincronización.

---

## 2. `CompraForm.js` — componente de campos compartido

Se extrae de `TabIngresoCompra.js` todo el bloque de UI + estado de: proveedor, fecha, tiene factura / número / autorización SRI / fecha emisión / recordar / XML SRI, retención (IVA y fuente), items (empresa: materia_prima + cantidad_kg + precio_kg; personal: descripción + monto), descuento, notas. La forma de pago se muestra siempre pero solo es editable cuando `modo === 'nueva'`.

```jsx
// src/components/compras/CompraForm.js
export default function CompraForm({
  modo,              // 'nueva' | 'editar'
  esPersonal,        // boolean, fijo en modo editar (no se puede cambiar tipo al editar)
  valoresIniciales,  // null en 'nueva'; objeto precargado en 'editar'
  soloLecturaMontos, // true si hay pagos parciales que impiden tocar items (ver §6)
  proveedores, materiales,   // listas ya cargadas por el padre
  onChange,          // (estadoCompleto) => void — el padre lee el estado en cada cambio
  mobile,
}) { /* ...mismo JSX que hoy tiene TabIngresoCompra, con guards soloLecturaMontos... */ }
```

`TabIngresoCompra.js` pasa a `CompraForm` su estado actual y un `onChange` que actualiza ese mismo estado (sigue siendo el dueño del estado, solo delega el render). `EditarCompraModal.js` hace lo mismo pero parte de `valoresIniciales` cargados desde Supabase.

**Por qué este corte:** los 3 formatos actuales se desincronizaron porque cada pantalla copió y modificó su propia versión del formulario. Compartir el componente de campos hace estructuralmente imposible que vuelvan a divergir.

---

## 3. Reglas de permiso — ventana de 7 días + admin

```js
// src/utils/compraEditPermisos.js
export function puedeEditarCompra(compra, userRol) {
  const dias = (Date.now() - new Date(compra.created_at).getTime()) / 86400000;
  if (dias <= 7) return { permitido: true, soloAdmin: false };
  if (userRol?.rol === 'admin') return { permitido: true, soloAdmin: true };
  return { permitido: false, soloAdmin: true };
}
```

- `soloAdmin: true` se usa más adelante para forzar la estrategia "reversión + nuevo asiento" en Libro Diario aunque el asiento siga `provisional` (ver §4).
- Si `permitido: false`, el botón "Editar"/"Anular" no aparece (o aparece deshabilitado con tooltip "Solo un administrador puede editar compras de más de 7 días").
- Requiere que `compras.created_at` exista. Si la tabla no lo tiene hoy, se agrega por migración (ver §10) con `default now()` y backfill con la columna `fecha` para registros viejos.

---

## 4. Sincronización con Libro Diario

Nueva función en `asientosContables.js`:

```js
export async function sincronizarAsientoCompraEditada(compraActualizada, { forzarReversion }) {
  const { data: asientoExistente } = await supabase
    .from('libro_diario')
    .select('id, estado')
    .eq('origen', 'compras')
    .eq('origen_id', compraActualizada.id)
    .neq('estado', 'eliminado')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!asientoExistente) {
    return generarAsientoCompra(compraActualizada);
  }

  if (asientoExistente.estado === 'provisional' && !forzarReversion) {
    // Limpio: nadie lo confirmó, se reemplaza sin dejar rastro
    await supabase.from('libro_diario_detalle').delete().eq('asiento_id', asientoExistente.id);
    await supabase.from('libro_diario').delete().eq('id', asientoExistente.id);
    return generarAsientoCompra(compraActualizada);
  }

  // Confirmado, o ya pasaron los 7 días: reversión + nuevo, ambos provisional
  await revertirAsientoCompra(compraActualizada, asientoExistente.id);
  return generarAsientoCompra(compraActualizada);
}

export async function revertirAsientoCompra(compraOriginal, asientoId) {
  const { data: detalles } = await supabase
    .from('libro_diario_detalle')
    .select('cuenta_id, descripcion, debe, haber, orden')
    .eq('asiento_id', asientoId);

  const lineasInvertidas = (detalles || []).map((l, i) => ({
    cuenta_id: l.cuenta_id,
    descripcion: `Reversión — ${l.descripcion}`,
    debe: l.haber, haber: l.debe,
    orden: i,
  }));

  return insertarAsiento({
    fecha: new Date().toISOString().split('T')[0],
    descripcion: `Reversión por edición — Compra ${compraOriginal.proveedor_nombre}`,
    tipo: 'tributario',
    origen: 'compras',
    origen_id: compraOriginal.id,
    lineas: lineasInvertidas,
  });
}
```

`forzarReversion` se pasa como `true` cuando `puedeEditarCompra(...).soloAdmin === true` (pasaron los 7 días), aunque el asiento siga `provisional`.

**Ejemplo aplicado** (el que se le explicó a David): compra confirmada en $115 (DEBE Inventario 100 + DEBE IVA 15 / HABER Banco 115). Se edita a $138. Como está `confirmado`, se generan dos asientos nuevos `provisional`: reversión (HABER Inventario 100 + HABER IVA 15 / DEBE Banco 115) y el corregido (DEBE Inventario 120 + DEBE IVA 18 / HABER Banco 138). El original queda intacto para auditoría.

---

## 5. Sincronización con inventario (solo compras de empresa)

Por cada item de `compras_detalle` que cambió `cantidad_kg`:

```js
async function ajustarInventarioPorEdicion(itemOriginal, itemNuevo, contexto) {
  const delta = parseFloat(itemNuevo.cantidad_kg) - parseFloat(itemOriginal.cantidad_kg || 0);
  if (delta === 0) return;

  const { data: inv } = await supabase
    .from('inventario_mp')
    .select('id, stock_kg')
    .eq('materia_prima_id', itemNuevo.materia_prima_id)
    .single();

  const nuevoStock = parseFloat(inv?.stock_kg || 0) + delta;
  await supabase.from('inventario_mp')
    .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
    .eq('id', inv.id);

  await supabase.from('inventario_movimientos').insert({
    materia_prima_id: itemNuevo.materia_prima_id,
    nombre_mp: itemNuevo.mp_nombre,
    tipo: 'ajuste_edicion',
    kg: delta,
    motivo: `Ajuste por edición de compra — ${contexto.proveedor_nombre}`,
    usuario_nombre: contexto.usuario_nombre,
    user_id: contexto.user_id,
    fecha: new Date().toISOString().split('T')[0],
  });
}
```

Si `nuevoStock < 0`, se permite igual (mismo comportamiento que otros ajustes existentes en el sistema) pero se muestra una alerta no bloqueante: "⚠️ El stock de {mp_nombre} quedó en {x} kg — revisa si hay producción pendiente de ese lote."

Items nuevos agregados al editar: se tratan como `itemOriginal.cantidad_kg = 0` (delta = cantidad completa). Items eliminados al editar: `itemNuevo.cantidad_kg = 0` (delta negativo = se resta todo).

---

## 6. Sincronización con cuentas_pagar (crédito)

Al guardar la edición de una compra con `forma_pago === 'credito'`:

```js
const { data: cp } = await supabase.from('cuentas_pagar').select('monto_total, saldo_pendiente').eq('compra_id', compraId).single();
const pagadoHastaAhora = cp.monto_total - cp.saldo_pendiente;
const nuevoSaldo = nuevoTotal - pagadoHastaAhora;

await supabase.from('cuentas_pagar').update({
  monto_total: nuevoTotal,
  saldo_pendiente: nuevoSaldo,        // puede quedar negativo
  estado: nuevoSaldo <= 0.001 ? 'pagado' : (nuevoSaldo < cp.saldo_pendiente ? 'parcial' : 'pendiente'),
  updated_at: new Date().toISOString(),
}).eq('compra_id', compraId);
```

Si `nuevoSaldo < 0`, el modal de edición muestra, después de guardar: **"⚠️ Ya se pagó ${Math.abs(nuevoSaldo).toFixed(2)} de más con el monto corregido — el proveedor te queda debiendo."** No bloquea el guardado. Cómo se resuelve ese saldo a favor se cubre en §7.

Los items/montos de una compra de crédito **se pueden editar siempre**, tenga o no pagos parciales (decisión explícita de David — no hay bloqueo aquí, a diferencia de Anular).

---

## 7. Resolución de saldo a favor (sobrepago a proveedor)

Cuando una edición deja `cuentas_pagar.saldo_pendiente < 0`, ese saldo es **a nuestro favor** (el proveedor nos debe). El Libro Diario ya queda contablemente correcto en el momento de la edición — la cuenta CxP Proveedores neta ese saldo negativo automáticamente vía la reversión+nuevo de §4, sin asiento extra. Lo que falta es resolver ese saldo a nivel de `cuentas_pagar` (sub-ledger) y dejarlo visible hasta que se resuelva.

**Dónde se muestra:**
- `TabProveedores.js` — badge `💰 $X a favor` en la fila del proveedor (suma de sus `cuentas_pagar.saldo_pendiente < 0`).
- `TabIngresoCompra.js` — al seleccionar un proveedor con saldo a favor y `forma_pago = 'credito'`, aviso antes de guardar (ver aplicación automática más abajo).
- `TabPagosUnificado.js` — sección nueva "💰 Saldos a favor", separada de Pendientes/Vencidas/Pagadas, con el botón de devolución.

**Camino A — nos devuelven en efectivo/transferencia.** Botón "🏦 Registrar devolución" en la cuenta con saldo negativo → modal (monto precargado con `Math.abs(saldo_pendiente)`, forma de pago, fecha) → nueva función en `asientosContables.js`:

```js
export async function generarAsientoDevolucionProveedor(devolucion) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const cuentaDebe  = devolucion.forma_pago === 'efectivo' ? cuentas.caja_chica_id : cuentas.banco_id;
  const labelCuenta = devolucion.forma_pago === 'efectivo' ? 'Caja Chica' : 'Banco';
  const descripcionCab = `Devolución proveedor - ${devolucion.proveedor_nombre}`;

  const lineas = [
    { cuenta_id: cuentaDebe,     descripcion: `${labelCuenta} — devolución ${devolucion.proveedor_nombre}`, debe: devolucion.monto, haber: 0, orden: 0 },
    { cuenta_id: cuentas.cxp_id, descripcion: `CxP Proveedores — devolución ${devolucion.proveedor_nombre}`, debe: 0, haber: devolucion.monto, orden: 1 },
  ];

  return insertarAsiento({
    fecha: devolucion.fecha, descripcion: descripcionCab,
    tipo: 'tributario', origen: 'devoluciones_proveedor', origen_id: devolucion.cuenta_pagar_id,
    lineas,
  });
}
```

Al guardar: `cuentas_pagar.saldo_pendiente += monto` (sube hacia 0), e insertar en `pagos_compras` con `tipo: 'devolucion'` (columna nueva, default `'pago'` en filas existentes) para que quede en el historial de movimientos del proveedor junto a sus pagos normales.

**Camino B — se aplica como crédito a la próxima compra.** Sin botón, automático. En `guardarCompra()` de `TabIngresoCompra.js`, antes de insertar la nueva fila de `cuentas_pagar` cuando `formaPago === 'credito'`:

```js
const { data: saldosFavor } = await supabase
  .from('cuentas_pagar')
  .select('id, saldo_pendiente')
  .eq('proveedor_id', proveedorId)
  .lt('saldo_pendiente', 0);

const creditoDisponible = (saldosFavor || []).reduce((s, c) => s + Math.abs(c.saldo_pendiente), 0);
```

Si `creditoDisponible > 0`, se avisa antes de guardar: *"Este proveedor tiene $X a favor — se aplican a esta compra, tu saldo pendiente queda en $Y."* Al confirmar: la nueva `cuentas_pagar.saldo_pendiente = total - creditoDisponible` (puede seguir negativo si el crédito sobra, y se arrastra otra vez), y las filas viejas con saldo negativo pasan a `saldo_pendiente = 0` con nota `"Aplicado a compra del [fecha nueva]"`. **No genera asiento nuevo** — es la misma cuenta CxP Proveedores, solo se reparte distinto entre filas de `cuentas_pagar`.

---

## 8. Anular compra

Botón "🚫 Anular" junto a "✏️ Editar", sujeto a las mismas reglas de `puedeEditarCompra`. Condición extra: **bloqueado si la compra es a crédito y ya tiene algún pago registrado** (`saldo_pendiente < monto_total`). Para compras al contado o crédito sin pagos, anular:

```js
async function anularCompra(compra, currentUser, userRol) {
  await supabase.from('compras').update({ estado: 'anulada' }).eq('id', compra.id);

  if (compra.forma_pago === 'credito') {
    await supabase.from('cuentas_pagar').update({ estado: 'anulada' }).eq('compra_id', compra.id);
  }

  if (!compra.es_personal) {
    const { data: detalles } = await supabase.from('compras_detalle').select('*').eq('compra_id', compra.id);
    for (const item of detalles || []) {
      // mismo ajuste que §5 pero con cantidad_kg final = 0 (revierte todo el ingreso)
      await ajustarInventarioPorEdicion(item, { ...item, cantidad_kg: 0 }, {
        proveedor_nombre: compra.proveedor_nombre,
        usuario_nombre: userRol?.nombre || currentUser?.email || '',
        user_id: currentUser?.id,
      });
    }
  }

  await sincronizarAsientoCompraEditada(
    { ...compra, subtotal: 0, iva: 0, total: 0 },
    { forzarReversion: true }   // anular siempre deja rastro (reversión), nunca borra en seco
  );
}
```

Si está bloqueado por pagos parciales, el botón "Anular" se deshabilita con tooltip: "Esta compra ya tiene pagos registrados — usa Editar para corregir el monto."

---

## 9. `EditarCompraModal.js` — flujo

```jsx
export default function EditarCompraModal({ compraId, userRol, currentUser, onClose, onGuardado }) {
  // 1. Carga compra + compras_detalle + cuentas_pagar (si existe) por compraId
  // 2. const permiso = puedeEditarCompra(compra, userRol)
  // 3. Si !permiso.permitido → solo muestra detalle de lectura + mensaje de bloqueo
  // 4. Si permitido → <CompraForm modo="editar" valoresIniciales={...} onChange={setEstado} />
  //    + botones: Cancelar / 🚫 Anular (si aplica) / 💾 Guardar cambios
  // 5. guardar(): diff de items → ajustarInventarioPorEdicion por cada uno (si !es_personal)
  //               → update compras + replace compras_detalle
  //               → si credito: ajuste cuentas_pagar (§6)
  //               → sincronizarAsientoCompraEditada(compraActualizada, { forzarReversion: permiso.soloAdmin })
}
```

---

## 10. Migraciones SQL necesarias

```sql
-- Si compras no tiene created_at:
ALTER TABLE compras ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
UPDATE compras SET created_at = fecha::timestamptz WHERE created_at IS NULL;

-- estado 'anulada' ya es texto libre (compras.estado es text) — no requiere migración de tipo.

-- Para distinguir devoluciones de pagos normales en el historial del proveedor:
ALTER TABLE pagos_compras ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'pago';
```

---

## 11. Archivos a crear/modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/compras/CompraForm.js` | **Nuevo** — extraído de TabIngresoCompra.js |
| `src/components/compras/TabIngresoCompra.js` | Refactor: usa `<CompraForm modo="nueva">`, conserva lógica de guardado; agrega detección de saldo a favor (§7 camino B) |
| `src/components/compras/EditarCompraModal.js` | **Nuevo** — modal de edición/anulación unificado |
| `src/utils/compraEditPermisos.js` | **Nuevo** — `puedeEditarCompra()` |
| `src/utils/asientosContables.js` | + `sincronizarAsientoCompraEditada()`, `revertirAsientoCompra()`, `generarAsientoDevolucionProveedor()` |
| `src/components/compras/TabPersonalesCompras.js` | Reemplaza su modal propio por `<EditarCompraModal>` |
| `src/components/compras/TabPagosUnificado.js` | Reemplaza "Editar cuenta" por `<EditarCompraModal>`; agrega botón Editar en "Compras pagadas al contado"; agrega sección "💰 Saldos a favor" + modal de devolución |
| `src/components/compras/TabProveedores.js` | Agrega badge "💰 $X a favor" por proveedor |
| SQL (Supabase, manual) | `compras.created_at` si no existe; `pagos_compras.tipo` |

---

## 12. Lo que NO cambia

- `registrarPago()` / pagos parciales en `TabPagosUnificado.js` — intacto.
- El flujo de creación (`guardarCompra` en `TabIngresoCompra.js`) sigue igual, solo cambia de dónde saca el JSX de campos.
- `FacturasPersonales.js` (Talonario) y su link a Compras → Personales (recién implementado) no cambian — siguen abriendo `TabPersonalesCompras`, que ahora usa el modal unificado en vez del suyo propio.
- El mecanismo de confirmación de asientos en `TabResumen.js` no se toca — solo se lee su `estado`.
