// ============================================
// TabNuevaVenta.js
// Formulario nueva venta + emisión de factura
// ============================================
import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseReal } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { generarAsientoFactura } from '../../utils/asientosContables';
import { get as cacheGet, set as cacheSet, makeKey as cacheMakeKey } from '../../lib/readCache';
import { addBorrador as addOfflineBorrador } from '../../lib/offlineBorradores';
import { imprimirTicket } from '../../utils/imprimirTicket';

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

export default function TabNuevaVenta({ mobile, currentUser, userRol }) {

  const [clientes,   setClientes]   = useState([]);
  const [productos,  setProductos]  = useState([]);
  const [precios,    setPrecios]    = useState([]);   // precios_clientes
  const [configPrecios, setConfigPrecios] = useState([]); // config_productos precio_venta_kg
  const [secuencial, setSecuencial] = useState(null);
  const [secuencialNV, setSecuencialNV] = useState(null);

  const [clienteId,     setClienteId]     = useState('consumidor_final');
  const [items,         setItems]         = useState([itemVacio()]);
  const [formaPago,     setFormaPago]     = useState('efectivo');
  const [diasCredito,   setDiasCredito]   = useState(30);
  const [observaciones, setObservaciones] = useState('');

  const [emitiendo,      setEmitiendo]      = useState(false);
  const [facturaEmitida, setFacturaEmitida] = useState(null);
  const [error,          setError]          = useState('');
  const [errorTipo,      setErrorTipo]      = useState('interno');
  const [isOnline,       setIsOnline]       = useState(true);

  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => { cargarDatos(); }, []);
  useRealtime(['clientes', 'config_productos', 'cuentas_cobrar', 'facturas', 'precios_clientes', 'productos'], cargarDatos);

  // ── Cargar datos iniciales ────────────────────────────────
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
  const subtotal       = items.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);
  const iva            = parseFloat((subtotal * 0.15).toFixed(2));
  const total          = parseFloat((subtotal + iva).toFixed(2));
  const articulosCount = items.filter(i => i.producto_nombre && parseFloat(i.cantidad) > 0).length;

  // ── Emitir factura ────────────────────────────────────────
  async function emitirFactura() {
    setError('');
    if (!items.some(i => i.producto_nombre && parseFloat(i.cantidad) > 0))
      return setError('Agrega al menos un producto con cantidad');
    if (subtotal <= 0)
      return setError('El subtotal debe ser mayor a 0');
    if (secuencial === null)
      return setError('No se pudo cargar el número de factura');

    if (!navigator.onLine) {
      return guardarBorrador();
    }

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
      if (!data.ok) { const e = new Error(data.error || 'Error Dátil/SRI'); e.esDatil = true; throw e; }

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
        vendedor_nombre:  userRol?.nombre    || '',
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
      const facturaParaTicket = {
        ...factura,
        numero,
        cliente_nombre:  clienteObj.nombre,
        vendedor_nombre: userRol?.nombre || '',
        forma_pago:      formaPago,
      };
      imprimirTicket(facturaParaTicket, itemsValidos);
      setFacturaEmitida({ ...data, numero, cliente: clienteObj.nombre, total });
      generarAsientoFactura({
        id: factura.id, numero, subtotal, iva, total,
        cliente_nombre: clienteObj.nombre, metodo_pago: formaPago
      }, 'tributario').catch(console.error);

    } catch (e) {
      setErrorTipo(e.esDatil ? 'datil' : 'interno');
      setError(e.esDatil ? e.message : 'Error interno: ' + e.message);
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

    const facturaPayload = {
      cliente_id:       clienteObj.id,
      numero,
      autorizacion_sri: null, datil_id: null, pdf_url: null, xml_url: null,
      estado:           'borrador',
      subtotal, iva, total, porcentaje_iva: 15,
      forma_pago:       formaPago,
      dias_credito:     formaPago === 'credito' ? diasCredito : 0,
      observaciones,
      vendedor:         currentUser?.email || '',
      vendedor_nombre:  userRol?.nombre    || '',
      created_by:       currentUser?.email || '',
    };
    const detallePayload = itemsValidos.map(it => ({
      producto_nombre: it.producto_nombre,
      descripcion:     it.descripcion || it.producto_nombre,
      cantidad:        parseFloat(it.cantidad),
      precio_unitario: parseFloat(it.precio_unitario),
      subtotal:        parseFloat(it.subtotal),
    }));

    let facturaId = null;
    let savedOnline = false;

    if (navigator.onLine) {
      try {
        const { data: factura, error: errF } = await supabaseReal.from('facturas')
          .insert(facturaPayload).select().single();
        if (errF) throw errF;
        if (!factura?.id) throw new Error('Sin ID');

        facturaId = factura.id;
        savedOnline = true;

        await supabaseReal.from('facturas_detalle').insert(
          detallePayload.map(it => ({ ...it, factura_id: facturaId }))
        );

        if (formaPago === 'credito') {
          const venc = new Date();
          venc.setDate(venc.getDate() + diasCredito);
          await supabase.from('cuentas_cobrar').insert({
            factura_id: facturaId, cliente_id: clienteObj.id,
            monto_total: total, monto_cobrado: 0, estado: 'pendiente',
            fecha_vencimiento: venc.toISOString().split('T')[0]
          });
        }

        generarAsientoFactura({
          id: facturaId, numero, subtotal, iva: 0, total: subtotal,
          cliente_nombre: clienteObj.nombre, metodo_pago: formaPago
        }, 'interno').catch(console.error);

      } catch (e) {
        // Error real de Supabase (no de red)
        if (navigator.onLine) {
          setError('Error al guardar: ' + e.message);
          setEmitiendo(false);
          return;
        }
        // Cayó la red justo al guardar → tratar como offline
      }
    }

    if (!savedOnline) {
      // Offline: guardar localmente como unidad completa (factura + detalle juntos)
      facturaId = `offline-${Date.now()}`;
      addOfflineBorrador({
        id: facturaId,
        facturaPayload,
        detallePayload,
        clienteData:  clienteObj,
        formaPago, diasCredito, observaciones,
        subtotal, iva, total, numero,
        vendedor: currentUser?.email || '',
        timestamp: Date.now(),
      });
    }

    // Incrementar secuencial (queue-friendly — OK offline)
    await supabase.from('config_sistema')
      .update({ valor: String(secuencial + 1), updated_at: new Date().toISOString() })
      .eq('clave', 'factura_secuencial');
    setSecuencial(prev => prev + 1);

    // Siempre actualizar cache para ver offline en TabFacturas
    try {
      const cacheRow = {
        ...facturaPayload, id: facturaId,
        cliente_nombre: clienteObj.nombre,
        deleted_at: null, created_at: new Date().toISOString(),
      };
      const fKey = cacheMakeKey('facturas', {});
      const fCached = await cacheGet(fKey);
      await cacheSet(fKey, [cacheRow, ...(fCached?.data || [])]);

      const dKey = cacheMakeKey('facturas_detalle', {});
      const dCached = await cacheGet(dKey);
      const cacheDetalle = detallePayload.map((it, i) => ({
        ...it, id: `${facturaId}-${i}`, factura_id: facturaId,
      }));
      await cacheSet(dKey, [...(dCached?.data || []), ...cacheDetalle]);
    } catch {}

    const facturaParaTicketB = {
      id: facturaId, numero, estado: 'borrador',
      cliente_nombre: clienteObj.nombre, vendedor_nombre: userRol?.nombre || '',
      forma_pago: formaPago, subtotal, iva, total,
      created_at: new Date().toISOString(),
    };
    imprimirTicket(facturaParaTicketB, items.filter(i => i.producto_nombre && parseFloat(i.cantidad) > 0));
    setFacturaEmitida({ numero, cliente: clienteObj.nombre, total, autorizacion: null, esBorrador: true });
    setEmitiendo(false);
  }

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
      vendedor_nombre:  userRol?.nombre    || '',
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
      try {
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
        const facturaParaTicketNVOff = {
          numero, estado: 'borrador', tipo: 'nota_venta',
          cliente_nombre: clienteObj.nombre, vendedor_nombre: userRol?.nombre || '',
          forma_pago: formaPago, subtotal, iva, total,
          created_at: new Date().toISOString(),
        };
        imprimirTicket(facturaParaTicketNVOff, itemsValidos);
        setFacturaEmitida({ numero, cliente: clienteObj.nombre, total, esBorrador: true, tipo: 'nota_venta' });
      } catch (e) {
        setError('Error al guardar nota de venta offline: ' + e.message);
      }
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

      const facturaParaTicketNV = {
        id: factura.id, numero, estado: 'autorizada', tipo: 'nota_venta',
        cliente_nombre: clienteObj.nombre, vendedor_nombre: userRol?.nombre || '',
        forma_pago: formaPago, subtotal, iva, total,
        created_at: new Date().toISOString(),
      };
      imprimirTicket(facturaParaTicketNV, itemsValidos);
      setFacturaEmitida({ numero, cliente: clienteObj.nombre, total, tipo: 'nota_venta' });

    } catch (e) {
      setError('Error al registrar nota de venta: ' + e.message);
    }
    setEmitiendo(false);
  }

  function nuevaFactura() {
    setFacturaEmitida(null);
    setItems([itemVacio()]);
    setObservaciones('');
    setFormaPago('efectivo');
    setClienteId('consumidor_final');
    setError(''); setErrorTipo('interno');
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
      }}>
        {facturaEmitida.tipo === 'nota_venta' ? '+ Nueva venta' : '+ Nueva factura'}
      </button>
    </div>
  );

  // ── Formulario principal ──────────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* Error */}
      {error && (
        <div style={{
          background: errorTipo === 'datil' ? '#fff3e0' : '#fde8e8',
          border:     `1px solid ${errorTipo === 'datil' ? '#e67e22' : '#e74c3c'}`,
          borderRadius: 8, marginBottom: 14, overflow: 'hidden'
        }}>
          <div style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 'bold',
            background: errorTipo === 'datil' ? '#e67e22' : '#e74c3c', color: 'white' }}>
            {errorTipo === 'datil' ? '📡 Error Dátil / SRI' : '⚠️ Error interno'}
          </div>
          <div style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 'bold',
            color: errorTipo === 'datil' ? '#b7510a' : '#c0392b' }}>
            {error}
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
        <div style={{ display: 'flex', gap: mobile ? 16 : 24, alignItems: 'flex-end' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>SUBTOTAL</div>
            <div style={{ fontSize: mobile ? '13px' : '15px', fontWeight: 'bold', color: '#aed6f1' }}>
              ${subtotal.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>IVA 15%</div>
            <div style={{ fontSize: mobile ? '13px' : '15px', fontWeight: 'bold', color: '#f9e79f' }}>
              ${iva.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#a9dfbf', fontWeight: 700 }}>TOTAL</div>
            <div style={{ fontSize: mobile ? '24px' : '32px', fontWeight: 'bold', color: 'white', lineHeight: 1 }}>
              ${total.toFixed(2)}
            </div>
            <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>
              {articulosCount} artículo{articulosCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
        </div>
      </div>

    </div>
  );
}
