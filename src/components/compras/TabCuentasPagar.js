// ============================================
// TabCuentasPagar.js
// Cuentas por pagar con alertas de vencimiento
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

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
  return              { label: `${dias}d`,                      bg: '#27ae60', color: 'white' };
}

export default function TabCuentasPagar({ mobile }) {
  const [cuentas,    setCuentas]    = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [filtro,     setFiltro]     = useState('pendientes'); // pendientes | vencidas | pagadas | todas
  const [modalPago,  setModalPago]  = useState(null); // cuenta seleccionada
  const [montoPago,  setMontoPago]  = useState('');
  const [formaPago,  setFormaPago]  = useState('transferencia');
  const [notaPago,   setNotaPago]   = useState('');
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('cuentas_pagar')
      .select(`
        *,
        proveedores ( nombre )
      `)
      .order('fecha_vencimiento', { ascending: true });
    setCuentas(data || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrado
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const filtradas = cuentas.filter(c => {
    const dias = diasRestantes(c.fecha_vencimiento);
    if (filtro === 'pendientes') return c.estado !== 'pagado';
    if (filtro === 'vencidas')   return c.estado !== 'pagado' && dias !== null && dias < 0;
    if (filtro === 'pagadas')    return c.estado === 'pagado';
    return true;
  });

  // Totales resumen
  const totalPendiente = cuentas
    .filter(c => c.estado !== 'pagado')
    .reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const totalVencido = cuentas
    .filter(c => c.estado !== 'pagado' && diasRestantes(c.fecha_vencimiento) < 0)
    .reduce((s, c) => s + (c.saldo_pendiente || 0), 0);

  // Alertas: vencidas + próximas a vencer ≤5 días
  const alertasUrgentes = cuentas.filter(c => {
    if (c.estado === 'pagado') return false;
    const d = diasRestantes(c.fecha_vencimiento);
    return d !== null && d <= 5;
  });

  function abrirPago(cuenta) {
    setModalPago(cuenta);
    setMontoPago(parseFloat(cuenta.saldo_pendiente || 0).toFixed(2));
    setFormaPago('transferencia');
    setNotaPago('');
    setError('');
  }

  async function registrarPago() {
    const monto  = parseFloat(montoPago);
    const saldo  = parseFloat(modalPago.saldo_pendiente) || 0;
    if (!monto || monto <= 0) { setError('Ingresa un monto válido.'); return; }
    if (monto > saldo + 0.001) {
      setError(`El monto no puede superar el saldo: $${saldo.toFixed(2)}`);
      return;
    }
    setGuardando(true);
    setError('');

    const nuevoSaldo  = Math.max(0, saldo - monto);
    const nuevoEstado = nuevoSaldo <= 0.001 ? 'pagado' : 'parcial';
    const ahora       = new Date().toISOString();

    // 1. Actualizar cuenta
    const { error: e1 } = await supabase.from('cuentas_pagar').update({
      saldo_pendiente: nuevoSaldo,
      estado:          nuevoEstado,
      updated_at:      ahora
    }).eq('id', modalPago.id);
    if (e1) { setError(e1.message); setGuardando(false); return; }

    // 2. Registrar en pagos_compras
    const { error: e2 } = await supabase.from('pagos_compras').insert({
      cuenta_pagar_id:  modalPago.id,
      compra_id:        modalPago.compra_id,
      proveedor_id:     modalPago.proveedor_id,
      monto:            monto,
      forma_pago:       formaPago,
      fecha_pago:       ahora.slice(0, 10),
      notas:            notaPago.trim() || null
    });
    if (e2) { setError(e2.message); setGuardando(false); return; }

    await cargar();
    setModalPago(null);
    setGuardando(false);
  }

  // ── Estilos ──
  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px',
    boxSizing: 'border-box', outline: 'none'
  };

  return (
    <div>
      {/* Banner alertas urgentes */}
      {alertasUrgentes.length > 0 && (
        <div style={{
          background: '#fff0f0', border: '2px solid #e74c3c',
          borderRadius: '12px', padding: '12px 16px', marginBottom: '12px'
        }}>
          <div style={{ fontWeight: 'bold', color: '#c0392b', fontSize: '14px', marginBottom: '6px' }}>
            🚨 {alertasUrgentes.length} cuenta{alertasUrgentes.length > 1 ? 's' : ''} por pagar urgente{alertasUrgentes.length > 1 ? 's' : ''}
          </div>
          {alertasUrgentes.map(c => {
            const d = diasRestantes(c.fecha_vencimiento);
            return (
              <div key={c.id} style={{ fontSize: '12px', color: '#555', marginBottom: '3px' }}>
                • <b>{c.proveedores?.nombre || '—'}</b>
                &nbsp;—&nbsp;${(c.saldo_pendiente || 0).toFixed(2)}
                &nbsp;—&nbsp;
                <span style={{ color: d < 0 ? '#e74c3c' : '#f39c12', fontWeight: 'bold' }}>
                  {d < 0 ? `VENCIDA hace ${Math.abs(d)} días` : d === 0 ? 'VENCE HOY' : `vence en ${d} días`}
                </span>
                &nbsp;({c.fecha_vencimiento})
              </div>
            );
          })}
        </div>
      )}

      {/* Resumen */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)',
        gap: '10px', marginBottom: '14px'
      }}>
        {[
          { label: 'Total pendiente', valor: totalPendiente,       color: '#2980b9' },
          { label: 'Total vencido',   valor: totalVencido,         color: '#e74c3c' },
          { label: 'Cuentas abiertas',valor: cuentas.filter(c => c.estado !== 'pagado').length, color: '#27ae60', esCant: true },
        ].map(r => (
          <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
            <div style={{ fontSize: mobile ? '18px' : '22px', fontWeight: 'bold', color: r.color }}>
              {r.esCant ? r.valor : `$${r.valor.toFixed(2)}`}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { k: 'pendientes', label: '⏳ Pendientes' },
          { k: 'vencidas',   label: '🚨 Vencidas'   },
          { k: 'pagadas',    label: '✅ Pagadas'     },
          { k: 'todas',      label: '📋 Todas'       },
        ].map(f => (
          <button key={f.k} onClick={() => setFiltro(f.k)} style={{
            padding: '7px 14px', borderRadius: '20px', fontSize: '12px',
            fontWeight: 'bold', cursor: 'pointer',
            border: filtro === f.k ? 'none' : '1px solid #ddd',
            background: filtro === f.k ? '#1a3a2a' : '#f5f5f5',
            color: filtro === f.k ? 'white' : '#555'
          }}>{f.label}</button>
        ))}
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          Cargando cuentas...
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay cuentas en esta categoría.
        </div>
      ) : (
        filtradas.map(c => {
          const dias  = diasRestantes(c.fecha_vencimiento);
          const badge = badgeVenc(dias);
          const pagado = c.estado === 'pagado';

          return (
            <div key={c.id} style={{
              ...card,
              borderLeft: `4px solid ${pagado ? '#27ae60' : dias !== null && dias < 0 ? '#e74c3c' : dias !== null && dias <= 5 ? '#f39c12' : '#2980b9'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a' }}>
                      🏢 {c.proveedores?.nombre || 'Proveedor'}
                    </span>
                    <span style={{
                      background: pagado ? '#27ae60' : c.estado === 'parcial' ? '#f39c12' : '#e74c3c',
                      color: 'white', borderRadius: '12px', padding: '2px 10px',
                      fontSize: '11px', fontWeight: 'bold', textTransform: 'capitalize'
                    }}>
                      {pagado ? '✅ Pagado' : c.estado === 'parcial' ? '⚡ Parcial' : '⏳ Pendiente'}
                    </span>
                    {badge && (
                      <span style={{
                        background: badge.bg, color: badge.color,
                        borderRadius: '12px', padding: '2px 10px',
                        fontSize: '11px', fontWeight: 'bold'
                      }}>
                        {badge.label}
                      </span>
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
                    {c.forma_pago && <span>💳 {c.forma_pago}</span>}
                  </div>

                  {c.notas && (
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                      📝 {c.notas}
                    </div>
                  )}
                </div>

                {/* Botón pagar */}
                {!pagado && (
                  <button onClick={() => abrirPago(c)} style={{
                    background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                    color: 'white', border: 'none', borderRadius: '8px',
                    padding: '8px 16px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap'
                  }}>
                    💳 Registrar pago
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* ── Modal Registrar Pago ── */}
      {modalPago && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '420px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 6px', color: '#1a3a2a' }}>💳 Registrar pago</h3>
            <p style={{ margin: '0 0 20px', color: '#555', fontSize: '13px' }}>
              Proveedor: <b>{modalPago.proveedores?.nombre}</b><br />
              Saldo pendiente: <b style={{ color: '#e74c3c' }}>${(modalPago.saldo_pendiente || 0).toFixed(2)}</b>
            </p>

            {/* Monto */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Monto a pagar *
              </label>
              <input
                type="number" min="0.01" step="0.01"
                value={montoPago}
                onChange={e => setMontoPago(e.target.value)}
                style={inputStyle}
                placeholder="0.00"
              />
            </div>

            {/* Forma de pago */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Forma de pago
              </label>
              <select value={formaPago} onChange={e => setFormaPago(e.target.value)} style={inputStyle}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>

            {/* Nota */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Nota (opcional)
              </label>
              <input value={notaPago} onChange={e => setNotaPago(e.target.value)}
                style={inputStyle} placeholder="Ej. Transferencia Banco Pichincha" />
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
              }}>
                {guardando ? 'Guardando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
