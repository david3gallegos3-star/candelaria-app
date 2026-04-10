// ============================================
// TabHistorial.js
// Historial de producción agrupado por fecha
// ============================================
import React from 'react';

export default function TabHistorial({
  historialAgrupado,
  produccionDiaria,
  esAdmin,
  setModalRevertir,
}) {
  if (produccionDiaria.length === 0) {
    return (
      <div style={{ textAlign:'center', padding:'60px', color:'#aaa' }}>
        <div style={{ fontSize:'48px', marginBottom:'12px' }}>📋</div>
        <div>Sin registros de producción</div>
      </div>
    );
  }

  return (
    <div>
      {Object.keys(historialAgrupado)
        .sort((a, b) => b.localeCompare(a))
        .map(fecha => {
          const registros  = historialAgrupado[fecha];
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