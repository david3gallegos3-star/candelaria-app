// ============================================
// ModalGestionar.js
// Modal gestionar productos/categorías + Eliminados
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const EMOJIS_OPCIONES = [
  '🥓','🌭','🍖','🍔','🥩','🫙','🔀','🧀',
  '🧆','🍗','🥚','🫕','🥘','🍱','🥫','🏷️',
  '📦','⭐','🆕'
];

export default function ModalGestionar({
  modalGestionar, setModalGestionar,
  tabGestionar, setTabGestionar,
  categoriasConfig, EMOJIS_CAT,
  editando, setEditando,
  guardarEdicionProducto,
  eliminarProducto,
  moverCategoria,
  productos,
  editandoCat, setEditandoCat,
  guardarEdicionCategoria,
  eliminarCategoria,
  modalNuevaCat, setModalNuevaCat,
  nuevaCatNombre, setNuevaCatNombre,
  nuevaCatEmoji, setNuevaCatEmoji,
  crearCategoria,
  confirmElimCat, setConfirmElimCat,
  confirmarElimCategoria,
}) {
  const [productosEliminados, setProductosEliminados] = useState([]);
  const [restaurando, setRestaurando] = useState(false);

  useEffect(() => {
    if (modalGestionar) cargarEliminados();
  }, [modalGestionar]);

  async function cargarEliminados() {
    const { data } = await supabase
      .from('productos').select('*')
      .eq('eliminado', true)
      .order('eliminado_at', { ascending: false });
    setProductosEliminados(data || []);
  }

  async function restaurarProducto(prod) {
    if (!window.confirm(`¿Restaurar "${prod.nombre}"?`)) return;
    setRestaurando(true);
    await supabase.from('productos').update({
      eliminado:     false,
      eliminado_at:  null,
      eliminado_por: null,
      estado:        'ACTIVO'
    }).eq('id', prod.id);
    await cargarEliminados();
    setRestaurando(false);
  }

  async function eliminarDefinitivo(prod) {
    if (!window.confirm(
      `⚠️ ELIMINAR PERMANENTEMENTE "${prod.nombre}" y toda su formulación?\n\nEsto NO se puede deshacer.`
    )) return;
    await supabase.from('formulaciones').delete().eq('producto_nombre', prod.nombre);
    await supabase.from('config_productos').delete().eq('producto_nombre', prod.nombre);
    await supabase.from('productos').delete().eq('id', prod.id);
    await cargarEliminados();
  }

  if (!modalGestionar) return null;

  return (
    <>
      {/* ── Modal principal ── */}
      <div style={{
        position:'fixed', top:0, left:0, right:0, bottom:0,
        background:'rgba(0,0,0,0.5)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000
      }}>
        <div style={{
          background:'white', borderRadius:14, width:680,
          maxHeight:'85vh', display:'flex', flexDirection:'column',
          boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
        }}>
          {/* Header */}
          <div style={{
            background:'#1a1a2e', padding:'16px 20px',
            borderRadius:'14px 14px 0 0',
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <h3 style={{ margin:0, color:'white', fontSize:'16px' }}>⚙️ Gestionar</h3>
            <button onClick={() => setModalGestionar(false)} style={{
              background:'rgba(255,255,255,0.15)', border:'none',
              fontSize:'18px', cursor:'pointer', color:'white',
              borderRadius:6, padding:'4px 10px'
            }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{
            display:'flex', borderBottom:'2px solid #f0f0f0', padding:'0 20px'
          }}>
            {[
              ['productos',  '📦 Productos'],
              ['categorias', '🗂️ Categorías'],
              ['eliminados', `🗑️ Eliminados${productosEliminados.length > 0 ? ` (${productosEliminados.length})` : ''}`],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setTabGestionar(key)} style={{
                padding:'12px 20px', border:'none',
                borderBottom: tabGestionar===key ? '3px solid #2980b9' : '3px solid transparent',
                background:'transparent', cursor:'pointer', fontSize:'14px',
                fontWeight: tabGestionar===key ? 'bold' : 'normal',
                color: tabGestionar===key ? '#2980b9' : '#888',
                marginBottom:'-2px', whiteSpace:'nowrap'
              }}>{label}</button>
            ))}
          </div>

          {/* Contenido */}
          <div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>

            {/* ── Tab productos ── */}
            {tabGestionar === 'productos' && (
              <div>
                {Object.entries(categoriasConfig).map(([categoria, nombresProductos]) => (
                  <div key={categoria} style={{ marginBottom:20 }}>
                    <div style={{
                      background:'#1a1a2e', color:'white',
                      padding:'8px 14px', borderRadius:8,
                      fontWeight:'bold', fontSize:'14px',
                      marginBottom:8, display:'flex', alignItems:'center', gap:8
                    }}>
                      <span>{EMOJIS_CAT[categoria]||'📋'}</span>
                      {categoria}
                      <span style={{
                        marginLeft:'auto', background:'rgba(255,255,255,0.15)',
                        padding:'2px 10px', borderRadius:10, fontSize:'12px'
                      }}>{nombresProductos.length}</span>
                    </div>

                    {nombresProductos.length === 0 && (
                      <div style={{
                        padding:'10px 14px', color:'#aaa',
                        fontSize:'13px', fontStyle:'italic'
                      }}>Sin productos</div>
                    )}

                    {nombresProductos.map(nombre => (
                      <div key={nombre} style={{
                        display:'flex', alignItems:'center', gap:8,
                        padding:'8px 10px', background:'#f8f9fa',
                        borderRadius:8, marginBottom:6
                      }}>
                        {editando?.nombre === nombre ? (
                          <>
                            <input
                              value={editando.nuevoNombre}
                              onChange={e => setEditando({...editando, nuevoNombre: e.target.value})}
                              style={{
                                flex:1, padding:6, borderRadius:6,
                                border:'1px solid #3498db', fontSize:'13px'
                              }}
                            />
                            <button onClick={guardarEdicionProducto} style={{
                              padding:'5px 12px', background:'#27ae60', color:'white',
                              border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px'
                            }}>✓</button>
                            <button onClick={() => setEditando(null)} style={{
                              padding:'5px 12px', background:'#95a5a6', color:'white',
                              border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px'
                            }}>✕</button>
                          </>
                        ) : (
                          <>
                            <span style={{
                              flex:1, fontSize:'13px',
                              fontWeight:'bold', color:'#2c3e50'
                            }}>{nombre}</span>
                            <select
                              onChange={e => moverCategoria(nombre, categoria, e.target.value)}
                              value={categoria}
                              style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px' }}
                            >
                              {Object.keys(categoriasConfig).map(c => (
                                <option key={c} value={c}>{EMOJIS_CAT[c]||'📋'} {c}</option>
                              ))}
                            </select>
                            <button onClick={() => setEditando({ nombre, nuevoNombre: nombre })} style={{
                              padding:'5px 10px', background:'#3498db', color:'white',
                              border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px'
                            }}>✏️</button>
                            <button onClick={() => eliminarProducto(nombre)} style={{
                              padding:'5px 10px', background:'#e74c3c', color:'white',
                              border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px'
                            }}>🗑️</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab categorías ── */}
            {tabGestionar === 'categorias' && (
              <div>
                <button onClick={() => setModalNuevaCat(true)} style={{
                  width:'100%', padding:12, background:'#27ae60', color:'white',
                  border:'none', borderRadius:10, cursor:'pointer',
                  fontSize:'14px', fontWeight:'bold', marginBottom:16
                }}>➕ Nueva categoría</button>

                {Object.entries(categoriasConfig).map(([categoria, prods]) => (
                  <div key={categoria} style={{
                    background:'#f8f9fa', border:'1.5px solid #e9ecef',
                    borderRadius:10, padding:'12px 14px', marginBottom:10
                  }}>
                    {editandoCat?.nombre === categoria ? (
                      <div>
                        <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
                          <select
                            value={editandoCat.emoji}
                            onChange={e => setEditandoCat({...editandoCat, emoji: e.target.value})}
                            style={{ padding:7, borderRadius:7, border:'1px solid #ddd', fontSize:'18px', background:'white' }}
                          >
                            {EMOJIS_OPCIONES.map(em => <option key={em} value={em}>{em}</option>)}
                          </select>
                          <input
                            value={editandoCat.nuevoNombre}
                            onChange={e => setEditandoCat({...editandoCat, nuevoNombre: e.target.value})}
                            style={{
                              flex:1, padding:'8px 12px', borderRadius:7,
                              border:'1.5px solid #3498db', fontSize:'14px',
                              fontWeight:'bold', textTransform:'uppercase'
                            }}
                          />
                        </div>
                        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                          <button onClick={() => setEditandoCat(null)} style={{
                            padding:'7px 16px', background:'#95a5a6', color:'white',
                            border:'none', borderRadius:7, cursor:'pointer', fontSize:'13px'
                          }}>Cancelar</button>
                          <button onClick={guardarEdicionCategoria} style={{
                            padding:'7px 16px', background:'#27ae60', color:'white',
                            border:'none', borderRadius:7, cursor:'pointer',
                            fontSize:'13px', fontWeight:'bold'
                          }}>✓ Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:'22px' }}>{EMOJIS_CAT[categoria]||'📋'}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:'bold', fontSize:'14px', color:'#1a1a2e' }}>
                            {categoria}
                          </div>
                          <div style={{ fontSize:'12px', color:'#888' }}>
                            {prods.length} producto{prods.length!==1?'s':''}
                          </div>
                        </div>
                        <button onClick={() => setEditandoCat({
                          nombre: categoria, nuevoNombre: categoria,
                          emoji: EMOJIS_CAT[categoria]||'📦'
                        })} style={{
                          padding:'6px 12px', background:'#3498db', color:'white',
                          border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px'
                        }}>✏️ Editar</button>
                        <button onClick={() => eliminarCategoria(categoria)} style={{
                          padding:'6px 12px', background:'#e74c3c', color:'white',
                          border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px'
                        }}>🗑️</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab eliminados ── */}
            {tabGestionar === 'eliminados' && (
              <div>
                <div style={{
                  background:'#fff3cd', border:'1px solid #ffc107',
                  borderRadius:'10px', padding:'12px 16px',
                  marginBottom:'14px',
                  display:'flex', alignItems:'center', gap:10
                }}>
                  <span style={{ fontSize:'20px' }}>♻️</span>
                  <div>
                    <div style={{ fontWeight:'bold', color:'#856404', fontSize:'13px' }}>
                      Productos eliminados
                    </div>
                    <div style={{ fontSize:'12px', color:'#856404' }}>
                      Sus fórmulas se conservan — puedes restaurarlos cuando quieras
                    </div>
                  </div>
                </div>

                {productosEliminados.length === 0 ? (
                  <div style={{
                    textAlign:'center', padding:'40px', color:'#aaa'
                  }}>
                    <div style={{ fontSize:'40px', marginBottom:'10px' }}>✅</div>
                    <div>No hay productos eliminados</div>
                  </div>
                ) : (
                  productosEliminados.map((prod, i) => (
                    <div key={prod.id} style={{
                      background: i%2===0 ? '#fff5f5' : 'white',
                      border:'1.5px solid #f5c6c6',
                      borderRadius:10, padding:'12px 14px',
                      marginBottom:8,
                      display:'flex', alignItems:'center', gap:10
                    }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'13px' }}>
                          {prod.nombre}
                        </div>
                        <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>
                          {prod.categoria} · Eliminado por: {prod.eliminado_por || '—'} ·{' '}
                          {prod.eliminado_at
                            ? new Date(prod.eliminado_at).toLocaleString('es-EC', {
                                day:'2-digit', month:'2-digit', year:'numeric',
                                hour:'2-digit', minute:'2-digit'
                              })
                            : '—'}
                        </div>
                      </div>

                      <button
                        onClick={() => restaurarProducto(prod)}
                        disabled={restaurando}
                        style={{
                          padding:'6px 14px', background:'#27ae60',
                          color:'white', border:'none', borderRadius:7,
                          cursor:'pointer', fontSize:'12px', fontWeight:'bold'
                        }}>♻️ Restaurar</button>

                      <button
                        onClick={() => eliminarDefinitivo(prod)}
                        style={{
                          padding:'6px 12px', background:'#e74c3c',
                          color:'white', border:'none', borderRadius:7,
                          cursor:'pointer', fontSize:'12px'
                        }}>🗑️ Borrar</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal nueva categoría ── */}
      {modalNuevaCat && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000
        }}>
          <div style={{
            background:'white', padding:28, borderRadius:14,
            width:400, boxShadow:'0 20px 60px rgba(0,0,0,0.35)'
          }}>
            <h3 style={{ margin:'0 0 20px', color:'#1a1a2e' }}>🗂️ Nueva Categoría</h3>
            <label style={{
              fontSize:'13px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:6
            }}>Emoji</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
              {EMOJIS_OPCIONES.map(em => (
                <button key={em} onClick={() => setNuevaCatEmoji(em)} style={{
                  fontSize:'22px', padding:6, borderRadius:8,
                  border: nuevaCatEmoji===em ? '2.5px solid #27ae60' : '2px solid #eee',
                  background: nuevaCatEmoji===em ? '#e8f5e9' : 'white',
                  cursor:'pointer'
                }}>{em}</button>
              ))}
            </div>
            <label style={{
              fontSize:'13px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:6
            }}>Nombre</label>
            <input
              value={nuevaCatNombre}
              onChange={e => setNuevaCatNombre(e.target.value.toUpperCase())}
              placeholder="Ej: AHUMADOS"
              style={{
                width:'100%', padding:11, borderRadius:8,
                border:'1.5px solid #ddd', fontSize:'15px',
                fontWeight:'bold', boxSizing:'border-box'
              }}
            />
            <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
              <button onClick={() => {
                setModalNuevaCat(false);
                setNuevaCatNombre('');
                setNuevaCatEmoji('📦');
              }} style={{
                padding:'10px 20px', background:'#95a5a6', color:'white',
                border:'none', borderRadius:8, cursor:'pointer'
              }}>Cancelar</button>
              <button onClick={crearCategoria} style={{
                padding:'10px 20px', background:'#27ae60', color:'white',
                border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold'
              }}>{nuevaCatEmoji} Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmar eliminar categoría ── */}
      {confirmElimCat && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000
        }}>
          <div style={{
            background:'white', padding:28, borderRadius:14,
            width:440, boxShadow:'0 20px 60px rgba(0,0,0,0.35)'
          }}>
            <div style={{ fontSize:36, textAlign:'center', marginBottom:12 }}>⚠️</div>
            <h3 style={{ margin:'0 0 10px', color:'#c0392b', textAlign:'center' }}>
              Categoría con productos
            </h3>
            <p style={{ color:'#555', fontSize:'14px', textAlign:'center', marginBottom:20 }}>
              La categoría <strong>"{confirmElimCat}"</strong> tiene{' '}
              {(categoriasConfig[confirmElimCat]||[]).length} producto(s).<br/>
              ¿Qué deseas hacer?
            </p>
            <label style={{
              fontSize:'13px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:6
            }}>Mover productos a:</label>
            <select id="catDestino" style={{
              width:'100%', padding:10, borderRadius:8,
              border:'1px solid #ddd', fontSize:'14px', marginBottom:20
            }}>
              {Object.keys(categoriasConfig)
                .filter(c => c !== confirmElimCat)
                .map(c => (
                  <option key={c} value={c}>{EMOJIS_CAT[c]||'📋'} {c}</option>
                ))
              }
            </select>
            <div style={{ display:'flex', gap:10, flexDirection:'column' }}>
              <button onClick={() => {
                const sel = document.getElementById('catDestino').value;
                confirmarElimCategoria(sel);
              }} style={{
                padding:11, background:'#e67e22', color:'white',
                border:'none', borderRadius:8, cursor:'pointer',
                fontWeight:'bold', fontSize:'14px'
              }}>Mover y eliminar categoría</button>
              <button onClick={() => confirmarElimCategoria(null)} style={{
                padding:11, background:'#e74c3c', color:'white',
                border:'none', borderRadius:8, cursor:'pointer',
                fontWeight:'bold', fontSize:'14px'
              }}>Eliminar categoría y productos</button>
              <button onClick={() => setConfirmElimCat(null)} style={{
                padding:11, background:'#95a5a6', color:'white',
                border:'none', borderRadius:8, cursor:'pointer', fontSize:'14px'
              }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}