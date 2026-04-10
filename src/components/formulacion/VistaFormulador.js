// ============================================
// VistaFormulador.js
// Vista solo lectura para el rol formulador
// ============================================
import React from 'react';

export default function VistaFormulador({
  producto, mobile,
  ingredientesMP, ingredientesAD,
  totMP, totAD, totalCrudoG, totalCrudoKg,
  modalNota, setModalNota,
  textoNota, setTextoNota,
  enviandoNota, enviarNota,
  msgExito,
  onVolver, onVolverMenu,
}) {
  const thS = {
    padding:'8px 12px', fontSize:'11px', color:'#888',
    fontWeight:'700', textAlign:'left', borderBottom:'1px solid #ddd',
    textTransform:'uppercase', letterSpacing:'0.8px'
  };
  const thR = { ...thS, textAlign:'right' };

  const RowF = ({ ing }) => {
    const g = parseFloat(ing.gramos) || 0;
    const nombre = ing.ingrediente_nombre +
      (ing.especificacion?.trim() ? ` (${ing.especificacion.trim()})` : '');
    return (
      <tr style={{ borderBottom:'1px solid #f5f5f5' }}>
        <td style={{ padding:'7px 12px', fontSize:'13px' }}>{nombre}</td>
        <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:'700', color:'#333' }}>
          {Math.round(g)}
        </td>
        <td style={{ padding:'7px 12px', textAlign:'right', color:'#555' }}>
          {(g / 1000).toFixed(3)}
        </td>
      </tr>
    );
  };

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'"Segoe UI", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{
        background:'linear-gradient(135deg,#1a1a2e,#16213e)',
        padding: mobile ? '10px 12px' : '12px 20px',
        position:'sticky', top:0, zIndex:100,
        boxShadow:'0 2px 12px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={onVolverMenu} style={{
              background:'rgba(255,200,0,0.25)',
              border:'1px solid rgba(255,200,0,0.4)',
              color:'#ffd700', padding:'7px 10px',
              borderRadius:'7px', cursor:'pointer',
              fontSize:'12px', fontWeight:'bold'
            }}>🏠 Menú</button>
            <button onClick={onVolver} style={{
              background:'rgba(255,255,255,0.15)',
              border:'1px solid rgba(255,255,255,0.25)',
              color:'white', padding:'7px 12px',
              borderRadius:'7px', cursor:'pointer', fontSize:'12px'
            }}>← Volver</button>
            <div>
              <div style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '13px' : '16px' }}>
                🧪 {producto.nombre}
              </div>
              <div style={{ color:'#aaa', fontSize:'10px' }}>🔒 Solo lectura — Formulador</div>
            </div>
          </div>
          <button onClick={() => setModalNota(true)} style={{
            background:'#e67e22', color:'white', border:'none',
            borderRadius:'8px', padding: mobile ? '8px 12px' : '8px 16px',
            cursor:'pointer', fontSize: mobile ? '12px' : '13px', fontWeight:'bold'
          }}>
            ✉️ {mobile ? 'Nota' : 'Enviar nota al Ingeniero'}
          </button>
        </div>
      </div>

      {msgExito && (
        <div style={{
          background:'#d4edda', color:'#155724',
          padding:'10px 16px', fontWeight:'bold',
          fontSize:'13px', textAlign:'center'
        }}>{msgExito}</div>
      )}

      {/* Contenido */}
      <div style={{ padding: mobile ? '10px' : '16px 20px' }}>

        {/* Materias Primas */}
        <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', marginBottom:'10px',
          boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ background:'#1a5276', padding:'8px 14px' }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize:'13px' }}>
              🥩 MATERIAS PRIMAS
            </span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={thS}>INGREDIENTE</th>
                <th style={thR}>GRAMOS</th>
                <th style={thR}>KILOS</th>
              </tr>
            </thead>
            <tbody>
              {ingredientesMP.filter(i => i.ingrediente_nombre).map((ing, i) => (
                <RowF key={i} ing={ing} />
              ))}
              <tr style={{ background:'#e8f5fb', borderTop:'2px solid #aed6f1' }}>
                <td style={{ padding:'8px 12px', fontWeight:'bold', color:'#1a5276' }}>SUB-TOTAL</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:'bold', color:'#1a5276' }}>
                  {Math.round(totMP.gramos)}
                </td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:'bold', color:'#1a5276' }}>
                  {(totMP.gramos / 1000).toFixed(3)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Condimentos */}
        <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', marginBottom:'10px',
          boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ background:'#6c3483', padding:'8px 14px' }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize:'13px' }}>
              🧂 CONDIMENTOS Y ADITIVOS
            </span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={thS}>INGREDIENTE</th>
                <th style={thR}>GRAMOS</th>
                <th style={thR}>KILOS</th>
              </tr>
            </thead>
            <tbody>
              {ingredientesAD.filter(i => i.ingrediente_nombre).map((ing, i) => (
                <RowF key={i} ing={ing} />
              ))}
              <tr style={{ background:'#f5eef8', borderTop:'2px solid #d2b4de' }}>
                <td style={{ padding:'8px 12px', fontWeight:'bold', color:'#6c3483' }}>SUB-TOTAL</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:'bold', color:'#6c3483' }}>
                  {Math.round(totAD.gramos)}
                </td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:'bold', color:'#6c3483' }}>
                  {(totAD.gramos / 1000).toFixed(3)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total crudo */}
        <div style={{
          background:'#1a3a5c', borderRadius:'10px',
          padding:'12px 16px',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <span style={{ color:'white', fontWeight:'bold', fontSize:'14px' }}>TOTAL CRUDO</span>
          <div style={{ display:'flex', gap:28 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#aaa', fontSize:'9px', fontWeight:700 }}>GRAMOS</div>
              <div style={{ color:'white', fontWeight:'bold', fontSize:'16px' }}>
                {Math.round(totalCrudoG)}
              </div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#aaa', fontSize:'9px', fontWeight:700 }}>KILOS</div>
              <div style={{ color:'#f39c12', fontWeight:'bold', fontSize:'16px' }}>
                {totalCrudoKg.toFixed(3)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal nota */}
      {modalNota && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.6)',
          display:'flex',
          alignItems: mobile ? 'flex-end' : 'center',
          justifyContent:'center', zIndex:3000
        }}>
          <div style={{
            background:'white',
            borderRadius: mobile ? '16px 16px 0 0' : '12px',
            width: mobile ? '100%' : '480px',
            padding:'20px'
          }}>
            <div style={{
              display:'flex', justifyContent:'space-between',
              alignItems:'center', marginBottom:'14px'
            }}>
              <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'15px' }}>
                ✉️ Enviar nota al Ingeniero
              </h3>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{
                background:'none', border:'none',
                fontSize:'18px', cursor:'pointer', color:'#aaa'
              }}>✕</button>
            </div>
            <div style={{ fontSize:'12px', color:'#888', marginBottom:'10px' }}>
              Producto: <strong>{producto.nombre}</strong>
            </div>
            <textarea
              value={textoNota}
              onChange={e => setTextoNota(e.target.value)}
              placeholder="Escribe tu nota aquí..."
              rows={4}
              style={{
                width:'100%', padding:'10px', borderRadius:'8px',
                border:'1.5px solid #e67e22', fontSize:'14px',
                resize:'vertical', boxSizing:'border-box', fontFamily:'Arial'
              }}
            />
            <div style={{ display:'flex', gap:'8px', marginTop:'12px', justifyContent:'flex-end' }}>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{
                padding:'10px 18px', background:'#95a5a6', color:'white',
                border:'none', borderRadius:'8px', cursor:'pointer'
              }}>Cancelar</button>
              <button
                onClick={enviarNota}
                disabled={enviandoNota || !textoNota.trim()}
                style={{
                  padding:'10px 20px', background:'#e67e22', color:'white',
                  border:'none', borderRadius:'8px',
                  cursor:'pointer', fontWeight:'bold'
                }}>
                {enviandoNota ? 'Enviando...' : '✉️ Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}