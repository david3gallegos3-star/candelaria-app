# ResumenTalonario Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer cada línea del ResumenTalonario clickeable para expandir un mini-listado inline de los registros individuales que componen ese total.

**Architecture:** Un solo componente `FilaDetalle` reemplaza la función `fila()` existente. Maneja su propio estado abierto/cerrado. Los arrays raw de datos (ya cargados en `cargar()`) se guardan en `datos.raw` y se transforman a `[{nombre, fecha, monto}]` en el JSX para pasarlos como prop `registros`.

**Tech Stack:** React (useState), Supabase PostgREST — solo se modifica `ResumenTalonario.js`.

---

## Archivo modificado

`src/components/contabilidad/talonario/ResumenTalonario.js` — único archivo a tocar.

Cambios por sección:
1. **Queries** (líneas 39-67): ampliar `.select()` en 6 queries para incluir campos de display
2. **`cargar()`** (línea 175): agregar `raw: { facturas, cobros, gastos, cajas, compras, nomina, pagosB, pagosP, otrosI, creditosEmpleadosRaw }` a `setDatos()`
3. **Render** (línea 221+): agregar componente `FilaDetalle`, reemplazar `fila()` por `<FilaDetalle>` con prop `registros`

---

## Task 1: Ampliar selects y guardar raw arrays

**Files:**
- Modify: `src/components/contabilidad/talonario/ResumenTalonario.js:39-68,175`

- [ ] **Step 1: Ampliar los 6 queries que necesitan campos extra**

En la función `cargar()`, reemplazar estos selects exactos:

```js
// ANTES (línea 39):
supabase.from('facturas').select('total,forma_pago')

// DESPUÉS:
supabase.from('facturas').select('total,forma_pago,numero,cliente_nombre,created_at')
```

```js
// ANTES (línea 41):
supabase.from('caja_chica').select('id')

// DESPUÉS:
supabase.from('caja_chica').select('id,fecha')
```

```js
// ANTES (línea 42):
supabase.from('compras').select('total,comision,tiene_factura,forma_pago,es_personal')

// DESPUÉS:
supabase.from('compras').select('total,comision,tiene_factura,forma_pago,es_personal,fecha,proveedor_nombre,proveedores(nombre)')
```

```js
// ANTES (línea 43):
supabase.from('nomina').select('sueldo_prop,sueldo_neto,iess_patronal,estado')

// DESPUÉS:
supabase.from('nomina').select('sueldo_prop,sueldo_neto,iess_patronal,estado,empleados(nombre)')
```

```js
// ANTES (línea 45):
supabase.from('talonario_pagos_personales').select('monto,categoria')

// DESPUÉS:
supabase.from('talonario_pagos_personales').select('monto,categoria,beneficiario,fecha')
```

```js
// ANTES (línea 57-59):
supabase.from('nomina_movimientos')
  .select('valor, cuentas_cobrar(estado)')
  .eq('tipo', 'compra').eq('activo', true).eq('periodo', periodo),

// DESPUÉS:
supabase.from('nomina_movimientos')
  .select('valor, cuentas_cobrar(estado), empleados(nombre)')
  .eq('tipo', 'compra').eq('activo', true).eq('periodo', periodo),
```

```js
// ANTES (línea 65):
supabase.from('caja_gastos').select('valor,es_personal,origen_servicio_basico_id').in('caja_id', cajaIds),

// DESPUÉS:
supabase.from('caja_gastos').select('valor,es_personal,origen_servicio_basico_id,detalle,proveedor,caja_id').in('caja_id', cajaIds),
```

- [ ] **Step 2: Agregar raw arrays a setDatos**

Justo después del bloque `const [{ data: gastos }, ...] = ...`, agregar el mapa de fechas de caja:

```js
// Mapa cajaId -> fecha para asignar fecha a cada gasto de caja
const cajaFechasMap = Object.fromEntries((cajas || []).map(c => [c.id, c.fecha]));
```

Luego en `setDatos({...})` (línea ~175), agregar al final del objeto:

```js
setDatos({
  totalVentas, totalOtrosI, totalGastos, totalGastosMes, comprasCon, comprasSin,
  totalSueldos, totalIess, totalPagosB, totalPagosFijos, totalPagosP,
  cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
  pagosPrestamos, pagosTarjetas,
  gastosPersonalesCaja, totalComprasPersonales, comprasPersonalesPagadas,
  totalConsumoPersonal, totalCreditosEmpleados, totalSueldosPagados,
  comprasBancoTotal,
  cxcPendiente, cxpPendiente, saldoCalculado, pendienteInicial, movsBanco,
  // raw arrays para drill-down
  raw: {
    facturas: facturas || [],
    cobros: cobros || [],
    gastos: gastos || [],
    cajaFechasMap,
    compras: compras || [],
    nomina: nomina || [],
    pagosB: pagosB || [],
    pagosP: pagosP || [],
    otrosI: otrosI || [],
    creditosEmpleados: creditosEmpleadosRaw || [],
  }
});
```

- [ ] **Step 3: Agregar `raw` a la destructuración del render**

Después de la línea `const { dif, cuadra, ... } = ...`, agregar:

```js
const { raw } = datos;
```

- [ ] **Step 4: Verificar en consola del navegador que los arrays tienen los nuevos campos**

Abrir DevTools > Console, ejecutar:
```js
// Debería mostrar objetos con los campos nuevos
```
No hay test automatizado para queries; la verificación es visual abriendo el talonario de cualquier mes y comprobando que no aparecen errores en consola.

- [ ] **Step 5: Commit**

```bash
git add src/components/contabilidad/talonario/ResumenTalonario.js
git commit -m "feat: ampliar selects DB en ResumenTalonario para drill-down"
```

---

## Task 2: Componente FilaDetalle

**Files:**
- Modify: `src/components/contabilidad/talonario/ResumenTalonario.js` — agregar componente antes de `export default`

- [ ] **Step 1: Agregar el helper de fecha y el componente FilaDetalle**

Insertar justo antes de `export default function ResumenTalonario()`:

```js
function fmtFecha(f) {
  if (!f) return '';
  const s = String(f).slice(0, 10); // 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:...'
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}

const MAX_DETALLE = 200;

function FilaDetalle({ label, valor, color, registros }) {
  const [abierto, setAbierto] = React.useState(false);
  const tiene = registros && registros.length > 0;

  return (
    <>
      <div
        onClick={() => tiene && setAbierto(a => !a)}
        style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '3px 0', fontSize: 12,
          cursor: tiene ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {label}
          {tiene && (
            <span style={{ fontSize: 9, color: '#aaa' }}>{abierto ? '▲' : '▼'}</span>
          )}
        </span>
        <span style={{ color: color || '#333', fontWeight: color ? 'bold' : 'normal' }}>
          ${parseFloat(valor || 0).toFixed(2)}
        </span>
      </div>
      {abierto && registros && (
        <div style={{
          background: '#f8f9fa', borderLeft: '3px solid #ddd',
          marginLeft: 8, marginBottom: 4,
          padding: '4px 8px', fontSize: 11, borderRadius: '0 4px 4px 0',
        }}>
          {registros.slice(0, MAX_DETALLE).map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', gap: 8,
              padding: '2px 0',
              borderBottom: i < registros.length - 1 ? '1px solid #eee' : 'none',
            }}>
              <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.nombre || '—'}
              </span>
              <span style={{ color: '#888', whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha)}</span>
              <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                ${parseFloat(r.monto || 0).toFixed(2)}
              </span>
            </div>
          ))}
          {registros.length > MAX_DETALLE && (
            <div style={{ color: '#888', padding: '4px 0', fontStyle: 'italic' }}>
              ... y {registros.length - MAX_DETALLE} más
            </div>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar que el componente no rompe nada**

El componente aún no está en uso — la app debe seguir funcionando igual que antes. Abrir ResumenTalonario en el navegador y confirmar que carga sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/contabilidad/talonario/ResumenTalonario.js
git commit -m "feat: agregar componente FilaDetalle para drill-down en ResumenTalonario"
```

---

## Task 3: Conectar FilaDetalle a cada sección del resumen

**Files:**
- Modify: `src/components/contabilidad/talonario/ResumenTalonario.js` — sección JSX (líneas ~238+)

- [ ] **Step 1: Construir los arrays de registros**

Después de `const { raw } = datos;`, agregar todos los arrays de registros:

```js
// ── Registros para drill-down ──────────────────────────────────────────

// MES — Ventas: facturas + cobros de crédito cobrados este mes
const regVentas = [
  ...raw.facturas.map(f => ({
    nombre: f.cliente_nombre || f.numero || 'Factura',
    fecha:  f.created_at,
    monto:  parseFloat(f.total || 0),
  })),
  ...raw.cobros
    .filter(c => c.forma_pago === 'credito' || c.forma_pago === 'credito_nomina')
    .map(c => ({
      nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro crédito',
      fecha:  c.fecha,
      monto:  parseFloat(c.monto || 0),
    })),
].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

// MES — Otros ingresos
const regOtrosI = raw.otrosI.map(o => ({
  nombre: o.descripcion || o.empresa || 'Otro ingreso',
  fecha:  o.fecha,
  monto:  parseFloat(o.monto || 0),
}));

// MES — Gastos efectivo (no personales, sin servicios básicos)
const regGastosMes = raw.gastos
  .filter(g => !g.es_personal && !g.origen_servicio_basico_id)
  .map(g => ({
    nombre: g.detalle || g.proveedor || 'Gasto efectivo',
    fecha:  raw.cajaFechasMap[g.caja_id] || '',
    monto:  parseFloat(g.valor || 0),
  }));

// MES — Proveedores con factura
const regComprasCon = raw.compras
  .filter(c => c.tiene_factura && !c.es_personal)
  .map(c => ({
    nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Proveedor',
    fecha:  c.fecha,
    monto:  parseFloat(c.total || 0),
  }));

// MES — Proveedores sin factura
const regComprasSin = raw.compras
  .filter(c => !c.tiene_factura && !c.es_personal)
  .map(c => ({
    nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Proveedor',
    fecha:  c.fecha,
    monto:  parseFloat(c.total || 0),
  }));

// MES — Sueldos
const regSueldos = raw.nomina.map(n => ({
  nombre: n.empleados?.nombre || 'Empleado',
  fecha:  '',
  monto:  parseFloat(n.sueldo_neto || 0),
}));

// MES — IESS patronal
const regIess = raw.nomina.map(n => ({
  nombre: n.empleados?.nombre || 'Empleado',
  fecha:  '',
  monto:  parseFloat(n.iess_patronal || 0),
}));

// MES — Pagos Fijos (pago_fijo_id) + servicios básicos banco + servicios básicos efectivo
const regPagosFijos = [
  ...raw.pagosB.filter(p => p.pago_fijo_id).map(p => ({
    nombre: p.concepto || p.beneficiario || 'Pago fijo',
    fecha:  p.fecha,
    monto:  parseFloat(p.monto || 0),
  })),
  ...raw.pagosB.filter(p => p.origen_servicio_basico_id).map(p => ({
    nombre: p.concepto || p.beneficiario || 'Servicio básico',
    fecha:  p.fecha,
    monto:  parseFloat(p.monto || 0),
  })),
  ...raw.gastos.filter(g => g.origen_servicio_basico_id).map(g => ({
    nombre: g.detalle || g.proveedor || 'Servicio básico efectivo',
    fecha:  raw.cajaFechasMap[g.caja_id] || '',
    monto:  parseFloat(g.valor || 0),
  })),
];

// MES — Préstamos
const regPrestamos = raw.pagosP
  .filter(p => p.categoria === 'prestamos')
  .map(p => ({
    nombre: p.beneficiario || 'Préstamo',
    fecha:  p.fecha,
    monto:  parseFloat(p.monto || 0),
  }));

// MES — Tarjetas
const regTarjetas = raw.pagosP
  .filter(p => p.categoria === 'tarjetas')
  .map(p => ({
    nombre: p.beneficiario || 'Tarjeta',
    fecha:  p.fecha,
    monto:  parseFloat(p.monto || 0),
  }));

// MES — Pagos personales (gastos_personal + otros + caja personal + compras personales)
const regPagosPersonales = [
  ...raw.pagosP
    .filter(p => ['gastos_personal', 'otros'].includes(p.categoria))
    .map(p => ({ nombre: p.beneficiario || 'Gasto personal', fecha: p.fecha, monto: parseFloat(p.monto || 0) })),
  ...raw.gastos
    .filter(g => g.es_personal)
    .map(g => ({ nombre: g.detalle || g.proveedor || 'Gasto personal caja', fecha: raw.cajaFechasMap[g.caja_id] || '', monto: parseFloat(g.valor || 0) })),
  ...raw.compras
    .filter(c => c.es_personal)
    .map(c => ({ nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Compra personal', fecha: c.fecha, monto: parseFloat(c.total || 0) })),
];

// CONSOLIDADO — Cobros efectivo
const regCobroEfect = [
  ...raw.cobros.filter(c => c.forma_pago === 'efectivo').map(c => ({
    nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro',
    fecha: c.fecha, monto: parseFloat(c.monto || 0),
  })),
  ...raw.facturas.filter(f => f.forma_pago === 'efectivo').map(f => ({
    nombre: f.cliente_nombre || f.numero || 'Venta efectivo',
    fecha: f.created_at, monto: parseFloat(f.total || 0),
  })),
].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

// CONSOLIDADO — Cobros cheque
const regCobroCheq = [
  ...raw.cobros.filter(c => c.forma_pago === 'cheque').map(c => ({
    nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro',
    fecha: c.fecha, monto: parseFloat(c.monto || 0),
  })),
  ...raw.facturas.filter(f => f.forma_pago === 'cheque').map(f => ({
    nombre: f.cliente_nombre || f.numero || 'Venta cheque',
    fecha: f.created_at, monto: parseFloat(f.total || 0),
  })),
].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

// CONSOLIDADO — Cobros transf/depósito
const regCobroTransf = [
  ...raw.cobros
    .filter(c => ['transferencia','deposito','tarjeta_credito'].includes(c.forma_pago))
    .map(c => ({ nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro', fecha: c.fecha, monto: parseFloat(c.monto || 0) })),
  ...raw.facturas
    .filter(f => ['transferencia','tarjeta_credito'].includes(f.forma_pago))
    .map(f => ({ nombre: f.cliente_nombre || f.numero || 'Venta transf', fecha: f.created_at, monto: parseFloat(f.total || 0) })),
].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

// CONSOLIDADO — Gastos efectivo (todos, incluyendo servicios básicos)
const regGastosCons = raw.gastos
  .filter(g => !g.es_personal)
  .map(g => ({
    nombre: g.detalle || g.proveedor || 'Gasto efectivo',
    fecha:  raw.cajaFechasMap[g.caja_id] || '',
    monto:  parseFloat(g.valor || 0),
  }));

// CONSOLIDADO — Pagos con banco (pagosB + compras banco + sueldos pagados)
const regPagosConBanco = [
  ...raw.pagosB.map(p => ({
    nombre: p.concepto || p.beneficiario || 'Pago banco',
    fecha: p.fecha, monto: parseFloat(p.monto || 0),
  })),
  ...raw.compras
    .filter(c => ['transferencia','cheque','deposito'].includes(c.forma_pago) && !c.es_personal)
    .map(c => ({ nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Compra banco', fecha: c.fecha, monto: parseFloat(c.total || 0) + parseFloat(c.comision || 0) })),
  ...raw.nomina
    .filter(n => n.estado === 'pagado')
    .map(n => ({ nombre: `Sueldo — ${n.empleados?.nombre || 'Empleado'}`, fecha: '', monto: parseFloat(n.sueldo_neto || 0) })),
].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

// CONSOLIDADO — Tarjetas/préstamos
const regPrestTarjCons = raw.pagosP
  .filter(p => ['prestamos','tarjetas'].includes(p.categoria))
  .map(p => ({ nombre: p.beneficiario || p.categoria, fecha: p.fecha, monto: parseFloat(p.monto || 0) }));

// CONSOLIDADO — Gastos personales
const regGastPersonalesCons = [
  ...raw.pagosP
    .filter(p => ['gastos_personal','otros'].includes(p.categoria))
    .map(p => ({ nombre: p.beneficiario || 'Gasto personal', fecha: p.fecha, monto: parseFloat(p.monto || 0) })),
  ...raw.gastos
    .filter(g => g.es_personal)
    .map(g => ({ nombre: g.detalle || g.proveedor || 'Gasto personal caja', fecha: raw.cajaFechasMap[g.caja_id] || '', monto: parseFloat(g.valor || 0) })),
  ...raw.compras
    .filter(c => c.es_personal && c.forma_pago !== 'credito')
    .map(c => ({ nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Compra personal', fecha: c.fecha, monto: parseFloat(c.total || 0) })),
];

// CONSOLIDADO — Créditos empleados
const regCreditosEmps = raw.creditosEmpleados
  .filter(m => m.cuentas_cobrar?.estado === 'pagada')
  .map(m => ({ nombre: m.empleados?.nombre || 'Empleado', fecha: '', monto: parseFloat(m.valor || 0) }));
```

- [ ] **Step 2: Reemplazar todas las llamadas a `fila()` por `<FilaDetalle>` en la columna MES**

En la sección JSX de la **columna MES** (buscar `{titulo('INGRESOS'...)}` etc.), reemplazar cada `{fila(...)}` por `<FilaDetalle>`:

```jsx
{/* MES — INGRESOS */}
{titulo('INGRESOS', '#27ae60')}
<FilaDetalle label="(+) Total ventas del mes" valor={totalVentas} color="#27ae60" registros={regVentas} />
<FilaDetalle label="(+) Otros ingresos" valor={totalOtrosI} color="#27ae60" registros={regOtrosI} />
{totalRow('TOTAL INGRESOS', totalIngMes, '#27ae60')}

{/* MES — EGRESOS */}
{titulo('EGRESOS', '#e74c3c')}
<FilaDetalle label="(-) Gastos efectivo" valor={totalGastosMes} color="#e74c3c" registros={regGastosMes} />
<FilaDetalle label="(-) Proveedores con factura" valor={comprasCon} color="#e74c3c" registros={regComprasCon} />
<FilaDetalle label="(-) Proveedores sin factura" valor={comprasSin} color="#e74c3c" registros={regComprasSin} />
<FilaDetalle label="(-) Sueldos" valor={totalSueldos} color="#e74c3c" registros={regSueldos} />
<FilaDetalle label="(-) IESS patronal" valor={totalIess} color="#e74c3c" registros={regIess} />
<FilaDetalle label="(-) Pagos Fijos (sistema, servicios, contadora, etc.)" valor={totalPagosFijos} color="#e74c3c" registros={regPagosFijos} />
<FilaDetalle label="(-) Préstamos" valor={pagosPrestamos} color="#e74c3c" registros={regPrestamos} />
<FilaDetalle label="(-) Tarjetas" valor={pagosTarjetas} color="#e74c3c" registros={regTarjetas} />
<FilaDetalle label="(-) Pagos personales" valor={totalPagosPersonalesTotal} color="#e74c3c" registros={regPagosPersonales} />
<FilaDetalle label="(-) Consumo Personal" valor={totalConsumoPersonal} color="#e74c3c" registros={[]} />
{totalRow('TOTAL EGRESOS', totalEgrMes, '#e74c3c')}
```

- [ ] **Step 3: Reemplazar `fila()` en la columna CONSOLIDADO**

```jsx
{/* CONSOLIDADO — INGRESOS */}
{titulo('INGRESOS (cobros reales)', '#27ae60')}
<FilaDetalle label="(+) Cobros efectivo" valor={cobroEfect} color="#27ae60" registros={regCobroEfect} />
<FilaDetalle label="(+) Cobros cheque" valor={cobroCheq} color="#27ae60" registros={regCobroCheq} />
<FilaDetalle label="(+) Cobros transf./depósito" valor={cobroTransf} color="#27ae60" registros={regCobroTransf} />
<FilaDetalle label="(+) Otros ingresos" valor={totalOtrosI} color="#27ae60" registros={regOtrosI} />
{totalRow('TOTAL', totalIngCons, '#27ae60')}

{/* CONSOLIDADO — EGRESOS */}
{titulo('EGRESOS (pagos reales)', '#e74c3c')}
<FilaDetalle label="(-) Gastos efectivo" valor={totalGastos} color="#e74c3c" registros={regGastosCons} />
<FilaDetalle label="(-) Pagos con banco" valor={totalPagosB + comprasBancoTotal + totalSueldosPagados} color="#e74c3c" registros={regPagosConBanco} />
<FilaDetalle label="(-) Tarjetas/préstamos" valor={pagosPrestTarj} color="#e74c3c" registros={regPrestTarjCons} />
<FilaDetalle label="(-) Gastos personales" valor={pagosGastPersTotal} color="#e74c3c" registros={regGastPersonalesCons} />
<FilaDetalle label="(-) Créditos Empleados" valor={totalCreditosEmpleados} color="#e74c3c" registros={regCreditosEmps} />
{totalRow('TOTAL', totalEgrCons, '#e74c3c')}
```

- [ ] **Step 4: Verificar visualmente en el navegador**

1. Abrir Talonario → Resumen para cualquier mes con datos
2. Hacer clic en "(-) Pagos con banco" → debe expandir lista con beneficiario, fecha (dd/mm), monto
3. Hacer clic de nuevo → debe colapsar
4. Verificar que los totales siguen siendo iguales a los anteriores (no se rompió nada)
5. Verificar que líneas con $0.00 y sin registros no muestran la flecha ▼
6. Si el mes tiene 700+ cobros, verificar que "Cobros transf./depósito" muestra "... y N más"

- [ ] **Step 5: Commit y push**

```bash
git add src/components/contabilidad/talonario/ResumenTalonario.js
git commit -m "feat: drill-down clickeable en ResumenTalonario — expandir registros por sección"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ FilaDetalle con toggle abierto/cerrado
- ✅ Datos raw guardados en `datos.raw`
- ✅ Todas las secciones MES mapeadas a registros
- ✅ Todas las secciones CONSOLIDADO mapeadas a registros
- ✅ Truncación a 200 con "... y N más"
- ✅ Formato fecha dd/mm
- ✅ Flecha ▼/▲ solo cuando hay registros
- ✅ Consumo Personal: `registros={[]}` (no tiene tabla de detalle individual, es monto único)

**Placeholders:** ninguno

**Consistencia de tipos:** `FilaDetalle` usa `valor` (number), `registros` (array `{nombre, fecha, monto}`). Los arrays `reg*` en Task 3 siguen esa misma forma consistentemente.
