// ============================================
// TabNuevaVenta.js
// Formulario nueva venta + emisión de factura
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

const CONSUMIDOR_FINAL = {
  id: null, nombre: 'CONSUMIDOR FINAL',
  ruc: '9999999999999', email: '', telefono: '', direccion: ''
};

const FORMAS_PAGO = [
  { value: 'efectivo',      label: '💵 Efectivo'      },
  { value: 'transferencia', label: '🏦 Transferencia'  },
  { value: 'cheque',        label: '📝 Cheque'         },
  { value: 'credito',       label: '📅 Crédito'        },
];

const itemVacio = () => ({
  producto_nombre: '', descripcion: '',
  cantidad: '', precio_unitario: '', subtotal: 0
});

export default function TabNuevaVenta({ mobile, currentUser }) {

  const [clientes,   setClientes]   = useState([]);
  const [productos,  setProductos]  = useState([]);
  const [precios,    setPrecios]    = useState([]);   // precios_clientes
  const [configPrecios, setConfigPrecios] = useState([]); // config_productos precio_venta_kg
  const [secuencial, setSecuencial] = useState(null);

  const [clienteId,     setClienteId]     = useState('consumidor_final');
  const [items,         setItems]         = useState([itemVacio()]);
  const [formaPago,     setFormaPago]     = useState('efectivo');
  const [diasCredito,   setDiasCredito]   = useState(30);
  const [observaciones, setObservaciones] = useState('');

  const [emitiendo,      setEmitiendo]      = useState(false);
  const [facturaEmitida, setFacturaEmitida] = useState(null);
  const [error,          setError]          = useState('');

  useEffect(() => { cargarDatos(); }, []);
  useRealtime(['clientes', 'config_productos', 'cuentas_cobrar', 'facturas', 'precios_clientes', 'productos'], cargarDatos);

  // ── Cargar datos iniciales ────────────────────────────────
  async function cargarDatos() {
    const [{ data: cls }, { data: prods }, { data: prec }, { data: cfg }, { data: cfgPrec }] =
      await Promise.all([
        supabase.from('clientes').select('id,nombre,ruc,email,telefono,direccion')
          .not('eliminado', 'eq', true).order('nombre'),
        supabase.from('productos').select('id,nombre').eq('estado', 'ACTIVO').order('nombre'),
        supabase.from('precios_clientes').select('cliente_id,producto_nombre,precio_venta_kg'),
        supabase.from('config_sistema').select('valor').eq('clave', 'factura_secuencial').single(),
        supabase.from('config_productos').select('producto_nombre,precio_venta_kg')
      ]);
    setClientes(cls   || []);
    setProductos(prods || []);
    setPrecios(prec   || []);
    setConfigPrecios(cfgPrec || []);
    if (cfg?.valor) setSecuencial(parseInt(cfg.valor));
  }

  // ── Cliente seleccionado ──────────────────────────────────
  const clienteObj = clienteId === 'consumidor_final'
    ? CONSUMIDOR_FINAL
    : clientes.find(c => c.id === clienteId) || CONSUMIDOR_FINAL;

  // ── Precio automático al elegir producto ─────────────────
  function precioAutomatico(productoNombre) {
    // 1. Precio específico del cliente seleccionado
    if (clienteId !== 'consumidor_final') {
      const p = precios.find(p =>
        p.cliente_id === clienteId &&
        p.producto_nombre === productoNombre
      );
      if (p) return String(parseFloat(p.precio_venta_kg).toFixed(2));
    }
    // 2. Cualquier precio en precios_clientes para ese producto
    const fallback = precios.find(p => p.producto_nombre === productoNombre);
    if (fallback) return String(parseFloat(fallback.precio_venta_kg).toFixed(2));
    // 3. Precio de la fórmula del producto (config_productos)
    const cfgP = configPrecios.find(p => p.producto_nombre === productoNombre);
    if (cfgP && cfgP.precio_venta_kg > 0) return String(parseFloat(cfgP.precio_venta_kg).toFixed(2));
    return '';
  }

  // ── Actualizar ítem ───────────────────────────────────────
  function actualizarItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const nuevo = { ...it, [campo]: valor };
      if (campo === 'producto_nombre') {
        nuevo.descripcion      = valor;
        nuevo.precio_unitario  = precioAutomatico(valor);
      }
      const cant  = parseFloat(nuevo.cantidad       || 0);
      const precio = parseFloat(nuevo.precio_unitario || 0);
      nuevo.subtotal = parseFloat((cant * precio).toFixed(2));
      return nuevo;
    }));
  }

  function agregarItem()      { setItems(prev => [...prev, itemVacio()]); }
  function eliminarItem(idx)  { setItems(prev => prev.filter((_, i) => i !== idx)); }

  // ── Totales ───────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);
  const iva      = parseFloat((subtotal * 0.15).toFixed(2));
  const total    = parseFloat((subtotal + iva).toFixed(2));

  // ── Emitir factura ────────────────────────────────────────
  async function emitirFactura() {
    setError('');
    if (!items.some(i => i.producto_nombre && parseFloat(i.cantidad) > 0))
      return setError('Agrega al menos un producto con cantidad');
    if (subtotal <= 0)
      return setError('El subtotal debe ser mayor a 0');
    if (secuencial === null)
      return setError('No se pudo cargar el número de factura');

    setEmitiendo(true);
    const itemsValidos = items.filter(i => i.producto_nombre && parseFloat(i.cantidad) > 0);

    try {
      // 1. Llamar al API (Dátil → SRI)
      const res = await fetch('/api/emitir-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente:      clienteObj,
          items:        itemsValidos,
          formaPago,
          diasCredito:  formaPago === 'credito' ? diasCredito : 0,
          observaciones,
          vendedor:     currentUser?.email || '',
          secuencial
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const numero = `001-001-${String(secuencial).padStart(9, '0')}`;

      // 2. Guardar factura en Supabase
      const { data: factura, error: errF } = await supabase.from('facturas').insert({
        cliente_id:      clienteObj.id,
        numero,
        autorizacion_sri: data.autorizacion,
        datil_id:         data.datil_id,
        pdf_url:          data.pdf_url,
        xml_url:          data.xml_url,
        estado:           'autorizada',
        subtotal,
        iva,
        total,
        porcentaje_iva:   15,
        forma_pago:       formaPago,
        dias_credito:     formaPago === 'credito' ? diasCredito : 0,
        observaciones,
        vendedor:         currentUser?.email || '',
        created_by:       currentUser?.email || ''
      }).select().single();
      if (errF) throw errF;

      // 3. Guardar detalle
      await supabase.from('facturas_detalle').insert(
        itemsValidos.map(it => ({
          factura_id:      factura.id,
          producto_nombre: it.producto_nombre,
          descripcion:     it.descripcion || it.producto_nombre,
          cantidad:        parseFloat(it.cantidad),
          precio_unitario: parseFloat(it.precio_unitario),
          subtotal:        parseFloat(it.subtotal)
        }))
      );

      // 4. Si es crédito → crear cuenta x cobrar
      if (formaPago === 'credito') {
        const venc = new Date();
        venc.setDate(venc.getDate() + diasCredito);
        await supabase.from('cuentas_cobrar').insert({
          factura_id:        factura.id,
          cliente_id:        clienteObj.id,
          monto_total:       total,
          monto_cobrado:     0,
          estado:            'pendiente',
          fecha_vencimiento: venc.toISOString().split('T')[0]
        });
      }

      // 5. Incrementar secuencial
      await supabase.from('config_sistema')
        .update({ valor: String(secuencial + 1), updated_at: new Date().toISOString() })
        .eq('clave', 'factura_secuencial');

      setSecuencial(prev => prev + 1);
      setFacturaEmitida({ ...data, numero, cliente: clienteObj.nombre, total });

    } catch (e) {
      setError('Error al emitir: ' + e.message);
    }
    setEmitiendo(false);
  }

  // ── Guardar borrador (sin Dátil) ─────────────────────────
  async function guardarBorrador() {
    setError('');
    if (!items.some(i => i.producto_nombre && parseFloat(i.cantidad) > 0))
      return setError('Agrega al menos un producto con cantidad');
    if (subtotal <= 0)
      return setError('El subtotal debe ser mayor a 0');
    if (secuencial === null)
      return setError('No se pudo cargar el número de factura');

    setEmitiendo(true);
    const itemsValidos = items.filter(i => i.producto_nombre && parseFloat(i.cantidad) > 0);
    const numero = `001-001-${String(secuencial).padStart(9, '0')}`;

    try {
      const { data: factura, error: errF } = await supabase.from('facturas').insert({
        cliente_id:      clienteObj.id,
        numero,
        autorizacion_sri: null,
        datil_id:         null,
        pdf_url:          null,
        xml_url:          null,
        estado:           'borrador',
        subtotal,
        iva,
        total,
        porcentaje_iva:   15,
        forma_pago:       formaPago,
        dias_credito:     formaPago === 'credito' ? diasCredito : 0,
        observaciones,
        vendedor:         currentUser?.email || '',
        created_by:       currentUser?.email || ''
      }).select().single();
      if (errF) throw errF;

      await supabase.from('facturas_detalle').insert(
        itemsValidos.map(it => ({
          factura_id:      factura.id,
          producto_nombre: it.producto_nombre,
          descripcion:     it.descripcion || it.producto_nombre,
          cantidad:        parseFloat(it.cantidad),
          precio_unitario: parseFloat(it.precio_unitario),
          subtotal:        parseFloat(it.subtotal)
        }))
      );

      if (formaPago === 'credito') {
        const venc = new Date();
        venc.setDate(venc.getDate() + diasCredito);
        await supabase.from('cuentas_cobrar').insert({
          factura_id:        factura.id,
          cliente_id:        clienteObj.id,
          monto_total:       total,
          monto_cobrado:     0,
          estado:            'pendiente',
          fecha_vencimiento: venc.toISOString().split('T')[0]
        });
      }

      await supabase.from('config_sistema')
        .update({ valor: String(secuencial + 1), updated_at: new Date().toISOString() })
        .eq('clave', 'factura_secuencial');

      setSecuencial(prev => prev + 1);
      setFacturaEmitida({ numero, cliente: clienteObj.nombre, total, autorizacion: null, esBorrador: true });

    } catch (e) {
      setError('Error al guardar: ' + e.message);
    }
    setEmitiendo(false);
  }

  function nuevaFactura() {
    setFacturaEmitida(null);
    setItems([itemVacio()]);
    setObservaciones('');
    setFormaPago('efectivo');
    setClienteId('consumidor_final');
    setError('');
  }

  // ── Estilos reutilizables ─────────────────────────────────
  const inputStyle = {
    padding: '8px 10px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px',
    outline: 'none', width: '100%', boxSizing: 'border-box'
  };
  const labelStyle = {
    fontSize: '11px', fontWeight: 'bold',
    color: '#555', display: 'block', marginBottom: 4
  };

  // ── Vista éxito ───────────────────────────────────────────
  if (facturaEmitida) return (
    <div style={{
      background: 'white', borderRadius: '14px',
      padding: mobile ? '20px 16px' : '30px',
      maxWidth: 500, margin: '20px auto',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>
        {facturaEmitida.esBorrador ? '💾' : '✅'}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 'bold', color: facturaEmitida.esBorrador ? '#f39c12' : '#27ae60', marginBottom: 8 }}>
        {facturaEmitida.esBorrador ? '¡Borrador guardado!' : '¡Factura emitida!'}
      </div>
      <div style={{ fontSize: '15px', color: '#555', marginBottom: 20 }}>
        {facturaEmitida.numero} — {facturaEmitida.cliente}
      </div>

      {facturaEmitida.esBorrador && (
        <div style={{
          background: '#fff8f0', border: '1px solid #f39c12', borderRadius: 10,
          padding: '10px 14px', marginBottom: 16, fontSize: '12px', color: '#856404'
        }}>
          ⚠️ Esta factura está como borrador. Para emitirla al SRI, hazlo desde la pestaña Facturas cuando estés en producción.
        </div>
      )}

      <div style={{
        background: '#f8f9fa', borderRadius: 10,
        padding: '14px 16px', marginBottom: 20, textAlign: 'left'
      }}>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: 6 }}>Autorización SRI</div>
        <div style={{
          fontSize: '11px', color: '#1a1a2e', fontWeight: 'bold',
          wordBreak: 'break-all', fontFamily: 'monospace'
        }}>
          {facturaEmitida.autorizacion || '(pendiente — borrador)'}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            background: '#e8f5e9', borderRadius: 8,
            padding: '6px 12px', fontSize: '13px', fontWeight: 'bold', color: '#27ae60'
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

  // ── Formulario principal ──────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* Error */}
      {error && (
        <div style={{
          background: '#fde8e8', border: '1px solid #e74c3c',
          borderRadius: 8, marginBottom: 14, overflow: 'hidden'
        }}>
          <div style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 'bold', color: '#c0392b' }}>
            ⚠️ {error}
          </div>
        </div>
      )}

      {/* Número de factura */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <span style={{ fontSize: '13px', color: '#555' }}>Número de factura:</span>
        <span style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '15px' }}>
          {secuencial !== null
            ? `001-001-${String(secuencial).padStart(9, '0')}`
            : '...'}
        </span>
      </div>

      {/* Cliente */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: mobile ? '14px' : '16px 20px',
        marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ fontWeight: 'bold', color: '#1a1a2e', marginBottom: 10, fontSize: '14px' }}>
          👤 Cliente
        </div>
        <select
          value={clienteId}
          onChange={e => setClienteId(e.target.value)}
          style={{ ...inputStyle, maxWidth: 400 }}
        >
          <option value="consumidor_final">CONSUMIDOR FINAL</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre} {c.ruc ? `— ${c.ruc}` : ''}
            </option>
          ))}
        </select>
        {clienteId !== 'consumidor_final' && clienteObj.email && (
          <div style={{ fontSize: '12px', color: '#888', marginTop: 6 }}>
            📧 {clienteObj.email}
          </div>
        )}
      </div>

      {/* Productos */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: mobile ? '14px' : '16px 20px',
        marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12
        }}>
          <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px' }}>
            🛒 Productos
          </div>
          <button onClick={agregarItem} style={{
            background: '#27ae60', color: 'white', border: 'none',
            borderRadius: 7, padding: '6px 14px',
            cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
          }}>+ Agregar</button>
        </div>

        {/* Encabezado tabla (solo desktop) */}
        {!mobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 36px',
            gap: 8, marginBottom: 6
          }}>
            {['PRODUCTO / DESCRIPCIÓN', 'CANT (kg)', 'PRECIO/kg ($)', 'SUBTOTAL', ''].map(h => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 'bold', color: '#888' }}>{h}</div>
            ))}
          </div>
        )}

        {items.map((item, idx) => (
          <div key={idx} style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '2fr 1fr 1fr 1fr 36px',
            gap: 8, marginBottom: 10,
            padding: mobile ? '10px' : 0,
            background: mobile ? '#f8f9fa' : 'transparent',
            borderRadius: mobile ? 8 : 0
          }}>
            {/* Producto */}
            <div>
              {mobile && <label style={labelStyle}>Producto</label>}
              <select
                value={item.producto_nombre}
                onChange={e => actualizarItem(idx, 'producto_nombre', e.target.value)}
                style={inputStyle}
              >
                <option value="">— seleccionar —</option>
                {productos.map(p => (
                  <option key={p.id} value={p.nombre}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {/* Cantidad */}
            <div>
              {mobile && <label style={labelStyle}>Cant. (kg)</label>}
              <input
                type="number" min="0" step="0.001"
                value={item.cantidad}
                onChange={e => actualizarItem(idx, 'cantidad', e.target.value)}
                placeholder="0.000"
                style={inputStyle}
              />
            </div>

            {/* Precio */}
            <div>
              {mobile && <label style={labelStyle}>Precio/kg ($)</label>}
              <input
                type="number" min="0" step="0.0001"
                value={item.precio_unitario}
                onChange={e => actualizarItem(idx, 'precio_unitario', e.target.value)}
                placeholder="0.0000"
                style={inputStyle}
              />
            </div>

            {/* Subtotal */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {mobile && <label style={labelStyle}>Subtotal</label>}
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                background: '#f0f7ff', fontSize: '14px',
                fontWeight: 'bold', color: '#1a5276', width: '100%'
              }}>
                ${(parseFloat(item.subtotal) || 0).toFixed(2)}
              </div>
            </div>

            {/* Eliminar */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {items.length > 1 && (
                <button onClick={() => eliminarItem(idx)} style={{
                  background: 'none', border: 'none',
                  color: '#e74c3c', cursor: 'pointer',
                  fontSize: '18px', padding: '4px'
                }}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Forma de pago */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: mobile ? '14px' : '16px 20px',
        marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ fontWeight: 'bold', color: '#1a1a2e', marginBottom: 10, fontSize: '14px' }}>
          💳 Forma de pago
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {FORMAS_PAGO.map(f => (
            <button key={f.value}
              onClick={() => setFormaPago(f.value)}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                fontWeight: 'bold', fontSize: '13px',
                background: formaPago === f.value ? '#2980b9' : '#f0f2f5',
                color:      formaPago === f.value ? 'white'   : '#555',
                border:     formaPago === f.value
                  ? '2px solid #2980b9' : '2px solid transparent'
              }}>{f.label}</button>
          ))}
        </div>
        {formaPago === 'credito' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ ...labelStyle, margin: 0 }}>Días de crédito:</label>
            <select
              value={diasCredito}
              onChange={e => setDiasCredito(parseInt(e.target.value))}
              style={{ ...inputStyle, width: 'auto' }}
            >
              {[7, 15, 30, 45, 60, 90].map(d => (
                <option key={d} value={d}>{d} días</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Observaciones */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: mobile ? '14px' : '16px 20px',
        marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <label style={labelStyle}>Observaciones (opcional)</label>
        <input
          type="text"
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          placeholder="Ej: Entrega en planta, pedido #123..."
          style={inputStyle}
        />
      </div>

      {/* Totales + Botón emitir */}
      <div style={{
        background: 'linear-gradient(135deg,#1a2a4a,#1e3a6e)',
        borderRadius: '12px', padding: mobile ? '14px' : '16px 20px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', gap: mobile ? 16 : 24 }}>
          {[
            ['SUBTOTAL', `$${subtotal.toFixed(2)}`, '#aed6f1'],
            ['IVA 15%',  `$${iva.toFixed(2)}`,      '#f9e79f'],
            ['TOTAL',    `$${total.toFixed(2)}`,     '#a9dfbf'],
          ].map(([l, v, col]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: mobile ? '15px' : '18px', fontWeight: 'bold', color: col }}>
                {v}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={guardarBorrador}
            disabled={emitiendo || subtotal <= 0}
            style={{
              background: emitiendo || subtotal <= 0 ? '#95a5a6' : '#f39c12',
              color: 'white', border: 'none', borderRadius: 10,
              padding: mobile ? '12px 16px' : '12px 20px',
              cursor: emitiendo || subtotal <= 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap'
            }}>
            {emitiendo ? '⏳...' : '💾 Guardar borrador'}
          </button>
          <button
            onClick={emitirFactura}
            disabled={emitiendo || subtotal <= 0}
            style={{
              background: emitiendo || subtotal <= 0 ? '#95a5a6' : '#27ae60',
              color: 'white', border: 'none', borderRadius: 10,
              padding: mobile ? '12px 20px' : '12px 28px',
              cursor: emitiendo || subtotal <= 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap'
            }}>
            {emitiendo ? '⏳ Emitiendo...' : '🧾 Emitir factura'}
          </button>
        </div>
      </div>

    </div>
  );
}
