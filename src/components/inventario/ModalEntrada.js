// ============================================
// ModalEntrada.js
// Modal para entrada manual de inventario
// ============================================
import React from 'react';

export default function ModalEntrada({
  mobile,
  modalEntrada, setModalEntrada,
  entradaKg,    setEntradaKg,
  entradaPrecio,setEntradaPrecio,
  entradaNota,  setEntradaNota,
  guardando,
  guardarEntrada,
}) {
  if (!modalEntrada) return null;
  const { inv } = modalEntrada;

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
        borderRadius: mobile ? '16px 16px 0 0' : '14px',
        width: mobile ? '100%' : '460px',
        padding:'20px',
        boxShadow:'0 -4px 30px rgba(0,0,0,0.2)'
      }}>

        {/* Header */}
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:'16px'
        }}>
          <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'15px' }}>
            + Entrada de inventario
          </h3>
          <button
            onClick={() => setModalEntrada(null)}
            style={{
              background:'none', border:'none',
              fontSize:'18px', cursor:'pointer', color:'#aaa'
            }}>✕</button>
        </div>

        {/* Info MP */}
        <div style={{
          background:'#e8f5e9', borderRadius:'8px',
          padding:'10px 14px', marginBottom:'16px'
        }}>
          <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'14px' }}>
            {inv.nombre_producto || inv.nombre}
          </div>
          <div style={{ fontSize:'12px', color:'#555' }}>
            Stock actual: <strong>{inv.stock_kg} kg</strong>
          </div>
        </div>

        {/* Campos */}
        {[
          ['Kg a ingresar *',       entradaKg,    setEntradaKg,    'number', 'Ej: 120'],
          ['Precio/kg (opcional)',   entradaPrecio,setEntradaPrecio,'number', `Actual: $${parseFloat(inv.precio_kg || 0).toFixed(2)}`],
          ['Nota (opcional)',        entradaNota,  setEntradaNota,  'text',   'Ej: Factura proveedor X'],
        ].map(([label, val, setter, type, placeholder]) => (
          <div key={label} style={{ marginBottom:'12px' }}>
            <label style={{
              fontSize:'12px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:'4px'
            }}>{label}</label>
            <input
              type={type}
              value={val}
              onChange={e => setter(e.target.value)}
              placeholder={placeholder}
              style={{
                width:'100%', padding:'10px',
                borderRadius:'8px', border:'1.5px solid #ddd',
                fontSize:'14px', boxSizing:'border-box'
              }}
            />
          </div>
        ))}

        {/* Preview stock */}
        {entradaKg && parseFloat(entradaKg) > 0 && (
          <div style={{
            background:'#e8f5e9', borderRadius:'8px',
            padding:'8px 12px', fontSize:'12px',
            color:'#155724', marginBottom:'14px'
          }}>
            Stock quedará en:{' '}
            <strong>
              {(inv.stock_kg + parseFloat(entradaKg)).toFixed(2)} kg
            </strong>
          </div>
        )}

        {/* Botones */}
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button
            onClick={() => setModalEntrada(null)}
            style={{
              padding:'10px 18px', background:'#95a5a6',
              color:'white', border:'none',
              borderRadius:'8px', cursor:'pointer'
            }}>Cancelar</button>

          <button
            onClick={guardarEntrada}
            disabled={guardando || !entradaKg || parseFloat(entradaKg) <= 0}
            style={{
              padding:'10px 22px', background:'#27ae60',
              color:'white', border:'none', borderRadius:'8px',
              cursor: guardando || !entradaKg || parseFloat(entradaKg) <= 0
                ? 'not-allowed' : 'pointer',
              fontWeight:'bold',
              opacity: guardando || !entradaKg || parseFloat(entradaKg) <= 0 ? 0.7 : 1
            }}>
            {guardando ? 'Guardando...' : '✅ Confirmar entrada'}
          </button>
        </div>
      </div>
    </div>
  );
}