// ============================================
// ModalCamara.js — VERSIÓN COMPLETA
// Escaneo IA cámara + PDF con:
//   - Campo nombre editable con búsqueda en tiempo real
//   - Caso A: encontrado (verde)
//   - Caso B: similar — radio opciones (ámbar)
//   - Caso C: nuevo + unidad pesable — categoría+ID+tipo (azul)
//   - Caso D: nuevo + unidad NO pesable — KG manual + categoría+ID+tipo (rojo)
// ============================================
import React, { useState } from 'react';

// ── Helpers de color por acción ────────────────────────────
function getBorderColor(r) {
  if (r.esOtraUnidad && r.accion === 'nuevo') return '#e74c3c';
  if (r.accion === 'mismo')     return '#27ae60';
  if (r.accion === 'nuevo')     return '#3498db';
  if (r.accion === 'renombrar') return '#f39c12';
  return '#e74c3c';
}

function getBgColor(r) {
  if (r.esOtraUnidad && r.accion === 'nuevo') return '#fff8f8';
  if (r.accion === 'mismo')     return '#f9fff9';
  if (r.accion === 'nuevo')     return '#f0f8ff';
  if (r.accion === 'renombrar') return '#fffbf0';
  return '#fff8f8';
}

// ── Subcomp: campo nombre con dropdown de búsqueda ─────────
function NombreConBusqueda({
  r, i,
  materiasPrimas,
  resultadosIA, setResultadosIA,
  actualizarNombreIA,
}) {
  const [mostrarDrop, setMostrarDrop] = useState(false);

  const sugerencias = materiasPrimas.filter(mp => {
    const txt = (r.nombre_editado || '').toLowerCase().trim();
    if (!txt || txt.length < 2) return false;
    const n1 = (mp.nombre_producto || '').toLowerCase();
    const n2 = (mp.nombre || '').toLowerCase();
    return n1.includes(txt) || n2.includes(txt);
  }).slice(0, 6);

  function seleccionarExistente(mp) {
    const n = [...resultadosIA];
    n[i] = {
      ...n[i],
      nombre_editado: mp.nombre_producto || mp.nombre,
      match:          mp,
      accion:         'mismo',
      vincular_a:     '',
      // limpiar campos de nuevo al cambiar a existente
      cat_nueva:      '',
      id_nuevo:       '',
      tipo_nuevo:     '',
    };
    setResultadosIA(n);
    setMostrarDrop(false);
  }

  function handleChange(val) {
    actualizarNombreIA(i, val);
    setMostrarDrop(true);
  }

  const chip = r.accion === 'mismo'
    ? { bg:'#d4edda', color:'#155724', txt:'encontrado' }
    : r.accion === 'renombrar'
    ? { bg:'#fff3cd', color:'#856404', txt:'renombrar' }
    : { bg:'#fde8e8', color:'#721c24', txt:'nueva MP' };

  return (
    <div style={{ marginBottom:10, position:'relative' }}>
      <div style={{
        fontSize:'10px', fontWeight:'700',
        color:'#888', marginBottom:4, letterSpacing:'.4px'
      }}>
        NOMBRE — edita o escribe para buscar en tu sistema
      </div>

      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        <input
          type="text"
          value={r.nombre_editado || ''}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setMostrarDrop(true)}
          onBlur={() => setTimeout(() => setMostrarDrop(false), 180)}
          style={{
            flex:1, padding:'9px 12px',
            border:`1.5px solid ${getBorderColor(r)}`,
            borderRadius:'8px', fontSize:'13px', fontWeight:'bold',
            color: r.accion === 'mismo'     ? '#155724'
                 : r.accion === 'nuevo'     ? '#1a5276'
                 : r.accion === 'renombrar' ? '#856404' : '#721c24',
            background: getBgColor(r),
            boxSizing:'border-box'
          }}
        />
        <span style={{
          background: chip.bg, color: chip.color,
          padding:'3px 10px', borderRadius:'20px',
          fontSize:'10px', fontWeight:'700',
          whiteSpace:'nowrap', flexShrink:0
        }}>
          {chip.txt}
        </span>
      </div>

      {/* Dropdown */}
      {mostrarDrop && (
        <div style={{
          position:'absolute', left:0, right:0, top:'100%',
          background:'white', border:'1px solid #ddd',
          borderRadius:'8px', marginTop:2, zIndex:50,
          boxShadow:'0 4px 16px rgba(0,0,0,0.15)',
          overflow:'hidden'
        }}>
          {sugerencias.length === 0 ? (
            <div style={{
              padding:'10px 14px', fontSize:'12px',
              color:'#aaa', fontStyle:'italic'
            }}>
              Sin coincidencias — se guardará como nueva MP
            </div>
          ) : sugerencias.map(mp => (
            <div
              key={mp.id}
              onMouseDown={() => seleccionarExistente(mp)}
              style={{
                padding:'9px 14px', cursor:'pointer',
                borderBottom:'1px solid #f5f5f5',
                display:'flex', justifyContent:'space-between',
                alignItems:'center', background:'white'
              }}
              onMouseEnter={e => e.currentTarget.style.background='#e8f4fd'}
              onMouseLeave={e => e.currentTarget.style.background='white'}
            >
              <div>
                <div style={{ fontWeight:'bold', fontSize:'12px', color:'#1a1a2e' }}>
                  {mp.nombre_producto || mp.nombre}
                </div>
                <div style={{ fontSize:'10px', color:'#888' }}>
                  {mp.id} · {mp.categoria}
                </div>
              </div>
              <div style={{ fontWeight:'bold', color:'#27ae60', fontSize:'12px' }}>
                ${parseFloat(mp.precio_kg || 0).toFixed(2)}/kg
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subcomp: selector categoría + ID auto + tipo ────────────
function SelectorNueva({ r, i, resultadosIA, setResultadosIA, categoriasMp, generarIdPorCategoria }) {

  function setCat(cat) {
    const idAuto = generarIdPorCategoria(cat);
    const n = [...resultadosIA];
    n[i] = { ...n[i], cat_nueva: cat, id_nuevo: idAuto, tipo_nuevo: n[i].tipo_nuevo || '' };
    setResultadosIA(n);
  }

  function setTipo(tipo) {
    const n = [...resultadosIA];
    n[i] = { ...n[i], tipo_nuevo: tipo };
    setResultadosIA(n);
  }

  return (
    <div style={{
      background:'#e8f4fd', border:'1px solid #aed6f1',
      borderRadius:'8px', padding:'10px 12px', marginBottom:10
    }}>
      <div style={{
        fontSize:'10px', fontWeight:'700',
        color:'#1a5276', marginBottom:8, letterSpacing:'.4px'
      }}>
        DATOS PARA CREAR LA NUEVA MATERIA PRIMA
      </div>

      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8
      }}>
        {/* Categoría */}
        <div>
          <div style={{ fontSize:'10px', color:'#1a5276', fontWeight:'700', marginBottom:3 }}>
            Categoría *
          </div>
          <select
            value={r.cat_nueva || ''}
            onChange={e => setCat(e.target.value)}
            style={{
              width:'100%', padding:'8px',
              borderRadius:'7px',
              border: r.cat_nueva ? '1.5px solid #27ae60' : '1.5px solid #e74c3c',
              fontSize:'12px', background:'white'
            }}
          >
            <option value="">— selecciona —</option>
            {categoriasMp.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {!r.cat_nueva && (
            <div style={{ fontSize:'10px', color:'#e74c3c', marginTop:2 }}>
              Requerida para crear MP
            </div>
          )}
        </div>

        {/* ID automático */}
        <div>
          <div style={{ fontSize:'10px', color:'#1a5276', fontWeight:'700', marginBottom:3 }}>
            ID (automático)
          </div>
          <input
            readOnly
            value={r.id_nuevo || (r.cat_nueva ? '...' : '— elige categoría —')}
            style={{
              width:'100%', padding:'8px',
              borderRadius:'7px', border:'1px solid #aed6f1',
              fontSize:'12px', background:'#f0f8ff',
              color: r.id_nuevo ? '#1a5276' : '#aaa',
              fontWeight: r.id_nuevo ? 'bold' : 'normal',
              boxSizing:'border-box'
            }}
          />
        </div>

        {/* Tipo */}
        <div>
          <div style={{ fontSize:'10px', color:'#1a5276', fontWeight:'700', marginBottom:3 }}>
            Tipo
          </div>
          <select
            value={r.tipo_nuevo || ''}
            onChange={e => setTipo(e.target.value)}
            style={{
              width:'100%', padding:'8px',
              borderRadius:'7px', border:'1px solid #aed6f1',
              fontSize:'12px', background:'white'
            }}
          >
            <option value="">— ninguno —</option>
            <option value="MATERIAS PRIMAS">MATERIAS PRIMAS</option>
            <option value="CONDIMENTOS Y ADITIVOS">CONDIMENTOS Y ADITIVOS</option>
          </select>
        </div>
      </div>

      {/* Nota admin */}
      <div style={{
        marginTop:8, background:'#d6eaf8',
        borderLeft:'3px solid #2980b9',
        borderRadius:'0 6px 6px 0',
        padding:'7px 10px', fontSize:'11px', color:'#1a5276'
      }}>
        Se enviará nota automática al administrador para revisar categoría y tipo
      </div>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────
export default function ModalCamara({
  mobile,
  modalCamara, setModalCamara,
  analizandoIA, imagenBase64,
  resultadosIA, setResultadosIA,
  materiasPrimas,
  guardando,
  getPrecioSistema,
  actualizarNombreIA,
  confirmarResultadosIA,
  // nuevos props necesarios
  categoriasMp,
  generarIdPorCategoria,
}) {
  if (!modalCamara) return null;

  // ── helpers internos ──────────────────────────────────────

  // Calcula precio/kg cuando el usuario ingresa kg manualmente (unidad no pesable)
  function calcularPrecioKgDesdeManual(r, kgManual) {
    const totalFactura = (parseFloat(r.cantidad_original) || 0) *
                         (parseFloat(r.precio_unitario)   || 0);
    const kg = parseFloat(kgManual) || 0;
    if (kg <= 0) return '';
    return (totalFactura / kg).toFixed(4);
  }

  function actualizarKgManual(i, val) {
    const n = [...resultadosIA];
    const precioKg = calcularPrecioKgDesdeManual(n[i], val);
    n[i] = {
      ...n[i],
      cantidad_editada: val,
      precio_editado:   precioKg,
    };
    setResultadosIA(n);
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.7)',
      display:'flex',
      alignItems: mobile ? 'flex-end' : 'center',
      justifyContent:'center',
      zIndex:3000, overflowY:'auto'
    }}>
      <div style={{
        background:'white',
        borderRadius: mobile ? '16px 16px 0 0' : '14px',
        width: mobile ? '100%' : '660px',
        maxHeight: mobile ? '92vh' : '90vh',
        display:'flex', flexDirection:'column',
        boxShadow:'0 -4px 40px rgba(0,0,0,0.3)'
      }}>

        {/* ── Header ── */}
        <div style={{
          background:'#8e44ad',
          padding:'14px 18px',
          borderRadius: mobile ? '16px 16px 0 0' : '14px 14px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          flexShrink:0
        }}>
          <div style={{ color:'white', fontWeight:'bold', fontSize:'14px' }}>
            📷 Escaneo IA —{' '}
            {analizandoIA
              ? 'Analizando...'
              : `${resultadosIA.length} producto${resultadosIA.length !== 1 ? 's' : ''} detectado${resultadosIA.length !== 1 ? 's' : ''}`}
          </div>
          <button
            onClick={() => { setModalCamara(false); setResultadosIA([]); }}
            style={{
              background:'rgba(255,255,255,0.2)', border:'none',
              color:'white', fontSize:'16px', cursor:'pointer',
              borderRadius:'6px', padding:'4px 10px'
            }}>✕</button>
        </div>

        {/* ── Analizando ── */}
        {analizandoIA ? (
          <div style={{
            flex:1, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center',
            padding:'40px', gap:'16px'
          }}>
            <div style={{ fontSize:'48px' }}>🤖</div>
            <div style={{ fontWeight:'bold', color:'#8e44ad', fontSize:'16px' }}>
              Analizando con IA...
            </div>
            <div style={{ color:'#888', fontSize:'13px', textAlign:'center' }}>
              Detectando productos, precios y unidades
            </div>
            {imagenBase64 ? (
              <img src={imagenBase64} alt="preview" style={{
                maxWidth:'200px', maxHeight:'150px',
                borderRadius:'8px', objectFit:'cover', opacity:0.6
              }}/>
            ) : (
              <div style={{
                background:'#f3e5f5', borderRadius:'10px',
                padding:'12px 20px', color:'#6c3483', fontSize:'13px'
              }}>📄 Leyendo PDF...</div>
            )}
          </div>

        ) : (
          /* ── Lista de resultados ── */
          <div style={{ overflowY:'auto', flex:1, padding:'14px' }}>

            {resultadosIA.length === 0 && (
              <div style={{ textAlign:'center', padding:'40px', color:'#aaa' }}>
                <div style={{ fontSize:'32px', marginBottom:'8px' }}>😔</div>
                No se detectaron productos. Intenta con una imagen más clara.
              </div>
            )}

            {resultadosIA.map((r, i) => {
              const precioSistema    = getPrecioSistema(r);
              const tieneConversion  = r.conversion?.necesitaConversion;
              const esOtraUnidad     = r.conversion?.esOtraUnidad;
              const esNuevo          = r.accion === 'nuevo';
              const esSimilar        = r.match &&
                (r.nombre_editado || '').toLowerCase() !==
                (r.match.nombre_producto || r.match.nombre || '').toLowerCase();

              return (
                <div key={i} style={{
                  border:`2px solid ${getBorderColor(r)}`,
                  borderRadius:'10px', padding:'12px 14px',
                  marginBottom:'12px', background: getBgColor(r),
                  opacity: r.incluir ? 1 : 0.5,
                  position:'relative'
                }}>

                  {/* ── Fila superior: badges + checkbox ── */}
                  <div style={{
                    display:'flex', justifyContent:'space-between',
                    alignItems:'center', marginBottom:'10px', flexWrap:'wrap', gap:4
                  }}>
                    <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
                      {/* Badge acción */}
                      <span style={{
                        background:
                          r.accion === 'mismo'     ? '#d4edda' :
                          r.accion === 'nuevo'     ? '#d6eaf8' :
                          r.accion === 'renombrar' ? '#fff3cd' : '#fde8e8',
                        color:
                          r.accion === 'mismo'     ? '#155724' :
                          r.accion === 'nuevo'     ? '#1a5276' :
                          r.accion === 'renombrar' ? '#856404' : '#721c24',
                        padding:'2px 8px', borderRadius:'8px',
                        fontSize:'10px', fontWeight:'bold'
                      }}>
                        {r.accion === 'mismo'     ? '✓ ENCONTRADO' :
                         r.accion === 'nuevo'     ? '⚠ NUEVO'      :
                         r.accion === 'renombrar' ? '✏️ RENOMBRAR'  : '⚠ NUEVO'}
                      </span>

                      {/* Badge confianza */}
                      <span style={{ fontSize:'11px', color:'#aaa' }}>
                        Confianza: {r.confianza}
                      </span>

                      {/* Badge unidad */}
                      {r.unidad_original && r.unidad_original !== 'kg' && (
                        <span style={{
                          background: esOtraUnidad ? '#fde8e8'
                            : tieneConversion ? '#fff3cd' : '#f0f0f0',
                          color: esOtraUnidad ? '#721c24'
                            : tieneConversion ? '#856404' : '#888',
                          padding:'2px 8px', borderRadius:'6px',
                          fontSize:'10px', fontWeight:'700'
                        }}>
                          {esOtraUnidad ? '⚠️ ' : tieneConversion ? '⚖️ ' : ''}
                          {r.unidad_original?.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Checkbox incluir */}
                    <label style={{
                      display:'flex', alignItems:'center',
                      gap:'5px', cursor:'pointer',
                      fontSize:'12px', color:'#555'
                    }}>
                      <input type="checkbox" checked={r.incluir}
                        onChange={e => {
                          const n = [...resultadosIA];
                          n[i] = { ...n[i], incluir: e.target.checked };
                          setResultadosIA(n);
                        }}
                      />
                      Incluir
                    </label>
                  </div>

                  {/* ── CAMPO NOMBRE con búsqueda ── */}
                  <NombreConBusqueda
                    r={r} i={i}
                    materiasPrimas={materiasPrimas}
                    resultadosIA={resultadosIA}
                    setResultadosIA={setResultadosIA}
                    actualizarNombreIA={actualizarNombreIA}
                  />

                  {/* ════ CASO A: ENCONTRADO — sin diferencia de nombre ════ */}
                  {r.accion === 'mismo' && !esSimilar && (
                    <div style={{
                      background:'#e8f5e9', border:'1px solid #a5d6a7',
                      borderRadius:'8px', padding:'10px 12px', marginBottom:10
                    }}>
                      <div style={{ fontSize:'11px', color:'#2e7d32', fontWeight:'700', marginBottom:3 }}>
                        Acción: agregar stock a esta MP existente
                      </div>
                      <div style={{ fontSize:'12px', color:'#388e3c', display:'flex', justifyContent:'space-between' }}>
                        <span>
                          <strong>{r.match?.nombre_producto || r.match?.nombre}</strong>
                          {' · '}{r.match?.id} · {r.match?.categoria}
                        </span>
                        <span style={{ fontWeight:'bold' }}>
                          ${parseFloat(r.match?.precio_kg || 0).toFixed(2)}/kg actual
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ════ CASO B: SIMILAR — nombre diferente al del sistema ════ */}
                  {r.match && esSimilar && (
                    <>
                      {/* Comparación factura vs sistema */}
                      <div style={{
                        display:'grid', gridTemplateColumns:'1fr auto 1fr',
                        gap:'8px', alignItems:'center',
                        background:'#f8f9fa', borderRadius:'8px',
                        padding:'8px 10px', marginBottom:'8px', fontSize:'12px'
                      }}>
                        <div>
                          <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>EN LA FACTURA:</div>
                          <div style={{ fontWeight:'500', color:'#856404' }}>{r.nombre_editado}</div>
                        </div>
                        <div style={{ fontSize:'18px', color:'#aaa' }}>≈</div>
                        <div>
                          <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>EN TU SISTEMA:</div>
                          <div style={{ fontWeight:'500', color:'#1a5276' }}>
                            {r.match.nombre_producto || r.match.nombre}
                          </div>
                        </div>
                      </div>

                      {/* Opciones radio */}
                      <div style={{ marginBottom:'10px' }}>
                        {[
                          {
                            val:'mismo',
                            label:`Es el mismo — agregar stock a "${r.match.nombre_producto || r.match.nombre}"`
                          },
                          {
                            val:'nuevo',
                            label:'Es diferente — crear como nueva materia prima'
                          },
                          {
                            val:'renombrar',
                            label:`Renombrar "${r.match.nombre_producto || r.match.nombre}" a "${r.nombre_editado}" en todo el sistema`
                          },
                        ].map(op => (
                          <label key={op.val} style={{
                            display:'flex', alignItems:'flex-start', gap:'8px',
                            cursor:'pointer',
                            background: r.accion === op.val ? '#e8f4fd' : 'white',
                            border:`1.5px solid ${r.accion === op.val ? '#3498db' : '#eee'}`,
                            borderRadius:'7px', padding:'7px 10px',
                            marginBottom:'5px', fontSize:'12px'
                          }}>
                            <input
                              type="radio"
                              name={`accion-${i}`}
                              value={op.val}
                              checked={r.accion === op.val}
                              onChange={() => {
                                const n = [...resultadosIA];
                                n[i] = { ...n[i], accion: op.val };
                                setResultadosIA(n);
                              }}
                              style={{ marginTop:'2px', flexShrink:0 }}
                            />
                            <span>{op.label}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}

                  {/* ════ CASO C y D: NUEVO ════ */}
                  {esNuevo && (
                    <>
                      {/* Vincular a existente opcional */}
                      <div style={{ marginBottom:'10px' }}>
                        <div style={{
                          fontSize:'10px', color:'#888',
                          fontWeight:'700', marginBottom:3
                        }}>
                          ¿VINCULAR A UNA MP EXISTENTE? (opcional)
                        </div>
                        <select
                          value={r.vincular_a || ''}
                          onChange={e => {
                            const n = [...resultadosIA];
                            n[i] = { ...n[i], vincular_a: e.target.value };
                            setResultadosIA(n);
                          }}
                          style={{
                            width:'100%', padding:'8px 12px',
                            border:'1.5px solid #3498db', borderRadius:'8px',
                            fontSize:'13px', color:'#1a5276',
                            background:'#f0f8ff', boxSizing:'border-box'
                          }}
                        >
                          <option value="">— No vincular, crear como nueva MP —</option>
                          {materiasPrimas.map(mp => (
                            <option key={mp.id} value={mp.id}>
                              {mp.nombre_producto || mp.nombre} ({mp.id} · {mp.categoria})
                            </option>
                          ))}
                        </select>
                        {r.vincular_a && (
                          <div style={{ fontSize:'10px', color:'#27ae60', marginTop:'3px' }}>
                            El stock se sumará a la MP seleccionada
                          </div>
                        )}
                      </div>

                      {/* ── CASO D: unidad NO pesable — alerta roja + KG manual ── */}
                      {esOtraUnidad && !r.vincular_a && (
                        <div style={{
                          background:'#fde8e8', border:'1.5px solid #e74c3c',
                          borderRadius:'8px', padding:'10px 12px', marginBottom:10
                        }}>
                          <div style={{ fontSize:'11px', color:'#721c24', fontWeight:'700', marginBottom:3 }}>
                            Unidad no convertible automáticamente a KG
                          </div>
                          <div style={{ fontSize:'12px', color:'#721c24', marginBottom:6 }}>
                            Detectado: <strong>
                              {r.cantidad_original} {r.unidad_original} · ${parseFloat(r.precio_unitario || 0).toFixed(2)}/{r.unidad_original}
                            </strong>
                            {' · '}Total: <strong>
                              ${((parseFloat(r.cantidad_original) || 0) * (parseFloat(r.precio_unitario) || 0)).toFixed(2)}
                            </strong>
                          </div>
                          <div style={{ fontSize:'12px', color:'#a93226', fontWeight:'500' }}>
                            Pesa la caja donde llegaron los {r.cantidad_original} {r.unidad_original} e ingresa el KG total:
                          </div>

                          <div style={{
                            display:'grid', gridTemplateColumns:'1fr 1fr',
                            gap:8, marginTop:8
                          }}>
                            <div>
                              <div style={{ fontSize:'10px', color:'#721c24', fontWeight:'700', marginBottom:3 }}>
                                KG TOTALES (pesas tú)
                              </div>
                              <input
                                type="number"
                                value={r.cantidad_editada || ''}
                                placeholder="Ej: 10"
                                onChange={e => actualizarKgManual(i, e.target.value)}
                                style={{
                                  width:'100%', padding:'9px',
                                  border:'1.5px solid #e74c3c',
                                  borderRadius:'8px', fontSize:'14px',
                                  fontWeight:'bold', textAlign:'center',
                                  boxSizing:'border-box'
                                }}
                              />
                              <div style={{ fontSize:'10px', color:'#a93226', marginTop:2 }}>
                                ¿Cuántos KG son los {r.cantidad_original} {r.unidad_original}?
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize:'10px', color:'#721c24', fontWeight:'700', marginBottom:3 }}>
                                PRECIO / KG (calculado)
                              </div>
                              <input
                                readOnly
                                value={
                                  r.cantidad_editada && parseFloat(r.cantidad_editada) > 0
                                    ? `$${r.precio_editado}`
                                    : ''
                                }
                                placeholder="Se calcula automáticamente"
                                style={{
                                  width:'100%', padding:'9px',
                                  border:'1px solid #f5c6c6',
                                  borderRadius:'8px', fontSize:'14px',
                                  fontWeight:'bold', textAlign:'center',
                                  background:'#fff5f5', color:'#c0392b',
                                  boxSizing:'border-box'
                                }}
                              />
                              <div style={{ fontSize:'10px', color:'#888', marginTop:2 }}>
                                Total ${((parseFloat(r.cantidad_original)||0)*(parseFloat(r.precio_unitario)||0)).toFixed(2)} ÷ KG ingresados
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── CASO C: unidad pesable normal (conversión automática) ── */}
                      {!esOtraUnidad && tieneConversion && !r.vincular_a && (
                        <div style={{
                          background:'#e8f5e9', border:'1px solid #a5d6a7',
                          borderRadius:'8px', padding:'8px 12px', marginBottom:10
                        }}>
                          <div style={{ fontSize:'11px', color:'#2e7d32', fontWeight:'700', marginBottom:2 }}>
                            Conversión automática aplicada
                          </div>
                          <div style={{ fontSize:'12px', color:'#388e3c' }}>
                            {r.conversion?.label}
                          </div>
                        </div>
                      )}

                      {/* Selector categoría + ID + tipo (solo si no vincula a existente) */}
                      {!r.vincular_a && (
                        <SelectorNueva
                          r={r} i={i}
                          resultadosIA={resultadosIA}
                          setResultadosIA={setResultadosIA}
                          categoriasMp={categoriasMp || []}
                          generarIdPorCategoria={generarIdPorCategoria || (() => '')}
                        />
                      )}
                    </>
                  )}

                  {/* ════ KG Y PRECIO — todos los casos ════ */}
                  {/* No se muestra si es unidad no pesable nuevo (ya tiene su campo arriba) */}
                  {!(esNuevo && esOtraUnidad && !r.vincular_a) && (
                    <div style={{
                      display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px',
                      marginTop: esNuevo ? 4 : 10
                    }}>
                      {/* KG */}
                      <div>
                        <div style={{ fontSize:'10px', color:'#888', fontWeight:'700', marginBottom:'3px' }}>
                          {r.unidad_seleccionada === 'kg' || !r.unidad_seleccionada
                            ? 'KG A INGRESAR'
                            : `CANTIDAD (${(r.unidad_seleccionada || '').toUpperCase()})`}
                        </div>
                        <input
                          type="number"
                          value={r.cantidad_editada || ''}
                          placeholder="0"
                          onChange={e => {
                            const n = [...resultadosIA];
                            n[i] = { ...n[i], cantidad_editada: e.target.value };
                            setResultadosIA(n);
                          }}
                          style={{
                            width:'100%', padding:'9px',
                            border:'1.5px solid #27ae60', borderRadius:'8px',
                            fontSize:'14px', fontWeight:'500',
                            textAlign:'center', boxSizing:'border-box'
                          }}
                        />
                        {tieneConversion && r.cantidad_original > 0 && (
                          <div style={{ fontSize:'10px', color:'#888', marginTop:'2px' }}>
                            Original: {r.cantidad_original} {r.unidad_original}
                          </div>
                        )}
                      </div>

                      {/* Precio */}
                      <div>
                        <div style={{ fontSize:'10px', color:'#888', fontWeight:'700', marginBottom:'3px' }}>
                          PRECIO/KG
                          {precioSistema > 0 && (
                            <span style={{ color:'#27ae60', fontWeight:'normal', marginLeft:4 }}>
                              (sistema: ${precioSistema.toFixed(2)})
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          value={
                            r.precio_editado !== null && r.precio_editado !== undefined
                              ? r.precio_editado : ''
                          }
                          placeholder={
                            precioSistema > 0
                              ? `${precioSistema.toFixed(2)}`
                              : '0.00'
                          }
                          onChange={e => {
                            const n = [...resultadosIA];
                            n[i] = { ...n[i], precio_editado: e.target.value };
                            setResultadosIA(n);
                          }}
                          style={{
                            width:'100%', padding:'9px',
                            border:`1px solid ${
                              (!r.precio_editado || r.precio_editado === '') &&
                              precioSistema === 0 ? '#e74c3c' : '#ddd'
                            }`,
                            borderRadius:'8px', fontSize:'14px',
                            textAlign:'center', boxSizing:'border-box'
                          }}
                        />
                        {(!r.precio_editado || r.precio_editado === '') && precioSistema > 0 && (
                          <div style={{ fontSize:'10px', color:'#888', marginTop:'2px' }}>
                            Vacío = usará ${precioSistema.toFixed(2)}
                          </div>
                        )}
                        {(!r.precio_editado || r.precio_editado === '') && precioSistema === 0 && (
                          <div style={{ fontSize:'10px', color:'#e74c3c', marginTop:'2px' }}>
                            ⚠ Se notificará precio en $0
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer botones ── */}
        {!analizandoIA && resultadosIA.length > 0 && (
          <div style={{
            padding:'12px 14px', borderTop:'1px solid #eee',
            display:'flex', gap:'8px', justifyContent:'flex-end',
            flexShrink:0
          }}>
            <button
              onClick={() => { setModalCamara(false); setResultadosIA([]); }}
              style={{
                padding:'10px 18px', background:'#95a5a6',
                color:'white', border:'none', borderRadius:'8px',
                cursor:'pointer', fontSize:'13px'
              }}>
              Cancelar
            </button>

            <button
              onClick={confirmarResultadosIA}
              disabled={guardando}
              style={{
                padding:'10px 24px', background:'#8e44ad',
                color:'white', border:'none', borderRadius:'8px',
                cursor: guardando ? 'not-allowed' : 'pointer',
                fontWeight:'bold', fontSize:'13px',
                opacity: guardando ? 0.7 : 1
              }}>
              {guardando
                ? 'Guardando...'
                : `Confirmar (${resultadosIA.filter(r => r.incluir).length} productos)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
