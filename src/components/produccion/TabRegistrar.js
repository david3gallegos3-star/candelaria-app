// ============================================
// TabRegistrar.js
// Panel izquierdo + panel derecho
// Versión multi-producto con foco por producto
// ============================================
import React from 'react';

// ── Helpers badge por estado ──────────────────────────────
function BadgeEstado({ estado, alertas }) {
  if (estado === 'sin_formula') return (
    <span style={{
      background:'#f0f0f0', color:'#888',
      padding:'2px 8px', borderRadius:'20px',
      fontSize:'10px', fontWeight:'700'
    }}>sin fórmula</span>
  );
  if (estado === 'ok') return (
    <span style={{
      background:'#EAF3DE', color:'#3B6D11',
      padding:'2px 8px', borderRadius:'20px',
      fontSize:'10px', fontWeight:'700'
    }}>stock ok</span>
  );
  if (estado === 'warn') return (
    <span style={{
      background:'#FAEEDA', color:'#854F0B',
      padding:'2px 8px', borderRadius:'20px',
      fontSize:'10px', fontWeight:'700'
    }}>1 alerta</span>
  );
  return (
    <span style={{
      background:'#FCEBEB', color:'#A32D2D',
      padding:'2px 8px', borderRadius:'20px',
      fontSize:'10px', fontWeight:'700'
    }}>{alertas} alertas</span>
  );
}

// ── Panel derecho: detalle con merma + ingredientes ────────
function DetalleProducto({ item, resumen, mobile }) {
  if (!item) return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      height: mobile ? '200px' : '400px',
      color:'#aaa', textAlign:'center',
      background:'white', borderRadius:'12px',
      border:'0.5px solid var(--color-border-tertiary)',
      padding:'20px'
    }}>
      <div style={{ fontSize:'40px', marginBottom:'12px' }}>🏭</div>
      <div style={{ fontSize:'13px' }}>
        Toca las paradas de un producto para ver su detalle aquí
      </div>
    </div>
  );

  if (!resumen) return (
    <div style={{
      background:'#fff3cd', borderRadius:'12px',
      border:'1px solid #ffc107', padding:'16px',
      fontSize:'13px', color:'#856404'
    }}>
      ⚠️ {item.producto.nombre} no tiene fórmula configurada.
      Configúrala en el módulo de Fórmulas primero.
    </div>
  );

  const mermaPorc  = Math.round(resumen.mermaPorc * 100);
  const prodPorc   = 100 - mermaPorc;
  const alertaCount = resumen.alertas.length;

  const borderCard = alertaCount === 0
    ? '0.5px solid var(--color-border-tertiary)'
    : alertaCount === 1
    ? '1.5px solid #EF9F27'
    : '1.5px solid #E24B4A';

  return (
    <div style={{
      background:'white',
      border: borderCard,
      borderRadius:'12px',
      padding:'14px'
    }}>

      {/* ── Header ── */}
      <div style={{
        display:'flex', justifyContent:'space-between',
        alignItems:'flex-start', marginBottom:'12px'
      }}>
        <div>
          <div style={{ fontSize:'14px', fontWeight:'500', color:'#1a1a2e' }}>
            {item.producto.nombre}
          </div>
          <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>
            {resumen.paradas} parada{resumen.paradas !== 1 ? 's' : ''} ·
            base {(resumen.kgTotalCrudo / resumen.paradas * 1000).toFixed(0)} g por parada
          </div>
        </div>
        <BadgeEstado
          estado={alertaCount === 0 ? 'ok' : alertaCount === 1 ? 'warn' : 'danger'}
          alertas={alertaCount}
        />
      </div>

      {/* ── Bloque merma ── */}
      <div style={{
        background:'#FFF3E0',
        border:'1px solid #EF9F27',
        borderRadius:'8px',
        padding:'10px 12px',
        marginBottom:'12px'
      }}>
        <div style={{
          fontSize:'10px', fontWeight:'700',
          color:'#633806', marginBottom:'6px',
          letterSpacing:'.3px'
        }}>
          MERMA — {mermaPorc}%
        </div>

        {[
          [`Total crudo (${resumen.paradas} paradas)`, `${resumen.kgTotalCrudo.toFixed(2)} kg`, '#854F0B'],
          ['Merma descontada',                          `− ${resumen.mermaKg.toFixed(2)} kg`,    '#A32D2D'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            display:'flex', justifyContent:'space-between',
            fontSize:'12px', color, padding:'3px 0',
            borderBottom:'0.5px solid rgba(239,159,39,.3)'
          }}>
            <span>{label}</span>
            <span style={{ fontWeight:'500' }}>{val}</span>
          </div>
        ))}

        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', paddingTop:'6px'
        }}>
          <span style={{ fontSize:'13px', fontWeight:'500', color:'#412402' }}>
            KG producidos finales
          </span>
          <span style={{ fontSize:'18px', fontWeight:'500', color:'#412402' }}>
            {resumen.kgProducidos.toFixed(2)} kg
          </span>
        </div>

        {/* Barra visual */}
        <div style={{ marginTop:'8px' }}>
          <div style={{
            height:'6px', background:'#F7C1C1',
            borderRadius:'3px', overflow:'hidden'
          }}>
            <div style={{
              height:'100%',
              width:`${prodPorc}%`,
              background:'#27ae60',
              borderRadius:'3px',
              transition:'width .3s'
            }}/>
          </div>
          <div style={{
            display:'flex', justifyContent:'space-between',
            fontSize:'10px', color:'#854F0B', marginTop:'3px'
          }}>
            <span>Producto final {prodPorc}%</span>
            <span>Merma {mermaPorc}%</span>
          </div>
        </div>
      </div>

      {/* ── Costos ── */}
      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
        gap:'6px', marginBottom:'12px'
      }}>
        {[
          ['costo ingredientes', `$${resumen.costoTotal.toFixed(2)}`,                                            '#1a1a2e'],
          ['costo / kg crudo',   `$${resumen.kgTotalCrudo > 0 ? (resumen.costoTotal / resumen.kgTotalCrudo).toFixed(3) : '0.000'}`, '#555'],
          ['costo / kg final',   `$${resumen.kgProducidos > 0 ? (resumen.costoTotal / resumen.kgProducidos).toFixed(3) : '0.000'}`,  '#27ae60'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background:'#f8f9fa', borderRadius:'8px',
            padding:'7px 10px', textAlign:'center'
          }}>
            <div style={{ fontSize:'10px', color:'#888', marginBottom:'2px' }}>{label}</div>
            <div style={{ fontSize:'14px', fontWeight:'500', color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── Tabla ingredientes ── */}
      <div style={{
        fontSize:'10px', fontWeight:'700',
        color:'#888', marginBottom:'5px',
        letterSpacing:'.3px'
      }}>
        INGREDIENTES NECESARIOS
      </div>

      <div style={{
        border:'0.5px solid #e0e0e0',
        borderRadius:'8px', overflow:'hidden'
      }}>
        {/* Header tabla */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'1fr auto auto auto',
          gap:'6px', padding:'6px 10px',
          background:'#f8f9fa',
          fontSize:'10px', color:'#888', fontWeight:'600'
        }}>
          <span>Ingrediente</span>
          <span>Necesita</span>
          <span>Tiene</span>
          <span>Estado</span>
        </div>

        {resumen.ingredientes.map((ing, i) => {
          const bg = !ing.suficiente
            ? (ing.falta > 5 ? '#FCEBEB' : '#FAEEDA')
            : i % 2 === 0 ? '#fafafa' : 'white';

          const colorNec  = ing.suficiente ? '#555'    : '#A32D2D';
          const colorTiene = ing.suficiente ? '#3B6D11' : '#A32D2D';

          const badge = ing.suficiente
            ? (
              <span style={{
                background:'#EAF3DE', color:'#3B6D11',
                padding:'2px 7px', borderRadius:'10px',
                fontSize:'10px', fontWeight:'700'
              }}>ok</span>
            ) : (
              <span style={{
                background: ing.falta > 5 ? '#FCEBEB' : '#FAEEDA',
                color:      ing.falta > 5 ? '#A32D2D' : '#854F0B',
                padding:'2px 7px', borderRadius:'10px',
                fontSize:'10px', fontWeight:'700',
                whiteSpace:'nowrap'
              }}>−{ing.falta.toFixed(2)} kg</span>
            );

          return (
            <div key={i} style={{
              display:'grid',
              gridTemplateColumns:'1fr auto auto auto',
              gap:'6px', padding:'6px 10px',
              background: bg,
              borderTop:'0.5px solid #f0f0f0',
              fontSize:'12px', alignItems:'center'
            }}>
              <span style={{ color:'#1a1a2e' }}>{ing.ingrediente_nombre}</span>
              <span style={{ color: colorNec, fontWeight: ing.suficiente ? '400' : '500' }}>
                {ing.kg_necesarios.toFixed(3)} kg
              </span>
              <span style={{ color: colorTiene, fontWeight:'500' }}>
                {ing.stock_disponible.toFixed(2)} kg
              </span>
              {badge}
            </div>
          );
        })}
      </div>

      {/* ── Aviso stock insuficiente ── */}
      {alertaCount > 0 && (
        <div style={{
          marginTop:'8px',
          background:'#FCEBEB',
          borderRadius:'8px',
          padding:'8px 12px',
          fontSize:'11px', color:'#A32D2D'
        }}>
          Se registrará de todas formas — el stock quedará en negativo
          para los ingredientes marcados en rojo
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────
export default function TabRegistrar({
  mobile,
  // datos
  productos,
  productosDelDia,
  productoSelIdx,
  fecha, setFecha,
  prodSelAdd, setProdSelAdd,
  // funciones
  agregarProducto,
  actualizarParadas,
  eliminarProductoDia,
  setProductoSelIdx,
  limpiarTodo,
  calcularResumenProducto,
  calcularTotalesDia,
  getEstadoProducto,
  guardando,
  guardarProduccion,
}) {
  const totales = calcularTotalesDia();
  const itemSel = productoSelIdx !== null ? productosDelDia[productoSelIdx] : null;
  const resumenSel = itemSel ? calcularResumenProducto(itemSel) : null;

  // ── MOBILE: todo en columna ────────────────────────────────
  if (mobile) {
    return (
      <div>
        {/* Selector agregar */}
        <div style={{
          background:'white', borderRadius:'12px',
          padding:'12px 14px', marginBottom:'8px',
          border:'0.5px solid #e0e0e0'
        }}>
          <div style={{
            fontSize:'11px', color:'#888',
            fontWeight:'600', marginBottom:'6px'
          }}>Agrega un producto:</div>
          <div style={{ display:'flex', gap:'6px' }}>
            <select
              value={prodSelAdd}
              onChange={e => setProdSelAdd(e.target.value)}
              style={{
                flex:1, padding:'9px',
                border:'0.5px solid #ddd',
                borderRadius:'8px', fontSize:'13px'
              }}
            >
              <option value="">Selecciona un producto...</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
              <button
                onClick={() => {
                  console.log('prodSelAdd:', prodSelAdd);
                  agregarProducto(prodSelAdd);
                }}
                disabled={!prodSelAdd}
                style={{
                  padding:'8px 16px',
                  background: prodSelAdd ? '#27ae60' : '#ccc',
                color:'white', border:'none',
                borderRadius:'8px', fontSize:'13px',
                fontWeight:'500', cursor: prodSelAdd ? 'pointer' : 'not-allowed'
              }}
            >+ Agregar</button>
          </div>
        </div>

        {/* Lista productos mobile */}
        {productosDelDia.length === 0 ? (
          <div style={{
            textAlign:'center', padding:'40px',
            color:'#aaa', background:'white',
            borderRadius:'12px', border:'0.5px solid #e0e0e0'
          }}>
            <div style={{ fontSize:'36px', marginBottom:'10px' }}>🏭</div>
            <div style={{ fontSize:'13px' }}>Agrega productos para comenzar</div>
          </div>
        ) : (
          productosDelDia.map((item, idx) => {
            const estado  = getEstadoProducto(item);
            const resumen = calcularResumenProducto(item);
            const esSel   = productoSelIdx === idx;
            const alertas = resumen?.alertas?.length || 0;

            return (
              <div key={idx}>
                {/* Card producto mobile */}
                <div style={{
                  background:'white', borderRadius:'12px',
                  border: esSel
                    ? '1.5px solid #185FA5'
                    : alertas > 0
                    ? `1px solid ${alertas >= 2 ? '#E24B4A' : '#EF9F27'}`
                    : '0.5px solid #e0e0e0',
                  padding:'12px 14px', marginBottom:'8px'
                }}>
                  <div style={{
                    display:'flex', justifyContent:'space-between',
                    alignItems:'center', marginBottom:'8px'
                  }}>
                    <div>
                      <div style={{
                        fontSize:'13px', fontWeight:'500',
                        color: esSel ? '#0C447C' : '#1a1a2e'
                      }}>
                        {item.producto.nombre}
                      </div>
                      {resumen && (
                        <div style={{ fontSize:'10px', color:'#888', marginTop:'2px' }}>
                          {resumen.kgProducidos.toFixed(2)} kg finales ·
                          merma {Math.round(resumen.mermaPorc * 100)}% = −{resumen.mermaKg.toFixed(2)} kg
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => eliminarProductoDia(idx)}
                      style={{
                        background:'none', border:'none',
                        color:'#e74c3c', cursor:'pointer', fontSize:'16px'
                      }}
                    >✕</button>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <div>
                      <div style={{
                        fontSize:'10px', color:'#888',
                        marginBottom:'3px', fontWeight:'500'
                      }}>Paradas</div>
                      <input
                        type="number"
                        value={item.paradas}
                        min="1"
                        onChange={e => actualizarParadas(idx, e.target.value)}
                        onClick={() => setProductoSelIdx(idx)}
                        style={{
                          width:'72px', textAlign:'center',
                          fontSize:'20px', fontWeight:'500',
                          padding:'6px',
                          border: esSel ? '1.5px solid #185FA5' : '1px solid #ddd',
                          borderRadius:'8px'
                        }}
                      />
                    </div>
                    <div style={{ flex:1 }}>
                      <BadgeEstado estado={estado} alertas={alertas} />
                      {resumen && (
                        <div style={{ marginTop:'6px', fontSize:'12px', color:'#1a1a2e' }}>
                          <strong>{resumen.kgProducidos.toFixed(2)} kg</strong> finales ·
                          ${resumen.costoTotal.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detalle inline en mobile si está seleccionado */}
                {esSel && (
                  <div style={{ marginBottom:'8px' }}>
                    <DetalleProducto
                      item={item}
                      resumen={resumen}
                      mobile={true}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Totales + botón mobile */}
        {productosDelDia.length > 0 && (
          <>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 1fr',
              gap:'6px', marginBottom:'8px'
            }}>
              <div style={{
                background:'#f8f9fa', borderRadius:'8px',
                padding:'8px 10px'
              }}>
                <div style={{ fontSize:'10px', color:'#888' }}>kg finales totales</div>
                <div style={{ fontSize:'16px', fontWeight:'500' }}>
                  {totales.kgFinales.toFixed(2)} kg
                </div>
              </div>
              <div style={{
                background:'#f8f9fa', borderRadius:'8px',
                padding:'8px 10px'
              }}>
                <div style={{ fontSize:'10px', color:'#888' }}>costo total</div>
                <div style={{ fontSize:'16px', fontWeight:'500' }}>
                  ${totales.costoTotal.toFixed(2)}
                </div>
              </div>
            </div>

            <div style={{ display:'flex', gap:'8px' }}>
              <button
                onClick={limpiarTodo}
                style={{
                  flex:1, padding:'11px',
                  background:'white',
                  border:'0.5px solid #ddd',
                  borderRadius:'8px', fontSize:'13px',
                  color:'#888', cursor:'pointer'
                }}
              >Limpiar todo</button>
              <button
                onClick={guardarProduccion}
                disabled={guardando}
                style={{
                  flex:2, padding:'11px',
                  background: guardando ? '#ccc' : '#27ae60',
                  color:'white', border:'none',
                  borderRadius:'8px', fontSize:'13px',
                  fontWeight:'500',
                  cursor: guardando ? 'not-allowed' : 'pointer'
                }}
              >
                {guardando ? 'Guardando...' : 'Registrar producción del día'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── DESKTOP: dos columnas ──────────────────────────────────
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

      {/* ══ COLUMNA IZQUIERDA ══ */}
      <div>

        {/* Header día */}
        <div style={{
          background:'#1a1a2e', borderRadius:'12px',
          padding:'12px 16px', marginBottom:'10px'
        }}>
          <div style={{
            display:'flex', justifyContent:'space-between',
            alignItems:'center'
          }}>
            <div>
              <div style={{
                color:'white', fontWeight:'500', fontSize:'14px'
              }}>Producción del día</div>
              <div style={{ color:'#aaa', fontSize:'11px', marginTop:'2px' }}>
                {productosDelDia.length} producto{productosDelDia.length !== 1 ? 's' : ''} ·
                {totales.kgFinales.toFixed(2)} kg finales estimados
              </div>
            </div>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              style={{
                background:'rgba(255,255,255,0.1)',
                border:'0.5px solid rgba(255,255,255,0.2)',
                color:'white', fontSize:'12px',
                padding:'5px 8px', borderRadius:'6px'
              }}
            />
          </div>
        </div>

        {/* Selector agregar */}
        <div style={{
          background:'white', borderRadius:'12px',
          padding:'12px 14px', marginBottom:'8px',
          border:'0.5px solid #e0e0e0'
        }}>
          <div style={{
            fontSize:'11px', color:'#888',
            fontWeight:'600', marginBottom:'6px'
          }}>Busca y agrega un producto:</div>
          <div style={{ display:'flex', gap:'6px' }}>
            <select
              value={prodSelAdd}
              onChange={e => setProdSelAdd(e.target.value)}
              style={{
                flex:1, padding:'8px',
                border:'0.5px solid #ddd',
                borderRadius:'8px', fontSize:'13px'
              }}
            >
              <option value="">Selecciona un producto...</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <button
              onClick={() => {
                console.log('prodSelAdd:', prodSelAdd);
                agregarProducto(prodSelAdd);
              }}
              disabled={!prodSelAdd}
              style={{
                padding:'8px 16px',
                background: prodSelAdd ? '#27ae60' : '#ccc',
                color:'white', border:'none',
                borderRadius:'8px', fontSize:'13px',
                fontWeight:'500',
                cursor: prodSelAdd ? 'pointer' : 'not-allowed'
              }}
            >+ Agregar</button>
          </div>
        </div>

        {/* Lista productos */}
        {productosDelDia.length === 0 ? (
          <div style={{
            textAlign:'center', padding:'40px',
            color:'#aaa', background:'white',
            borderRadius:'12px', border:'0.5px solid #e0e0e0'
          }}>
            <div style={{ fontSize:'36px', marginBottom:'10px' }}>🏭</div>
            <div style={{ fontSize:'13px' }}>
              Agrega productos para comenzar
            </div>
          </div>
        ) : (
          <div style={{
            background:'white', borderRadius:'12px',
            border:'0.5px solid #e0e0e0',
            overflow:'hidden', marginBottom:'10px'
          }}>
            {productosDelDia.map((item, idx) => {
              const estado  = getEstadoProducto(item);
              const resumen = calcularResumenProducto(item);
              const esSel   = productoSelIdx === idx;
              const alertas = resumen?.alertas?.length || 0;

              return (
                <div
                  key={idx}
                  onClick={() => setProductoSelIdx(idx)}
                  style={{
                    display:'flex', alignItems:'center', gap:'8px',
                    padding:'10px 12px',
                    borderBottom:'0.5px solid #f0f0f0',
                    background: esSel ? '#E6F1FB' : 'white',
                    cursor:'pointer',
                    transition:'background .15s'
                  }}
                  onMouseEnter={e => {
                    if (!esSel) e.currentTarget.style.background = '#f8f9fa';
                  }}
                  onMouseLeave={e => {
                    if (!esSel) e.currentTarget.style.background = 'white';
                  }}
                >
                  {/* Info producto */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{
                      fontSize:'13px', fontWeight:'500',
                      color: esSel ? '#0C447C' : '#1a1a2e',
                      overflow:'hidden', textOverflow:'ellipsis',
                      whiteSpace:'nowrap'
                    }}>
                      {item.producto.nombre}
                    </div>
                    <div style={{ fontSize:'10px', color:'#888', marginTop:'2px' }}>
                      {resumen
                        ? `${resumen.kgProducidos.toFixed(2)} kg finales`
                        : 'sin fórmula'}
                    </div>
                  </div>

                  {/* Input paradas */}
                  <input
                    type="number"
                    value={item.paradas}
                    min="1"
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      e.stopPropagation();
                      actualizarParadas(idx, e.target.value);
                    }}
                    style={{
                      width:'58px', textAlign:'center',
                      fontSize:'14px', fontWeight:'500',
                      padding:'5px',
                      border: esSel
                        ? '1.5px solid #185FA5'
                        : '0.5px solid #ddd',
                      borderRadius:'6px'
                    }}
                  />

                  {/* Badge */}
                  <BadgeEstado estado={estado} alertas={alertas} />

                  {/* Botón eliminar */}
                  <button
                    onClick={e => { e.stopPropagation(); eliminarProductoDia(idx); }}
                    style={{
                      background:'none', border:'none',
                      color:'#e74c3c', cursor:'pointer',
                      fontSize:'13px', padding:'0 2px',
                      flexShrink:0
                    }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Totales */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 1fr',
          gap:'6px', marginBottom:'8px'
        }}>
          <div style={{
            background:'#f8f9fa', borderRadius:'8px', padding:'8px 10px'
          }}>
            <div style={{ fontSize:'10px', color:'#888' }}>kg finales totales</div>
            <div style={{ fontSize:'16px', fontWeight:'500', color:'#1a1a2e' }}>
              {totales.kgFinales.toFixed(2)} kg
            </div>
          </div>
          <div style={{
            background:'#f8f9fa', borderRadius:'8px', padding:'8px 10px'
          }}>
            <div style={{ fontSize:'10px', color:'#888' }}>costo total</div>
            <div style={{ fontSize:'16px', fontWeight:'500', color:'#1a1a2e' }}>
              ${totales.costoTotal.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Botones */}
        <div style={{ display:'flex', gap:'6px' }}>
          <button
            onClick={limpiarTodo}
            style={{
              flex:1, padding:'10px',
              background:'white',
              border:'0.5px solid #ddd',
              borderRadius:'8px', fontSize:'12px',
              color:'#888', cursor:'pointer'
            }}
          >Limpiar todo</button>
          <button
            onClick={guardarProduccion}
            disabled={guardando || productosDelDia.length === 0}
            style={{
              flex:2, padding:'10px',
              background: guardando || productosDelDia.length === 0
                ? '#ccc' : '#27ae60',
              color:'white', border:'none',
              borderRadius:'8px', fontSize:'13px',
              fontWeight:'500',
              cursor: guardando || productosDelDia.length === 0
                ? 'not-allowed' : 'pointer'
            }}
          >
            {guardando
              ? 'Guardando...'
              : `Registrar producción del día${productosDelDia.length > 0 ? ` (${productosDelDia.length})` : ''}`}
          </button>
        </div>
      </div>

      {/* ══ COLUMNA DERECHA — detalle producto seleccionado ══ */}
      <div>
        <DetalleProducto
          item={itemSel}
          resumen={resumenSel}
          mobile={false}
        />
      </div>

    </div>
  );
}
