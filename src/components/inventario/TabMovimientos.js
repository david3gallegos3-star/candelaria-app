// ============================================
// TabMovimientos.js
// Tab de movimientos de inventario
// ============================================
import React from 'react';

export default function TabMovimientos({ movimientos }) {
  return (
    <div style={{
      background:'white', borderRadius:'10px',
      overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
    }}>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
          <thead>
            <tr style={{ background:'#1a1a2e', color:'white' }}>
              {['FECHA','MATERIA PRIMA','TIPO','KG','MOTIVO','USUARIO','VÍA'].map(h => (
                <th key={h} style={{
                  padding:'10px', textAlign:'left', fontSize:'11px'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m, i) => (
              <tr key={m.id} style={{
                background: i % 2 === 0 ? '#fafafa' : 'white',
                borderBottom:'1px solid #f0f0f0'
              }}>
                <td style={{ padding:'8px 10px', color:'#555', whiteSpace:'nowrap' }}>
                  {m.fecha}
                </td>

                <td style={{ padding:'8px 10px', fontWeight:'bold', color:'#1a1a2e' }}>
                  {m.nombre_mp}
                </td>

                <td style={{ padding:'8px 10px' }}>
                  <span style={{
                    background:
                      m.tipo === 'entrada' ? '#d4edda' :
                      m.tipo === 'perdida' ? '#f8d7da' : '#e8f4fd',
                    color:
                      m.tipo === 'entrada' ? '#155724' :
                      m.tipo === 'perdida' ? '#721c24' : '#1a5276',
                    padding:'2px 8px', borderRadius:'8px',
                    fontSize:'10px', fontWeight:'bold'
                  }}>{m.tipo.toUpperCase()}</span>
                </td>

                <td style={{
                  padding:'8px 10px', fontWeight:'bold',
                  color: m.kg > 0 ? '#27ae60' : '#e74c3c'
                }}>
                  {m.kg > 0 ? '+' : ''}{parseFloat(m.kg).toFixed(2)} kg
                </td>

                <td style={{ padding:'8px 10px', color:'#888', fontSize:'11px' }}>
                  {m.motivo}
                </td>

                <td style={{ padding:'8px 10px', color:'#555' }}>
                  {m.usuario_nombre}
                </td>

                <td style={{ padding:'8px 10px' }}>
                  <span style={{
                    background: m.via === 'camara' ? '#f3e5f5' : '#f0f0f0',
                    color:      m.via === 'camara' ? '#6c3483' : '#888',
                    padding:'2px 7px', borderRadius:'6px', fontSize:'10px'
                  }}>
                    {m.via === 'camara' ? '📷 IA' : '✏️ Manual'}
                  </span>
                </td>
              </tr>
            ))}

            {movimientos.length === 0 && (
              <tr>
                <td colSpan={7} style={{
                  textAlign:'center', padding:'40px', color:'#aaa'
                }}>Sin movimientos registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}