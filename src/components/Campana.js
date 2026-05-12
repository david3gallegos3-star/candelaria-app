// ============================================
// CAMPANA DE NOTIFICACIONES — solo admin
// Usado por: App.js, pantalla menu y fórmulas
// ============================================

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

function colorTipo(tipo) {
  if (tipo === 'login_usuario')   return '#16a085';
  if (tipo === 'precio_mp' || tipo === 'cambio_precio') return '#e74c3c';
  if (tipo === 'nota_formulador' || tipo === 'nota_produccion') return '#e67e22';
  if (tipo === 'nueva_mp')        return '#27ae60';
  if (tipo === 'nuevo_producto')  return '#8e44ad';
  if (tipo === 'nueva_categoria') return '#2980b9';
  if (tipo === 'stock_bajo')      return '#f39c12';
  if (tipo === 'produccion')  return '#3498db';
  if (tipo === 'perdida')     return '#c0392b';
  return '#8e44ad';
}

function iconTipo(tipo) {
  if (tipo === 'login_usuario')   return '👤';
  if (tipo === 'precio_mp' || tipo === 'cambio_precio') return '💰';
  if (tipo === 'nota_formulador') return '🧪';
  if (tipo === 'nota_produccion') return '🏭';
  if (tipo === 'nueva_mp')        return '📦';
  if (tipo === 'nuevo_producto')  return '➕';
  if (tipo === 'nueva_categoria') return '📂';
  if (tipo === 'stock_bajo')      return '⚠️';
  if (tipo === 'produccion') return '✅';
  if (tipo === 'perdida')    return '🗑️';
  return '🔔';
}

const INACTIVO_MIN = 20; // minutos sin interacción → inactivo

function tiempoInactivo(last_activity) {
  if (!last_activity) return null;
  const mins = Math.floor((Date.now() - last_activity) / 60000);
  if (mins < INACTIVO_MIN) return null;
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}min` : `${hrs}h`;
}

const ACTIVIDAD_LABEL = {
  conectado:  { label: 'Conectado',  color: '#27ae60' },
  navegando:  { label: 'Navegando',  color: '#3498db' },
  editando:   { label: 'Editando',   color: '#e67e22' },
};

function Campana({
  userRol, presentes = [], notificaciones, notifNoLeidas,
  campanAbierta, setCampanaAbierta,
  cargarNotificaciones, productos,
  abrirProducto, navegarA
}) {
  if (userRol?.rol !== 'admin') return null;

  // Tick cada 60s para actualizar etiquetas de inactividad mientras el panel está abierto
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!campanAbierta) return;
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [campanAbierta]);

  // Excluir al propio admin de la lista de presentes mostrada
  const otrosUsuarios = presentes.filter(p => p.email !== 'davidbi.br@gmail.com');

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

      {/* Indicador usuarios en línea */}
      {otrosUsuarios.length > 0 && (
        <div style={{
          display:'inline-flex', alignItems:'center', gap:'5px',
          background:'rgba(39,174,96,0.2)', border:'1px solid rgba(39,174,96,0.5)',
          borderRadius:'8px', padding:'6px 10px',
          marginRight:'6px', fontSize:'12px', color:'white', cursor:'pointer'
        }} onClick={() => setCampanaAbierta(!campanAbierta)}>
          <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#27ae60', display:'inline-block' }} />
          {otrosUsuarios.length} en línea
        </div>
      )}

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

          {/* Usuarios en línea */}
          {otrosUsuarios.length === 0 && (
            <div style={{
              padding:'10px 14px', borderBottom:'1px solid #eef',
              display:'flex', alignItems:'center', gap:'8px',
              background:'#f8fff8'
            }}>
              <span style={{ fontSize:'11px', color:'#27ae60', fontWeight:'600' }}>
                👥 En línea ahora
              </span>
              <span style={{ fontSize:'11px', color:'#aaa' }}>— Solo tú estás conectado</span>
            </div>
          )}
          {otrosUsuarios.length > 0 && (
            <div style={{ borderBottom:'2px solid #eef' }}>
              <div style={{
                padding:'8px 14px 4px', fontSize:'11px',
                fontWeight:'700', color:'#27ae60',
                textTransform:'uppercase', letterSpacing:'0.5px'
              }}>
                👥 En línea ahora
              </div>
              {otrosUsuarios.map((p, i) => {
                const inactivoStr = tiempoInactivo(p.last_activity);
                const esInactivo  = !!inactivoStr;
                const act = esInactivo
                  ? { label: `Inactivo ${inactivoStr}`, color: '#95a5a6' }
                  : (ACTIVIDAD_LABEL[p.actividad] || ACTIVIDAD_LABEL.conectado);
                return (
                  <div key={p.user_id || i} style={{
                    padding:'8px 14px', display:'flex', alignItems:'center', gap:'10px',
                    borderBottom: i < otrosUsuarios.length - 1 ? '1px solid #f5f5f5' : 'none',
                    background: esInactivo ? '#fafafa' : 'white',
                    opacity: esInactivo ? 0.75 : 1,
                  }}>
                    <div style={{
                      width:'32px', height:'32px', borderRadius:'50%',
                      background: esInactivo ? '#ccc' : '#1a1a2e',
                      display:'flex', alignItems:'center',
                      justifyContent:'center', fontSize:'14px', flexShrink:0
                    }}>
                      {esInactivo ? '💤' : '👤'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color: esInactivo ? '#888' : '#1a1a2e' }}>
                        {p.nombre || p.email}
                      </div>
                      <div style={{ fontSize:'11px', color:'#aaa' }}>
                        {p.pantalla_label || p.pantalla}
                      </div>
                    </div>
                    <div style={{
                      fontSize:'10px', fontWeight:'600', color: act.color,
                      background: act.color + '18', borderRadius:'10px',
                      padding:'2px 8px', whiteSpace:'nowrap'
                    }}>
                      ● {act.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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