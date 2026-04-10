// ============================================
// SeccionIngredientes.js
// Tabla editable de ingredientes (MP y AD)
// ============================================
import React from 'react';
import { GramosInput, NoteInput, EspecInput } from './FormulacionInputs';

const COLS = [
  { label:'INGREDIENTE',    w:'24%', align:'left'   },
  { label:'ESPECIFICACIÓN', w:'14%', align:'left'   },
  { label:'GRAMOS',         w:'10%', align:'right'  },
  { label:'KILOS',          w:'7%',  align:'right'  },
  { label:'%',              w:'6%',  align:'right'  },
  { label:'NOTA',           w:'12%', align:'left'   },
  { label:'$/KG',           w:'9%',  align:'right'  },
  { label:'COSTO',          w:'9%',  align:'right'  },
  { label:'',               w:'5%',  align:'center' },
  { label:'⠿',              w:'4%',  align:'center' },
];

const sTh = {
  padding:'9px 8px', textAlign:'left',
  fontSize:'11px', fontWeight:'700', color:'white'
};
const sTd = {
  padding:'6px 5px', fontSize:'12px',
  borderBottom:'1px solid #f0f0f0',
  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
};
const sIn = {
  width:'100%', padding:'5px', borderRadius:'5px',
  border:'1px solid #ddd', fontSize:'12px', boxSizing:'border-box'
};

export default function SeccionIngredientes({
  lista, seccion, colorH,
  mobile, modoEdicion,
  totalCrudoG, materiasPrimas,
  obtenerPrecioLive,
  actualizarIng, eliminarFila, agregarFila,
  dragIdx, dragSec, dragOverIdx,
  handleDragStart, handleDragOver, handleDrop,
  setBuscador,
}) {
  const totG = lista.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0);
  const totC = lista.reduce((s, i) =>
    s + (parseFloat(i.gramos) / 1000) * obtenerPrecioLive(i, materiasPrimas), 0);
  const label = seccion === 'MP' ? '🥩 MATERIAS PRIMAS' : '🧂 CONDIMENTOS Y ADITIVOS';

  return (
    <div style={{
      background:'white', borderRadius:'12px',
      marginBottom:'12px',
      boxShadow:'0 1px 6px rgba(0,0,0,0.08)', overflow:'hidden'
    }}>
      {/* Header */}
      <div style={{
        background:colorH, padding:'10px 14px',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <span style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '13px' : '14px' }}>
          {label}
        </span>
        {modoEdicion && (
          <button onClick={() => agregarFila(seccion)} style={{
            background:'#27ae60', color:'white', border:'none',
            borderRadius:'7px', padding: mobile ? '7px 14px' : '5px 12px',
            cursor:'pointer', fontSize: mobile ? '13px' : '12px', fontWeight:'bold'
          }}>+ Agregar fila</button>
        )}
      </div>

      {/* ── Vista MOBILE ── */}
      {mobile ? (
        <div style={{ padding:'10px' }}>
          {lista.map((ing, i) => {
            const p   = obtenerPrecioLive(ing, materiasPrimas);
            const c   = (parseFloat(ing.gramos) / 1000) * p;
            const pct = totalCrudoG > 0
              ? ((parseFloat(ing.gramos) / totalCrudoG) * 100).toFixed(1) : '0.0';
            const vinculado = !!ing.materia_prima_id;
            const esAgua = materiasPrimas
              .find(m => m.id === ing.materia_prima_id)
              ?.categoria?.toUpperCase().includes('AGUA');

            return (
              <div key={i}
                draggable={modoEdicion}
                onDragStart={() => handleDragStart(seccion, i)}
                onDragOver={e  => handleDragOver(e, seccion, i)}
                onDrop={() => handleDrop(seccion, i)}
                style={{
                  background:'white', borderRadius:'12px', marginBottom:'10px',
                  border:`1.5px solid ${vinculado ? '#c8e6c9' : '#fce4ec'}`,
                  overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)'
                }}>

                {/* Nombre */}
                <div style={{ padding:'10px 12px 6px', borderBottom:'1px solid #f5f5f5' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                    <div
                      onClick={() => modoEdicion && setBuscador({ abierto:true, tipo:seccion, indice:i, texto:'' })}
                      style={{
                        flex:1, padding:'9px 12px',
                        background: vinculado ? '#e8f5e9' : '#fff8e1',
                        border:`1px solid ${vinculado ? '#a5d6a7' : '#ffe082'}`,
                        borderRadius:'8px', fontSize:'13px', fontWeight:'600',
                        color: ing.ingrediente_nombre
                          ? (vinculado ? '#2e7d32' : '#e65100') : '#aaa',
                        cursor: modoEdicion ? 'pointer' : 'default',
                        minHeight:'38px', display:'flex', alignItems:'center', gap:6
                      }}>
                      {vinculado && <span style={{ color:'#43a047', fontSize:11 }}>✓</span>}
                      {ing.ingrediente_nombre || (modoEdicion ? '🔍 Buscar ingrediente...' : '—')}
                    </div>
                    {modoEdicion && (
                      <button onClick={() => eliminarFila(seccion, i)} style={{
                        background:'#ffebee', border:'1px solid #ef9a9a',
                        borderRadius:'8px', padding:'9px 11px',
                        cursor:'pointer', fontSize:'15px', flexShrink:0
                      }}>🗑️</button>
                    )}
                  </div>

                  {modoEdicion && (
                    <EspecInput
                      value={ing.especificacion || ''}
                      onCommit={v => actualizarIng(seccion, i, 'especificacion', v)}
                      placeholder="Especificación (opcional)..."
                      style={{
                        marginTop:'6px', width:'100%', padding:'7px 8px',
                        border: ing.especificacion?.trim()
                          ? '1.5px solid #3498db' : '1px dashed #ddd',
                        borderRadius:'6px', fontSize:'12px', color:'#1a5276',
                        background: ing.especificacion?.trim() ? '#e8f4fd' : '#fafafa',
                        boxSizing:'border-box'
                      }}
                    />
                  )}
                  {!modoEdicion && ing.especificacion?.trim() && (
                    <div style={{ marginTop:'4px', fontSize:'11px', color:'#1a5276' }}>
                      ({ing.especificacion.trim()})
                    </div>
                  )}
                </div>

                {/* Gramos / precio / costo */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0 }}>
                  <div style={{ padding:'8px 10px', borderRight:'1px solid #f5f5f5' }}>
                    <div style={{ fontSize:'10px', color:'#999', marginBottom:3, fontWeight:600 }}>GRAMOS</div>
                    <GramosInput
                      value={ing.gramos}
                      onCommit={v => actualizarIng(seccion, i, 'gramos', v)}
                      disabled={!modoEdicion}
                      mobile={true}
                    />
                  </div>
                  <div style={{ padding:'8px 10px', borderRight:'1px solid #f5f5f5', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                    <div style={{ fontSize:'10px', color:'#999', marginBottom:3, fontWeight:600 }}>$/KG</div>
                    <div style={{ fontSize:'14px', fontWeight:'700', color: esAgua ? '#3498db' : (p > 0 ? '#2e7d32' : '#b71c1c') }}>
                      {esAgua ? '💧' : ''} ${p.toFixed(2)}
                      {p === 0 && <span style={{ fontSize:10, marginLeft:2 }}>⚠️</span>}
                    </div>
                    <div style={{ fontSize:'10px', color:'#aaa' }}>{pct}%</div>
                  </div>
                  <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                    <div style={{ fontSize:'10px', color:'#999', marginBottom:3, fontWeight:600 }}>COSTO</div>
                    <div style={{ fontSize:'13px', fontWeight:'700', color:'#c62828' }}>${c.toFixed(3)}</div>
                    <div style={{ fontSize:'10px', color:'#aaa' }}>{(parseFloat(ing.gramos) / 1000).toFixed(3)} kg</div>
                  </div>
                </div>

                {/* Nota */}
                <div style={{ padding:'6px 10px 8px' }}>
                  <NoteInput
                    value={ing.nota_cambio || ''}
                    onCommit={v => actualizarIng(seccion, i, 'nota_cambio', v)}
                    disabled={!modoEdicion}
                    placeholder="Nota de cambio..."
                    style={{
                      width:'100%', padding:'7px 10px',
                      border:'1px solid #e0e0e0', borderRadius:'6px',
                      fontSize:'12px', color:'#555', boxSizing:'border-box',
                      background: modoEdicion ? '#fafafa' : '#f0f0f0'
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Subtotal mobile */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
            background: seccion === 'MP' ? '#e8f5e9' : '#f3e5f5',
            borderRadius:'10px', padding:'10px', marginTop:'4px'
          }}>
            {[['SUBTOTAL', `${totG.toLocaleString()} g`, '#1a1a2e'],
              ['KILOS',    (totG / 1000).toFixed(3),      '#1a1a2e'],
              ['COSTO',    `$${totC.toFixed(3)}`,          '#c62828']
            ].map(([l, v, col]) => (
              <div key={l}>
                <div style={{ fontSize:'10px', color:'#666', fontWeight:700 }}>{l}</div>
                <div style={{ fontSize:'14px', fontWeight:'800', color:col }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

      ) : (
        /* ── Vista DESKTOP ── */
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', tableLayout:'fixed' }}>
            <colgroup>
              {COLS.map((c, i) => <col key={i} style={{ width:c.w }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: seccion === 'MP' ? '#2c3e50' : '#6c3483' }}>
                {COLS.map(c => (
                  <th key={c.label} style={{ ...sTh, textAlign:c.align }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((ing, i) => {
                const p   = obtenerPrecioLive(ing, materiasPrimas);
                const c2  = (parseFloat(ing.gramos) / 1000) * p;
                const esAgua = materiasPrimas
                  .find(m => m.id === ing.materia_prima_id)
                  ?.categoria?.toUpperCase().includes('AGUA');
                const isDragOver = dragOverIdx === i && dragSec === seccion;

                return (
                  <tr key={i}
                    draggable={modoEdicion}
                    onDragStart={() => handleDragStart(seccion, i)}
                    onDragOver={e  => handleDragOver(e, seccion, i)}
                    onDrop={() => handleDrop(seccion, i)}
                    style={{
                      background: isDragOver ? '#e8f4fd'
                        : (i % 2 === 0 ? '#fafafa' : 'white'),
                      borderBottom: isDragOver
                        ? '2px solid #3498db' : '1px solid #f0f0f0'
                    }}>

                    {/* Ingrediente */}
                    <td style={sTd}>
                      <div
                        onClick={() => modoEdicion && setBuscador({ abierto:true, tipo:seccion, indice:i, texto:'' })}
                        style={{
                          padding:'4px 7px',
                          background: ing.materia_prima_id ? '#e8f8f0' : '#eaf4fb',
                          border: ing.materia_prima_id
                            ? '1px solid #27ae60' : '1px solid #aed6f1',
                          borderRadius:'5px',
                          cursor: modoEdicion ? 'pointer' : 'default',
                          fontSize:'11px',
                          color: ing.ingrediente_nombre
                            ? (ing.materia_prima_id ? '#1e8449' : '#1a5276') : '#aaa',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                        }}>
                        {ing.ingrediente_nombre || '—'}
                        {ing.materia_prima_id && (
                          <span style={{ fontSize:'9px', marginLeft:'4px', color:'#27ae60' }}>✓</span>
                        )}
                      </div>
                    </td>

                    {/* Especificación */}
                    <td style={sTd}>
                      {modoEdicion ? (
                        <EspecInput
                          value={ing.especificacion || ''}
                          onCommit={v => actualizarIng(seccion, i, 'especificacion', v)}
                          placeholder="opcional..."
                          style={{
                            ...sIn,
                            border: ing.especificacion?.trim()
                              ? '1.5px solid #3498db' : '1px dashed #ddd',
                            background: ing.especificacion?.trim() ? '#e8f4fd' : '#fafafa',
                            color:'#1a5276'
                          }}
                        />
                      ) : (
                        ing.especificacion?.trim()
                          ? <span style={{ fontSize:'11px', color:'#1a5276', fontWeight:'500' }}>
                              ({ing.especificacion.trim()})
                            </span>
                          : <span style={{ color:'#ddd', fontSize:'10px' }}>—</span>
                      )}
                    </td>

                    {/* Gramos */}
                    <td style={{ ...sTd, textAlign:'right' }}>
                      <GramosInput
                        value={ing.gramos}
                        onCommit={v => actualizarIng(seccion, i, 'gramos', v)}
                        disabled={!modoEdicion}
                        mobile={false}
                      />
                    </td>

                    {/* Kilos */}
                    <td style={{ ...sTd, textAlign:'right', color:'#666' }}>
                      {(parseFloat(ing.gramos) / 1000).toFixed(3)}
                    </td>

                    {/* % */}
                    <td style={{ ...sTd, textAlign:'right', color:'#666' }}>
                      {totalCrudoG > 0
                        ? ((parseFloat(ing.gramos) / totalCrudoG) * 100).toFixed(2)
                        : '0.00'}%
                    </td>

                    {/* Nota */}
                    <td style={sTd}>
                      <NoteInput
                        value={ing.nota_cambio || ''}
                        onCommit={v => actualizarIng(seccion, i, 'nota_cambio', v)}
                        disabled={!modoEdicion}
                        placeholder={modoEdicion ? 'Nota...' : ''}
                        style={{ ...sIn, background: modoEdicion ? 'white' : '#f0f0f0' }}
                      />
                    </td>

                    {/* $/KG */}
                    <td style={{
                      ...sTd, textAlign:'right', fontWeight:'bold',
                      color: esAgua ? '#3498db' : (p > 0 ? '#27ae60' : '#e74c3c')
                    }}>
                      {esAgua ? '💧' : ''}${p.toFixed(2)}
                      {p === 0 && <span style={{ fontSize:'9px' }}> ⚠️</span>}
                    </td>

                    {/* Costo */}
                    <td style={{ ...sTd, textAlign:'right', fontWeight:'bold', color:'#c0392b' }}>
                      ${c2.toFixed(4)}
                    </td>

                    {/* Eliminar */}
                    <td style={{ ...sTd, textAlign:'center' }}>
                      {modoEdicion && (
                        <button onClick={() => eliminarFila(seccion, i)} style={{
                          background:'#e74c3c', color:'white', border:'none',
                          borderRadius:'4px', padding:'3px 7px',
                          cursor:'pointer', fontSize:'11px'
                        }}>🗑️</button>
                      )}
                    </td>

                    {/* Drag handle */}
                    <td style={{
                      ...sTd, textAlign:'center',
                      cursor: modoEdicion ? 'grab' : 'default',
                      color:'#bbb', fontSize:'16px'
                    }}>
                      {modoEdicion ? '⠿' : ''}
                    </td>
                  </tr>
                );
              })}

              {/* Subtotal desktop */}
              <tr style={{
                background: seccion === 'MP' ? '#d5f5e3' : '#e8daef',
                fontWeight:'bold'
              }}>
                <td style={{ ...sTd, paddingLeft:'10px' }}>SUB-TOTAL</td>
                <td style={sTd}></td>
                <td style={{ ...sTd, textAlign:'right' }}>{totG.toLocaleString()}</td>
                <td style={{ ...sTd, textAlign:'right' }}>{(totG / 1000).toFixed(3)}</td>
                <td style={{ ...sTd, textAlign:'right' }}>
                  {totalCrudoG > 0 ? ((totG / totalCrudoG) * 100).toFixed(2) : '0.00'}%
                </td>
                <td colSpan={2} style={{ ...sTd, textAlign:'right' }}>Sub-total</td>
                <td style={{ ...sTd, textAlign:'right', color:'#c0392b' }}>${totC.toFixed(4)}</td>
                <td></td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}