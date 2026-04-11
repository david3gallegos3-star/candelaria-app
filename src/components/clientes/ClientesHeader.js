// ============================================
// ClientesHeader.js
// Header sticky del módulo de clientes
// ============================================
import React from 'react';

export default function ClientesHeader({
  mobile,
  clientes, alertas,
  tab, setTab,
  esAdmin,
  abrirModalCliente,
  abrirModalPrecio,
  onVolverMenu,
}) {
  return (
    <div style={{
      background:'linear-gradient(135deg,#1a1a2e,#16213e)',
      padding: mobile ? '10px 12px' : '14px 24px',
      position:'sticky', top:0, zIndex:100,
      boxShadow:'0 2px 10px rgba(0,0,0,0.3)'
    }}>
      {/* ── Fila principal ── */}
      <div style={{
        display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:8
      }}>
        {/* Izquierda */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={onVolverMenu} style={{
            background:'rgba(255,200,0,0.25)',
            border:'1px solid rgba(255,200,0,0.4)',
            color:'#ffd700', padding:'7px 10px',
            borderRadius:'8px', cursor:'pointer',
            fontSize:'12px', fontWeight:'bold'
          }}>🏠 Menú</button>

          <div>
            <div style={{
              color:'white', fontWeight:'bold',
              fontSize: mobile ? '14px' : '18px'
            }}>👥 Clientes</div>
            <div style={{ color:'#aaa', fontSize:'11px' }}>
              {clientes.length} clientes
              {alertas.length > 0 && (
                <span style={{
                  marginLeft:8, background:'#e74c3c',
                  color:'white', padding:'1px 7px',
                  borderRadius:8, fontSize:'10px', fontWeight:'bold'
                }}>
                  ⚠️ {alertas.length} alerta{alertas.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Botones acción */}
        {esAdmin && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => abrirModalPrecio()} style={{
              background:'#3498db', color:'white', border:'none',
              borderRadius:'8px',
              padding: mobile ? '8px 10px' : '8px 16px',
              cursor:'pointer',
              fontSize: mobile ? '12px' : '13px',
              fontWeight:'bold'
            }}>💰 {mobile ? '' : 'Asignar precio'}</button>

            <button onClick={() => abrirModalCliente()} style={{
              background:'#27ae60', color:'white', border:'none',
              borderRadius:'8px',
              padding: mobile ? '8px 10px' : '8px 16px',
              cursor:'pointer',
              fontSize: mobile ? '12px' : '13px',
              fontWeight:'bold'
            }}>➕ {mobile ? '' : 'Nuevo cliente'}</button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display:'flex', background:'rgba(255,255,255,0.08)',
        borderRadius:'10px', padding:'4px', gap:4
      }}>
        {[
          ['clientes',  '👥 Clientes'           ],
          ['precios',   '💰 Precios por cliente' ],
          ['alertas',   `⚠️ Alertas${alertas.length > 0 ? ` (${alertas.length})` : ''}`],
        ].map(([key, label]) => (
          <button key={key}
            onClick={() => setTab(key)}
            style={{
              flex:1,
              padding: mobile ? '7px 4px' : '8px 12px',
              border:'none', borderRadius:'7px', cursor:'pointer',
              fontSize: mobile ? '10px' : '12px',
              fontWeight:'bold',
              background: tab === key ? 'white' : 'transparent',
              color:      tab === key ? '#1a1a2e' : '#aaa',
              transition:'all 0.2s',
              whiteSpace:'nowrap'
            }}>{label}</button>
        ))}
      </div>
    </div>
  );
}