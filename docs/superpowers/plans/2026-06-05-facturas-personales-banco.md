# Facturas Personales en Banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar las facturas personales pagadas por transferencia/depósito/cheque como salidas en la pestaña BANCO, y evitar duplicados con número de transferencia obligatorio.

**Architecture:** Campo `numero_transferencia TEXT` en `talonario_facturas_personales`. FacturasPersonales.js agrega el campo al formulario con validación de obligatoriedad y unicidad. MovimientosBanco.js agrega un 5° query que trae esas facturas como salidas.

**Tech Stack:** React, Supabase (PostgREST)

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Supabase SQL editor (manual) | `ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS numero_transferencia TEXT` |
| `src/components/contabilidad/talonario/compras/FacturasPersonales.js` | VACIO, guardar(), columnas, campo en modal |
| `src/components/contabilidad/talonario/banco/MovimientosBanco.js` | 5° query + filas salida |

---

## Task 1: Supabase — agregar columna `numero_transferencia`

**Files:**
- Manual en Supabase SQL editor

- [ ] **Step 1: Ejecutar en Supabase SQL editor**

```sql
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS numero_transferencia TEXT;
```

- [ ] **Step 2: Verificar**

En Supabase → Table Editor → `talonario_facturas_personales`, confirmar que aparece la columna `numero_transferencia` nullable.

---

## Task 2: FacturasPersonales.js — campo, validaciones y columna tabla

**Files:**
- Modify: `src/components/contabilidad/talonario/compras/FacturasPersonales.js`

- [ ] **Step 1: Agregar `numero_transferencia` a VACIO**

```js
// ANTES:
const VACIO = { fecha: '', proveedor: '', descripcion: '', monto: '',
  tiene_factura: true, forma_pago: '20', comentario: '' };
```

```js
// DESPUÉS:
const VACIO = { fecha: '', proveedor: '', descripcion: '', monto: '',
  tiene_factura: true, forma_pago: '20', comentario: '', numero_transferencia: '' };
```

- [ ] **Step 2: Agregar validaciones y campo al payload en `guardar()`**

Reemplazar la función `guardar()` completa:

```js
// ANTES:
async function guardar() {
  if (!form.descripcion || !form.monto) return alert('Descripción y monto son requeridos');
  setGuardando(true);
  const payload = { mes, año, fecha: form.fecha || null, proveedor: form.proveedor || null,
    descripcion: form.descripcion, monto: parseFloat(form.monto),
    tiene_factura: form.tiene_factura !== false,
    forma_pago: form.forma_pago, comentario: form.comentario || null };
  if (form.id) {
    await supabase.from('talonario_facturas_personales').update(payload).eq('id', form.id);
  } else {
    await supabase.from('talonario_facturas_personales').insert(payload);
  }
  setGuardando(false);
  setForm(null);
  cargar();
}
```

```js
// DESPUÉS:
async function guardar() {
  if (!form.descripcion || !form.monto) return alert('Descripción y monto son requeridos');
  if (form.forma_pago === '20' && !form.numero_transferencia?.trim())
    return alert('El número de transferencia es obligatorio para pagos bancarios');
  if (form.forma_pago === '20') {
    const { data: existe } = await supabase
      .from('talonario_facturas_personales')
      .select('id')
      .eq('numero_transferencia', form.numero_transferencia.trim())
      .neq('id', form.id || '')
      .maybeSingle();
    if (existe) return alert('Este número de transferencia ya está registrado');
  }
  setGuardando(true);
  const payload = { mes, año, fecha: form.fecha || null, proveedor: form.proveedor || null,
    descripcion: form.descripcion, monto: parseFloat(form.monto),
    tiene_factura: form.tiene_factura !== false,
    forma_pago: form.forma_pago, comentario: form.comentario || null,
    numero_transferencia: form.forma_pago === '20' ? form.numero_transferencia.trim() : null };
  if (form.id) {
    await supabase.from('talonario_facturas_personales').update(payload).eq('id', form.id);
  } else {
    await supabase.from('talonario_facturas_personales').insert(payload);
  }
  setGuardando(false);
  setForm(null);
  cargar();
}
```

- [ ] **Step 3: Agregar columna `Nº Transf.` en la tabla**

En el array `columnas`, agregar entre `descripcion` y `tiene_factura`:

```js
// ANTES:
const columnas = [
  { key: 'fecha',         label: 'Fecha' },
  { key: 'proveedor',     label: 'Proveedor' },
  { key: 'descripcion',   label: 'Descripción' },
  { key: 'tiene_factura', label: 'Factura', render: f => f.tiene_factura ? '✅' : '❌' },
  { key: 'monto',         label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
  { key: 'forma_pago',    label: 'Forma Pago', render: f => {
    const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
    return fp ? fp.label : f.forma_pago;
  }},
  { key: 'comentario', label: 'Comentario' },
];
```

```js
// DESPUÉS:
const columnas = [
  { key: 'fecha',                 label: 'Fecha' },
  { key: 'proveedor',             label: 'Proveedor' },
  { key: 'descripcion',           label: 'Descripción' },
  { key: 'numero_transferencia',  label: 'Nº Transf.', render: f => f.numero_transferencia || '—' },
  { key: 'tiene_factura',         label: 'Factura', render: f => f.tiene_factura ? '✅' : '❌' },
  { key: 'monto',                 label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
  { key: 'forma_pago',            label: 'Forma Pago', render: f => {
    const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
    return fp ? fp.label : f.forma_pago;
  }},
  { key: 'comentario', label: 'Comentario' },
];
```

- [ ] **Step 4: Agregar campo `Nº Transferencia` en el modal**

En el modal, después del bloque del select de `forma_pago` (antes del div de botones), agregar el campo condicional:

```jsx
// Agregar este bloque entre el </div> del forma_pago y el <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}> de los botones:

{form.forma_pago === '20' && (
  <div style={{ marginBottom: 16 }}>
    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
      Nº Transferencia / Depósito *
    </label>
    <input
      type="text"
      value={form.numero_transferencia || ''}
      onChange={e => setForm(p => ({ ...p, numero_transferencia: e.target.value }))}
      placeholder="Ej: TRF-00123456"
      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
        border: `1.5px solid ${!form.numero_transferencia?.trim() ? '#e74c3c' : '#ddd'}`,
        fontSize: 13, boxSizing: 'border-box' }}
    />
  </div>
)}
```

- [ ] **Step 5: Verificar en el navegador**

1. Ir a Talonario → Compras → Facturas Personales
2. Hacer clic en Agregar
3. Seleccionar Forma Pago "Transf./Cheque/Depósito (20)" → verificar que aparece el campo "Nº Transferencia / Depósito *" con borde rojo
4. Intentar guardar sin el número → verificar que aparece el alert bloqueante
5. Ingresar un número y guardar → verificar que se guarda y aparece en la columna "Nº Transf." de la tabla
6. Intentar agregar otra fila con el mismo número → verificar que aparece el alert de duplicado
7. Seleccionar Forma Pago "Efectivo (01)" → verificar que el campo desaparece

- [ ] **Step 6: Commit**

```bash
git add src/components/contabilidad/talonario/compras/FacturasPersonales.js
git commit -m "feat(facturas-personales): numero_transferencia obligatorio con validación de duplicados"
```

---

## Task 3: MovimientosBanco.js — facturas personales como salidas

**Files:**
- Modify: `src/components/contabilidad/talonario/banco/MovimientosBanco.js`

- [ ] **Step 1: Agregar 5° query en `cargar()`**

Reemplazar el bloque de destructuring + Promise.all:

```js
// ANTES:
const [
  { data: cobros },
  { data: pagosB },
  { data: otrosI },
  { data: config },
] = await Promise.all([
  supabase.from('cobros')
    .select('id,fecha,monto,comision,forma_pago,observaciones,clientes(nombre),facturas(numero)')
    .in('forma_pago', ['transferencia','deposito','cheque'])
    .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
  supabase.from('talonario_pagos_banco')
    .select('id,fecha,monto,descripcion,banco')
    .eq('mes', mes).eq('año', año).order('fecha'),
  supabase.from('talonario_otros_ingresos')
    .select('id,fecha,monto,descripcion,empresa,forma_pago')
    .eq('mes', mes).eq('año', año)
    .neq('forma_pago', '01').order('fecha'),
  supabase.from('config_contabilidad')
    .select('valor').eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
]);
```

```js
// DESPUÉS:
const [
  { data: cobros },
  { data: pagosB },
  { data: otrosI },
  { data: config },
  { data: factsP },
] = await Promise.all([
  supabase.from('cobros')
    .select('id,fecha,monto,comision,forma_pago,observaciones,clientes(nombre),facturas(numero)')
    .in('forma_pago', ['transferencia','deposito','cheque'])
    .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
  supabase.from('talonario_pagos_banco')
    .select('id,fecha,monto,descripcion,banco')
    .eq('mes', mes).eq('año', año).order('fecha'),
  supabase.from('talonario_otros_ingresos')
    .select('id,fecha,monto,descripcion,empresa,forma_pago')
    .eq('mes', mes).eq('año', año)
    .neq('forma_pago', '01').order('fecha'),
  supabase.from('config_contabilidad')
    .select('valor').eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
  supabase.from('talonario_facturas_personales')
    .select('id,fecha,proveedor,descripcion,monto,numero_transferencia')
    .eq('mes', mes).eq('año', año)
    .eq('forma_pago', '20').order('fecha'),
]);
```

- [ ] **Step 2: Agregar filas de facturas personales a la lista**

En la construcción de `lista`, agregar después del bloque de `pagosB` y antes del `.sort(...)`:

```js
// ANTES (bloque pagosB seguido de sort):
      ...(pagosB||[]).map(p => ({
        fecha: p.fecha || '',
        descripcion: `Pago banco — ${p.descripcion || p.banco || ''}`,
        tipo: 'salida',
        monto: parseFloat(p.monto||0),
      })),
    ].sort((a, b) => (a.fecha||'').localeCompare(b.fecha||''));
```

```js
// DESPUÉS:
      ...(pagosB||[]).map(p => ({
        fecha: p.fecha || '',
        descripcion: `Pago banco — ${p.descripcion || p.banco || ''}`,
        tipo: 'salida',
        monto: parseFloat(p.monto||0),
      })),
      ...(factsP||[]).map(f => ({
        fecha: f.fecha || '',
        descripcion: `Factura personal — ${f.proveedor || f.descripcion || ''}${f.numero_transferencia ? ` (${f.numero_transferencia})` : ''}`,
        tipo: 'salida',
        monto: parseFloat(f.monto||0),
      })),
    ].sort((a, b) => (a.fecha||'').localeCompare(b.fecha||''));
```

- [ ] **Step 3: Verificar en el navegador**

1. Registrar una factura personal con Forma Pago "Transf./Cheque/Depósito (20)" y un número de transferencia
2. Ir a Talonario → BANCO
3. Verificar que aparece en la tabla como salida con descripción `Factura personal — [proveedor] (Nº)`
4. Verificar que `totalSalidas` en los KPIs aumentó con ese monto
5. Verificar que el `NETO DEL MES` disminuyó correctamente

- [ ] **Step 4: Commit**

```bash
git add src/components/contabilidad/talonario/banco/MovimientosBanco.js
git commit -m "feat(banco): facturas personales bancarias como salidas en movimientos"
```
