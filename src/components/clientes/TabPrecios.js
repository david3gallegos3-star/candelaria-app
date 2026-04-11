// ============================================
// TabPrecios.js
// Precios por cliente y producto
// ============================================
import React from 'react';

export default function TabPrecios({
  mobile, esAdmin,
  preciosFiltrados,
  clienteSel, setClienteSel,
  clientes,
  abrirModalPrecio,
  eliminarPrecio,
  getPrecioSistema,
  getCostoSistema,
}) {
  return (
    <div>
      {/* ── Filtro cliente seleccionado ── */}
      {clienteSel && (
        <div style={{
          background:'#e8f4fd', border:'1px solid #3498db',
          borderRadius:'10px', padding:'10px 16px',
          marginBottom:'12px',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <div style={{ fontSize:'13px', color:'#1a5276' }}>
            Mostrando precios de:{' '}
            <strong>{clienteSel.nombre}</strong>
          </div>
          <button
            onClick={() => setClienteSel(null)}
            style={{
              background:'#3498db', color:'white',
              border:'none', borderRadius:'7px',
              padding:'5px 12px', cursor:'pointer', fontSize:'12px'
            }}>Ver todos</button>
        </div>
      )}

      {/* ── Tabla precios ── */}
      {preciosFiltrados.length === 0 ? (
        <div style={{
          textAlign:'center', padding:'60px', color:'#aaa',
          background:'white', borderRadius:'10px'
        }}>
          <div style={{ fontSize:'48px', marginBottom:'12px' }}>💰</div>
          <div style={{ fontSize:'14px', marginBottom:'8px' }}>
            {clienteSel
              ? `Sin precios configurados para ${clienteSel.nombre}`
              : 'Sin precios configurados'}
          </div>
          {esAdmin && (
            <button
              onClick={() => abrirModalPrecio(null, clienteSel)}
              style={{
                marginTop:'12px', padding:'10px 20px',
                background:'#3498db', color:'white',
                border:'none', borderRadius:'8px',
                cursor:'pointer', fontWeight:'bold'
              }}>💰 Asignar primer precio</button>
          )}
        </div>
      ) : mobile ? (

        /* ── Cards mobile ── */
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {preciosFiltrados.map(p => {
            const costoKg       = getCostoSistema(p.producto_nombre);
            const precioSistema = getPrecioSistema(p.producto_nombre);
            const precioVenta   = parseFloat(p.precio_venta_kg) || 0;
            const margenActual  = costoKg > 0
              ? ((precioVenta - costoKg) / costoKg * 100).toFixed(1)
              : null;
            const margenMin     = parseFloat(p.margen_minimo) * 100;
            const bajoMargen    = margenActual !== null &&
              parseFloat(margenActual) < margenMin;

            return (
              <div key={p.id} style={{
                background:'white', borderRadius:'12px',
                border:`1.5px solid ${bajoMargen ? '#f5c6c6' : '#e0e0e0'}`,
                overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)'
              }}>
                <div style={{
                  padding:'10px 14px',
                  background: bajoMargen ? '#fff5f5' : '#f8f9fa',
                  borderBottom:'1px solid #f0f0f0',
                  display:'flex', justifyContent:'space-between'
                }}>
                  <div>
                    <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'13px' }}>
                      {p.producto_nombre}
                    </div>
                    <div style={{ fontSize:'11px', color:'#888' }}>
                      {p.cliente_nombre}
                    </div>
                  </div>
                  {bajoMargen && (
                    <span style={{
                      background:'#f8d7da', color:'#721c24',
                      padding:'2px 8px', borderRadius:'8px',
                      fontSize:'10px', fontWeight:'bold',
                      alignSelf:'flex-start'
                    }}>⚠️ Margen bajo</span>
                  )}
                </div>

                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
                  padding:'8px 12px', gap:'8px'
                }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>
                      PRECIO CLIENTE
                    </div>
                    <div style={{
                      fontSize:'16px', fontWeight:'bold',
                      color: bajoMargen ? '#e74c3c' : '#27ae60'
                    }}>
                      ${precioVenta.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>
                      PRECIO SISTEMA
                    </div>
                    <div style={{ fontSize:'14px', fontWeight:'bold', color:'#555' }}>
                      ${precioSistema.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>
                      MARGEN
                    </div>
                    <div style={{
                      fontSize:'14px', fontWeight:'bold',
                      color: bajoMargen ? '#e74c3c' : '#27ae60'
                    }}>
                      {margenActual !== null ? `${margenActual}%` : '—'}
                    </div>
                  </div>
                </div>

                {esAdmin && (
                  <div style={{ padding:'6px 12px 10px', display:'flex', gap:6 }}>
                    <button
                      onClick={() => abrirModalPrecio(p)}
                      style={{
                        flex:1, padding:'7px',
                        background:'#e8f4fd', color:'#1a5276',
                        border:'none', borderRadius:'7px',
                        cursor:'pointer', fontSize:'12px', fontWeight:'bold'
                      }}>✏️ Editar</button>
                    <button
                      onClick={() => eliminarPrecio(p.id)}
                      style={{
                        padding:'7px 12px', background:'#fde8e8',
                        color:'#721c24', border:'none',
                        borderRadius:'7px', cursor:'pointer', fontSize:'12px'
                      }}>🗑️</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : (
        /* ── Tabla desktop ── */
        <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#1a1a2e', color:'white' }}>
                  {['CLIENTE','PRODUCTO','PRECIO CLIENTE','PRECIO SISTEMA',
                    'COSTO KG','MARGEN ACTUAL','MARGEN MÍN','ESTADO','ACCIONES']
                    .map(h => (
                      <th key={h} style={{
                        padding:'10px', textAlign:'left',
                        fontSize:'11px', whiteSpace:'nowrap'
                      }}>{h}</th>
                    ))
                  }
                </tr>
              </thead>
              <tbody>
                {preciosFiltrados.map((p, i) => {
                  const costoKg       = getCostoSistema(p.producto_nombre);
                  const precioSistema = getPrecioSistema(p.producto_nombre);
                  const precioVenta   = parseFloat(p.precio_venta_kg) || 0;
                  const margenActual  = costoKg > 0
                    ? ((precioVenta - costoKg) / costoKg * 100).toFixed(1)
                    : null;
                  const margenMin     = parseFloat(p.margen_minimo) * 100;
                  const bajoMargen    = margenActual !== null &&
                    parseFloat(margenActual) < margenMin;

                  return (
                    <tr key={p.id} style={{
                      background: bajoMargen
                        ? '#fff5f5'
                        : i % 2 === 0 ? '#fafafa' : 'white',
                      borderBottom:'1px solid #f0f0f0'
                    }}>
                      <td style={{ padding:'9px 10px', fontWeight:'bold', color:'#1a1a2e' }}>
                        {p.cliente_nombre}
                      </td>
                      <td style={{ padding:'9px 10px', color:'#555' }}>
                        {p.producto_nombre}
                      </td>
                      <td style={{ padding:'9px 10px', fontWeight:'bold',
                        color: bajoMargen ? '#e74c3c' : '#27ae60'
                      }}>
                        ${precioVenta.toFixed(4)}
                      </td>
                      <td style={{ padding:'9px 10px', color:'#555' }}>
                        ${precioSistema.toFixed(4)}
                      </td>
                      <td style={{ padding:'9px 10px', color:'#888' }}>
                        ${costoKg.toFixed(4)}
                      </td>
                      <td style={{ padding:'9px 10px', fontWeight:'bold',
                        color: bajoMargen ? '#e74c3c' : '#27ae60'
                      }}>
                        {margenActual !== null ? `${margenActual}%` : '—'}
                      </td>
                      <td style={{ padding:'9px 10px', color:'#555' }}>
                        {margenMin.toFixed(0)}%
                      </td>
                      <td style={{ padding:'9px 10px' }}>
                        {bajoMargen ? (
                          <span style={{
                            background:'#f8d7da', color:'#721c24',
                            padding:'2px 8px', borderRadius:'8px',
                            fontSize:'10px', fontWeight:'bold'
                          }}>⚠️ Bajo</span>
                        ) : (
                          <span style={{
                            background:'#d4edda', color:'#155724',
                            padding:'2px 8px', borderRadius:'8px',
                            fontSize:'10px', fontWeight:'bold'
                          }}>✓ OK</span>
                        )}
                      </td>
                      <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>
                        {esAdmin && (
                          <>
                            <button
                              onClick={() => abrirModalPrecio(p)}
                              style={{
                                padding:'4px 10px', background:'#3498db',
                                color:'white', border:'none', borderRadius:'6px',
                                cursor:'pointer', fontSize:'11px', marginRight:4
                              }}>✏️</button>
                            <button
                              onClick={() => eliminarPrecio(p.id)}
                              style={{
                                padding:'4px 10px', background:'#e74c3c',
                                color:'white', border:'none', borderRadius:'6px',
                                cursor:'pointer', fontSize:'11px'
                              }}>🗑️</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}