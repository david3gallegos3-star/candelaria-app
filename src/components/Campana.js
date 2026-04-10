// ============================================
// CAMPANA DE NOTIFICACIONES — solo admin
// Usado por: App.js, pantalla menu y fórmulas
// ============================================

import React from 'react';
import { supabase } from '../supabase';

function colorTipo(tipo) {
  if (tipo === 'precio_mp' || tipo === 'cambio_precio') return '#e74c3c';
  if (tipo === 'nota_formulador' || tipo === 'nota_produccion') return '#e67e22';
  if (tipo === 'nueva_mp')    return '#27ae60';
  if (tipo === 'stock_bajo')  return '#f39c12';
  if (tipo === 'produccion')  return '#3498db';
  if (tipo === 'perdida')     return '#c0392b';
  return '#8e44ad';
}

function iconTipo(tipo) {
  if (tipo === 'precio_mp' || tipo === 'cambio_precio') return '💰';
  if (tipo === 'nota_formulador') return '🧪';
  if (tipo === 'nota_produccion') return '🏭';
  if (tipo === 'nueva_mp')   return '📦';
  if (tipo === 'stock_bajo') return '⚠️';
  if (tipo === 'produccion') return '✅';
  if (tipo === 'perdida')    return '🗑️';
  return '🔔';
}

function Campana({ 
  userRol, notificaciones, notifNoLeidas,
  campanAbierta, setCampanaAbierta,
  cargarNotificaciones, productos,
  abrirProducto, navegarA
}) {
  if (userRol?.rol !== 'admin') return null;

  async function marcarLeida(id) {
    await supabase.from('notificaciones')
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq('id', id);
    await supabase.from('auditoria')
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq('notificacion_id', id);
    cargarNotificaciones();
  }

  async function marcarTodasLeidas() {
    const ids = notificaciones.map(n => n.id);
    if (ids.length === 0) return;
    await supabase.from('notificaciones')
      .update({ leida: true, leida_at: new Date().toISOString() })
      .in('id', ids);
    cargarNotificaciones();
    setCampanaAbierta(false);
  }

  return (
    <div style={{ position:'relative' }}>

      {/* Botón campana */}
      <button
        onClick={() => setCampanaAbierta(!campanAbierta)}
        style={{
          background:'rgba(255,255,255,0.15)',
          border:'1px solid rgba(255,255,255,0.3)',
          borderRadius:'8px', padding:'8px 12px',
          cursor:'pointer', fontSize:'18px',
          color:'white', position:'relative'
        }}
      >
        🔔
        {notifNoLeidas > 0 && (
          <span style={{
            position:'absolute', top:'-6px', right:'-6px',
            background:'#e74c3c', color:'white', borderRadius:'50%',
            width:'20px', height:'20px', display:'flex',
            alignItems:'center', justifyContent:'center',
            fontSize:'11px', fontWeight:'700',
            border:'2px solid #1a1a2e'
          }}>
            {notifNoLeidas > 9 ? '9+' : notifNoLeidas}
          </span>
        )}
      </button>

      {/* Panel de notificaciones */}
      {campanAbierta && (
        <div style={{
          position:'absolute', right:0, top:'44px', width:'380px',
          background:'white', borderRadius:'12px',
          boxShadow:'0 8px 30px rgba(0,0,0,0.25)',
          zIndex:2000, overflow:'hidden'
        }}>
          {/* Header panel */}
          <div style={{
            background:'#1a1a2e', padding:'12px 16px',
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize:'13px' }}>
              🔔 Notificaciones
            </span>
            <div style={{ display:'flex', gap:8 }}>
              {notificaciones.length > 0 && (
                <button onClick={marcarTodasLeidas} style={{
                  background:'rgba(255,255,255,0.15)', border:'none',
                  color:'white', borderRadius:'6px', padding:'4px 10px',
                  cursor:'pointer', fontSize:'11px'
                }}>
                  Marcar todas leídas
                </button>
              )}
              <button onClick={() => setCampanaAbierta(false)} style={{
                background:'none', border:'none', color:'white',
                cursor:'pointer', fontSize:'16px'
              }}>✕</button>
            </div>
          </div>

          {/* Lista notificaciones */}
          <div style={{ maxHeight:'400px', overflowY:'auto' }}>
            {notificaciones.length === 0 ? (
              <div style={{ padding:'30px', textAlign:'center', color:'#aaa' }}>
                <div style={{ fontSize:'32px', marginBottom:'8px' }}>✅</div>
                <div style={{ fontSize:'13px' }}>Sin notificaciones pendientes</div>
              </div>
            ) : notificaciones.map(n => (
              <div key={n.id} style={{
                padding:'12px 14px', borderBottom:'1px solid #f0f0f0',
                background: n.tipo?.includes('stock') ? '#fffbf0'
                  : n.tipo?.includes('nota') ? '#fff8f0' : 'white'
              }}>
                <div style={{ display:'flex', gap:'10px' }}>
                  <div style={{
                    background: colorTipo(n.tipo), borderRadius:'50%',
                    width:'36px', height:'36px', display:'flex',
                    alignItems:'center', justifyContent:'center',
                    fontSize:'16px', flexShrink:0
                  }}>
                    {iconTipo(n.tipo)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{
                      display:'flex', justifyContent:'space-between',
                      marginBottom:'3px'
                    }}>
                      <span style={{ fontSize:'12px', fontWeight:'700', color:'#1a1a2e' }}>
                        {n.usuario_nombre} {n.producto_nombre ? `— ${n.producto_nombre}` : ''}
                      </span>
                      <span style={{ fontSize:'10px', color:'#aaa' }}>
                        {new Date(n.created_at).toLocaleTimeString('es-EC', {
                          hour:'2-digit', minute:'2-digit'
                        })}
                      </span>
                    </div>
                    <div style={{
                      fontSize:'12px', color:'#444', background:'#f8f9fa',
                      borderRadius:'6px', padding:'6px 10px',
                      borderLeft:`3px solid ${colorTipo(n.tipo)}`,
                      marginBottom:'6px'
                    }}>
                      {n.mensaje}
                    </div>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={() => marcarLeida(n.id)} style={{
                        background:'#27ae60', color:'white', border:'none',
                        borderRadius:'5px', padding:'3px 10px',
                        cursor:'pointer', fontSize:'10px'
                      }}>
                        ✓ Marcar leída
                      </button>
                      {n.producto_nombre && (
                        <button onClick={() => {
                          marcarLeida(n.id);
                          const p = productos.find(x => x.nombre === n.producto_nombre);
                          if (p) abrirProducto(p);
                          setCampanaAbierta(false);
                        }} style={{
                          background:'#3498db', color:'white', border:'none',
                          borderRadius:'5px', padding:'3px 10px',
                          cursor:'pointer', fontSize:'10px'
                        }}>
                          Ir a fórmula
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer panel */}
          <div style={{
            padding:'8px 14px', background:'#f8f9fa',
            borderTop:'1px solid #eee', textAlign:'center'
          }}>
            <button onClick={() => {
              setCampanaAbierta(false);
              navegarA('auditoria');
            }} style={{
              background:'none', border:'none', color:'#3498db',
              cursor:'pointer', fontSize:'12px'
            }}>
              Ver historial completo de auditoría →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Campana;