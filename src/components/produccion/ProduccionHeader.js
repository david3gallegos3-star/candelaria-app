// ============================================
// ProduccionHeader.js
// Header sticky + stats de producción
// ============================================
import React from 'react';

export default function ProduccionHeader({
  mobile,
  kgHoy, costoHoy, kgMes, costoMes,
  setModalNota,
  onVolverMenu,
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
            }}>🏭 Producción</div>
            <div style={{ color:'#aaa', fontSize:'11px' }}>
              {kgHoy.toFixed(1)} kg hoy · {kgMes.toFixed(1)} kg este mes
            </div>
          </div>
        </div>

        {/* Derecha */}
        <button onClick={() => setModalNota(true)} style={{
          background:'#e67e22', color:'white', border:'none',
          borderRadius:'8px',
          padding: mobile ? '8px 10px' : '8px 16px',
          cursor:'pointer',
          fontSize: mobile ? '12px' : '13px',
          fontWeight:'bold'
        }}>✉️ {mobile ? '' : 'Enviar nota'}</button>
      </div>
    </div>
  );
}