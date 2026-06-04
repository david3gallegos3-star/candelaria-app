# Venta a Empleados con Crédito Nómina — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar ventas a empleados con forma de pago "Crédito nómina" que genera automáticamente un movimiento "Compra empresa" en su nómina, vinculado a la CxC, con checkbox para activar/desactivar el descuento por mes.

**Architecture:** Se añaden 3 columnas en BD (sin romper datos existentes), se extiende `TabNuevaVenta` para mezclar empleados con clientes y manejar la nueva forma de pago, y se actualiza `TabNomina` para mostrar checkboxes y el link a la factura en movimientos tipo `compra`.

**Tech Stack:** React, Supabase (PostgREST), SQL (migraciones directas vía Supabase Dashboard)

---

## Mapa de archivos

| Archivo | Acción | Qué cambia |
|---|---|---|
| `src/components/facturacion/TabNuevaVenta.js` | Modificar | Carga empleados, selector mixto, forma de pago crédito nómina, flujo al emitir |
| `src/components/rrhh/TabNomina.js` | Modificar | Checkbox activo/inactivo en compras, link factura, `generarNomina` filtra activos, marcar CxC pagada |
| Supabase Dashboard (SQL) | Migración | 3 columnas nuevas: `clientes.empleado_id`, `nomina_movimientos.cxc_id`, `nomina_movimientos.activo` |

---

## Task 1: Migraciones de base de datos

**Archivos:**
- No hay archivo local — ejecutar en Supabase Dashboard > SQL Editor

- [ ] **Step 1: Ejecutar migración en Supabase SQL Editor**

Ir a Supabase Dashboard → SQL Editor y ejecutar:

```sql
-- 1. Vincular clientes con empleados
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL;

-- 2. Vincular movimientos de nómina con CxC
ALTER TABLE nomina_movimientos
  ADD COLUMN IF NOT EXISTS cxc_id UUID REFERENCES cuentas_cobrar(id) ON DELETE SET NULL;

-- 3. Flag activo para controlar si el descuento aplica este mes
ALTER TABLE nomina_movimientos
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Verificar que las columnas existen**

En el mismo SQL Editor:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('clientes', 'nomina_movimientos')
  AND column_name IN ('empleado_id', 'cxc_id', 'activo')
ORDER BY table_name, column_name;
```

Resultado esperado: 3 filas, una por cada columna nueva.

- [ ] **Step 3: Commit de referencia**

```bash
git commit --allow-empty -m "feat: migraciones BD — empleado_id en clientes, cxc_id y activo en nomina_movimientos"
```

---

## Task 2: TabNuevaVenta — Selector mixto clientes + empleados

**Archivos:**
- Modificar: `src/components/facturacion/TabNuevaVenta.js`

- [ ] **Step 1: Añadir estado de empleados**

En `TabNuevaVenta.js`, después de la línea `const [clientes, setClientes] = useState([]);` (línea 32), agregar:

```js
const [empleados,  setEmpleados]  = useState([]);
const [clienteEsEmpleado, setClienteEsEmpleado] = useState(false);
const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
```

- [ ] **Step 2: Cargar empleados en `cargarDatos()`**

Reemplazar la llamada a `Promise.all` dentro de `cargarDatos()` (líneas 67–76) para incluir empleados:

```js
async function cargarDatos() {
  const [{ data: cls }, { data: emps }, { data: prods }, { data: prec }, { data: cfg }, { data: cfgPrec }, { data: cfgNV }] =
    await Promise.all([
      supabase.from('clientes').select('id,nombre,ruc,email,telefono,direccion,empleado_id')
        .not('eliminado', 'eq', true).order('nombre'),
      supabase.from('empleados').select('id,nombre,cedula').eq('activo', true).order('nombre'),
      supabase.from('productos').select('id,nombre').eq('estado', 'ACTIVO').order('nombre'),
      supabase.from('precios_clientes').select('cliente_id,producto_nombre,precio_venta_kg'),
      supabase.from('config_sistema').select('valor').eq('clave', 'factura_secuencial').single(),
      supabase.from('config_productos').select('producto_nombre,precio_venta_kg'),
      supabase.from('config_sistema').select('valor').eq('clave', 'nota_venta_secuencial').single(),
    ]);
  setClientes(cls   || []);
  setEmpleados(emps || []);
  setProductos(prods || []);
  setPrecios(prec   || []);
  setConfigPrecios(cfgPrec || []);
  if (cfg?.valor)   setSecuencial(parseInt(cfg.valor));
  if (cfgNV?.valor) setSecuencialNV(parseInt(cfgNV.valor));
}
```

- [ ] **Step 3: Añadir "crédito nómina" a `FORMAS_PAGO` y función de selección de cliente**

Reemplazar el array `FORMAS_PAGO` (líneas 18–23) con:

```js
const FORMAS_PAGO = [
  { value: 'efectivo',        label: '💵 Efectivo'        },
  { value: 'transferencia',   label: '🏦 Transferencia'   },
  { value: 'cheque',          label: '📝 Cheque'           },
  { value: 'credito',         label: '📅 Crédito'          },
  { value: 'credito_nomina',  label: '🛒 Crédito nómina'  },
];
```

Después de la línea `const clienteObj = ...` (línea 86), agregar la función que maneja selección:

```js
function seleccionarCliente(valor) {
  if (valor.startsWith('emp_')) {
    const empId = valor.replace('emp_', '');
    const emp   = empleados.find(e => e.id === empId);
    setClienteEsEmpleado(true);
    setEmpleadoSeleccionado(emp || null);
    setFormaPago('credito_nomina');
    setClienteId(valor);
  } else {
    setClienteEsEmpleado(false);
    setEmpleadoSeleccionado(null);
    if (formaPago === 'credito_nomina') setFormaPago('efectivo');
    setClienteId(valor);
  }
}
```

- [ ] **Step 4: Actualizar `clienteObj` para resolver empleados**

Reemplazar las líneas 86–88 (`const clienteObj = ...`) con:

```js
const clienteObj = (() => {
  if (clienteId === 'consumidor_final') return CONSUMIDOR_FINAL;
  if (clienteId?.startsWith('emp_')) {
    const emp = empleados.find(e => e.id === clienteId.replace('emp_', ''));
    if (!emp) return CONSUMIDOR_FINAL;
    const clienteVinculado = clientes.find(c => c.empleado_id === emp.id);
    return clienteVinculado || {
      id: null, nombre: emp.nombre,
      ruc: emp.cedula || '9999999999999',
      email: '', telefono: '', direccion: '',
      _esEmpleadoSinCliente: true, _empleadoId: emp.id
    };
  }
  return clientes.find(c => c.id === clienteId) || CONSUMIDOR_FINAL;
})();
```

- [ ] **Step 5: Actualizar el selector de cliente en el JSX**

Buscar el `<select>` de cliente (busca `onChange={e => setClienteId(e.target.value)}`). Reemplazar:
- `onChange={e => setClienteId(e.target.value)}` → `onChange={e => seleccionarCliente(e.target.value)}`
- El `value` del select: reemplazar `value={clienteId}` → `value={clienteId}`  (sin cambio)

Agregar el grupo de empleados dentro del `<select>` después de las opciones de clientes:

```jsx
<select
  value={clienteId}
  onChange={e => seleccionarCliente(e.target.value)}
  style={inputStyle}
>
  <option value="consumidor_final">CONSUMIDOR FINAL</option>
  <optgroup label="── Clientes ──">
    {clientes.map(c => (
      <option key={c.id} value={c.id}>{c.nombre}</option>
    ))}
  </optgroup>
  {empleados.length > 0 && (
    <optgroup label="── Empleados ──">
      {empleados.map(e => (
        <option key={`emp_${e.id}`} value={`emp_${e.id}`}>
          {e.nombre} [Empleado]
        </option>
      ))}
    </optgroup>
  )}
</select>
```

- [ ] **Step 6: Filtrar forma de pago — crédito nómina solo para empleados**

Buscar el `<select>` de forma de pago (busca `onChange={e => setFormaPago(e.target.value)}`). Reemplazar su lista de opciones:

```jsx
{FORMAS_PAGO.filter(f =>
  f.value !== 'credito_nomina' || clienteEsEmpleado
).map(f => (
  <option key={f.value} value={f.value}>{f.label}</option>
))}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/facturacion/TabNuevaVenta.js
git commit -m "feat(facturacion): selector mixto clientes+empleados con crédito nómina"
```

---

## Task 3: TabNuevaVenta — Flujo crédito nómina al emitir

**Archivos:**
- Modificar: `src/components/facturacion/TabNuevaVenta.js`

- [ ] **Step 1: Añadir helper `resolverOCrearClienteEmpleado`**

Justo antes de la función `emitirFactura()` (línea 134), agregar:

```js
async function resolverOCrearClienteEmpleado(empleadoId, empleadoNombre, empleadoCedula) {
  const { data: existente } = await supabase
    .from('clientes')
    .select('id')
    .eq('empleado_id', empleadoId)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: nuevo } = await supabase.from('clientes').insert({
    nombre:      empleadoNombre,
    ruc:         empleadoCedula || '9999999999999',
    empleado_id: empleadoId,
    eliminado:   false,
  }).select('id').single();
  return nuevo.id;
}

function ultimoDiaMes() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    .toISOString().split('T')[0];
}

async function crearMovimientoNomina(empleadoId, valorTotal, numeroDoc, cxcId) {
  const hoy     = new Date();
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  await supabase.from('nomina_movimientos').insert({
    empleado_id: empleadoId,
    periodo,
    tipo:        'compra',
    valor:       valorTotal,
    descripcion: numeroDoc,
    cxc_id:      cxcId,
    activo:      true,
    fecha:       hoy.toISOString().split('T')[0],
  });
}
```

- [ ] **Step 2: Manejar crédito nómina en `emitirFactura()`**

Localizar el bloque `// 4. Si es crédito → crear cuenta x cobrar` dentro de `emitirFactura()` (líneas 205–217). Reemplazarlo con:

```js
// 4. CxC para crédito normal o crédito nómina
if (formaPago === 'credito' || formaPago === 'credito_nomina') {
  let clienteIdParaCxC = clienteObj.id;

  if (formaPago === 'credito_nomina' && empleadoSeleccionado) {
    clienteIdParaCxC = await resolverOCrearClienteEmpleado(
      empleadoSeleccionado.id,
      empleadoSeleccionado.nombre,
      empleadoSeleccionado.cedula
    );
    // Actualizar factura con el cliente_id resuelto si era nuevo
    if (!clienteObj.id) {
      await supabase.from('facturas').update({ cliente_id: clienteIdParaCxC }).eq('id', factura.id);
    }
  }

  const venc = formaPago === 'credito_nomina'
    ? ultimoDiaMes()
    : (() => { const v = new Date(); v.setDate(v.getDate() + diasCredito); return v.toISOString().split('T')[0]; })();

  const { data: cxc } = await supabase.from('cuentas_cobrar').insert({
    factura_id:        factura.id,
    cliente_id:        clienteIdParaCxC,
    monto_total:       total,
    monto_cobrado:     0,
    estado:            'pendiente',
    fecha_vencimiento: venc,
  }).select('id').single();

  if (formaPago === 'credito_nomina' && empleadoSeleccionado && cxc) {
    await crearMovimientoNomina(empleadoSeleccionado.id, total, numero, cxc.id);
  }
}
```

- [ ] **Step 3: Manejar crédito nómina en `guardarBorrador()`**

Localizar el bloque `if (formaPago === 'credito')` dentro del try de `guardarBorrador()` (líneas 298–306). Reemplazarlo con:

```js
if (formaPago === 'credito' || formaPago === 'credito_nomina') {
  let clienteIdParaCxC = clienteObj.id;

  if (formaPago === 'credito_nomina' && empleadoSeleccionado) {
    clienteIdParaCxC = await resolverOCrearClienteEmpleado(
      empleadoSeleccionado.id,
      empleadoSeleccionado.nombre,
      empleadoSeleccionado.cedula
    );
    if (!clienteObj.id) {
      await supabase.from('facturas').update({ cliente_id: clienteIdParaCxC }).eq('id', facturaId);
    }
  }

  const venc = formaPago === 'credito_nomina'
    ? ultimoDiaMes()
    : (() => { const v = new Date(); v.setDate(v.getDate() + diasCredito); return v.toISOString().split('T')[0]; })();

  const { data: cxc } = await supabase.from('cuentas_cobrar').insert({
    factura_id: facturaId, cliente_id: clienteIdParaCxC,
    monto_total: total, monto_cobrado: 0, estado: 'pendiente',
    fecha_vencimiento: venc,
  }).select('id').single();

  if (formaPago === 'credito_nomina' && empleadoSeleccionado && cxc) {
    await crearMovimientoNomina(empleadoSeleccionado.id, total, numero, cxc.id);
  }
}
```

- [ ] **Step 4: Manejar crédito nómina en `emitirNotaVenta()`**

Localizar el bloque `if (formaPago === 'credito')` dentro del try de `emitirNotaVenta()` (líneas 453–461). Reemplazarlo con:

```js
if (formaPago === 'credito' || formaPago === 'credito_nomina') {
  let clienteIdParaCxC = clienteObj.id;

  if (formaPago === 'credito_nomina' && empleadoSeleccionado) {
    clienteIdParaCxC = await resolverOCrearClienteEmpleado(
      empleadoSeleccionado.id,
      empleadoSeleccionado.nombre,
      empleadoSeleccionado.cedula
    );
    if (!clienteObj.id) {
      await supabase.from('facturas').update({ cliente_id: clienteIdParaCxC }).eq('id', factura.id);
    }
  }

  const venc = formaPago === 'credito_nomina'
    ? ultimoDiaMes()
    : (() => { const v = new Date(); v.setDate(v.getDate() + diasCredito); return v.toISOString().split('T')[0]; })();

  const { data: cxc } = await supabase.from('cuentas_cobrar').insert({
    factura_id: factura.id, cliente_id: clienteIdParaCxC,
    monto_total: total, monto_cobrado: 0, estado: 'pendiente',
    fecha_vencimiento: venc,
  }).select('id').single();

  if (formaPago === 'credito_nomina' && empleadoSeleccionado && cxc) {
    await crearMovimientoNomina(empleadoSeleccionado.id, total, numero, cxc.id);
  }
}
```

- [ ] **Step 5: Resetear estado de empleado en `nuevaFactura()`**

En la función `nuevaFactura()` (línea 488), agregar al final del bloque:

```js
function nuevaFactura() {
  setFacturaEmitida(null);
  setItems([itemVacio()]);
  setObservaciones('');
  setFormaPago('efectivo');
  setClienteId('consumidor_final');
  setClienteEsEmpleado(false);
  setEmpleadoSeleccionado(null);
  setError(''); setErrorTipo('interno');
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/facturacion/TabNuevaVenta.js
git commit -m "feat(facturacion): flujo crédito nómina — CxC + movimiento nómina automático"
```

---

## Task 4: TabNomina — Checkbox activo + link factura + marcar CxC pagada

**Archivos:**
- Modificar: `src/components/rrhh/TabNomina.js`

- [ ] **Step 1: Actualizar `sumaMov` para respetar campo `activo` en compras**

Localizar la línea (cerca de 239):
```js
const sumaMov = (empId, tipo) => movsEmp(empId).filter(m => m.tipo === tipo).reduce((s, m) => s + parseFloat(m.valor || 0), 0);
```

Reemplazar con:

```js
const sumaMov = (empId, tipo) => movsEmp(empId)
  .filter(m => m.tipo === tipo && (m.tipo !== 'compra' || m.activo !== false))
  .reduce((s, m) => s + parseFloat(m.valor || 0), 0);
```

- [ ] **Step 2: Añadir función para toggle activo**

Justo después de `eliminarMov` (línea 263), agregar:

```js
async function toggleActivoMov(mov) {
  await supabase.from('nomina_movimientos')
    .update({ activo: !mov.activo })
    .eq('id', mov.id);
  await cargar();
}
```

- [ ] **Step 3: Añadir estado para modal de factura**

Cerca del resto de estados (línea 193), agregar:

```js
const [modalFactura, setModalFactura] = useState(null);
```

- [ ] **Step 4: Añadir función para ver factura de un movimiento**

Después de `toggleActivoMov`, agregar:

```js
async function verFacturaMov(mov) {
  if (!mov.cxc_id) return;
  const { data: cxc } = await supabase
    .from('cuentas_cobrar')
    .select('factura_id, monto_total, estado, fecha_vencimiento, facturas(numero, total, estado, tipo, created_at)')
    .eq('id', mov.cxc_id)
    .maybeSingle();
  if (cxc) setModalFactura(cxc);
}
```

- [ ] **Step 5: Actualizar `generarNomina()` — solo compras activas, marcar CxC pagada**

Reemplazar la línea:
```js
const comprasEmp = parseFloat(sumaMov(emp.id, 'compra').toFixed(2));
```
con:
```js
const comprasEmp = parseFloat(
  movsEmp(emp.id)
    .filter(m => m.tipo === 'compra' && m.activo !== false)
    .reduce((s, m) => s + parseFloat(m.valor || 0), 0)
    .toFixed(2)
);
```

Después de `const { error } = await supabase.from('nomina').insert(rows);` (línea 324), agregar:

```js
if (!error) {
  // Marcar como pagadas las CxC de compras activas
  const cxcIds = movimientos
    .filter(m => m.tipo === 'compra' && m.activo !== false && m.cxc_id)
    .map(m => m.cxc_id);
  if (cxcIds.length > 0) {
    await supabase.from('cuentas_cobrar')
      .update({ estado: 'pagada', monto_cobrado: supabase.raw('monto_total') })
      .in('id', cxcIds);
  }
  await cargar();
}
```

Nota: `supabase.raw` no existe en el cliente JS. Reemplazar la línea del update con:

```js
if (cxcIds.length > 0) {
  for (const id of cxcIds) {
    const { data: cxcRow } = await supabase
      .from('cuentas_cobrar').select('monto_total').eq('id', id).single();
    if (cxcRow) {
      await supabase.from('cuentas_cobrar')
        .update({ estado: 'pagada', monto_cobrado: cxcRow.monto_total })
        .eq('id', id);
    }
  }
}
```

- [ ] **Step 6: Actualizar el render de cada movimiento en el modal**

Localizar el `.map(mov => {` dentro del modal de movimientos (línea 642). Reemplazar el bloque completo del `<div key={mov.id} ...>` con:

```jsx
{movsEmp(modalMov.id).map(mov => {
  const t = TIPOS_MOV.find(x => x.value === mov.tipo) || TIPOS_MOV[0];
  const esCompra = mov.tipo === 'compra';
  const activo   = mov.activo !== false;
  return (
    <div key={mov.id} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 12px', borderRadius: '8px', marginBottom: '6px',
      background: esCompra && !activo ? '#fafafa' : '#f8f9fa',
      borderLeft: `3px solid ${activo ? t.color : '#ccc'}`,
      opacity: esCompra && !activo ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {esCompra && (
          <input
            type="checkbox"
            checked={activo}
            onChange={() => toggleActivoMov(mov)}
            style={{ cursor: 'pointer', width: 15, height: 15 }}
            title={activo ? 'Desactivar (no descontar este mes)' : 'Activar (descontar este mes)'}
          />
        )}
        <div>
          <span style={{ fontWeight: 'bold', fontSize: '12px', color: activo ? t.color : '#aaa' }}>
            {t.label}
          </span>
          {mov.descripcion && (
            <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{mov.descripcion}</span>
          )}
          {mov.horas > 0 && (
            <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>
              {mov.horas}h × ${parseFloat(mov.valor_hora || 0).toFixed(2)}
            </span>
          )}
          <span style={{ fontSize: '11px', color: '#bbb', marginLeft: '8px' }}>{mov.fecha}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 'bold', color: activo ? t.color : '#aaa' }}>
          ${parseFloat(mov.valor || 0).toFixed(2)}
        </span>
        {esCompra && mov.cxc_id && (
          <button
            onClick={() => verFacturaMov(mov)}
            title="Ver factura"
            style={{
              background: 'none', border: 'none',
              color: '#2980b9', cursor: 'pointer', fontSize: '15px', padding: 0
            }}>
            🧾
          </button>
        )}
        <button onClick={() => eliminarMov(mov.id)} style={{
          background: 'none', border: 'none',
          color: '#e74c3c', cursor: 'pointer', fontSize: '16px'
        }}>✕</button>
      </div>
    </div>
  );
})}
```

- [ ] **Step 7: Agregar modal de detalle de factura**

Al final del JSX del componente (antes del último `</div>` de cierre del modal de movimientos), agregar:

```jsx
{modalFactura && (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
  }} onClick={() => setModalFactura(null)}>
    <div style={{
      background: 'white', borderRadius: '14px',
      padding: '24px', maxWidth: 360, width: '90%',
      boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
    }} onClick={e => e.stopPropagation()}>
      <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: 12, color: '#2c1a4a' }}>
        🧾 Factura vinculada
      </div>
      <div style={{ fontSize: '13px', color: '#555', lineHeight: '1.8' }}>
        <div><b>Número:</b> {modalFactura.facturas?.numero || '—'}</div>
        <div><b>Total:</b> ${parseFloat(modalFactura.monto_total || 0).toFixed(2)}</div>
        <div><b>Estado CxC:</b> {modalFactura.estado}</div>
        <div><b>Vencimiento:</b> {modalFactura.fecha_vencimiento}</div>
        <div><b>Estado factura:</b> {modalFactura.facturas?.estado || '—'}</div>
        <div><b>Tipo:</b> {modalFactura.facturas?.tipo === 'nota_venta' ? 'Nota de venta' : 'Factura'}</div>
      </div>
      <button onClick={() => setModalFactura(null)} style={{
        marginTop: 16, background: '#2c1a4a', color: 'white',
        border: 'none', borderRadius: 8, padding: '8px 20px',
        cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
      }}>
        Cerrar
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 8: Commit**

```bash
git add src/components/rrhh/TabNomina.js
git commit -m "feat(nomina): checkbox activo en compras, link factura, CxC se marca pagada al generar nómina"
```

---

## Verificación final

- [ ] Ir a **Facturación → Nueva Venta**, abrir el selector de cliente → los empleados aparecen en un grupo separado con `[Empleado]`
- [ ] Seleccionar un empleado → la forma de pago cambia automáticamente a "Crédito nómina"
- [ ] Cambiar a efectivo → el flujo funciona igual que antes (sin crear CxC ni movimiento en nómina)
- [ ] Dejar "Crédito nómina" y generar nota de venta → confirmar que se crea la CxC y el movimiento en `nomina_movimientos`
- [ ] Ir a **RRHH → Nómina**, abrir movimientos del empleado → aparece "Compra empresa" con checkbox marcado y ícono de factura
- [ ] Desmarcar el checkbox → el movimiento se ve atenuado y el total del resumen acumulado baja
- [ ] Hacer clic en 🧾 → aparece el modal con los datos de la factura
- [ ] Generar nómina → la CxC de la compra activa queda como `'pagada'`
