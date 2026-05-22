# Anular Nota de Venta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir botón "🚫 Anular" en TabFacturas para notas de venta, con modal de confirmación simple, que marca la NV como anulada, cancela CxC si había crédito, y genera un asiento de reversa en el libro diario.

**Architecture:** Nueva función `revertirAsientoNotaVenta()` en `asientosContables.js` crea el contra-asiento (líneas invertidas respecto al asiento original). `TabFacturas` añade estado `modalAnularNV` + `anulandoNV`, función `anularNotaVenta()`, botón en la fila (solo para `tipo='nota_venta' && estado='autorizada'`), y modal sin campo de motivo (es documento interno, no SRI).

**Tech Stack:** React 18, Supabase (PostgREST), `insertarAsiento` (función privada existente en `asientosContables.js`).

---

## File Map

| Archivo | Cambio |
|---------|--------|
| `src/utils/asientosContables.js` | Exportar nueva función `revertirAsientoNotaVenta(factura)` |
| `src/components/facturacion/TabFacturas.js` | Import, 2 estados, función `anularNotaVenta()`, botón en fila, modal |

---

## Task 1: `asientosContables.js` — función `revertirAsientoNotaVenta()`

**Files:**
- Modify: `src/utils/asientosContables.js`

### Contexto

El asiento original de una nota de venta (`generarAsientoFactura(..., 'interno')`) es:
- DEBE: Caja General o CxC (según `metodo_pago`) por `total`
- HABER: Ventas Internas por `total`

El contra-asiento invierte exactamente esas líneas.

`insertarAsiento` es una función privada en el mismo archivo — `revertirAsientoNotaVenta` la llama internamente, igual que `generarAsientoFactura`.

- [ ] **Step 1: Añadir la función al final de `asientosContables.js` (antes del último cierre)**

Localizar el final del archivo (`src/utils/asientosContables.js`). Añadir después de la última función exportada:

```js
export async function revertirAsientoNotaVenta(factura) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const cuentaDebe = factura.metodo_pago === 'credito'
    ? cuentas.cxc_id
    : cuentas.caja_general_id;
  const descripcion = `Anulación NV - ${factura.numero} - ${factura.cliente_nombre}`;

  const lineas = [
    { cuenta_id: cuentas.ventas_internas_id, descripcion, debe: factura.total, haber: 0, orden: 0 },
    { cuenta_id: cuentaDebe,                 descripcion, debe: 0, haber: factura.total, orden: 1 },
  ];

  return insertarAsiento({
    fecha,
    descripcion,
    tipo: 'interno',
    origen: 'facturacion',
    origen_id: factura.id,
    lineas,
  });
}
```

- [ ] **Step 2: Verificar build**

```bash
cd c:\Users\david\candelaria-app && npm run build 2>&1 | grep -E "error|Error|Compiled"
```

Esperado: `Compiled successfully.`

- [ ] **Step 3: Commit**

```bash
git add src/utils/asientosContables.js
git commit -m "feat: revertirAsientoNotaVenta para contra-asiento al anular NV"
```

---

## Task 2: `TabFacturas.js` — estado, función, botón y modal

**Files:**
- Modify: `src/components/facturacion/TabFacturas.js`

### Step 1: Añadir import de `revertirAsientoNotaVenta`

- [ ] Localizar las líneas de import al inicio del archivo (líneas 5-8). Añadir después del último import:

```js
import { revertirAsientoNotaVenta } from '../../utils/asientosContables';
```

### Step 2: Añadir 2 estados nuevos

- [ ] Localizar el bloque de estados del componente (donde están `modalAnular`, `motivoAnul`, `anulando`). Añadir los dos nuevos estados después de `anulando`:

```js
const [modalAnularNV, setModalAnularNV] = useState(null);  // factura NV a anular
const [anulandoNV,    setAnulandoNV]    = useState(false);
```

### Step 3: Añadir función `anularNotaVenta()`

- [ ] Localizar la función `anularFactura()`. Añadir la nueva función `anularNotaVenta()` justo DESPUÉS del cierre de `anularFactura()`:

```js
async function anularNotaVenta(f) {
  setAnulandoNV(true);
  try {
    await supabase.from('facturas')
      .update({ estado: 'anulada' })
      .eq('id', f.id);

    await supabase.from('cuentas_cobrar')
      .update({ estado: 'anulada' })
      .eq('factura_id', f.id)
      .eq('estado', 'pendiente');

    await revertirAsientoNotaVenta({
      id:             f.id,
      numero:         f.numero,
      total:          parseFloat(f.total),
      cliente_nombre: f.cliente_nombre || 'CONSUMIDOR FINAL',
      metodo_pago:    f.forma_pago,
    });

    setModalAnularNV(null);
    mostrarExito('✅ Nota de venta anulada');
    cargarFacturas();
  } catch (e) {
    alert('Error al anular: ' + e.message);
  }
  setAnulandoNV(false);
}
```

### Step 4: Añadir botón "🚫 Anular" en la fila para nota_venta

- [ ] Localizar el bloque de botones de la fila. Actualmente hay:
  - Botón "👁 Ver"
  - Botón "📄 RIDE" (condicional)
  - Botón "📤 Emitir al SRI" (condicional, solo para borradores no-NV)
  - Label "⏳ Se enviará al conectarse" (condicional)
  - Botón "🚫 Anular" (condicional, solo para autorizadas no-NV)

Añadir un nuevo botón DESPUÉS del botón "🚫 Anular" existente (para facturas normales), que solo aparece para nota_venta autorizadas:

```jsx
{f.tipo === 'nota_venta' && f.estado === 'autorizada' && (
  <button
    onClick={() => setModalAnularNV(f)}
    style={{
      background: 'white', color: '#8e44ad',
      border: '1.5px solid #8e44ad',
      borderRadius: 7, padding: '6px 12px',
      cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
    }}>🚫 Anular NV</button>
)}
```

### Step 5: Añadir modal de confirmación para nota_venta

- [ ] Localizar el `{/* Modal anular */}` existente (que termina con `</div>` antes del cierre del `return`). Añadir el nuevo modal DESPUÉS del modal existente, antes del cierre `</div>` del return:

```jsx
{/* Modal anular nota de venta */}
{modalAnularNV && (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: 16
  }}>
    <div style={{
      background: 'white', borderRadius: 14,
      padding: '24px', maxWidth: 420, width: '100%',
      boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
      <div style={{
        fontWeight: 'bold', fontSize: '16px',
        color: '#8e44ad', marginBottom: 8
      }}>¿Anular nota de venta?</div>
      <div style={{ fontSize: '13px', color: '#555', marginBottom: 6 }}>
        {modalAnularNV.numero} — {modalAnularNV.cliente_nombre || 'CONSUMIDOR FINAL'}
      </div>
      <div style={{
        fontSize: '12px', color: '#888', marginBottom: 20
      }}>
        Se revertirá el asiento contable. Esta acción no se puede deshacer.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          onClick={() => setModalAnularNV(null)}
          disabled={anulandoNV}
          style={{
            background: '#f0f2f5', color: '#555', border: 'none',
            borderRadius: 8, padding: '10px 20px',
            cursor: anulandoNV ? 'not-allowed' : 'pointer', fontWeight: 'bold'
          }}>Cancelar</button>
        <button
          onClick={() => anularNotaVenta(modalAnularNV)}
          disabled={anulandoNV}
          style={{
            background: anulandoNV ? '#95a5a6' : '#8e44ad',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '10px 20px',
            cursor: anulandoNV ? 'not-allowed' : 'pointer', fontWeight: 'bold'
          }}>{anulandoNV ? '⏳ Anulando...' : '🚫 Sí, anular'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verificar build**

```bash
cd c:\Users\david\candelaria-app && npm run build 2>&1 | grep -E "error|Error|Compiled"
```

Esperado: `Compiled successfully.`

- [ ] **Step 7: Commit**

```bash
git add src/components/facturacion/TabFacturas.js
git commit -m "feat: botón y modal anular nota de venta con reversa de asiento"
```

---

## Task 3: Verificación manual

- [ ] **Step 1: Arrancar la app**

```bash
cd c:\Users\david\candelaria-app && npm start
```

- [ ] **Step 2: Crear una nota de venta de prueba**

1. Ir a Facturación → Nueva venta
2. Añadir un producto con cantidad > 0
3. Clic "📋 Nota de venta"
4. Verificar que aparece en TabFacturas con badge "📋 Nota de venta" y botón "🚫 Anular NV"

- [ ] **Step 3: Anular la nota de venta**

1. Clic en "🚫 Anular NV" → debe aparecer el modal morado de confirmación
2. Clic en "Cancelar" → modal debe cerrarse sin cambios
3. Clic en "🚫 Anular NV" de nuevo → clic en "🚫 Sí, anular"
4. Verificar: badge cambia a "❌ Anulada", botón "🚫 Anular NV" desaparece
5. Verificar en Supabase → tabla `facturas`: `estado='anulada'`
6. Verificar en Supabase → tabla `libro_diario`: existe un nuevo asiento con `descripcion` que empieza con "Anulación NV -"
