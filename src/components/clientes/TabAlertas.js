// ============================================
// TabAlertas.js
// Alertas de margen bajo por cliente/producto
// ============================================
import React from 'react';

export default function TabAlertas({
  mobile, esAdmin,
  alertas,
  abrirModalPrecio,
  precios,
}) {
  if (alertas.length === 0) {
    return (
      <div style={{
        textAlign:'center', padding:'60px', color:'#aaa',
        background:'white', borderRadius:'10px'
      }}>
        <div style={{ fontSize:'48px', marginBottom:'12px' }}>✅</div>
        <div style={{ fontSize:'14px', marginBottom:'4px', color:'#27ae60', fontWeight:'bold' }}>
          Todo en orden
        </div>
        <div style={{ fontSize:'13px' }}>
          Todos los precios están por encima del margen mínimo configurado
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Resumen ── */}
      <div style={{
        background:'#f8d7da', border:'1px solid #f5c6c6',
        borderRadius:'10px', padding:'12px 16px',
        marginBottom:'12px',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        flexWrap:'wrap', gap:8
      }}>
        <div>
          <div style={{ fontWeight:'bold', color:'#721c24', fontSize:'13px' }}>
            ⚠️ {alertas.length} alerta{alertas.length !== 1 ? 's' : ''} de margen bajo
          </div>
          <div style={{ fontSize:'12px', color:'#721c24', marginTop:'2px' }}>
            Estos precios están por debajo del margen mínimo configurado
          </div>
        </div>
        <div style={{
          background:'#721c24', color:'white',
          borderRadius:'8px', padding:'8px 14px',
          fontSize:'13px', fontWeight:'bold'
        }}>
          ${alertas.reduce((s, a) => s + a.diferencia, 0).toFixed(2)} de diferencia total
        </div>
      </div>

      {/* ── Cards alertas ── */}
      <div style={{
        display:'grid',
        gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
        gap:'12px'
      }}>
        {alertas.map((a, i) => {
          const precioObj = precios.find(p =>
            p.cliente_nombre  === a.cliente_nombre &&
            p.producto_nombre === a.producto_nombre
          );

          return (
            <div key={i} style={{
              background:'white', borderRadius:'12px',
              border:'2px solid #f5c6c6',
              overflow:'hidden',
              boxShadow:'0 2px 8px rgba(231,76,60,0.1)'
            }}>
              {/* Header */}
              <div style={{
                background:'#fff5f5', padding:'12px 14px',
                borderBottom:'1px solid #f5c6c6'
              }}>
                <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'13px' }}>
                  {a.producto_nombre}
                </div>
                <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>
                  Cliente: <strong>{a.cliente_nombre}</strong>
                </div>
              </div>

              {/* Datos */}
              <div style={{ padding:'12px 14px' }}>

                {/* Comparación precios */}
                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr',
                  gap:'8px', marginBottom:'10px'
                }}>
                  <div style={{
                    background:'#fde8e8', borderRadius:'8px',
                    padding:'8px 10px', textAlign:'center'
                  }}>
                    <div style={{ fontSize:'10px', color:'#721c24', fontWeight:'700' }}>
                      PRECIO ACTUAL
                    </div>
                    <div style={{ fontSize:'18px', fontWeight:'bold', color:'#e74c3c' }}>
                      ${a.precio_actual.toFixed(2)}
                    </div>
                  </div>
                  <div style={{
                    background:'#e8f5e9', borderRadius:'8px',
                    padding:'8px 10px', textAlign:'center'
                  }}>
                    <div style={{ fontSize:'10px', color:'#155724', fontWeight:'700' }}>
                      PRECIO SUGERIDO
                    </div>
                    <div style={{ fontSize:'18px', fontWeight:'bold', color:'#27ae60' }}>
                      ${a.precio_sugerido.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Detalles margen */}
                <div style={{
                  background:'#f8f9fa', borderRadius:'8px',
                  padding:'8px 12px', marginBottom:'10px'
                }}>
                  {[
                    ['Costo/kg',       `$${a.costo_kg.toFixed(4)}`,                   '#555'    ],
                    ['Margen actual',  `${(a.margen_actual * 100).toFixed(1)}%`,       '#e74c3c' ],
                    ['Margen mínimo',  `${(a.margen_minimo * 100).toFixed(1)}%`,       '#f39c12' ],
                    ['Diferencia',     `+$${a.diferencia.toFixed(4)}/kg necesario`,    '#3498db' ],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{
                      display:'flex', justifyContent:'space-between',
                      fontSize:'12px', marginBottom:'4px'
                    }}>
                      <span style={{ color:'#666' }}>{label}</span>
                      <span style={{ fontWeight:'bold', color }}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Barra visual margen */}
                <div style={{ marginBottom:'10px' }}>
                  <div style={{
                    display:'flex', justifyContent:'space-between',
                    fontSize:'10px', color:'#888', marginBottom:'3px'
                  }}>
                    <span>Margen actual: {(a.margen_actual * 100).toFixed(1)}%</span>
                    <span>Mínimo: {(a.margen_minimo * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{
                    height:'6px', background:'#f0f0f0',
                    borderRadius:'3px', overflow:'hidden'
                  }}>
                    <div style={{
                      height:'100%',
                      width:`${Math.min(100, Math.max(0, (a.margen_actual / a.margen_minimo) * 100))}%`,
                      background: a.margen_actual < 0 ? '#e74c3c'
                        : a.margen_actual < a.margen_minimo * 0.5 ? '#e74c3c' : '#f39c12',
                      borderRadius:'3px',
                      transition:'width 0.3s'
                    }} />
                  </div>
                </div>

                {/* Botón actualizar precio */}
                {esAdmin && precioObj && (
                  <button
                    onClick={() => abrirModalPrecio(precioObj)}
                    style={{
                      width:'100%', padding:'9px',
                      background:'#e74c3c', color:'white',
                      border:'none', borderRadius:'8px',
                      cursor:'pointer', fontSize:'12px',
                      fontWeight:'bold'
                    }}>
                    💰 Actualizar precio a ${a.precio_sugerido.toFixed(2)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}