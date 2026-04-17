// ============================================
// TabComprasPagos.js
// Cruza compras ingresadas vs pagos realizados
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

export default function TabComprasPagos({ mobile }) {
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    // 1. Compras en el período
    const { data: compras } = await supabase
      .from('compras')
      .select('id, numero_factura, total, proveedor_id, fecha, proveedores(nombre)')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    // 2. Pagos / cuentas_pagar para esas compras
    const compraIds = (compras || []).map(c => c.id);
    let cxpMap = {};

    if (compraIds.length > 0) {
      const { data: cxp } = await supabase
        .from('cuentas_pagar')
        .select('compra_id, monto_total, monto_pagado, estado')
        .in('compra_id', compraIds);

      (cxp || []).forEach(p => {
        cxpMap[p.compra_id] = {
          pagado:  parseFloat(p.monto_pagado) || 0,
          total:   parseFloat(p.monto_total)  || 0,
          estado:  p.estado,
        };
      });
    }

    const filas = (compras || []).map(c => {
      const cxp      = cxpMap[c.id];
      const total    = parseFloat(c.total) || 0;
      const pagado   = cxp?.pagado || 0;
      const pendiente = total - pagado;
      return {
        numero:    c.numero_factura || c.id,
        proveedor: c.proveedores?.nombre || '—',
        fecha:     c.fecha,
        total,
        pagado,
        pendiente,
        estado:    pendiente <= 0.01 ? 'pagado' : pagado > 0 ? 'parcial' : 'pendiente',
      };
    });

    const totalCompras  = filas.reduce((s, r) => s + r.total,     0);
    const totalPagado   = filas.reduce((s, r) => s + r.pagado,    0);
    const totalPendiente = filas.reduce((s, r) => s + r.pendiente, 0);

    setResultado({ filas, totalCompras, totalPagado, totalPendiente });
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
  const colorEstado = { pagado: '#27ae60', parcial: '#f39c12', pendiente: '#e74c3c' };

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
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)',
            gap: '8px', marginBottom: '12px'
          }}>
            {[
              { label: 'Total compras',    valor: resultado.totalCompras,   color: '#2980b9' },
              { label: 'Total pagado',     valor: resultado.totalPagado,    color: '#27ae60' },
              { label: 'Pendiente pago',   valor: resultado.totalPendiente, color: resultado.totalPendiente > 0 ? '#e74c3c' : '#27ae60' },
            ].map(r => (
              <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: mobile ? '15px' : '18px', fontWeight: 'bold', color: r.color }}>
                  ${r.valor.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {resultado.filas.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: '#888', padding: '30px' }}>
              ✅ Sin compras en el período seleccionado
            </div>
          ) : (
            <div style={card}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a', marginBottom: '10px' }}>
                📋 Detalle por compra
              </div>
              {resultado.filas.map((r, i) => (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr 1fr' : '2fr 2fr 1fr 1fr 1fr 80px',
                  gap: '6px 12px',
                  padding: '8px 10px', borderRadius: '8px',
                  background: i % 2 === 0 ? '#f8f9fa' : 'white',
                  alignItems: 'center', marginBottom: '4px', fontSize: '12px'
                }}>
                  <span style={{ fontWeight: 'bold', color: '#1a2a3a' }}>{r.numero}</span>
                  <span style={{ color: '#555' }}>{r.proveedor}</span>
                  <span style={{ color: '#888', fontSize: '11px' }}>{r.fecha}</span>
                  <span>${r.total.toFixed(2)}</span>
                  <span style={{ color: '#27ae60' }}>${r.pagado.toFixed(2)}</span>
                  <span style={{
                    background: colorEstado[r.estado] + '22',
                    color: colorEstado[r.estado],
                    borderRadius: '12px', padding: '2px 8px',
                    fontSize: '11px', fontWeight: 'bold', textAlign: 'center'
                  }}>
                    {r.estado === 'pagado' ? '✅ Pagado'
                      : r.estado === 'parcial' ? '⚡ Parcial'
                      : '⏳ Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
