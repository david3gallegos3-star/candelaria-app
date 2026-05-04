// ============================================
// MenuFormulas.js
// Pantalla menú de fórmulas — grid de productos
// ============================================
import React, { useRef, useState, useEffect } from 'react';
import Campana   from '../../components/Campana';
import GeminiChat from '../../GeminiChat';
import ModalNuevoProducto from './ModalNuevoProducto';
import ModalGestionar     from './ModalGestionar';
import { supabase } from '../../supabase';

const EMOJIS_CAT = {};
const LABEL_CAT = { 'CORTES': 'CORTES DE RES' };

export default function MenuFormulas({
  // auth
  userRol, logout,
  // navegación
  navegarA,
  // productos
  productos, categoriasConfig, EMOJIS_CAT: emojisExterno,
  abrirProducto,
  // modal nuevo
  modalNuevo, setModalNuevo,
  nuevoNombre, setNuevoNombre,
  nuevaCategoria, setNuevaCategoria,
  nuevoMpVinculado, setNuevoMpVinculado,
  crearProducto,
  // modal gestionar
  modalGestionar, setModalGestionar,
  tabGestionar, setTabGestionar,
  editando, setEditando,
  guardarEdicionProducto,
  eliminarProducto,
  moverCategoria,
  categoriasProtegidas,
  // categorías
  editandoCat, setEditandoCat,
  guardarEdicionCategoria,
  eliminarCategoria,
  modalNuevaCat, setModalNuevaCat,
  nuevaCatNombre, setNuevaCatNombre,
  nuevaCatEmoji, setNuevaCatEmoji,
  crearCategoria,
  confirmElimCat, setConfirmElimCat,
  confirmarElimCategoria,
  // campana
  notificaciones, notifNoLeidas,
  campanAbierta, setCampanaAbierta,
  cargarNotificaciones,
  // importar
  importando, progreso,
  importarProductosExcel,
  // misc
  msgExito,
  onVolverMenu,
  cargarCategorias,
}) {

  const fileRefProductos = useRef();
  // EMOJIS_CAT viene del padre como prop
  const EC = emojisExterno || EMOJIS_CAT;

  // Productos que tienen al menos una formulación guardada
  const [conFormula, setConFormula] = useState(new Set());

  // Relaciones padre/hijo desde deshuese_config
  const [padreDeHijo, setPadreDeHijo] = useState({});  // { hijoNombre: padreNombre }
  const [hijosDelPadre, setHijosDelPadre] = useState({}); // { padreNombre: [hijoNombre] }

  // Búsqueda
  const [busqueda, setBusqueda] = useState('');

  // Categorías + productos filtrados por búsqueda
  const bNorm = busqueda.toLowerCase().trim();
  const categoriasFiltradas = Object.entries(categoriasConfig)
    .map(([cat, prods]) => {
      if (!bNorm) return { cat, prods };
      const catCoincide = (LABEL_CAT[cat] || cat).toLowerCase().includes(bNorm);
      // Si la categoría coincide, mostrar todos sus productos; si no, filtrar productos
      return {
        cat,
        prods: catCoincide ? prods : prods.filter(n => n.toLowerCase().includes(bNorm))
      };
    })
    .filter(({ prods }) => prods.length > 0);

  useEffect(() => {
    supabase
      .from('formulaciones')
      .select('producto_nombre')
      .then(({ data }) => {
        const nombres = new Set((data || []).map(f => f.producto_nombre).filter(Boolean));
        setConFormula(nombres);
      });
  }, [productos]);

  useEffect(() => {
    supabase.from('deshuese_config').select('corte_padre,corte_hijo').eq('activo', true)
      .then(({ data }) => {
        const pdDe = {}, hijosDe = {};
        (data || []).forEach(({ corte_padre, corte_hijo }) => {
          if (!corte_padre || !corte_hijo) return;
          pdDe[corte_hijo] = corte_padre;
          if (!hijosDe[corte_padre]) hijosDe[corte_padre] = [];
          if (!hijosDe[corte_padre].includes(corte_hijo)) hijosDe[corte_padre].push(corte_hijo);
        });
        setPadreDeHijo(pdDe);
        setHijosDelPadre(hijosDe);
      });
  }, [productos]);

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial,sans-serif' }}>

      {/* ── Sticky top: header + botones ── */}
      <div style={{ position:'sticky', top:0, zIndex:200 }}>

      {/* Header */}
      <div style={{
        background:'linear-gradient(135deg,#1a1a2e,#16213e)',
        padding:'12px 16px', boxShadow:'0 2px 10px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:8
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={onVolverMenu} style={{
              background:'rgba(255,200,0,0.25)',
              border:'1px solid rgba(255,200,0,0.4)',
              color:'#ffd700', padding:'7px 12px',
              borderRadius:'8px', cursor:'pointer',
              fontSize:'12px', fontWeight:'bold'
            }}>🏠 Menú</button>
            <img
              src="/LOGO_CANDELARIA_1.png"
              alt="Candelaria"
              style={{
                height:'42px', background:'white',
                padding:'4px 10px', borderRadius:'8px'
              }}
            />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Campana
              userRol={userRol}
              notificaciones={notificaciones}
              notifNoLeidas={notifNoLeidas}
              campanAbierta={campanAbierta}
              setCampanaAbierta={setCampanaAbierta}
              cargarNotificaciones={cargarNotificaciones}
              productos={productos}
              abrirProducto={abrirProducto}
              navegarA={navegarA}
            />
            <button onClick={logout} style={{
              padding:'7px 12px', background:'#e74c3c', color:'white',
              border:'none', borderRadius:'8px',
              cursor:'pointer', fontSize:'12px', fontWeight:'bold'
            }}>Salir</button>
          </div>
        </div>

        {/* Tabs admin */}
        {userRol?.rol === 'admin' && (
          <div style={{
            display:'flex', overflowX:'auto', gap:2,
            borderTop:'1px solid rgba(255,255,255,0.15)',
            marginTop:6, paddingTop:4
          }}>
            {[
              ['💰 Precios',   () => navegarA('resumen'),  '#f1c40f', 'rgba(241,196,15,0.18)'  ],
              ['⚙️ MOD+CIF',  () => navegarA('modcif'),   '#4fc3f7', 'rgba(79,195,247,0.14)'  ],
              ['📦 Materias', () => navegarA('materias'), '#2ecc71', 'rgba(46,204,113,0.16)'  ],
              ['📋 Historial',() => navegarA('historial'),'#a29bfe', 'rgba(162,155,254,0.16)' ],
            ].map(([label, fn, color, bgColor]) => (
              <button key={label} onClick={fn}
                style={{
                  padding:'9px 18px', background:bgColor,
                  color: color, border:'none',
                  borderBottom:`3px solid ${color}`,
                  borderRadius:'8px 8px 0 0',
                  cursor:'pointer', fontSize:'13px', fontWeight:'bold',
                  whiteSpace:'nowrap', flexShrink:0, transition:'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity='0.9'; e.currentTarget.style.transform='translateY(0)'; }}
              >{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Barra de botones admin — dentro del sticky */}
      {userRol?.rol === 'admin' && (
        <div style={{
          background:'#f0f2f5', borderBottom:'2px solid #dde3ea',
          padding:'8px 16px', display:'flex', gap:8,
          flexWrap:'wrap', alignItems:'center',
          boxShadow:'0 2px 6px rgba(0,0,0,0.07)'
        }}>
          <button
            onClick={() => fileRefProductos.current.click()}
            disabled={importando}
            style={{
              padding:'8px 14px', background:'#8e44ad', color:'white',
              border:'none', borderRadius:8, cursor:'pointer',
              fontSize:'13px', fontWeight:'bold'
            }}
          >📤 Importar Excel</button>
          <input
            ref={fileRefProductos}
            type="file"
            accept=".xlsx,.xlsm"
            style={{ display:'none' }}
            onChange={importarProductosExcel}
          />

          <button onClick={() => setModalNuevo(true)} style={{
            padding:'8px 14px', background:'#27ae60', color:'white',
            border:'none', borderRadius:8, cursor:'pointer',
            fontSize:'13px', fontWeight:'bold'
          }}>➕ Nuevo producto</button>

          <button onClick={() => { setModalGestionar(true); setTabGestionar('productos'); }} style={{
            padding:'8px 14px', background:'#2980b9', color:'white',
            border:'none', borderRadius:8, cursor:'pointer',
            fontSize:'13px', fontWeight:'bold'
          }}>⚙️ Gestionar</button>

          <div style={{
            marginLeft:'auto', background:'white',
            padding:'8px 14px', borderRadius:8,
            fontSize:'13px', color:'#555',
            boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
          }}>
            <strong>{productos.length}</strong> prods ·{' '}
            <strong>{Object.keys(categoriasConfig).length}</strong> cats
          </div>
        </div>
      )}

      {/* ── Barra búsqueda ── */}
      <div style={{
        background:'white', borderBottom:'2px solid #e8edf2',
        padding:'8px 16px', boxShadow:'0 2px 6px rgba(0,0,0,0.05)'
      }}>
        <div style={{ position:'relative' }}>
          <span style={{
            position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
            fontSize:15, color:'#aaa', pointerEvents:'none'
          }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar fórmula..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width:'100%', padding:'8px 12px 8px 34px',
              borderRadius:8, border:'1.5px solid #dde3ea',
              fontSize:14, outline:'none', boxSizing:'border-box',
              background:'#f8f9fa'
            }}
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              style={{
                position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer',
                fontSize:16, color:'#aaa', padding:0, lineHeight:1
              }}
            >✕</button>
          )}
        </div>
      </div>

      </div>{/* fin sticky */}

      {/* ── Contenido scrollable ── */}
      <div style={{ padding:'12px 16px' }}>

        {msgExito && (
          <div style={{
            background:'#d4edda', color:'#155724',
            padding:'10px 16px', borderRadius:'8px',
            marginBottom:12, fontWeight:'bold', fontSize:'13px'
          }}>{msgExito}</div>
        )}

        {importando && (
          <div style={{
            background:'#cce5ff', color:'#004085',
            padding:'10px 16px', borderRadius:'8px',
            marginBottom:12, fontWeight:'bold', fontSize:'13px'
          }}>⏳ {progreso}</div>
        )}

        {/* ── Grid productos por categoría ── */}
        {busqueda && categoriasFiltradas.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'#aaa', fontSize:14 }}>
            Sin resultados para "<strong>{busqueda}</strong>"
          </div>
        )}
        {categoriasFiltradas.map(({ cat: categoria, prods: nombresProductos }) =>
          nombresProductos.length === 0 ? null : (
            <div key={categoria} id={`cat-${categoria}`} style={{ marginBottom:24, scrollMarginTop:180 }}>
              <div style={{
                display:'flex', alignItems:'center',
                gap:10, marginBottom:12
              }}>
                <span style={{ fontSize:'22px' }}>{EC[categoria]||'📋'}</span>
                <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'18px' }}>{LABEL_CAT[categoria] || categoria}</h3>
                <span style={{
                  background:'#e8f4fd', color:'#1a5276',
                  padding:'3px 10px', borderRadius:12,
                  fontSize:'12px', fontWeight:'bold'
                }}>{nombresProductos.length}</span>
              </div>

              {(() => {
                // Separar en grupos padre+hijo e independientes
                const yaIncluidos = new Set();
                const grupos = [];
                const independientes = [];

                nombresProductos.forEach(nombre => {
                  if (yaIncluidos.has(nombre)) return;
                  if (hijosDelPadre[nombre]) {
                    // Es padre con hijos
                    const hijosEnCat = hijosDelPadre[nombre].filter(h => nombresProductos.includes(h));
                    grupos.push({ padre: nombre, hijos: hijosEnCat });
                    yaIncluidos.add(nombre);
                    hijosEnCat.forEach(h => yaIncluidos.add(h));
                  } else if (!padreDeHijo[nombre]) {
                    // Independiente (no es padre ni hijo)
                    independientes.push(nombre);
                    yaIncluidos.add(nombre);
                  }
                });

                const CardProducto = ({ nombre, esPadre, esHijo }) => {
                  const tieneFormula = conFormula.has(nombre);
                  const borderColor = esPadre ? '#f39c12' : esHijo ? '#8e44ad' : (tieneFormula ? '#aed6f1' : '#fdecea');
                  return (
                    <button
                      onClick={() => abrirProducto(nombre)}
                      style={{
                        padding:'14px 14px', background:'white',
                        border:`2px solid ${borderColor}`,
                        borderRadius:12, cursor:'pointer', textAlign:'left',
                        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', transition:'all 0.2s',
                        width:'100%'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.14)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; }}
                    >
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <span style={{ fontSize:'20px' }}>{EC[categoria]||'📋'}</span>
                        {esPadre && <span style={{ fontSize:10, fontWeight:800, color:'#f39c12', background:'#fef9e7', padding:'2px 7px', borderRadius:6, border:'1px solid #f0c040' }}>👑 PADRE</span>}
                        {esHijo  && <span style={{ fontSize:10, fontWeight:800, color:'#8e44ad', background:'#f5eef8', padding:'2px 7px', borderRadius:6, border:'1px solid #c39bd3' }}>✂️ HIJO</span>}
                      </div>
                      <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'13px', lineHeight:'1.3' }}>{nombre}</div>
                      {esHijo && padreDeHijo[nombre] && (
                        <div style={{ fontSize:10, color:'#8e44ad', marginTop:3 }}>de {padreDeHijo[nombre]}</div>
                      )}
                      <div style={{ fontSize:'11px', color: tieneFormula ? '#27ae60' : '#e74c3c', marginTop:6, fontWeight:'bold' }}>
                        {tieneFormula ? '✅ Con fórmula' : '🔴 Sin fórmula'}
                      </div>
                    </button>
                  );
                };

                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {/* Bloques padre + hijos */}
                    {grupos.map(({ padre, hijos }) => (
                      <div key={padre} style={{
                        background:'linear-gradient(135deg,#1a1a2e,#1e2a45)',
                        borderRadius:16, padding:'14px 16px',
                        border:'1.5px solid #2c3e6e',
                        boxShadow:'0 4px 16px rgba(0,0,0,0.18)'
                      }}>
                        {/* Etiqueta grupo */}
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                          <span style={{ fontSize:11, fontWeight:800, color:'#7fb3d3', textTransform:'uppercase', letterSpacing:1 }}>
                            🔗 Bifurcación
                          </span>
                          <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.1)' }} />
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>
                            1 padre · {hijos.length} {hijos.length === 1 ? 'hijo' : 'hijos'}
                          </span>
                        </div>
                        {/* Cards padre + flecha + hijos */}
                        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                          {/* Padre */}
                          <div style={{ minWidth:160, flex:'0 0 auto' }}>
                            <CardProducto nombre={padre} esPadre esHijo={false} />
                          </div>
                          {/* Flecha */}
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, flex:'0 0 auto' }}>
                            <div style={{ width:32, height:2, background:'linear-gradient(90deg,#f39c12,#8e44ad)', borderRadius:2 }} />
                            <div style={{ fontSize:18, color:'#8e44ad', lineHeight:1 }}>▶</div>
                          </div>
                          {/* Hijos */}
                          <div style={{ display:'flex', gap:10, flexWrap:'wrap', flex:1 }}>
                            {hijos.map(hijo => (
                              <div key={hijo} style={{ minWidth:160, flex:'1 1 160px' }}>
                                <CardProducto nombre={hijo} esPadre={false} esHijo />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Productos independientes en grid normal */}
                    {independientes.length > 0 && (
                      <div style={{
                        display:'grid',
                        gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',
                        gap:12
                      }}>
                        {independientes.map(nombre => (
                          <CardProducto key={nombre} nombre={nombre} esPadre={false} esHijo={false} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )
        )}
      </div>

      {/* ── Modales ── */}
      {modalNuevo && (
        <ModalNuevoProducto
          nuevoNombre={nuevoNombre}               setNuevoNombre={setNuevoNombre}
          nuevaCategoria={nuevaCategoria}         setNuevaCategoria={setNuevaCategoria}
          nuevoMpVinculado={nuevoMpVinculado}     setNuevoMpVinculado={setNuevoMpVinculado}
          categoriasConfig={categoriasConfig}
          onCrear={crearProducto}
          onCerrar={() => { setModalNuevo(false); setNuevoMpVinculado(null); }}
        />
      )}

      <ModalGestionar
        modalGestionar={modalGestionar}     setModalGestionar={setModalGestionar}
        tabGestionar={tabGestionar}         setTabGestionar={setTabGestionar}
        categoriasConfig={categoriasConfig} EMOJIS_CAT={EC}
        editando={editando}                 setEditando={setEditando}
        guardarEdicionProducto={guardarEdicionProducto}
        eliminarProducto={eliminarProducto}
        moverCategoria={moverCategoria}
        productos={productos}
        editandoCat={editandoCat}           setEditandoCat={setEditandoCat}
        guardarEdicionCategoria={guardarEdicionCategoria}
        eliminarCategoria={eliminarCategoria}
        modalNuevaCat={modalNuevaCat}       setModalNuevaCat={setModalNuevaCat}
        nuevaCatNombre={nuevaCatNombre}     setNuevaCatNombre={setNuevaCatNombre}
        nuevaCatEmoji={nuevaCatEmoji}       setNuevaCatEmoji={setNuevaCatEmoji}
        crearCategoria={crearCategoria}
        confirmElimCat={confirmElimCat}     setConfirmElimCat={setConfirmElimCat}
        confirmarElimCategoria={confirmarElimCategoria}
        categoriasProtegidas={categoriasProtegidas}
        cargarCategorias={cargarCategorias}
      />

      <GeminiChat />
    </div>
  );
}