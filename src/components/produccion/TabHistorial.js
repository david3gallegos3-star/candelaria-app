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
  const [lotesInyeccion,   setLotesInyeccion]   = useState([]);
  const [cierresDespacho,  setCierresDespacho]  = useState([]);
  const [cortesDespacho,   setCortesDespacho]   = useState([]);
  const [editandoCierre,   setEditandoCierre]   = useState(null); // {cierre, fecha}
  const [formCierre,       setFormCierre]       = useState({ hueso:'', aserrin:'', carnudo:'' });
  const [guardandoCierre,  setGuardandoCierre]  = useState(false);

  useEffect(() => {
    supabase.from('produccion_inyeccion')
      .select('*, produccion_inyeccion_cortes(*)')
      .eq('estado', 'cerrado')
      .order('fecha', { ascending: false })
      .limit(60)
      .then(({ data }) => setLotesInyeccion(data || []));

    supabase.from('despacho_cierre_dia')
      .select('*').order('fecha', { ascending: false }).limit(60)
      .then(({ data }) => setCierresDespacho(data || []));

    supabase.from('despacho_cortes')
      .select('*').order('fecha', { ascending: false }).limit(300)
      .then(({ data }) => setCortesDespacho(data || []));
  }, []);

  async function guardarEdicionCierre() {
    if (!editandoCierre) return;
    setGuardandoCierre(true);
    const payload = {
      peso_hueso:   parseFloat(formCierre.hueso   || 0),
      peso_aserrin: parseFloat(formCierre.aserrin || 0),
      peso_carnudo: parseFloat(formCierre.carnudo || 0),
    };
    if (editandoCierre.cierre) {
      await supabase.from('despacho_cierre_dia').update(payload).eq('id', editandoCierre.cierre.id);
    } else {
      await supabase.from('despacho_cierre_dia').insert({ ...payload, fecha: editandoCierre.fecha, usuario_nombre: '' });
    }
    const { data } = await supabase.from('despacho_cierre_dia').select('*').order('fecha', { ascending: false }).limit(60);
    setCierresDespacho(data || []);
    setEditandoCierre(null);
    setGuardandoCierre(false);
  }

  // Agrupar inyección por fecha
  const inyeccionPorFecha = {};
  lotesInyeccion.forEach(l => {
    if (!inyeccionPorFecha[l.fecha]) inyeccionPorFecha[l.fecha] = [];
    inyeccionPorFecha[l.fecha].push(l);
  });

  // Agrupar cierres despacho por fecha
  const cierrePorFecha = {};
  cierresDespacho.forEach(c => { cierrePorFecha[c.fecha] = c; });

  // Agrupar cortes despacho por fecha para calcular merma
  const cortesPorFecha = {};
  cortesDespacho.forEach(r => {
    if (!cortesPorFecha[r.fecha]) cortesPorFecha[r.fecha] = [];
    cortesPorFecha[r.fecha].push(r);
  });

  // Todas las fechas (producción + inyección + despacho cierre)
  const todasFechas = Array.from(new Set([
    ...Object.keys(historialAgrupado),
    ...Object.keys(inyeccionPorFecha),
    ...Object.keys(cierrePorFecha),
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

              {/* ── Cierre de despacho del día ── */}
              {(() => {
                const cierre   = cierrePorFecha[fecha];
                const cortesD  = cortesPorFecha[fecha] || [];
                const mermaDia = cortesD.reduce((s, r) => s + Math.max(0, (r.peso_antes||0)-(r.peso_funda||0)-(r.peso_remanente||0)), 0);
                if (!cierre && cortesD.length === 0) return null;

                const totalIdent    = cierre ? (parseFloat(cierre.peso_hueso||0) + parseFloat(cierre.peso_aserrin||0) + parseFloat(cierre.peso_carnudo||0)) : 0;
                const mermaEnMaq    = mermaDia - totalIdent;

                // Resumen por corte
                const porCorte = {};
                cortesD.forEach(r => {
                  const m = Math.max(0, (r.peso_antes||0)-(r.peso_funda||0)-(r.peso_remanente||0));
                  if (!porCorte[r.corte_nombre]) porCorte[r.corte_nombre] = { n:0, merma:0 };
                  porCorte[r.corte_nombre].n++;
                  porCorte[r.corte_nombre].merma += m;
                });

                return (
                  <div style={{ background:'white', borderRadius:10, padding:14, marginBottom:8, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', border:'1.5px solid #e67e22' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <span style={{ fontWeight:'bold', color:'#d35400', fontSize:14 }}>📦 Despacho y Fraccionamiento</span>
                      <button onClick={() => {
                        setFormCierre({ hueso: String(cierre?.peso_hueso||''), aserrin: String(cierre?.peso_aserrin||''), carnudo: String(cierre?.peso_carnudo||'') });
                        setEditandoCierre({ cierre, fecha });
                      }} style={{ background:'#fff3cd', border:'1px solid #f39c12', borderRadius:7, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:'bold', color:'#856404' }}>
                        ✏️ Editar cierre
                      </button>
                    </div>

                    {/* Resumen cortes */}
                    {Object.entries(porCorte).map(([nombre, d]) => (
                      <div key={nombre} style={{ fontSize:12, color:'#555', marginBottom:3, display:'flex', gap:10 }}>
                        <span>🥩 {nombre} <span style={{ color:'#888' }}>({d.n} corte{d.n!==1?'s':''})</span></span>
                        <span style={{ color:'#e74c3c', fontWeight:'bold' }}>merma: {d.merma.toFixed(3)} kg</span>
                      </div>
                    ))}

                    {mermaDia > 0 && (
                      <div style={{ borderTop:'1px solid #f0f0f0', marginTop:8, paddingTop:8, display:'flex', flexWrap:'wrap', gap:14, fontSize:12 }}>
                        <span style={{ color:'#e74c3c', fontWeight:'bold' }}>Total merma: {mermaDia.toFixed(3)} kg</span>
                        {cierre ? (<>
                          <span style={{ color:'#555' }}>🦴 Hueso: <b>{parseFloat(cierre.peso_hueso||0).toFixed(3)} kg</b></span>
                          <span style={{ color:'#856404' }}>🪵 Aserrín: <b>{parseFloat(cierre.peso_aserrin||0).toFixed(3)} kg</b></span>
                          <span style={{ color:'#155724' }}>🥩 Carnudo: <b>{parseFloat(cierre.peso_carnudo||0).toFixed(3)} kg</b></span>
                          <span style={{ color:'#8e44ad', fontWeight:'bold' }}>🔧 En máquina: {mermaEnMaq.toFixed(3)} kg</span>
                        </>) : (
                          <span style={{ color:'#aaa', fontStyle:'italic' }}>Sin cierre registrado</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

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
      {/* Modal editar cierre despacho */}
      {editandoCierre && (() => {
        const cortesD  = cortesPorFecha[editandoCierre.fecha] || [];
        const mermaDia = cortesD.reduce((s, r) => s + Math.max(0, (r.peso_antes||0)-(r.peso_funda||0)-(r.peso_remanente||0)), 0);
        const totalIdent = parseFloat(formCierre.hueso||0) + parseFloat(formCierre.aserrin||0) + parseFloat(formCierre.carnudo||0);
        const mermaEnMaq = mermaDia - totalIdent;
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:460, boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
              <div style={{ fontWeight:'bold', fontSize:16, color:'#1a1a2e', marginBottom:4 }}>✏️ Editar cierre — {editandoCierre.fecha}</div>
              <div style={{ fontSize:12, color:'#888', marginBottom:16 }}>Merma total del día: <strong style={{ color:'#e74c3c' }}>{mermaDia.toFixed(3)} kg</strong></div>

              {[
                { label:'🦴 Peso hueso / no reutilizable (kg)', key:'hueso',   color:'#555'    },
                { label:'🪵 Peso aserrín (kg)',                  key:'aserrin', color:'#856404' },
                { label:'🥩 Peso carnudo (kg)',                  key:'carnudo', color:'#155724' },
              ].map(({ label, key, color }) => (
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, fontWeight:600, color, display:'block', marginBottom:4 }}>{label}</label>
                  <input type="number" min="0" step="0.001"
                    value={formCierre[key]}
                    onChange={e => setFormCierre(p => ({ ...p, [key]: e.target.value }))}
                    placeholder="0.000"
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', outline:'none', boxSizing:'border-box' }} />
                </div>
              ))}

              {mermaDia > 0 && (
                <div style={{ background: mermaEnMaq < 0 ? '#fdecea' : '#f0f8ff', borderRadius:10, padding:'10px 14px', marginBottom:16, border:`1.5px solid ${mermaEnMaq < 0 ? '#e74c3c' : '#aed6f1'}`, fontSize:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span>Merma total registrada</span><span style={{ fontWeight:'bold', color:'#e74c3c' }}>{mermaDia.toFixed(3)} kg</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span>Identificado (hueso+aserrín+carnudo)</span><span style={{ fontWeight:'bold', color:'#27ae60' }}>{totalIdent.toFixed(3)} kg</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', borderTop:'1px solid #ddd', paddingTop:6, marginTop:4 }}>
                    <span>🔧 Merma en máquina/utensilios</span>
                    <span style={{ color: mermaEnMaq < 0 ? '#e74c3c' : '#8e44ad' }}>{mermaEnMaq.toFixed(3)} kg</span>
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setEditandoCierre(null)} style={{ background:'#f0f2f5', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancelar</button>
                <button onClick={guardarEdicionCierre} disabled={guardandoCierre} style={{ background: guardandoCierre ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)', color:'white', border:'none', borderRadius:8, padding:'10px 24px', cursor: guardandoCierre?'default':'pointer', fontSize:13, fontWeight:'bold' }}>
                  {guardandoCierre ? 'Guardando...' : '✅ Guardar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}