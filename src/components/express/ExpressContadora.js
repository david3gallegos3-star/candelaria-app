// ============================================
// ExpressContadora.js
// Modo express para contadora / administración
// Panel financiero diario + pagos urgentes
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const FORMAS_PAGO = [
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'efectivo',      label: '💵 Efectivo'      },
  { value: 'cheque',        label: '📝 Cheque'        },
];

function diasVenc(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha + 'T00:00:00');
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((d - h) / 86400000);
}

export default function ExpressContadora({ currentUser, onLogout }) {
  const [datos,     setDatos]     = useState(null);
  const [cargando,  setCargando]  = useState(true);
  const [modalPago, setModalPago] = useState(null);
  const [monto,     setMonto]     = useState('');
  const [forma,     setForma]     = useState('transferencia');
  const [guardando, setGuardando] = useState(false);
  const [exito,     setExito]     = useState('');
  const [error,     setError]     = useState('');

  const hoyISO    = new Date().toISOString().split('T')[0];
  const mesISO    = hoyISO.slice(0, 7);
  const mesDesde  = mesISO + '-01';
  const mesHasta  = new Date(
    parseInt(mesISO.slice(0,4)),
    parseInt(mesISO.slice(5,7)),
    0
  ).toISOString().slice(0, 10);

  const fechaLarga = new Date().toLocaleDateString('es-EC', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const cargar = useCallback(async () => {
    setCargando(true);

    const [
      { data: factHoy },
      { data: cobrosHoy },
      { data: comprasHoy },
      { data: cxpUrgentes },
      { data: cxcPend },
      { data: factMes },
      { data: comprasMes },
      { data: nominaMes },
    ] = await Promise.all([
      // Ventas de hoy
      supabase.from('facturas')
        .select('total, iva, subtotal')
        .gte('created_at', hoyISO + 'T00:00:00')
        .lte('created_at', hoyISO + 'T23:59:59')
        .in('estado', ['autorizada', 'borrador']),
      // Cobros de hoy
      supabase.from('cobros')
        .select('monto')
        .eq('fecha', hoyISO),
      // Compras de hoy
      supabase.from('compras')
        .select('total')
        .eq('fecha', hoyISO),
      // CxP urgentes (vencen en ≤7 días)
      supabase.from('cuentas_pagar')
        .select('id, compra_id, proveedor_id, saldo_pendiente, fecha_vencimiento, monto_total, proveedores(nombre)')
        .in('estado', ['pendiente', 'parcial'])
        .lte('fecha_vencimiento', (() => {
          const d = new Date(); d.setDate(d.getDate() + 7);
          return d.toISOString().slice(0, 10);
        })())
        .order('fecha_vencimiento'),
      // CxC total pendiente
      supabase.from('cuentas_cobrar')
        .select('monto_total, monto_cobrado')
        .in('estado', ['pendiente', 'parcial']),
      // Ventas del mes
      supabase.from('facturas')
        .select('subtotal, iva, total')
        .gte('created_at', mesDesde + 'T00:00:00')
        .lte('created_at', mesHasta + 'T23:59:59')
        .in('estado', ['autorizada', 'borrador']),
      // Compras del mes
      supabase.from('compras')
        .select('subtotal, iva, total')
        .gte('fecha', mesDesde)
        .lte('fecha', mesHasta),
      // Nómina del mes
      supabase.from('nomina')
        .select('costo_patronal, estado')
        .eq('periodo', mesISO),
    ]);

    // ── Hoy ──────────────────────────────────────────────
    const ventasHoy   = (factHoy    || []).reduce((s, f) => s + (parseFloat(f.total)   || 0), 0);
    const cobradoHoy  = (cobrosHoy  || []).reduce((s, c) => s + (parseFloat(c.monto)   || 0), 0);
    const comprasHoyT = (comprasHoy || []).reduce((s, c) => s + (parseFloat(c.total)   || 0), 0);

    // ── Mes ──────────────────────────────────────────────
    const ventasMesT  = (factMes    || []).reduce((s, f) => s + (parseFloat(f.total)   || 0), 0);
    const ivaVentas   = (factMes    || []).reduce((s, f) => s + (parseFloat(f.iva)     || 0), 0);
    const comprasMesT = (comprasMes || []).reduce((s, c) => s + (parseFloat(c.total)   || 0), 0);
    const ivaCompras  = (comprasMes || []).reduce((s, c) => s + (parseFloat(c.iva)     || 0), 0);
    const ivaPagar    = ivaVentas - ivaCompras;

    const nominaTotal = (nominaMes || []).reduce((s, n) => s + (parseFloat(n.costo_patronal) || 0), 0);
    const nominaPend  = (nominaMes || []).filter(n => n.estado !== 'pagado').length;

    // ── CxC ──────────────────────────────────────────────
    const xCobrar = (cxcPend || []).reduce((s, c) =>
      s + (parseFloat(c.monto_total) || 0) - (parseFloat(c.monto_cobrado) || 0), 0);

    // ── CxP urgentes ─────────────────────────────────────
    const urgentes = (cxpUrgentes || []).map(p => ({
      ...p,
      dias: diasVenc(p.fecha_vencimiento),
    }));

    setDatos({
      hoy:      { ventas: ventasHoy, cobrado: cobradoHoy, compras: comprasHoyT },
      mes:      { ventas: ventasMesT, compras: comprasMesT, ivaPagar, nominaTotal, nominaPend },
      xCobrar,
      urgentes,
    });
    setCargando(false);
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  async function pagarCuenta() {
    setError('');
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido'); return; }
    const saldo = parseFloat(modalPago.saldo_pendiente) || 0;
    if (montoNum > saldo + 0.01) { setError(`Máximo: $${saldo.toFixed(2)}`); return; }

    setGuardando(true);
    try {
      const nuevoSaldo  = Math.max(0, saldo - montoNum);
      const nuevoEstado = nuevoSaldo <= 0.001 ? 'pagado' : 'parcial';

      await supabase.from('cuentas_pagar').update({
        saldo_pendiente: nuevoSaldo,
        estado:          nuevoEstado,
        updated_at:      new Date().toISOString()
      }).eq('id', modalPago.id);

      await supabase.from('pagos_compras').insert({
        cuenta_pagar_id: modalPago.id,
        compra_id:       modalPago.compra_id,
        proveedor_id:    modalPago.proveedor_id,
        monto:           montoNum,
        forma_pago:      forma,
        fecha_pago:      hoyISO,
        notas:           `Pago express contadora — ${currentUser?.email || ''}`
      });

      setModalPago(null);
      setMonto('');
      setExito(`✅ Pago de $${montoNum.toFixed(2)} registrado`);
      setTimeout(() => setExito(''), 4000);
      await cargar();
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  // ── Estilos base ────────────────────────────────────────
  const sección = (color = '#1a2a3a') => ({
    background: color,
    borderRadius: 14, padding: '14px 16px',
    marginBottom: 12
  });
  const kpi = (color) => ({
    background: '#0f1923', borderRadius: 10,
    padding: '10px 12px', textAlign: 'center',
    border: `1px solid ${color}33`
  });

  if (cargando) return (
    <div style={{
      minHeight: '100vh', background: '#0f1923',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, color: 'white'
    }}>
      <div style={{ fontSize: 40 }}>📊</div>
      <div style={{ fontSize: 16, opacity: 0.7 }}>Cargando panel financiero...</div>
    </div>
  );

  const d = datos;

  return (
    <div style={{
      minHeight: '100vh', background: '#0f1923',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      maxWidth: 520, margin: '0 auto', paddingBottom: 40
    }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#1a2a4a,#2c3e70)',
        padding: '16px', position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>
              📊 Panel Contadora
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
              {fechaLarga}
            </div>
          </div>
          <button onClick={onLogout} style={{
            background: 'rgba(255,255,255,0.12)', color: 'white',
            border: 'none', borderRadius: 8, padding: '8px 12px',
            cursor: 'pointer', fontSize: 12, fontWeight: 'bold'
          }}>Salir</button>
        </div>
      </div>

      {/* Alerta éxito */}
      {exito && (
        <div style={{
          background: '#27ae60', color: 'white',
          padding: '12px 16px', textAlign: 'center',
          fontSize: 14, fontWeight: 'bold'
        }}>{exito}</div>
      )}

      <div style={{ padding: '12px' }}>

        {/* ── RESUMEN DE HOY ──────────────────────── */}
        <div style={sección('#1a2a3a')}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 700,
            letterSpacing: '1px', marginBottom: 10 }}>
            HOY — {hoyISO}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Ventas',    valor: d.hoy.ventas,   color: '#7dff9c' },
              { label: 'Cobrado',   valor: d.hoy.cobrado,  color: '#5dade2' },
              { label: 'Compras',   valor: d.hoy.compras,  color: '#ff6b6b' },
            ].map(r => (
              <div key={r.label} style={kpi(r.color)}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                  {r.label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: r.color }}>
                  ${r.valor.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RESUMEN DEL MES ─────────────────────── */}
        <div style={sección('#1a2a3a')}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 700,
            letterSpacing: '1px', marginBottom: 10 }}>
            {new Date().toLocaleDateString('es-EC',{ month:'long', year:'numeric' }).toUpperCase()}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            {[
              { label: 'Ventas mes',    valor: d.mes.ventas,    color: '#7dff9c' },
              { label: 'Compras mes',   valor: d.mes.compras,   color: '#ff6b6b' },
            ].map(r => (
              <div key={r.label} style={kpi(r.color)}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                  {r.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: r.color }}>
                  ${r.valor.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'IVA a pagar SRI', valor: `$${d.mes.ivaPagar.toFixed(2)}`,
                color: d.mes.ivaPagar > 0 ? '#ff6b6b' : '#7dff9c' },
              { label: 'Costo nómina',    valor: `$${d.mes.nominaTotal.toFixed(2)}`,
                color: '#f0b429' },
              { label: 'x Cobrar total',  valor: `$${d.xCobrar.toFixed(2)}`,
                color: '#5dade2' },
            ].map(r => (
              <div key={r.label} style={kpi(r.color)}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                  {r.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: r.color }}>
                  {r.valor}
                </div>
              </div>
            ))}
          </div>

          {/* Alerta nómina sin pagar */}
          {d.mes.nominaPend > 0 && (
            <div style={{
              marginTop: 10, background: '#f0b42922',
              border: '1px solid #f0b429', borderRadius: 8,
              padding: '8px 12px', fontSize: 12, color: '#f0b429'
            }}>
              ⚠️ {d.mes.nominaPend} empleado{d.mes.nominaPend > 1 ? 's' : ''} con nómina sin marcar como pagada
            </div>
          )}
        </div>

        {/* ── CUENTAS POR PAGAR URGENTES ──────────── */}
        <div style={sección('#1a1a2a')}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 700,
            letterSpacing: '1px', marginBottom: 10 }}>
            🚨 PAGOS URGENTES (≤7 DÍAS)
          </div>

          {d.urgentes.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)',
              fontSize: 13, padding: '16px 0' }}>
              ✅ Sin pagos urgentes esta semana
            </div>
          ) : (
            d.urgentes.map(p => {
              const vencida = p.dias < 0;
              const hoy0    = p.dias === 0;
              const color   = vencida ? '#ff6b6b' : hoy0 ? '#f0b429' : '#ffd580';
              return (
                <div key={p.id} style={{
                  background: '#0f1923',
                  borderRadius: 10, padding: '12px 14px',
                  marginBottom: 8,
                  border: `1px solid ${color}55`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: 'white', fontSize: 15 }}>
                        {p.proveedores?.nombre || '—'}
                      </div>
                      <div style={{ fontSize: 12, color, marginTop: 2 }}>
                        {vencida
                          ? `VENCIDA hace ${Math.abs(p.dias)} día${Math.abs(p.dias) > 1 ? 's' : ''}`
                          : hoy0 ? 'VENCE HOY'
                          : `Vence en ${p.dias} días — ${p.fecha_vencimiento}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        Saldo
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 'bold', color }}>
                        ${(parseFloat(p.saldo_pendiente) || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setModalPago(p); setMonto((parseFloat(p.saldo_pendiente)||0).toFixed(2)); setError(''); }}
                    style={{
                      marginTop: 10, width: '100%',
                      padding: '11px', borderRadius: 8,
                      background: vencida
                        ? 'linear-gradient(135deg,#c0392b,#e74c3c)'
                        : 'linear-gradient(135deg,#1a3a6e,#2980b9)',
                      color: 'white', border: 'none',
                      fontSize: 14, fontWeight: 'bold', cursor: 'pointer'
                    }}>
                    💳 Registrar pago
                  </button>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* ── MODAL PAGO ──────────────────────────────── */}
      {modalPago && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.85)',
          zIndex: 200, display: 'flex', alignItems: 'flex-end'
        }}>
          <div style={{
            background: '#1a2a3a', borderRadius: '20px 20px 0 0',
            padding: '24px', width: '100%',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)'
          }}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)',
              borderRadius: 2, margin: '0 auto 18px' }} />

            <div style={{ fontWeight: 'bold', fontSize: 17, color: 'white', marginBottom: 4 }}>
              💳 Registrar pago
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20 }}>
              {modalPago.proveedores?.nombre} — Saldo ${(parseFloat(modalPago.saldo_pendiente)||0).toFixed(2)}
            </div>

            {/* Monto */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                Monto a pagar ($)
              </div>
              <input
                type="number" min="0.01" step="0.01"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                style={{
                  width: '100%', padding: '14px', fontSize: 22,
                  fontWeight: 'bold', textAlign: 'center',
                  borderRadius: 10, border: '2px solid #2980b9',
                  background: '#0f1923', color: 'white',
                  boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>

            {/* Forma de pago */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {FORMAS_PAGO.map(f => (
                <button key={f.value}
                  onClick={() => setForma(f.value)}
                  style={{
                    flex: 1, padding: '10px 6px',
                    borderRadius: 8, cursor: 'pointer',
                    fontSize: 12, fontWeight: 'bold',
                    background: forma === f.value ? '#2980b9' : '#2a3a4a',
                    color: 'white',
                    border: forma === f.value ? '2px solid #2980b9' : '2px solid transparent'
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {error && (
              <div style={{
                background: '#e74c3c22', border: '1px solid #e74c3c',
                borderRadius: 8, padding: '10px 12px',
                color: '#ff8a8a', fontSize: 13, marginBottom: 12
              }}>⚠️ {error}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setModalPago(null); setError(''); }} style={{
                flex: 1, padding: '14px',
                background: '#2a3a4a', color: 'rgba(255,255,255,0.6)',
                border: 'none', borderRadius: 12,
                fontSize: 14, cursor: 'pointer', fontWeight: 'bold'
              }}>Cancelar</button>
              <button onClick={pagarCuenta} disabled={guardando} style={{
                flex: 2, padding: '14px',
                background: guardando ? '#555' : 'linear-gradient(135deg,#1a3a6e,#2980b9)',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 16, fontWeight: 'bold',
                cursor: guardando ? 'default' : 'pointer'
              }}>
                {guardando ? '⏳ Guardando...' : '✅ Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
