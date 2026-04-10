// ============================================
// ModalNotaInv.js
// Modal nota al admin desde inventario
// ============================================
import React from 'react';

export default function ModalNotaInv({
  mobile,
  modalNota, setModalNota,
  textoNota, setTextoNota,
  enviandoNota,
  enviarNota,
}) {
  if (!modalNota) return null;

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.6)',
      display:'flex',
      alignItems: mobile ? 'flex-end' : 'center',
      justifyContent:'center',
      zIndex:3000
    }}>
      <div style={{
        background:'white',
        borderRadius: mobile ? '16px 16px 0 0' : '12px',
        width: mobile ? '100%' : '480px',
        padding:'20px',
        boxShadow:'0 -4px 30px rgba(0,0,0,0.25)'
      }}>

        {/* Header */}
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:'14px'
        }}>
          <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'15px' }}>
            ✉️ Enviar nota al Administrador
          </h3>
          <button
            onClick={() => { setModalNota(false); setTextoNota(''); }}
            style={{
              background:'none', border:'none',
              fontSize:'18px', cursor:'pointer', color:'#aaa'
            }}>✕</button>
        </div>

        {/* Info módulo */}
        <div style={{ fontSize:'12px', color:'#888', marginBottom:'10px' }}>
          Módulo: <strong>Inventario</strong>
        </div>

        {/* Textarea */}
        <textarea
          value={textoNota}
          onChange={e => setTextoNota(e.target.value)}
          placeholder="Ej: Llegó nueva mercadería sin registrar..."
          rows={4}
          style={{
            width:'100%', padding:'10px',
            borderRadius:'8px', border:'1.5px solid #e67e22',
            fontSize:'14px', resize:'vertical',
            boxSizing:'border-box', fontFamily:'Arial'
          }}
        />

        {/* Botones */}
        <div style={{
          display:'flex', gap:'8px',
          marginTop:'12px', justifyContent:'flex-end'
        }}>
          <button
            onClick={() => { setModalNota(false); setTextoNota(''); }}
            style={{
              padding:'10px 18px', background:'#95a5a6',
              color:'white', border:'none',
              borderRadius:'8px', cursor:'pointer', fontSize:'13px'
            }}>Cancelar</button>

          <button
            onClick={enviarNota}
            disabled={enviandoNota || !textoNota.trim()}
            style={{
              padding:'10px 20px', background:'#e67e22',
              color:'white', border:'none', borderRadius:'8px',
              cursor: enviandoNota || !textoNota.trim()
                ? 'not-allowed' : 'pointer',
              fontSize:'13px', fontWeight:'bold',
              opacity: enviandoNota || !textoNota.trim() ? 0.7 : 1
            }}>
            {enviandoNota ? 'Enviando...' : '✉️ Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}