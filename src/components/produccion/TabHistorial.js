// ============================================
// TabHistorial.js
// Historial de producción agrupado por fecha
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function TabHistorial({
  historialAgrupado,
  produccionDiaria,
  esAdmin,
  setModalRevertir,
}) {
  const [lotesInyeccion, setLotesInyeccion] = useState([]);

  useEffect(() => {
    supabase.from('produccion_inyeccion')
      .select('*, produccion_inyeccion_cortes(*)')
      .eq('estado', 'cerrado')
      .order('fecha', { ascending: false })
      .limit(60)
      .then(({ data }) => setLotesInyeccion(data || []));
  }, []);

  // Agrupar inyección por fecha
  const inyeccionPorFecha = {};
  lotesInyeccion.forEach(l => {
    if (!inyeccionPorFecha[l.fecha]) inyeccionPorFecha[l.fecha] = [];
    inyeccionPorFecha[l.fecha].push(l);
  });

  // Todas las fechas (producción + inyección)
  const todasFechas = Array.from(new Set([
    ...Object.keys(historialAgrupado),
    ...Object.keys(inyeccionPorFecha),
  ])).sort((a, b) => b.localeCompare(a));

  if (todasFechas.length === 0) {
    return (
      <div style={{ textAlign:'center', padding:'60px', color:'#aaa' }}>
        <div style={{ fontSize:'48px', marginBottom:'12px' }}>📋</div>
        <div>Sin registros de producción</div>
      </div>
    );
  }

  return (
    <div>
      {todasFechas.map(fecha => {
          const registros  = historialAgrupado[fecha] || [];
          const inyecs     = inyeccionPorFecha[fecha]  || [];
          const kgDia      = registros.reduce((s, r) => s + parseFloat(r.kg_producidos || 0), 0);
          const costoDia   = registros.reduce((s, r) => s + parseFloat(r.costo_total    || 0), 0);

          return (
            <div key={fecha} style={{ marginBottom:'16px' }}>

              {/* ── Encabezado fecha ── */}
              <div style={{
                display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:'8px'
              }}>
                <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'14px' }}>
                  📅 {new Date(fecha + 'T12:00:00').toLocaleDateString('es-EC', {
                    weekday:'long', year:'numeric', month:'long', day:'numeric'
                  })}
                </div>
                <div style={{ fontSize:'12px', color:'#888' }}>
                  Total:{' '}
                  <strong style={{ color:'#27ae60' }}>{kgDia.toFixed(1)} kg</strong>
                  {' · '}
                  <strong style={{ color:'#f39c12' }}>${costoDia.toFixed(2)}</strong>
                </div>
              </div>

              {/* ── Lotes inyección ── */}
              {inyecs.map(lote => (
                <div key={'inj-'+lote.id} style={{
                  background:'white', borderRadius:'10px',
                  padding:'14px', marginBottom:'8px',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                  border:'1.5px solid #2980b9'
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:'bold', color:'#1a3a5c', fontSize:'14px' }}>
                          💉 {lote.formula_salmuera}
                        </span>
                        <span style={{ background:'#eaf4fb', color:'#1a3a5c', padding:'2px 8px', borderRadius:'6px', fontSize:'10px', fontWeight:700 }}>
                          inyección
                        </span>
                      </div>
                    </div>
                    {esAdmin && (
                      <button
                        onClick={async () => {
                          if (!window.confirm('¿Revertir este lote? Se restaurará el inventario.')) return;
                          try {
                            const { data: invActual } = await supabase.from('inventario_mp').select('materia_prima_id,stock_kg');
                            for (const ing of (lote.produccion_inyeccion_ingredientes || [])) {
                              if (!ing.materia_prima_id || parseFloat(ing.kg_usados) <= 0) continue;
                              const inv = (invActual || []).find(i => i.materia_prima_id === ing.materia_prima_id);
                              if (inv) await supabase.from('inventario_mp').update({ stock_kg: parseFloat(inv.stock_kg) + parseFloat(ing.kg_usados) }).eq('materia_prima_id', ing.materia_prima_id);
                            }
                            for (const c of (lote.produccion_inyeccion_cortes || [])) {
                              if (!c.materia_prima_id || parseFloat(c.kg_carne_cruda) <= 0) continue;
                              const inv = (invActual || []).find(i => i.materia_prima_id === c.materia_prima_id);
                              if (inv) await supabase.from('inventario_mp').update({ stock_kg: parseFloat(inv.stock_kg) + parseFloat(c.kg_carne_cruda) }).eq('materia_prima_id', c.materia_prima_id);
                            }
                            await supabase.from('produccion_inyeccion').update({ estado: 'revertido' }).eq('id', lote.id);
                            setLotesInyeccion(prev => prev.filter(l => l.id !== lote.id));
                          } catch(e) { alert('Error al revertir: ' + e.message); }
                        }}
                        style={{ background:'#f8d7da', color:'#721c24', border:'1px solid #f5c6c6', borderRadius:'7px', padding:'6px 12px', cursor:'pointer', fontSize:'11px', fontWeight:'bold', whiteSpace:'nowrap', marginLeft:'10px' }}>
                        ↩️ Revertir
                      </button>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:'16px', fontSize:'12px', color:'#555', flexWrap:'wrap', marginTop:6 }}>
                    <span>🥩 <strong>{parseFloat(lote.kg_carne_total).toFixed(2)} kg</strong> carne</span>
                    <span>🧂 <strong>{parseFloat(lote.kg_salmuera_requerida).toFixed(3)} kg</strong> salmuera preparada</span>
                    <span>👤 {lote.usuario_nombre}</span>
                  </div>
                  {(lote.produccion_inyeccion_cortes || []).length > 0 && (
                    <details style={{ marginTop:8 }}>
                      <summary style={{ fontSize:'11px', color:'#2980b9', cursor:'pointer' }}>
                        Ver cortes ({lote.produccion_inyeccion_cortes.length})
                      </summary>
                      <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                        {(() => {
                          const mermas = lote.produccion_inyeccion_cortes.map(c => {
                            const inj  = parseFloat(c.kg_carne_limpia || 0) + parseFloat(c.kg_retazos || 0);
                            const post = parseFloat(c.kg_carne_limpia || 0);
                            return inj > 0 ? ((inj - post) / inj) * 100 : 0;
                          });
                          const maxMerma = Math.max(...mermas);
                          return lote.produccion_inyeccion_cortes.map((c, i) => {
                            const pct = mermas[i];
                            const esMayor = pct > 0 && pct === maxMerma;
                            return (
                              <span key={i} style={{
                                background: esMayor ? '#fdecea' : '#f0f2f5',
                                padding:'3px 10px', borderRadius:6, fontSize:10,
                                color: esMayor ? '#c0392b' : '#555',
                                fontWeight: esMayor ? 'bold' : 'normal',
                                border: esMayor ? '1px solid #e74c3c' : '1px solid transparent'
                              }}>
                                {c.corte_nombre}: {esMayor && '↑'}{pct > 0 ? ` ${pct.toFixed(1)}% merma` : ' sin datos'}
                              </span>
                            );
                          });
                        })()}
                      </div>
                    </details>
                  )}
                  {lote.notas && <div style={{ marginTop:6, fontSize:12, color:'#888', fontStyle:'italic' }}>📝 {lote.notas}</div>}
                </div>
              ))}

              {/* ── Registros del día ── */}
              {registros.map(r => (
                <div key={r.id} style={{
                  background:'white', borderRadius:'10px',
                  padding:'14px', marginBottom:'8px',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                  border:'1px solid #f0f0f0'
                }}>
                  <div style={{
                    display:'flex', justifyContent:'space-between',
                    alignItems:'flex-start'
                  }}>
                    <div style={{ flex:1 }}>

                      {/* Nombre + turno + badge editado */}
                      <div style={{
                        display:'flex', gap:'8px',
                        alignItems:'center', marginBottom:'6px', flexWrap:'wrap'
                      }}>
                        <span style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'14px' }}>
                          {r.producto_nombre}
                        </span>

                        <span style={{
                          background:
                            r.turno === 'mañana' ? '#fff3cd' :
                            r.turno === 'tarde'  ? '#fde8e8' : '#e8f4fd',
                          color:
                            r.turno === 'mañana' ? '#856404' :
                            r.turno === 'tarde'  ? '#721c24' : '#1a5276',
                          padding:'2px 8px', borderRadius:'6px',
                          fontSize:'10px', fontWeight:'700'
                        }}>
                          {r.turno === 'mañana' ? '🌅' :
                           r.turno === 'tarde'  ? '🌇' : '🌙'} {r.turno}
                        </span>

                        {r.editado && (
                          <span style={{
                            background:'#f3e5f5', color:'#6c3483',
                            padding:'2px 8px', borderRadius:'6px', fontSize:'10px'
                          }}>editado</span>
                        )}
                      </div>

                      {/* Stats */}
                      <div style={{
                        display:'flex', gap:'16px',
                        fontSize:'12px', color:'#555', flexWrap:'wrap'
                      }}>
                        <span>
                          🔢 <strong>{r.num_paradas}</strong> paradas
                        </span>
                        <span>
                          ⚖️ <strong style={{ color:'#27ae60' }}>
                            {parseFloat(r.kg_producidos || 0).toFixed(1)} kg
                          </strong>
                        </span>
                        <span>
                          💰 <strong style={{ color:'#f39c12' }}>
                            ${parseFloat(r.costo_total || 0).toFixed(2)}
                          </strong>
                        </span>
                        <span>👤 {r.usuario_nombre}</span>
                      </div>

                      {/* Nota */}
                      {r.nota && (
                        <div style={{
                          marginTop:'6px', fontSize:'12px',
                          color:'#888', fontStyle:'italic'
                        }}>📝 {r.nota}</div>
                      )}

                      {/* Ingredientes usados — collapsible */}
                      {r.ingredientes_usados && r.ingredientes_usados.length > 0 && (
                        <details style={{ marginTop:'8px' }}>
                          <summary style={{
                            fontSize:'11px', color:'#3498db', cursor:'pointer'
                          }}>
                            Ver ingredientes usados ({r.ingredientes_usados.length})
                          </summary>
                          <div style={{
                            marginTop:'6px',
                            display:'flex', flexWrap:'wrap', gap:'4px'
                          }}>
                            {r.ingredientes_usados.map((ing, i) => (
                              <span key={i} style={{
                                background:'#f0f2f5', padding:'2px 8px',
                                borderRadius:'6px', fontSize:'10px', color:'#555'
                              }}>
                                {ing.ingrediente_nombre}: {parseFloat(ing.kg_usados).toFixed(2)} kg
                              </span>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Botón revertir — solo admin */}
                    {esAdmin && (
                      <button
                        onClick={() => setModalRevertir(r)}
                        style={{
                          background:'#f8d7da', color:'#721c24',
                          border:'1px solid #f5c6c6',
                          borderRadius:'7px', padding:'6px 12px',
                          cursor:'pointer', fontSize:'11px',
                          fontWeight:'bold', whiteSpace:'nowrap',
                          marginLeft:'10px'
                        }}>↩️ Revertir</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      }
    </div>
  );
}