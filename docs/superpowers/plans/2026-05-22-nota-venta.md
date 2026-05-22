# Nota de Venta Interna — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón "📋 Nota de venta" en TabNuevaVenta que emite documentos internos sin SRI, con numeración propia NV-001-001-XXXXXXXXX, almacenados en `facturas` con `tipo='nota_venta'` y asiento contable tipo interno.

**Architecture:** Se reutiliza la tabla `facturas` añadiendo columna `tipo VARCHAR DEFAULT 'factura'`. El secuencial propio vive en `config_sistema` como `nota_venta_secuencial`. `emitirNotaVenta()` sigue el mismo patrón que `guardarBorrador()` pero con `estado='autorizada'` directo. El sync offline detecta `tipo='nota_venta'` y omite la llamada al SRI.

**Tech Stack:** React 18, Supabase (PostgREST), `supabaseReal` para inserts directos, `generarAsientoFactura(..., 'interno')` ya implementado.

---

## File Map

| Archivo | Cambio |
|---------|--------|
| Base de datos (SQL manual) | Añadir columna `tipo` + fila `nota_venta_secuencial` |
| `src/lib/offlineBorradores.js` | Documentar campo `tipo` (ya se guarda como parte del objeto) |
| `src/components/facturacion/TabNuevaVenta.js` | `secuencialNV`, `emitirNotaVenta()`, botón morado, pantalla éxito |
| `src/components/facturacion/TabFacturas.js` | Badge "📋 NV", filtro, ocultar botones SRI/Anular |
| `src/hooks/useNetworkStatus.js` | `syncBorradores()`: nota_venta → no llama SRI, solo inserta |

---

## Task 1: DB — Columna `tipo` y secuencial `nota_venta_secuencial`

> Este paso es **manual**: ejecutar en el editor SQL de Supabase.

**Files:**
- Modify: base de datos Supabase (SQL manual — no hay archivo de migración en este proyecto)

- [ ] **Step 1: Ejecutar SQL en Supabase**

Abrir Supabase → SQL Editor y ejecutar:

```sql
-- Añadir columna tipo a facturas (existentes quedan como 'factura' por el DEFAULT)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS tipo VARCHAR DEFAULT 'factura';

-- Crear secuencial propio para notas de venta
INSERT INTO config_sistema (clave, valor, descripcion)
VALUES ('nota_venta_secuencial', '1', 'Secuencial para notas de venta internas')
ON CONFLICT (clave) DO NOTHING;
```

- [ ] **Step 2: Verificar en Supabase**

En Table Editor → `facturas`: confirmar que la columna `tipo` existe y las filas existentes tienen `tipo = 'factura'`.

En Table Editor → `config_sistema`: confirmar que existe la fila con `clave = 'nota_venta_secuencial'` y `valor = '1'`.

---

## Task 2: TabNuevaVenta — Estado, carga y función `emitirNotaVenta()`

**Files:**
- Modify: `src/components/facturacion/TabNuevaVenta.js`

- [ ] **Step 1: Añadir estado `secuencialNV` junto a los otros estados (línea ~35)**

Localizar el bloque de estados al inicio del componente. Después de `const [secuencial, setSecuencial] = useState(null);` (línea 35), añadir:

```js
const [secuencialNV, setSecuencialNV] = useState(null);
```

- [ ] **Step 2: Cargar `nota_venta_secuencial` en `cargarDatos()` (línea ~64)**

En `cargarDatos()`, el `Promise.all` actual tiene 5 elementos. Añadir uno más:

```js
async function cargarDatos() {
  const [{ data: cls }, { data: prods }, { data: prec }, { data: cfg }, { data: cfgPrec }, { data: cfgNV }] =
    await Promise.all([
      supabase.from('clientes').select('id,nombre,ruc,email,telefono,direccion')
        .not('eliminado', 'eq', true).order('nombre'),
      supabase.from('productos').select('id,nombre').eq('estado', 'ACTIVO').order('nombre'),
      supabase.from('precios_clientes').select('cliente_id,producto_nombre,precio_venta_kg'),
      supabase.from('config_sistema').select('valor').eq('clave', 'factura_secuencial').single(),
      supabase.from('config_productos').select('producto_nombre,precio_venta_kg'),
      supabase.from('config_sistema').select('valor').eq('clave', 'nota_venta_secuencial').single(),
    ]);
  setClientes(cls   || []);
  setProductos(prods || []);
  setPrecios(prec   || []);
  setConfigPrecios(cfgPrec || []);
  if (cfg?.valor)   setSecuencial(parseInt(cfg.valor));
  if (cfgNV?.valor) setSecuencialNV(parseInt(cfgNV.valor));
}
```

- [ ] **Step 3: Añadir función `emitirNotaVenta()` justo después de `guardarBorrador()`**

Insertar esta función después del cierre de `guardarBorrador()` (aproximadamente línea 351, después de `setEmitiendo(false);` de guardarBorrador):

```js
// ── Emitir nota de venta interna (sin SRI) ───────────────
async function emitirNotaVenta() {
  setError('');
  if (!items.some(i => i.producto_nombre && parseFloat(i.cantidad) > 0))
    return setError('Agrega al menos un producto con cantidad');
  if (subtotal <= 0)
    return setError('El subtotal debe ser mayor a 0');
  if (secuencialNV === null)
    return setError('No se pudo cargar el número de nota de venta');

  setEmitiendo(true);
  const itemsValidos = items.filter(i => i.producto_nombre && parseFloat(i.cantidad) > 0);
  const numero = `NV-001-001-${String(secuencialNV).padStart(9, '0')}`;

  const facturaPayload = {
    cliente_id:       clienteObj.id,
    numero,
    autorizacion_sri: null, datil_id: null, pdf_url: null, xml_url: null,
    estado:           'autorizada',
    tipo:             'nota_venta',
    subtotal, iva, total, porcentaje_iva: 15,
    forma_pago:       formaPago,
    dias_credito:     formaPago === 'credito' ? diasCredito : 0,
    observaciones,
    vendedor:         currentUser?.email || '',
    created_by:       currentUser?.email || '',
  };
  const detallePayload = itemsValidos.map(it => ({
    producto_nombre: it.producto_nombre,
    descripcion:     it.descripcion || it.producto_nombre,
    cantidad:        parseFloat(it.cantidad),
    precio_unitario: parseFloat(it.precio_unitario),
    subtotal:        parseFloat(it.subtotal),
  }));

  if (!navigator.onLine) {
    const nvId = `offline-nv-${Date.now()}`;
    addOfflineBorrador({
      id: nvId,
      tipo: 'nota_venta',
      facturaPayload,
      detallePayload,
      clienteData:  clienteObj,
      formaPago, diasCredito, observaciones,
      subtotal, iva, total, numero,
      vendedor: currentUser?.email || '',
      timestamp: Date.now(),
    });
    await supabase.from('config_sistema')
      .update({ valor: String(secuencialNV + 1), updated_at: new Date().toISOString() })
      .eq('clave', 'nota_venta_secuencial');
    setSecuencialNV(prev => prev + 1);
    setFacturaEmitida({ numero, cliente: clienteObj.nombre, total, esBorrador: true, tipo: 'nota_venta' });
    setEmitiendo(false);
    return;
  }

  try {
    const { data: factura, error: errF } = await supabaseReal.from('facturas')
      .insert(facturaPayload).select().single();
    if (errF) throw errF;

    await supabaseReal.from('facturas_detalle').insert(
      detallePayload.map(it => ({ ...it, factura_id: factura.id }))
    );

    if (formaPago === 'credito') {
      const venc = new Date();
      venc.setDate(venc.getDate() + diasCredito);
      await supabase.from('cuentas_cobrar').insert({
        factura_id: factura.id, cliente_id: clienteObj.id,
        monto_total: total, monto_cobrado: 0, estado: 'pendiente',
        fecha_vencimiento: venc.toISOString().split('T')[0]
      });
    }

    await supabase.from('config_sistema')
      .update({ valor: String(secuencialNV + 1), updated_at: new Date().toISOString() })
      .eq('clave', 'nota_venta_secuencial');
    setSecuencialNV(prev => prev + 1);

    generarAsientoFactura({
      id: factura.id, numero, subtotal, iva, total,
      cliente_nombre: clienteObj.nombre, metodo_pago: formaPago
    }, 'interno').catch(console.error);

    setFacturaEmitida({ numero, cliente: clienteObj.nombre, total, tipo: 'nota_venta' });

  } catch (e) {
    setError('Error al registrar nota de venta: ' + e.message);
  }
  setEmitiendo(false);
}
```

- [ ] **Step 4: Verificar build**

```bash
cd c:\Users\david\candelaria-app && npm run build 2>&1 | tail -20
```

Esperado: `Compiled successfully.` sin errores de sintaxis.

- [ ] **Step 5: Commit**

```bash
git add src/components/facturacion/TabNuevaVenta.js
git commit -m "feat: añadir estado secuencialNV y función emitirNotaVenta()"
```

---

## Task 3: TabNuevaVenta — Botón morado y pantalla de éxito

**Files:**
- Modify: `src/components/facturacion/TabNuevaVenta.js`

- [ ] **Step 1: Añadir botón "📋 Nota de venta" junto al botón "Emitir factura"**

Localizar el bloque `{/* Totales + Botón emitir */}` (línea ~665). Dentro del `<div style={{ display: 'flex', gap: 8, ... }}>` que contiene el botón principal, añadir el segundo botón **después** del botón existente:

```jsx
{/* Dentro de: <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}> */}

{!isOnline && (
  <span style={{ fontSize: '11px', color: '#f39c12', fontWeight: 'bold' }}>
    📴 Sin internet — se guardará como borrador
  </span>
)}
<button
  onClick={isOnline ? emitirFactura : guardarBorrador}
  disabled={emitiendo || subtotal <= 0}
  style={{
    background: emitiendo || subtotal <= 0 ? '#95a5a6'
      : isOnline ? '#27ae60' : '#f39c12',
    color: 'white', border: 'none', borderRadius: 10,
    padding: mobile ? '12px 20px' : '12px 28px',
    cursor: emitiendo || subtotal <= 0 ? 'not-allowed' : 'pointer',
    fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap'
  }}>
  {emitiendo
    ? (isOnline ? '⏳ Emitiendo...' : '⏳ Guardando...')
    : isOnline ? '🧾 Emitir factura' : '💾 Emitir factura'}
</button>
<button
  onClick={emitirNotaVenta}
  disabled={emitiendo || subtotal <= 0}
  style={{
    background: emitiendo || subtotal <= 0 ? '#95a5a6' : '#8e44ad',
    color: 'white', border: 'none', borderRadius: 10,
    padding: mobile ? '12px 20px' : '12px 28px',
    cursor: emitiendo || subtotal <= 0 ? 'not-allowed' : 'pointer',
    fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap'
  }}>
  {emitiendo ? '⏳...' : '📋 Nota de venta'}
</button>
```

- [ ] **Step 2: Actualizar la pantalla de éxito para tipo='nota_venta'**

Localizar el bloque `if (facturaEmitida) return (` (línea ~374). Reemplazar el bloque completo con:

```jsx
if (facturaEmitida) return (
  <div style={{
    background: 'white', borderRadius: '14px',
    padding: mobile ? '20px 16px' : '30px',
    maxWidth: 500, margin: '20px auto',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    textAlign: 'center'
  }}>
    <div style={{ fontSize: 56, marginBottom: 12 }}>
      {facturaEmitida.tipo === 'nota_venta' ? '📋'
        : facturaEmitida.esBorrador ? '💾' : '✅'}
    </div>
    <div style={{
      fontSize: '20px', fontWeight: 'bold', marginBottom: 8,
      color: facturaEmitida.tipo === 'nota_venta' ? '#8e44ad'
        : facturaEmitida.esBorrador ? '#f39c12' : '#27ae60'
    }}>
      {facturaEmitida.tipo === 'nota_venta'
        ? (facturaEmitida.esBorrador ? '📋 Nota de venta guardada' : '¡Nota de venta registrada!')
        : (facturaEmitida.esBorrador ? '¡Borrador guardado!' : '¡Factura emitida!')}
    </div>
    <div style={{ fontSize: '15px', color: '#555', marginBottom: 20 }}>
      {facturaEmitida.numero} — {facturaEmitida.cliente}
    </div>

    {facturaEmitida.esBorrador && facturaEmitida.tipo !== 'nota_venta' && (
      <div style={{
        background: '#fff8f0', border: '1px solid #f39c12', borderRadius: 10,
        padding: '10px 14px', marginBottom: 16, fontSize: '12px', color: '#856404'
      }}>
        📶 Sin conexión al momento de emitir. La factura se enviará automáticamente al SRI cuando se restaure el internet.
      </div>
    )}

    {facturaEmitida.esBorrador && facturaEmitida.tipo === 'nota_venta' && (
      <div style={{
        background: '#f9f0ff', border: '1px solid #8e44ad', borderRadius: 10,
        padding: '10px 14px', marginBottom: 16, fontSize: '12px', color: '#6c3483'
      }}>
        📴 Sin conexión. La nota de venta se registrará automáticamente al restaurarse el internet.
      </div>
    )}

    <div style={{
      background: '#f8f9fa', borderRadius: 10,
      padding: '14px 16px', marginBottom: 20, textAlign: 'left'
    }}>
      {facturaEmitida.tipo !== 'nota_venta' && (
        <>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: 6 }}>Autorización SRI</div>
          <div style={{
            fontSize: '11px', color: '#1a1a2e', fontWeight: 'bold',
            wordBreak: 'break-all', fontFamily: 'monospace'
          }}>
            {facturaEmitida.autorizacion || '(pendiente — borrador)'}
          </div>
        </>
      )}
      <div style={{ marginTop: facturaEmitida.tipo !== 'nota_venta' ? 10 : 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          background: facturaEmitida.tipo === 'nota_venta' ? '#f3e5f5' : '#e8f5e9',
          borderRadius: 8, padding: '6px 12px',
          fontSize: '13px', fontWeight: 'bold',
          color: facturaEmitida.tipo === 'nota_venta' ? '#8e44ad' : '#27ae60'
        }}>
          TOTAL: ${facturaEmitida.total?.toFixed(2)}
        </div>
        {facturaEmitida.pdf_url && (
          <a href={facturaEmitida.pdf_url} target="_blank" rel="noreferrer" style={{
            background: '#e8f4fd', borderRadius: 8,
            padding: '6px 12px', fontSize: '13px',
            fontWeight: 'bold', color: '#2980b9',
            textDecoration: 'none'
          }}>📄 Ver RIDE</a>
        )}
      </div>
    </div>

    <button onClick={nuevaFactura} style={{
      background: '#2980b9', color: 'white', border: 'none',
      borderRadius: 10, padding: '12px 28px',
      cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
    }}>+ Nueva factura</button>
  </div>
);
```

- [ ] **Step 3: Verificar build**

```bash
cd c:\Users\david\candelaria-app && npm run build 2>&1 | tail -20
```

Esperado: `Compiled successfully.`

- [ ] **Step 4: Commit**

```bash
git add src/components/facturacion/TabNuevaVenta.js
git commit -m "feat: botón nota de venta morado y pantalla éxito diferenciada"
```

---

## Task 4: TabFacturas — Badge, filtro y ocultar botones SRI/Anular

**Files:**
- Modify: `src/components/facturacion/TabFacturas.js`

- [ ] **Step 1: Actualizar `facturasFiltradas` para filtrar por `tipo='nota_venta'`**

Localizar el bloque de filtros (línea ~176):

```js
// ANTES:
const facturasFiltradas = facturas.filter(f => {
  const textoOk = !filtroTexto ||
    f.numero?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
    (f.cliente_nombre || '').toLowerCase().includes(filtroTexto.toLowerCase());
  const estadoOk = filtroEstado === 'todas' || f.estado === filtroEstado;
  return textoOk && estadoOk;
});
```

Reemplazar con:

```js
const facturasFiltradas = facturas.filter(f => {
  const textoOk = !filtroTexto ||
    f.numero?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
    (f.cliente_nombre || '').toLowerCase().includes(filtroTexto.toLowerCase());
  const estadoOk = filtroEstado === 'nota_venta'
    ? f.tipo === 'nota_venta'
    : filtroEstado === 'todas' || f.estado === filtroEstado;
  return textoOk && estadoOk;
});
```

- [ ] **Step 2: Añadir opción "Notas de venta" en el `<select>` de filtros**

Localizar el `<select value={filtroEstado} ...>` (línea ~220). Añadir la opción después de "Borradores":

```jsx
<select
  value={filtroEstado}
  onChange={e => setFiltroEstado(e.target.value)}
  style={inputStyle}
>
  <option value="todas">Todas</option>
  <option value="autorizada">Autorizadas</option>
  <option value="borrador">Borradores</option>
  <option value="anulada">Anuladas</option>
  <option value="nota_venta">Notas de venta</option>
</select>
```

- [ ] **Step 3: Añadir badge "📋 NV" morado en la fila principal**

Localizar el bloque del número de factura (línea ~278-291). Después del badge `{f._local && ...}`, añadir el badge de nota_venta:

```jsx
{f.numero}
<span style={{
  marginLeft: 8, fontSize: '10px',
  background: est.bg, color: est.color,
  padding: '2px 8px', borderRadius: 8
}}>{est.label}</span>
{f.tipo === 'nota_venta' && (
  <span style={{
    marginLeft: 6, fontSize: '10px',
    background: '#f3e5f5', color: '#8e44ad',
    padding: '2px 8px', borderRadius: 8, fontWeight: 'bold'
  }}>📋 Nota de venta</span>
)}
{f._local && (
  <span style={{
    marginLeft: 6, fontSize: '10px',
    background: '#fef3c7', color: '#92400e',
    padding: '2px 8px', borderRadius: 8
  }}>📴 sin internet</span>
)}
```

- [ ] **Step 4: Ocultar botones SRI y Anular para `tipo='nota_venta'`**

Localizar el bloque de botones (línea ~337-366). Aplicar la condición `tipo !== 'nota_venta'` para ocultar "Emitir al SRI" y "Anular":

```jsx
{/* Emitir al SRI: solo facturas normales en borrador, no nota_venta */}
{f.estado === 'borrador' && !f._local && f.tipo !== 'nota_venta' && (
  <button
    onClick={() => emitirBorrador(f)}
    disabled={emitiendoId === f.id}
    style={{
      background: emitiendoId === f.id ? '#95a5a6' : '#f39c12',
      color: 'white', border: 'none',
      borderRadius: 7, padding: '6px 12px',
      cursor: emitiendoId === f.id ? 'not-allowed' : 'pointer',
      fontWeight: 'bold', fontSize: '12px'
    }}>
    {emitiendoId === f.id ? '⏳ Emitiendo...' : '📤 Emitir al SRI'}
  </button>
)}
{f.estado === 'borrador' && f._local && (
  <span style={{
    fontSize: '11px', color: '#92400e',
    padding: '6px 10px', background: '#fef3c7',
    borderRadius: 7, fontWeight: 'bold'
  }}>⏳ Se enviará al conectarse</span>
)}

{/* Anular: solo facturas normales autorizadas, nunca nota_venta */}
{f.estado === 'autorizada' && f.tipo !== 'nota_venta' && (
  <button onClick={() => { setModalAnular(f); setMotivoAnul(''); }} style={{
    background: 'white', color: '#e74c3c',
    border: '1.5px solid #e74c3c',
    borderRadius: 7, padding: '6px 12px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  }}>🚫 Anular</button>
)}
```

- [ ] **Step 5: Verificar build**

```bash
cd c:\Users\david\candelaria-app && npm run build 2>&1 | tail -20
```

Esperado: `Compiled successfully.`

- [ ] **Step 6: Commit**

```bash
git add src/components/facturacion/TabFacturas.js
git commit -m "feat: badge nota_venta, filtro y ocultar botones SRI/Anular"
```

---

## Task 5: useNetworkStatus — Sync offline de nota_venta sin SRI

**Files:**
- Modify: `src/hooks/useNetworkStatus.js`

- [ ] **Step 1: En `syncBorradores()`, detectar `tipo='nota_venta'` y saltar la llamada al SRI**

Localizar el loop `for (const b of locales)` (línea ~65). Actualmente después de insertar la factura y el detalle, siempre llama a `/api/emitir-factura`. Reemplazar el bloque **desde** `offlineBorradores.removeBorrador(b.id)` **hasta** `emitidos++` con:

```js
// Eliminar del store local ahora que está en Supabase
offlineBorradores.removeBorrador(b.id);

if (b.tipo === 'nota_venta') {
  // Nota de venta: ya está autorizada, no necesita ir al SRI
  emitidos++;
  continue;
}

const secuencial = parseInt(b.numero.split('-').pop(), 10);
const res = await fetch('/api/emitir-factura', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cliente:       b.clienteData,
    items:         b.detallePayload,
    formaPago:     b.formaPago,
    diasCredito:   b.diasCredito || 0,
    observaciones: b.observaciones || '',
    vendedor:      b.vendedor || '',
    secuencial
  })
});
const data = await res.json();
if (!data.ok) continue; // quedó en Supabase como borrador, el paso 2 lo emitirá

await supabaseReal.from('facturas').update({
  estado: 'autorizada', autorizacion_sri: data.autorizacion,
  datil_id: data.datil_id, pdf_url: data.pdf_url, xml_url: data.xml_url,
}).eq('id', factura.id);
emitidos++;
```

El bloque completo del loop `for (const b of locales)` queda así:

```js
for (const b of locales) {
  try {
    const { data: factura, error: errF } = await supabaseReal.from('facturas')
      .insert(b.facturaPayload).select().single();
    if (errF || !factura?.id) continue;

    await supabaseReal.from('facturas_detalle').insert(
      b.detallePayload.map(it => ({ ...it, factura_id: factura.id }))
    );

    offlineBorradores.removeBorrador(b.id);

    if (b.tipo === 'nota_venta') {
      emitidos++;
      continue;
    }

    const secuencial = parseInt(b.numero.split('-').pop(), 10);
    const res = await fetch('/api/emitir-factura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente:       b.clienteData,
        items:         b.detallePayload,
        formaPago:     b.formaPago,
        diasCredito:   b.diasCredito || 0,
        observaciones: b.observaciones || '',
        vendedor:      b.vendedor || '',
        secuencial
      })
    });
    const data = await res.json();
    if (!data.ok) continue;

    await supabaseReal.from('facturas').update({
      estado: 'autorizada', autorizacion_sri: data.autorizacion,
      datil_id: data.datil_id, pdf_url: data.pdf_url, xml_url: data.xml_url,
    }).eq('id', factura.id);
    emitidos++;
  } catch { /* continuar */ }
}
```

- [ ] **Step 2: Verificar build**

```bash
cd c:\Users\david\candelaria-app && npm run build 2>&1 | tail -20
```

Esperado: `Compiled successfully.`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNetworkStatus.js
git commit -m "feat: syncBorradores omite SRI para tipo=nota_venta"
```

---

## Task 6: Verificación manual end-to-end

- [ ] **Step 1: Arrancar la app**

```bash
cd c:\Users\david\candelaria-app && npm start
```

- [ ] **Step 2: Test flujo online**

1. Ir a Facturación → Nueva venta
2. Añadir un producto con cantidad > 0
3. Hacer clic en "📋 Nota de venta"
4. Verificar: pantalla éxito muestra ícono `📋`, título "¡Nota de venta registrada!", sin campo "Autorización SRI"
5. Ir a TabFacturas → verificar que aparece el registro con badge "📋 Nota de venta" morado
6. Verificar que **no** aparece botón "Anular" ni "Emitir al SRI" en esa fila
7. Aplicar filtro "Notas de venta" → solo debe mostrar ese registro
8. Verificar en Supabase que la fila tiene `tipo='nota_venta'` y `estado='autorizada'`
9. Verificar en Libro Diario que existe el asiento con tipo `'interno'`

- [ ] **Step 3: Test flujo offline**

1. Desactivar internet (modo avión o desconectar)
2. Añadir producto, clic "📋 Nota de venta"
3. Pantalla éxito muestra "📋 Nota de venta guardada" con aviso morado de sin internet
4. En TabFacturas → aparece el registro con badge "📴 sin internet"
5. Reconectar internet
6. Verificar que el registro aparece en Supabase con `tipo='nota_venta'` y `estado='autorizada'`
7. Verificar que **no** se hizo llamada al SRI (revisar logs del servidor o confirmar que no hay `autorizacion_sri`)

- [ ] **Step 4: Commit final (si no se hicieron commits intermedios)**

Si todos los pasos anteriores se commitearon por tarea, este paso no aplica. Si se acumularon cambios sin commitear:

```bash
git add -A
git commit -m "feat: nota de venta interna — implementación completa"
```
