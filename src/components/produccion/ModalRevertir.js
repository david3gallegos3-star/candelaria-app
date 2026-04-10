// ============================================
// ModalRevertir.js
// Modal para confirmar reversión de producción
// ============================================
import React from 'react';

export default function ModalRevertir({
  mobile,
  modalRevertir, setModalRevertir,
  guardando,
  revertirProduccion,
}) {
  if (!modalRevertir) return null;

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:3000
    }}>
      <div style={{
        background:'white', borderRadius:'14px',
        width: mobile ? '90%' : '440px',
        padding:'24px',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
      }}>

        {/* Icono */}
        <div style={{ fontSize:'36px', textAlign:'center', marginBottom:'12px' }}>
          ↩️
        </div>

        {/* Título */}
        <h3 style={{
          margin:'0 0 12px', color:'#c0392b',
          textAlign:'center', fontSize:'16px'
        }}>¿Revertir esta producción?</h3>

        {/* Info producción */}
        <div style={{
          background:'#f8f9fa', borderRadius:'8px',
          padding:'12px 14px', marginBottom:'16px',
          fontSize:'13px', color:'#555'
        }}>
          <div style={{ fontWeight:'bold', color:'#1a1a2e', marginBottom:'4px' }}>
            {modalRevertir.producto_nombre}
          </div>
          <div>
            {modalRevertir.num_paradas} paradas ·{' '}
            {parseFloat(modalRevertir.kg_producidos).toFixed(1)} kg ·{' '}
            {modalRevertir.fecha} {modalRevertir.turno}
          </div>
          {modalRevertir.nota && (
            <div style={{ marginTop:'6px', color:'#888', fontStyle:'italic' }}>
              📝 {modalRevertir.nota}
            </div>
          )}
          <div style={{
            marginTop:'10px', color:'#e74c3c',
            fontWeight:'bold', fontSize:'12px'
          }}>
            ⚠️ Esto devolverá todos los ingredientes al inventario
          </div>
        </div>

        {/* Ingredientes que se devolverán */}
        {modalRevertir.ingredientes_usados &&
          modalRevertir.ingredientes_usados.length > 0 && (
          <div style={{
            background:'#fde8e8', borderRadius:'8px',
            padding:'10px 12px', marginBottom:'16px'
          }}>
            <div style={{
              fontSize:'11px', fontWeight:'bold',
              color:'#721c24', marginBottom:'6px'
            }}>SE DEVOLVERÁ AL INVENTARIO:</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
              {modalRevertir.ingredientes_usados.map((ing, i) => (
                <span key={i} style={{
                  background:'white', padding:'2px 8px',
                  borderRadius:'6px', fontSize:'10px', color:'#721c24',
                  border:'1px solid #f5c6c6'
                }}>
                  {ing.ingrediente_nombre}: +{parseFloat(ing.kg_usados).toFixed(2)} kg
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Botones */}
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button
            onClick={() => setModalRevertir(null)}
            style={{
              padding:'10px 18px', background:'#95a5a6',
              color:'white', border:'none',
              borderRadius:'8px', cursor:'pointer'
            }}>Cancelar</button>

          <button
            onClick={() => revertirProduccion(modalRevertir)}
            disabled={guardando}
            style={{
              padding:'10px 20px', background:'#e74c3c',
              color:'white', border:'none', borderRadius:'8px',
              cursor: guardando ? 'not-allowed' : 'pointer',
              fontWeight:'bold',
              opacity: guardando ? 0.7 : 1
            }}>
            {guardando ? 'Revirtiendo...' : '↩️ Sí, revertir'}
          </button>
        </div>
      </div>
    </div>
  );
}