// ============================================
// TabDesfasesInventario.js
// Cruza compras vs movimientos en inventario
// Detecta entradas sin compra y compras sin movimiento
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

export default function TabDesfasesInventario({ mobile }) {
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    // 1. Compras en el período (detalle)
    const { data: detalles } = await supabase
      .from('compras_detalle')
      .select(`
        materia_prima_id, mp_nombre, cantidad_kg, precio_unitario,
        compras ( fecha, proveedor_id, proveedores ( nombre ) )
      `)
      .gte('compras.fecha', desde)
      .lte('compras.fecha', hasta);

    // 2. Movimientos tipo 'entrada' en el período
    const { data: movimientos } = await supabase
      .from('inventario_movimientos')
      .select('materia_prima_id, nombre_mp, kg, created_at, motivo')
      .eq('tipo', 'entrada')
      .gte('created_at', desde + 'T00:00:00')
      .lte('created_at', hasta + 'T23:59:59');

    // ── Agrupar compras por materia_prima_id ──
    const comprasPorMP = {};
    (detalles || []).forEach(d => {
      const id = d.materia_prima_id;
      if (!comprasPorMP[id]) comprasPorMP[id] = { nombre: d.mp_nombre, kgCompra: 0, registros: 0 };
      comprasPorMP[id].kgCompra  += d.cantidad_kg || 0;
      comprasPorMP[id].registros += 1;
    });

    // ── Agrupar movimientos por materia_prima_id ──
    const movPorMP = {};
    (movimientos || []).forEach(m => {
      const id = m.materia_prima_id;
      if (!movPorMP[id]) movPorMP[id] = { nombre: m.nombre_mp, kgMov: 0 };
      movPorMP[id].kgMov += m.kg || 0;
    });

    // ── Cruzar ──
    const todos = new Set([
      ...Object.keys(comprasPorMP),
      ...Object.keys(movPorMP)
    ]);

    const desfases = [];
    todos.forEach(id => {
      const c  = comprasPorMP[id];
      const m  = movPorMP[id];
      const kgC = c?.kgCompra || 0;
      const kgM = m?.kgMov    || 0;
      const diff = Math.abs(kgC - kgM);
      const nombre = c?.nombre || m?.nombre || id;

      // Solo reportar si hay diferencia > 0.01 kg
      if (diff > 0.01) {
        desfases.push({
          nombre,
          kgCompra: kgC,
          kgMovimiento: kgM,
          diferencia: kgC - kgM,
          tipo: !c ? 'sin_compra' : !m ? 'sin_movimiento' : 'diferencia'
        });
      }
    });

    desfases.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

    setResultado({
      desfases,
      totalCompras:    Object.values(comprasPorMP).reduce((s, x) => s + x.kgCompra, 0),
      totalMovimientos: Object.values(movPorMP).reduce((s, x) => s + x.kgMov, 0),
      mpAnalizadas: todos.size
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
            Compara los <b>kg comprados</b> según el módulo de Compras contra los <b>kg ingresados</b>
            en inventario (movimientos tipo "entrada") para el mismo período. Detecta:
            <ul style={{ marginTop: '8px', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Compras registradas que <b>no generaron movimiento</b> de inventario</li>
              <li>Movimientos de entrada <b>sin compra asociada</b></li>
              <li>Diferencias de kg entre lo comprado y lo ingresado</li>
            </ul>
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <>
          {/* Resumen */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: '10px', marginBottom: '12px'
          }}>
            {[
              { label: 'MP analizadas',  valor: resultado.mpAnalizadas,                   color: '#2980b9', esCant: true },
              { label: 'Kg en compras',  valor: resultado.totalCompras.toFixed(1) + ' kg', color: '#27ae60' },
              { label: 'Kg en inv.',     valor: resultado.totalMovimientos.toFixed(1) + ' kg', color: '#8e44ad' },
              { label: 'Con desfase',    valor: resultado.desfases.length,                 color: resultado.desfases.length > 0 ? '#e74c3c' : '#27ae60', esCant: true },
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
              <b>Sin desfases detectados</b><br />
              <span style={{ color: '#888', fontSize: '13px' }}>
                Todas las compras coinciden con los movimientos de inventario.
              </span>
            </div>
          ) : (
            resultado.desfases.map((d, i) => (
              <div key={i} style={{
                ...card,
                borderLeft: `4px solid ${d.tipo === 'sin_movimiento' ? '#e74c3c' : d.tipo === 'sin_compra' ? '#f39c12' : '#8e44ad'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a2a3a', marginBottom: '4px' }}>
                      📦 {d.nombre}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#555', flexWrap: 'wrap' }}>
                      <span>🛒 Compras: <b>{d.kgCompra.toFixed(2)} kg</b></span>
                      <span>📋 Inventario: <b>{d.kgMovimiento.toFixed(2)} kg</b></span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontWeight: 'bold', fontSize: '16px',
                      color: d.diferencia > 0 ? '#e74c3c' : '#f39c12'
                    }}>
                      {d.diferencia > 0 ? '+' : ''}{d.diferencia.toFixed(2)} kg
                    </div>
                    <div style={{
                      fontSize: '11px', fontWeight: 'bold',
                      color: d.tipo === 'sin_movimiento' ? '#e74c3c' : d.tipo === 'sin_compra' ? '#f39c12' : '#8e44ad'
                    }}>
                      {d.tipo === 'sin_movimiento' && '⚠️ Sin movimiento en inv.'}
                      {d.tipo === 'sin_compra'     && '⚠️ Sin compra registrada'}
                      {d.tipo === 'diferencia'     && '⚠️ Diferencia de kg'}
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
