// ============================================
// AuditoriaTabla.js
// Tabla principal de auditoría — solo lectura
// ============================================
import React from 'react';

export default function AuditoriaTabla({
  mobile,
  registrosPagina,
  registros,
  pagina, setPagina,
  totalPaginas, POR_PAGINA,
  colorTipo, iconTipo, labelTipo,
}) {
  if (registros.length === 0) {
    return (
      <div style={{
        textAlign:'center', padding:'60px', color:'#aaa',
        background:'white', borderRadius:'10px'
      }}>
        <div style={{ fontSize:'48px', marginBottom:'12px' }}>🗂️</div>
        <div style={{ fontSize:'14px', marginBottom:'4px' }}>
          Sin registros
        </div>
        <div style={{ fontSize:'13px' }}>
          Usa los filtros y presiona Buscar
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Tabla desktop ── */}
      {!mobile ? (
        <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{
              width:'100%', borderCollapse:'collapse', fontSize:'12px'
            }}>
              <thead>
                <tr style={{ background:'#1a1a2e', color:'white' }}>
                  {['FECHA','TIPO','USUARIO','PRODUCTO',
                    'CAMPO','ANTES','DESPUÉS','MENSAJE','LEÍDA']
                    .map(h => (
                      <th key={h} style={{
                        padding:'10px', textAlign:'left',
                        fontSize:'11px', whiteSpace:'nowrap'
                      }}>{h}</th>
                    ))
                  }
                </tr>
              </thead>
              <tbody>
                {registrosPagina.map((r, i) => (
                  <tr key={r.id} style={{
                    background: !r.leida
                      ? '#fffbf0'
                      : i % 2 === 0 ? '#fafafa' : 'white',
                    borderBottom:'1px solid #f0f0f0'
                  }}>
                    {/* Fecha */}
                    <td style={{
                      padding:'9px 10px', color:'#555',
                      whiteSpace:'nowrap', fontSize:'11px'
                    }}>
                      {new Date(r.created_at).toLocaleString('es-EC', {
                        day:'2-digit', month:'2-digit', year:'numeric',
                        hour:'2-digit', minute:'2-digit'
                      })}
                    </td>

                    {/* Tipo */}
                    <td style={{ padding:'9px 10px' }}>
                      <span style={{
                        background: colorTipo(r.tipo) + '22',
                        color:      colorTipo(r.tipo),
                        padding:'3px 8px', borderRadius:'8px',
                        fontSize:'10px', fontWeight:'bold',
                        whiteSpace:'nowrap'
                      }}>
                        {iconTipo(r.tipo)} {labelTipo(r.tipo)}
                      </span>
                    </td>

                    {/* Usuario */}
                    <td style={{
                      padding:'9px 10px', color:'#555', fontSize:'11px'
                    }}>
                      {r.usuario_nombre || '—'}
                    </td>

                    {/* Producto */}
                    <td style={{
                      padding:'9px 10px', fontWeight:'bold',
                      color:'#1a1a2e', fontSize:'11px'
                    }}>
                      {r.producto_nombre || '—'}
                    </td>

                    {/* Campo */}
                    <td style={{
                      padding:'9px 10px', color:'#888', fontSize:'11px'
                    }}>
                      {r.campo_modificado || '—'}
                    </td>

                    {/* Valor antes */}
                    <td style={{ padding:'9px 10px' }}>
                      {r.valor_antes ? (
                        <span style={{
                          background:'#fde8e8', color:'#721c24',
                          padding:'2px 7px', borderRadius:'6px',
                          fontSize:'10px', fontWeight:'bold'
                        }}>{r.valor_antes}</span>
                      ) : (
                        <span style={{ color:'#ddd', fontSize:'11px' }}>—</span>
                      )}
                    </td>

                    {/* Valor después */}
                    <td style={{ padding:'9px 10px' }}>
                      {r.valor_despues ? (
                        <span style={{
                          background:'#d4edda', color:'#155724',
                          padding:'2px 7px', borderRadius:'6px',
                          fontSize:'10px', fontWeight:'bold'
                        }}>{r.valor_despues}</span>
                      ) : (
                        <span style={{ color:'#ddd', fontSize:'11px' }}>—</span>
                      )}
                    </td>

                    {/* Mensaje */}
                    <td style={{
                      padding:'9px 10px', color:'#555',
                      fontSize:'11px', maxWidth:'250px',
                      overflow:'hidden', textOverflow:'ellipsis',
                      whiteSpace:'nowrap'
                    }} title={r.mensaje || ''}>
                      {r.mensaje || '—'}
                    </td>

                    {/* Leída */}
                    <td style={{ padding:'9px 10px', textAlign:'center' }}>
                      <span style={{
                        background: r.leida ? '#d4edda' : '#fff3cd',
                        color:      r.leida ? '#155724' : '#856404',
                        padding:'2px 8px', borderRadius:'8px',
                        fontSize:'10px', fontWeight:'bold'
                      }}>
                        {r.leida ? '✓' : '●'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : (
        /* ── Cards mobile ── */
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {registrosPagina.map(r => (
            <div key={r.id} style={{
              background:'white', borderRadius:'12px',
              border:`1.5px solid ${!r.leida ? '#ffc107' : '#e0e0e0'}`,
              overflow:'hidden',
              boxShadow:'0 1px 4px rgba(0,0,0,0.05)'
            }}>
              {/* Header card */}
              <div style={{
                padding:'10px 14px',
                background: !r.leida ? '#fffbf0' : '#f8f9fa',
                borderBottom:'1px solid #f0f0f0',
                display:'flex', justifyContent:'space-between',
                alignItems:'flex-start'
              }}>
                <div style={{ flex:1 }}>
                  <span style={{
                    background: colorTipo(r.tipo) + '22',
                    color:      colorTipo(r.tipo),
                    padding:'2px 8px', borderRadius:'8px',
                    fontSize:'10px', fontWeight:'bold'
                  }}>
                    {iconTipo(r.tipo)} {labelTipo(r.tipo)}
                  </span>
                  {r.producto_nombre && (
                    <div style={{
                      fontWeight:'bold', color:'#1a1a2e',
                      fontSize:'12px', marginTop:'4px'
                    }}>
                      {r.producto_nombre}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize:'10px', color:'#aaa',
                  textAlign:'right', flexShrink:0, marginLeft:8
                }}>
                  {new Date(r.created_at).toLocaleString('es-EC', {
                    day:'2-digit', month:'2-digit',
                    hour:'2-digit', minute:'2-digit'
                  })}
                </div>
              </div>

              {/* Cuerpo card */}
              <div style={{ padding:'10px 14px' }}>
                {/* Usuario */}
                <div style={{
                  fontSize:'11px', color:'#888', marginBottom:'4px'
                }}>
                  👤 {r.usuario_nombre || '—'}
                </div>

                {/* Cambio antes/después */}
                {(r.valor_antes || r.valor_despues) && (
                  <div style={{
                    display:'flex', alignItems:'center',
                    gap:6, marginBottom:'6px', flexWrap:'wrap'
                  }}>
                    {r.valor_antes && (
                      <span style={{
                        background:'#fde8e8', color:'#721c24',
                        padding:'2px 7px', borderRadius:'6px', fontSize:'10px'
                      }}>{r.valor_antes}</span>
                    )}
                    {r.valor_antes && r.valor_despues && (
                      <span style={{ color:'#aaa', fontSize:'12px' }}>→</span>
                    )}
                    {r.valor_despues && (
                      <span style={{
                        background:'#d4edda', color:'#155724',
                        padding:'2px 7px', borderRadius:'6px', fontSize:'10px'
                      }}>{r.valor_despues}</span>
                    )}
                  </div>
                )}

                {/* Mensaje */}
                {r.mensaje && (
                  <div style={{
                    fontSize:'11px', color:'#555',
                    background:'#f8f9fa', borderRadius:'6px',
                    padding:'6px 8px',
                    borderLeft:`3px solid ${colorTipo(r.tipo)}`
                  }}>
                    {r.mensaje}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Paginación ── */}
      {totalPaginas > 1 && (
        <div style={{
          display:'flex', justifyContent:'center',
          alignItems:'center', gap:8, marginTop:16,
          flexWrap:'wrap'
        }}>
          <button
            onClick={() => setPagina(1)}
            disabled={pagina === 1}
            style={{
              padding:'6px 12px', borderRadius:'7px',
              border:'1px solid #ddd', cursor: pagina === 1 ? 'not-allowed' : 'pointer',
              background: pagina === 1 ? '#f0f0f0' : 'white',
              color: pagina === 1 ? '#aaa' : '#1a1a2e',
              fontSize:'12px'
            }}>«</button>

          <button
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina === 1}
            style={{
              padding:'6px 12px', borderRadius:'7px',
              border:'1px solid #ddd', cursor: pagina === 1 ? 'not-allowed' : 'pointer',
              background: pagina === 1 ? '#f0f0f0' : 'white',
              color: pagina === 1 ? '#aaa' : '#1a1a2e',
              fontSize:'12px'
            }}>‹ Anterior</button>

          <span style={{
            padding:'6px 14px', background:'#1a1a2e',
            color:'white', borderRadius:'7px', fontSize:'12px',
            fontWeight:'bold'
          }}>
            {pagina} / {totalPaginas}
          </span>

          <button
            onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
            disabled={pagina === totalPaginas}
            style={{
              padding:'6px 12px', borderRadius:'7px',
              border:'1px solid #ddd',
              cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer',
              background: pagina === totalPaginas ? '#f0f0f0' : 'white',
              color: pagina === totalPaginas ? '#aaa' : '#1a1a2e',
              fontSize:'12px'
            }}>Siguiente ›</button>

          <button
            onClick={() => setPagina(totalPaginas)}
            disabled={pagina === totalPaginas}
            style={{
              padding:'6px 12px', borderRadius:'7px',
              border:'1px solid #ddd',
              cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer',
              background: pagina === totalPaginas ? '#f0f0f0' : 'white',
              color: pagina === totalPaginas ? '#aaa' : '#1a1a2e',
              fontSize:'12px'
            }}>»</button>

          <span style={{ fontSize:'12px', color:'#888' }}>
            {((pagina-1) * POR_PAGINA) + 1}–{Math.min(pagina * POR_PAGINA, registros.length)} de {registros.length}
          </span>
        </div>
      )}
    </div>
  );
}