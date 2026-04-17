// ============================================
// PanelCostos.js
// Panel de costos, empaque, amarre y fundas
// ============================================
import React from 'react';
import { NumInput, TextInput } from './FormulacionInputs';

export default function PanelCostos({
  mobile, modoEdicion,
  config, setConfig,
  costoMPkg, costoConMerma, costoEmpaqueKg,
  costoAmarreKg, costoTotalKg, precioVentaKg,
  merma, margen, modCif,
  empPrecio, empCantidad,
  hiloPrecio, hiloKg,
  totalCrudoKg,
  precioFunda,
  programarAutoGuardado,
  setBuscador,
  esSalmuera,
}) {
  const precioVentaSalmuera = margen < 1 ? costoMPkg / (1 - margen) : 0;

  const BtnBuscar = ({ valor, tipo, indice, color = '#2980b9' }) => (
    <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
      <div
        onClick={() => modoEdicion && setBuscador({ abierto:true, tipo, indice: indice ?? null, texto:'' })}
        style={{
          flex:1, padding: mobile ? '11px 12px' : '7px 10px',
          background: valor ? '#e8f8f0' : '#fff9e6',
          border: valor ? '1.5px solid #27ae60' : '1.5px solid #f39c12',
          borderRadius:'8px', fontSize: mobile ? '13px' : '12px',
          color: valor ? '#1e8449' : '#888',
          cursor: modoEdicion ? 'pointer' : 'default',
          minHeight: mobile ? 44 : 0
        }}>
        {valor || (modoEdicion ? '🔍 Buscar...' : '—')}
      </div>
      {valor && modoEdicion && (
        <button
          onClick={() => setBuscador({ abierto:true, tipo, indice: indice ?? null, texto:'' })}
          style={{
            padding: mobile ? '11px 14px' : '5px 10px',
            background:color, color:'white', border:'none',
            borderRadius:'7px', cursor:'pointer',
            fontSize: mobile ? '14px' : '11px'
          }}>✏️</button>
      )}
    </div>
  );

  const agregarFunda = () => {
    if (!modoEdicion) return;
    setConfig(prev => ({
      ...prev,
      fundas: [...(prev.fundas || []), {
        nombre_funda:'', precio_funda:0,
        kg_por_funda:1, nombre_etiqueta:'', precio_etiqueta:0
      }]
    }));
  };

  const eliminarFunda = (idx) => {
    if (!modoEdicion) return;
    setConfig(prev => ({ ...prev, fundas: prev.fundas.filter((_, i) => i !== idx) }));
  };

  return (
    <div style={{
      display: mobile ? 'flex' : 'grid',
      flexDirection: mobile ? 'column' : undefined,
      gridTemplateColumns: mobile ? undefined : '1fr 1fr',
      gap:'12px'
    }}>

      {/* ── Columna izquierda ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

        {/* Ajustes */}
        <div style={{
          background:'white', borderRadius:'12px',
          padding:'14px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
        }}>
          <h4 style={{
            margin:'0 0 12px', color:'#1a1a2e',
            borderBottom:'2px solid #3498db',
            paddingBottom:'6px', fontSize:'13px'
          }}>⚙️ Ajustes</h4>

          {[
            !esSalmuera && ['Merma %',           'merma'],
            ['Margen ganancia %', 'margen'],
            !esSalmuera && ['MOD + CIF $/kg',    'mod_cif_kg'],
          ].filter(Boolean).map(([label, key]) => (
            <div key={key} style={{
              display:'flex', justifyContent:'space-between',
              alignItems:'center', marginBottom:'10px'
            }}>
              <label style={{ fontSize:'13px', color:'#555' }}>{label}</label>
              <NumInput
                value={config[key] || ''}
                onChange={v => {
                  if (!modoEdicion) return;
                  setConfig(prev => ({ ...prev, [key]: v }));
                  programarAutoGuardado();
                }}
                disabled={!modoEdicion}
                step="0.001"
                style={{
                  width: mobile ? 110 : 100,
                  padding: mobile ? '9px' : '6px',
                  borderRadius:'7px', border:'1.5px solid #ddd',
                  fontSize:'14px', textAlign:'right',
                  background: modoEdicion ? 'white' : '#f0f0f0'
                }}
              />
            </div>
          ))}
        </div>

        {/* Empaque */}
        {!esSalmuera && <div style={{
          background:'white', borderRadius:'12px',
          padding:'14px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
        }}>
          <h4 style={{
            margin:'0 0 12px', color:'#1a1a2e',
            borderBottom:'2px solid #8e44ad',
            paddingBottom:'6px', fontSize:'13px'
          }}>📦 Empaque / Tripa</h4>

          <div style={{ marginBottom:'10px' }}>
            <label style={{
              fontSize:'11px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:'4px'
            }}>Empaque seleccionado</label>
            <BtnBuscar valor={config.empaque_nombre} tipo="empaque" color="#8e44ad" />
            {config.empaque_precio_kg > 0 && (
              <div style={{ fontSize:'11px', color:'#27ae60', marginTop:'4px' }}>
                💰 ${parseFloat(config.empaque_precio_kg).toFixed(2)}/kg
              </div>
            )}
          </div>

          <div style={{
            display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:'8px'
          }}>
            <label style={{ fontSize:'12px', color:'#555' }}>Cantidad usada</label>
            <NumInput
              value={config.empaque_cantidad || ''}
              onChange={v => {
                if (!modoEdicion) return;
                setConfig(prev => ({ ...prev, empaque_cantidad: v }));
                programarAutoGuardado();
              }}
              disabled={!modoEdicion}
              style={{
                width: mobile ? 120 : 110,
                padding: mobile ? '9px' : '6px',
                borderRadius:'7px', border:'1.5px solid #ddd',
                fontSize:'13px', textAlign:'right',
                background: modoEdicion ? 'white' : '#f0f0f0'
              }}
            />
          </div>

          <div style={{
            display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:'8px'
          }}>
            <label style={{ fontSize:'12px', color:'#555' }}>Unidad</label>
            <TextInput
              value={config.empaque_unidad || ''}
              onChange={v => {
                if (!modoEdicion) return;
                setConfig(prev => ({ ...prev, empaque_unidad: v }));
                programarAutoGuardado();
              }}
              disabled={!modoEdicion}
              placeholder="Madejas"
              style={{
                width: mobile ? 120 : 110,
                padding: mobile ? '9px' : '6px',
                borderRadius:'7px', border:'1.5px solid #ddd',
                fontSize:'13px', textAlign:'right',
                background: modoEdicion ? 'white' : '#f0f0f0'
              }}
            />
          </div>

          <div style={{
            fontSize:'11px', color:'#666',
            background:'#f8f9fa', borderRadius:'8px',
            padding:'8px', marginTop:'6px'
          }}>
            {[
              ['Costo total empaque:', `$${(empPrecio * empCantidad).toFixed(4)}`],
              ['Costo empaque/kg:',    `$${costoEmpaqueKg.toFixed(4)}`],
              ['Rendimiento:',
                empCantidad > 0
                  ? `${(totalCrudoKg / empCantidad).toFixed(3)} kg/unidad`
                  : '-'],
            ].map(([l, v]) => (
              <div key={l} style={{
                display:'flex', justifyContent:'space-between', marginBottom:3
              }}>
                <span>{l}</span>
                <span style={{ fontWeight:'bold' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>}

        {/* Amarre */}
        {!esSalmuera && <div style={{
          background:'white', borderRadius:'12px',
          padding:'14px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
        }}>
          <h4 style={{
            margin:'0 0 12px', color:'#1a1a2e',
            borderBottom:'2px solid #e67e22',
            paddingBottom:'6px', fontSize:'13px'
          }}>🧵 Amarre / Hilo</h4>

          <div style={{ marginBottom:'10px' }}>
            <label style={{
              fontSize:'11px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:'4px'
            }}>Amarre seleccionado</label>
            <BtnBuscar valor={config.hilo_nombre} tipo="hilo" color="#e67e22" />
            {config.hilo_precio_kg > 0 && (
              <div style={{ fontSize:'11px', color:'#27ae60', marginTop:'4px' }}>
                💰 ${parseFloat(config.hilo_precio_kg).toFixed(2)}/kg
              </div>
            )}
          </div>

          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <label style={{ fontSize:'12px', color:'#555' }}>Kg hilo usados</label>
            <NumInput
              value={config.hilo_kg || ''}
              onChange={v => {
                if (!modoEdicion) return;
                setConfig(prev => ({ ...prev, hilo_kg: v }));
                programarAutoGuardado();
              }}
              disabled={!modoEdicion}
              step="0.001"
              style={{
                width: mobile ? 120 : 110,
                padding: mobile ? '9px' : '6px',
                borderRadius:'7px', border:'1.5px solid #ddd',
                fontSize:'13px', textAlign:'right',
                background: modoEdicion ? 'white' : '#f0f0f0'
              }}
            />
          </div>

          <div style={{
            fontSize:'11px', color:'#666',
            background:'#f8f9fa', borderRadius:'8px',
            padding:'8px', marginTop:'8px'
          }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span>Costo amarre/kg:</span>
              <span style={{ fontWeight:'bold', color:'#e67e22' }}>
                ${costoAmarreKg.toFixed(4)}
              </span>
            </div>
          </div>
        </div>}
      </div>

      {/* ── Columna derecha ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

        {/* Resumen costos */}
        <div style={{
          background:'white', borderRadius:'12px',
          padding:'14px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
        }}>
          <h4 style={{
            margin:'0 0 12px', color:'#1a1a2e',
            borderBottom:'2px solid #27ae60',
            paddingBottom:'6px', fontSize:'13px'
          }}>📊 Resumen de Costos</h4>

          {[
            ['Costo MP/kg',  `$${costoMPkg.toFixed(4)}`,      '#555'    ],
            !esSalmuera && ['Con merma',    `$${costoConMerma.toFixed(4)}`,   '#e74c3c' ],
            !esSalmuera && ['MOD + CIF/kg', `$${modCif.toFixed(4)}`,          '#3498db' ],
            !esSalmuera && ['Empaque/kg',   `$${costoEmpaqueKg.toFixed(4)}`,  '#8e44ad' ],
            !esSalmuera && ['Amarre/kg',    `$${costoAmarreKg.toFixed(4)}`,   '#e67e22' ],
          ].filter(Boolean).map(([l, v, col]) => (
            <div key={l} style={{
              display:'flex', justifyContent:'space-between',
              marginBottom:'8px', fontSize:'13px'
            }}>
              <span style={{ color:'#666' }}>{l}</span>
              <span style={{ fontWeight:'bold', color:col }}>{v}</span>
            </div>
          ))}

          <div style={{ borderTop:'2px solid #2c3e50', paddingTop:'10px', marginTop:'6px' }}>
            <div style={{
              display:'flex', justifyContent:'space-between', marginBottom:'8px'
            }}>
              <span style={{ fontWeight:'bold', color:'#1a1a2e', fontSize: mobile ? '14px' : '13px' }}>
                COSTO TOTAL/KG
              </span>
              <span style={{ fontWeight:'bold', color:'#e74c3c', fontSize: mobile ? '16px' : '14px' }}>
                ${costoTotalKg.toFixed(4)}
              </span>
            </div>
            <div style={{
              display:'flex', justifyContent:'space-between',
              background:'#27ae60', borderRadius:'10px', padding:'12px 14px'
            }}>
              <span style={{ fontWeight:'bold', color:'white', fontSize: mobile ? '14px' : '13px' }}>
                💰 PRECIO VENTA/KG
              </span>
              <span style={{ fontWeight:'bold', color:'white', fontSize: mobile ? '18px' : '16px' }}>
                ${(esSalmuera ? precioVentaSalmuera : precioVentaKg).toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        {/* Fundas */}
        {!esSalmuera && <div style={{
          background:'white', borderRadius:'12px',
          padding:'14px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
        }}>
          <div style={{
            display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:'12px',
            borderBottom:'2px solid #17a589', paddingBottom:'6px'
          }}>
            <h4 style={{ margin:0, color:'#1a1a2e', fontSize:'13px' }}>
              🛍️ Empaques de Distribución
            </h4>
            {modoEdicion && (
              <button onClick={agregarFunda} style={{
                background:'#17a589', color:'white', border:'none',
                borderRadius:'7px', padding: mobile ? '8px 14px' : '5px 12px',
                cursor:'pointer', fontSize: mobile ? '13px' : '11px', fontWeight:'bold'
              }}>+ Agregar</button>
            )}
          </div>

          {(!config.fundas || config.fundas.length === 0) && (
            <div style={{ textAlign:'center', color:'#aaa', fontSize:'13px', padding:'24px' }}>
              Sin fundas de distribución
            </div>
          )}

          {(config.fundas || []).map((funda, idx) => (
            <div key={idx} style={{
              background:'#f8fffe', border:'1.5px solid #17a589',
              borderRadius:'10px', padding:'12px', marginBottom:'10px'
            }}>
              <div style={{
                display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:'8px'
              }}>
                <span style={{ fontWeight:'bold', color:'#17a589', fontSize:'13px' }}>
                  Funda {idx + 1}
                </span>
                {modoEdicion && (
                  <button onClick={() => eliminarFunda(idx)} style={{
                    background:'#ffebee', border:'1px solid #ef9a9a',
                    borderRadius:'7px', padding:'6px 10px',
                    cursor:'pointer', fontSize:'14px'
                  }}>🗑️</button>
                )}
              </div>

              <div style={{ marginBottom:'8px' }}>
                <label style={{
                  fontSize:'11px', fontWeight:'bold',
                  color:'#555', display:'block', marginBottom:'4px'
                }}>Funda / Envase</label>
                <BtnBuscar valor={funda.nombre_funda} tipo="funda" indice={idx} color="#17a589" />
              </div>

              <div style={{
                display:'flex', justifyContent:'space-between',
                alignItems:'center', marginBottom:'8px'
              }}>
                <label style={{ fontSize:'12px', color:'#555' }}>Kg por funda</label>
                <NumInput
                  value={funda.kg_por_funda || 1}
                  onChange={v => {
                    if (!modoEdicion) return;
                    const f = [...(config.fundas || [])];
                    f[idx] = { ...f[idx], kg_por_funda: parseFloat(v) || 1 };
                    setConfig(p => ({ ...p, fundas: f }));
                    programarAutoGuardado();
                  }}
                  disabled={!modoEdicion}
                  step="0.1"
                  style={{
                    width: mobile ? 110 : 90,
                    padding: mobile ? '9px' : '5px',
                    borderRadius:'7px', border:'1.5px solid #ddd',
                    fontSize:'14px', textAlign:'right',
                    background: modoEdicion ? 'white' : '#f0f0f0'
                  }}
                />
              </div>

              <div style={{ marginBottom:'8px' }}>
                <label style={{
                  fontSize:'11px', fontWeight:'bold',
                  color:'#555', display:'block', marginBottom:'4px'
                }}>Etiqueta</label>
                <BtnBuscar valor={funda.nombre_etiqueta} tipo="etiqueta" indice={idx} color="#7f8c8d" />
              </div>

              <div style={{
                background:'#17a589', borderRadius:'8px',
                padding:'10px 12px',
                display:'flex', justifyContent:'space-between', alignItems:'center'
              }}>
                <span style={{ color:'white', fontSize:'12px', fontWeight:'bold' }}>
                  💰 Precio sugerido
                </span>
                <span style={{ color:'white', fontSize: mobile ? '16px' : '14px', fontWeight:'bold' }}>
                  ${precioFunda(funda).toFixed(4)}
                </span>
              </div>
              <div style={{ fontSize:'11px', color:'#888', marginTop:'5px', textAlign:'right' }}>
               N° fundas: {funda.kg_por_funda > 0
                ? Math.ceil((totalCrudoKg * (1 - merma)) / funda.kg_por_funda) : '-'}
              </div>
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}