# Comisiones Bancarias en Cobros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar comisiones bancarias en cobros por transferencia/depósito/cheque, tanto al momento del cobro como después desde la pestaña BANCO.

**Architecture:** Campo `comision NUMERIC DEFAULT 0` en tabla `cobros`. TabCobrar.js agrega UI en el modal. MovimientosBanco.js usa flatMap para generar filas de comisión como salidas, con edición inline posterior vía UPDATE.

**Tech Stack:** React, Supabase (PostgREST), SQL

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Supabase SQL editor (manual) | `ALTER TABLE cobros ADD COLUMN comision NUMERIC DEFAULT 0` |
| `src/components/facturacion/TabCobrar.js` | Checkbox + input comisión en modal, campo en INSERT, reset al cerrar |
| `src/components/contabilidad/talonario/banco/MovimientosBanco.js` | Query con `comision`+`cheque`, flatMap para filas comisión, edición inline |

---

## Task 1: Supabase — agregar columna `comision`

**Files:**
- Manual en Supabase SQL editor (no hay archivo de migraciones en este proyecto)

- [ ] **Step 1: Ejecutar en Supabase SQL editor**

Ir a Supabase → SQL Editor y ejecutar:

```sql
ALTER TABLE cobros ADD COLUMN IF NOT EXISTS comision NUMERIC DEFAULT 0;
```

- [ ] **Step 2: Verificar**

En Supabase → Table Editor → tabla `cobros`, confirmar que aparece la columna `comision` con valor por defecto `0`.

---

## Task 2: TabCobrar.js — checkbox comisión en modal

**Files:**
- Modify: `src/components/facturacion/TabCobrar.js`

- [ ] **Step 1: Agregar estados para comisión**

En el bloque de `useState` (líneas 37–50), agregar después de `const [obsCobo, setObsCobro] = useState('');`:

```js
const [tieneComision,  setTieneComision]  = useState(false);
const [montoComision,  setMontoComision]  = useState('');
```

- [ ] **Step 2: Agregar campo `comision` al INSERT**

En `registrarCobro()`, dentro del objeto que se pasa a `.insert({...})` (línea 76–86), agregar después de `referencia_pago`:

```js
comision: tieneComision ? parseFloat(montoComision) || 0 : 0,
```

El INSERT completo queda así:

```js
const { data: cobroData, error: errCobro } = await supabase.from('cobros').insert({
  cuenta_cobrar_id: cuenta.id,
  factura_id:       cuenta.factura_id,
  cliente_id:       cuenta.cliente_id,
  monto,
  forma_pago:       formaCobro,
  fecha:            new Date().toISOString().split('T')[0],
  observaciones:    obsCobo,
  registrado_por:   currentUser?.email || '',
  referencia_pago:  ['transferencia', 'cheque', 'deposito'].includes(formaCobro) ? referenciaCobro || null : null,
  comision:         tieneComision ? parseFloat(montoComision) || 0 : 0,
}).select('id, monto, forma_pago, fecha').single();
```

- [ ] **Step 3: Resetear estados al cerrar modal**

En `registrarCobro()`, dentro del bloque de reset después de `setReferenciaCobro('')` (línea 103), agregar:

```js
setTieneComision(false);
setMontoComision('');
```

También en el botón "Cancelar" del modal, el `onClick` ya llama `setModalCobro(null)` pero no resetea estos estados. Cambiar a:

```js
onClick={() => {
  setModalCobro(null);
  setTieneComision(false);
  setMontoComision('');
}}
```

- [ ] **Step 4: Agregar UI de comisión en el modal**

En el modal (líneas 359–436), el bloque de referencia_pago está en líneas 399–409:

```jsx
{['transferencia', 'cheque', 'deposito'].includes(formaCobro) && (
  <div style={{ marginBottom: 12 }}>
    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>
      Nº Transacción / Depósito (opcional)
    </label>
    <input type="text" value={referenciaCobro}
      onChange={e => setReferenciaCobro(e.target.value)} placeholder="Ej: 00123456"
      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
        border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
  </div>
)}
```

Agregar el siguiente bloque **después** de ese bloque (antes del bloque de Observaciones):

```jsx
{['transferencia', 'cheque', 'deposito'].includes(formaCobro) && (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#555' }}>
      <input type="checkbox" checked={tieneComision}
        onChange={e => { setTieneComision(e.target.checked); if (!e.target.checked) setMontoComision(''); }}
        style={{ width: 16, height: 16, cursor: 'pointer' }} />
      Tiene comisión bancaria
    </label>
    {tieneComision && (
      <input type="number" min="0.01" step="0.01" value={montoComision}
        onChange={e => setMontoComision(e.target.value)}
        placeholder="Monto comisión ($)"
        style={{ marginTop: 6, width: '100%', padding: '7px 10px', borderRadius: 6,
          border: '1.5px solid #e74c3c', fontSize: 13, boxSizing: 'border-box' }} />
    )}
  </div>
)}
```

- [ ] **Step 5: Verificar en el navegador**

1. Abrir la app → Facturación → tab Cobrar
2. Hacer clic en "Registrar cobro" en cualquier cuenta pendiente
3. Seleccionar forma "Transferencia" → verificar que aparece el checkbox "Tiene comisión bancaria"
4. Marcar el checkbox → verificar que aparece el input de monto con borde rojo
5. Desmarcar → verificar que el input desaparece y no bloquea el formulario
6. Seleccionar "Efectivo" → verificar que NO aparece el checkbox
7. Registrar un cobro de prueba con comisión $0.50 → verificar que se guarda sin error

- [ ] **Step 6: Commit**

```bash
git add src/components/facturacion/TabCobrar.js
git commit -m "feat(cobros): checkbox comisión bancaria en modal de cobro"
```

---

## Task 3: MovimientosBanco.js — filas de comisión + edición inline

**Files:**
- Modify: `src/components/contabilidad/talonario/banco/MovimientosBanco.js`

- [ ] **Step 1: Agregar estados para edición inline de comisión**

En el bloque de `useState` (líneas 7–12), agregar después de `const [filtro, setFiltro] = useState('');`:

```js
const [editandoComision,  setEditandoComision]  = useState(null);
const [montoComisionEdit, setMontoComisionEdit] = useState('');
```

- [ ] **Step 2: Actualizar query de cobros**

En la función `cargar()`, actualizar el select de cobros para incluir `comision` y agregar `cheque` al filtro `in`:

```js
supabase.from('cobros')
  .select('id,fecha,monto,comision,forma_pago,observaciones,clientes(nombre),facturas(numero)')
  .in('forma_pago', ['transferencia','deposito','cheque'])
  .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
```

- [ ] **Step 3: Cambiar `.map` a `.flatMap` para generar filas de comisión**

En la construcción de `lista` (líneas 40–58), reemplazar el bloque de cobros:

```js
// ANTES:
...(cobros||[]).map(c => ({
  fecha: c.fecha,
  descripcion: `Cobro ${c.forma_pago === 'deposito' ? 'Depósito' : 'Transferencia'} — ${c.clientes?.nombre || c.facturas?.numero || c.observaciones || ''}`,
  tipo: 'entrada',
  monto: parseFloat(c.monto||0),
})),
```

```js
// DESPUÉS:
...(cobros||[]).flatMap(c => {
  const label = c.forma_pago === 'deposito' ? 'Depósito' : c.forma_pago === 'cheque' ? 'Cheque' : 'Transferencia';
  const quien = c.clientes?.nombre || c.facturas?.numero || c.observaciones || '';
  const filas = [{
    fecha: c.fecha,
    descripcion: `Cobro ${label} — ${quien}`,
    tipo: 'entrada',
    monto: parseFloat(c.monto||0),
    cobroId: c.id,
    cobroLabel: quien,
  }];
  if (parseFloat(c.comision||0) > 0) {
    filas.push({
      fecha: c.fecha,
      descripcion: `└ Comisión — ${quien}`,
      tipo: 'salida',
      monto: parseFloat(c.comision),
      esComision: true,
    });
  }
  return filas;
}),
```

- [ ] **Step 4: Agregar función `guardarComision`**

Después de la función `guardarSaldo` (línea 71), agregar:

```js
async function guardarComision(cobroId, val) {
  await supabase.from('cobros').update({ comision: parseFloat(val) || 0 }).eq('id', cobroId);
  setEditandoComision(null);
  setMontoComisionEdit('');
  cargar();
}
```

- [ ] **Step 5: Actualizar render de filas en la tabla**

En el `tbody`, reemplazar el render de filas (líneas 197–209):

```jsx
// ANTES:
) : movsFilt.map((m, i) => (
  <tr key={i} style={{ borderBottom:'1px solid #f0f0f0', background: i%2===0?'white':'#fafafa' }}>
    <td style={{ padding:'8px 14px', fontSize:12, color:'#888' }}>{fmt(m.fecha)}</td>
    <td style={{ padding:'8px 14px', fontSize:12, color:'#333' }}>{m.descripcion}</td>
    <td style={{ padding:'8px 14px', fontSize:12, textAlign:'right', fontWeight:'bold', color:'#27ae60' }}>
      {m.tipo === 'entrada' ? `$${m.monto.toFixed(2)}` : '—'}
    </td>
    <td style={{ padding:'8px 14px', fontSize:12, textAlign:'right', fontWeight:'bold', color:'#e74c3c' }}>
      {m.tipo === 'salida' ? `$${m.monto.toFixed(2)}` : '—'}
    </td>
  </tr>
))}
```

```jsx
// DESPUÉS:
) : movsFilt.map((m, i) => (
  <tr key={i} style={{ borderBottom:'1px solid #f0f0f0',
    background: m.esComision ? '#fff8f8' : i%2===0 ? 'white' : '#fafafa' }}>
    <td style={{ padding:'8px 14px', fontSize:12, color:'#888' }}>{fmt(m.fecha)}</td>
    <td style={{ padding:'8px 14px', fontSize:12, color: m.esComision ? '#e74c3c' : '#333' }}>
      {m.descripcion}
      {m.cobroId && (
        editandoComision === m.cobroId ? (
          <span style={{ display:'inline-flex', gap:4, marginLeft:8, alignItems:'center' }}>
            <input type="number" value={montoComisionEdit}
              onChange={e => setMontoComisionEdit(e.target.value)}
              placeholder="0.00" autoFocus
              style={{ width:80, padding:'2px 6px', borderRadius:4, border:'1px solid #e74c3c',
                fontSize:11, outline:'none' }}
            />
            <button onClick={() => guardarComision(m.cobroId, montoComisionEdit)}
              style={{ background:'#27ae60', color:'white', border:'none', borderRadius:4,
                padding:'2px 8px', cursor:'pointer', fontSize:11 }}>✓</button>
            <button onClick={() => setEditandoComision(null)}
              style={{ background:'#f0f2f5', color:'#555', border:'none', borderRadius:4,
                padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✕</button>
          </span>
        ) : (
          <button onClick={() => { setEditandoComision(m.cobroId); setMontoComisionEdit(''); }}
            title="Agregar/editar comisión"
            style={{ marginLeft:8, background:'none', border:'none', cursor:'pointer',
              fontSize:11, color:'#aaa', padding:'1px 4px', borderRadius:4 }}>✏️</button>
        )
      )}
    </td>
    <td style={{ padding:'8px 14px', fontSize:12, textAlign:'right', fontWeight:'bold', color:'#27ae60' }}>
      {m.tipo === 'entrada' ? `$${m.monto.toFixed(2)}` : '—'}
    </td>
    <td style={{ padding:'8px 14px', fontSize:12, textAlign:'right', fontWeight:'bold', color:'#e74c3c' }}>
      {m.tipo === 'salida' ? `$${m.monto.toFixed(2)}` : '—'}
    </td>
  </tr>
))}
```

- [ ] **Step 6: Verificar en el navegador**

1. Ir a Talonario → pestaña BANCO
2. Si hay cobros por transferencia/cheque, verificar que aparece el ✏️ en cada fila
3. Hacer clic en ✏️ → ingresar un monto de comisión (ej: $0.50) → guardar
4. Verificar que aparece una fila nueva indentada `└ Comisión — [nombre]` en rojo debajo
5. Verificar que los KPIs se actualizan (totalSalidas sube, neto baja)
6. Registrar un cobro nuevo con comisión desde TabCobrar → volver a BANCO y verificar que aparece la fila de comisión automáticamente

- [ ] **Step 7: Commit**

```bash
git add src/components/contabilidad/talonario/banco/MovimientosBanco.js
git commit -m "feat(banco): comisiones bancarias — filas indentadas y edición inline"
```
