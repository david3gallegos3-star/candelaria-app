# Nota de Crédito y Anulación Manual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar dos flujos de anulación para facturas autorizadas: anulación manual (ya hecha en portal SRI) y nota de crédito electrónica vía Dátil.

**Architecture:** Se reemplaza la función `anularFactura()` existente (solo interna) por dos flujos separados. El flujo manual registra la anulación internamente y revierte contabilidad. El flujo NC llama a un nuevo endpoint Vercel que envía la nota de crédito a Dátil→SRI, luego hace lo mismo. Ambos ofrecen reingreso a inventario o registro de pérdida.

**Tech Stack:** React, Supabase (PostgREST), Vercel Serverless Functions, Dátil API (`https://link.datil.co/credit-notes/issue`)

---

## File Map

| Archivo | Acción |
|---|---|
| `api/emitir-nota-credito.js` | Crear — serverless function Dátil |
| `src/utils/asientosContables.js` | Modificar — agregar `revertirAsientoFactura` |
| `src/components/facturacion/TabFacturas.js` | Modificar — nuevos estados, funciones, modales, botones |
| Supabase SQL | Columnas en `notas_credito`, tabla `perdidas`, key en `config_sistema` |

---

## Task 1: Schema Supabase

**Files:**
- Supabase SQL Editor (ejecutar manualmente)

- [ ] **Step 1: Ejecutar SQL para columnas en notas_credito**

En el SQL Editor de Supabase ejecutar:

```sql
ALTER TABLE notas_credito
  ADD COLUMN IF NOT EXISTS autorizacion_sri text,
  ADD COLUMN IF NOT EXISTS datil_id         text,
  ADD COLUMN IF NOT EXISTS tipo_nc          text DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS es_manual        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_motivo      text,
  ADD COLUMN IF NOT EXISTS items_nc         jsonb,
  ADD COLUMN IF NOT EXISTS accion_producto  text DEFAULT 'no_aplica',
  ADD COLUMN IF NOT EXISTS motivo_perdida   text,
  ADD COLUMN IF NOT EXISTS numero           text;
```

- [ ] **Step 2: Crear tabla perdidas**

```sql
CREATE TABLE IF NOT EXISTS perdidas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id       uuid REFERENCES facturas(id),
  nota_credito_id  uuid REFERENCES notas_credito(id),
  motivo           text NOT NULL,
  items            jsonb,
  total            numeric(12,4),
  created_at       timestamptz DEFAULT now(),
  usuario_id       uuid REFERENCES auth.users(id)
);
```

- [ ] **Step 3: Insertar secuencial de notas de crédito**

```sql
INSERT INTO config_sistema (clave, valor, descripcion)
VALUES ('nota_credito_secuencial', '1', 'Secuencial notas de crédito electrónicas')
ON CONFLICT (clave) DO NOTHING;
```

- [ ] **Step 4: Verificar**

En Supabase Table Editor confirmar que:
- `notas_credito` tiene las nuevas columnas
- existe tabla `perdidas`
- en `config_sistema` hay fila con `clave = 'nota_credito_secuencial'`

---

## Task 2: `revertirAsientoFactura` en asientosContables.js

**Files:**
- Modify: `src/utils/asientosContables.js` (al final del archivo, antes del cierre)

- [ ] **Step 1: Agregar función al final de asientosContables.js**

Abrir `src/utils/asientosContables.js` y agregar después de `revertirAsientoNotaVenta`:

```javascript
export async function revertirAsientoFactura(factura) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const cuentaHaber = factura.forma_pago === 'credito'
    ? cuentas.cxc_id
    : cuentas.caja_general_id;
  const descripcion = `Anulación Factura - ${factura.numero} - ${factura.cliente_nombre}`;

  const lineas = [
    { cuenta_id: cuentas.ventas_gravadas_id, descripcion, debe: factura.subtotal, haber: 0,              orden: 0 },
    { cuenta_id: cuentas.iva_ventas_id,      descripcion, debe: factura.iva,      haber: 0,              orden: 1 },
    { cuenta_id: cuentaHaber,                descripcion, debe: 0,                haber: factura.total,  orden: 2 },
  ];

  return insertarAsiento({
    fecha,
    descripcion,
    tipo: 'tributario',
    origen: 'facturacion',
    origen_id: factura.id,
    lineas,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/asientosContables.js
git commit -m "feat: agregar revertirAsientoFactura para contra-asiento electronico"
```

---

## Task 3: `api/emitir-nota-credito.js`

**Files:**
- Create: `api/emitir-nota-credito.js`

- [ ] **Step 1: Crear el archivo**

```javascript
// api/emitir-nota-credito.js
// Emite nota de crédito electrónica a Dátil → SRI Ecuador

const DATIL_URL = 'https://link.datil.co/credit-notes/issue';

const TIPO_MOTIVO = {
  devolucion:   '01', // devolución de mercadería
  error_precio: '02', // anulación por error
  otro:         '02',
};

function tipoIdentificacion(id) {
  if (!id || id === '9999999999999') return '07';
  const limpio = id.replace(/[^0-9]/g, '');
  if (limpio.length === 13) return '04';
  if (limpio.length === 10) return '05';
  return '06';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    cliente,
    autorizacion_sri,
    numero_factura,
    fecha_emision_factura,
    motivo,
    tipo_motivo,
    items,
    secuencial,
  } = req.body;

  if (!autorizacion_sri)
    return res.status(400).json({ error: 'La factura no tiene código de autorización SRI' });
  if (!items || items.length === 0)
    return res.status(400).json({ error: 'Sin ítems en la nota de crédito' });

  const subtotal    = parseFloat(items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0).toFixed(2));
  const iva         = parseFloat((subtotal * 0.15).toFixed(2));
  const total       = parseFloat((subtotal + iva).toFixed(2));

  const fechaHoy      = new Date(Date.now() - 5 * 3600 * 1000).toISOString().split('T')[0];
  const secuencialStr = String(secuencial).padStart(9, '0');

  const payload = {
    ambiente:      1,
    tipo_emision:  1,
    secuencial:    secuencialStr,
    fecha_emision: fechaHoy,

    emisor: {
      ruc:                    '1002345351001',
      obligado_contabilidad:  false,
      contribuyente_especial: '',
      nombre_comercial:       'Corella Placencia Sebastian Francisco',
      razon_social:           'Corella Placencia Sebastian Francisco',
      direccion:              'Ibarra, Imbabura, Ecuador',
      establecimiento: {
        punto_emision: '001',
        codigo:        '001',
        direccion:     'Ibarra, Imbabura, Ecuador',
      },
    },

    comprador: {
      razon_social:        cliente.nombre || 'CONSUMIDOR FINAL',
      identificacion:      cliente.ruc    || '9999999999999',
      tipo_identificacion: tipoIdentificacion(cliente.ruc),
      email:               cliente.email     || '',
      telefono:            cliente.telefono  || '',
      direccion:           cliente.direccion || '',
    },

    documento_modificado: {
      tipo:                 '01',
      numero:               numero_factura,
      fecha_emision:        fecha_emision_factura,
      numero_autorizacion:  autorizacion_sri,
    },

    motivo,
    tipo: TIPO_MOTIVO[tipo_motivo] || '02',

    totales: {
      total_sin_impuestos: subtotal,
      impuestos: [{
        codigo:            '2',
        codigo_porcentaje: '4',
        base_imponible:    subtotal,
        valor:             iva,
      }],
      importe_total: total,
    },

    items: items.map((item, idx) => {
      const sub   = parseFloat(parseFloat(item.subtotal || 0).toFixed(2));
      const ivaIt = parseFloat((sub * 0.15).toFixed(2));
      return {
        cantidad:                   parseFloat(item.cantidad),
        codigo_principal:           item.codigo || String(idx + 1).padStart(3, '0'),
        precio_unitario:            parseFloat(parseFloat(item.precio_unitario).toFixed(4)),
        descripcion:                item.descripcion || item.producto_nombre,
        precio_total_sin_impuestos: sub,
        impuestos: [{
          codigo:            '2',
          codigo_porcentaje: '4',
          tarifa:            15,
          base_imponible:    sub,
          valor:             ivaIt,
        }],
        descuento: 0,
      };
    }),
  };

  try {
    const datilRes = await fetch(DATIL_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Key':        process.env.DATIL_API_KEY,
        'X-Password':   process.env.DATIL_PASSWORD,
      },
      body: JSON.stringify(payload),
    });

    const data = await datilRes.json();
    console.log('DATIL NC status:', datilRes.status, JSON.stringify(data, null, 2));

    if (!datilRes.ok) {
      const errores  = data?.errores || data?.errors || data?.mensaje || data;
      const mensajes = Array.isArray(errores)
        ? errores.map(e => `[${e.campo || ''}] ${e.mensaje || JSON.stringify(e)}`).join(' | ')
        : JSON.stringify(errores);
      return res.status(400).json({ error: mensajes || 'Error Dátil/SRI', detalle: data });
    }

    const estado = (data.estado || data.status || '').toLowerCase();
    if (['error', 'no_autorizada', 'rechazada', 'devuelta'].includes(estado)) {
      const errores  = data.errores || data.errors || [];
      const mensajes = Array.isArray(errores) && errores.length > 0
        ? errores.map(e => e.mensaje || JSON.stringify(e)).join(' | ')
        : `Dátil estado: ${estado}`;
      return res.status(422).json({ error: mensajes, estado, detalle: data });
    }

    const autorizacion = data.clave_acceso
      || data.autorizacion?.numero
      || (typeof data.autorizacion === 'string' ? data.autorizacion : '')
      || '';

    if (!autorizacion) {
      const errores  = data.errores || data.errors || [];
      const mensajes = Array.isArray(errores) && errores.length > 0
        ? errores.map(e => e.mensaje || JSON.stringify(e)).join(' | ')
        : 'NC no autorizada por el SRI';
      return res.status(422).json({ error: mensajes, detalle: data });
    }

    return res.status(200).json({
      ok:          true,
      datil_id:    data.id      || '',
      autorizacion,
      pdf_url:     data.pdf     || data.pdf_url || '',
      xml_url:     data.xml     || data.xml_url || '',
      subtotal,
      iva,
      total,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add api/emitir-nota-credito.js
git commit -m "feat: endpoint emitir-nota-credito via Datil SRI"
```

---

## Task 4: Anulación Manual en TabFacturas.js

**Files:**
- Modify: `src/components/facturacion/TabFacturas.js`

- [ ] **Step 1: Actualizar imports**

Reemplazar la línea de imports al inicio del archivo:

```javascript
import { revertirAsientoNotaVenta, revertirAsientoFactura } from '../../utils/asientosContables';
```

- [ ] **Step 2: Agregar estados para anulación manual**

Después de la línea `const [cargandoDetalle, setCargandoDetalle] = useState(false);` agregar:

```javascript
// ── Anulación manual ──
const [modalAnulManual,      setModalAnulManual]      = useState(null);
const [motivoManual,         setMotivoManual]          = useState('');
const [accionProdManual,     setAccionProdManual]      = useState('no_aplica');
const [itemsAnulManual,      setItemsAnulManual]       = useState([]);
const [motivoPerdidaManual,  setMotivoPerdidaManual]   = useState('');
const [procesandoManual,     setProcesandoManual]      = useState(false);
const [cargandoItemsModal,   setCargandoItemsModal]    = useState(false);
```

- [ ] **Step 3: Agregar función `abrirModalAnulManual`**

Después de `mostrarExito`, agregar:

```javascript
async function abrirModalAnulManual(f) {
  setModalAnulManual(f);
  setMotivoManual('');
  setAccionProdManual('no_aplica');
  setMotivoPerdidaManual('');
  setCargandoItemsModal(true);
  const { data } = await supabase.from('facturas_detalle')
    .select('*').eq('factura_id', f.id).order('id');
  setItemsAnulManual((data || []).map(d => ({ ...d, cantidadReingresar: d.cantidad })));
  setCargandoItemsModal(false);
}
```

- [ ] **Step 4: Agregar función `registrarAnulacionManual`**

```javascript
async function registrarAnulacionManual() {
  if (!motivoManual.trim()) return alert('Escribe el motivo de anulación');
  if (accionProdManual === 'perdida' && !motivoPerdidaManual.trim())
    return alert('Escribe el motivo de la pérdida');
  setProcesandoManual(true);
  const f = modalAnulManual;

  try {
    const { data: nc, error: errNC } = await supabase.from('notas_credito').insert({
      factura_id:      f.id,
      motivo:          motivoManual,
      total:           f.total,
      estado:          'emitida',
      es_manual:       true,
      tipo_nc:         'total',
      accion_producto: accionProdManual,
      motivo_perdida:  accionProdManual === 'perdida' ? motivoPerdidaManual : null,
      items_nc:        itemsAnulManual,
    }).select().single();
    if (errNC) throw new Error(errNC.message);

    const { error: e1 } = await supabase.from('facturas')
      .update({ estado: 'anulada' }).eq('id', f.id);
    if (e1) throw new Error(e1.message);

    await supabase.from('cuentas_cobrar')
      .update({ estado: 'anulada' })
      .eq('factura_id', f.id).eq('estado', 'pendiente');

    const { error: errAsiento } = await revertirAsientoFactura({
      id:             f.id,
      numero:         f.numero,
      subtotal:       parseFloat(f.subtotal || 0),
      iva:            parseFloat(f.iva      || 0),
      total:          parseFloat(f.total),
      forma_pago:     f.forma_pago,
      cliente_nombre: f.cliente_nombre || 'CONSUMIDOR FINAL',
    });
    if (errAsiento) throw new Error(errAsiento.message);

    if (accionProdManual === 'inventario') {
      for (const it of itemsAnulManual.filter(i => parseFloat(i.cantidadReingresar) > 0)) {
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id:  null,
          nombre_mp:         it.descripcion || it.producto_nombre,
          tipo:              'entrada',
          kg:                parseFloat(it.cantidadReingresar),
          precio_kg_nuevo:   parseFloat(it.precio_unitario) || null,
          precio_kg_anterior:null,
          motivo:            `Devolución anulación factura ${f.numero}`,
          via:               'devolucion_venta',
          fecha:             new Date().toISOString().split('T')[0],
        });
      }
    }

    if (accionProdManual === 'perdida') {
      await supabase.from('perdidas').insert({
        factura_id:      f.id,
        nota_credito_id: nc.id,
        motivo:          motivoPerdidaManual,
        items:           itemsAnulManual,
        total:           parseFloat(f.total),
      });
    }

    setModalAnulManual(null);
    mostrarExito('✅ Anulación manual registrada correctamente');
    cargarFacturas();
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    setProcesandoManual(false);
  }
}
```

- [ ] **Step 5: Agregar modal de anulación manual en el JSX**

Antes del cierre `</div>` final del componente (antes del modal de `modalAnularNV`), agregar:

```jsx
{/* Modal anulación manual */}
{modalAnulManual && (
  <div style={{
    position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
    display:'flex', alignItems:'center', justifyContent:'center',
    zIndex:200, padding:16,
  }}>
    <div style={{
      background:'white', borderRadius:14, padding:'24px',
      maxWidth:520, width:'100%', maxHeight:'90vh', overflowY:'auto',
      boxShadow:'0 8px 40px rgba(0,0,0,0.2)',
    }}>
      <div style={{ fontWeight:'bold', fontSize:'16px', color:'#e74c3c', marginBottom:4 }}>
        📋 Registrar anulación manual
      </div>
      <div style={{ fontSize:'12px', color:'#888', marginBottom:16 }}>
        {modalAnulManual.numero} — ${parseFloat(modalAnulManual.total).toFixed(2)}<br/>
        <span style={{ color:'#e67e22' }}>
          Ya fue anulada en el portal SRI. Esto solo registra la acción internamente.
        </span>
      </div>

      <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>Motivo de anulación *</label>
      <textarea
        value={motivoManual}
        onChange={e => setMotivoManual(e.target.value)}
        placeholder="Ej: Anulada en portal SRI por precio incorrecto..."
        rows={2}
        style={{
          width:'100%', padding:'8px', borderRadius:8, border:'1.5px solid #ddd',
          fontSize:'13px', resize:'vertical', boxSizing:'border-box',
          marginTop:4, marginBottom:14,
        }}
      />

      <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>¿Qué hago con el producto?</label>
      <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6, marginBottom:14 }}>
        {[
          { val:'no_aplica', label:'No aplica', desc:'Error de tipificación, no hay devolución física' },
          { val:'inventario', label:'Reingresar al inventario', desc:'El producto vuelve al stock' },
          { val:'perdida', label:'Registrar como pérdida', desc:'Producto dañado, vencido o no recuperable' },
        ].map(op => (
          <label key={op.val} style={{
            display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer',
            background: accionProdManual === op.val ? '#f0f7ff' : '#fafafa',
            border: `1.5px solid ${accionProdManual === op.val ? '#2980b9' : '#ddd'}`,
            borderRadius:8, padding:'8px 10px',
          }}>
            <input type="radio" value={op.val}
              checked={accionProdManual === op.val}
              onChange={() => setAccionProdManual(op.val)}
              style={{ marginTop:2, flexShrink:0 }}
            />
            <div>
              <div style={{ fontWeight:'600', fontSize:'12px' }}>{op.label}</div>
              <div style={{ fontSize:'11px', color:'#888' }}>{op.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {accionProdManual === 'inventario' && (
        <div style={{ marginBottom:14 }}>
          <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>
            Cantidad a reingresar por ítem
          </label>
          {cargandoItemsModal ? (
            <div style={{ fontSize:'12px', color:'#aaa', padding:'8px 0' }}>⏳ Cargando ítems...</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', marginTop:6 }}>
              <thead>
                <tr style={{ background:'#f0f7ff' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left' }}>Producto</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Vendido</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Reingresar</th>
                </tr>
              </thead>
              <tbody>
                {itemsAnulManual.map((it, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f0f0f0' }}>
                    <td style={{ padding:'6px 8px' }}>{it.descripcion || it.producto_nombre}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}>{parseFloat(it.cantidad).toFixed(3)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}>
                      <input
                        type="number" min="0" max={it.cantidad} step="0.001"
                        value={it.cantidadReingresar}
                        onChange={e => setItemsAnulManual(prev =>
                          prev.map((x, j) => j === i ? { ...x, cantidadReingresar: e.target.value } : x)
                        )}
                        style={{ width:70, padding:'3px 6px', borderRadius:6, border:'1px solid #ddd', textAlign:'right' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {accionProdManual === 'perdida' && (
        <div style={{ marginBottom:14 }}>
          <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>Motivo de la pérdida *</label>
          <input
            type="text"
            value={motivoPerdidaManual}
            onChange={e => setMotivoPerdidaManual(e.target.value)}
            placeholder="Ej: Producto dañado en transporte, vencido..."
            style={{
              width:'100%', padding:'8px', borderRadius:8, border:'1.5px solid #ddd',
              fontSize:'13px', boxSizing:'border-box', marginTop:4,
            }}
          />
        </div>
      )}

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button
          onClick={() => setModalAnulManual(null)}
          disabled={procesandoManual}
          style={{
            background:'#f0f2f5', color:'#555', border:'none',
            borderRadius:8, padding:'10px 20px', cursor:'pointer', fontWeight:'bold',
          }}>Cancelar</button>
        <button
          onClick={registrarAnulacionManual}
          disabled={procesandoManual || !motivoManual.trim()}
          style={{
            background: procesandoManual ? '#95a5a6' : '#e67e22',
            color:'white', border:'none', borderRadius:8,
            padding:'10px 20px',
            cursor: procesandoManual ? 'not-allowed' : 'pointer',
            fontWeight:'bold',
          }}>{procesandoManual ? '⏳ Registrando...' : '📋 Registrar anulación'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Commit parcial**

```bash
git add src/components/facturacion/TabFacturas.js src/utils/asientosContables.js
git commit -m "feat: anulacion manual con reingreso inventario y perdidas"
```

---

## Task 5: Nota de Crédito en TabFacturas.js

**Files:**
- Modify: `src/components/facturacion/TabFacturas.js`

- [ ] **Step 1: Agregar estados para NC**

Después de los estados de anulación manual agregar:

```javascript
// ── Nota de crédito electrónica ──
const [modalNC,           setModalNC]           = useState(null);
const [motivoNC,          setMotivoNC]           = useState('devolucion');
const [tipoNC,            setTipoNC]             = useState('total');
const [accionProdNC,      setAccionProdNC]       = useState('no_aplica');
const [itemsNC,           setItemsNC]            = useState([]);
const [motivoPerdidaNC,   setMotivoPerdidaNC]    = useState('');
const [procesandoNC,      setProcesandoNC]       = useState(false);
```

- [ ] **Step 2: Agregar función `abrirModalNC`**

Después de `abrirModalAnulManual`:

```javascript
async function abrirModalNC(f) {
  setModalNC(f);
  setMotivoNC('devolucion');
  setTipoNC('total');
  setAccionProdNC('no_aplica');
  setMotivoPerdidaNC('');
  setCargandoItemsModal(true);
  const { data } = await supabase.from('facturas_detalle')
    .select('*').eq('factura_id', f.id).order('id');
  setItemsNC((data || []).map(d => ({
    ...d,
    cantidadAcreditar:   d.cantidad,
    montoAcreditar:      d.subtotal,
    cantidadReingresar:  d.cantidad,
  })));
  setCargandoItemsModal(false);
}
```

- [ ] **Step 3: Agregar función `emitirNotaCredito`**

```javascript
async function emitirNotaCredito() {
  if (accionProdNC === 'perdida' && !motivoPerdidaNC.trim())
    return alert('Escribe el motivo de la pérdida');
  setProcesandoNC(true);
  const f = modalNC;

  try {
    const itemsAcreditar = tipoNC === 'total'
      ? itemsNC
      : itemsNC.filter(it => parseFloat(it.montoAcreditar) > 0);
    if (itemsAcreditar.length === 0) throw new Error('Selecciona al menos un ítem a acreditar');

    const { data: cfgSeq, error: errSeq } = await supabase.from('config_sistema')
      .select('valor').eq('clave', 'nota_credito_secuencial').single();
    if (errSeq) throw new Error('No se pudo leer secuencial de NC');
    const secuencial = parseInt(cfgSeq.valor, 10);
    const numero = `001-001-${String(secuencial).padStart(9, '0')}`;

    const { data: clienteData } = await supabase.from('clientes')
      .select('*').eq('id', f.cliente_id).single();
    const cliente = clienteData || { nombre: 'CONSUMIDOR FINAL', ruc: '9999999999999' };

    const motivoLabel = motivoNC === 'devolucion'   ? 'Devolución de producto'
                      : motivoNC === 'error_precio' ? 'Error en precio del producto'
                      : 'Anulación de factura';

    const itemsPayload = itemsAcreditar.map((it, idx) => ({
      descripcion:     it.descripcion || it.producto_nombre,
      cantidad:        tipoNC === 'total'
                         ? parseFloat(it.cantidad)
                         : parseFloat(it.cantidadAcreditar || it.cantidad),
      precio_unitario: parseFloat(it.precio_unitario),
      subtotal:        parseFloat(it.montoAcreditar || it.subtotal),
      codigo:          String(idx + 1).padStart(3, '0'),
    }));

    const res = await fetch('/api/emitir-nota-credito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente,
        autorizacion_sri:       f.autorizacion_sri,
        numero_factura:         f.numero,
        fecha_emision_factura:  f.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        motivo:                 motivoLabel,
        tipo_motivo:            motivoNC,
        items:                  itemsPayload,
        secuencial,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error Dátil/SRI');

    const { data: nc, error: errNC } = await supabase.from('notas_credito').insert({
      factura_id:      f.id,
      numero,
      motivo:          motivoLabel,
      total:           data.total,
      estado:          'emitida',
      es_manual:       false,
      tipo_nc:         tipoNC,
      tipo_motivo:     motivoNC,
      autorizacion_sri:data.autorizacion,
      datil_id:        data.datil_id,
      accion_producto: accionProdNC,
      motivo_perdida:  accionProdNC === 'perdida' ? motivoPerdidaNC : null,
      items_nc:        itemsPayload,
    }).select().single();
    if (errNC) throw new Error(errNC.message);

    await supabase.from('config_sistema')
      .update({ valor: String(secuencial + 1) })
      .eq('clave', 'nota_credito_secuencial');

    await supabase.from('facturas').update({ estado: 'anulada' }).eq('id', f.id);

    await supabase.from('cuentas_cobrar')
      .update({ estado: 'anulada' })
      .eq('factura_id', f.id).eq('estado', 'pendiente');

    await revertirAsientoFactura({
      id:             f.id,
      numero:         f.numero,
      subtotal:       parseFloat(f.subtotal || 0),
      iva:            parseFloat(f.iva      || 0),
      total:          parseFloat(f.total),
      forma_pago:     f.forma_pago,
      cliente_nombre: f.cliente_nombre || 'CONSUMIDOR FINAL',
    });

    if (accionProdNC === 'inventario') {
      for (const it of itemsAcreditar.filter(i => parseFloat(i.cantidadReingresar) > 0)) {
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id:   null,
          nombre_mp:          it.descripcion || it.producto_nombre,
          tipo:               'entrada',
          kg:                 parseFloat(it.cantidadReingresar),
          precio_kg_nuevo:    parseFloat(it.precio_unitario) || null,
          precio_kg_anterior: null,
          motivo:             `Devolución NC ${numero} - Factura ${f.numero}`,
          via:                'devolucion_venta',
          fecha:              new Date().toISOString().split('T')[0],
        });
      }
    }

    if (accionProdNC === 'perdida') {
      await supabase.from('perdidas').insert({
        factura_id:      f.id,
        nota_credito_id: nc.id,
        motivo:          motivoPerdidaNC,
        items:           itemsPayload,
        total:           data.total,
      });
    }

    setModalNC(null);
    mostrarExito(`✅ Nota de crédito ${numero} autorizada por el SRI`);
    cargarFacturas();
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    setProcesandoNC(false);
  }
}
```

- [ ] **Step 4: Agregar modal NC en JSX**

Después del modal de anulación manual, agregar:

```jsx
{/* Modal nota de crédito electrónica */}
{modalNC && (
  <div style={{
    position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
    display:'flex', alignItems:'center', justifyContent:'center',
    zIndex:200, padding:16,
  }}>
    <div style={{
      background:'white', borderRadius:14, padding:'24px',
      maxWidth:560, width:'100%', maxHeight:'90vh', overflowY:'auto',
      boxShadow:'0 8px 40px rgba(0,0,0,0.2)',
    }}>
      <div style={{ fontWeight:'bold', fontSize:'16px', color:'#1a5276', marginBottom:4 }}>
        📄 Emitir Nota de Crédito al SRI
      </div>
      <div style={{ fontSize:'12px', color:'#888', marginBottom:16 }}>
        {modalNC.numero} — ${parseFloat(modalNC.total).toFixed(2)}<br/>
        <span style={{ color:'#27ae60', fontWeight:'600' }}>
          ✅ Se enviará a Dátil → SRI. Quedará registrada legalmente.
        </span>
      </div>

      <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>Motivo</label>
      <select
        value={motivoNC}
        onChange={e => setMotivoNC(e.target.value)}
        style={{
          width:'100%', padding:'8px', borderRadius:8, border:'1.5px solid #ddd',
          fontSize:'13px', marginTop:4, marginBottom:14, boxSizing:'border-box',
        }}
      >
        <option value="devolucion">Devolución de producto</option>
        <option value="error_precio">Error en precio / tipificación</option>
        <option value="otro">Otro</option>
      </select>

      <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>Tipo de nota de crédito</label>
      <div style={{ display:'flex', gap:10, marginTop:6, marginBottom:14 }}>
        {[
          { val:'total',   label:'Total',   desc:'Cubre el 100% de la factura' },
          { val:'parcial', label:'Parcial', desc:'Solo los ítems seleccionados' },
        ].map(op => (
          <label key={op.val} style={{
            flex:1, display:'flex', alignItems:'center', gap:8, cursor:'pointer',
            background: tipoNC === op.val ? '#f0f7ff' : '#fafafa',
            border:`1.5px solid ${tipoNC === op.val ? '#2980b9' : '#ddd'}`,
            borderRadius:8, padding:'8px 10px',
          }}>
            <input type="radio" value={op.val}
              checked={tipoNC === op.val}
              onChange={() => setTipoNC(op.val)}
            />
            <div>
              <div style={{ fontWeight:'600', fontSize:'12px' }}>{op.label}</div>
              <div style={{ fontSize:'11px', color:'#888' }}>{op.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {tipoNC === 'parcial' && (
        <div style={{ marginBottom:14 }}>
          <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>
            Ítems a acreditar
          </label>
          {cargandoItemsModal ? (
            <div style={{ fontSize:'12px', color:'#aaa', padding:'8px 0' }}>⏳ Cargando ítems...</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', marginTop:6 }}>
              <thead>
                <tr style={{ background:'#e8f4fd' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left' }}>Producto</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Precio/kg</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Cantidad</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Monto $</th>
                </tr>
              </thead>
              <tbody>
                {itemsNC.map((it, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f0f0f0' }}>
                    <td style={{ padding:'6px 8px', fontSize:'11px' }}>{it.descripcion || it.producto_nombre}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}>${parseFloat(it.precio_unitario).toFixed(4)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}>
                      <input
                        type="number" min="0" max={it.cantidad} step="0.001"
                        value={it.cantidadAcreditar}
                        onChange={e => setItemsNC(prev => prev.map((x, j) => j === i
                          ? { ...x, cantidadAcreditar: e.target.value,
                              montoAcreditar: (parseFloat(e.target.value) * parseFloat(x.precio_unitario)).toFixed(2) }
                          : x))}
                        style={{ width:70, padding:'3px 6px', borderRadius:6, border:'1px solid #ddd', textAlign:'right' }}
                      />
                    </td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:'bold' }}>
                      ${parseFloat(it.montoAcreditar || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>¿Qué hago con el producto devuelto?</label>
      <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6, marginBottom:14 }}>
        {[
          { val:'no_aplica',  label:'No aplica',              desc:'Error de precio, sin devolución física' },
          { val:'inventario', label:'Reingresar al inventario', desc:'El producto vuelve al stock' },
          { val:'perdida',    label:'Registrar como pérdida',  desc:'Producto dañado o no recuperable' },
        ].map(op => (
          <label key={op.val} style={{
            display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer',
            background: accionProdNC === op.val ? '#f0f7ff' : '#fafafa',
            border:`1.5px solid ${accionProdNC === op.val ? '#2980b9' : '#ddd'}`,
            borderRadius:8, padding:'8px 10px',
          }}>
            <input type="radio" value={op.val}
              checked={accionProdNC === op.val}
              onChange={() => setAccionProdNC(op.val)}
              style={{ marginTop:2, flexShrink:0 }}
            />
            <div>
              <div style={{ fontWeight:'600', fontSize:'12px' }}>{op.label}</div>
              <div style={{ fontSize:'11px', color:'#888' }}>{op.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {accionProdNC === 'inventario' && tipoNC === 'total' && (
        <div style={{ marginBottom:14 }}>
          <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>
            Cantidad a reingresar por ítem
          </label>
          {cargandoItemsModal ? (
            <div style={{ fontSize:'12px', color:'#aaa', padding:'8px 0' }}>⏳ Cargando ítems...</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', marginTop:6 }}>
              <thead>
                <tr style={{ background:'#f0f7ff' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left' }}>Producto</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Vendido</th>
                  <th style={{ padding:'6px 8px', textAlign:'right' }}>Reingresar</th>
                </tr>
              </thead>
              <tbody>
                {itemsNC.map((it, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f0f0f0' }}>
                    <td style={{ padding:'6px 8px' }}>{it.descripcion || it.producto_nombre}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}>{parseFloat(it.cantidad).toFixed(3)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}>
                      <input
                        type="number" min="0" max={it.cantidad} step="0.001"
                        value={it.cantidadReingresar}
                        onChange={e => setItemsNC(prev =>
                          prev.map((x, j) => j === i ? { ...x, cantidadReingresar: e.target.value } : x)
                        )}
                        style={{ width:70, padding:'3px 6px', borderRadius:6, border:'1px solid #ddd', textAlign:'right' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {accionProdNC === 'perdida' && (
        <div style={{ marginBottom:14 }}>
          <label style={{ fontWeight:'600', fontSize:'12px', color:'#333' }}>Motivo de la pérdida *</label>
          <input
            type="text"
            value={motivoPerdidaNC}
            onChange={e => setMotivoPerdidaNC(e.target.value)}
            placeholder="Ej: Producto dañado, vencido, no apto para venta..."
            style={{
              width:'100%', padding:'8px', borderRadius:8, border:'1.5px solid #ddd',
              fontSize:'13px', boxSizing:'border-box', marginTop:4,
            }}
          />
        </div>
      )}

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button
          onClick={() => setModalNC(null)}
          disabled={procesandoNC}
          style={{
            background:'#f0f2f5', color:'#555', border:'none',
            borderRadius:8, padding:'10px 20px', cursor:'pointer', fontWeight:'bold',
          }}>Cancelar</button>
        <button
          onClick={emitirNotaCredito}
          disabled={procesandoNC || !modalNC.autorizacion_sri}
          style={{
            background: procesandoNC ? '#95a5a6'
              : !modalNC.autorizacion_sri ? '#bdc3c7' : '#1a5276',
            color:'white', border:'none', borderRadius:8,
            padding:'10px 20px',
            cursor: procesandoNC || !modalNC.autorizacion_sri ? 'not-allowed' : 'pointer',
            fontWeight:'bold',
          }}>
          {procesandoNC ? '⏳ Enviando a SRI...' : '📄 Emitir NC al SRI'}
        </button>
      </div>
      {!modalNC.autorizacion_sri && (
        <div style={{ fontSize:'11px', color:'#e74c3c', marginTop:6, textAlign:'right' }}>
          ⚠️ Esta factura no tiene código de autorización SRI — usa anulación manual
        </div>
      )}
    </div>
  </div>
)}
```

---

## Task 6: Botones y commit final

**Files:**
- Modify: `src/components/facturacion/TabFacturas.js`

- [ ] **Step 1: Reemplazar botón "Anular" por dos botones**

Encontrar este bloque en el JSX (alrededor de la línea 405):

```jsx
{f.estado === 'autorizada' && f.tipo !== 'nota_venta' && (
  <button onClick={() => { setModalAnular(f); setMotivoAnul(''); }} style={{
    background: 'white', color: '#e74c3c',
    border: '1.5px solid #e74c3c',
    borderRadius: 7, padding: '6px 12px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
  }}>🚫 Anular</button>
)}
```

Reemplazarlo por:

```jsx
{f.estado === 'autorizada' && f.tipo !== 'nota_venta' && (
  <>
    <button onClick={() => abrirModalAnulManual(f)} style={{
      background: 'white', color: '#e67e22',
      border: '1.5px solid #e67e22',
      borderRadius: 7, padding: '6px 10px',
      cursor: 'pointer', fontWeight: 'bold', fontSize: '11px'
    }}>📋 Anulación manual</button>
    <button onClick={() => abrirModalNC(f)} style={{
      background: 'white', color: '#1a5276',
      border: '1.5px solid #1a5276',
      borderRadius: 7, padding: '6px 10px',
      cursor: 'pointer', fontWeight: 'bold', fontSize: '11px'
    }}>📄 Nota de Crédito</button>
  </>
)}
```

- [ ] **Step 2: Eliminar estados y funciones del flujo anterior**

Eliminar estas líneas ya no usadas:
- `const [modalAnular, setModalAnular] = useState(null);`
- `const [motivoAnul,  setMotivoAnul]  = useState('');`
- `const [anulando,    setAnulando]    = useState(false);`
- La función `anularFactura()` completa
- El bloque JSX `{/* Modal anular */}` con el modal antiguo (el que tiene el textarea de `motivoAnul`)

- [ ] **Step 3: Commit y push final**

```bash
git add src/components/facturacion/TabFacturas.js api/emitir-nota-credito.js
git commit -m "feat: nota de credito electronica Datil y anulacion manual con inventario/perdidas"
git push origin main
```
