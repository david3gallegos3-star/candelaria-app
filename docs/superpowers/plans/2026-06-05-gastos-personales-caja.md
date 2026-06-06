# Gastos Personales en Caja Chica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar gastos de caja chica como "personal" para que aparezcan en la sección Pagos Personales del Talonario, sin dejar de restar en el cierre del día.

**Architecture:** Campo `es_personal BOOLEAN DEFAULT false` en `caja_gastos`. Checkbox por fila en TabCajaChica. PagosPersonales carga caja_gastos con es_personal=true del mes como filas read-only en "Gastos Personales".

**Tech Stack:** React, Supabase (PostgREST)

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Supabase SQL editor (manual) | `ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS es_personal BOOLEAN DEFAULT false` |
| `src/components/facturacion/TabCajaChica.js` | `fGasto()`, header tabla, celda checkbox, ambos INSERTs |
| `src/components/contabilidad/talonario/egresos/PagosPersonales.js` | `cargar()`, `guardar()`, `eliminar()` |

---

## Task 1: Supabase — agregar columna `es_personal`

**Files:**
- Manual en Supabase SQL editor

- [ ] **Step 1: Ejecutar en Supabase SQL editor**

```sql
ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS es_personal BOOLEAN DEFAULT false;
```

- [ ] **Step 2: Verificar**

En Supabase → Table Editor → `caja_gastos`, confirmar que aparece la columna `es_personal` con default `false`.

---

## Task 2: TabCajaChica.js — checkbox Personal en filas de gasto

**Files:**
- Modify: `src/components/facturacion/TabCajaChica.js`

- [ ] **Step 1: Actualizar `fGasto()` para incluir `es_personal`**

```js
// ANTES:
function fGasto() {
  return { proveedor:'', detalle:'', valor:'', ruc:'', numero_factura:'', pendiente_compra:false, expandido:false };
}
```

```js
// DESPUÉS:
function fGasto() {
  return { proveedor:'', detalle:'', valor:'', ruc:'', numero_factura:'', pendiente_compra:false, expandido:false, es_personal:false };
}
```

- [ ] **Step 2: Agregar columna PERSONAL en el header de la tabla de gastos**

La tabla tiene headers: PROVEEDOR | DETALLE | VALOR ($) | PENDIENTE | +INFO / 🗑

Agregar "PERSONAL" entre "PENDIENTE" y "+INFO / 🗑":

```jsx
// ANTES:
<th style={{ ...thS, width:70, textAlign:'center' }}>PENDIENTE</th>
<th style={{ ...thS, width:70, textAlign:'center' }}>+INFO / 🗑</th>
```

```jsx
// DESPUÉS:
<th style={{ ...thS, width:70, textAlign:'center' }}>PENDIENTE</th>
<th style={{ ...thS, width:70, textAlign:'center' }}>PERSONAL</th>
<th style={{ ...thS, width:70, textAlign:'center' }}>+INFO / 🗑</th>
```

- [ ] **Step 3: Agregar celda checkbox en cada fila de gasto**

Después de la celda `PENDIENTE` (que termina con `style={{ width:16, height:16, cursor:'pointer' }} />`), agregar la celda PERSONAL antes de la celda de botones:

```jsx
// ANTES:
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <input type="checkbox" checked={g.pendiente_compra}
                      onChange={e => updG(i,'pendiente_compra',e.target.checked)}
                      title="Marcar pendiente en Compras"
                      style={{ width:16, height:16, cursor:'pointer' }} />
                  </td>
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <button onClick={() => updG(i,'expandido',!g.expandido)}
```

```jsx
// DESPUÉS:
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <input type="checkbox" checked={g.pendiente_compra}
                      onChange={e => updG(i,'pendiente_compra',e.target.checked)}
                      title="Marcar pendiente en Compras"
                      style={{ width:16, height:16, cursor:'pointer' }} />
                  </td>
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <input type="checkbox" checked={g.es_personal || false}
                      onChange={e => updG(i,'es_personal',e.target.checked)}
                      title="Marcar como gasto personal"
                      style={{ width:16, height:16, cursor:'pointer' }} />
                  </td>
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <button onClick={() => updG(i,'expandido',!g.expandido)}
```

- [ ] **Step 4: Agregar `es_personal` en el INSERT del autosave (líneas ~71-76)**

```js
// ANTES:
      await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
        caja_id: id, proveedor: g.proveedor, ruc: g.ruc,
        numero_factura: g.numero_factura, detalle: g.detalle,
        valor: parseFloat(g.valor) || 0,
        pendiente_compra: g.pendiente_compra, orden: i,
      })));
```

```js
// DESPUÉS:
      await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
        caja_id: id, proveedor: g.proveedor, ruc: g.ruc,
        numero_factura: g.numero_factura, detalle: g.detalle,
        valor: parseFloat(g.valor) || 0,
        pendiente_compra: g.pendiente_compra, orden: i,
        es_personal: g.es_personal || false,
      })));
```

**Nota:** El autosave es el primer INSERT de caja_gastos que aparece en el archivo (dentro de la función de autosave, ~línea 68-76). Hay un segundo INSERT en el guardado manual (~línea 222-232). Actualizar ambos.

- [ ] **Step 5: Agregar `es_personal` en el INSERT del guardado manual (líneas ~226-232)**

```js
// ANTES:
      await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
        caja_id: id,
        proveedor: g.proveedor, ruc: g.ruc,
        numero_factura: g.numero_factura, detalle: g.detalle,
        valor: parseFloat(g.valor) || 0,
        pendiente_compra: g.pendiente_compra, orden: i
      })));
```

```js
// DESPUÉS:
      await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
        caja_id: id,
        proveedor: g.proveedor, ruc: g.ruc,
        numero_factura: g.numero_factura, detalle: g.detalle,
        valor: parseFloat(g.valor) || 0,
        pendiente_compra: g.pendiente_compra, orden: i,
        es_personal: g.es_personal || false,
      })));
```

- [ ] **Step 6: Verificar en navegador**

1. Ir a Facturación → Caja Chica
2. Abrir o crear un día de caja
3. Verificar que la tabla de gastos tiene columna "PERSONAL" entre PENDIENTE y +INFO / 🗑
4. Agregar un gasto, marcar checkbox "PERSONAL" y guardarlo
5. Recargar la página → verificar que el checkbox sigue marcado

- [ ] **Step 7: Commit**

```bash
git add src/components/facturacion/TabCajaChica.js
git commit -m "feat(caja-chica): checkbox es_personal en filas de gasto"
```

---

## Task 3: PagosPersonales.js — cargar gastos personales de caja + guards

**Files:**
- Modify: `src/components/contabilidad/talonario/egresos/PagosPersonales.js`

- [ ] **Step 1: Reemplazar función `cargar()` completa**

```js
// ANTES:
  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from('talonario_pagos_personales')
      .select('*').eq('mes', mes).eq('año', año).order('categoria').order('fecha');
    setFilas(data || []);
    setSeleccionados(new Set());
    setCargando(false);
  }
```

```js
// DESPUÉS:
  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${new Date(año, mes, 0).getDate()}`;

    const [{ data }, { data: cajas }] = await Promise.all([
      supabase.from('talonario_pagos_personales')
        .select('*').eq('mes', mes).eq('año', año).order('categoria').order('fecha'),
      supabase.from('caja_chica')
        .select('id, fecha')
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    ]);

    let gastosPersonales = [];
    const cajaIds = (cajas || []).map(c => c.id);
    if (cajaIds.length) {
      const { data: gp } = await supabase
        .from('caja_gastos')
        .select('id, caja_id, proveedor, detalle, valor')
        .in('caja_id', cajaIds)
        .eq('es_personal', true);

      const fechaMap = Object.fromEntries((cajas || []).map(c => [c.id, c.fecha]));
      gastosPersonales = (gp || []).map(g => ({
        id:           `caja_${g.id}`,
        fecha:        fechaMap[g.caja_id] || null,
        beneficiario: g.proveedor || null,
        concepto:     g.detalle || 'Gasto personal efectivo',
        monto:        parseFloat(g.valor || 0),
        categoria:    'gastos_personal',
        forma_pago:   '01',
        comentario:   'Registrado en Caja Chica',
        _readOnly:    true,
      }));
    }

    setFilas([...(data || []), ...gastosPersonales]);
    setSeleccionados(new Set());
    setCargando(false);
  }
```

- [ ] **Step 2: Agregar guard en `guardar()`**

```js
// ANTES:
  async function guardar() {
    if (!form.concepto || !form.monto) return alert('Concepto y monto son requeridos');
```

```js
// DESPUÉS:
  async function guardar() {
    if (form._readOnly) return setForm(null);
    if (!form.concepto || !form.monto) return alert('Concepto y monto son requeridos');
```

- [ ] **Step 3: Agregar guard en `eliminar()`**

```js
// ANTES:
  async function eliminar(id) {
    await supabase.from('talonario_pagos_personales').delete().eq('id', id);
    cargar();
  }
```

```js
// DESPUÉS:
  async function eliminar(id) {
    if (String(id).startsWith('caja_')) return;
    await supabase.from('talonario_pagos_personales').delete().eq('id', id);
    cargar();
  }
```

- [ ] **Step 4: Verificar en navegador**

1. En Caja Chica, marcar un gasto como "PERSONAL" y guardar
2. Ir a Talonario → Egresos → Pagos Personales
3. Verificar que el gasto aparece en la sección "👤 Pagos Gastos Personales" con concepto del detalle, monto correcto y comentario "Registrado en Caja Chica"
4. Hacer clic en ✏️ en esa fila → el form se abre pero al hacer clic Guardar se cierra sin cambios
5. Hacer clic en 🗑️ en esa fila → no ocurre nada (guard protege)
6. Verificar que el gasto SÍ sigue apareciendo en Talonario → Egresos → Gastos Efectivo (cierre del día no se altera)

- [ ] **Step 5: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/PagosPersonales.js
git commit -m "feat(pagos-personales): mostrar gastos personales de caja chica como read-only"
```
