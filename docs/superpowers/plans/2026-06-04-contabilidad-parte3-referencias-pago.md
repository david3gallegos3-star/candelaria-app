# Contabilidad Parte 3 — Referencias de Pago (Número de Transacción/Depósito)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un campo opcional de número de referencia/transacción/depósito en todos los módulos donde se pague por transferencia, depósito o cheque.

**Architecture:** Migración SQL agrega `referencia_pago text` a 4 tablas. Cada formulario muestra un input adicional cuando la forma de pago NO es efectivo ni crédito. El valor se guarda en la tabla y se muestra en listados.

**Tech Stack:** React, Supabase (PostgREST), SQL migrations.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260604_referencia_pago.sql` | Crear — agrega columna a 4 tablas |
| `src/components/facturacion/TabNuevaVenta.js` | Mostrar input referencia en ventas |
| `src/components/facturacion/TabCobrar.js` | Mostrar input referencia en cobros |
| `src/components/compras/TabIngresoCompra.js` | Mostrar input referencia en compras |
| `src/components/rrhh/TabNomina.js` | Mostrar input referencia al marcar pagado |

---

## Task 1: Migración SQL — columna referencia_pago en 4 tablas

**Archivo:** `supabase/migrations/20260604_referencia_pago.sql`

- [ ] **Paso 1: Crear el archivo de migración**

```sql
-- supabase/migrations/20260604_referencia_pago.sql
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE cobros   ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE compras  ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE nomina   ADD COLUMN IF NOT EXISTS referencia_pago text;
ALTER TABLE nomina   ADD COLUMN IF NOT EXISTS forma_pago text DEFAULT 'transferencia';
```

- [ ] **Paso 2: Ejecutar en Supabase SQL Editor**

Ir a Supabase → SQL Editor → pegar y ejecutar. Resultado esperado: `Success. No rows returned.`

- [ ] **Paso 3: Commit**

```bash
git add supabase/migrations/20260604_referencia_pago.sql
git commit -m "sql: agregar referencia_pago y forma_pago a facturas, cobros, compras, nomina"
```

---

## Task 2: TabNuevaVenta.js — referencia en ventas

**Archivo:** `src/components/facturacion/TabNuevaVenta.js`

Contexto: el archivo tiene un estado `formaPago` y un formulario de venta. Se necesita mostrar un input de referencia cuando `formaPago` es `transferencia`, `cheque` o `deposito`.

- [ ] **Paso 1: Agregar estado `referenciaPago`**

Buscar la línea donde están los estados del formulario de venta (cerca de `useState` de `formaPago`) y agregar:

```javascript
const [referenciaPago, setReferenciaPago] = useState('');
```

- [ ] **Paso 2: Resetear en `nuevaFactura()`**

En la función `nuevaFactura()` que resetea el formulario, agregar:
```javascript
setReferenciaPago('');
```

- [ ] **Paso 3: Mostrar el input en el formulario**

Buscar donde se renderiza el selector de forma de pago (`formaPago`) en el JSX y agregar DESPUÉS de ese bloque:

```javascript
{['transferencia', 'cheque', 'deposito'].includes(formaPago) && (
  <div style={{ marginTop: 8 }}>
    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
      Nº Transacción / Depósito (opcional)
    </label>
    <input
      type="text"
      value={referenciaPago}
      onChange={e => setReferenciaPago(e.target.value)}
      placeholder="Ej: 00123456"
      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
        border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
    />
  </div>
)}
```

- [ ] **Paso 4: Incluir en el insert de factura**

En las funciones `emitirFactura`, `emitirNotaVenta` y `guardarBorrador`, dentro del objeto que se inserta en `facturas`, agregar:
```javascript
referencia_pago: ['transferencia', 'cheque', 'deposito'].includes(formaPago) ? referenciaPago || null : null,
```

- [ ] **Paso 5: Commit**

```bash
git add src/components/facturacion/TabNuevaVenta.js
git commit -m "feat(facturacion): campo referencia pago en ventas por transferencia/cheque"
```

---

## Task 3: TabCobrar.js — referencia en cobros

**Archivo:** `src/components/facturacion/TabCobrar.js`

Contexto: tiene estado `formaCobro` (línea 30) y botones de forma de pago. Inserta en tabla `cobros` (línea 113).

- [ ] **Paso 1: Agregar estado `referenciaCobro`**

Después de la línea `const [formaCobro, setFormaCobro] = useState('efectivo');` (línea 30), agregar:

```javascript
const [referenciaCobro, setReferenciaCobro] = useState('');
```

- [ ] **Paso 2: Resetear al cerrar el cobro**

En la función que resetea después de registrar el cobro (buscar donde se llama `setFormaCobro('efectivo')`), agregar:
```javascript
setReferenciaCobro('');
```

- [ ] **Paso 3: Agregar input en el modal de cobro**

En el JSX del modal de cobro, después del bloque de botones de `formaCobro`, agregar:

```javascript
{['transferencia', 'cheque', 'deposito'].includes(formaCobro) && (
  <div style={{ marginTop: 8 }}>
    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
      Nº Transacción / Depósito (opcional)
    </label>
    <input
      type="text"
      value={referenciaCobro}
      onChange={e => setReferenciaCobro(e.target.value)}
      placeholder="Ej: 00123456"
      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
        border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
    />
  </div>
)}
```

- [ ] **Paso 4: Incluir en el insert de cobro**

Buscar el insert en `cobros` (cerca de línea 113) y agregar al objeto:
```javascript
referencia_pago: ['transferencia', 'cheque', 'deposito'].includes(formaCobro) ? referenciaCobro || null : null,
```

- [ ] **Paso 5: Commit**

```bash
git add src/components/facturacion/TabCobrar.js
git commit -m "feat(cobros): campo referencia pago en cobros por transferencia/cheque"
```

---

## Task 4: TabIngresoCompra.js — referencia en compras

**Archivo:** `src/components/compras/TabIngresoCompra.js`

Contexto: tiene estado `formaPago` (línea 46) y botones de forma de pago (línea 740). Inserta en `compras` (línea 122).

- [ ] **Paso 1: Agregar estado `referenciaPago`**

Después de `const [formaPago, setFormaPago] = useState('efectivo');` (línea 46), agregar:

```javascript
const [referenciaPago, setReferenciaPago] = useState('');
```

- [ ] **Paso 2: Resetear al completar la compra**

Buscar donde se resetea el formulario (cerca de línea 256 donde está `setFormaPago('efectivo')`) y agregar:
```javascript
setReferenciaPago('');
```

- [ ] **Paso 3: Agregar input después del selector de forma de pago**

Después del bloque de botones de `formaPago` (cerca de línea 740-749) y antes de la sección de crédito, agregar:

```javascript
{['transferencia', 'cheque', 'deposito'].includes(formaPago) && (
  <div style={{ marginTop: 10 }}>
    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
      Nº Transacción / Depósito (opcional)
    </label>
    <input
      type="text"
      value={referenciaPago}
      onChange={e => setReferenciaPago(e.target.value)}
      placeholder="Ej: 00123456"
      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
        border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
    />
  </div>
)}
```

- [ ] **Paso 4: Incluir en el insert de compra**

En el insert de `compras` (línea 122-156), agregar al objeto:
```javascript
referencia_pago: ['transferencia', 'cheque', 'deposito'].includes(formaPago) ? referenciaPago || null : null,
```

- [ ] **Paso 5: Commit**

```bash
git add src/components/compras/TabIngresoCompra.js
git commit -m "feat(compras): campo referencia pago en compras por transferencia/cheque"
```

---

## Task 5: TabNomina.js — referencia y forma de pago al marcar pagado

**Archivo:** `src/components/rrhh/TabNomina.js`

Contexto: la función `marcarPagado(id)` (línea 373) actualiza `nomina.estado` a `'pagado'` y llama `generarAsientoNomina`. Se necesita un mini-modal que pregunte la forma de pago y referencia antes de confirmar.

- [ ] **Paso 1: Agregar estado para el modal de pago**

Buscar el bloque de `useState` al inicio del componente y agregar:

```javascript
const [modalPago, setModalPago] = useState(null); // { id, formaPago, referencia }
```

- [ ] **Paso 2: Reemplazar `marcarPagado` para abrir el modal**

Reemplazar la función actual:
```javascript
async function marcarPagado(id) {
  await supabase.from('nomina').update({ estado: 'pagado', fecha_pago: now.toISOString().slice(0, 10) }).eq('id', id);
  const row = nomina.find(n => n.id === id);
  if (row) {
    generarAsientoNomina({
      id: row.id,
      periodo: row.periodo,
      total_sueldos: row.sueldo_prop || 0,
      total_iess_patronal: row.iess_patronal || 0,
      total_pagar: row.sueldo_neto || 0
    }).catch(console.error);
  }
  await cargar();
}
```

Por:
```javascript
function marcarPagado(id) {
  setModalPago({ id, formaPago: 'transferencia', referencia: '' });
}

async function confirmarPago() {
  if (!modalPago) return;
  const { id, formaPago, referencia } = modalPago;
  await supabase.from('nomina').update({
    estado: 'pagado',
    fecha_pago: now.toISOString().slice(0, 10),
    forma_pago: formaPago,
    referencia_pago: ['transferencia', 'cheque', 'deposito'].includes(formaPago) ? referencia || null : null,
  }).eq('id', id);
  const row = nomina.find(n => n.id === id);
  if (row) {
    generarAsientoNomina({
      id: row.id,
      periodo: row.periodo,
      total_sueldos: row.sueldo_prop || 0,
      total_iess_patronal: row.iess_patronal || 0,
      total_pagar: row.sueldo_neto || 0,
    }, formaPago).catch(console.error);
  }
  setModalPago(null);
  await cargar();
}
```

- [ ] **Paso 3: Agregar el modal JSX en el return del componente**

Agregar antes del cierre del return principal:

```javascript
{modalPago && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
    <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 360, maxWidth: '95vw' }}>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 16 }}>
        Registrar pago de nómina
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6 }}>
          Forma de pago
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { value: 'transferencia', label: '🏦 Transferencia' },
            { value: 'cheque',        label: '📄 Cheque' },
            { value: 'efectivo',      label: '💵 Efectivo' },
          ].map(op => (
            <button key={op.value}
              onClick={() => setModalPago(p => ({ ...p, formaPago: op.value }))}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none',
                background: modalPago.formaPago === op.value ? '#1a2a4a' : '#f0f2f5',
                color: modalPago.formaPago === op.value ? 'white' : '#555',
                cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
              }}>
              {op.label}
            </button>
          ))}
        </div>
      </div>
      {['transferencia', 'cheque'].includes(modalPago.formaPago) && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
            Nº Transacción / Cheque (opcional)
          </label>
          <input
            type="text"
            value={modalPago.referencia}
            onChange={e => setModalPago(p => ({ ...p, referencia: e.target.value }))}
            placeholder="Ej: 00123456"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
              border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={() => setModalPago(null)}
          style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd',
            background: 'white', cursor: 'pointer', fontSize: 13 }}>
          Cancelar
        </button>
        <button onClick={confirmarPago}
          style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
            background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 13 }}>
          Confirmar pago
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Paso 4: Commit y push**

```bash
git add src/components/rrhh/TabNomina.js
git commit -m "feat(nomina): modal de forma de pago y referencia al marcar nómina pagada"
git push origin main
```
