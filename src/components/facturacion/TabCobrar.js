import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { generarAsientoCobro } from '../../utils/asientosContables';

const FORMAS_COBRO = [
  { value: 'efectivo',        label: '💵 Efectivo'          },
  { value: 'transferencia',   label: '🏦 Transferencia'     },
  { value: 'cheque',          label: '📝 Cheque'            },
  { value: 'deposito',        label: '🏧 Depósito'          },
  { value: 'tarjeta_credito', label: '💳 Tarjeta de crédito' },
];

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

const ESTADO_INFO = {
  pendiente: { label: 'Pendiente', bg: '#fef9e7', color: '#f39c12' },
  parcial:   { label: 'Parcial',   bg: '#e8f4fd', color: '#2980b9' },
  cobrada:   { label: 'Cobrada',   bg: '#e8f5e9', color: '#27ae60' },
  anulada:   { label: 'Anulada',   bg: '#fde8e8', color: '#e74c3c' },
};

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function TabCobrar({ mobile, currentUser }) {
  const [cuentas,          setCuentas]          = useState([]);
  const [cargando,         setCargando]         = useState(true);
  const [filtroEstado,     setFiltroEstado]     = useState('todas');
  const [filtroDesde,      setFiltroDesde]      = useState('');
  const [filtroHasta,      setFiltroHasta]      = useState('');
  const [filtroForma,      setFiltroForma]      = useState('todas');
  const [busqueda,         setBusqueda]         = useState('');
  const [modalCobro,       setModalCobro]       = useState(null);
  const [montoCobro,       setMontoCobro]       = useState('');
  const [formaCobro,       setFormaCobro]       = useState('efectivo');
  const [referenciaCobro,  setReferenciaCobro]  = useState('');
  const [obsCobo,          setObsCobro]         = useState('');
  const [registrando,      setRegistrando]      = useState(false);
  const [msgExito,         setMsgExito]         = useState('');

  useEffect(() => { cargarCuentas(); }, []);
  useRealtime(['cuentas_cobrar', 'cobros'], cargarCuentas);

  async function cargarCuentas() {
    setCargando(true);
    const { data } = await supabase
      .from('cuentas_cobrar')
      .select('*, facturas(numero, cliente_id, forma_pago), cobros(fecha, monto, forma_pago), clientes(nombre)')
      .is('deleted_at', null)
      .order('fecha_vencimiento', { ascending: true });
    const datosConCliente = (data || []).map(c => ({
      ...c,
      cliente_nombre: c.clientes?.nombre || c.cliente_nombre || '—',
    }));
    setCuentas(datosConCliente);
    setCargando(false);
  }

  async function registrarCobro() {
    const monto = parseFloat(montoCobro);
    if (!monto || monto <= 0) return alert('Ingresa un monto válido');
    const cuenta = modalCobro;
    const pendiente = parseFloat(cuenta.monto_total) - parseFloat(cuenta.monto_cobrado);
    if (monto > pendiente + 0.01)
      return alert(`El monto no puede superar lo pendiente: $${pendiente.toFixed(2)}`);

    setRegistrando(true);

    const { data: cobroData, error: errCobro } = await supabase.from('cobros').insert({
      cuenta_cobrar_id: cuenta.id,
      factura_id:       cuenta.factura_id,
      cliente_id:       cuenta.cliente_id,
      monto,
      forma_pago:       formaCobro,
      fecha:            new Date().toISOString().split('T')[0],
      observaciones:    obsCobo,
      registrado_por:   currentUser?.email || '',
      referencia_pago:  ['transferencia', 'cheque', 'deposito'].includes(formaCobro) ? referenciaCobro || null : null,
      comision:         0,
    }).select('id, monto, forma_pago, fecha').single();

    if (!errCobro && cobroData) {
      generarAsientoCobro({
        id: cobroData.id, monto: parseFloat(cobroData.monto),
        forma_pago: cobroData.forma_pago, fecha: cobroData.fecha,
      }).catch(e => console.error('Error asiento cobro:', e));
    }

    const nuevoCobrado = parseFloat(cuenta.monto_cobrado) + monto;
    const nuevoEstado  = nuevoCobrado >= parseFloat(cuenta.monto_total) - 0.01 ? 'cobrada' : 'parcial';
    await supabase.from('cuentas_cobrar').update({ monto_cobrado: nuevoCobrado, estado: nuevoEstado }).eq('id', cuenta.id);

    setRegistrando(false);
    setModalCobro(null);
    setMontoCobro('');
    setObsCobro('');
    setReferenciaCobro('');
    setMsgExito(`✅ Cobro de $${monto.toFixed(2)} registrado`);
    setTimeout(() => setMsgExito(''), 4000);
    cargarCuentas();
  }

  function descargarCSV() {
    const num = v => parseFloat(v || 0).toFixed(2).replace('.', ',');
    const fecha = f => { if (!f) return ''; const [y,m,d] = f.split('-'); return `${+d}/${+m}/${y}`; };
    const SEP = ';';
    const enc = ['forma_pago','nombre_cliente','valor_cuenta','valor_cobrado','pendiente'];
    const filas = cuentasFiltradas.map(c => [
      (c.facturas?.forma_pago || '').toUpperCase(),
      c.cliente_nombre || '',
      num(c.monto_total),
      num(c.monto_cobrado),
      c.estado !== 'cobrada' ? num(parseFloat(c.monto_total) - parseFloat(c.monto_cobrado)) : '0',
    ]);
    const csv = [`sep=${SEP}`, enc.join(SEP), ...filas.map(f => f.join(SEP))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `cobros_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── KPIs ─────────────────────────────────────────────────────
  const totalPorCobrar = cuentas
    .filter(c => c.estado === 'pendiente' || c.estado === 'parcial')
    .reduce((s, c) => s + parseFloat(c.monto_total) - parseFloat(c.monto_cobrado), 0);

  const totalVencido = cuentas
    .filter(c => (c.estado === 'pendiente' || c.estado === 'parcial') && diasRestantes(c.fecha_vencimiento) < 0)
    .reduce((s, c) => s + parseFloat(c.monto_total) - parseFloat(c.monto_cobrado), 0);

  const cuentasAbiertas = cuentas.filter(c => c.estado === 'pendiente' || c.estado === 'parcial').length;

  // ── Filtros ───────────────────────────────────────────────────
  const cuentasFiltradas = cuentas.filter(c => {
    const dias = diasRestantes(c.fecha_vencimiento);
    const estadoOk =
      filtroEstado === 'porCobrar' ? c.estado === 'pendiente' || c.estado === 'parcial' :
      filtroEstado === 'vencidas'  ? (c.estado === 'pendiente' || c.estado === 'parcial') && dias !== null && dias < 0 :
      filtroEstado === 'cobradas'  ? c.estado === 'cobrada' :
      c.estado !== 'anulada';
    const desdeOk = !filtroDesde || (c.fecha_vencimiento || '') >= filtroDesde;
    const hastaOk = !filtroHasta || (c.fecha_vencimiento || '') <= filtroHasta;
    const formaOk = filtroForma === 'todas' || c.facturas?.forma_pago === filtroForma;
    const txt = norm(busqueda);
    const busOk = !txt || norm(c.cliente_nombre).includes(txt) || norm(c.facturas?.numero).includes(txt);
    return estadoOk && desdeOk && hastaOk && formaOk && busOk;
  });

  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;

  const kpiCard = (label, valor, color, prefix = '$') => (
    <div style={{ background: 'white', borderRadius: 10, padding: '14px 20px',
      boxShadow: '0 1px 6px rgba(0,0,0,0.08)', textAlign: 'center', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{prefix === '$' ? $(valor) : valor}</div>
    </div>
  );

  const btnFiltro = (k, label) => (
    <button key={k} onClick={() => setFiltroEstado(k)} style={{
      padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
      fontWeight: 'bold', fontSize: 12,
      background: filtroEstado === k ? '#1a3a2a' : '#f0f2f5',
      color:      filtroEstado === k ? 'white'   : '#555',
      boxShadow:  filtroEstado === k ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
    }}>{label}</button>
  );

  return (
    <div>
      {msgExito && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '10px 14px',
          borderRadius: 8, marginBottom: 12, fontWeight: 'bold', fontSize: 13 }}>
          {msgExito}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {kpiCard('TOTAL POR COBRAR', totalPorCobrar, '#2980b9')}
        {kpiCard('TOTAL VENCIDO',    totalVencido,   '#e74c3c')}
        {kpiCard('CUENTAS ABIERTAS', cuentasAbiertas, '#f39c12', '')}
      </div>

      {/* Filtros */}
      <div style={{ background: 'white', borderRadius: 10, padding: '14px 16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 16 }}>

        {/* Botones estado */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {btnFiltro('porCobrar', '⏳ Por cobrar')}
          {btnFiltro('vencidas',  '🚨 Vencidas'  )}
          {btnFiltro('cobradas',  '✅ Cobradas'   )}
          {btnFiltro('todas',     '📋 Todas'      )}
        </div>

        {/* Filtros secundarios */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>Vence desde</span>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#888' }}>hasta</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
          </div>
          <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }}>
            <option value="todas">Todas las formas</option>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="cheque">Cheque</option>
            <option value="credito">Crédito</option>
          </select>
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar cliente o factura..."
            style={{ flex: 1, minWidth: 180, padding: '7px 12px', borderRadius: 6,
              border: '1px solid #ddd', fontSize: 13 }} />
          <button onClick={descargarCSV}
            style={{ padding: '7px 14px', borderRadius: 6, border: 'none',
              background: '#1a5276', color: 'white', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>
            📥 CSV
          </button>
        </div>
      </div>

      {/* Totales fila */}
      {cuentasFiltradas.length > 0 && (
        <div style={{ fontSize: 12, color: '#555', marginBottom: 10, paddingLeft: 4 }}>
          <b>{cuentasFiltradas.length}</b> cuenta(s) ·{' '}
          Total: <b style={{ color: '#1a5276' }}>{$(cuentasFiltradas.reduce((s,c) => s + parseFloat(c.monto_total || 0), 0))}</b>{' '}
          · Cobrado: <b style={{ color: '#27ae60' }}>{$(cuentasFiltradas.reduce((s,c) => s + parseFloat(c.monto_cobrado || 0), 0))}</b>{' '}
          · Pendiente: <b style={{ color: '#e74c3c' }}>{$(cuentasFiltradas.reduce((s,c) => s + parseFloat(c.monto_total || 0) - parseFloat(c.monto_cobrado || 0), 0))}</b>
        </div>
      )}

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>
      ) : cuentasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'white', borderRadius: 12, color: '#aaa' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
          <div style={{ fontWeight: 'bold' }}>Sin cuentas en este estado</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cuentasFiltradas.map(c => {
            const dias    = diasRestantes(c.fecha_vencimiento);
            const cobrado = c.estado !== 'cobrada';
            const badge   = cobrado ? badgeVenc(dias) : null;
            const est     = ESTADO_INFO[c.estado] || ESTADO_INFO.pendiente;
            const pendiente = parseFloat(c.monto_total) - parseFloat(c.monto_cobrado);
            const hayPendiente = c.estado === 'pendiente' || c.estado === 'parcial';

            return (
              <div key={c.id} style={{
                background: 'white', borderRadius: 10,
                border: `1.5px solid ${badge && dias < 0 ? '#e74c3c' : '#e0e0e0'}`,
                padding: '14px 16px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
              }}>
                {/* Fila superior */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    {/* Número factura + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 'bold', fontSize: 14, color: '#1a2a4a' }}>
                        {c.facturas?.numero || '—'}
                      </span>
                      <span style={{ fontSize: 10, background: est.bg, color: est.color,
                        padding: '2px 8px', borderRadius: 6, fontWeight: 'bold' }}>
                        {est.label}
                      </span>
                      {badge && (
                        <span style={{ fontSize: 10, background: badge.bg, color: badge.color,
                          padding: '2px 8px', borderRadius: 6, fontWeight: 'bold' }}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    {/* Cliente */}
                    <div style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>
                      👤 {c.cliente_nombre || '—'}
                    </div>
                    {/* Vencimiento */}
                    <div style={{ fontSize: 11, color: '#888' }}>
                      Vence: {c.fecha_vencimiento || '—'}
                      {dias !== null && !badge && (
                        <span style={{ color: dias <= 5 ? '#f39c12' : '#aaa' }}> · {dias}d restantes</span>
                      )}
                    </div>
                  </div>

                  {/* Montos */}
                  <div style={{ textAlign: 'right', minWidth: 120 }}>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1a2a4a' }}>
                      {$(c.monto_total)}
                    </div>
                    {parseFloat(c.monto_cobrado) > 0 && (
                      <div style={{ fontSize: 12, color: '#27ae60' }}>
                        cobrado: {$(c.monto_cobrado)}
                      </div>
                    )}
                    {hayPendiente && (
                      <div style={{ fontSize: 12, color: '#e74c3c', fontWeight: 'bold' }}>
                        pendiente: {$(pendiente)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cobros registrados */}
                {(c.cobros || []).length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: 10, fontWeight: 'bold', color: '#888', marginBottom: 4 }}>
                      COBROS REGISTRADOS:
                    </div>
                    {(c.cobros || []).sort((a,b) => b.fecha.localeCompare(a.fecha)).map((p, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#27ae60', marginBottom: 2 }}>
                        <span style={{ fontWeight: 'bold' }}>{$(p.monto)}</span>
                        <span style={{ color: '#888' }}>🏦 {p.forma_pago}</span>
                        <span style={{ color: '#aaa' }}>📅 {p.fecha}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botón cobrar */}
                {hayPendiente && (
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => {
                      setModalCobro(c);
                      setMontoCobro(pendiente.toFixed(2));
                      setFormaCobro('efectivo');
                      setObsCobro('');
                      setReferenciaCobro('');
                    }} style={{
                      background: '#27ae60', color: 'white', border: 'none',
                      borderRadius: 8, padding: '8px 18px',
                      cursor: 'pointer', fontWeight: 'bold', fontSize: 13,
                    }}>💵 Registrar cobro</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal registrar cobro */}
      {modalCobro && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24,
            maxWidth: 400, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e', marginBottom: 4 }}>
              💵 Registrar cobro
            </div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              {modalCobro.facturas?.numero} — Pendiente:{' '}
              <b>${(parseFloat(modalCobro.monto_total) - parseFloat(modalCobro.monto_cobrado)).toFixed(2)}</b>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 4 }}>
                Monto a cobrar ($)
              </label>
              <input type="number" min="0.01" step="0.01" value={montoCobro}
                onChange={e => setMontoCobro(e.target.value)} autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 6 }}>
                Forma de cobro
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {FORMAS_COBRO.map(f => (
                  <button key={f.value} onClick={() => setFormaCobro(f.value)} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                    fontWeight: 'bold', fontSize: 12, border: 'none',
                    background: formaCobro === f.value ? '#27ae60' : '#f0f2f5',
                    color:      formaCobro === f.value ? 'white'   : '#555',
                  }}>{f.label}</button>
                ))}
              </div>
            </div>

            {['transferencia', 'cheque', 'deposito'].includes(formaCobro) && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>
                  Nº Transacción / Depósito (opcional)
                </label>
                <input type="text" value={referenciaCobro}
                  onChange={e => setReferenciaCobro(e.target.value)} placeholder="Ej: 00123456"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            )}


            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 4 }}>
                Observaciones (opcional)
              </label>
              <input type="text" value={obsCobo} onChange={e => setObsCobro(e.target.value)}
                placeholder="Ej: Cheque #001, transferencia banco..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalCobro(null)}
                style={{ background: '#f0f2f5', color: '#555', border: 'none',
                  borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}>
                Cancelar
              </button>
              <button onClick={registrarCobro} disabled={registrando || !montoCobro}
                style={{ background: registrando ? '#95a5a6' : '#27ae60', color: 'white',
                  border: 'none', borderRadius: 8, padding: '10px 20px',
                  cursor: registrando ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {registrando ? '⏳...' : '✅ Confirmar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
