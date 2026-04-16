// ============================================
// TabDesfasesProduccion.js
// Compara consumo teórico (fórmulas × lotes)
// vs descuento real en inventario (tipo='salida')
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

export default function TabDesfasesProduccion({ mobile }) {
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    // 1. Producciones del período
    const { data: producciones } = await supabase
      .from('produccion_diaria')
      .select(`
        id, fecha, producto_nombre, kg_producidos,
        productos ( id )
      `)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('deleted_at', null);

    // 2. Para cada producto unique, obtener su fórmula activa
    const productoIds = [...new Set(
      (producciones || []).map(p => p.productos?.id).filter(Boolean)
    )];

    let formulaciones = [];
    if (productoIds.length > 0) {
      const { data: f } = await supabase
        .from('formulaciones')
        .select('producto_id, materia_prima_id, mp_nombre, cantidad_kg_por_kg')
        .in('producto_id', productoIds)
        .eq('activo', true)
        .is('deleted_at', null);
      formulaciones = f || [];
    }

    // Mapa: producto_id → lista de ingredientes
    const formulaPorProducto = {};
    formulaciones.forEach(f => {
      if (!formulaPorProducto[f.producto_id]) formulaPorProducto[f.producto_id] = [];
      formulaPorProducto[f.producto_id].push(f);
    });

    // 3. Calcular consumo TEÓRICO por MP
    const consumoTeorico = {};
    (producciones || []).forEach(p => {
      const pid     = p.productos?.id;
      const kgProd  = p.kg_producidos || 0;
      const formula = formulaPorProducto[pid] || [];
      formula.forEach(ing => {
        const id = ing.materia_prima_id;
        if (!consumoTeorico[id]) consumoTeorico[id] = { nombre: ing.mp_nombre, kg: 0 };
        consumoTeorico[id].kg += kgProd * (ing.cantidad_kg_por_kg || 0);
      });
    });

    // 4. Salidas reales de inventario en el período
    const { data: salidas } = await supabase
      .from('inventario_movimientos')
      .select('materia_prima_id, nombre_mp, kg, motivo')
      .eq('tipo', 'salida')
      .gte('created_at', desde + 'T00:00:00')
      .lte('created_at', hasta + 'T23:59:59');

    const consumoReal = {};
    (salidas || []).forEach(s => {
      const id = s.materia_prima_id;
      if (!consumoReal[id]) consumoReal[id] = { nombre: s.nombre_mp, kg: 0 };
      consumoReal[id].kg += s.kg || 0;
    });

    // 5. Cruzar teórico vs real
    const todos = new Set([
      ...Object.keys(consumoTeorico),
      ...Object.keys(consumoReal)
    ]);

    const desfases = [];
    todos.forEach(id => {
      const teo  = consumoTeorico[id];
      const real = consumoReal[id];
      const kgT  = teo?.kg  || 0;
      const kgR  = real?.kg || 0;
      const diff = kgR - kgT; // positivo = se consumió más de lo teórico
      const nombre = teo?.nombre || real?.nombre || id;

      if (Math.abs(diff) > 0.1) {
        const pct = kgT > 0 ? (diff / kgT) * 100 : 0;
        desfases.push({ nombre, kgTeorico: kgT, kgReal: kgR, diferencia: diff, pct });
      }
    });

    desfases.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

    // Totales producción
    const totalKgProducidos = (producciones || []).reduce((s, p) => s + (p.kg_producidos || 0), 0);

    setResultado({
      desfases,
      totalProduccion:  totalKgProducidos,
      lotes:            (producciones || []).length,
      mpConFormula:     Object.keys(consumoTeorico).length,
      mpConDesfase:     desfases.length
    });
    setCargando(false);
  }, [desde, hasta]);

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
            Por cada lote de producción registrado, multiplica los <b>kg producidos × fórmula activa</b>
            para obtener el consumo teórico de cada ingrediente. Luego lo compara con las
            <b> salidas reales</b> registradas en inventario. Detecta:
            <ul style={{ marginTop: '8px', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Ingredientes <b>consumidos de más</b> (posible desperdicio)</li>
              <li>Ingredientes <b>consumidos de menos</b> (posible fórmula desactualizada)</li>
              <li>Salidas en inventario <b>sin producción asociada</b></li>
            </ul>
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: '10px', marginBottom: '12px'
          }}>
            {[
              { label: 'Lotes analizados',  valor: resultado.lotes,            color: '#2980b9', esCant: true },
              { label: 'Kg producidos',     valor: resultado.totalProduccion.toFixed(1) + ' kg', color: '#27ae60' },
              { label: 'MP en fórmulas',    valor: resultado.mpConFormula,     color: '#8e44ad', esCant: true },
              { label: 'Con desfase',       valor: resultado.mpConDesfase,     color: resultado.mpConDesfase > 0 ? '#e74c3c' : '#27ae60', esCant: true },
            ].map(r => (
              <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '14px 10px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
                <div style={{ fontSize: mobile ? '16px' : '20px', fontWeight: 'bold', color: r.color }}>
                  {r.esCant ? r.valor : r.valor}
                </div>
              </div>
            ))}
          </div>

          {resultado.desfases.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: '#27ae60' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
              <b>Sin desfases de producción</b><br />
              <span style={{ color: '#888', fontSize: '13px' }}>
                El consumo real coincide con el consumo teórico de las fórmulas.
              </span>
            </div>
          ) : (
            resultado.desfases.map((d, i) => (
              <div key={i} style={{
                ...card,
                borderLeft: `4px solid ${d.diferencia > 0 ? '#e74c3c' : '#f39c12'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a2a3a', marginBottom: '4px' }}>
                      🏭 {d.nombre}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#555', flexWrap: 'wrap' }}>
                      <span>📐 Teórico: <b>{d.kgTeorico.toFixed(2)} kg</b></span>
                      <span>📋 Real: <b>{d.kgReal.toFixed(2)} kg</b></span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '18px', fontWeight: 'bold',
                      color: d.diferencia > 0 ? '#e74c3c' : '#f39c12'
                    }}>
                      {d.diferencia > 0 ? '+' : ''}{d.diferencia.toFixed(2)} kg
                    </div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                      {d.pct !== 0 && `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`}
                    </div>
                    <div style={{ fontSize: '10px', color: d.diferencia > 0 ? '#e74c3c' : '#f39c12', marginTop: '2px' }}>
                      {d.diferencia > 0 ? '⚠️ Consumo real > teórico' : '⚠️ Consumo real < teórico'}
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
