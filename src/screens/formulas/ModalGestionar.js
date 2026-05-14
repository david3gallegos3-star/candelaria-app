// ============================================
// ModalGestionar.js
// Modal gestionar productos/categorías + Eliminados
// ============================================
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';

const BUCKET = 'iconos-categorias';

const EMOJIS_OPCIONES = [
  '🥓','🌭','🍖','🍔','🥩','🫙','🔀','🧀',
  '🧆','🍗','🥚','🫕','🥘','🍱','🥫','🏷️',
  '📦','⭐','🆕'
];

// Renderiza un ícono que puede ser emoji unicode o URL de imagen
function IconoCat({ valor, size = 22 }) {
  if (!valor) return <span style={{ fontSize: size }}>📋</span>;
  if (valor.startsWith('http')) {
    return <img src={valor} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 4, display: 'block' }} />;
  }
  return <span style={{ fontSize: size }}>{valor}</span>;
}

async function subirIcono(file, onUrl) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const name = `cat_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, file, { upsert: true });
  if (error) { alert('Error subiendo imagen: ' + error.message); return; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
  onUrl(data.publicUrl);
}

// Selector de ícono reutilizable (emojis + imágenes subidas)
function SelectorIcono({ valor, onChange, onDeleteImagen, imagenesSubidas, subiendoIcono, fileRef, onFileChange }) {
  return (
    <div>
      {/* Preview */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <div style={{ width:44, height:44, borderRadius:10, border:'2px solid #3498db', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f9fa' }}>
          <IconoCat valor={valor} size={28} />
        </div>
        <span style={{ fontSize:12, color:'#888' }}>Ícono seleccionado</span>
      </div>

      {/* Emojis predefinidos */}
      <div style={{ fontSize:11, color:'#aaa', marginBottom:5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Emojis</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
        {EMOJIS_OPCIONES.map(em => (
          <button key={em} onClick={() => onChange(em)} style={{
            fontSize:'20px', padding:5, borderRadius:7, cursor:'pointer',
            border: valor===em ? '2.5px solid #3498db' : '2px solid #eee',
            background: valor===em ? '#ebf5fb' : 'white',
          }}>{em}</button>
        ))}
      </div>

      {/* Imágenes subidas */}
      {imagenesSubidas.length > 0 && (
        <>
          <div style={{ fontSize:11, color:'#aaa', marginBottom:5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Mis imágenes</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
            {imagenesSubidas.map(url => (
              <div key={url} style={{ position:'relative', display:'inline-flex' }}>
                <button onClick={() => onChange(url)} style={{
                  width:46, height:46, padding:4, borderRadius:8, cursor:'pointer',
                  border: valor===url ? '2.5px solid #3498db' : '2px solid #eee',
                  background: valor===url ? '#ebf5fb' : 'white',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <img src={url} alt="" style={{ width:34, height:34, objectFit:'contain', borderRadius:4 }} />
                </button>
                {onDeleteImagen && (
                  <button onClick={e => { e.stopPropagation(); onDeleteImagen(url); }} style={{
                    position:'absolute', top:-6, right:-6,
                    width:16, height:16, borderRadius:'50%',
                    background:'#e74c3c', color:'white', border:'none',
                    cursor:'pointer', fontSize:'9px', fontWeight:'bold',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    lineHeight:1, padding:0,
                  }}>✕</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Subir nueva imagen */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onFileChange} />
      <button onClick={() => fileRef.current.click()} disabled={subiendoIcono} style={{
        padding:'7px 14px', background: subiendoIcono ? '#ccc' : '#8e44ad', color:'white',
        border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px', fontWeight:600
      }}>
        {subiendoIcono ? '⏳ Subiendo...' : '🖼️ Subir imagen nueva'}
      </button>
    </div>
  );
}

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
  cargarCategorias,
  categoriasProtegidas = [],
}) {
  const [productosEliminados, setProductosEliminados] = useState([]);
  const [restaurando,         setRestaurando]         = useState(false);
  const [subiendoIcono,       setSubiendoIcono]       = useState(false);
  const [imagenesSubidas,     setImagenesSubidas]     = useState([]);
  const fileEditRef  = useRef();
  const fileNuevoRef = useRef();

  useEffect(() => {
    if (modalGestionar) {
      cargarEliminados();
      cargarImagenesSubidas();
    }
  }, [modalGestionar]);

  async function eliminarImagen(url) {
    const nombre = url.split('/').pop();
    if (!window.confirm(`¿Eliminar la imagen "${nombre}"?`)) return;
    await supabase.storage.from(BUCKET).remove([nombre]);
    setImagenesSubidas(prev => prev.filter(u => u !== url));
  }

  async function cargarImagenesSubidas() {
    const { data } = await supabase.storage.from(BUCKET).list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
    if (!data) return;
    const urls = data
      .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
      .map(f => supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl);
    setImagenesSubidas(urls);
  }

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
    await cargarCategorias();    // ← agrega esto
    setTabGestionar('productos'); // ← va al tab productos
    setRestaurando(false);
  }

  async function eliminarDefinitivo(prod) {
    if (!window.confirm(
      `⚠️ ELIMINAR PERMANENTEMENTE "${prod.nombre}" y toda su formulación?\n\nEsto NO se puede deshacer.`
    )) return;
    // Limpieza case-insensitive de vista_horneado_config
    const nombreLow = prod.nombre.toLowerCase().trim();
    const w1 = nombreLow.split(/\s+/)[0];
    if (w1) {
      const { data: vhcRows } = await supabase.from('vista_horneado_config')
        .select('producto_nombre').ilike('producto_nombre', `%${w1}%`);
      const matches = (vhcRows || [])
        .filter(r => (r.producto_nombre || '').toLowerCase().trim() === nombreLow)
        .map(r => r.producto_nombre);
      for (const n of matches) {
        await supabase.from('vista_horneado_config').delete().eq('producto_nombre', n);
      }
    }
    await Promise.all([
      supabase.from('formulaciones').delete().eq('producto_nombre', prod.nombre),
      supabase.from('config_productos').delete().eq('producto_nombre', prod.nombre),
      supabase.from('deshuese_config').delete().eq('corte_padre', prod.nombre),
      supabase.from('deshuese_config').delete().eq('corte_hijo', prod.nombre),
      supabase.from('historial_general').delete().eq('producto_nombre', prod.nombre),
    ]);
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
                {Object.entries(categoriasConfig).map(([categoria, nombresProductos]) => {
                  const esProtegida = categoriasProtegidas.includes(categoria);
                  return (
                  <div key={categoria} style={{ marginBottom:20 }}>
                    <div style={{
                      background: esProtegida ? '#1a3a5c' : '#1a1a2e', color:'white',
                      padding:'8px 14px', borderRadius:8,
                      fontWeight:'bold', fontSize:'14px',
                      marginBottom:8, display:'flex', alignItems:'center', gap:8
                    }}>
                      <IconoCat valor={EMOJIS_CAT[categoria]} size={20} />
                      {categoria}
                      {esProtegida && (
                        <span style={{ fontSize:'11px', background:'rgba(255,200,0,0.25)', color:'#ffd700', padding:'2px 8px', borderRadius:8 }}>
                          🔒 Protegida
                        </span>
                      )}
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
                            {!esProtegida && (
                              <select
                                onChange={e => moverCategoria(nombre, categoria, e.target.value)}
                                value={categoria}
                                style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px' }}
                              >
                                {Object.keys(categoriasConfig).map(c => (
                                  <option key={c} value={c}>{(EMOJIS_CAT[c] && !EMOJIS_CAT[c].startsWith('http')) ? EMOJIS_CAT[c] + ' ' : ''}{c}</option>
                                ))}
                              </select>
                            )}
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
                  );
                })}
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

                {Object.entries(categoriasConfig).map(([categoria, prods]) => {
                  const esProtCat = categoriasProtegidas.includes(categoria);
                  return (
                  <div key={categoria} style={{
                    background:'#f8f9fa', border:`1.5px solid ${esProtCat ? '#ffc107' : '#e9ecef'}`,
                    borderRadius:10, padding:'12px 14px', marginBottom:10
                  }}>
                    {editandoCat?.nombre === categoria ? (
                      <div>
                        <div style={{ marginBottom:10 }}>
                          <SelectorIcono
                            valor={editandoCat.emoji}
                            onChange={v => setEditandoCat({...editandoCat, emoji: v})}
                            onDeleteImagen={eliminarImagen}
                            imagenesSubidas={imagenesSubidas}
                            subiendoIcono={subiendoIcono}
                            fileRef={fileEditRef}
                            onFileChange={async e => {
                              const f = e.target.files[0]; if (!f) return;
                              setSubiendoIcono(true);
                              await subirIcono(f, url => {
                                setEditandoCat(prev => ({...prev, emoji: url}));
                                setImagenesSubidas(prev => [url, ...prev]);
                              });
                              setSubiendoIcono(false);
                              e.target.value = '';
                            }}
                          />
                          {!categoriasProtegidas.includes(editandoCat.nombre) && (
                            <input
                              value={editandoCat.nuevoNombre}
                              onChange={e => setEditandoCat({...editandoCat, nuevoNombre: e.target.value})}
                              style={{
                                width:'100%', marginTop:12, padding:'8px 12px', borderRadius:7,
                                border:'1.5px solid #3498db', fontSize:'14px',
                                fontWeight:'bold', textTransform:'uppercase', boxSizing:'border-box'
                              }}
                            />
                          )}
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
                        <IconoCat valor={EMOJIS_CAT[categoria]} size={26} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:'bold', fontSize:'14px', color:'#1a1a2e' }}>
                            {categoria}
                          </div>
                          <div style={{ fontSize:'12px', color:'#888' }}>
                            {prods.length} producto{prods.length!==1?'s':''}
                          </div>
                        </div>
                        {esProtCat && (
                          <span style={{ fontSize:'11px', color:'#856404', background:'#fff3cd', padding:'3px 8px', borderRadius:6 }}>🔒 Protegida</span>
                        )}
                        {esProtCat && (
                          <button onClick={() => setEditandoCat({
                            nombre: categoria, nuevoNombre: categoria,
                            emoji: EMOJIS_CAT[categoria]||'📦'
                          })} style={{
                            padding:'6px 12px', background:'#8e44ad', color:'white',
                            border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px'
                          }}>🖼️ Ícono</button>
                        )}
                        {!esProtCat && (
                          <button onClick={() => setEditandoCat({
                            nombre: categoria, nuevoNombre: categoria,
                            emoji: EMOJIS_CAT[categoria]||'📦'
                          })} style={{
                            padding:'6px 12px', background:'#3498db', color:'white',
                            border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px'
                          }}>✏️ Editar</button>
                        )}
                        {!esProtCat && (
                          <button onClick={() => eliminarCategoria(categoria)} style={{
                            padding:'6px 12px', background:'#e74c3c', color:'white',
                            border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px'
                          }}>🗑️</button>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
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
            <label style={{ fontSize:'13px', fontWeight:'bold', color:'#555', display:'block', marginBottom:8 }}>Ícono</label>
            <SelectorIcono
              valor={nuevaCatEmoji}
              onChange={setNuevaCatEmoji}
              onDeleteImagen={eliminarImagen}
              imagenesSubidas={imagenesSubidas}
              subiendoIcono={subiendoIcono}
              fileRef={fileNuevoRef}
              onFileChange={async e => {
                const f = e.target.files[0]; if (!f) return;
                setSubiendoIcono(true);
                await subirIcono(f, url => {
                  setNuevaCatEmoji(url);
                  setImagenesSubidas(prev => [url, ...prev]);
                });
                setSubiendoIcono(false);
                e.target.value = '';
              }}
            />
            <div style={{ marginBottom:16 }} />
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
                  <option key={c} value={c}>{(EMOJIS_CAT[c] && !EMOJIS_CAT[c].startsWith('http')) ? EMOJIS_CAT[c] + ' ' : ''}{c}</option>
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