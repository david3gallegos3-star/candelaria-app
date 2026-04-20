// ============================================
// FormulacionHeader.js
// Header sticky de la pantalla de formulación
// ============================================
import React from 'react';
import { NumInput } from './FormulacionInputs';

export default function FormulacionHeader({
  producto, mobile, modoEdicion,
  autoGuardando, guardando, guardandoHistorial,
  config, setConfig,
  userRol,
  totalCrudoG, totalCostoMP, costoMPkg, precioVentaKg,
  comparadorAbierto, setComparadorAbierto,
  versionesAbierto, setVersionesAbierto,
  seccionActiva, setSeccionActiva,
  programarAutoGuardado,
  guardar, guardarHistorial,
  setModoEdicion,
  setModalNota,
  imprimir, descargarExcel,
  onVolver, onVolverMenu, onAbrirMaterias,
}) {
  const btnBase = {
    border:'none', borderRadius:'8px', cursor:'pointer',
    fontWeight:'bold', fontSize:'13px',
    minHeight: mobile ? 40 : 0
  };

  return (
    <div style={{
      background: modoEdicion
        ? 'linear-gradient(135deg,#1a3a1a,#1e5c1e)'
        : 'linear-gradient(135deg,#1a1a2e,#16213e)',
      padding: mobile ? '10px 12px' : '12px 20px',
      position:'sticky', top:0, zIndex:100,
      boxShadow:'0 2px 12px rgba(0,0,0,0.3)',
      transition:'background 0.3s'
    }}>

      {/* ── Fila principal ── */}
      <div style={{
        display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom: mobile ? 8 : 0
      }}>
        {/* Izquierda — navegación + título */}
        <div style={{ display:'flex', alignItems:'center', gap: mobile ? 6 : 8 }}>
          <button onClick={onVolverMenu} style={{
            ...btnBase,
            background:'rgba(255,200,0,0.25)',
            color:'#ffd700',
            padding: mobile ? '8px 10px' : '7px 12px',
            border:'1px solid rgba(255,200,0,0.4)',
            fontSize:'12px'
          }}>🏠 Menú</button>

          <button onClick={onVolver} style={{
            ...btnBase,
            background:'rgba(255,255,255,0.15)',
            color:'white',
            padding: mobile ? '8px 12px' : '7px 14px',
            border:'1px solid rgba(255,255,255,0.25)'
          }}>← Volver</button>

          {onAbrirMaterias && (
            <button onClick={onAbrirMaterias} style={{
              ...btnBase,
              background:'rgba(255,255,255,0.15)',
              color:'white',
              padding: mobile ? '8px 10px' : '7px 12px',
              border:'1px solid rgba(255,255,255,0.25)',
              fontSize:'12px'
            }}>📦 {mobile ? '' : 'Materias'}</button>
          )}

          <div>
            <div style={{
              color:'white', fontWeight:'bold',
              fontSize: mobile ? '14px' : '17px', lineHeight:1.2
            }}>
              🧪 {producto.nombre}
              {modoEdicion && (
                <span style={{
                  marginLeft:8, fontSize:'11px',
                  background:'#f39c12', color:'white',
                  padding:'2px 8px', borderRadius:'10px'
                }}>EDITANDO</span>
              )}
            </div>
            <div style={{
              color:'#aaa', fontSize:'10px',
              display:'flex', alignItems:'center', gap:6
            }}>
              {modoEdicion ? '✏️ Editando' : '🔒 Fijada — presiona Editar'}
              {autoGuardando && (
                <span style={{
                  background:'rgba(255,255,255,0.2)',
                  padding:'1px 6px', borderRadius:'8px',
                  fontSize:'9px', color:'#aef'
                }}>💾 guardando...</span>
              )}
            </div>
          </div>
        </div>

        {/* Derecha — botones desktop */}
        {!mobile && (
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <input
              type="date"
              value={config.fecha || ''}
              onChange={e => setConfig({ ...config, fecha: e.target.value })}
              style={{ padding:'6px', borderRadius:'7px', border:'none', fontSize:'12px' }}
            />
            <button onClick={imprimir} style={{
              ...btnBase, padding:'8px 14px',
              background:'#2980b9', color:'white'
            }}>🖨️ Imprimir</button>

            <button onClick={descargarExcel} style={{
              ...btnBase, padding:'8px 14px',
              background:'#27ae60', color:'white'
            }}>📥 Excel</button>

            <button onClick={() => setVersionesAbierto(!versionesAbierto)} style={{
              ...btnBase, padding:'8px 14px',
              background: versionesAbierto ? '#8e44ad' : '#6c3483',
              color:'white'
            }}>🔄 Versiones</button>

            {userRol?.rol === 'produccion' && (
              <button onClick={() => setModalNota(true)} style={{
                ...btnBase, padding:'8px 14px',
                background:'#e67e22', color:'white'
              }}>✉️ Nota</button>
            )}

            {modoEdicion ? (
              <>
                <button
                  onClick={async () => { await guardar(); setModoEdicion(false); }}
                  disabled={guardando}
                  style={{ ...btnBase, padding:'8px 18px', background:'#27ae60', color:'white' }}>
                  {guardando ? 'Guardando...' : '🔒 Fijar cambios'}
                </button>
                <button
                  onClick={guardarHistorial}
                  disabled={guardandoHistorial}
                  style={{ ...btnBase, padding:'8px 14px', background:'#e67e22', color:'white' }}>
                  {guardandoHistorial ? '...' : '📋 Guardar Historial'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setModoEdicion(true)}
                style={{ ...btnBase, padding:'8px 18px', background:'#8e44ad', color:'white' }}>
                ✏️ Editar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Botones mobile ── */}
      {mobile && (
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          <input
            type="date"
            value={config.fecha || ''}
            onChange={e => setConfig({ ...config, fecha: e.target.value })}
            style={{ flex:1, padding:'8px', borderRadius:'8px', border:'none', fontSize:'13px', minHeight:40 }}
          />
          <button onClick={imprimir} style={{
            ...btnBase, padding:'8px 10px', background:'#2980b9', color:'white'
          }}>🖨️</button>

          <button onClick={descargarExcel} style={{
            ...btnBase, padding:'8px 10px', background:'#27ae60', color:'white'
          }}>📥</button>

          <button onClick={() => setComparadorAbierto(!comparadorAbierto)} style={{
            ...btnBase, padding:'8px 10px',
            background: comparadorAbierto ? '#f39c12' : '#95a5a6',
            color:'white'
          }}>🔍</button>

          <button onClick={() => setVersionesAbierto(!versionesAbierto)} style={{
            ...btnBase, padding:'8px 10px',
            background: versionesAbierto ? '#8e44ad' : '#6c3483',
            color:'white'
          }}>🧬</button>

          {userRol?.rol === 'produccion' && (
            <button onClick={() => setModalNota(true)} style={{
              ...btnBase, padding:'8px 10px', background:'#e67e22', color:'white'
            }}>✉️</button>
          )}

          {modoEdicion ? (
            <>
              <button
                onClick={async () => { await guardar(); setModoEdicion(false); }}
                disabled={guardando}
                style={{ ...btnBase, padding:'8px 10px', background:'#27ae60', color:'white' }}>
                🔒
              </button>
              <button
                onClick={guardarHistorial}
                disabled={guardandoHistorial}
                style={{ ...btnBase, padding:'8px 10px', background:'#e67e22', color:'white' }}>
                📋
              </button>
            </>
          ) : (
            <button
              onClick={() => setModoEdicion(true)}
              style={{ ...btnBase, padding:'8px 14px', background:'#8e44ad', color:'white' }}>
              ✏️
            </button>
          )}
        </div>
      )}

      {/* ── Barra resumen edición ── */}
      {modoEdicion && (
        <div style={{
          marginTop:10, background:'rgba(255,255,255,0.08)',
          borderRadius:'10px', padding: mobile ? '8px 10px' : '10px 14px',
          display:'flex', gap: mobile ? 6 : 12,
          alignItems:'center', flexWrap:'wrap'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <label style={{
              fontSize:'11px', fontWeight:'bold',
              color:'#ccc', whiteSpace:'nowrap'
            }}>% SALMUERA</label>
            <NumInput
              value={config.porcentaje_salmuera ?? 20}
              onChange={v => {
                setConfig({ ...config, porcentaje_salmuera: parseFloat(v) || 0 });
                programarAutoGuardado();
              }}
              style={{
                width: mobile ? 55 : 60,
                padding: mobile ? '7px' : '5px',
                borderRadius:'7px', border:'1.5px solid rgba(255,255,255,0.3)',
                fontSize:'14px', fontWeight:'bold', textAlign:'center',
                background:'rgba(255,255,255,0.15)', color:'white'
              }}
            />
            <span style={{ fontSize:'13px', color:'#ccc' }}>%</span>
          </div>

          {[
            ['TOTAL CRUDO',     `${totalCrudoG.toLocaleString()} g`, 'rgba(255,255,255,0.1)', 'white'   ],
            ['COSTO BATCH',     `$${totalCostoMP.toFixed(2)}`,       'rgba(255,255,255,0.1)', '#f39c12' ],
            ['COSTO/KG MP',     `$${costoMPkg.toFixed(4)}`,          'rgba(255,255,255,0.1)', '#f39c12' ],
            ['PRECIO VENTA/KG', `$${precioVentaKg.toFixed(4)}`,      '#27ae60',               'white'   ],
          ].map(([l, v, bg, col]) => (
            <div key={l} style={{
              textAlign:'center', background:bg,
              padding: mobile ? '6px 10px' : '8px 14px',
              borderRadius:'8px', flex: mobile ? '1 1 auto' : undefined
            }}>
              <div style={{
                fontSize:'9px', fontWeight:700, letterSpacing:'0.5px',
                color: bg === '#27ae60' ? '#a9dfbf' : '#aaa'
              }}>{l}</div>
              <div style={{
                fontSize: mobile ? '13px' : '15px',
                fontWeight:'bold', color:col, whiteSpace:'nowrap'
              }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs mobile ── */}
      {mobile && (
        <div style={{
          display:'flex', marginTop:8,
          background:'rgba(255,255,255,0.08)',
          borderRadius:'10px', padding:'4px', gap:4
        }}>
          {/* Fórmula y Costos — solo en edición */}
          {modoEdicion && [
            ['formula', '🧪 Fórmula'],
            ['costos',  '📊 Costos' ],
          ].map(([key, label]) => (
            <button key={key}
              onClick={() => setSeccionActiva(key)}
              style={{
                flex:1, padding:'8px 2px', border:'none',
                borderRadius:'7px', cursor:'pointer',
                fontSize:'11px', fontWeight:'bold',
                background: seccionActiva === key ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: seccionActiva === key ? 'white' : 'rgba(255,255,255,0.6)',
                transition:'all 0.2s'
              }}>{label}</button>
          ))}
          {/* Materias — siempre visible, color diferente (verde) */}
          <button
            onClick={() => onAbrirMaterias && onAbrirMaterias()}
            style={{
              flex:1, padding:'8px 2px', border:'none',
              borderRadius:'7px', cursor:'pointer',
              fontSize:'11px', fontWeight:'bold',
              background:'rgba(46,204,113,0.2)',
              color:'#2ecc71',
              transition:'all 0.2s'
            }}>📦 Materias</button>
          {/* Versiones — solo en edición */}
          {modoEdicion && (
            <button
              onClick={() => { setVersionesAbierto(true); setSeccionActiva('versiones'); }}
              style={{
                flex:1, padding:'8px 2px', border:'none',
                borderRadius:'7px', cursor:'pointer',
                fontSize:'11px', fontWeight:'bold',
                background: seccionActiva === 'versiones' ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: seccionActiva === 'versiones' ? 'white' : 'rgba(255,255,255,0.6)',
                transition:'all 0.2s'
              }}>🔄 Vers.</button>
          )}
        </div>
      )}
    </div>
  );
}