// ============================================
// TabFacturas.js
// Lista de facturas emitidas — ver, anular, nota de crédito
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { getBorradores as getLocalBorradores } from '../../lib/offlineBorradores';
import { revertirAsientoNotaVenta, revertirAsientoFactura } from '../../utils/asientosContables';
import { imprimirTicket } from '../../utils/imprimirTicket';

const ESTADO_COLOR = {
  autorizada: { bg: '#e8f5e9', color: '#27ae60', label: '✅ Autorizada' },
  anulada:    { bg: '#fde8e8', color: '#e74c3c', label: '❌ Anulada'    },
  borrador:   { bg: '#fef9e7', color: '#f39c12', label: '📝 Borrador'   },
};

const radioStyle = (activo) => ({
  display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
  background: activo ? '#f0f7ff' : '#fafafa',
  border: `1.5px solid ${activo ? '#2980b9' : '#ddd'}`,
  borderRadius: 8, padding: '8px 10px',
});

export default function TabFacturas({ mobile, userRol }) {

  const [facturas,    setFacturas]    = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [filtroEstado,    setFiltroEstado]    = useState('todas');
  const [filtroModo,      setFiltroModo]      = useState('numero');
  const [filtroNumero,    setFiltroNumero]    = useState('');
  const [filtroCliente,   setFiltroCliente]   = useState('');
  const [filtroVendedor,  setFiltroVendedor]  = useState('');
  const [filtroDesde,     setFiltroDesde]     = useState('');
  const [filtroHasta,     setFiltroHasta]     = useState('');
  const [correoEnvio,     setCorreoEnvio]     = useState({});
  const [reenviando,      setReenviando]      = useState({});
  const [expandida,   setExpandida]   = useState(null);
  const [detalle,     setDetalle]     = useState([]);
  const [msgExito,    setMsgExito]    = useState('');
  const [emitiendoId,     setEmitiendoId]     = useState(null);
  const [errorEmitir,     setErrorEmitir]     = useState({});
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [notaCredito,     setNotaCredito]     = useState(null);

  // ── Nota de venta ──
  const [modalAnularNV, setModalAnularNV] = useState(null);
  const [anulandoNV,    setAnulandoNV]    = useState(false);

  // ── Anulación manual ──
  const [modalAnulManual,     setModalAnulManual]     = useState(null);
  const [motivoManual,        setMotivoManual]         = useState('');
  const [accionProdManual,    setAccionProdManual]     = useState('no_aplica');
  const [itemsAnulManual,     setItemsAnulManual]      = useState([]);
  const [motivoPerdidaManual, setMotivoPerdidaManual]  = useState('');
  const [procesandoManual,    setProcesandoManual]     = useState(false);
  const [cargandoItemsModal,  setCargandoItemsModal]   = useState(false);

  // ── Nota de crédito electrónica ──
  const [modalNC,         setModalNC]         = useState(null);
  const [motivoNC,        setMotivoNC]        = useState('devolucion');
  const [tipoNC,          setTipoNC]          = useState('total');
  const [accionProdNC,    setAccionProdNC]    = useState('no_aplica');
  const [itemsNC,         setItemsNC]         = useState([]);
  const [motivoPerdidaNC, setMotivoPerdidaNC] = useState('');
  const [procesandoNC,    setProcesandoNC]    = useState(false);

  useEffect(() => { cargarFacturas(); }, []);
  useRealtime(['facturas', 'facturas_detalle'], cargarFacturas);

  // ── Cargar facturas ───────────────────────────────────────
  async function cargarFacturas() {
    setCargando(true);
    const { data } = await supabase.from('facturas')
      .select('*, clientes(nombre)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const datosConCliente = (data || []).map(f => ({
      ...f,
      cliente_nombre: f.cliente_nombre || f.clientes?.nombre || 'CONSUMIDOR FINAL',
    }));

    const locales = getLocalBorradores().map(b => ({
      ...b.facturaPayload,
      id:             b.id,
      cliente_nombre: b.clienteData?.nombre || 'CONSUMIDOR FINAL',
      estado:         'borrador',
      created_at:     new Date(b.timestamp).toISOString(),
      _local:         true,
      _detalle:       b.detallePayload,
    }));

    const numerosEnSupabase = new Set(datosConCliente.map(f => f.numero));
    const localesFiltrados = locales.filter(l => !numerosEnSupabase.has(l.numero));

    setFacturas([...localesFiltrados, ...datosConCliente]);
    setCargando(false);
  }

  // ── Ver detalle ───────────────────────────────────────────
  async function toggleDetalle(id, tipo) {
    if (expandida === id) { setExpandida(null); setDetalle([]); setNotaCredito(null); return; }
    setExpandida(id);
    setDetalle([]);
    setNotaCredito(null);
    setCargandoDetalle(true);

    if (tipo !== 'nota_venta') {
      const { data: nc } = await supabase.from('notas_credito')
        .select('numero, autorizacion_sri, pdf_url, xml_url, es_manual, motivo')
        .eq('factura_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (nc) setNotaCredito(nc);
    }

    const localBorrador = getLocalBorradores().find(b => b.id === id);
    if (localBorrador) {
      setDetalle(localBorrador.detallePayload.map((it, i) => ({
        ...it, id: `${id}-${i}`, factura_id: id
      })));
      setCargandoDetalle(false);
      return;
    }

    const { data } = await supabase.from('facturas_detalle')
      .select('*').eq('factura_id', id).order('id');
    setDetalle(data || []);
    setCargandoDetalle(false);
  }

  // ── Helpers ───────────────────────────────────────────────
  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 5000);
  }

  async function cargarItemsFactura(facturaId) {
    setCargandoItemsModal(true);
    const { data } = await supabase.from('facturas_detalle')
      .select('*').eq('factura_id', facturaId).order('id');
    setCargandoItemsModal(false);
    return data || [];
  }

  async function confirmarAnuladoSRI(facturaId) {
    const { error } = await supabase.from('facturas')
      .update({ anulado_sri: true }).eq('id', facturaId);
    if (error) return alert('Error: ' + error.message);
    cargarFacturas();
  }

  // ── Reimprimir ticket ─────────────────────────────────────
  async function reimprimir(f) {
    const { data } = await supabase.from('facturas_detalle')
      .select('*').eq('factura_id', f.id).order('id');
    imprimirTicket(f, data || []);
  }

  // ── Reenviar factura por correo ───────────────────────────
  async function reenviarCorreo(facturaId, datil_id, emailDestino) {
    setReenviando(prev => ({ ...prev, [facturaId]: true }));
    try {
      const res = await fetch('/api/reenviar-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datil_id, email: emailDestino || undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al reenviar');
      mostrarExito('✅ Correo reenviado correctamente');
      setCorreoEnvio(prev => ({ ...prev, [facturaId]: '' }));
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setReenviando(prev => ({ ...prev, [facturaId]: false }));
  }

  // ── Anulación manual ──────────────────────────────────────
  async function abrirModalAnulManual(f) {
    setModalAnulManual(f);
    setMotivoManual('');
    setAccionProdManual('no_aplica');
    setMotivoPerdidaManual('');
    const items = await cargarItemsFactura(f.id);
    setItemsAnulManual(items.map(d => ({ ...d, cantidadReingresar: d.cantidad })));
  }

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
        .update({ estado: 'anulada', anulado_sri: false }).eq('id', f.id);
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
        mostrarExito('✅ Anulación manual registrada — recuerda reingresar manualmente al inventario los productos devueltos');
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

  // ── Nota de crédito electrónica ───────────────────────────
  async function abrirModalNC(f) {
    setModalNC(f);
    setMotivoNC('devolucion');
    setTipoNC('total');
    setAccionProdNC('no_aplica');
    setMotivoPerdidaNC('');
    const items = await cargarItemsFactura(f.id);
    setItemsNC(items.map(d => ({
      ...d,
      cantidadAcreditar:  d.cantidad,
      montoAcreditar:     d.subtotal,
      cantidadReingresar: d.cantidad,
    })));
  }

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

      let cliente = { nombre: 'CONSUMIDOR FINAL', ruc: '9999999999999' };
      if (f.cliente_id) {
        const { data: clienteData } = await supabase.from('clientes')
          .select('*').eq('id', f.cliente_id).single();
        if (clienteData) cliente = clienteData;
      }

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
          autorizacion_sri:      f.autorizacion_sri,
          numero_factura:        f.numero,
          fecha_emision_factura: (f.created_at || f.fecha_emision || new Date().toISOString()).split('T')[0],
          motivo:                motivoLabel,
          tipo_motivo:           motivoNC,
          items:                 itemsPayload,
          secuencial,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error Dátil/SRI');

      const { data: nc, error: errNC } = await supabase.from('notas_credito').insert({
        factura_id:       f.id,
        numero,
        motivo:           motivoLabel,
        subtotal:         data.subtotal,
        iva:              data.iva,
        total:            data.total,
        estado:           'emitida',
        es_manual:        false,
        tipo_nc:          tipoNC,
        tipo_motivo:      motivoNC,
        autorizacion_sri: data.autorizacion,
        datil_id:         data.datil_id,
        pdf_url:          data.pdf_url  || null,
        xml_url:          data.xml_url  || null,
        accion_producto:  accionProdNC,
        motivo_perdida:   accionProdNC === 'perdida' ? motivoPerdidaNC : null,
        items_nc:         itemsPayload,
      }).select().single();
      if (errNC) throw new Error(errNC.message);

      await supabase.from('config_sistema')
        .update({ valor: String(secuencial + 1) })
        .eq('clave', 'nota_credito_secuencial');

      // La factura NUNCA se marca 'anulada' por una nota de credito (sea
      // total o parcial) — ante el SRI sigue siendo un documento autorizado;
      // lo que cambia es su valor neto. Solo se reduce/cancela lo pendiente
      // por cobrar por el monto acreditado, y se revierte ese mismo monto
      // (no el de toda la factura) en el libro diario. 'anulada' se reserva
      // para registrarAnulacionManual(), que representa una anulacion real
      // hecha en el portal del SRI, no una nota de credito.
      const { data: cxc } = await supabase.from('cuentas_cobrar')
        .select('id, monto_total, monto_cobrado')
        .eq('factura_id', f.id).eq('estado', 'pendiente').maybeSingle();
      if (cxc) {
        const nuevoMontoTotal = Math.max(0, parseFloat(cxc.monto_total) - data.total);
        const cobrado = parseFloat(cxc.monto_cobrado);
        const nuevoEstado = cobrado >= nuevoMontoTotal - 0.01 ? 'cobrada' : (cobrado > 0 ? 'parcial' : 'pendiente');
        await supabase.from('cuentas_cobrar')
          .update({ monto_total: nuevoMontoTotal, estado: nuevoEstado })
          .eq('id', cxc.id);
      }

      await revertirAsientoFactura({
        id:             f.id,
        numero:         f.numero,
        subtotal:       data.subtotal,
        iva:            data.iva,
        total:          data.total,
        forma_pago:     f.forma_pago,
        cliente_nombre: f.cliente_nombre || 'CONSUMIDOR FINAL',
      });

      if (accionProdNC === 'inventario') {
        mostrarExito(`✅ Nota de crédito ${numero} autorizada por el SRI — recuerda reingresar manualmente al inventario los productos devueltos`);
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

  // ── Anular nota de venta ──────────────────────────────────
  async function anularNotaVenta(f) {
    setAnulandoNV(true);
    try {
      const { error: e1 } = await supabase.from('facturas')
        .update({ estado: 'anulada' }).eq('id', f.id);
      if (e1) throw new Error(e1.message);

      const { error: e2 } = await supabase.from('cuentas_cobrar')
        .update({ estado: 'anulada' })
        .eq('factura_id', f.id).eq('estado', 'pendiente');
      if (e2) throw new Error(e2.message);

      const { error: e3 } = await revertirAsientoNotaVenta({
        id:             f.id,
        numero:         f.numero,
        total:          parseFloat(f.total),
        cliente_nombre: f.cliente_nombre || 'CONSUMIDOR FINAL',
        metodo_pago:    f.forma_pago,
      });
      if (e3) throw new Error(e3.message);

      setModalAnularNV(null);
      mostrarExito('✅ Nota de venta anulada');
      cargarFacturas();
    } catch (e) {
      alert('Error al anular: ' + e.message);
    } finally {
      setAnulandoNV(false);
    }
  }

  // ── Emitir borrador al SRI ────────────────────────────────
  async function emitirBorrador(f) {
    if (!navigator.onLine) {
      setErrorEmitir(prev => ({ ...prev, [f.id]: 'Sin conexión a internet. Conéctate e intenta de nuevo.' }));
      return;
    }
    setEmitiendoId(f.id);
    setErrorEmitir(prev => { const n = { ...prev }; delete n[f.id]; return n; });

    try {
      const { data: clienteData, error: errC } = await supabase.from('clientes')
        .select('*').eq('id', f.cliente_id).single();
      if (errC || !clienteData) throw new Error('No se pudo cargar el cliente');

      const { data: detalleData, error: errD } = await supabase.from('facturas_detalle')
        .select('*').eq('factura_id', f.id);
      if (errD || !detalleData?.length) throw new Error('No se pudo cargar el detalle');

      const secuencial = parseInt(f.numero.split('-').pop(), 10);

      const res = await fetch('/api/emitir-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente:      clienteData,
          items:        detalleData,
          formaPago:    f.forma_pago,
          diasCredito:  f.dias_credito || 0,
          observaciones: f.observaciones || '',
          vendedor:     f.vendedor || '',
          secuencial,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error Dátil/SRI');

      await supabase.from('facturas').update({
        estado:           'autorizada',
        autorizacion_sri: data.autorizacion,
        datil_id:         data.datil_id,
        pdf_url:          data.pdf_url,
        xml_url:          data.xml_url,
      }).eq('id', f.id);

      mostrarExito(`✅ Factura ${f.numero} autorizada por el SRI`);
      cargarFacturas();
    } catch (e) {
      setErrorEmitir(prev => ({ ...prev, [f.id]: e.message }));
    }
    setEmitiendoId(null);
  }

  // ── Filtros ───────────────────────────────────────────────
  const vendedoresUnicos = [...new Set(
    facturas.map(f => f.vendedor_nombre || f.vendedor || '').filter(Boolean)
  )].sort();

  const facturasFiltradas = facturas.filter(f => {
    let modoOk = true;
    if (filtroModo === 'numero' && filtroNumero)
      modoOk = (f.numero || '').toLowerCase().includes(filtroNumero.toLowerCase());
    else if (filtroModo === 'cliente' && filtroCliente)
      modoOk = (f.cliente_nombre || '').toLowerCase().includes(filtroCliente.toLowerCase());
    else if (filtroModo === 'vendedor' && filtroVendedor)
      modoOk = (f.vendedor_nombre || f.vendedor || '') === filtroVendedor;
    else if (filtroModo === 'periodo') {
      const fecha = (f.created_at || '').split('T')[0];
      modoOk = (!filtroDesde || fecha >= filtroDesde) && (!filtroHasta || fecha <= filtroHasta);
    }
    const estadoOk = filtroEstado === 'nota_venta'
      ? f.tipo === 'nota_venta'
      : filtroEstado === 'todas' || f.estado === filtroEstado;
    return modoOk && estadoOk;
  });

  const totalFiltrado = facturasFiltradas
    .filter(f => f.estado === 'autorizada')
    .reduce((s, f) => s + (parseFloat(f.total) || 0), 0);

  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none',
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div>

      {msgExito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '10px 14px', borderRadius: 8,
          marginBottom: 12, fontWeight: 'bold', fontSize: '13px',
        }}>{msgExito}</div>
      )}

      {/* Filtros */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '12px 16px', marginBottom: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {/* Fila 1: modos radio + estado */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {[
            { id: 'numero',   label: '# Factura' },
            { id: 'periodo',  label: '📅 Período' },
            { id: 'cliente',  label: '👤 Cliente' },
            { id: 'vendedor', label: '🧑‍💼 Vendedor' },
          ].map(m => (
            <button key={m.id} onClick={() => setFiltroModo(m.id)} style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
              fontSize: '12px', fontWeight: 'bold',
              background: filtroModo === m.id ? '#1a2a4a' : '#f0f2f5',
              color:      filtroModo === m.id ? 'white'   : '#555',
              border:     filtroModo === m.id ? '2px solid #1a2a4a' : '2px solid transparent',
            }}>{m.label}</button>
          ))}
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            style={{ ...inputStyle, marginLeft: 'auto' }}>
            <option value="todas">Todas</option>
            <option value="autorizada">Autorizadas</option>
            <option value="borrador">Borradores</option>
            <option value="anulada">Anuladas</option>
            <option value="nota_venta">Notas de venta</option>
          </select>
        </div>

        {/* Fila 2: control según modo */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {filtroModo === 'numero' && (
            <input type="text" value={filtroNumero}
              onChange={e => setFiltroNumero(e.target.value)}
              placeholder="🔍 Nº factura..."
              style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
          )}
          {filtroModo === 'cliente' && (
            <input type="text" value={filtroCliente}
              onChange={e => setFiltroCliente(e.target.value)}
              placeholder="🔍 Nombre del cliente..."
              style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
          )}
          {filtroModo === 'vendedor' && (
            <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}>
              <option value="">— Todos los vendedores —</option>
              {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          {filtroModo === 'periodo' && (
            <>
              <label style={{ fontSize: '12px', color: '#555' }}>Desde</label>
              <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
                style={inputStyle} />
              <label style={{ fontSize: '12px', color: '#555' }}>Hasta</label>
              <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
                style={inputStyle} />
            </>
          )}
          <div style={{
            fontSize: '13px', color: '#555', padding: '8px 12px',
            background: '#f0f7ff', borderRadius: 8, fontWeight: 'bold', whiteSpace: 'nowrap',
          }}>
            {facturasFiltradas.length} facturas · ${totalFiltrado.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando facturas...</div>
      ) : facturasFiltradas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'white', borderRadius: 12, color: '#aaa',
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
          <div style={{ fontWeight: 'bold' }}>Sin facturas</div>
          <div style={{ fontSize: '12px', marginTop: 4 }}>Las facturas emitidas aparecerán aquí</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {facturasFiltradas.map(f => {
            const est    = ESTADO_COLOR[f.estado] || ESTADO_COLOR.borrador;
            const abierta = expandida === f.id;
            return (
              <div key={f.id} style={{
                background: f.estado === 'anulada' ? '#fde8e8'
                          : f.estado === 'borrador' ? '#fef9e7' : 'white',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden',
                border: abierta ? '2px solid #2980b9'
                      : f.estado === 'anulada' ? '2px solid #e74c3c' : '2px solid transparent',
              }}>
                <div style={{
                  padding: mobile ? '12px' : '12px 16px',
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px', marginBottom: 2 }}>
                      {f.numero}
                      <span style={{
                        marginLeft: 8, fontSize: '10px',
                        background: est.bg, color: est.color, padding: '2px 8px', borderRadius: 8,
                      }}>{est.label}</span>
                      {f.tipo === 'nota_venta' && (
                        <span style={{
                          marginLeft: 6, fontSize: '10px',
                          background: '#f3e5f5', color: '#8e44ad', padding: '2px 8px', borderRadius: 8,
                        }}>📋 Nota de venta</span>
                      )}
                      {f.estado === 'anulada' && !f.anulado_sri && f.tipo !== 'nota_venta' && (
                        <span style={{
                          marginLeft: 6, fontSize: '10px',
                          background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: 8,
                        }}>⚠️ SRI pendiente</span>
                      )}
                      {f._local && (
                        <span style={{
                          marginLeft: 6, fontSize: '10px',
                          background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 8,
                        }}>📴 sin internet</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                      👤 {f.cliente_nombre || 'CONSUMIDOR FINAL'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: 2 }}>
                      {new Date(f.created_at).toLocaleDateString('es-EC', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      {' · '}{f.forma_pago}
                      {f.forma_pago === 'credito' && f.dias_credito ? ` (${f.dias_credito} días)` : ''}
                    </div>
                  </div>

                  {/* Total */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a5276' }}>
                      ${parseFloat(f.total).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>
                      + IVA ${parseFloat(f.iva || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Botones */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => toggleDetalle(f.id, f.tipo)} style={{
                      background: abierta ? '#2980b9' : 'white',
                      color:      abierta ? 'white'   : '#2980b9',
                      border: '1.5px solid #2980b9',
                      borderRadius: 7, padding: '6px 12px',
                      cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
                    }}>{abierta ? '▲ Cerrar' : '👁 Ver'}</button>
                    <button onClick={() => reimprimir(f)} style={{
                      background: 'white', color: '#555',
                      border: '1.5px solid #aaa', borderRadius: 7,
                      padding: '6px 12px', cursor: 'pointer',
                      fontWeight: 'bold', fontSize: '12px',
                    }}>🖨️ Reimprimir</button>

                    {f.pdf_url && (
                      <a href={f.pdf_url} target="_blank" rel="noreferrer" style={{
                        background: '#e8f4fd', color: '#2980b9',
                        border: '1.5px solid #2980b9', borderRadius: 7, padding: '6px 12px',
                        fontWeight: 'bold', fontSize: '12px',
                        textDecoration: 'none', display: 'inline-block',
                      }}>📄 RIDE</a>
                    )}

                    {f.estado === 'borrador' && !f._local && f.tipo !== 'nota_venta' && (
                      <button
                        onClick={() => emitirBorrador(f)}
                        disabled={emitiendoId === f.id}
                        style={{
                          background: emitiendoId === f.id ? '#95a5a6' : '#f39c12',
                          color: 'white', border: 'none', borderRadius: 7, padding: '6px 12px',
                          cursor: emitiendoId === f.id ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold', fontSize: '12px',
                        }}>
                        {emitiendoId === f.id ? '⏳ Emitiendo...' : '📤 Emitir al SRI'}
                      </button>
                    )}

                    {f.estado === 'borrador' && f._local && (
                      <span style={{
                        fontSize: '11px', color: '#92400e',
                        padding: '6px 10px', background: '#fef3c7',
                        borderRadius: 7, fontWeight: 'bold',
                      }}>⏳ Se enviará al conectarse</span>
                    )}

                    {/* Botones de anulación para facturas electrónicas autorizadas */}
                    {f.estado === 'autorizada' && f.tipo !== 'nota_venta' && (
                      <>
                        <button onClick={() => abrirModalAnulManual(f)} style={{
                          background: 'white', color: '#e67e22',
                          border: '1.5px solid #e67e22', borderRadius: 7,
                          padding: '6px 10px', cursor: 'pointer',
                          fontWeight: 'bold', fontSize: '11px',
                        }}>📋 Anulación manual</button>
                        <button onClick={() => abrirModalNC(f)} style={{
                          background: 'white', color: '#1a5276',
                          border: '1.5px solid #1a5276', borderRadius: 7,
                          padding: '6px 10px', cursor: 'pointer',
                          fontWeight: 'bold', fontSize: '11px',
                        }}>📄 Nota de Crédito</button>
                      </>
                    )}

                    {f.tipo === 'nota_venta' && f.estado === 'autorizada' && (
                      <button onClick={() => setModalAnularNV(f)} style={{
                        background: 'white', color: '#8e44ad',
                        border: '1.5px solid #8e44ad', borderRadius: 7, padding: '6px 12px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
                      }}>🚫 Anular NV</button>
                    )}
                  </div>
                </div>

                {errorEmitir[f.id] && (
                  <div style={{
                    padding: '8px 16px', background: '#fde8e8',
                    color: '#e74c3c', fontSize: '12px', fontWeight: 'bold',
                    borderTop: '1px solid #f5c6cb',
                  }}>⚠️ {errorEmitir[f.id]}</div>
                )}

                {abierta && (
                  <div style={{
                    borderTop: '1.5px solid #e8f4fd',
                    padding: '10px 16px', background: '#f8fcff',
                  }}>
                    {f.autorizacion_sri && (
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: 8, fontFamily: 'monospace' }}>
                        🔑 Auth SRI: {f.autorizacion_sri}
                      </div>
                    )}

                    {f.estado === 'anulada' && f.tipo !== 'nota_venta' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '12px', background: '#d4edda', color: '#155724',
                          padding: '3px 10px', borderRadius: 6, fontWeight: '600',
                        }}>✅ Anulado en sistema</span>
                        {f.anulado_sri ? (
                          <span style={{
                            fontSize: '12px', background: '#d4edda', color: '#155724',
                            padding: '3px 10px', borderRadius: 6, fontWeight: '600',
                          }}>✅ Anulado en SRI</span>
                        ) : (
                          <>
                            <span style={{
                              fontSize: '12px', background: '#fff3cd', color: '#856404',
                              padding: '3px 10px', borderRadius: 6, fontWeight: '600',
                            }}>⚠️ Pendiente confirmar en SRI</span>
                            {(userRol?.rol === 'admin' || userRol?.rol === 'contador') && (
                              <button
                                onClick={() => confirmarAnuladoSRI(f.id)}
                                style={{
                                  fontSize: '11px', background: '#27ae60', color: 'white',
                                  border: 'none', borderRadius: 6, padding: '4px 12px',
                                  cursor: 'pointer', fontWeight: '600',
                                }}
                              >✔ Confirmar en SRI</button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {notaCredito && (
                      <div style={{
                        background: '#fef3c7', border: '1px solid #f59e0b',
                        borderRadius: 8, padding: '8px 12px', marginBottom: 10,
                        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#92400e' }}>
                            📄 Nota de Crédito {notaCredito.numero}
                            {notaCredito.es_manual && ' — Anulación manual'}
                          </div>
                          {notaCredito.autorizacion_sri && (
                            <div style={{ fontSize: '10px', color: '#aaa', fontFamily: 'monospace', marginTop: 2 }}>
                              Auth: {notaCredito.autorizacion_sri}
                            </div>
                          )}
                        </div>
                        {notaCredito.pdf_url && (
                          <a href={notaCredito.pdf_url} target="_blank" rel="noreferrer" style={{
                            background: '#d97706', color: 'white',
                            border: 'none', borderRadius: 6, padding: '4px 12px',
                            fontWeight: 'bold', fontSize: '11px',
                            textDecoration: 'none', display: 'inline-block',
                          }}>🖨️ RIDE NC</a>
                        )}
                        {notaCredito.xml_url && (
                          <a href={notaCredito.xml_url} target="_blank" rel="noreferrer" style={{
                            background: 'white', color: '#d97706',
                            border: '1px solid #d97706', borderRadius: 6, padding: '4px 12px',
                            fontWeight: 'bold', fontSize: '11px',
                            textDecoration: 'none', display: 'inline-block',
                          }}>📎 XML</a>
                        )}
                      </div>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#e8f4fd' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left',  color: '#555' }}>PRODUCTO</th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#555' }}>CANT (kg)</th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#555' }}>PRECIO/kg</th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#555' }}>SUBTOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cargandoDetalle ? (
                          <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: '#aaa' }}>⏳ Cargando...</td></tr>
                        ) : detalle.length === 0 ? (
                          <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: '#aaa' }}>Sin detalle</td></tr>
                        ) : detalle.map((d, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>
                              {d.descripcion || d.producto_nombre}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>{parseFloat(d.cantidad).toFixed(3)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>${parseFloat(d.precio_unitario).toFixed(4)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>
                              ${parseFloat(d.subtotal).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 8, fontSize: '13px' }}>
                      <span style={{ color: '#555' }}>Subtotal: <b>${parseFloat(f.subtotal).toFixed(2)}</b></span>
                      <span style={{ color: '#555' }}>IVA 15%: <b>${parseFloat(f.iva).toFixed(2)}</b></span>
                      <span style={{ color: '#1a5276', fontWeight: 'bold', fontSize: '14px' }}>
                        TOTAL: ${parseFloat(f.total).toFixed(2)}
                      </span>
                    </div>
                    {/* Acciones de correo para facturas autorizadas con datil_id */}
                    {f.estado === 'autorizada' && f.datil_id && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => reenviarCorreo(f.id, f.datil_id)}
                          disabled={reenviando[f.id]}
                          style={{
                            background: reenviando[f.id] ? '#95a5a6' : '#2980b9',
                            color: 'white', border: 'none', borderRadius: 7,
                            padding: '6px 12px', cursor: reenviando[f.id] ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold', fontSize: '12px',
                          }}>
                          {reenviando[f.id] ? '⏳ Enviando...' : '✉️ Reenviar correo'}
                        </button>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="email"
                            value={correoEnvio[f.id] || ''}
                            onChange={e => setCorreoEnvio(prev => ({ ...prev, [f.id]: e.target.value }))}
                            placeholder="otro@correo.com"
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: '12px', width: 180 }}
                          />
                          <button
                            onClick={() => reenviarCorreo(f.id, f.datil_id, correoEnvio[f.id])}
                            disabled={!correoEnvio[f.id] || reenviando[f.id]}
                            style={{
                              background: (!correoEnvio[f.id] || reenviando[f.id]) ? '#95a5a6' : '#27ae60',
                              color: 'white', border: 'none', borderRadius: 7,
                              padding: '6px 12px', cursor: (!correoEnvio[f.id] || reenviando[f.id]) ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold', fontSize: '12px',
                            }}>
                            ✉️ Enviar a este correo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal anulación manual ── */}
      {modalAnulManual && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px',
            maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#e67e22', marginBottom: 4 }}>
              📋 Registrar anulación manual
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: 16 }}>
              {modalAnulManual.numero} — ${parseFloat(modalAnulManual.total).toFixed(2)}<br/>
              <span style={{ color: '#e67e22' }}>Ya fue anulada en el portal SRI. Esto registra la acción internamente.</span>
            </div>

            <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>
              Motivo de anulación <span style={{ color: '#e74c3c' }}>* obligatorio</span>
            </label>
            <textarea
              value={motivoManual}
              onChange={e => setMotivoManual(e.target.value)}
              placeholder="Ej: Anulada en portal SRI por precio incorrecto..."
              rows={2}
              style={{
                width: '100%', padding: '8px', borderRadius: 8,
                border: motivoManual.trim() ? '1.5px solid #ddd' : '1.5px solid #e74c3c',
                fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
                marginTop: 4, marginBottom: motivoManual.trim() ? 14 : 4,
              }}
            />
            {!motivoManual.trim() && (
              <div style={{ fontSize: '11px', color: '#e74c3c', marginBottom: 14 }}>
                ⚠️ Escribe un motivo para poder registrar la anulación
              </div>
            )}

            <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>¿Qué hago con el producto?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, marginBottom: 14 }}>
              {[
                { val: 'no_aplica',  label: 'No aplica',               desc: 'Error de tipificación, sin devolución física' },
                { val: 'inventario', label: 'Reingresar al inventario', desc: 'El producto vuelve al stock' },
                { val: 'perdida',    label: 'Registrar como pérdida',   desc: 'Producto dañado, vencido o no recuperable' },
              ].map(op => (
                <label key={op.val} style={radioStyle(accionProdManual === op.val)}>
                  <input type="radio" value={op.val}
                    checked={accionProdManual === op.val}
                    onChange={() => setAccionProdManual(op.val)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '12px' }}>{op.label}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{op.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {accionProdManual === 'inventario' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>Cantidad a reingresar</label>
                {cargandoItemsModal ? (
                  <div style={{ fontSize: '12px', color: '#aaa', padding: '8px 0' }}>⏳ Cargando ítems...</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: 6 }}>
                    <thead>
                      <tr style={{ background: '#f0f7ff' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Producto</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Vendido</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Reingresar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsAnulManual.map((it, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '6px 8px' }}>{it.descripcion || it.producto_nombre}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{parseFloat(it.cantidad).toFixed(3)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <input
                              type="number" min="0" max={it.cantidad} step="0.001"
                              value={it.cantidadReingresar}
                              onChange={e => setItemsAnulManual(prev =>
                                prev.map((x, j) => j === i ? { ...x, cantidadReingresar: e.target.value } : x)
                              )}
                              style={{ width: 70, padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd', textAlign: 'right' }}
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
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>Motivo de la pérdida *</label>
                <input
                  type="text"
                  value={motivoPerdidaManual}
                  onChange={e => setMotivoPerdidaManual(e.target.value)}
                  placeholder="Ej: Producto dañado en transporte, vencido..."
                  style={{
                    width: '100%', padding: '8px', borderRadius: 8, border: '1.5px solid #ddd',
                    fontSize: '13px', boxSizing: 'border-box', marginTop: 4,
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalAnulManual(null)} disabled={procesandoManual}
                style={{ background: '#f0f2f5', color: '#555', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}>
                Cancelar
              </button>
              <button onClick={registrarAnulacionManual} disabled={procesandoManual || !motivoManual.trim()}
                style={{
                  background: procesandoManual ? '#95a5a6' : !motivoManual.trim() ? '#bdc3c7' : '#e67e22',
                  color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px',
                  cursor: (procesandoManual || !motivoManual.trim()) ? 'not-allowed' : 'pointer', fontWeight: 'bold',
                }}>
                {procesandoManual ? '⏳ Registrando...' : '📋 Registrar anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nota de crédito electrónica ── */}
      {modalNC && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px',
            maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1a5276', marginBottom: 4 }}>
              📄 Emitir Nota de Crédito al SRI
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: 16 }}>
              {modalNC.numero} — ${parseFloat(modalNC.total).toFixed(2)}<br/>
              <span style={{ color: '#27ae60', fontWeight: '600' }}>
                ✅ Se enviará a Dátil → SRI y quedará registrada legalmente.
              </span>
            </div>

            <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>Motivo</label>
            <select
              value={motivoNC}
              onChange={e => setMotivoNC(e.target.value)}
              style={{
                width: '100%', padding: '8px', borderRadius: 8, border: '1.5px solid #ddd',
                fontSize: '13px', marginTop: 4, marginBottom: 14, boxSizing: 'border-box',
              }}
            >
              <option value="devolucion">Devolución de producto</option>
              <option value="error_precio">Error en precio / tipificación</option>
              <option value="otro">Otro</option>
            </select>

            <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>Tipo de nota de crédito</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, marginBottom: 14 }}>
              {[
                { val: 'total',   label: 'Total',   desc: 'Cubre el 100% de la factura' },
                { val: 'parcial', label: 'Parcial', desc: 'Solo los ítems seleccionados' },
              ].map(op => (
                <label key={op.val} style={{ ...radioStyle(tipoNC === op.val), flex: 1 }}>
                  <input type="radio" value={op.val} checked={tipoNC === op.val} onChange={() => setTipoNC(op.val)} />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '12px' }}>{op.label}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{op.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {tipoNC === 'parcial' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>Ítems a acreditar</label>
                {cargandoItemsModal ? (
                  <div style={{ fontSize: '12px', color: '#aaa', padding: '8px 0' }}>⏳ Cargando ítems...</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: 6 }}>
                    <thead>
                      <tr style={{ background: '#e8f4fd' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Producto</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Precio/kg</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cantidad</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Monto $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsNC.map((it, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '6px 8px', fontSize: '11px' }}>{it.descripcion || it.producto_nombre}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>${parseFloat(it.precio_unitario).toFixed(4)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <input
                              type="number" min="0" max={it.cantidad} step="0.001"
                              value={it.cantidadAcreditar}
                              onChange={e => setItemsNC(prev => prev.map((x, j) => j === i ? {
                                ...x,
                                cantidadAcreditar: e.target.value,
                                montoAcreditar: (parseFloat(e.target.value) * parseFloat(x.precio_unitario)).toFixed(2),
                              } : x))}
                              style={{ width: 70, padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                            ${parseFloat(it.montoAcreditar || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>¿Qué hago con el producto devuelto?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, marginBottom: 14 }}>
              {[
                { val: 'no_aplica',  label: 'No aplica',               desc: 'Error de precio, sin devolución física' },
                { val: 'inventario', label: 'Reingresar al inventario', desc: 'El producto vuelve al stock' },
                { val: 'perdida',    label: 'Registrar como pérdida',   desc: 'Producto dañado o no recuperable' },
              ].map(op => (
                <label key={op.val} style={radioStyle(accionProdNC === op.val)}>
                  <input type="radio" value={op.val}
                    checked={accionProdNC === op.val}
                    onChange={() => setAccionProdNC(op.val)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '12px' }}>{op.label}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{op.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {accionProdNC === 'inventario' && tipoNC === 'total' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>Cantidad a reingresar</label>
                {cargandoItemsModal ? (
                  <div style={{ fontSize: '12px', color: '#aaa', padding: '8px 0' }}>⏳ Cargando ítems...</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: 6 }}>
                    <thead>
                      <tr style={{ background: '#f0f7ff' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Producto</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Vendido</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Reingresar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsNC.map((it, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '6px 8px' }}>{it.descripcion || it.producto_nombre}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{parseFloat(it.cantidad).toFixed(3)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <input
                              type="number" min="0" max={it.cantidad} step="0.001"
                              value={it.cantidadReingresar}
                              onChange={e => setItemsNC(prev =>
                                prev.map((x, j) => j === i ? { ...x, cantidadReingresar: e.target.value } : x)
                              )}
                              style={{ width: 70, padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd', textAlign: 'right' }}
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
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: '600', fontSize: '12px', color: '#333' }}>Motivo de la pérdida *</label>
                <input
                  type="text"
                  value={motivoPerdidaNC}
                  onChange={e => setMotivoPerdidaNC(e.target.value)}
                  placeholder="Ej: Producto dañado, vencido, no apto para venta..."
                  style={{
                    width: '100%', padding: '8px', borderRadius: 8, border: '1.5px solid #ddd',
                    fontSize: '13px', boxSizing: 'border-box', marginTop: 4,
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalNC(null)} disabled={procesandoNC}
                style={{ background: '#f0f2f5', color: '#555', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}>
                Cancelar
              </button>
              <button onClick={emitirNotaCredito} disabled={procesandoNC || !modalNC.autorizacion_sri}
                style={{
                  background: procesandoNC ? '#95a5a6' : !modalNC.autorizacion_sri ? '#bdc3c7' : '#1a5276',
                  color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px',
                  cursor: procesandoNC || !modalNC.autorizacion_sri ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                }}>
                {procesandoNC ? '⏳ Enviando a SRI...' : '📄 Emitir NC al SRI'}
              </button>
            </div>
            {!modalNC.autorizacion_sri && (
              <div style={{ fontSize: '11px', color: '#e74c3c', marginTop: 6, textAlign: 'right' }}>
                ⚠️ Esta factura no tiene código de autorización SRI — usa anulación manual
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal anular nota de venta ── */}
      {modalAnularNV && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: '24px', maxWidth: 420, width: '100%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#8e44ad', marginBottom: 8 }}>
              ¿Anular nota de venta?
            </div>
            <div style={{ fontSize: '13px', color: '#555', marginBottom: 6 }}>
              {modalAnularNV.numero} — {modalAnularNV.cliente_nombre || 'CONSUMIDOR FINAL'}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: 20 }}>
              Se revertirá el asiento contable. Esta acción no se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setModalAnularNV(null)} disabled={anulandoNV}
                style={{ background: '#f0f2f5', color: '#555', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: anulandoNV ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                Cancelar
              </button>
              <button onClick={() => anularNotaVenta(modalAnularNV)} disabled={anulandoNV}
                style={{
                  background: anulandoNV ? '#95a5a6' : '#8e44ad',
                  color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px',
                  cursor: anulandoNV ? 'not-allowed' : 'pointer', fontWeight: 'bold',
                }}>
                {anulandoNV ? '⏳ Anulando...' : '🚫 Sí, anular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
