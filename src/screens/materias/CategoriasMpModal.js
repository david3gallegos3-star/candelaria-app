// ============================================
// MATERIAS PRIMAS — Modal gestión categorías
// Usado por: PantallaMaterias.js
// ============================================

import React from 'react';

function CategoriasMpModal({
  modalGestionarMp, setModalGestionarMp,
  categoriasMp, materias,
  nuevaCatMpNombre, setNuevaCatMpNombre,
  editandoCatMp, setEditandoCatMp,
  crearCategoriaMp,
  guardarEdicionCatMp,
  eliminarCategoriaMp,
  moverCategoriaMp
}) {
  if (!modalGestionarMp) return null;

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:3000
    }}>
      <div style={{
        background:'white', borderRadius:14, width:500,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.35)'
      }}>

        {/* Header */}
        <div style={{
          background:'#1a1a2e', padding:'16px 20px',
          borderRadius:'14px 14px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <div>
            <div style={{ color:'white', fontWeight:'bold', fontSize:'16px' }}>
              🗂️ Categorías de Materias Primas
            </div>
            <div style={{ color:'#aaa', fontSize:'11px', marginTop:2 }}>
              {categoriasMp.length} categorías
            </div>
          </div>
          <button onClick={() => {
            setModalGestionarMp(false);
            setEditandoCatMp(null);
            setNuevaCatMpNombre('');
          }} style={{
            background:'rgba(255,255,255,0.15)', border:'none',
            color:'white', fontSize:'18px', cursor:'pointer',
            borderRadius:6, padding:'4px 10px'
          }}>✕</button>
        </div>

        {/* Input nueva categoría */}
        <div style={{
          padding:'14px 16px', borderBottom:'1px solid #f0f0f0',
          background:'#f8f9fa'
        }}>
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={nuevaCatMpNombre}
              onChange={e => setNuevaCatMpNombre(e.target.value.toUpperCase())}
              onKeyPress={e => e.key === 'Enter' && crearCategoriaMp()}
              placeholder="Nombre nueva categoría..."
              style={{
                flex:1, padding:'9px 12px', borderRadius:8,
                border:'1.5px solid #ddd',
                fontSize:'13px', fontWeight:'bold'
              }}
            />
            <button onClick={crearCategoriaMp} style={{
              padding:'9px 18px', background:'#27ae60', color:'white',
              border:'none', borderRadius:8, cursor:'pointer',
              fontSize:'13px', fontWeight:'bold', whiteSpace:'nowrap'
            }}>➕ Agregar</button>
          </div>
        </div>

        {/* Lista categorías */}
        <div style={{ overflowY:'auto', padding:'12px 16px', flex:1 }}>
          {categoriasMp.map((cat, idx) => {
            const enUso = materias.filter(m => m.categoria === cat).length;
            return (
              <div key={cat} style={{
                background:'white', border:'1.5px solid #e9ecef',
                borderRadius:10, padding:'10px 12px',
                marginBottom:8, display:'flex',
                alignItems:'center', gap:8
              }}>

                {/* Modo edición */}
                {editandoCatMp?.idx === idx ? (
                  <>
                    <input
                      value={editandoCatMp.valor}
                      onChange={e => setEditandoCatMp({
                        ...editandoCatMp,
                        valor: e.target.value.toUpperCase()
                      })}
                      onKeyPress={e => e.key === 'Enter' && guardarEdicionCatMp()}
                      style={{
                        flex:1, padding:'7px 10px', borderRadius:7,
                        border:'1.5px solid #3498db',
                        fontSize:'13px', fontWeight:'bold'
                      }}
                      autoFocus
                    />
                    <button onClick={guardarEdicionCatMp} style={{
                      padding:'6px 14px', background:'#27ae60', color:'white',
                      border:'none', borderRadius:7, cursor:'pointer',
                      fontSize:'13px', fontWeight:'bold'
                    }}>✓</button>
                    <button onClick={() => setEditandoCatMp(null)} style={{
                      padding:'6px 12px', background:'#95a5a6', color:'white',
                      border:'none', borderRadius:7,
                      cursor:'pointer', fontSize:'13px'
                    }}>✕</button>
                  </>
                ) : (
                  /* Modo vista */
                  <>
                    {/* Flechas orden */}
                    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      <button
                        onClick={() => moverCategoriaMp(idx, -1)}
                        disabled={idx === 0}
                        style={{
                          background:'none', border:'none',
                          cursor: idx === 0 ? 'default' : 'pointer',
                          color:  idx === 0 ? '#ddd' : '#888',
                          fontSize:'12px', padding:'1px 4px', lineHeight:1
                        }}>▲</button>
                      <button
                        onClick={() => moverCategoriaMp(idx, 1)}
                        disabled={idx === categoriasMp.length - 1}
                        style={{
                          background:'none', border:'none',
                          cursor: idx === categoriasMp.length-1 ? 'default' : 'pointer',
                          color:  idx === categoriasMp.length-1 ? '#ddd' : '#888',
                          fontSize:'12px', padding:'1px 4px', lineHeight:1
                        }}>▼</button>
                    </div>

                    {/* Info categoría */}
                    <div style={{ flex:1 }}>
                      <div style={{
                        fontWeight:'bold', fontSize:'13px', color:'#1a1a2e'
                      }}>
                        {cat}
                      </div>
                      <div style={{
                        fontSize:'11px',
                        color: enUso > 0 ? '#27ae60' : '#aaa'
                      }}>
                        {enUso > 0
                          ? `${enUso} materia${enUso!==1?'s':''} asignada${enUso!==1?'s':''}`
                          : 'Sin asignaciones'
                        }
                      </div>
                    </div>

                    {/* Badge cantidad */}
                    {enUso > 0 && (
                      <span style={{
                        background:'#e8f5e9', color:'#2e7d32',
                        padding:'2px 8px', borderRadius:10,
                        fontSize:'11px', fontWeight:'bold'
                      }}>{enUso}</span>
                    )}

                    {/* Botones acción */}
                    <button
                      onClick={() => setEditandoCatMp({ idx, valor: cat })}
                      style={{
                        padding:'5px 10px', background:'#3498db', color:'white',
                        border:'none', borderRadius:6,
                        cursor:'pointer', fontSize:'12px'
                      }}>✏️</button>
                    <button
                      onClick={() => eliminarCategoriaMp(idx)}
                      style={{
                        padding:'5px 10px',
                        background: enUso > 0 ? '#bdc3c7' : '#e74c3c',
                        color:'white', border:'none', borderRadius:6,
                        cursor:'pointer', fontSize:'12px'
                      }}>🗑️</button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding:'10px 16px', borderTop:'1px solid #f0f0f0',
          background:'#f8f9fa', borderRadius:'0 0 14px 14px'
        }}>
          <div style={{ fontSize:'11px', color:'#888', textAlign:'center' }}>
            💡 Las categorías con materias asignadas no se pueden eliminar directamente.
          </div>
        </div>

      </div>
    </div>
  );
}

export default CategoriasMpModal;