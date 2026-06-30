// ============================================
// TabConciliacionIVA.js
// Informe de IVA: ventas (negocio exento) y costo de IVA en compras
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

export default function TabConciliacionIVA({ mobile }) {
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    const [{ data: facturas }, { data: compras }, { data: notasCredito }] = await Promise.all([
      supabase.from('facturas')
        .select('subtotal, iva, porcentaje_iva, estado, created_at')
        .gte('created_at', desde + 'T00:00:00')
        .lte('created_at', hasta + 'T23:59:59')
        .in('estado', ['autorizada', 'borrador']),
      supabase.from('compras')
        .select('subtotal, iva, fecha')
        .neq('estado', 'anulada')
        .gte('fecha', desde)
        .lte('fecha', hasta),
      supabase.from('notas_credito')
        .select('subtotal, iva').eq('es_manual', false)
        .gte('created_at', desde + 'T00:00:00').lte('created_at', hasta + 'T23:59:59'),
    ]);

    // IVA en ventas (neto de notas de credito electronicas) — negocio exento, normalmente $0
    const ventasSubtotal = (facturas || []).reduce((s, f) => s + (parseFloat(f.subtotal) || 0), 0)
      - (notasCredito || []).reduce((s, nc) => s + (parseFloat(nc.subtotal) || 0), 0);
    const ivaVentas      = (facturas || []).reduce((s, f) => s + (parseFloat(f.iva)      || 0), 0)
      - (notasCredito || []).reduce((s, nc) => s + (parseFloat(nc.iva)      || 0), 0);

    // IVA en compras — costo (no es credito tributario recuperable: el negocio esta exento de IVA en ventas)
    const comprasSubtotal = (compras || []).reduce((s, c) => s + (parseFloat(c.subtotal) || 0), 0);
    const ivaCompras      = (compras || []).reduce((s, c) => s + (parseFloat(c.iva)      || 0), 0);

    setResultado({
      ventasSubtotal, ivaVentas,
      comprasSubtotal, ivaCompras,
      nFacturas: (facturas || []).length,
      nCompras:  (compras  || []).length,
    });
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
          {/* Detalle ventas */}
          <div style={card}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a', marginBottom: '12px' }}>
              🧾 IVA en ventas ({resultado.nFacturas} facturas)
            </div>
            {[
              { label: 'Base imponible (subtotal)',  valor: resultado.ventasSubtotal, color: '#333' },
              { label: 'IVA registrado en facturas', valor: resultado.ivaVentas,      color: '#2980b9', bold: true },
            ].map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', fontSize: r.bold ? '14px' : '13px',
                fontWeight: r.bold ? 'bold' : 'normal',
                color: r.color,
                borderBottom: i < 1 ? '1px solid #f0f0f0' : 'none'
              }}>
                <span>{r.label}</span>
                <span>${r.valor.toFixed(2)}</span>
              </div>
            ))}
            <div style={{
              marginTop: 10, background: '#eaf4fb', borderRadius: 8,
              padding: '8px 12px', fontSize: '12px', color: '#1a5276'
            }}>
              ℹ️ Negocio exento de IVA — el IVA en ventas debe ser $0.00. Si aparece un valor aquí, revisa esas facturas.
            </div>
          </div>

          {/* Detalle compras */}
          <div style={card}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a', marginBottom: '12px' }}>
              📦 IVA en compras ({resultado.nCompras} compras) — costo, no crédito tributario
            </div>
            {[
              { label: 'Base imponible (subtotal)',  valor: resultado.comprasSubtotal, color: '#333' },
              { label: 'IVA pagado en compras',      valor: resultado.ivaCompras,      color: '#8e44ad', bold: true },
            ].map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', fontSize: r.bold ? '14px' : '13px',
                fontWeight: r.bold ? 'bold' : 'normal',
                color: r.color,
                borderBottom: i < 1 ? '1px solid #f0f0f0' : 'none'
              }}>
                <span>{r.label}</span>
                <span>${r.valor.toFixed(2)}</span>
              </div>
            ))}
            <div style={{
              marginTop: 10, background: '#fff8e1', borderRadius: 8,
              padding: '8px 12px', fontSize: '12px', color: '#7d5f00'
            }}>
              ⚠️ Al ser un negocio exento de IVA en ventas, este IVA no se puede usar como crédito tributario — es parte del costo de la compra.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
