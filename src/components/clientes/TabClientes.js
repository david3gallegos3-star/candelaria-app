// ============================================
// TabClientes.js
// Lista de clientes + Eliminados
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

export default function TabClientes({
  mobile, esAdmin,
  clientesFiltrados,
  buscar, setBuscar,
  clienteSel, setClienteSel,
  preciosFiltrados, precios,
  abrirModalCliente,
  abrirModalPrecio,
  eliminarCliente,
  toggleActivoCliente,
  setTab,
  cargarTodo, 
}) {
  const [subTab,             setSubTab]             = useState('activos');
  const [eliminados,         setEliminados]         = useState([]);
  const [restaurando,        setRestaurando]        = useState(false);

  useEffect(() => {
    cargarEliminados();
  }, []);
  useRealtime(['clientes'], cargarEliminados);

  async function cargarEliminados() {
    const { data } = await supabase
      .from('clientes').select('*')
      .eq('eliminado', true)
      .order('eliminado_at', { ascending: false });
    setEliminados(data || []);
  }

  async function restaurarCliente(cli) {
    if (!window.confirm(`¿Restaurar "${cli.nombre}"?`)) return;
    setRestaurando(true);
    await supabase.from('clientes').update({
      eliminado:     false,
      eliminado_at:  null,
      eliminado_por: null,
      activo:        true
      }).eq('id', cli.id);
      await cargarEliminados();
      await cargarTodo();        // ← agrega esto
      setSubTab('activos');      // ← cambia al tab activos
      setRestaurando(false);
    }

  async function eliminarDefinitivo(cli) {
    if (!window.confirm(
      `⚠️ ELIMINAR PERMANENTEMENTE "${cli.nombre}"?\n\nSus precios también se eliminarán.\nEsto NO se puede deshacer.`
    )) return;
    await supabase.from('precios_clientes').delete().eq('cliente_id', cli.id);
    await supabase.from('clientes').delete().eq('id', cli.id);
    await cargarEliminados();
  }

  return (
    <div>
      {/* ── Sub tabs ── */}
      <div style={{
        display:'flex', background:'white',
        borderRadius:'10px', padding:'4px',
        marginBottom:'12px', gap:4,
        boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <button
          onClick={() => setSubTab('activos')}
          style={{
            flex:1, padding: mobile ? '8px 4px' : '9px 12px',
            border:'none', borderRadius:'7px', cursor:'pointer',
            fontSize: mobile ? '11px' : '13px', fontWeight:'bold',
            background: subTab === 'activos' ? '#1a1a2e' : 'transparent',
            color:      subTab === 'activos' ? 'white'   : '#666',
          }}>👥 Activos ({clientesFiltrados.length})</button>

        <button
          onClick={() => { setSubTab('eliminados'); cargarEliminados(); }}
          style={{
            flex:1, padding: mobile ? '8px 4px' : '9px 12px',
            border:'none', borderRadius:'7px', cursor:'pointer',
            fontSize: mobile ? '11px' : '13px', fontWeight:'bold',
            background: subTab === 'eliminados' ? '#1a1a2e' : 'transparent',
            color:      subTab === 'eliminados' ? 'white'   : '#666',
          }}>
          🗑️ Eliminados
          {eliminados.length > 0 && (
            <span style={{
              marginLeft:4, background:'#e74c3c',
              color:'white', padding:'1px 6px',
              borderRadius:8, fontSize:'10px'
            }}>{eliminados.length}</span>
          )}
        </button>
      </div>

      {/* ════ SUB TAB ACTIVOS ════ */}
      {subTab === 'activos' && (
        <>
          {/* Buscador */}
          <div style={{
            background:'white', padding:'12px 14px',
            borderRadius:'10px', marginBottom:'12px',
            display:'flex', gap:'10px', flexWrap:'wrap',
            boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
          }}>
            <input
              placeholder="🔍 Buscar por nombre, RUC o email..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              style={{
                flex:1, minWidth:200, padding:'8px 12px',
                borderRadius:'8px', border:'1px solid #ddd', fontSize:'13px'
              }}
            />
            <span style={{
              padding:'8px 12px', background:'#f0f2f5',
              borderRadius:'8px', fontSize:'13px', color:'#666'
            }}>{clientesFiltrados.length} clientes</span>
          </div>

          {/* Grid clientes */}
          {clientesFiltrados.length === 0 ? (
            <div style={{
              textAlign:'center', padding:'60px', color:'#aaa',
              background:'white', borderRadius:'10px'
            }}>
              <div style={{ fontSize:'48px', marginBottom:'12px' }}>👥</div>
              <div style={{ fontSize:'14px', marginBottom:'8px' }}>
                {buscar ? 'No se encontraron clientes' : 'Sin clientes registrados'}
              </div>
              {esAdmin && !buscar && (
                <button
                  onClick={() => abrirModalCliente()}
                  style={{
                    marginTop:'12px', padding:'10px 20px',
                    background:'#27ae60', color:'white',
                    border:'none', borderRadius:'8px',
                    cursor:'pointer', fontWeight:'bold'
                  }}>➕ Agregar primer cliente</button>
              )}
            </div>
          ) : (
            <div style={{
              display:'grid',
              gridTemplateColumns: mobile
                ? '1fr'
                : 'repeat(auto-fill, minmax(320px, 1fr))',
              gap:'12px'
            }}>
              {clientesFiltrados.map(cli => {
                const numPrecios   = precios.filter(p => p.cliente_id === cli.id).length;
                const seleccionado = clienteSel?.id === cli.id;
                return (
                  <div key={cli.id} style={{
                    background:'white', borderRadius:'12px',
                    border: seleccionado
                      ? '2px solid #3498db'
                      : `1.5px solid ${cli.activo ? '#e0e0e0' : '#f5c6c6'}`,
                    boxShadow: seleccionado
                      ? '0 4px 16px rgba(52,152,219,0.2)'
                      : '0 1px 4px rgba(0,0,0,0.06)',
                    overflow:'hidden', opacity: cli.activo ? 1 : 0.7,
                    transition:'all 0.2s'
                  }}>
                    {/* Header card */}
                    <div style={{
                      padding:'12px 14px',
                      background: seleccionado ? '#e8f4fd' : '#f8f9fa',
                      borderBottom:'1px solid #f0f0f0',
                      display:'flex', justifyContent:'space-between',
                      alignItems:'flex-start'
                    }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'14px' }}>
                          {cli.nombre}
                        </div>
                        {cli.ruc && (
                          <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>
                            RUC: {cli.ruc}
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        {!cli.activo && (
                          <span style={{
                            background:'#f8d7da', color:'#721c24',
                            padding:'2px 8px', borderRadius:'8px',
                            fontSize:'10px', fontWeight:'bold'
                          }}>Inactivo</span>
                        )}
                        <span style={{
                          background: numPrecios > 0 ? '#d4edda' : '#fff3cd',
                          color:      numPrecios > 0 ? '#155724' : '#856404',
                          padding:'2px 8px', borderRadius:'8px',
                          fontSize:'10px', fontWeight:'bold'
                        }}>
                          {numPrecios} precio{numPrecios !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ padding:'10px 14px' }}>
                      {[
                        cli.email     && { icon:'📧', val: cli.email     },
                        cli.telefono  && { icon:'📞', val: cli.telefono  },
                        cli.direccion && { icon:'📍', val: cli.direccion },
                      ].filter(Boolean).map((item, i) => (
                        <div key={i} style={{
                          fontSize:'12px', color:'#555',
                          marginBottom:'3px', display:'flex', gap:6
                        }}>
                          <span>{item.icon}</span>
                          <span>{item.val}</span>
                        </div>
                      ))}
                      {cli.notas && (
                        <div style={{
                          fontSize:'11px', color:'#888',
                          fontStyle:'italic', marginTop:'4px'
                        }}>📝 {cli.notas}</div>
                      )}
                    </div>

                    {/* Botones */}
                    <div style={{
                      padding:'8px 14px 12px',
                      display:'flex', gap:6, flexWrap:'wrap'
                    }}>
                      <button
                        onClick={() => {
                          setClienteSel(seleccionado ? null : cli);
                          if (!seleccionado) setTab('precios');
                        }}
                        style={{
                          flex:1, padding:'7px 10px',
                          background: seleccionado ? '#3498db' : '#e8f4fd',
                          color:      seleccionado ? 'white'   : '#1a5276',
                          border:'none', borderRadius:'7px',
                          cursor:'pointer', fontSize:'12px', fontWeight:'bold'
                        }}>
                        {seleccionado ? '✓ Seleccionado' : '💰 Ver precios'}
                      </button>

                      {esAdmin && (
                        <>
                          <button
                            onClick={() => abrirModalPrecio(null, cli)}
                            style={{
                              padding:'7px 10px', background:'#e8f5e9',
                              color:'#155724', border:'none',
                              borderRadius:'7px', cursor:'pointer', fontSize:'12px'
                            }}>+ Precio</button>

                          <button
                            onClick={() => abrirModalCliente(cli)}
                            style={{
                              padding:'7px 10px', background:'#f0f0f0',
                              color:'#555', border:'none',
                              borderRadius:'7px', cursor:'pointer', fontSize:'12px'
                            }}>✏️</button>

                          <button
                            onClick={() => toggleActivoCliente(cli)}
                            style={{
                              padding:'7px 10px',
                              background: cli.activo ? '#fff3cd' : '#d4edda',
                              color:      cli.activo ? '#856404' : '#155724',
                              border:'none', borderRadius:'7px',
                              cursor:'pointer', fontSize:'12px'
                            }}>
                            {cli.activo ? 'Desactivar' : 'Activar'}
                          </button>

                          <button
                            onClick={() => eliminarCliente(cli.id)}
                            style={{
                              padding:'7px 10px', background:'#fde8e8',
                              color:'#721c24', border:'none',
                              borderRadius:'7px', cursor:'pointer', fontSize:'12px'
                            }}>🗑️</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ════ SUB TAB ELIMINADOS ════ */}
      {subTab === 'eliminados' && (
        <>
          <div style={{
            background:'#fff3cd', border:'1px solid #ffc107',
            borderRadius:'10px', padding:'12px 16px',
            marginBottom:'12px',
            display:'flex', alignItems:'center', gap:10
          }}>
            <span style={{ fontSize:'20px' }}>♻️</span>
            <div>
              <div style={{ fontWeight:'bold', color:'#856404', fontSize:'13px' }}>
                Clientes eliminados
              </div>
              <div style={{ fontSize:'12px', color:'#856404' }}>
                Sus precios se conservan — puedes restaurarlos cuando quieras
              </div>
            </div>
          </div>

          {eliminados.length === 0 ? (
            <div style={{
              textAlign:'center', padding:'60px', color:'#aaa',
              background:'white', borderRadius:'10px'
            }}>
              <div style={{ fontSize:'48px', marginBottom:'12px' }}>✅</div>
              <div style={{ fontSize:'14px' }}>No hay clientes eliminados</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {eliminados.map((cli, i) => (
                <div key={cli.id} style={{
                  background:'white', borderRadius:'12px',
                  border:'1.5px solid #f5c6c6',
                  padding:'14px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)',
                  display:'flex', justifyContent:'space-between',
                  alignItems:'center', flexWrap:'wrap', gap:10
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'14px' }}>
                      {cli.nombre}
                    </div>
                    <div style={{ fontSize:'11px', color:'#888', marginTop:'3px' }}>
                      {cli.ruc && `RUC: ${cli.ruc} · `}
                      Eliminado por: {cli.eliminado_por || '—'} ·{' '}
                      {cli.eliminado_at
                        ? new Date(cli.eliminado_at).toLocaleString('es-EC', {
                            day:'2-digit', month:'2-digit', year:'numeric',
                            hour:'2-digit', minute:'2-digit'
                          })
                        : '—'}
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:8 }}>
                    <button
                      onClick={() => restaurarCliente(cli)}
                      disabled={restaurando}
                      style={{
                        padding:'7px 16px', background:'#27ae60',
                        color:'white', border:'none', borderRadius:'8px',
                        cursor:'pointer', fontSize:'12px', fontWeight:'bold'
                      }}>♻️ Restaurar</button>

                    <button
                      onClick={() => eliminarDefinitivo(cli)}
                      style={{
                        padding:'7px 12px', background:'#e74c3c',
                        color:'white', border:'none', borderRadius:'8px',
                        cursor:'pointer', fontSize:'12px'
                      }}>🗑️ Borrar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}