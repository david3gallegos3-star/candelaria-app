// ============================================
// TabRegistrar.js
// Formulario + resumen de producción
// ============================================
import React from 'react';

export default function TabRegistrar({
  mobile,
  // Producto
  productoSel, setProductoSel,
  buscarProd,  setBuscarProd,
  prodsFiltrados,
  formulacion, configProd,
  seleccionarProducto,
  // Datos producción
  fecha, setFecha,
  turno, setTurno,
  numParadas, setNumParadas,
  nota, setNota,
  // Resumen
  resumen,
  // Guardar
  guardando,
  guardarProduccion,
}) {
  return (
    <div style={{
      display:'grid',
      gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
      gap:'16px'
    }}>

      {/* ── Panel izquierdo — formulario ── */}
      <div>

        {/* 1. Seleccionar producto */}
        <div style={{
          background:'white', borderRadius:'10px',
          padding:'16px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
          marginBottom:'12px'
        }}>
          <div style={{
            fontWeight:'bold', color:'#1a1a2e',
            fontSize:'14px', marginBottom:'12px'
          }}>1. Selecciona el producto</div>

          <input
            placeholder="🔍 Buscar producto..."
            value={buscarProd}
            onChange={e => {
              setBuscarProd(e.target.value);
              if (!e.target.value) setProductoSel(null);
            }}
            style={{
              width:'100%', padding:'10px 12px',
              borderRadius:'8px', border:'1.5px solid #ddd',
              fontSize:'13px', boxSizing:'border-box', marginBottom:'8px'
            }}
          />

          {/* Dropdown resultados */}
          {buscarProd && !productoSel && (
            <div style={{
              border:'1px solid #eee', borderRadius:'8px',
              maxHeight:'200px', overflowY:'auto'
            }}>
              {prodsFiltrados.length === 0 ? (
                <div style={{
                  padding:'12px', color:'#aaa',
                  fontSize:'13px', textAlign:'center'
                }}>Sin resultados</div>
              ) : prodsFiltrados.map(p => (
                <div
                  key={p.id}
                  onClick={() => seleccionarProducto(p)}
                  style={{
                    padding:'10px 14px', cursor:'pointer',
                    borderBottom:'1px solid #f5f5f5',
                    fontSize:'13px', fontWeight:'bold', color:'#1a1a2e'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f8ff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  {p.nombre}
                  <div style={{ fontSize:'11px', color:'#888', fontWeight:'normal' }}>
                    {p.categoria}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Producto seleccionado */}
          {productoSel && (
            <div style={{
              background:'#e8f5e9', borderRadius:'8px',
              padding:'10px 14px',
              display:'flex', justifyContent:'space-between', alignItems:'center'
            }}>
              <div>
                <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'13px' }}>
                  {productoSel.nombre}
                </div>
                <div style={{ fontSize:'11px', color:'#555' }}>
                  {formulacion.length} ingredientes · Merma: {((configProd?.merma || 0) * 100).toFixed(0)}%
                </div>
              </div>
              <button
                onClick={() => {
                  setProductoSel(null);
                  setBuscarProd('');
                }}
                style={{
                  background:'none', border:'none',
                  cursor:'pointer', color:'#e74c3c', fontSize:'16px'
                }}>✕</button>
            </div>
          )}
        </div>

        {/* 2. Datos de producción */}
        <div style={{
          background:'white', borderRadius:'10px',
          padding:'16px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
          marginBottom:'12px'
        }}>
          <div style={{
            fontWeight:'bold', color:'#1a1a2e',
            fontSize:'14px', marginBottom:'12px'
          }}>2. Datos de producción</div>

          {/* Fecha y turno */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr',
            gap:'10px', marginBottom:'10px'
          }}>
            <div>
              <label style={{
                fontSize:'11px', fontWeight:'bold',
                color:'#555', display:'block', marginBottom:'4px'
              }}>Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                style={{
                  width:'100%', padding:'9px',
                  borderRadius:'8px', border:'1.5px solid #ddd',
                  fontSize:'13px', boxSizing:'border-box'
                }}
              />
            </div>
            <div>
              <label style={{
                fontSize:'11px', fontWeight:'bold',
                color:'#555', display:'block', marginBottom:'4px'
              }}>Turno</label>
              <select
                value={turno}
                onChange={e => setTurno(e.target.value)}
                style={{
                  width:'100%', padding:'9px',
                  borderRadius:'8px', border:'1.5px solid #ddd', fontSize:'13px'
                }}
              >
                <option value="mañana">🌅 Mañana</option>
                <option value="tarde">🌇 Tarde</option>
                <option value="noche">🌙 Noche</option>
              </select>
            </div>
          </div>

          {/* Número de paradas */}
          <div>
            <label style={{
              fontSize:'11px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:'4px'
            }}>Número de paradas</label>
            <input
              type="number"
              value={numParadas}
              onChange={e => setNumParadas(e.target.value)}
              placeholder="Ej: 3"
              min="1"
              style={{
                width:'100%', padding:'12px',
                borderRadius:'8px', border:'1.5px solid #f39c12',
                fontSize:'22px', fontWeight:'bold',
                textAlign:'center', boxSizing:'border-box'
              }}
            />
          </div>

          {/* Nota */}
          <div style={{ marginTop:'10px' }}>
            <label style={{
              fontSize:'11px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:'4px'
            }}>Nota (opcional)</label>
            <input
              type="text"
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Ej: lote especial, cliente X..."
              style={{
                width:'100%', padding:'9px',
                borderRadius:'8px', border:'1px solid #ddd',
                fontSize:'13px', boxSizing:'border-box'
              }}
            />
          </div>
        </div>

        {/* Alertas stock insuficiente */}
        {resumen && resumen.alertas.length > 0 && (
          <div style={{
            background:'#fff3cd', border:'1px solid #ffc107',
            borderRadius:'10px', padding:'12px 14px', marginBottom:'12px'
          }}>
            <div style={{
              fontWeight:'bold', color:'#856404',
              fontSize:'13px', marginBottom:'6px'
            }}>⚠️ Stock insuficiente — se registrará de todas formas</div>
            {resumen.alertas.map((a, i) => (
              <div key={i} style={{ fontSize:'12px', color:'#856404', marginBottom:'2px' }}>
                • {a.ingrediente_nombre}: necesitas{' '}
                <strong>{a.kg_necesarios.toFixed(2)} kg</strong> · disponible{' '}
                <strong>{a.stock_disponible.toFixed(2)} kg</strong>
              </div>
            ))}
          </div>
        )}

        {/* Botón guardar */}
        {resumen && (
          <button
            onClick={() => guardarProduccion(resumen)}
            disabled={guardando}
            style={{
              width:'100%', padding:'14px',
              background: guardando ? '#95a5a6' : '#27ae60',
              color:'white', border:'none',
              borderRadius:'10px', cursor: guardando ? 'not-allowed' : 'pointer',
              fontWeight:'bold', fontSize:'15px',
              opacity: guardando ? 0.7 : 1
            }}>
            {guardando
              ? 'Guardando...'
              : `✅ Registrar ${resumen.paradas} paradas — ${resumen.kgProducidos.toFixed(1)} kg`}
          </button>
        )}
      </div>

      {/* ── Panel derecho — resumen ── */}
      <div>
        {resumen ? (
          <>
            {/* Resumen kg */}
            <div style={{
              background:'#1a1a2e', borderRadius:'10px',
              padding:'16px', marginBottom:'12px', color:'white'
            }}>
              <div style={{
                fontSize:'13px', color:'#aaa',
                marginBottom:'10px', fontWeight:'bold'
              }}>RESUMEN DE PRODUCCIÓN</div>

              <div style={{
                display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'
              }}>
                {[
                  ['Paradas',                    resumen.paradas                                          ],
                  ['Kg crudo total',             resumen.kgTotalCrudo.toFixed(2) + ' kg'                 ],
                  ['Merma (' + (resumen.merma*100).toFixed(0) + '%)', '-' + (resumen.kgTotalCrudo * resumen.merma).toFixed(2) + ' kg'],
                  ['KG PRODUCIDOS',              resumen.kgProducidos.toFixed(2) + ' kg'                 ],
                ].map(([label, val]) => (
                  <div key={label} style={{
                    background:'rgba(255,255,255,0.08)',
                    borderRadius:'8px', padding:'10px 12px'
                  }}>
                    <div style={{ fontSize:'10px', color:'#aaa', marginBottom:'3px' }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize:'16px', fontWeight:'bold',
                      color: label === 'KG PRODUCIDOS' ? '#2ecc71' : 'white'
                    }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop:'10px',
                background:'rgba(255,255,255,0.08)',
                borderRadius:'8px', padding:'10px 12px',
                display:'flex', justifyContent:'space-between', alignItems:'center'
              }}>
                <span style={{ fontSize:'13px', color:'#aaa' }}>
                  Costo total ingredientes
                </span>
                <span style={{ fontSize:'18px', fontWeight:'bold', color:'#f39c12' }}>
                  ${resumen.costoTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Tabla ingredientes */}
            <div style={{
              background:'white', borderRadius:'10px',
              overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
            }}>
              <div style={{
                background:'#1a1a2e', padding:'10px 14px',
                color:'white', fontSize:'12px', fontWeight:'bold'
              }}>INGREDIENTES NECESARIOS</div>

              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <thead>
                    <tr style={{ background:'#f8f9fa' }}>
                      {['INGREDIENTE','KG NECESARIOS','STOCK DISP.','COSTO','ESTADO'].map(h => (
                        <th key={h} style={{
                          padding:'8px 10px', textAlign:'left',
                          fontSize:'10px', color:'#888', fontWeight:'700'
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.ingredientes.map((ing, i) => (
                      <tr key={i} style={{
                        borderBottom:'1px solid #f0f0f0',
                        background: !ing.suficiente ? '#fffbf0' : 'white'
                      }}>
                        <td style={{
                          padding:'8px 10px', fontWeight:'bold',
                          color:'#1a1a2e', fontSize:'11px'
                        }}>{ing.ingrediente_nombre}</td>

                        <td style={{ padding:'8px 10px', color:'#555' }}>
                          {ing.kg_necesarios.toFixed(3)} kg
                        </td>

                        <td style={{
                          padding:'8px 10px', fontWeight:'bold',
                          color: ing.suficiente ? '#27ae60' : '#e74c3c'
                        }}>
                          {ing.stock_disponible.toFixed(2)} kg
                        </td>

                        <td style={{
                          padding:'8px 10px',
                          color:'#27ae60', fontWeight:'bold'
                        }}>
                          ${ing.costo_ingrediente.toFixed(2)}
                        </td>

                        <td style={{ padding:'8px 10px' }}>
                          <span style={{
                            background: ing.suficiente ? '#d4edda' : '#fff3cd',
                            color:      ing.suficiente ? '#155724' : '#856404',
                            padding:'2px 8px', borderRadius:'8px',
                            fontSize:'10px', fontWeight:'700'
                          }}>
                            {ing.suficiente ? '✓ OK' : '⚠ BAJO'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* Estado vacío */
          <div style={{
            background:'white', borderRadius:'10px',
            padding:'40px', textAlign:'center',
            boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>🏭</div>
            <div style={{ color:'#aaa', fontSize:'14px' }}>
              Selecciona un producto e ingresa el número de paradas para ver el resumen
            </div>
          </div>
        )}
      </div>
    </div>
  );
}