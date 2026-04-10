// ============================================
// TabStock.js
// Tab de stock actual — tabla + cards mobile
// ============================================
import React from 'react';
import StockInput from './StockInput';

export default function TabStock({
  mobile, loading, puedeEditar,
  inventarioFiltrado,
  categorias, catFiltro, setCatFiltro,
  estadoFiltro, setEstadoFiltro,
  buscar, setBuscar,
  badgeStock,
  guardarStockInicial,
  setModalEntrada, setEntradaKg,
  setEntradaPrecio, setEntradaNota,
  setModalMinimo, setMinimoKg,
}) {
  return (
    <>
      {/* ── Filtros ── */}
      <div style={{
        background:'white', padding:'12px 14px',
        borderRadius:'10px', marginBottom:'12px',
        display:'flex', gap:'10px', flexWrap:'wrap',
        boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <input
          placeholder="🔍 Buscar MP..."
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          style={{
            flex:1, minWidth:180, padding:'8px 12px',
            borderRadius:'8px', border:'1px solid #ddd', fontSize:'13px'
          }}
        />
        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value)}
          style={{
            padding:'8px 12px', borderRadius:'8px',
            border:'1px solid #ddd', fontSize:'13px', minWidth:160
          }}
        >
          <option value="TODAS">Todas las categorías</option>
          {categorias.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          value={estadoFiltro}
          onChange={e => setEstadoFiltro(e.target.value)}
          style={{
            padding:'8px 12px', borderRadius:'8px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        >
          <option value="TODOS">Todos los estados</option>
          <option value="CRITICO">Crítico</option>
          <option value="BAJO">Bajo</option>
          <option value="OK">OK</option>
        </select>
        <span style={{
          padding:'8px 12px', background:'#f0f2f5',
          borderRadius:'8px', fontSize:'13px', color:'#666'
        }}>{inventarioFiltrado.length} registros</span>
      </div>

      {/* ── Contenido ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'40px', color:'#aaa' }}>
          ⏳ Cargando inventario...
        </div>

      ) : mobile ? (
        /* ── Cards mobile ── */
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {inventarioFiltrado.map(mp => {
            const badge = badgeStock(mp.estado_stock);
            return (
              <div key={mp.id} style={{
                background:'white', borderRadius:'12px',
                overflow:'hidden',
                border:`1.5px solid ${
                  mp.estado_stock === 'CRITICO' ? '#f5c6c6' :
                  mp.estado_stock === 'BAJO'    ? '#ffeeba' : '#e0e0e0'
                }`,
                boxShadow:'0 1px 4px rgba(0,0,0,0.05)'
              }}>
                {/* Header card */}
                <div style={{
                  padding:'10px 14px', borderBottom:'1px solid #f5f5f5',
                  display:'flex', justifyContent:'space-between', alignItems:'center'
                }}>
                  <div>
                    <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e' }}>
                      {mp.nombre_producto || mp.nombre}
                    </div>
                    <div style={{ fontSize:'11px', color:'#888' }}>
                      {mp.id} · {mp.categoria}
                    </div>
                  </div>
                  <span style={{
                    background:badge.bg, color:badge.color,
                    padding:'3px 10px', borderRadius:'10px',
                    fontSize:'11px', fontWeight:'700'
                  }}>{badge.txt}</span>
                </div>

                {/* Datos */}
                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
                  padding:'8px 12px', gap:'8px'
                }}>
                  {/* Stock */}
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>STOCK</div>
                    <StockInput
                      mp={mp}
                      onSave={guardarStockInicial}
                      disabled={!puedeEditar}
                    />
                  </div>

                  {/* Mínimo */}
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>MÍNIMO</div>
                    <div style={{ fontSize:'14px', fontWeight:'700', color:'#555' }}>
                      {mp.stock_minimo_kg} kg
                    </div>
                    {puedeEditar && (
                      <button
                        onClick={() => { setModalMinimo(mp); setMinimoKg(mp.stock_minimo_kg); }}
                        style={{
                          fontSize:'10px', color:'#3498db',
                          background:'none', border:'none',
                          cursor:'pointer', padding:0
                        }}>✏️ editar</button>
                    )}
                  </div>

                  {/* Precio */}
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>$/KG</div>
                    <div style={{ fontSize:'14px', fontWeight:'700', color:'#27ae60' }}>
                      ${parseFloat(mp.precio_kg || 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Botón entrada */}
                {puedeEditar && (
                  <div style={{ padding:'6px 12px 10px' }}>
                    <button
                      onClick={() => {
                        setModalEntrada({ inv:mp });
                        setEntradaKg('');
                        setEntradaPrecio('');
                        setEntradaNota('');
                      }}
                      style={{
                        width:'100%', background:'#27ae60', color:'white',
                        border:'none', borderRadius:'7px', padding:'8px',
                        cursor:'pointer', fontSize:'12px', fontWeight:'bold'
                      }}>+ Entrada</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : (
        /* ── Tabla desktop ── */
        <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#1a1a2e', color:'white' }}>
                  {['ID','CATEGORÍA','MATERIA PRIMA','STOCK (kg)','MÍNIMO (kg)','$/KG','ESTADO','ACCIONES']
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
                {inventarioFiltrado.map((mp, i) => {
                  const badge = badgeStock(mp.estado_stock);
                  return (
                    <tr key={mp.id} style={{
                      background: i % 2 === 0 ? '#fafafa' : 'white',
                      borderBottom:'1px solid #f0f0f0'
                    }}>
                      <td style={{
                        padding:'9px 10px', color:'#555',
                        fontWeight:'bold', fontSize:'11px'
                      }}>{mp.id}</td>

                      <td style={{ padding:'9px 10px' }}>
                        <span style={{
                          background:'#e8f4fd', color:'#1a5276',
                          padding:'2px 7px', borderRadius:'8px',
                          fontSize:'10px', fontWeight:'bold'
                        }}>{mp.categoria}</span>
                      </td>

                      <td style={{
                        padding:'9px 10px',
                        fontWeight:'bold', color:'#1a1a2e'
                      }}>{mp.nombre_producto || mp.nombre}</td>

                      <td style={{ padding:'9px 10px', textAlign:'center' }}>
                        <StockInput
                          mp={mp}
                          onSave={guardarStockInicial}
                          disabled={!puedeEditar}
                        />
                      </td>

                      <td style={{ padding:'9px 10px', textAlign:'center' }}>
                        <div style={{
                          display:'flex', alignItems:'center',
                          gap:4, justifyContent:'center'
                        }}>
                          <span style={{ fontWeight:'bold', color:'#555' }}>
                            {mp.stock_minimo_kg}
                          </span>
                          {puedeEditar && (
                            <button
                              onClick={() => { setModalMinimo(mp); setMinimoKg(mp.stock_minimo_kg); }}
                              style={{
                                background:'none', border:'none',
                                cursor:'pointer', fontSize:'11px', color:'#3498db'
                              }}>✏️</button>
                          )}
                        </div>
                      </td>

                      <td style={{
                        padding:'9px 10px', textAlign:'right',
                        color:'#27ae60', fontWeight:'bold'
                      }}>${parseFloat(mp.precio_kg || 0).toFixed(2)}</td>

                      <td style={{ padding:'9px 10px' }}>
                        <span style={{
                          background:badge.bg, color:badge.color,
                          padding:'3px 9px', borderRadius:'10px',
                          fontSize:'10px', fontWeight:'700'
                        }}>{badge.txt}</span>
                      </td>

                      <td style={{ padding:'9px 10px' }}>
                        {puedeEditar && (
                          <button
                            onClick={() => {
                              setModalEntrada({ inv:mp });
                              setEntradaKg('');
                              setEntradaPrecio('');
                              setEntradaNota('');
                            }}
                            style={{
                              background:'#27ae60', color:'white',
                              border:'none', borderRadius:'6px',
                              padding:'5px 12px', cursor:'pointer',
                              fontSize:'11px', fontWeight:'bold'
                            }}>+ Entrada</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {inventarioFiltrado.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{
                      textAlign:'center', padding:'40px', color:'#aaa'
                    }}>No se encontraron registros</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}