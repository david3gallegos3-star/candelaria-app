// ============================================
// InventarioHeader.js
// Header sticky del módulo de inventario
// ============================================
import React from 'react';

export default function InventarioHeader({
  mobile, inventario, alertas,
  puedeEditar,
  setModalNota,
  setModalMerma,
  abrirCamara,
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
        display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom: mobile ? 8 : 0
      }}>
        {/* Izquierda — título */}
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
            }}>📦 Inventario de Materias Primas</div>
            <div style={{ color:'#aaa', fontSize:'11px' }}>
              {inventario.length} materias primas · {alertas} alertas
            </div>
          </div>
        </div>

        {/* Derecha — botones acción */}
        {puedeEditar && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setModalNota(true)} style={{
              background:'#e67e22', color:'white', border:'none',
              borderRadius:'8px',
              padding: mobile ? '8px 10px' : '8px 16px',
              cursor:'pointer',
              fontSize: mobile ? '12px' : '13px',
              fontWeight:'bold'
            }}>✉️ {mobile ? '' : 'Enviar nota'}</button>

            <button onClick={() => setModalMerma(true)} style={{
              background:'#c0392b', color:'white', border:'none',
              borderRadius:'8px',
              padding: mobile ? '8px 10px' : '8px 16px',
              cursor:'pointer',
              fontSize: mobile ? '12px' : '13px',
              fontWeight:'bold'
            }}>🗑️ {mobile ? '' : 'Registrar pérdida'}</button>

            <button onClick={abrirCamara} style={{
              background:'#8e44ad', color:'white', border:'none',
              borderRadius:'8px',
              padding: mobile ? '8px 10px' : '8px 16px',
              cursor:'pointer',
              fontSize: mobile ? '12px' : '13px',
              fontWeight:'bold'
            }}>📷 {mobile ? '' : 'Escanear factura'}</button>
          </div>
        )}
      </div>
    </div>
  );
}