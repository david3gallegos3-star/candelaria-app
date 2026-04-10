// ============================================
// PanelComparador.js
// Comparador de fórmulas — actual vs historial
// ============================================
import React from 'react';

export default function PanelComparador({
  producto, mobile,
  ingredientesMP, ingredientesAD,
  totalCrudoG,
  fechasDisponibles, fechaComparar, setFechaComparar,
  formulaAnterior, setFormulaAnterior,
  cargandoCompar,
  cargarFormulaAnterior,
  setComparadorAbierto,
  norm,
}) {
  const filasAnt   = formulaAnterior?.filas || [];
  const antMP      = filasAnt.filter(f => f.seccion === 'MATERIAS PRIMAS');
  const antAD      = filasAnt.filter(f => f.seccion === 'CONDIMENTOS Y ADITIVOS');
  const totalGAnt  = filasAnt.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0);

  function colorDiff(act, ant) {
    if (ant === null) return '#1a1a2e';
    const d = act - ant;
    return d > 0 ? '#27ae60' : d < 0 ? '#e74c3c' : '#555';
  }

  function flechaDiff(act, ant) {
    if (ant === null) return '';
    const d = act - ant;
    return d > 0 ? ` ▲${d.toFixed(1)}` : d < 0 ? ` ▼${Math.abs(d).toFixed(1)}` : ' ═';
  }

  const TablaCompar = ({ listaAct, listaAnt, titulo, colorH }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{
        background:colorH, color:'white',
        padding:'8px 14px', fontWeight:'bold',
        fontSize:'13px', borderRadius:'8px 8px 0 0'
      }}>{titulo}</div>

      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
        <thead>
          <tr style={{ background:'#f0f2f5' }}>
            {[
              ['INGREDIENTE',  '35%', 'left'  ],
              ['ACTUAL (g)',   null,  'right' ],
              ['ANTERIOR (g)', null,  'right' ],
              ['DIFERENCIA',   null,  'right' ],
            ].map(([label, w, align]) => (
              <th key={label} style={{
                padding:'7px 10px', textAlign:align,
                color: label === 'ACTUAL (g)'   ? '#1a5276'
                     : label === 'ANTERIOR (g)' ? '#6c3483' : '#555',
                fontWeight:'bold', fontSize:'11px',
                width: w || undefined
              }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Filas actuales */}
          {listaAct.map((ing, i) => {
            const ant  = listaAnt.find(a =>
              norm(a.ingrediente_nombre) === norm(ing.ingrediente_nombre)
            );
            const gAct = parseFloat(ing.gramos) || 0;
            const gAnt = ant ? parseFloat(ant.gramos) || 0 : null;
            return (
              <tr key={i} style={{
                background: !ant ? '#e8f5e9' : (i % 2 === 0 ? '#fafafa' : 'white'),
                borderBottom:'1px solid #f0f0f0'
              }}>
                <td style={{ padding:'7px 10px', fontWeight:'bold', color:'#1a1a2e' }}>
                  {ing.ingrediente_nombre}
                  {ing.especificacion?.trim() ? ` (${ing.especificacion.trim()})` : ''}
                  {!ant && (
                    <span style={{
                      marginLeft:6, fontSize:'10px',
                      background:'#27ae60', color:'white',
                      padding:'1px 6px', borderRadius:8
                    }}>NUEVO</span>
                  )}
                </td>
                <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:'bold', color:'#1a5276' }}>
                  {gAct.toLocaleString()}
                </td>
                <td style={{ padding:'7px 10px', textAlign:'right', color:'#6c3483' }}>
                  {gAnt !== null ? gAnt.toLocaleString() : '—'}
                </td>
                <td style={{
                  padding:'7px 10px', textAlign:'right',
                  fontWeight:'bold', color:colorDiff(gAct, gAnt)
                }}>
                  {gAnt !== null ? flechaDiff(gAct, gAnt) : '—'}
                </td>
              </tr>
            );
          })}

          {/* Filas eliminadas */}
          {listaAnt
            .filter(a => !listaAct.find(act =>
              norm(act.ingrediente_nombre) === norm(a.ingrediente_nombre)
            ))
            .map((ant, i) => (
              <tr key={'del' + i} style={{
                background:'#fde8e8', borderBottom:'1px solid #f0f0f0'
              }}>
                <td style={{ padding:'7px 10px', color:'#e74c3c' }}>
                  {ant.ingrediente_nombre}
                  <span style={{
                    marginLeft:6, fontSize:'10px',
                    background:'#e74c3c', color:'white',
                    padding:'1px 6px', borderRadius:8
                  }}>ELIMINADO</span>
                </td>
                <td style={{ padding:'7px 10px', textAlign:'right', color:'#aaa' }}>—</td>
                <td style={{ padding:'7px 10px', textAlign:'right', color:'#e74c3c' }}>
                  {parseFloat(ant.gramos || 0).toLocaleString()}
                </td>
                <td style={{ padding:'7px 10px', textAlign:'right', color:'#e74c3c' }}>
                  ▼ {parseFloat(ant.gramos || 0).toLocaleString()}
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{
      background:'white', borderRadius:'12px',
      padding:'16px', boxShadow:'0 2px 12px rgba(0,0,0,0.12)',
      marginBottom:16
    }}>
      {/* Header */}
      <div style={{
        display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:16,
        borderBottom:'2px solid #3498db', paddingBottom:10
      }}>
        <div>
          <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'15px' }}>
            🔍 Comparador de Fórmulas
          </h3>
          <div style={{ fontSize:'12px', color:'#888', marginTop:3 }}>
            {producto.nombre}
          </div>
        </div>
        <button
          onClick={() => { setComparadorAbierto(false); setFormulaAnterior(null); }}
          style={{
            background:'#e74c3c', color:'white', border:'none',
            borderRadius:8, padding:'7px 14px',
            cursor:'pointer', fontWeight:'bold', fontSize:'13px'
          }}>✕ Cerrar</button>
      </div>

      {/* Selector fecha */}
      <div style={{
        background:'#f8f9fa', borderRadius:10,
        padding:'12px 16px', marginBottom:16,
        display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'
      }}>
        <div>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:4
          }}>Fecha a comparar:</label>

          {fechasDisponibles.length > 0 ? (
            <select
              value={fechaComparar}
              onChange={e => setFechaComparar(e.target.value)}
              style={{
                padding:'8px 14px', borderRadius:8,
                border:'1.5px solid #3498db',
                fontSize:'14px', fontWeight:'bold'
              }}>
              {fechasDisponibles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          ) : (
            <div style={{
              color:'#e74c3c', fontSize:'13px',
              padding:'8px 12px', background:'#fde8e8', borderRadius:8
            }}>Sin historial guardado</div>
          )}
        </div>

        {fechasDisponibles.length > 0 && (
          <button
            onClick={cargarFormulaAnterior}
            disabled={cargandoCompar}
            style={{
              padding:'9px 20px', background:'#3498db', color:'white',
              border:'none', borderRadius:8, cursor:'pointer',
              fontWeight:'bold', fontSize:'13px', marginTop:20
            }}>
            {cargandoCompar ? '⏳...' : '🔍 Comparar'}
          </button>
        )}
      </div>

      {/* Resultados */}
      {formulaAnterior && (
        <>
          {/* Totales */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
            gap:10, marginBottom:16
          }}>
            {[
              ['ACTUAL',     totalCrudoG.toLocaleString() + ' g', '#e8f4fd', '#1a5276'  ],
              ['ANTERIOR',   totalGAnt.toLocaleString()   + ' g', '#f3e5f5', '#6c3483'  ],
              ['DIFERENCIA',
                (totalCrudoG > totalGAnt ? '+' : '') +
                (totalCrudoG - totalGAnt).toLocaleString() + ' g',
                totalCrudoG >= totalGAnt ? '#e8f5e9' : '#fde8e8',
                totalCrudoG >= totalGAnt ? '#27ae60' : '#e74c3c'
              ],
            ].map(([l, v, bg, col]) => (
              <div key={l} style={{
                background:bg, borderRadius:10,
                padding:'10px', textAlign:'center'
              }}>
                <div style={{ fontSize:'10px', color:'#555', fontWeight:700 }}>{l}</div>
                <div style={{ fontSize:'18px', fontWeight:'bold', color:col }}>{v}</div>
              </div>
            ))}
          </div>

          <TablaCompar
            listaAct={ingredientesMP} listaAnt={antMP}
            titulo="🥩 MATERIAS PRIMAS" colorH="#1a5276"
          />
          <TablaCompar
            listaAct={ingredientesAD} listaAnt={antAD}
            titulo="🧂 CONDIMENTOS Y ADITIVOS" colorH="#6c3483"
          />
        </>
      )}
    </div>
  );
}