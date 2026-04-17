// ============================================
// TabVentasCobros.js
// Cruza ventas facturadas vs cobros registrados
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

export default function TabVentasCobros({ mobile }) {
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    // 1. Facturas emitidas en el período
    const { data: facturas } = await supabase
      .from('facturas')
      .select('id, numero, cliente_id, total, estado, created_at, clientes(nombre)')
      .gte('created_at', desde + 'T00:00:00')
      .lte('created_at', hasta + 'T23:59:59')
      .in('estado', ['autorizada', 'borrador']);

    // 2. Cobros registrados en el período
    const { data: cobros } = await supabase
      .from('cobros')
      .select('factura_id, monto, fecha')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    // Cobros agrupados por factura
    const cobrosPorFactura = {};
    (cobros || []).forEach(c => {
      if (!cobrosPorFactura[c.factura_id]) cobrosPorFactura[c.factura_id] = 0;
      cobrosPorFactura[c.factura_id] += parseFloat(c.monto) || 0;
    });

    // Cobros de cuentas_cobrar (en caso de que haya tabla separada)
    const { data: cxc } = await supabase
      .from('cuentas_cobrar')
      .select('factura_id, monto_cobrado, monto_total, estado')
      .gte('created_at', desde + 'T00:00:00')
      .lte('created_at', hasta + 'T23:59:59');

    const cxcPorFactura = {};
    (cxc || []).forEach(c => {
      cxcPorFactura[c.factura_id] = {
        cobrado: parseFloat(c.monto_cobrado) || 0,
        total:   parseFloat(c.monto_total)   || 0,
        estado:  c.estado,
      };
    });

    const filas = (facturas || []).map(f => {
      const cobrado = cobrosPorFactura[f.id] || cxcPorFactura[f.id]?.cobrado || 0;
      const pendiente = (parseFloat(f.total) || 0) - cobrado;
      return {
        numero:    f.numero,
        cliente:   f.clientes?.nombre || '—',
        total:     parseFloat(f.total) || 0,
        cobrado,
        pendiente,
        estado:    pendiente <= 0.01 ? 'cobrado' : pendiente < f.total ? 'parcial' : 'pendiente',
      };
    });

    const totalFacturado = filas.reduce((s, r) => s + r.total,    0);
    const totalCobrado   = filas.reduce((s, r) => s + r.cobrado,  0);
    const totalPendiente = filas.reduce((s, r) => s + r.pendiente, 0);

    setResultado({ filas, totalFacturado, totalCobrado, totalPendiente });
    setCargando(false);
  }, [desde, hasta]);

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    padding: mobile ? '12px' : '16px', marginBottom: '12px'
  };
  const inputStyle = {
    padding: '7px 10px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };
  const colorEstado = { cobrado: '#27ae60', parcial: '#f39c12', pendiente: '#e74c3c' };

  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: 3, fontWeight: 600 }}>Desde</div>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: 3, fontWeight: 600 }}>Hasta</div>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={analizar} disabled={cargando} style={{
          background: cargando ? '#aaa' : 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 18px', cursor: cargando ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {cargando ? '⏳ Analizando...' : '🔍 Analizar'}
        </button>
      </div>

      {/* Resultado */}
      {resultado && (
        <>
          {/* Resumen */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)',
            gap: '8px', marginBottom: '12px'
          }}>
            {[
              { label: 'Total facturado',  valor: resultado.totalFacturado,  color: '#2980b9' },
              { label: 'Total cobrado',    valor: resultado.totalCobrado,    color: '#27ae60' },
              { label: 'Pendiente cobro',  valor: resultado.totalPendiente,  color: resultado.totalPendiente > 0 ? '#e74c3c' : '#27ae60' },
            ].map(r => (
              <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: mobile ? '15px' : '18px', fontWeight: 'bold', color: r.color }}>
                  ${r.valor.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          {resultado.filas.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: '#888', padding: '30px' }}>
              ✅ Sin facturas en el período seleccionado
            </div>
          ) : (
            <div style={card}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a', marginBottom: '10px' }}>
                📋 Detalle por factura
              </div>
              {resultado.filas.map((r, i) => (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr 1fr' : '2fr 2fr 1fr 1fr 1fr 80px',
                  gap: '6px 12px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: i % 2 === 0 ? '#f8f9fa' : 'white',
                  alignItems: 'center', marginBottom: '4px',
                  fontSize: '12px'
                }}>
                  <span style={{ fontWeight: 'bold', color: '#1a2a3a' }}>{r.numero}</span>
                  <span style={{ color: '#555' }}>{r.cliente}</span>
                  <span>${r.total.toFixed(2)}</span>
                  <span style={{ color: '#27ae60' }}>${r.cobrado.toFixed(2)}</span>
                  <span style={{ color: r.pendiente > 0 ? '#e74c3c' : '#27ae60' }}>
                    ${r.pendiente.toFixed(2)}
                  </span>
                  <span style={{
                    background: colorEstado[r.estado] + '22',
                    color: colorEstado[r.estado],
                    borderRadius: '12px', padding: '2px 8px',
                    fontSize: '11px', fontWeight: 'bold', textAlign: 'center'
                  }}>
                    {r.estado === 'cobrado' ? '✅ Cobrado'
                      : r.estado === 'parcial' ? '⚡ Parcial'
                      : '⏳ Pendiente'}
                  </span>
                </div>
              ))}
              {/* Header */}
              {!mobile && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 80px',
                  gap: '6px 12px', padding: '4px 10px',
                  fontSize: '10px', fontWeight: 'bold', color: '#888',
                  borderTop: '1px solid #eee', marginTop: '8px', paddingTop: '8px'
                }}>
                  {['FACTURA','CLIENTE','TOTAL','COBRADO','PENDIENTE','ESTADO'].map(h => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
