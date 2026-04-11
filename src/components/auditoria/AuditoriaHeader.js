// ============================================
// AuditoriaHeader.js
// Header sticky del módulo de auditoría
// ============================================
import React from 'react';

export default function AuditoriaHeader({
  mobile,
  registros, noLeidas,
  cargando,
  onVolverMenu,
  exportarExcel,
}) {
  return (
    <div style={{
      background:'linear-gradient(135deg,#1a1a2e,#16213e)',
      padding: mobile ? '10px 12px' : '14px 24px',
      position:'sticky', top:0, zIndex:100,
      boxShadow:'0 2px 10px rgba(0,0,0,0.3)'
    }}>
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center'
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
            }}>🗂️ Auditoría</div>
            <div style={{ color:'#aaa', fontSize:'11px' }}>
              {registros.length} registros
              {noLeidas > 0 && (
                <span style={{
                  marginLeft:8, background:'#e74c3c',
                  color:'white', padding:'1px 7px',
                  borderRadius:8, fontSize:'10px', fontWeight:'bold'
                }}>
                  {noLeidas} no leídas
                </span>
              )}
              {cargando && (
                <span style={{
                  marginLeft:8, color:'#f39c12', fontSize:'10px'
                }}>⏳ buscando...</span>
              )}
            </div>
          </div>
        </div>

        {/* Derecha — botones */}
        <div style={{ display:'flex', gap:8 }}>
          <button
            onClick={exportarExcel}
            disabled={registros.length === 0}
            style={{
              background: registros.length === 0 ? '#555' : '#27ae60',
              color:'white', border:'none',
              borderRadius:'8px',
              padding: mobile ? '8px 10px' : '8px 16px',
              cursor: registros.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: mobile ? '12px' : '13px',
              fontWeight:'bold',
              opacity: registros.length === 0 ? 0.6 : 1
            }}>
            📥 {mobile ? '' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      {/* Info solo lectura */}
      <div style={{
        marginTop:8, background:'rgba(255,255,255,0.06)',
        borderRadius:'8px', padding:'6px 12px',
        display:'flex', alignItems:'center', gap:8
      }}>
        <span style={{ fontSize:'11px', color:'#aaa' }}>
          🔒 Historial permanente — solo lectura. Nadie puede borrar registros,
          ni el administrador.
        </span>
      </div>
    </div>
  );
}