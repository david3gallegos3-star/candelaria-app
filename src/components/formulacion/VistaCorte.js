// ============================================
// VistaCorte.js
// Vista de fórmula para productos CORTES
// Muestra historial de costos de inyección
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function VistaCorte({ producto, mobile, onAbrirInyeccion }) {
  const [historial, setHistorial] = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [mpVinculada, setMpVinculada] = useState(null);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      // Últimas 10 producciones de inyección para este corte
      // Preferir match por materia_prima_id (vínculo exacto), fallback por nombre
      let q = supabase
        .from('produccion_inyeccion_cortes')
        .select('*, produccion_inyeccion ( fecha, formula_salmuera, porcentaje_inyeccion, estado )')
        .order('created_at', { ascending: false })
        .limit(10);
      q = producto.mp_vinculado_id
        ? q.eq('materia_prima_id', producto.mp_vinculado_id)
        : q.eq('corte_nombre', producto.nombre);
      const { data } = await q;
      setHistorial(data || []);

      // MP vinculada (para precio de referencia)
      if (producto.mp_vinculado_id) {
        const { data: mp } = await supabase
          .from('materias_primas').select('*').eq('id', producto.mp_vinculado_id).single();
        setMpVinculada(mp);
      } else {
        // buscar por nombre
        const { data: mps } = await supabase
          .from('materias_primas').select('*')
          .ilike('nombre_producto', `%${producto.nombre}%`).limit(1);
        if (mps && mps.length > 0) setMpVinculada(mps[0]);
      }
      setCargando(false);
    }
    cargar();
  }, [producto.nombre, producto.mp_vinculado_id]);

  const historico_costos = historial
    .filter(h => parseFloat(h.costo_final_kg) > 0)
    .map(h => parseFloat(h.costo_final_kg));
  const costoPromedio = historico_costos.length > 0
    ? historico_costos.reduce((a, b) => a + b, 0) / historico_costos.length
    : 0;
  const ultimoCosto = historial.length > 0 ? parseFloat(historial[0]?.costo_final_kg || 0) : 0;

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando historial...</div>
  );

  return (
    <div style={{ padding: mobile ? '10px' : '0' }}>

      {/* Precio de referencia MP */}
      {mpVinculada && (
        <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Materia prima vinculada</div>
            <div style={{ fontWeight: 'bold', color: '#1a1a2e' }}>{mpVinculada.nombre_producto || mpVinculada.nombre}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#888' }}>Precio referencia</div>
            <div style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 16 }}>${parseFloat(mpVinculada.precio_kg || 0).toFixed(4)}/kg</div>
          </div>
        </div>
      )}

      {/* Resumen costos */}
      {historial.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ background: '#1a3a5c', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Último costo/kg</div>
            <div style={{ fontWeight: 'bold', color: '#f39c12', fontSize: 22 }}>
              {ultimoCosto > 0 ? `$${ultimoCosto.toFixed(4)}` : '—'}
            </div>
          </div>
          <div style={{ background: '#27ae60', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Costo promedio ({historico_costos.length} prod.)</div>
            <div style={{ fontWeight: 'bold', color: 'white', fontSize: 22 }}>
              {costoPromedio > 0 ? `$${costoPromedio.toFixed(4)}` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Fórmula de costo */}
      <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: '#555', border: '1px solid #e0e0e0' }}>
        <div style={{ fontWeight: 'bold', color: '#1a1a2e', marginBottom: 6, fontSize: 13 }}>📐 Fórmula de costo (Inyección)</div>
        <div style={{ lineHeight: 1.8 }}>
          Costo Final/kg = <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>[(Costo Carne + Costo Salmuera) − Ingreso Retazos]</span>
          {' ÷ '}
          <span style={{ color: '#27ae60', fontWeight: 'bold' }}>kg Carne Limpia</span>
        </div>
      </div>

      {/* Historial producciones */}
      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
        <div style={{ background: '#6c3483', padding: '8px 14px' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📋 Historial de Producciones</span>
        </div>
        {historial.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#aaa', fontSize: 13 }}>
            Sin producciones registradas para este corte.<br/>
            <span style={{ fontSize: 12 }}>Registra producciones desde el módulo de Inyección.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {['Fecha', 'Salmuera', 'Kg Carne', 'Kg Retazo', 'Kg Limpia', 'Costo/kg', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Fecha' || h === 'Salmuera' ? 'left' : 'right', color: '#555', fontWeight: 700, borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => {
                  const prod = h.produccion_inyeccion;
                  const costoFinal = parseFloat(h.costo_final_kg || 0);
                  return (
                    <tr key={h.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>{prod?.fecha || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#555', fontSize: 11 }}>{prod?.formula_salmuera || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{parseFloat(h.kg_carne_cruda || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e67e22' }}>{parseFloat(h.kg_retazos || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{parseFloat(h.kg_carne_limpia || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: costoFinal > 0 ? '#27ae60' : '#aaa' }}>
                        {costoFinal > 0 ? `$${costoFinal.toFixed(4)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        <span style={{ background: { abierto: '#d4edda', cerrado: '#cce5ff', revertido: '#fdecea' }[prod?.estado] || '#f5f5f5', color: { abierto: '#155724', cerrado: '#004085', revertido: '#721c24' }[prod?.estado] || '#555', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>
                          {prod?.estado || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Botón ir a inyección */}
      {onAbrirInyeccion && (
        <button onClick={onAbrirInyeccion} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>
          💉 Ir a Producción — Inyección de Salmuera
        </button>
      )}
    </div>
  );
}
