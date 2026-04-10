// ============================================
// GESTOR DE USUARIOS Y ROLES — solo admin
// Usado por: App.js
// ============================================

import React from 'react';
import { supabase } from '../supabase';

const ROL_COLOR = {
  admin:      '#8e44ad',
  formulador: '#1a5276',
  produccion: '#e67e22',
  bodeguero:  '#27ae60'
};

const ROL_LABEL = {
  admin:      'Administrador',
  formulador: 'Formulador',
  produccion: 'Producción',
  bodeguero:  'Bodeguero'
};

function GestorUsuarios({
  modalUsuarios, setModalUsuarios,
  usuariosRoles, cargarUsuariosRoles,
  editandoUsuario, setEditandoUsuario,
  mostrarExito
}) {
  if (!modalUsuarios) return null;

  async function guardarRolUsuario() {
    if (!editandoUsuario) return;
    await supabase.from('usuarios_roles')
      .update({
        nombre:  editandoUsuario.nombre,
        rol:     editandoUsuario.rol,
        activo:  editandoUsuario.activo
      })
      .eq('id', editandoUsuario.id);
    setEditandoUsuario(null);
    await cargarUsuariosRoles();
    mostrarExito('✅ Usuario actualizado');
  }

  async function toggleActivoUsuario(u) {
    await supabase.from('usuarios_roles')
      .update({ activo: !u.activo })
      .eq('id', u.id);
    await cargarUsuariosRoles();
  }

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:3000
    }}>
      <div style={{
        background:'white', borderRadius:'14px',
        width:'580px', maxHeight:'85vh',
        display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.4)'
      }}>

        {/* Header */}
        <div style={{
          background:'#1a1a2e', padding:'16px 20px',
          borderRadius:'14px 14px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <div style={{ color:'white', fontWeight:'bold', fontSize:'16px' }}>
            👥 Gestión de Usuarios
          </div>
          <button onClick={() => {
            setModalUsuarios(false);
            setEditandoUsuario(null);
          }} style={{
            background:'rgba(255,255,255,0.15)', border:'none',
            color:'white', fontSize:'18px', cursor:'pointer',
            borderRadius:'6px', padding:'4px 10px'
          }}>✕</button>
        </div>

        {/* Cuerpo */}
        <div style={{ overflowY:'auto', padding:'16px', flex:1 }}>

          {/* Aviso instructivo */}
          <div style={{
            background:'#e8f4fd', border:'1px solid #3498db',
            borderRadius:'8px', padding:'10px 14px',
            fontSize:'12px', color:'#1a5276', marginBottom:'14px'
          }}>
            💡 Para agregar un nuevo usuario: primero créalo en{' '}
            <strong>Supabase → Authentication → Users</strong>, luego
            ejecuta el INSERT en SQL Editor con su UUID y rol.
          </div>

          {/* Lista de usuarios */}
          {usuariosRoles.map(u => (
            <div key={u.id} style={{
              background: u.activo ? 'white' : '#f8f8f8',
              border:`1.5px solid ${u.activo ? '#e0e0e0' : '#f5c6c6'}`,
              borderRadius:'10px', padding:'12px 14px', marginBottom:'10px'
            }}>

              {/* Modo edición */}
              {editandoUsuario?.id === u.id ? (
                <div>
                  <div style={{
                    display:'grid', gridTemplateColumns:'1fr 1fr',
                    gap:'10px', marginBottom:'10px'
                  }}>
                    <div>
                      <label style={{
                        fontSize:'11px', fontWeight:'bold',
                        color:'#555', display:'block', marginBottom:'4px'
                      }}>
                        Nombre
                      </label>
                      <input
                        value={editandoUsuario.nombre}
                        onChange={e => setEditandoUsuario({
                          ...editandoUsuario, nombre: e.target.value
                        })}
                        style={{
                          width:'100%', padding:'8px', borderRadius:'7px',
                          border:'1.5px solid #3498db', fontSize:'13px',
                          boxSizing:'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{
                        fontSize:'11px', fontWeight:'bold',
                        color:'#555', display:'block', marginBottom:'4px'
                      }}>
                        Rol
                      </label>
                      <select
                        value={editandoUsuario.rol}
                        onChange={e => setEditandoUsuario({
                          ...editandoUsuario, rol: e.target.value
                        })}
                        style={{
                          width:'100%', padding:'8px', borderRadius:'7px',
                          border:'1.5px solid #3498db', fontSize:'13px'
                        }}
                      >
                        <option value="admin">Administrador</option>
                        <option value="formulador">Formulador</option>
                        <option value="produccion">Producción</option>
                        <option value="bodeguero">Bodeguero</option>
                      </select>
                    </div>
                  </div>
                  <div style={{
                    display:'flex', gap:'8px', justifyContent:'flex-end'
                  }}>
                    <button onClick={() => setEditandoUsuario(null)} style={{
                      padding:'7px 16px', background:'#95a5a6',
                      color:'white', border:'none', borderRadius:'7px',
                      cursor:'pointer', fontSize:'12px'
                    }}>
                      Cancelar
                    </button>
                    <button onClick={guardarRolUsuario} style={{
                      padding:'7px 16px', background:'#27ae60',
                      color:'white', border:'none', borderRadius:'7px',
                      cursor:'pointer', fontSize:'12px', fontWeight:'bold'
                    }}>
                      Guardar
                    </button>
                  </div>
                </div>

              ) : (
                /* Modo vista */
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{
                    background: ROL_COLOR[u.rol] || '#888',
                    borderRadius:'50%', width:'38px', height:'38px',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'white', fontWeight:'bold', fontSize:'16px', flexShrink:0
                  }}>
                    {u.nombre?.charAt(0)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{
                      fontWeight:'bold', fontSize:'14px',
                      color: u.activo ? '#1a1a2e' : '#aaa'
                    }}>
                      {u.nombre}
                    </div>
                    <div style={{ fontSize:'12px', color:'#888' }}>
                      {ROL_LABEL[u.rol] || u.rol}
                      {!u.activo && (
                        <span style={{ color:'#e74c3c', marginLeft:'8px' }}>
                          • Inactivo
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={() => setEditandoUsuario({...u})} style={{
                      padding:'5px 12px', background:'#3498db',
                      color:'white', border:'none', borderRadius:'7px',
                      cursor:'pointer', fontSize:'12px'
                    }}>
                      ✏️
                    </button>
                    <button onClick={() => toggleActivoUsuario(u)} style={{
                      padding:'5px 12px',
                      background: u.activo ? '#e74c3c' : '#27ae60',
                      color:'white', border:'none', borderRadius:'7px',
                      cursor:'pointer', fontSize:'12px'
                    }}>
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GestorUsuarios;