// ============================================
// ModalMerma.js
// Modal para registrar pérdida / merma
// ============================================
import React from 'react';

const MOTIVOS_PREDEFINIDOS = [
  'Producto en mal estado',
  'Derrame accidental',
  'Corte de luz / refrigeración',
  'Vencimiento',
  'Otro',
];

export default function ModalMerma({
  mobile,
  modalMerma, setModalMerma,
  mermaForm,  setMermaForm,
  inventario,
  guardando,
  guardarMerma,
}) {
  if (!modalMerma) return null;

  const mpSeleccionada = inventario.find(m => m.id === mermaForm.mp_id);
  const costoPerdido   = mermaForm.mp_id && mermaForm.kg
    ? (parseFloat(mermaForm.kg) * parseFloat(mpSeleccionada?.precio_kg || 0)).toFixed(2)
    : null;

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
        boxShadow:'0 -4px 30px rgba(0,0,0,0.2)',
        maxHeight: mobile ? '90vh' : 'auto',
        overflowY:'auto'
      }}>

        {/* Header */}
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:'16px'
        }}>
          <h3 style={{ margin:0, color:'#c0392b', fontSize:'15px' }}>
            🗑️ Registrar pérdida / merma
          </h3>
          <button
            onClick={() => setModalMerma(false)}
            style={{
              background:'none', border:'none',
              fontSize:'18px', cursor:'pointer', color:'#aaa'
            }}>✕</button>
        </div>

        {/* Materia Prima */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Materia Prima *</label>
          <select
            value={mermaForm.mp_id}
            onChange={e => setMermaForm({ ...mermaForm, mp_id: e.target.value })}
            style={{
              width:'100%', padding:'10px',
              borderRadius:'8px', border:'1.5px solid #ddd',
              fontSize:'13px'
            }}
          >
            <option value="">Selecciona...</option>
            {inventario
              .filter(m => m.stock_kg > 0)
              .map(m => (
                <option key={m.id} value={m.id}>
                  {m.nombre_producto || m.nombre} ({m.stock_kg.toFixed(1)} kg)
                </option>
              ))
            }
          </select>
        </div>

        {/* Kg perdidos */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Kg perdidos *</label>
          <input
            type="number"
            value={mermaForm.kg}
            onChange={e => setMermaForm({ ...mermaForm, kg: e.target.value })}
            placeholder="Ej: 12"
            style={{
              width:'100%', padding:'10px',
              borderRadius:'8px', border:'1.5px solid #e74c3c',
              fontSize:'14px', fontWeight:'bold',
              boxSizing:'border-box'
            }}
          />
          {/* Validar que no supere el stock */}
          {mermaForm.kg && mpSeleccionada &&
            parseFloat(mermaForm.kg) > mpSeleccionada.stock_kg && (
            <div style={{
              fontSize:'11px', color:'#e74c3c',
              marginTop:'4px', fontWeight:'bold'
            }}>
              ⚠️ Supera el stock disponible ({mpSeleccionada.stock_kg.toFixed(1)} kg)
            </div>
          )}
        </div>

        {/* Motivo */}
        <div style={{ marginBottom:'16px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Motivo *</label>

          {/* Botones predefinidos */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px' }}>
            {MOTIVOS_PREDEFINIDOS.map(m => (
              <button
                key={m}
                onClick={() => setMermaForm({ ...mermaForm, motivo: m })}
                style={{
                  padding:'5px 10px',
                  border: mermaForm.motivo === m
                    ? '2px solid #e74c3c' : '1px solid #ddd',
                  borderRadius:'6px',
                  background: mermaForm.motivo === m ? '#fde8e8' : 'white',
                  cursor:'pointer', fontSize:'12px',
                  color: mermaForm.motivo === m ? '#c0392b' : '#555'
                }}>{m}</button>
            ))}
          </div>

          {/* Input libre */}
          <input
            value={mermaForm.motivo}
            onChange={e => setMermaForm({ ...mermaForm, motivo: e.target.value })}
            placeholder="O escribe el motivo..."
            style={{
              width:'100%', padding:'8px',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px', boxSizing:'border-box'
            }}
          />
        </div>

        {/* Costo estimado */}
        {costoPerdido && (
          <div style={{
            background:'#fde8e8', borderRadius:'8px',
            padding:'8px 12px', fontSize:'12px',
            color:'#721c24', marginBottom:'14px'
          }}>
            Costo perdido estimado:{' '}
            <strong>${costoPerdido}</strong>
          </div>
        )}

        {/* Botones */}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button
            onClick={() => setModalMerma(false)}
            style={{
              padding:'10px 18px', background:'#95a5a6',
              color:'white', border:'none',
              borderRadius:'8px', cursor:'pointer'
            }}>Cancelar</button>

          <button
            onClick={guardarMerma}
            disabled={guardando || !mermaForm.mp_id || !mermaForm.kg || !mermaForm.motivo}
            style={{
              padding:'10px 22px', background:'#c0392b',
              color:'white', border:'none', borderRadius:'8px',
              cursor: guardando ? 'not-allowed' : 'pointer',
              fontWeight:'bold',
              opacity: guardando ? 0.7 : 1
            }}>
            {guardando ? 'Guardando...' : '🗑️ Registrar pérdida'}
          </button>
        </div>
      </div>
    </div>
  );
}