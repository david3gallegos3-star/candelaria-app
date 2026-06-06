# Gastos Personales en Caja Chica — Design Spec

**Fecha:** 2026-06-05
**Estado:** Aprobado

## Problema

Los gastos de efectivo (caja chica) que son de uso personal no se distinguen de los operativos. No hay forma de rastrearlos como pagos personales sin salir del módulo de Caja Chica.

## Solución

Campo `es_personal BOOLEAN DEFAULT false` en `caja_gastos`. Checkbox en cada fila de gasto en TabCajaChica. PagosPersonales carga adicionalmente los gastos marcados como personales del mes y los muestra como filas read-only en la sección "Gastos Personales".

---

## 1. Base de datos

```sql
ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS es_personal BOOLEAN DEFAULT false;
```

---

## 2. TabCajaChica.js

### 2a. Actualizar `fGasto()`

Agregar `es_personal: false` al objeto por defecto:

```js
function fGasto() {
  return { proveedor:'', detalle:'', valor:'', ruc:'', numero_factura:'',
    pendiente_compra: false, expandido: false, es_personal: false };
}
```

### 2b. Checkbox en la fila de gasto

La tabla de gastos tiene columnas: PROVEEDOR | DETALLE | VALOR ($) | PENDIENTE | +INFO / 🗑

Agregar columna **PERSONAL** entre PENDIENTE y +INFO / 🗑:

**Header:**
```jsx
<th style={{ ...thS, width:70, textAlign:'center' }}>PERSONAL</th>
```

**Celda en cada fila:**
```jsx
<td style={{ ...tdS, textAlign:'center' }}>
  <input type="checkbox" checked={g.es_personal || false}
    onChange={e => updG(i, 'es_personal', e.target.checked)}
    title="Marcar como gasto personal"
    style={{ width:16, height:16, cursor:'pointer' }} />
</td>
```

### 2c. Incluir `es_personal` en ambos INSERTs

Hay dos lugares donde se hace `caja_gastos.insert`: el autosave (líneas ~71-75) y el guardado manual (líneas ~226-232). En ambos agregar:

```js
es_personal: g.es_personal || false,
```

Ejemplo del INSERT manual completo:
```js
await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
  caja_id: id,
  proveedor: g.proveedor, ruc: g.ruc,
  numero_factura: g.numero_factura, detalle: g.detalle,
  valor: parseFloat(g.valor) || 0,
  pendiente_compra: g.pendiente_compra, orden: i,
  es_personal: g.es_personal || false,
})));
```

---

## 3. PagosPersonales.js

### 3a. Query adicional al cargar

En `cargar()`, agregar dos queries adicionales en paralelo con el query existente:

```js
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

### 3b. Guards en guardar() y eliminar()

`TablaCrud` no oculta botones ✏️/🗑️ para filas `_readOnly`. Agregar guards:

```js
async function guardar() {
  if (form._readOnly) return setForm(null);
  // ... resto igual
}

async function eliminar(id) {
  if (String(id).startsWith('caja_')) return;
  await supabase.from('talonario_pagos_personales').delete().eq('id', id);
  cargar();
}
```

Las filas read-only aparecen en la sección "👤 Pagos Gastos Personales" — si el admin hace clic en ✏️ el form se abre pero al guardar se cierra sin hacer nada. Para gestionarlas hay que ir a Caja Chica.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Supabase SQL editor (manual) | `ALTER TABLE caja_gastos ADD COLUMN IF NOT EXISTS es_personal BOOLEAN DEFAULT false` |
| `src/components/facturacion/TabCajaChica.js` | `fGasto()`, header tabla, celda checkbox, ambos INSERTs |
| `src/components/contabilidad/talonario/egresos/PagosPersonales.js` | `cargar()` con queries adicionales |

---

## Fuera de alcance

- Mostrar indicador visual en GastosEfectivo para los gastos marcados como personales (lectura pura, no cambia)
- Exportar gastos personales de caja en el CSV del Talonario
