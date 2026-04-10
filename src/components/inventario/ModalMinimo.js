// ============================================
// ModalMinimo.js
// Modal para configurar stock mínimo
// ============================================
import React from 'react';

export default function ModalMinimo({
  modalMinimo, setModalMinimo,
  minimoKg,    setMinimoKg,
  guardarMinimo,
}) {
  if (!modalMinimo) return null;

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:3000
    }}>
      <div style={{
        background:'white', borderRadius:'14px',
        width:'380px', padding:'20px',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
      }}>

        {/* Header */}
        <h3 style={{ margin:'0 0 14px', color:'#1a1a2e' }}>
          ⚠️ Stock mínimo
        </h3>

        {/* Info MP */}
        <div style={{ fontSize:'13px', color:'#555', marginBottom:'12px' }}>
          <strong>{modalMinimo.nombre_producto || modalMinimo.nombre}</strong>
          <br/>
          <span style={{ fontSize:'12px', color:'#888' }}>
            Cuando baje de este nivel se enviará alerta al admin
          </span>
        </div>

        {/* Input */}
        <input
          type="number"
          value={minimoKg}
          onChange={e => setMinimoKg(e.target.value)}
          placeholder="Kg mínimos..."
          style={{
            width:'100%', padding:'10px',
            borderRadius:'8px', border:'1.5px solid #f39c12',
            fontSize:'15px', fontWeight:'bold',
            boxSizing:'border-box', marginBottom:'14px'
          }}
        />

        {/* Preview */}
        {minimoKg && parseFloat(minimoKg) > 0 && (
          <div style={{
            background:'#fff3cd', borderRadius:'8px',
            padding:'8px 12px', fontSize:'12px',
            color:'#856404', marginBottom:'14px'
          }}>
            Alerta cuando stock baje de{' '}
            <strong>{parseFloat(minimoKg).toFixed(1)} kg</strong>
          </div>
        )}

        {/* Botones */}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button
            onClick={() => { setModalMinimo(null); setMinimoKg(''); }}
            style={{
              padding:'9px 18px', background:'#95a5a6',
              color:'white', border:'none',
              borderRadius:'8px', cursor:'pointer'
            }}>Cancelar</button>

          <button
            onClick={guardarMinimo}
            style={{
              padding:'9px 20px', background:'#f39c12',
              color:'white', border:'none', borderRadius:'8px',
              cursor:'pointer', fontWeight:'bold'
            }}>✅ Guardar</button>
        </div>
      </div>
    </div>
  );
}