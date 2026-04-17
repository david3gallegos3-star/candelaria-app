// ============================================
// VistaLimpia.js
// Vista solo lectura admin (sin modo edición)
// ============================================
import React from 'react';

export default function VistaLimpia({
  mobile,
  ingredientesMP, ingredientesAD,
  totMP, totAD,
  totalCrudoG, totalCrudoKg, totalCostoMP,
  costoMPkg, costoConMerma, costoEmpaqueKg,
  costoAmarreKg, costoTotalKg, precioVentaKg,
  config, materiasPrimas,
  obtenerPrecioLive, precioFunda,
  merma, margen, modCif,
  empPrecio, empCantidad,
  hiloPrecio, hiloKg,
  esSalmuera,
}) {
  const precioVentaSalmuera = margen < 1 ? costoMPkg / (1 - margen) : 0;
  const thS = {
    padding: mobile ? '7px 8px' : '7px 10px',
    fontSize:'10px', color:'#888', fontWeight:'700',
    letterSpacing:'0.8px', textTransform:'uppercase',
    borderBottom:'1px solid #ddd', textAlign:'left', whiteSpace:'nowrap'
  };
  const thR = { ...thS, textAlign:'right' };

  const Row = ({ ing, i }) => {
    const g = parseFloat(ing.gramos) || 0;
    const p = obtenerPrecioLive(ing, materiasPrimas);
    const costo = (g / 1000) * p;
    const pct = totalCrudoG > 0 ? ((g / totalCrudoG) * 100).toFixed(2) : '0.00';
    const esAgua = materiasPrimas.find(m => m.id === ing.materia_prima_id)
      ?.categoria?.toUpperCase().includes('AGUA');
    const nombreMostrar = ing.ingrediente_nombre +
      (ing.especificacion?.trim() ? ` (${ing.especificacion.trim()})` : '');
    return (
      <tr style={{
        borderBottom:'1px solid #f5f5f5',
        background: i % 2 === 0 ? 'white' : '#fafafa'
      }}>
        <td style={{ padding: mobile ? '7px 8px' : '6px 10px', fontSize: mobile ? '13px' : '12px' }}>
          {nombreMostrar}
        </td>
        <td style={{ padding: mobile ? '7px 8px' : '6px 10px', textAlign:'right', fontSize:'12px', color:'#333' }}>
          {Math.round(g)}
        </td>
        <td style={{ padding: mobile ? '7px 8px' : '6px 10px', textAlign:'right', fontSize:'12px', color:'#555' }}>
          {(g / 1000).toFixed(3)}
        </td>
        {!mobile && (
          <td style={{ padding:'6px 10px', textAlign:'right', fontSize:'12px', color:'#888' }}>
            {pct}%
          </td>
        )}
        {!mobile && (
          <td style={{ padding:'6px 10px', fontSize:'12px', color:'#777' }}>
            {ing.nota_cambio || ''}
          </td>
        )}
        <td style={{
          padding: mobile ? '7px 8px' : '6px 10px',
          textAlign:'right', fontSize:'12px', fontWeight:'bold',
          color: esAgua ? '#3498db' : (p > 0 ? '#27ae60' : '#e74c3c')
        }}>
          {esAgua
            ? <span title="Precio desde CIF">💧${p.toFixed(4)}</span>
            : `$${p.toFixed(2)}`}
        </td>
        <td style={{
          padding: mobile ? '7px 8px' : '6px 10px',
          textAlign:'right', fontSize:'12px',
          fontWeight:'bold', color:'#c0392b'
        }}>
          ${costo.toFixed(4)}
        </td>
      </tr>
    );
  };

  const Info = ({ label, valor, color }) => (
    <div style={{
      display:'flex', justifyContent:'space-between',
      padding: mobile ? '9px 0' : '7px 0',
      borderBottom:'1px solid #f5f5f5',
      fontSize: mobile ? '13px' : '12px'
    }}>
      <span style={{ color:'#666' }}>{label}</span>
      <span style={{ fontWeight:'bold', color: color || '#1a1a2e' }}>{valor}</span>
    </div>
  );

  return (
    <div style={{ padding: mobile ? '10px' : '16px 20px' }}>

      {/* ── Materias Primas ── */}
      <div style={{
        background:'white', borderRadius:'10px',
        overflow:'hidden', marginBottom:'10px',
        boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <div style={{ background:'#1a5276', padding:'8px 14px' }}>
          <span style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '12px' : '13px' }}>
            🥩 MATERIAS PRIMAS
          </span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth: mobile ? 400 : 600 }}>
            <thead>
              <tr>
                <th style={thS}>Ingrediente</th>
                <th style={thR}>Gramos</th>
                <th style={thR}>Kilos</th>
                {!mobile && <th style={thR}>%</th>}
                {!mobile && <th style={thS}>Nota</th>}
                <th style={thR}>$/KG</th>
                <th style={thR}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {ingredientesMP.filter(i => i.ingrediente_nombre).map((ing, i) => (
                <Row key={i} ing={ing} i={i} />
              ))}
              <tr style={{ background:'#e8f5fb', borderTop:'2px solid #aed6f1' }}>
                <td style={{ padding:'8px 10px', fontWeight:'bold', color:'#1a5276' }}>SUB-TOTAL</td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#1a5276' }}>
                  {Math.round(totMP.gramos)}
                </td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#1a5276' }}>
                  {(totMP.gramos / 1000).toFixed(3)}
                </td>
                {!mobile && (
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#1a5276' }}>
                    {totalCrudoG > 0 ? ((totMP.gramos / totalCrudoG) * 100).toFixed(2) : '0.00'}%
                  </td>
                )}
                {!mobile && <td></td>}
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#1a5276' }}>—</td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#c0392b' }}>
                  ${totMP.costo.toFixed(4)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Condimentos ── */}
      <div style={{
        background:'white', borderRadius:'10px',
        overflow:'hidden', marginBottom:'10px',
        boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
      }}>
        <div style={{ background:'#6c3483', padding:'8px 14px' }}>
          <span style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '12px' : '13px' }}>
            🧂 CONDIMENTOS Y ADITIVOS
          </span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth: mobile ? 400 : 600 }}>
            <thead>
              <tr>
                <th style={thS}>Ingrediente</th>
                <th style={thR}>Gramos</th>
                <th style={thR}>Kilos</th>
                {!mobile && <th style={thR}>%</th>}
                {!mobile && <th style={thS}>Nota</th>}
                <th style={thR}>$/KG</th>
                <th style={thR}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {ingredientesAD.filter(i => i.ingrediente_nombre).map((ing, i) => (
                <Row key={i} ing={ing} i={i} />
              ))}
              <tr style={{ background:'#f5eef8', borderTop:'2px solid #d2b4de' }}>
                <td style={{ padding:'8px 10px', fontWeight:'bold', color:'#6c3483' }}>SUB-TOTAL</td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#6c3483' }}>
                  {Math.round(totAD.gramos)}
                </td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#6c3483' }}>
                  {(totAD.gramos / 1000).toFixed(3)}
                </td>
                {!mobile && (
                  <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#6c3483' }}>
                    {totalCrudoG > 0 ? ((totAD.gramos / totalCrudoG) * 100).toFixed(2) : '0.00'}%
                  </td>
                )}
                {!mobile && <td></td>}
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#6c3483' }}>—</td>
                <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:'bold', color:'#c0392b' }}>
                  ${totAD.costo.toFixed(4)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Total crudo ── */}
      <div style={{
        background:'#1a3a5c', borderRadius:'10px',
        padding: mobile ? '12px 14px' : '10px 18px',
        display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'14px'
      }}>
        <span style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '13px' : '14px' }}>
          TOTAL CRUDO
        </span>
        <div style={{ display:'flex', gap: mobile ? 16 : 28 }}>
          {[['GRAMOS', Math.round(totalCrudoG), 'white'],
            ['KILOS', totalCrudoKg.toFixed(3), '#f39c12']
          ].map(([l, v, col]) => (
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ color:'#aaa', fontSize:'9px', fontWeight:700 }}>{l}</div>
              <div style={{ color:col, fontWeight:'bold', fontSize: mobile ? '14px' : '15px' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Costos + Empaque ── */}
      <div style={{
        display: mobile ? 'flex' : 'grid',
        flexDirection: mobile ? 'column' : undefined,
        gridTemplateColumns: mobile ? undefined : '1fr 1fr',
        gap:'10px', marginBottom:'10px'
      }}>
        {/* Costos */}
        <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ background:'#2c3e50', padding:'8px 14px' }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '12px' : '13px' }}>
              📊 Costos y Ajustes
            </span>
          </div>
          <div style={{ padding: mobile ? '12px 14px' : '10px 16px' }}>
            {!esSalmuera && <Info label="Merma"
              valor={((parseFloat(config.merma) || 0) * 100).toFixed(0) + '%'} />}
            <Info label="Margen ganancia"
              valor={((parseFloat(config.margen) || 0) * 100).toFixed(0) + '%'} />
            {!esSalmuera && <Info label="MOD+CIF/kg"
              valor={'$' + (parseFloat(config.mod_cif_kg) || 0).toFixed(4)}
              color="#3498db" />}
            <Info label="Costo MP/kg"    valor={'$' + costoMPkg.toFixed(4)} />
            {!esSalmuera && <Info label="Con merma"      valor={'$' + costoConMerma.toFixed(4)}  color="#e74c3c" />}
            {!esSalmuera && <Info label="Empaque/kg"     valor={'$' + costoEmpaqueKg.toFixed(4)} color="#8e44ad" />}
            {!esSalmuera && <Info label="Amarre/kg"      valor={'$' + costoAmarreKg.toFixed(4)}  color="#e67e22" />}
            {!esSalmuera && (
              <div style={{
                marginTop:'10px', background:'#f8f9fa', borderRadius:'8px',
                padding:'10px 12px', display:'flex',
                justifyContent:'space-between', marginBottom:'8px'
              }}>
                <span style={{ fontWeight:'bold', color:'#2c3e50', fontSize: mobile ? '13px' : '12px' }}>
                  COSTO TOTAL/KG
                </span>
                <span style={{ fontWeight:'bold', color:'#e74c3c', fontSize: mobile ? '15px' : '14px' }}>
                  ${costoTotalKg.toFixed(4)}
                </span>
              </div>
            )}
            <div style={{
              background:'#27ae60', borderRadius:'8px',
              padding:'11px 14px', marginTop: esSalmuera ? '10px' : 0,
              display:'flex', justifyContent:'space-between'
            }}>
              <span style={{ fontWeight:'bold', color:'white', fontSize: mobile ? '13px' : '12px' }}>
                💰 PRECIO VENTA/KG
              </span>
              <span style={{ fontWeight:'bold', color:'white', fontSize: mobile ? '17px' : '16px' }}>
                ${(esSalmuera ? precioVentaSalmuera : precioVentaKg).toFixed(4)}
              </span>
            </div>
            <div style={{ fontSize:'10px', color:'#888', marginTop:'4px', textAlign:'right' }}>
              {esSalmuera
                ? `$${costoMPkg.toFixed(4)} ÷ (1 − ${((parseFloat(config.margen)||0)*100).toFixed(0)}%) = $${precioVentaSalmuera.toFixed(4)}`
                : `$${costoTotalKg.toFixed(4)} ÷ (1 − ${((parseFloat(config.margen)||0)*100).toFixed(0)}%) = $${precioVentaKg.toFixed(4)}`
              }
            </div>
          </div>
        </div>
        {/* Empaque y Amarre */}
        {!esSalmuera && <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ background:'#7d6608', padding:'8px 14px' }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '12px' : '13px' }}>
              📦 Empaque y Amarre
            </span>
          </div>
          <div style={{ padding: mobile ? '12px 14px' : '10px 16px' }}>
            {config.empaque_nombre ? (
              <>
                <Info label="Tripa/Empaque" valor={config.empaque_nombre}    color="#8e44ad" />
                <Info label="Cantidad"
                  valor={(config.empaque_cantidad || 0) + ' ' + (config.empaque_unidad || '')} />
                <Info label="Precio/kg"
                  valor={'$' + parseFloat(config.empaque_precio_kg || 0).toFixed(2) + '/kg'} />
                <Info label="Costo empaque/kg" valor={'$' + costoEmpaqueKg.toFixed(4)} color="#8e44ad" />
              </>
            ) : (
              <div style={{ color:'#aaa', fontSize:'13px', padding:'10px 0' }}>
                Sin empaque configurado
              </div>
            )}
            {config.hilo_nombre && (
              <>
                <div style={{ height:'1px', background:'#f0f0f0', margin:'10px 0' }} />
                <Info label="Amarre/Hilo"    valor={config.hilo_nombre}                        color="#e67e22" />
                <Info label="Kg hilo"
                  valor={(parseFloat(config.hilo_kg) || 0).toFixed(3) + ' kg'} />
                <Info label="Costo amarre/kg" valor={'$' + costoAmarreKg.toFixed(4)}           color="#e67e22" />
              </>
            )}
          </div>
        </div>}
      </div>

      {/* ── Fundas ── */}
      {!esSalmuera && config.fundas && config.fundas.length > 0 && (
        <div style={{
          background:'white', borderRadius:'10px',
          overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          <div style={{ background:'#17a589', padding:'8px 14px' }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize: mobile ? '12px' : '13px' }}>
              🛍️ Empaques de Distribución
            </span>
          </div>
          <div style={{
            padding: mobile ? '10px 12px' : '10px 14px',
            display: mobile ? 'flex' : 'grid',
            flexDirection: mobile ? 'column' : undefined,
            gridTemplateColumns: mobile ? undefined : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap:'10px'
          }}>
            {config.fundas.map((funda, idx) => (
              <div key={idx} style={{ border:'1.5px solid #17a589', borderRadius:'10px', overflow:'hidden' }}>
                <div style={{
                  background:'#e8f8f4', padding:'8px 12px',
                  fontWeight:'bold', color:'#17a589', fontSize:'12px'
                }}>
                  Funda {idx + 1}: {funda.nombre_funda || '—'}
                </div>
                <div style={{ padding:'8px 12px' }}>
                  <Info label="Kg por funda"
                    valor={(parseFloat(funda.kg_por_funda) || 1).toFixed(1) + ' kg'} />
                  <Info label="Etiqueta" valor={funda.nombre_etiqueta || '—'} />
                  <Info label="N° fundas"
                  valor={funda.kg_por_funda > 0
                    ? Math.ceil((totalCrudoKg * (1 - merma)) / (parseFloat(funda.kg_por_funda) || 1)) + ''
                    : '-'} />
                <div style={{
                  background:'#17a589', borderRadius:'7px',
                  padding:'9px 12px',
                  display:'flex', justifyContent:'space-between', marginTop:'6px'
                }}>
                  <span style={{ color:'white', fontSize: mobile ? '13px' : '12px', fontWeight:'bold' }}>
                    💰 Precio sugerido
                  </span>
                  <span style={{ color:'white', fontSize: mobile ? '15px' : '14px', fontWeight:'bold' }}>
                    ${precioFunda(funda).toFixed(4)}
                  </span>
                </div>
                <div style={{ fontSize:'10px', color:'#888', marginTop:'4px', textAlign:'right' }}>
                  (${costoTotalKg.toFixed(4)} × {(parseFloat(funda.kg_por_funda)||1)} + ${(parseFloat(funda.precio_funda)||0).toFixed(4)}) ÷ (1 − {((parseFloat(config.margen)||0)*100).toFixed(0)}%)
                </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}