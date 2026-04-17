// ============================================
// MenuFormulas.js
// Pantalla menú de fórmulas — grid de productos
// ============================================
import React, { useRef } from 'react';
import Campana   from '../../components/Campana';
import GeminiChat from '../../GeminiChat';
import ModalNuevoProducto from './ModalNuevoProducto';
import ModalGestionar     from './ModalGestionar';

const EMOJIS_CAT = {};

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
  crearProducto,
  // modal gestionar
  modalGestionar, setModalGestionar,
  tabGestionar, setTabGestionar,
  editando, setEditando,
  guardarEdicionProducto,
  eliminarProducto,
  moverCategoria,
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
}) {

  const fileRefProductos = useRef();
  // EMOJIS_CAT viene del padre como prop
  const EC = emojisExterno || EMOJIS_CAT;

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial,sans-serif' }}>

      {/* ── Header ── */}
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
            display:'flex', overflowX:'auto',
            borderTop:'1px solid rgba(255,255,255,0.12)',
            marginTop:8, paddingTop:0, gap:0
          }}>
            {[
              ['💰 Precios',   () => navegarA('resumen')  ],
              ['⚙️ MOD+CIF',  () => navegarA('modcif')   ],
              ['📦 Materias', () => navegarA('materias') ],
              ['📋 Historial',() => navegarA('historial')],
            ].map(([label, fn]) => (
              <button key={label} onClick={fn} style={{
                padding:'10px 16px',
                background:'transparent', color:'rgba(255,255,255,0.7)',
                border:'none', borderBottom:'3px solid transparent',
                cursor:'pointer', fontSize:'13px', fontWeight:'bold',
                whiteSpace:'nowrap', flexShrink:0,
                transition:'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.borderBottomColor = '#4fc3f7';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                e.currentTarget.style.borderBottomColor = 'transparent';
                e.currentTarget.style.background = 'transparent';
              }}
              >{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Contenido ── */}
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

        {/* Botones admin */}
        {userRol?.rol === 'admin' && (
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            <button
              onClick={() => fileRefProductos.current.click()}
              disabled={importando}
              style={{
                padding:'9px 14px', background:'#8e44ad', color:'white',
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
              padding:'9px 14px', background:'#27ae60', color:'white',
              border:'none', borderRadius:8, cursor:'pointer',
              fontSize:'13px', fontWeight:'bold'
            }}>➕ Nuevo producto</button>

            <button onClick={() => { setModalGestionar(true); setTabGestionar('productos'); }} style={{
              padding:'9px 14px', background:'#2980b9', color:'white',
              border:'none', borderRadius:8, cursor:'pointer',
              fontSize:'13px', fontWeight:'bold'
            }}>⚙️ Gestionar</button>

            <div style={{
              marginLeft:'auto', background:'white',
              padding:'9px 14px', borderRadius:8,
              fontSize:'13px', color:'#555',
              boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
            }}>
              <strong>{productos.length}</strong> prods ·{' '}
              <strong>{Object.keys(categoriasConfig).length}</strong> cats
            </div>
          </div>
        )}

        {/* ── Grid productos por categoría ── */}
        {Object.entries(categoriasConfig).map(([categoria, nombresProductos]) =>
          nombresProductos.length === 0 ? null : (
            <div key={categoria} style={{ marginBottom:24 }}>
              <div style={{
                display:'flex', alignItems:'center',
                gap:10, marginBottom:12
              }}>
                <span style={{ fontSize:'22px' }}>{EC[categoria]||'📋'}</span>
                <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'18px' }}>{categoria}</h3>
                <span style={{
                  background:'#e8f4fd', color:'#1a5276',
                  padding:'3px 10px', borderRadius:12,
                  fontSize:'12px', fontWeight:'bold'
                }}>{nombresProductos.length}</span>
              </div>

              <div style={{
                display:'grid',
                gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',
                gap:12
              }}>
                {nombresProductos.map(nombre => {
                  const existe = productos.find(p => p.nombre === nombre);
                  return (
                    <button
                      key={nombre}
                      onClick={() => abrirProducto(nombre)}
                      style={{
                        padding:'16px 14px',
                        background: existe ? 'white' : '#fff9e6',
                        border: existe ? '2px solid #e8f4fd' : '2px dashed #f39c12',
                        borderRadius:12, cursor:'pointer', textAlign:'left',
                        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', transition:'all 0.2s'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                      }}
                    >
                      <div style={{ fontSize:'20px', marginBottom:6 }}>
                        {EC[categoria]||'📋'}
                      </div>
                      <div style={{
                        fontWeight:'bold', color:'#1a1a2e',
                        fontSize:'13px', lineHeight:'1.3'
                      }}>{nombre}</div>
                      <div style={{
                        fontSize:'11px',
                        color: existe ? '#27ae60' : '#f39c12',
                        marginTop:6, fontWeight:'bold'
                      }}>
                        {existe ? '✅ Con fórmula' : '⚠️ Sin datos aún'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Modales ── */}
      {modalNuevo && (
        <ModalNuevoProducto
          nuevoNombre={nuevoNombre}         setNuevoNombre={setNuevoNombre}
          nuevaCategoria={nuevaCategoria}   setNuevaCategoria={setNuevaCategoria}
          categoriasConfig={categoriasConfig}
          onCrear={crearProducto}
          onCerrar={() => setModalNuevo(false)}
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
      />

      <GeminiChat />
    </div>
  );
}