// ============================================
// TabConciliacionIVA.js
// Cruza IVA en ventas facturadas vs IVA en compras
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

    const [{ data: facturas }, { data: compras }] = await Promise.all([
      supabase.from('facturas')
        .select('subtotal, iva, porcentaje_iva, estado, created_at')
        .gte('created_at', desde + 'T00:00:00')
        .lte('created_at', hasta + 'T23:59:59')
        .in('estado', ['autorizada', 'borrador']),
      supabase.from('compras')
        .select('subtotal, iva, fecha')
        .gte('fecha', desde)
        .lte('fecha', hasta),
    ]);

    // IVA en ventas
    const ventasSubtotal = (facturas || []).reduce((s, f) => s + (parseFloat(f.subtotal) || 0), 0);
    const ivaVentas      = (facturas || []).reduce((s, f) => s + (parseFloat(f.iva)      || 0), 0);
    const ivaVentasCalc  = parseFloat((ventasSubtotal * 0.15).toFixed(2));

    // IVA en compras
    const comprasSubtotal = (compras || []).reduce((s, c) => s + (parseFloat(c.subtotal) || 0), 0);
    const ivaCompras      = (compras || []).reduce((s, c) => s + (parseFloat(c.iva)      || 0), 0);

    // IVA a pagar al SRI = IVA cobrado en ventas − IVA pagado en compras
    const ivaPagar = ivaVentas - ivaCompras;

    // Diferencia entre IVA registrado y calculado al 15%
    const diffVentas  = Math.abs(ivaVentas  - ivaVentasCalc);

    setResultado({
      ventasSubtotal, ivaVentas, ivaVentasCalc, diffVentas,
      comprasSubtotal, ivaCompras,
      ivaPagar,
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
          {/* IVA a pagar */}
          <div style={{
            ...card,
            background: resultado.ivaPagar > 0
              ? 'linear-gradient(135deg,#e74c3c,#c0392b)'
              : 'linear-gradient(135deg,#27ae60,#1e8449)',
            color: 'white', textAlign: 'center', padding: '20px'
          }}>
            <div style={{ fontSize: '12px', opacity: 0.85, marginBottom: 6 }}>
              IVA A PAGAR AL SRI (período)
            </div>
            <div style={{ fontSize: mobile ? '28px' : '36px', fontWeight: 'bold' }}>
              ${resultado.ivaPagar.toFixed(2)}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75, marginTop: 4 }}>
              IVA ventas ${resultado.ivaVentas.toFixed(2)} − IVA compras ${resultado.ivaCompras.toFixed(2)}
            </div>
          </div>

          {/* Detalle ventas */}
          <div style={card}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a', marginBottom: '12px' }}>
              🧾 IVA en ventas ({resultado.nFacturas} facturas)
            </div>
            {[
              { label: 'Base imponible (subtotal)',  valor: resultado.ventasSubtotal, color: '#333' },
              { label: 'IVA 15% calculado',          valor: resultado.ivaVentasCalc,  color: '#555' },
              { label: 'IVA registrado en facturas', valor: resultado.ivaVentas,      color: '#2980b9', bold: true },
              { label: 'Diferencia (registro vs cálculo)', valor: resultado.diffVentas,
                color: resultado.diffVentas > 0.01 ? '#e74c3c' : '#27ae60', bold: true },
            ].map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', fontSize: r.bold ? '14px' : '13px',
                fontWeight: r.bold ? 'bold' : 'normal',
                color: r.color,
                borderBottom: i < 3 ? '1px solid #f0f0f0' : 'none'
              }}>
                <span>{r.label}</span>
                <span>${r.valor.toFixed(2)}</span>
              </div>
            ))}
            {resultado.diffVentas > 0.01 && (
              <div style={{
                marginTop: 10, background: '#fde8e8', borderRadius: 8,
                padding: '8px 12px', fontSize: '12px', color: '#c0392b'
              }}>
                ⚠️ Diferencia detectada entre IVA calculado y registrado. Revisar facturas del período.
              </div>
            )}
          </div>

          {/* Detalle compras */}
          <div style={card}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a', marginBottom: '12px' }}>
              📦 IVA en compras ({resultado.nCompras} compras)
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
          </div>
        </>
      )}
    </div>
  );
}
