// ============================================
// TabMermasCortes.js
// Historial de mermas para productos Cortes
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

export default function TabMermasCortes({ mobile }) {
  const [registros, setRegistros] = useState([]);
  const [cargando,  setCargando]  = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('produccion_inyeccion_cortes')
      .select('*, produccion_inyeccion ( fecha, formula_salmuera, estado )')
      .eq('produccion_inyeccion.estado', 'cerrado')
      .order('created_at', { ascending: false })
      .limit(100);
    const filtrados = (data || []).filter(r =>
      r.produccion_inyeccion?.estado === 'cerrado' &&
      parseFloat(r.kg_carne_limpia) > 0
    );
    setRegistros(filtrados);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['produccion_inyeccion_cortes', 'produccion_inyeccion'], cargar);

  // Calcular merma por registro
  const conMerma = registros.map(r => {
    const inj  = parseFloat(r.kg_carne_limpia || 0) + parseFloat(r.kg_retazos || 0);
    const post = parseFloat(r.kg_carne_limpia || 0);
    const mermaKg  = inj - post;
    const mermaKgOut = Math.max(0, mermaKg);
    const mermaKgRound = inj > 0 ? mermaKgOut : 0;
    const pct  = inj > 0 ? (mermaKgRound / inj) * 100 : 0;
    return { ...r, inj, post, mermaKg: mermaKgRound, pct };
  });

  // Agrupar por corte para calcular tendencia (comparar con anterior del mismo corte)
  const porCorte = {};
  conMerma.forEach(r => {
    const key = r.corte_nombre;
    if (!porCorte[key]) porCorte[key] = [];
    porCorte[key].push(r);
  });

  // Asignar tendencia a cada registro
  const conTendencia = conMerma.map(r => {
    const lista   = porCorte[r.corte_nombre];
    const idx     = lista.indexOf(r);
    const anterior = lista[idx + 1]; // lista está desc, siguiente es el anterior en tiempo
    let tendencia = null;
    if (anterior) {
      if (r.pct > anterior.pct + 0.5)      tendencia = 'sube';
      else if (r.pct < anterior.pct - 0.5) tendencia = 'baja';
      else                                  tendencia = 'igual';
    }
    return { ...r, tendencia };
  });

  // Agrupar por fecha para mostrar
  const porFecha = {};
  conTendencia.forEach(r => {
    const fecha = r.produccion_inyeccion?.fecha || '—';
    if (!porFecha[fecha]) porFecha[fecha] = [];
    porFecha[fecha].push(r);
  });
  const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a));

  const flechaTendencia = (t) => {
    if (t === 'sube')  return { icon: '↑', color: '#e74c3c', label: 'Mayor merma' };
    if (t === 'baja')  return { icon: '↓', color: '#27ae60', label: 'Menor merma' };
    if (t === 'igual') return { icon: '=', color: '#888',    label: 'Igual' };
    return null;
  };

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
  );

  if (fechas.length === 0) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#aaa', background: 'white', borderRadius: 12 }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>📉</div>
      <div>Sin cierres de cortes registrados aún</div>
    </div>
  );

  return (
    <div>
      {fechas.map(fecha => {
        const filas = porFecha[fecha];
        const maxPct = Math.max(...filas.map(f => f.pct));
        return (
          <div key={fecha} style={{ marginBottom: 16 }}>
            {/* Encabezado fecha */}
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📅</span>
              <span>{fecha}</span>
              <span style={{ color: '#aaa', fontWeight: 'normal' }}>— {filas.length} corte(s)</span>
            </div>

            <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ background: '#1a1a2e', padding: '8px 14px', display: 'flex', gap: 16 }}>
                <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📉 Mermas de Cortes</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{filas[0]?.produccion_inyeccion?.formula_salmuera}</span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    {['Corte', 'Kg Carne', 'Inyectado', 'Post-Corte', 'Merma kg', '% Merma', 'Tendencia'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Corte' ? 'left' : 'right', color: '#555', fontWeight: 700, borderBottom: '1px solid #e0e0e0', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r, i) => {
                    const esMayor = r.pct > 0 && r.pct === maxPct;
                    const tend    = flechaTendencia(r.tendencia);
                    return (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#1a1a2e' }}>
                          🥩 {r.corte_nombre}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#555' }}>
                          {parseFloat(r.kg_carne_cruda || 0).toFixed(2)} kg
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#2980b9' }}>
                          {r.inj.toFixed(3)} kg
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#555' }}>
                          {r.post.toFixed(3)} kg
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#e67e22', fontWeight: 'bold' }}>
                          {r.mermaKg.toFixed(3)} kg
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <span style={{
                            fontWeight: 'bold', fontSize: 14,
                            color: esMayor ? '#e74c3c' : r.pct > 10 ? '#e67e22' : '#27ae60'
                          }}>
                            {esMayor && '↑ '}{r.pct.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {tend ? (
                            <span style={{ fontWeight: 'bold', color: tend.color, fontSize: 16 }} title={tend.label}>
                              {tend.icon}
                            </span>
                          ) : (
                            <span style={{ color: '#ccc', fontSize: 11 }}>primera</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
