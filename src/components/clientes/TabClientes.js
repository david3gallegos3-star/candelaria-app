// ============================================
// TabClientes.js
// Lista de clientes con búsqueda
// ============================================
import React from 'react';

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
}) {
  return (
    <div>
      {/* ── Buscador ── */}
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

      {/* ── Grid de clientes ── */}
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
            const numPrecios = precios.filter(p => p.cliente_id === cli.id).length;
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
                overflow:'hidden',
                opacity: cli.activo ? 1 : 0.7,
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
                    <div style={{
                      fontWeight:'bold', color:'#1a1a2e', fontSize:'14px'
                    }}>{cli.nombre}</div>
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
                    cli.email    && { icon:'📧', val: cli.email    },
                    cli.telefono && { icon:'📞', val: cli.telefono },
                    cli.direccion&& { icon:'📍', val: cli.direccion },
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
    </div>
  );
}