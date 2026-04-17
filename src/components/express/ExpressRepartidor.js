// ============================================
// ExpressRepartidor.js
// Modo express para repartidor / cobrador
// Optimizado para móvil — cobros en ruta
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const FORMAS_COBRO = [
  { value: 'efectivo',      label: '💵 Efectivo'     },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'cheque',        label: '📝 Cheque'        },
];

function diasVenc(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha + 'T00:00:00');
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((d - h) / 86400000);
}

export default function ExpressRepartidor({ currentUser, onLogout }) {
  const [paradas,    setParadas]    = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [modal,      setModal]      = useState(null);   // cuenta seleccionada
  const [monto,      setMonto]      = useState('');
  const [forma,      setForma]      = useState('efectivo');
  const [guardando,  setGuardando]  = useState(false);
  const [exito,      setExito]      = useState('');
  const [error,      setError]      = useState('');

  const hoy = new Date().toLocaleDateString('es-EC', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const cargar = useCallback(async () => {
    setCargando(true);

    // Cuentas pendientes con info de factura y cliente
    const { data: cxc } = await supabase
      .from('cuentas_cobrar')
      .select(`
        id, factura_id, cliente_id,
        monto_total, monto_cobrado, estado, fecha_vencimiento,
        facturas ( numero, forma_pago, created_at ),
        clientes ( nombre, telefono, direccion, ruc )
      `)
      .in('estado', ['pendiente', 'parcial'])
      .is('deleted_at', null)
      .order('fecha_vencimiento', { ascending: true });

    setParadas(cxc || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function cobrar() {
    setError('');
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido'); return; }

    const pendiente = parseFloat(modal.monto_total) - parseFloat(modal.monto_cobrado || 0);
    if (montoNum > pendiente + 0.01) {
      setError(`Máximo a cobrar: $${pendiente.toFixed(2)}`);
      return;
    }

    setGuardando(true);
    try {
      // Registrar cobro
      await supabase.from('cobros').insert({
        cuenta_cobrar_id: modal.id,
        factura_id:       modal.factura_id,
        cliente_id:       modal.cliente_id,
        monto:            montoNum,
        forma_pago:       forma,
        fecha:            new Date().toISOString().split('T')[0],
        observaciones:    `Cobrado en ruta por ${currentUser?.email || 'repartidor'}`,
        registrado_por:   currentUser?.email || ''
      });

      // Actualizar cuenta
      const nuevoCobrado = parseFloat(modal.monto_cobrado || 0) + montoNum;
      const nuevoEstado  = nuevoCobrado >= parseFloat(modal.monto_total) - 0.01
        ? 'cobrada' : 'parcial';
      await supabase.from('cuentas_cobrar')
        .update({ monto_cobrado: nuevoCobrado, estado: nuevoEstado })
        .eq('id', modal.id);

      setModal(null);
      setMonto('');
      setForma('efectivo');
      setExito(`✅ Cobrado $${montoNum.toFixed(2)} a ${modal.clientes?.nombre}`);
      setTimeout(() => setExito(''), 4000);
      await cargar();
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  // ── Cálculos de ruta ──────────────────────────────────
  const totalRuta     = paradas.reduce((s, p) =>
    s + (parseFloat(p.monto_total) - parseFloat(p.monto_cobrado || 0)), 0);
  const paradasVenc   = paradas.filter(p => {
    const d = diasVenc(p.fecha_vencimiento);
    return d !== null && d <= 0;
  }).length;

  if (cargando) return (
    <div style={{
      minHeight: '100vh', background: '#0f1923',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, color: 'white'
    }}>
      <div style={{ fontSize: 40 }}>🚚</div>
      <div style={{ fontSize: 16, opacity: 0.7 }}>Cargando ruta...</div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', background: '#0f1923',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      maxWidth: 480, margin: '0 auto'
    }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#1a3a2a,#27ae60)',
        padding: '16px', position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: 'white' }}>
              🚚 Modo Repartidor
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              {hoy}
            </div>
          </div>
          <button onClick={onLogout} style={{
            background: 'rgba(255,255,255,0.15)', color: 'white',
            border: 'none', borderRadius: 8, padding: '8px 12px',
            cursor: 'pointer', fontSize: 12, fontWeight: 'bold'
          }}>
            Salir
          </button>
        </div>

        {/* Resumen ruta */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8, marginTop: 14
        }}>
          {[
            { label: 'Paradas',    valor: paradas.length,          color: '#a8dfb8' },
            { label: 'A cobrar',   valor: `$${totalRuta.toFixed(2)}`, color: '#fff' },
            { label: 'Vencidas',   valor: paradasVenc,              color: paradasVenc > 0 ? '#ff6b6b' : '#a8dfb8' },
          ].map(r => (
            <div key={r.label} style={{
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 10, padding: '8px 10px', textAlign: 'center'
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>
                {r.label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 'bold', color: r.color }}>
                {r.valor}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerta exito */}
      {exito && (
        <div style={{
          background: '#27ae60', color: 'white',
          padding: '12px 16px', fontSize: 14, fontWeight: 'bold',
          textAlign: 'center'
        }}>
          {exito}
        </div>
      )}

      {/* Lista paradas */}
      <div style={{ padding: '12px' }}>
        {paradas.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: 'rgba(255,255,255,0.5)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 6 }}>
              ¡Ruta completada!
            </div>
            <div style={{ fontSize: 13 }}>
              No hay cuentas pendientes de cobro.
            </div>
          </div>
        ) : (
          paradas.map((p, i) => {
            const pendiente = parseFloat(p.monto_total) - parseFloat(p.monto_cobrado || 0);
            const d         = diasVenc(p.fecha_vencimiento);
            const vencida   = d !== null && d < 0;
            const urgente   = d !== null && d === 0;

            return (
              <div key={p.id} style={{
                background: '#1a2a3a',
                borderRadius: 14,
                marginBottom: 12,
                overflow: 'hidden',
                border: vencida ? '2px solid #e74c3c'
                  : urgente  ? '2px solid #f39c12'
                  : '2px solid transparent'
              }}>
                {/* Indicador estado */}
                <div style={{
                  background: vencida ? '#e74c3c' : urgente ? '#f39c12' : '#2980b9',
                  padding: '4px 12px',
                  fontSize: 11, fontWeight: 'bold', color: 'white',
                  display: 'flex', justifyContent: 'space-between'
                }}>
                  <span>📍 Parada {i + 1}</span>
                  <span>
                    {vencida  ? `VENCIDA hace ${Math.abs(d)} día${Math.abs(d) > 1 ? 's' : ''}`
                      : urgente ? 'VENCE HOY'
                      : d !== null ? `Vence en ${d}d`
                      : 'Sin fecha'}
                  </span>
                </div>

                <div style={{ padding: '14px' }}>
                  {/* Cliente */}
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 4 }}>
                    {p.clientes?.nombre || 'Cliente'}
                  </div>
                  {p.clientes?.direccion && (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                      📍 {p.clientes.direccion}
                    </div>
                  )}

                  {/* Teléfono — tappable */}
                  {p.clientes?.telefono && (
                    <a href={`tel:${p.clientes.telefono}`} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: '#27ae60', color: 'white',
                      borderRadius: 20, padding: '6px 14px',
                      fontSize: 13, fontWeight: 'bold',
                      textDecoration: 'none', marginBottom: 12
                    }}>
                      📞 {p.clientes.telefono}
                    </a>
                  )}

                  {/* Factura + monto */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-end', marginBottom: 12
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>
                        Factura {p.facturas?.numero || '—'}
                      </div>
                      {parseFloat(p.monto_cobrado || 0) > 0 && (
                        <div style={{ fontSize: 12, color: '#a8dfb8' }}>
                          Cobrado: ${parseFloat(p.monto_cobrado).toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>A cobrar</div>
                      <div style={{
                        fontSize: 26, fontWeight: 'bold',
                        color: vencida ? '#ff6b6b' : '#7dff9c'
                      }}>
                        ${pendiente.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Botón cobrar */}
                  <button
                    onClick={() => { setModal(p); setMonto(pendiente.toFixed(2)); setError(''); }}
                    style={{
                      width: '100%', padding: '14px',
                      background: 'linear-gradient(135deg,#27ae60,#1e8449)',
                      color: 'white', border: 'none', borderRadius: 10,
                      fontSize: 16, fontWeight: 'bold', cursor: 'pointer',
                      letterSpacing: '0.5px'
                    }}>
                    💰 COBRAR
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal cobro */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 200, display: 'flex',
          alignItems: 'flex-end'
        }}>
          <div style={{
            background: '#1a2a3a', borderRadius: '20px 20px 0 0',
            padding: '24px', width: '100%',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: 4 }}>
              <div style={{
                width: 40, height: 4, background: 'rgba(255,255,255,0.2)',
                borderRadius: 2, margin: '0 auto 16px'
              }} />
            </div>

            <div style={{ fontWeight: 'bold', fontSize: 18, color: 'white', marginBottom: 4 }}>
              💰 Registrar cobro
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
              {modal.clientes?.nombre} — Factura {modal.facturas?.numero}
            </div>

            {/* Monto */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                Monto a cobrar ($)
              </div>
              <input
                type="number" min="0.01" step="0.01"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                style={{
                  width: '100%', padding: '16px', fontSize: 22,
                  fontWeight: 'bold', textAlign: 'center',
                  borderRadius: 12, border: '2px solid #27ae60',
                  background: '#0f1923', color: 'white',
                  boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>

            {/* Forma de pago */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {FORMAS_COBRO.map(f => (
                <button key={f.value}
                  onClick={() => setForma(f.value)}
                  style={{
                    flex: 1, padding: '10px 6px',
                    borderRadius: 10, cursor: 'pointer',
                    fontSize: 12, fontWeight: 'bold',
                    background: forma === f.value ? '#27ae60' : '#2a3a4a',
                    color: 'white',
                    border: forma === f.value ? '2px solid #27ae60' : '2px solid transparent'
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {error && (
              <div style={{
                background: '#e74c3c22', border: '1px solid #e74c3c',
                borderRadius: 8, padding: '10px 14px',
                color: '#ff8a8a', fontSize: 13, marginBottom: 12
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Botones */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setModal(null); setError(''); }} style={{
                flex: 1, padding: '14px',
                background: '#2a3a4a', color: 'rgba(255,255,255,0.7)',
                border: 'none', borderRadius: 12,
                fontSize: 14, cursor: 'pointer', fontWeight: 'bold'
              }}>
                Cancelar
              </button>
              <button onClick={cobrar} disabled={guardando} style={{
                flex: 2, padding: '14px',
                background: guardando ? '#555' : 'linear-gradient(135deg,#27ae60,#1e8449)',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 16, fontWeight: 'bold',
                cursor: guardando ? 'default' : 'pointer'
              }}>
                {guardando ? '⏳ Registrando...' : '✅ Confirmar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
