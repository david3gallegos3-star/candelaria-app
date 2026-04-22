// ============================================
// TabCobrar.js
// Cuentas por cobrar — registrar cobros
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const ESTADO_COLOR = {
  pendiente: { bg: '#fef9e7', color: '#f39c12', label: '⏳ Pendiente' },
  parcial:   { bg: '#e8f4fd', color: '#2980b9', label: '💧 Parcial'   },
  cobrada:   { bg: '#e8f5e9', color: '#27ae60', label: '✅ Cobrada'    },
  anulada:   { bg: '#fde8e8', color: '#e74c3c', label: '❌ Anulada'    },
};

const FORMAS_COBRO = [
  { value: 'efectivo',      label: '💵 Efectivo'     },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'cheque',        label: '📝 Cheque'        },
];

export default function TabCobrar({ mobile, currentUser }) {

  const [cuentas,      setCuentas]      = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [busqueda,     setBusqueda]     = useState('');
  const [modalCobro,   setModalCobro]   = useState(null); // cuenta seleccionada
  const [montoCobro,   setMontoCobro]   = useState('');
  const [formaCobro,   setFormaCobro]   = useState('efectivo');
  const [obsCobo,      setObsCobro]     = useState('');
  const [registrando,  setRegistrando]  = useState(false);
  const [msgExito,     setMsgExito]     = useState('');

  useEffect(() => { cargarCuentas(); }, []);

  // ── Cargar cuentas ────────────────────────────────────────
  async function cargarCuentas() {
    setCargando(true);
    const { data } = await supabase
      .from('cuentas_cobrar')
      .select(`
        *,
        facturas ( numero, cliente_id, forma_pago ),
        cobros ( fecha, monto )
      `)
      .is('deleted_at', null)
      .order('fecha_vencimiento', { ascending: true });
    setCuentas(data || []);
    setCargando(false);
  }

  // ── Descargar CSV ─────────────────────────────────────────
  function descargarCSV() {
    function num(v) { return parseFloat(v || 0).toFixed(2).replace('.', ','); }
    function fecha(f) {
      if (!f) return '';
      const [y, m, d] = f.split('-');
      return `${parseInt(d)}/${parseInt(m)}/${y}`;
    }

    const SEP = ';';
    const enc = ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'pendiente'];
    const filas = [];

    // Exportar solo lo que está filtrado
    cuentasFiltradas.forEach(c => {
      const cobrosOrdenados = (c.cobros || []).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const fechaPago = cobrosOrdenados.length > 0 ? cobrosOrdenados[0].fecha : (c.fecha_vencimiento || '');
      const pendiente = (c.estado === 'pendiente' || c.estado === 'parcial') ? 'PENDIENTE' : '';
      filas.push([
        (c.facturas?.forma_pago || '').toUpperCase(),
        c.cliente_nombre || '',
        num(c.monto_total),
        num(c.monto_cobrado),
        fecha(fechaPago),
        pendiente
      ]);
    });

    const csv = [`sep=${SEP}`, enc.join(SEP), ...filas.map(f => f.join(SEP))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuentas_cobrar_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Registrar cobro ───────────────────────────────────────
  async function registrarCobro() {
    const monto = parseFloat(montoCobro);
    if (!monto || monto <= 0) return alert('Ingresa un monto válido');
    const cuenta = modalCobro;
    const pendiente = parseFloat(cuenta.monto_total) - parseFloat(cuenta.monto_cobrado);
    if (monto > pendiente + 0.01)
      return alert(`El monto no puede superar lo pendiente: $${pendiente.toFixed(2)}`);

    setRegistrando(true);

    // Insertar cobro
    await supabase.from('cobros').insert({
      cuenta_cobrar_id: cuenta.id,
      factura_id:       cuenta.factura_id,
      cliente_id:       cuenta.cliente_id,
      monto,
      forma_pago:       formaCobro,
      fecha:            new Date().toISOString().split('T')[0],
      observaciones:    obsCobo,
      registrado_por:   currentUser?.email || ''
    });

    // Actualizar monto cobrado y estado
    const nuevoCobrado = parseFloat(cuenta.monto_cobrado) + monto;
    const nuevoEstado  = nuevoCobrado >= parseFloat(cuenta.monto_total) - 0.01
      ? 'cobrada' : 'parcial';

    await supabase.from('cuentas_cobrar')
      .update({ monto_cobrado: nuevoCobrado, estado: nuevoEstado })
      .eq('id', cuenta.id);

    setRegistrando(false);
    setModalCobro(null);
    setMontoCobro('');
    setObsCobro('');
    mostrarExito(`✅ Cobro de $${monto.toFixed(2)} registrado`);
    cargarCuentas();
  }

  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 4000);
  }

  // ── Filtros ───────────────────────────────────────────────
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cuentasFiltradas = cuentas.filter(c => {
    const estadoOk =
      filtroEstado === 'porCobrar' ? (c.estado === 'pendiente' || c.estado === 'parcial') :
      filtroEstado === 'todas'     ? c.estado !== 'anulada' :
      c.estado === filtroEstado;
    const txt = norm(busqueda);
    const busOk = !txt ||
      norm(c.cliente_nombre).includes(txt) ||
      norm(c.facturas?.numero).includes(txt);
    return estadoOk && busOk;
  });

  const totalPendiente = cuentas
    .filter(c => c.estado === 'pendiente' || c.estado === 'parcial')
    .reduce((s, c) => s + (parseFloat(c.monto_total) - parseFloat(c.monto_cobrado)), 0);

  // Días vencidos
  function diasVencimiento(fechaVenc) {
    if (!fechaVenc) return null;
    const hoy  = new Date(); hoy.setHours(0,0,0,0);
    const venc = new Date(fechaVenc + 'T00:00:00');
    return Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
  }

  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px',
    outline: 'none', width: '100%', boxSizing: 'border-box'
  };

  return (
    <div>

      {/* Éxito */}
      {msgExito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '10px 14px', borderRadius: 8,
          marginBottom: 12, fontWeight: 'bold', fontSize: '13px'
        }}>{msgExito}</div>
      )}

      {/* Resumen + filtros */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        {/* Total por cobrar */}
        <div style={{
          background: '#fef9e7', borderRadius: 8,
          padding: '8px 14px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 700 }}>
            TOTAL POR COBRAR
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f39c12' }}>
            ${totalPendiente.toFixed(2)}
          </div>
        </div>

        {/* Buscador */}
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar cliente o factura..."
          style={{
            padding: '7px 12px', borderRadius: 8, border: '1.5px solid #ddd',
            fontSize: '13px', outline: 'none', flex: 1, minWidth: 180
          }}
        />

        {/* Filtro estado */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { value: 'porCobrar', label: '⏳ Por cobrar' },
            { value: 'cobrada',   label: '✅ Cobradas'   },
            { value: 'todas',     label: 'Todas'         },
          ].map(op => (
            <button key={op.value}
              onClick={() => setFiltroEstado(op.value)}
              style={{
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                fontWeight: 'bold', fontSize: '12px', border: 'none',
                background: filtroEstado === op.value ? '#2980b9' : '#f0f2f5',
                color:      filtroEstado === op.value ? 'white'   : '#555',
              }}>{op.label}</button>
          ))}
        </div>

        {/* Descargar CSV */}
        <button
          onClick={descargarCSV}
          style={{
            marginLeft: 'auto', padding: '7px 16px', borderRadius: 8,
            cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
            border: 'none', background: '#1a5276', color: 'white'
          }}>📥 Descargar CSV</button>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          ⏳ Cargando...
        </div>
      ) : cuentasFiltradas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'white', borderRadius: 12, color: '#aaa'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
          <div style={{ fontWeight: 'bold' }}>Sin cuentas en este estado</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cuentasFiltradas.map(c => {
            const est       = ESTADO_COLOR[c.estado] || ESTADO_COLOR.pendiente;
            const pendiente = parseFloat(c.monto_total) - parseFloat(c.monto_cobrado);
            const diasRest  = diasVencimiento(c.fecha_vencimiento);
            const vencida   = diasRest !== null && diasRest < 0 && c.estado !== 'cobrada';

            return (
              <div key={c.id} style={{
                background: vencida ? '#fff8f8' : 'white',
                borderRadius: 12,
                border: `2px solid ${vencida ? '#e74c3c' : '#e0e0e0'}`,
                padding: mobile ? '12px' : '14px 16px',
                display: 'flex', alignItems: 'center',
                flexWrap: 'wrap', gap: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{
                    fontWeight: 'bold', color: '#1a1a2e',
                    fontSize: '14px', marginBottom: 3
                  }}>
                    {c.facturas?.numero || '—'}
                    <span style={{
                      marginLeft: 8, fontSize: '10px',
                      background: est.bg, color: est.color,
                      padding: '2px 8px', borderRadius: 8
                    }}>{est.label}</span>
                    {vencida && (
                      <span style={{
                        marginLeft: 6, fontSize: '10px',
                        background: '#fde8e8', color: '#e74c3c',
                        padding: '2px 8px', borderRadius: 8
                      }}>🔴 VENCIDA {Math.abs(diasRest)}d</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555' }}>
                    👤 {c.cliente_nombre || '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: 2 }}>
                    Vence: {c.fecha_vencimiento || '—'}
                    {diasRest !== null && !vencida && c.estado !== 'cobrada' && (
                      <span style={{ color: diasRest <= 5 ? '#e74c3c' : '#888' }}>
                        {' '}({diasRest}d restantes)
                      </span>
                    )}
                  </div>
                </div>

                {/* Montos */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a5276' }}>
                    ${parseFloat(c.monto_total).toFixed(2)}
                  </div>
                  {parseFloat(c.monto_cobrado) > 0 && (
                    <div style={{ fontSize: '12px', color: '#27ae60' }}>
                      cobrado: ${parseFloat(c.monto_cobrado).toFixed(2)}
                    </div>
                  )}
                  {c.estado !== 'cobrada' && c.estado !== 'anulada' && (
                    <div style={{ fontSize: '12px', color: '#e74c3c', fontWeight: 'bold' }}>
                      pendiente: ${pendiente.toFixed(2)}
                    </div>
                  )}
                </div>

                {/* Botón cobrar */}
                {(c.estado === 'pendiente' || c.estado === 'parcial') && (
                  <button
                    onClick={() => {
                      setModalCobro(c);
                      setMontoCobro(pendiente.toFixed(2));
                      setFormaCobro('efectivo');
                      setObsCobro('');
                    }}
                    style={{
                      background: '#27ae60', color: 'white', border: 'none',
                      borderRadius: 8, padding: '8px 16px',
                      cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
                    }}>💵 Registrar cobro</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal registrar cobro */}
      {modalCobro && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 14,
            padding: '24px', maxWidth: 400, width: '100%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              fontWeight: 'bold', fontSize: '16px',
              color: '#1a1a2e', marginBottom: 4
            }}>💵 Registrar cobro</div>
            <div style={{ fontSize: '13px', color: '#555', marginBottom: 16 }}>
              {modalCobro.facturas?.numero} —{' '}
              Pendiente: <b>${(parseFloat(modalCobro.monto_total) - parseFloat(modalCobro.monto_cobrado)).toFixed(2)}</b>
            </div>

            {/* Monto */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 4 }}>
                Monto a cobrar ($)
              </label>
              <input
                type="number" min="0.01" step="0.01"
                value={montoCobro}
                onChange={e => setMontoCobro(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </div>

            {/* Forma de cobro */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 6 }}>
                Forma de cobro
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                {FORMAS_COBRO.map(f => (
                  <button key={f.value}
                    onClick={() => setFormaCobro(f.value)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8,
                      cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
                      border: 'none',
                      background: formaCobro === f.value ? '#27ae60' : '#f0f2f5',
                      color:      formaCobro === f.value ? 'white'   : '#555',
                    }}>{f.label}</button>
                ))}
              </div>
            </div>

            {/* Observaciones */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 4 }}>
                Observaciones (opcional)
              </label>
              <input
                type="text"
                value={obsCobo}
                onChange={e => setObsCobro(e.target.value)}
                placeholder="Ej: Cheque #001, transferencia banco..."
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalCobro(null)}
                style={{
                  background: '#f0f2f5', color: '#555', border: 'none',
                  borderRadius: 8, padding: '10px 20px',
                  cursor: 'pointer', fontWeight: 'bold'
                }}>Cancelar</button>
              <button
                onClick={registrarCobro}
                disabled={registrando || !montoCobro}
                style={{
                  background: registrando ? '#95a5a6' : '#27ae60',
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '10px 20px',
                  cursor: registrando ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}>{registrando ? '⏳...' : '✅ Confirmar cobro'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
