// ============================================
// TabMermas.js
// Tab de pérdidas / mermas
// ============================================
import React from 'react';

export default function TabMermas({ mermas, puedeEditar, setModalMerma }) {

  const totalKg    = mermas.reduce((s, m) => s + parseFloat(m.kg_perdidos  || 0), 0);
  const totalCosto = mermas.reduce((s, m) => s + parseFloat(m.costo_perdido|| 0), 0);

  return (
    <div>
      {/* ── Resumen ── */}
      <div style={{
        background:'#f8d7da', border:'1px solid #f5c6c6',
        borderRadius:'10px', padding:'12px 16px',
        marginBottom:'12px',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <div>
          <div style={{ fontWeight:'bold', color:'#721c24', fontSize:'13px' }}>
            Total pérdidas registradas
          </div>
          <div style={{ color:'#721c24', fontSize:'12px' }}>
            {totalKg.toFixed(2)} kg · ${totalCosto.toFixed(2)}
          </div>
        </div>

        {puedeEditar && (
          <button
            onClick={() => setModalMerma(true)}
            style={{
              background:'#c0392b', color:'white', border:'none',
              borderRadius:'8px', padding:'8px 16px',
              cursor:'pointer', fontSize:'13px', fontWeight:'bold'
            }}>+ Registrar pérdida</button>
        )}
      </div>

      {/* ── Tabla ── */}
      <div style={{
        background:'white', borderRadius:'10px',
        overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <thead>
              <tr style={{ background:'#c0392b', color:'white' }}>
                {['FECHA','MATERIA PRIMA','KG PERDIDOS','COSTO PERDIDO','MOTIVO','REGISTRADO POR']
                  .map(h => (
                    <th key={h} style={{
                      padding:'10px', textAlign:'left', fontSize:'11px'
                    }}>{h}</th>
                  ))
                }
              </tr>
            </thead>
            <tbody>
              {mermas.map((m, i) => (
                <tr key={m.id} style={{
                  background: i % 2 === 0 ? '#fff5f5' : 'white',
                  borderBottom:'1px solid #f0f0f0'
                }}>
                  <td style={{ padding:'8px 10px', color:'#555' }}>
                    {m.fecha}
                  </td>

                  <td style={{ padding:'8px 10px', fontWeight:'bold', color:'#1a1a2e' }}>
                    {m.nombre_mp}
                  </td>

                  <td style={{ padding:'8px 10px', color:'#e74c3c', fontWeight:'bold' }}>
                    -{parseFloat(m.kg_perdidos).toFixed(2)} kg
                  </td>

                  <td style={{ padding:'8px 10px', color:'#e74c3c', fontWeight:'bold' }}>
                    -${parseFloat(m.costo_perdido || 0).toFixed(2)}
                  </td>

                  <td style={{ padding:'8px 10px', color:'#888' }}>
                    {m.motivo}
                  </td>

                  <td style={{ padding:'8px 10px', color:'#555' }}>
                    {m.usuario_nombre}
                  </td>
                </tr>
              ))}

              {mermas.length === 0 && (
                <tr>
                  <td colSpan={6} style={{
                    textAlign:'center', padding:'40px', color:'#aaa'
                  }}>Sin pérdidas registradas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}