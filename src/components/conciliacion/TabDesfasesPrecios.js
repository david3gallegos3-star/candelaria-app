// ============================================
// TabDesfasesPrecios.js
// Compara precios pagados en compras vs
// precios registrados en materias_primas / fórmulas
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

export default function TabDesfasesPrecios({ mobile }) {
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [umbral,    setUmbral]    = useState(5); // % de diferencia para alertar
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    // 1. Últimas compras por materia prima en el período
    const { data: detalles } = await supabase
      .from('compras_detalle')
      .select(`
        materia_prima_id, mp_nombre, precio_unitario, cantidad_kg,
        compras ( fecha )
      `)
      .gte('compras.fecha', desde)
      .lte('compras.fecha', hasta)
      .order('compras.fecha', { ascending: false });

    // 2. Precio actual en materias_primas
    const { data: materias } = await supabase
      .from('materias_primas')
      .select('id, nombre, precio_kg, unidad')
      .is('deleted_at', null);

    // Mapa precio actual por id (text)
    const precioActual = {};
    (materias || []).forEach(m => {
      precioActual[m.id] = { nombre: m.nombre, precio: m.precio_kg, unidad: m.unidad };
    });

    // Agrupar compras: precio promedio ponderado por MP
    const comprasPorMP = {};
    (detalles || []).forEach(d => {
      const id = d.materia_prima_id;
      if (!comprasPorMP[id]) {
        comprasPorMP[id] = { nombre: d.mp_nombre, totalKg: 0, totalCosto: 0, compras: 0 };
      }
      const kg    = d.cantidad_kg   || 0;
      const price = d.precio_unitario || 0;
      comprasPorMP[id].totalKg    += kg;
      comprasPorMP[id].totalCosto += kg * price;
      comprasPorMP[id].compras    += 1;
    });

    const alertas = [];
    Object.entries(comprasPorMP).forEach(([id, c]) => {
      const precioCompra  = c.totalKg > 0 ? c.totalCosto / c.totalKg : 0;
      const precioFormula = precioActual[id]?.precio || 0;

      if (precioFormula <= 0) return; // sin precio registrado, ignorar

      const diffPct = ((precioCompra - precioFormula) / precioFormula) * 100;

      if (Math.abs(diffPct) >= umbral) {
        alertas.push({
          id,
          nombre:        c.nombre,
          precioCompra,
          precioFormula,
          diffPct,
          totalKg:       c.totalKg,
          impacto:       Math.abs((precioCompra - precioFormula) * c.totalKg),
          compras:       c.compras
        });
      }
    });

    alertas.sort((a, b) => b.impacto - a.impacto);

    setResultado({
      alertas,
      mpAnalizadas: Object.keys(comprasPorMP).length,
      impactoTotal: alertas.reduce((s, a) => s + a.impacto, 0)
    });
    setCargando(false);
  }, [desde, hasta, umbral]);

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Desde</div>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Hasta</div>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Alerta si diferencia ≥</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="number" min={1} max={50} value={umbral}
              onChange={e => setUmbral(Number(e.target.value))}
              style={{ ...inputStyle, width: '70px' }} />
            <span style={{ fontSize: '13px', color: '#555' }}>%</span>
          </div>
        </div>
        <button onClick={analizar} disabled={cargando} style={{
          background: cargando ? '#aaa' : 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 20px', cursor: cargando ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {cargando ? 'Analizando...' : '🔍 Analizar'}
        </button>
      </div>

      {/* Descripción */}
      {!resultado && !cargando && (
        <div style={{ ...card, background: '#eaf4ff', border: '1px solid #bee3f8' }}>
          <div style={{ fontSize: '13px', color: '#1a3a5c' }}>
            <b>¿Qué analiza esta pestaña?</b><br />
            Calcula el <b>precio promedio ponderado</b> de cada materia prima según las compras
            del período y lo compara con el <b>precio registrado en fórmulas</b>.
            Si la diferencia supera el umbral configurado, genera una alerta con el impacto
            económico estimado.
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <>
          {/* Resumen */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)',
            gap: '10px', marginBottom: '12px'
          }}>
            {[
              { label: 'MP analizadas', valor: resultado.mpAnalizadas, color: '#2980b9', esCant: true },
              { label: 'Con alerta',    valor: resultado.alertas.length, color: resultado.alertas.length > 0 ? '#e74c3c' : '#27ae60', esCant: true },
              { label: 'Impacto total', valor: `$${resultado.impactoTotal.toFixed(2)}`, color: '#8e44ad' },
            ].map(r => (
              <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '14px 10px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
                <div style={{ fontSize: mobile ? '16px' : '20px', fontWeight: 'bold', color: r.color }}>
                  {r.valor}
                </div>
              </div>
            ))}
          </div>

          {resultado.alertas.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: '#27ae60' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
              <b>Sin alertas de precio</b><br />
              <span style={{ color: '#888', fontSize: '13px' }}>
                Todos los precios de compra están dentro del umbral del {umbral}%.
              </span>
            </div>
          ) : (
            resultado.alertas.map((a, i) => (
              <div key={i} style={{
                ...card,
                borderLeft: `4px solid ${a.diffPct > 0 ? '#e74c3c' : '#27ae60'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a2a3a', marginBottom: '6px' }}>
                      💰 {a.nombre}
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, auto)',
                      gap: '4px 20px', fontSize: '12px', color: '#555'
                    }}>
                      <span>Precio compra: <b>${a.precioCompra.toFixed(4)}/kg</b></span>
                      <span>Precio fórmula: <b>${a.precioFormula.toFixed(4)}/kg</b></span>
                      <span>Kg comprados: <b>{a.totalKg.toFixed(2)} kg</b></span>
                      <span>Compras: <b>{a.compras}</b></span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontSize: '18px', fontWeight: 'bold',
                      color: a.diffPct > 0 ? '#e74c3c' : '#27ae60'
                    }}>
                      {a.diffPct > 0 ? '↑' : '↓'} {Math.abs(a.diffPct).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                      Impacto: <b style={{ color: '#8e44ad' }}>${a.impacto.toFixed(2)}</b>
                    </div>
                    <div style={{ fontSize: '10px', color: a.diffPct > 0 ? '#e74c3c' : '#27ae60', marginTop: '2px' }}>
                      {a.diffPct > 0 ? '⚠️ Compra más cara que fórmula' : '✅ Compra más barata que fórmula'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
