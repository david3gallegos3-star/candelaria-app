// ============================================
// TabPagosUnificado.js
// Por pagar + Pagos en una sola vista
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase';

const FORMA_SRI  = { efectivo: '01', transferencia: '20', cheque: '20', credito: '19', tarjeta: '19' };
const FORMA_EMOJI = { transferencia: '🏦', efectivo: '💵', cheque: '📝', tarjeta: '💳', credito: '📅' };

function diasRestantes(fechaVenc) {
  if (!fechaVenc) return null;
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(fechaVenc + 'T00:00:00');
  return Math.round((venc - hoy) / 86400000);
}

function badgeVenc(dias) {
  if (dias === null) return null;
  if (dias < 0)  return { label: `Vencida ${Math.abs(dias)}d`, bg: '#e74c3c', color: 'white' };
  if (dias === 0) return { label: 'Vence hoy',                  bg: '#e74c3c', color: 'white' };
  if (dias <= 5)  return { label: `${dias}d`,                   bg: '#f39c12', color: 'white' };
  return               { label: `${dias}d`,                     bg: '#27ae60', color: 'white' };
}

function tipoIdDoc(ruc) {
  if (!ruc) return '07';
  const limpio = ruc.replace(/[^0-9]/g, '');
  if (limpio.length === 13) return '04';
  if (limpio.length === 10) return '05';
  return '06';
}

function parsearXmlSRI(file, onDone) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rawXml = e.target.result;
      const xml    = new DOMParser().parseFromString(rawXml, 'text/xml');
      const clave  = xml.querySelector('claveAcceso')?.textContent?.trim() || '';
      const estab  = xml.querySelector('estab')?.textContent?.trim()       || '';
      const pto    = xml.querySelector('ptoEmi')?.textContent?.trim()      || '';
      const secu   = xml.querySelector('secuencial')?.textContent?.trim()  || '';
      const numF   = estab && pto && secu ? `${estab}-${pto}-${secu}` : '';
      onDone({ autorizacion_sri: clave, numero_factura: numF, xmlContent: rawXml });
    } catch { /* ignore */ }
  };
  reader.readAsText(file);
}

export default function TabPagosUnificado({ mobile }) {
  const hoy  = new Date().toISOString().slice(0, 10);

  const [cuentas,      setCuentas]      = useState([]);
  const [pagos,        setPagos]        = useState([]);
  const [cargando,     setCargando]     = useState(true);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('pendientes');
  const [filtroDesde,  setFiltroDesde]  = useState('');
  const [filtroHasta,  setFiltroHasta]  = useState('');
  const [filtroForma,  setFiltroForma]  = useState('todas');
  const [busqueda,     setBusqueda]     = useState('');

  // Modal registrar pago
  const [modalPago,   setModalPago]    = useState(null);
  const [montoPago,   setMontoPago]    = useState('');
  const [formaPago,   setFormaPago]    = useState('transferencia');
  const [notaPago,    setNotaPago]     = useState('');
  const [guardando,   setGuardando]    = useState(false);
  const [error,       setError]        = useState('');

  // Modal editar cuenta
  const [modalEditar,    setModalEditar]    = useState(null);
  const [editForm,       setEditForm]       = useState({});
  const [xmlEditContent, setXmlEditContent] = useState('');

  // Modal secuencial
  const [modalSeq,  setModalSeq]  = useState(null);
  const [seqValor,  setSeqValor]  = useState('');

  // Modal editar pago
  const [modalEditarPago,  setModalEditarPago]  = useState(null);
  const [editFormPago,     setEditFormPago]      = useState({});
  const [xmlPagoContent,   setXmlPagoContent]    = useState('');
  const [guardandoPago,    setGuardandoPago]      = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: cuentasData } = await supabase
      .from('cuentas_pagar')
      .select(`
        *,
        proveedores ( nombre, razon_social, ruc ),
        compras (
          id, numero_factura, autorizacion_sri, xml_sri_url,
          recordar_factura, subtotal, descuento, iva, total,
          tiene_factura, forma_pago, fecha,
          compras_detalle ( mp_nombre )
        )
      `)
      .order('fecha_vencimiento', { ascending: true });

    const todasCuentas = cuentasData || [];
    setCuentas(todasCuentas);

    if (todasCuentas.length > 0) {
      const ids = todasCuentas.map(c => c.id);
      const { data: pagosData } = await supabase
        .from('pagos_compras')
        .select('*, proveedores ( nombre )')
        .in('cuenta_pagar_id', ids)
        .order('fecha_pago', { ascending: false });
      setPagos(pagosData || []);
    } else {
      setPagos([]);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Filtrado ──────────────────────────────────────────────
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtradas = cuentas.filter(c => {
    const dias = diasRestantes(c.fecha_vencimiento);
    const estadoOk =
      filtroEstado === 'pendientes' ? c.estado !== 'pagado' :
      filtroEstado === 'vencidas'   ? c.estado !== 'pagado' && dias !== null && dias < 0 :
      filtroEstado === 'pagadas'    ? c.estado === 'pagado' :
      true;
    const desdeOk = !filtroDesde || (c.fecha_vencimiento || '') >= filtroDesde;
    const hastaOk = !filtroHasta || (c.fecha_vencimiento || '') <= filtroHasta;
    const formaOk = filtroForma === 'todas' || c.forma_pago === filtroForma;
    const busOk   = !busqueda   || norm(c.proveedores?.nombre).includes(norm(busqueda));
    return estadoOk && desdeOk && hastaOk && formaOk && busOk;
  });

  // Pagos de las cuentas filtradas
  const filtradaIds   = new Set(filtradas.map(c => c.id));
  const pagosFiltrados = pagos.filter(p => filtradaIds.has(p.cuenta_pagar_id));

  // ── Resumen (siempre sobre TODAS las cuentas) ─────────────
  const totalPendiente = cuentas
    .filter(c => c.estado !== 'pagado')
    .reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const totalVencido = cuentas
    .filter(c => c.estado !== 'pagado' && diasRestantes(c.fecha_vencimiento) < 0)
    .reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const cuentasAbiertas = cuentas.filter(c => c.estado !== 'pagado').length;

  // Totales de filtradas
  const totalFiltradas      = filtradas.reduce((s, c) => s + (c.monto_total || 0), 0);
  const saldoFiltradas      = filtradas.reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const totalPagosFiltrados = pagosFiltrados.reduce((s, p) => s + (p.monto || 0), 0);

  const totalesPorForma = pagosFiltrados.reduce((acc, p) => {
    const f = p.forma_pago || 'otro';
    acc[f] = (acc[f] || 0) + (p.monto || 0);
    return acc;
  }, {});

  // ── Exportar pagos CSV ────────────────────────────────────
  function exportarCSV() {
    function txt(v) { return `"${String(v || '').replace(/"/g, '""')}"`; }
    function num(v) { return String(parseFloat(v || 0).toFixed(2)).replace('.', ','); }
    function fecha(f) {
      if (!f) return '""';
      const [y, m, d] = f.split('-');
      return `"${parseInt(d)}/${parseInt(m)}/${y}"`;
    }
    const SEP = ';';
    const enc = ['forma_pago', 'nombre_proveedor', 'valor_factura', 'valor_pago', 'fecha_pago'];
    const rows = pagosFiltrados.map(p => [
      (p.forma_pago || '').toUpperCase(),
      p.proveedores?.nombre || '',
      num(p.monto),
      num(p.monto),
      fecha(p.fecha_pago)
    ]);
    const csv  = [`sep=${SEP}`, enc.join(SEP), ...rows.map(r => r.join(SEP))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pagos_proveedores_${filtroDesde || hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Exportar ATS SRI ──────────────────────────────────────
  function exportarATS() {
    const hayPendientes = filtradas.some(c => c.estado !== 'pagado');
    if (hayPendientes) {
      const ok = window.confirm(
        '⚠️ Hay cuentas pendientes en la vista actual.\n\n' +
        'El ATS se generará solo con las compras mostradas en pantalla.\n\n' +
        '¿Deseas continuar?'
      );
      if (!ok) return;
    }

    const RUC_EMPRESA    = '1004007884001';
    const NOMBRE_EMPRESA = 'Embutidos y Jamones Candelaria';

    const enc = [
      'N','CodDoc','Fecha','RUC Emisor','Razón Social Emisor',
      'Nro.Secuencial','TipoId.','Id.Comprador','Razón Social Comprador',
      'Formas de Pago','Descuento','Total Sin Impuestos',
      'Base IVA 0%','Base IVA 5%','Base IVA 8%','Base IVA 12%','Base IVA 14%','Base IVA 15%',
      'No Objeto IVA','Exento IVA','Desc. Adicional','Devol. IVA',
      'Monto IVA','Base ICE','Monto ICE','Base IRBPNR','Monto IRBPNR',
      'Propina','Ret. IVA Pres.','Ret. Renta Pres.',
      'Monto Total','Guía de Remisión','Primeras 3 Artículos','EXTRAS','Nro de Autorización'
    ];

    const comprasParaATS = filtradas
      .filter(c => c.compra_id && c.compras)
      .map(c => ({ ...c.compras, proveedores: c.proveedores }));

    const rows = comprasParaATS.map((c, i) => {
      const subtotal  = parseFloat(c.subtotal || 0);
      const iva       = parseFloat(c.iva      || 0);
      const total     = parseFloat(c.total    || 0);
      const codDoc    = c.tiene_factura ? '01' : '03';
      const baseIVA15 = c.tiene_factura ? subtotal : 0;
      const baseIVA0  = c.tiene_factura ? 0 : subtotal;
      const items3    = (c.compras_detalle || []).slice(0,3).map(d => d.mp_nombre).join(' / ');

      return [
        i + 1, codDoc, c.fecha || '',
        c.proveedores?.ruc   || '',
        c.proveedores?.razon_social || c.proveedores?.nombre || '',
        c.numero_factura || '',
        tipoIdDoc(c.proveedores?.ruc),
        RUC_EMPRESA, NOMBRE_EMPRESA,
        FORMA_SRI[c.forma_pago] || '20',
        '0.00', subtotal.toFixed(2),
        baseIVA0.toFixed(2),'0.00','0.00','0.00','0.00',
        baseIVA15.toFixed(2),
        '0.00','0.00','0.00','0.00',
        iva.toFixed(2),
        '0.00','0.00','0.00','0.00','0.00','0.00','0.00',
        total.toFixed(2), '', items3, '',
        c.autorizacion_sri || ''
      ];
    });

    const datos = rows.map(r => Object.fromEntries(enc.map((k, i) => [k, r[i]])));
    const ws    = XLSX.utils.json_to_sheet(datos);
    const wb    = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ATS Compras');
    XLSX.writeFile(wb, `ATS_compras_${filtroDesde || hoy}.xlsx`);
  }

  // ── Registrar pago ────────────────────────────────────────
  function abrirPago(cuenta) {
    setModalPago(cuenta);
    setMontoPago(parseFloat(cuenta.saldo_pendiente || 0).toFixed(2));
    setFormaPago('transferencia');
    setNotaPago('');
    setError('');
  }

  async function registrarPago() {
    const monto = parseFloat(montoPago);
    const saldo = parseFloat(modalPago.saldo_pendiente) || 0;
    if (!monto || monto <= 0)           { setError('Ingresa un monto válido.');              return; }
    if (monto > saldo + 0.001)          { setError(`El monto no puede superar el saldo: $${saldo.toFixed(2)}`); return; }
    setGuardando(true); setError('');

    const nuevoSaldo  = Math.max(0, saldo - monto);
    const nuevoEstado = nuevoSaldo <= 0.001 ? 'pagado' : 'parcial';
    const ahora       = new Date().toISOString();

    const { error: e1 } = await supabase.from('cuentas_pagar').update({
      saldo_pendiente: nuevoSaldo, estado: nuevoEstado, updated_at: ahora
    }).eq('id', modalPago.id);
    if (e1) { setError(e1.message); setGuardando(false); return; }

    const { error: e2 } = await supabase.from('pagos_compras').insert({
      cuenta_pagar_id: modalPago.id,
      compra_id:       modalPago.compra_id,
      proveedor_id:    modalPago.proveedor_id,
      monto,
      forma_pago:  formaPago,
      fecha_pago:  ahora.slice(0, 10),
      notas:       notaPago.trim() || null
    });
    if (e2) { setError(e2.message); setGuardando(false); return; }

    await cargar();
    setModalPago(null);
    setGuardando(false);
  }

  // ── Editar cuenta ─────────────────────────────────────────
  function abrirEditar(c) {
    setEditForm({
      monto_total:       parseFloat(c.monto_total       || 0).toFixed(2),
      saldo_pendiente:   parseFloat(c.saldo_pendiente   || 0).toFixed(2),
      fecha_vencimiento: c.fecha_vencimiento || '',
      estado:            c.estado            || 'pendiente',
      forma_pago:        c.forma_pago        || 'credito',
      notas:             c.notas             || '',
      numero_factura:    c.compras?.numero_factura   || '',
      autorizacion_sri:  c.compras?.autorizacion_sri || ''
    });
    setXmlEditContent('');
    setModalEditar(c);
  }

  async function guardarEdicion() {
    await supabase.from('cuentas_pagar').update({
      monto_total:       parseFloat(editForm.monto_total)     || 0,
      saldo_pendiente:   parseFloat(editForm.saldo_pendiente) || 0,
      fecha_vencimiento: editForm.fecha_vencimiento || null,
      estado:            editForm.estado,
      forma_pago:        editForm.forma_pago,
      notas:             editForm.notas.trim() || null,
      updated_at:        new Date().toISOString()
    }).eq('id', modalEditar.id);

    if (modalEditar.compra_id) {
      const nf = editForm.numero_factura.trim() || null;
      await supabase.from('compras').update({
        numero_factura:   nf,
        autorizacion_sri: editForm.autorizacion_sri.trim() || null,
        recordar_factura: nf ? false : undefined
      }).eq('id', modalEditar.compra_id);
    }

    if (xmlEditContent && modalEditar.compra_id) {
      const blob = new Blob([xmlEditContent], { type: 'text/xml' });
      const { error: uploadErr } = await supabase.storage
        .from('xml-sri')
        .upload(`compras/${modalEditar.compra_id}.xml`, blob, { upsert: true, contentType: 'text/xml' });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('xml-sri').getPublicUrl(`compras/${modalEditar.compra_id}.xml`);
        await supabase.from('compras').update({ xml_sri_url: urlData.publicUrl }).eq('id', modalEditar.compra_id);
      }
      setXmlEditContent('');
    }

    setModalEditar(null);
    await cargar();
  }

  // ── Secuencial ────────────────────────────────────────────
  async function guardarSecuencial() {
    if (!modalSeq) return;
    await supabase.from('compras')
      .update({ numero_factura: seqValor.trim() || null })
      .eq('id', modalSeq.compra_id);
    setModalSeq(null); setSeqValor('');
    await cargar();
  }

  // ── Editar pago ───────────────────────────────────────────
  function abrirEditarPago(p) {
    setEditFormPago({
      monto:            p.monto           || '',
      forma_pago:       p.forma_pago      || 'transferencia',
      fecha_pago:       p.fecha_pago      || hoy,
      notas:            p.notas           || '',
      numero_factura:   p.compras?.numero_factura   || '',
      autorizacion_sri: p.compras?.autorizacion_sri || '',
      subtotal:         p.compras?.subtotal || '',
      descuento:        p.compras?.descuento || '',
      iva:              p.compras?.iva      || '',
      total:            p.compras?.total    || ''
    });
    setXmlPagoContent('');
    setModalEditarPago(p);
  }

  async function guardarEdicionPago() {
    if (!modalEditarPago) return;
    setGuardandoPago(true);
    await supabase.from('pagos_compras').update({
      monto:      parseFloat(editFormPago.monto) || 0,
      forma_pago: editFormPago.forma_pago,
      fecha_pago: editFormPago.fecha_pago,
      notas:      editFormPago.notas || null
    }).eq('id', modalEditarPago.id);

    if (modalEditarPago.compras?.id) {
      await supabase.from('compras').update({
        numero_factura:   editFormPago.numero_factura   || null,
        autorizacion_sri: editFormPago.autorizacion_sri || null,
        recordar_factura: editFormPago.numero_factura ? false : undefined,
        subtotal:  parseFloat(editFormPago.subtotal)  || 0,
        descuento: parseFloat(editFormPago.descuento) || 0,
        iva:       parseFloat(editFormPago.iva)       || 0,
        total:     parseFloat(editFormPago.total)     || 0
      }).eq('id', modalEditarPago.compras.id);
    }

    if (xmlPagoContent && modalEditarPago.compras?.id) {
      const blob = new Blob([xmlPagoContent], { type: 'text/xml' });
      const { error: uploadErr } = await supabase.storage
        .from('xml-sri')
        .upload(`compras/${modalEditarPago.compras.id}.xml`, blob, { upsert: true, contentType: 'text/xml' });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('xml-sri').getPublicUrl(`compras/${modalEditarPago.compras.id}.xml`);
        await supabase.from('compras').update({ xml_sri_url: urlData.publicUrl }).eq('id', modalEditarPago.compras.id);
      }
      setXmlPagoContent('');
    }

    setGuardandoPago(false);
    setModalEditarPago(null);
    await cargar();
  }

  // ── Estilos ───────────────────────────────────────────────
  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };
  const inputFull = {
    ...inputStyle, width: '100%', boxSizing: 'border-box'
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div>

      {/* ── Resumen global ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)',
        gap: '10px', marginBottom: '14px'
      }}>
        {[
          { label: 'Total pendiente', valor: `$${totalPendiente.toFixed(2)}`,    color: '#2980b9' },
          { label: 'Total vencido',   valor: `$${totalVencido.toFixed(2)}`,      color: '#e74c3c' },
          { label: 'Cuentas abiertas',valor: String(cuentasAbiertas),            color: '#27ae60' },
        ].map(r => (
          <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
            <div style={{ fontSize: mobile ? '18px' : '22px', fontWeight: 'bold', color: r.color }}>{r.valor}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div style={{ ...card, display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>

        {/* Botones estado */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', width: '100%', marginBottom: '6px' }}>
          {[
            { k: 'pendientes', label: '⏳ Pendientes' },
            { k: 'vencidas',   label: '🚨 Vencidas'   },
            { k: 'pagadas',    label: '✅ Pagadas'     },
            { k: 'todas',      label: '📋 Todas'       },
          ].map(f => (
            <button key={f.k} onClick={() => setFiltroEstado(f.k)} style={{
              padding: '7px 14px', borderRadius: '20px', fontSize: '12px',
              fontWeight: 'bold', cursor: 'pointer',
              border: filtroEstado === f.k ? 'none' : '1px solid #ddd',
              background: filtroEstado === f.k ? '#1a3a2a' : '#f5f5f5',
              color: filtroEstado === f.k ? 'white' : '#555'
            }}>{f.label}</button>
          ))}
        </div>

        {/* Fecha desde/hasta */}
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Desde (venc.)</div>
          <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Hasta (venc.)</div>
          <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={inputStyle} />
        </div>

        {/* Forma */}
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Forma</div>
          <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)} style={inputStyle}>
            <option value="todas">Todas</option>
            <option value="credito">📅 Crédito</option>
            <option value="transferencia">🏦 Transferencia</option>
            <option value="efectivo">💵 Efectivo</option>
            <option value="cheque">📝 Cheque</option>
            <option value="tarjeta">💳 Tarjeta</option>
          </select>
        </div>

        {/* Búsqueda */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Proveedor</div>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar proveedor..."
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Botones descarga */}
        <button onClick={exportarCSV} style={{
          background: '#27ae60', color: 'white', border: 'none',
          borderRadius: '8px', padding: '9px 14px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>📥 CSV Pagos</button>
        <button onClick={exportarATS} style={{
          background: '#8e44ad', color: 'white', border: 'none',
          borderRadius: '8px', padding: '9px 14px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>📋 ATS SRI</button>
      </div>

      {/* ── Totales filtradas ── */}
      {filtradas.length > 0 && (
        <div style={{
          ...card,
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a' }}>
            Facturas: <span style={{ color: '#2980b9' }}>${totalFiltradas.toFixed(2)}</span>
          </div>
          {saldoFiltradas > 0 && (
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#e74c3c' }}>
              Saldo: ${saldoFiltradas.toFixed(2)}
            </div>
          )}
          {totalPagosFiltrados > 0 && (
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#27ae60' }}>
              Pagado: ${totalPagosFiltrados.toFixed(2)}
            </div>
          )}
          {Object.entries(totalesPorForma).map(([forma, total]) => (
            <span key={forma} style={{
              background: '#f0f2f5', borderRadius: '20px',
              padding: '4px 12px', fontSize: '12px', color: '#555'
            }}>
              {FORMA_EMOJI[forma] || '💰'} {forma}: <b>${total.toFixed(2)}</b>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
            {filtradas.length} cuenta{filtradas.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Lista cuentas ── */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          Cargando...
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay cuentas en esta categoría.
        </div>
      ) : (
        filtradas.map(c => {
          const dias   = diasRestantes(c.fecha_vencimiento);
          const badge  = badgeVenc(dias);
          const pagado = c.estado === 'pagado';
          const parcial = c.estado === 'parcial';
          const sri    = c.compras?.autorizacion_sri || '';
          const xmlUrl = c.compras?.xml_sri_url      || null;

          // Pagos de esta cuenta
          const pagosCuenta = pagos.filter(p => p.cuenta_pagar_id === c.id);

          return (
            <div key={c.id} style={{
              ...card,
              borderLeft: `4px solid ${
                pagado  ? '#27ae60' :
                dias !== null && dias < 0 ? '#e74c3c' :
                dias !== null && dias <= 5 ? '#f39c12' : '#2980b9'
              }`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a' }}>
                      🏢 {c.proveedores?.nombre || 'Proveedor'}
                    </span>
                    <span style={{
                      background: pagado ? '#27ae60' : parcial ? '#f39c12' : '#e74c3c',
                      color: 'white', borderRadius: '12px', padding: '2px 10px',
                      fontSize: '11px', fontWeight: 'bold'
                    }}>
                      {pagado ? '✅ Pagado' : parcial ? '⚡ Parcial' : '⏳ Pendiente'}
                    </span>
                    {badge && (
                      <span style={{
                        background: badge.bg, color: badge.color,
                        borderRadius: '12px', padding: '2px 10px', fontSize: '11px', fontWeight: 'bold'
                      }}>{badge.label}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#555' }}>
                    <span>📅 Vence: <b>{c.fecha_vencimiento || '—'}</b></span>
                    <span>💰 Total: <b>${(c.monto_total || 0).toFixed(2)}</b></span>
                    {!pagado && (
                      <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                        Saldo: ${(c.saldo_pendiente || 0).toFixed(2)}
                      </span>
                    )}
                    {c.forma_pago && <span>{FORMA_EMOJI[c.forma_pago] || '💳'} {c.forma_pago}</span>}
                    {c.compras?.numero_factura && (
                      <span style={{ color: '#2980b9' }}>🧾 {c.compras.numero_factura}</span>
                    )}
                    {c.compras?.recordar_factura && (
                      <span style={{ background: '#fff3e0', color: '#e67e22', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                        🔔 Factura pendiente
                      </span>
                    )}
                    {sri ? (
                      <span style={{ color: '#27ae60', fontSize: '11px' }}>✅ XML ···{sri.slice(-8)}</span>
                    ) : (
                      <span style={{ color: '#ccc', fontSize: '11px' }}>— Sin XML</span>
                    )}
                    {xmlUrl && (
                      <a href={xmlUrl}
                        download={`factura_${c.compras?.numero_factura || c.id}.xml`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: '10px', color: '#2980b9', textDecoration: 'none' }}>
                        📥 XML
                      </a>
                    )}
                  </div>

                  {c.notas && (
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                      📝 {c.notas}
                    </div>
                  )}

                  {/* Pagos realizados */}
                  {pagosCuenta.length > 0 && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f0f0f0' }}>
                      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: '700' }}>
                        PAGOS REALIZADOS:
                      </div>
                      {pagosCuenta.map(p => (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          fontSize: '12px', color: '#555', marginBottom: '3px'
                        }}>
                          <span style={{ color: '#27ae60', fontWeight: 'bold' }}>
                            ${(p.monto || 0).toFixed(2)}
                          </span>
                          <span>{FORMA_EMOJI[p.forma_pago] || '💰'} {p.forma_pago}</span>
                          <span>📅 {p.fecha_pago}</span>
                          {p.notas && <span style={{ fontStyle: 'italic', color: '#888' }}>📝 {p.notas}</span>}
                          <button onClick={() => abrirEditarPago(p)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '11px', color: '#2980b9', padding: '0', textDecoration: 'underline'
                          }}>✏️ editar</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                  <button onClick={() => abrirEditar(c)} style={{
                    background: '#f0f2f5', border: 'none', borderRadius: '8px',
                    padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                  }}>✏️ Editar</button>
                  {!pagado && (
                    <button onClick={() => abrirPago(c)} style={{
                      background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                      color: 'white', border: 'none', borderRadius: '8px',
                      padding: '8px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                    }}>💳 Registrar pago</button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* ══ Modal: Registrar Pago ══ */}
      {modalPago && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 6px', color: '#1a3a2a' }}>💳 Registrar pago</h3>
            <p style={{ margin: '0 0 20px', color: '#555', fontSize: '13px' }}>
              Proveedor: <b>{modalPago.proveedores?.nombre}</b><br />
              Saldo: <b style={{ color: '#e74c3c' }}>${(modalPago.saldo_pendiente || 0).toFixed(2)}</b>
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Monto *</label>
              <input type="number" min="0.01" step="0.01" value={montoPago}
                onChange={e => setMontoPago(e.target.value)} style={inputFull} placeholder="0.00" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Forma de pago</label>
              <select value={formaPago} onChange={e => setFormaPago(e.target.value)} style={inputFull}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Nota (opcional)</label>
              <input value={notaPago} onChange={e => setNotaPago(e.target.value)}
                style={inputFull} placeholder="Ej. Transferencia Banco Pichincha" />
            </div>

            {error && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: '8px', padding: '10px', color: '#e74c3c',
                fontSize: '13px', marginBottom: '16px'
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalPago(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={registrarPago} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: '13px', fontWeight: 'bold'
              }}>{guardando ? 'Guardando...' : 'Confirmar pago'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Editar Cuenta ══ */}
      {modalEditar && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            maxWidth: '480px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 4px', color: '#1a3a2a' }}>✏️ Editar cuenta</h3>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '18px' }}>{modalEditar.proveedores?.nombre}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[
                { label: 'Monto total $', key: 'monto_total', type: 'number' },
                { label: 'Saldo pendiente $', key: 'saldo_pendiente', type: 'number' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>{label}</label>
                  <input type={type} min="0" step="0.01" value={editForm[key]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inputFull} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Fecha vencimiento</label>
                <input type="date" value={editForm.fecha_vencimiento}
                  onChange={e => setEditForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} style={inputFull} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Estado</label>
                <select value={editForm.estado}
                  onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))} style={inputFull}>
                  <option value="pendiente">⏳ Pendiente</option>
                  <option value="parcial">⚡ Parcial</option>
                  <option value="pagado">✅ Pagado</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Forma de pago</label>
                <select value={editForm.forma_pago}
                  onChange={e => setEditForm(f => ({ ...f, forma_pago: e.target.value }))} style={inputFull}>
                  <option value="credito">📅 Crédito</option>
                  <option value="transferencia">🏦 Transferencia</option>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="cheque">📝 Cheque</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>🧾 N° Factura proveedor</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={editForm.numero_factura}
                  onChange={e => setEditForm(f => ({ ...f, numero_factura: e.target.value }))}
                  placeholder="001-001-000000001"
                  style={{ ...inputStyle, flex: 1 }} />
                <input id="xml-edit-cxp" type="file" accept=".xml" style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files[0]) parsearXmlSRI(e.target.files[0], ({ autorizacion_sri, numero_factura, xmlContent }) => {
                      setEditForm(f => ({
                        ...f,
                        autorizacion_sri: autorizacion_sri || f.autorizacion_sri,
                        numero_factura:   numero_factura   || f.numero_factura
                      }));
                      if (xmlContent) setXmlEditContent(xmlContent);
                    });
                    e.target.value = '';
                  }}
                />
                <label htmlFor="xml-edit-cxp" style={{
                  background: '#e3f2fd', color: '#1565c0', border: '1.5px solid #90caf9',
                  borderRadius: '8px', padding: '0 12px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap'
                }}>📎 XML</label>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Autorización SRI</label>
              <input value={editForm.autorizacion_sri}
                onChange={e => setEditForm(f => ({ ...f, autorizacion_sri: e.target.value }))}
                placeholder="49 dígitos"
                style={{ ...inputFull, fontFamily: 'monospace', fontSize: '11px', borderColor: editForm.autorizacion_sri ? '#27ae60' : '#ddd' }} />
              {editForm.autorizacion_sri && <div style={{ fontSize: '10px', color: '#27ae60', marginTop: '2px' }}>✅ XML cargado</div>}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Notas</label>
              <input value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones..." style={inputFull} />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEditar(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardarEdicion} style={{
                background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)', color: 'white', border: 'none',
                borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Secuencial ══ */}
      {modalSeq && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '28px',
            maxWidth: '400px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#1a3a2a' }}>🧾 N° Factura / Secuencial</h3>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
              Ingresa el número de la factura del proveedor (ej. 001-001-000000123)
            </p>
            <input value={seqValor} onChange={e => setSeqValor(e.target.value)}
              placeholder="001-001-000000001"
              style={{ ...inputFull, border: '1.5px solid #2980b9', fontSize: '14px', marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalSeq(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardarSecuencial} style={{
                background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)', color: 'white', border: 'none',
                borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Editar Pago ══ */}
      {modalEditarPago && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: mobile ? '95vw' : '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '16px', color: '#1a3a2a' }}>
              ✏️ Editar pago — {modalEditarPago.proveedores?.nombre || '—'}
            </div>

            <div style={{ fontSize: '11px', color: '#2980b9', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pago
            </div>
            {[
              { label: 'Monto pagado ($)', key: 'monto',      type: 'number' },
              { label: 'Fecha de pago',    key: 'fecha_pago', type: 'date'   },
              { label: 'Notas',            key: 'notas',      type: 'text'   },
            ].map(({ label, key, type }) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>{label}</div>
                <input type={type} value={editFormPago[key]}
                  onChange={e => setEditFormPago(f => ({ ...f, [key]: e.target.value }))} style={inputFull} />
              </div>
            ))}

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Forma de pago</div>
              <select value={editFormPago.forma_pago}
                onChange={e => setEditFormPago(f => ({ ...f, forma_pago: e.target.value }))} style={inputFull}>
                {['transferencia','efectivo','cheque','tarjeta'].map(f => <option key={f}>{f}</option>)}
              </select>
            </div>

            {modalEditarPago.compras?.id && <>
              <div style={{ fontSize: '11px', color: '#27ae60', fontWeight: '700', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Compra
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>🧾 N° Factura</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="text" value={editFormPago.numero_factura}
                    onChange={e => setEditFormPago(f => ({ ...f, numero_factura: e.target.value }))}
                    placeholder="001-001-000000001"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} />
                  <input id="xml-edit-pago" type="file" accept=".xml" style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files[0]) parsearXmlSRI(e.target.files[0], ({ autorizacion_sri, numero_factura, xmlContent }) => {
                        setEditFormPago(f => ({
                          ...f,
                          autorizacion_sri: autorizacion_sri || f.autorizacion_sri,
                          numero_factura:   numero_factura   || f.numero_factura
                        }));
                        if (xmlContent) setXmlPagoContent(xmlContent);
                      });
                      e.target.value = '';
                    }}
                  />
                  <label htmlFor="xml-edit-pago" style={{
                    background: '#e3f2fd', color: '#1565c0', border: '1.5px solid #90caf9',
                    borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap'
                  }}>📎 XML</label>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Autorización SRI</div>
                <input type="text" value={editFormPago.autorizacion_sri}
                  onChange={e => setEditFormPago(f => ({ ...f, autorizacion_sri: e.target.value }))}
                  placeholder="49 dígitos" style={{ ...inputFull, fontFamily: 'monospace', fontSize: '11px', borderColor: editFormPago.autorizacion_sri ? '#27ae60' : '#ddd' }} />
                {editFormPago.autorizacion_sri && <div style={{ fontSize: '10px', color: '#27ae60', marginTop: '2px' }}>✅ XML cargado</div>}
              </div>

              {[
                { label: 'Subtotal ($)', key: 'subtotal' },
                { label: 'Descuento ($)', key: 'descuento' },
                { label: 'IVA ($)', key: 'iva' },
                { label: 'Total ($)', key: 'total' },
              ].map(({ label, key }) => (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>{label}</div>
                  <input type="number" value={editFormPago[key]}
                    onChange={e => setEditFormPago(f => ({ ...f, [key]: e.target.value }))} style={inputFull} />
                </div>
              ))}
            </>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEditarPago(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardarEdicionPago} disabled={guardandoPago} style={{
                background: '#2980b9', color: 'white', border: 'none',
                borderRadius: '8px', padding: '9px 18px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>{guardandoPago ? 'Guardando...' : '💾 Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
