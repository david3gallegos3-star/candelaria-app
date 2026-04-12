// ============================================
// ModalCamara.js
// Modal escaneo IA — cámara y PDF
// Con detección de unidades de medida
// ============================================
import React from 'react';

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
}) {
  if (!modalCamara) return null;

  // Colores por accion
  function borderColor(r) {
    if (r.accion === 'mismo')     return '#27ae60';
    if (r.accion === 'nuevo')     return '#e74c3c';
    return '#f39c12';
  }
  function bgColor(r) {
    if (r.accion === 'mismo')     return '#f9fff9';
    if (r.accion === 'nuevo')     return '#fff8f8';
    return '#fffbf0';
  }

  // Actualizar unidad seleccionada y recalcular cantidad
  function cambiarUnidad(i, nuevaUnidad) {
    const n = [...resultadosIA];
    const r = n[i];
    const cantOrig = parseFloat(r.cantidad_original) || 0;
    const u        = nuevaUnidad.toLowerCase().trim();
    let   nuevaCantidad;

    if (['kg','kilo','kilos'].includes(u)) {
      // Convertir a KG según unidad original
      const uOrig = (r.unidad_original || '').toLowerCase().trim();
      if (['lb','lbs','libra','libras'].includes(uOrig))
        nuevaCantidad = (cantOrig / 2.20462).toFixed(3);
      else if (['g','gr','gramo','gramos'].includes(uOrig))
        nuevaCantidad = (cantOrig / 1000).toFixed(4);
      else if (['oz','onza','onzas'].includes(uOrig))
        nuevaCantidad = (cantOrig / 35.274).toFixed(4);
      else if (['t','ton','tonelada','toneladas'].includes(uOrig))
        nuevaCantidad = (cantOrig * 1000).toFixed(2);
      else
        nuevaCantidad = cantOrig;
    } else if (['g','gr','gramo','gramos'].includes(u)) {
      // Convertir a GR
      const uOrig = (r.unidad_original || '').toLowerCase().trim();
      if (['lb','lbs','libra','libras'].includes(uOrig))
        nuevaCantidad = (cantOrig / 2.20462 * 1000).toFixed(1);
      else
        nuevaCantidad = cantOrig;
    } else {
      // Dejar en unidad original
      nuevaCantidad = cantOrig;
    }

    n[i] = { ...r, unidad_seleccionada: nuevaUnidad, cantidad_editada: nuevaCantidad };
    setResultadosIA(n);
  }

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
        width: mobile ? '100%' : '640px',
        maxHeight: mobile ? '92vh' : '90vh',
        display:'flex', flexDirection:'column',
        boxShadow:'0 -4px 40px rgba(0,0,0,0.3)'
      }}>

        {/* ── Header ── */}
        <div style={{
          background:'#8e44ad',
          padding:'14px 18px',
          borderRadius: mobile ? '16px 16px 0 0' : '14px 14px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <div style={{ color:'white', fontWeight:'bold', fontSize:'14px' }}>
            📷 Escaneo IA —{' '}
            {analizandoIA
              ? 'Analizando...'
              : `${resultadosIA.length} productos detectados`}
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
              Claude Vision está leyendo productos, precios y unidades
            </div>
            {imagenBase64 && (
              <img src={imagenBase64} alt="preview" style={{
                maxWidth:'200px', maxHeight:'150px',
                borderRadius:'8px', objectFit:'cover', opacity:0.6
              }}/>
            )}
            {!imagenBase64 && (
              <div style={{
                background:'#f3e5f5', borderRadius:'10px',
                padding:'12px 20px', color:'#6c3483', fontSize:'13px'
              }}>📄 Leyendo PDF...</div>
            )}
          </div>

        ) : (
          /* ── Resultados ── */
          <div style={{ overflowY:'auto', flex:1, padding:'14px' }}>

            {resultadosIA.length === 0 && (
              <div style={{ textAlign:'center', padding:'40px', color:'#aaa' }}>
                <div style={{ fontSize:'32px', marginBottom:'8px' }}>😔</div>
                No se detectaron productos. Intenta con una imagen más clara.
              </div>
            )}

            {resultadosIA.map((r, i) => {
              const precioSistema = getPrecioSistema(r);
              const tieneConversion = r.conversion?.necesitaConversion;
              const esOtraUnidad   = r.conversion?.esOtraUnidad;

              return (
                <div key={i} style={{
                  border:`2px solid ${borderColor(r)}`,
                  borderRadius:'10px', padding:'12px 14px',
                  marginBottom:'10px', background:bgColor(r),
                  opacity: r.incluir ? 1 : 0.5
                }}>

                  {/* Header tarjeta */}
                  <div style={{
                    display:'flex', justifyContent:'space-between',
                    alignItems:'center', marginBottom:'10px'
                  }}>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{
                        background:
                          r.accion === 'mismo' ? '#d4edda' :
                          r.accion === 'nuevo' ? '#f8d7da' : '#fff3cd',
                        color:
                          r.accion === 'mismo' ? '#155724' :
                          r.accion === 'nuevo' ? '#721c24' : '#856404',
                        padding:'2px 8px', borderRadius:'6px',
                        fontSize:'10px', fontWeight:'700'
                      }}>
                        {r.accion === 'mismo' ? '✓ ENCONTRADO' :
                         r.accion === 'nuevo' ? '⚠ NUEVO' : '✏️ RENOMBRAR'}
                      </span>
                      <span style={{ fontSize:'11px', color:'#aaa' }}>
                        Confianza: {r.confianza}
                      </span>
                      {/* Badge unidad */}
                      {r.unidad_original && r.unidad_original !== 'kg' && (
                        <span style={{
                          background: tieneConversion ? '#fff3cd' : '#f0f0f0',
                          color:      tieneConversion ? '#856404' : '#888',
                          padding:'2px 8px', borderRadius:'6px',
                          fontSize:'10px', fontWeight:'700'
                        }}>
                          {tieneConversion ? '⚖️ ' : ''}
                          {r.unidad_original?.toUpperCase()}
                        </span>
                      )}
                    </div>

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

                  {/* ── SELECTOR DE UNIDADES ── */}
                  {r.opciones_unidad && r.opciones_unidad.length > 1 && (
                    <div style={{
                      background: tieneConversion ? '#fff8e1' : '#f8f9fa',
                      border:`1px solid ${tieneConversion ? '#ffc107' : '#e0e0e0'}`,
                      borderRadius:'8px', padding:'10px 12px', marginBottom:'10px'
                    }}>
                      <div style={{
                        fontSize:'10px', fontWeight:'700',
                        color: tieneConversion ? '#856404' : '#888',
                        marginBottom:'6px'
                      }}>
                        {tieneConversion
                          ? `⚖️ UNIDAD DETECTADA: ${r.unidad_original?.toUpperCase()} — ¿cómo ingresar al sistema?`
                          : 'UNIDAD DE MEDIDA'}
                      </div>
                      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                        {r.opciones_unidad.map((op, j) => (
                          <button key={j}
                            onClick={() => cambiarUnidad(i, op.val)}
                            style={{
                              padding:'5px 12px', borderRadius:'7px',
                              border: r.unidad_seleccionada === op.val
                                ? `2px solid ${tieneConversion ? '#f39c12' : '#27ae60'}`
                                : '1.5px solid #ddd',
                              background: r.unidad_seleccionada === op.val
                                ? (tieneConversion ? '#fff3cd' : '#e8f5e9')
                                : 'white',
                              cursor:'pointer', fontSize:'11px',
                              fontWeight: r.unidad_seleccionada === op.val ? '700' : '400',
                              color: r.unidad_seleccionada === op.val
                                ? (tieneConversion ? '#856404' : '#155724')
                                : '#555'
                            }}>
                            {op.recomendado && '✓ '}{op.label}
                          </button>
                        ))}
                      </div>
                      {tieneConversion && r.conversion?.label && (
                        <div style={{ fontSize:'11px', color:'#856404', marginTop:'6px' }}>
                          Conversión: <strong>{r.conversion.label}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Unidad no convertible */}
                  {esOtraUnidad && (
                    <div style={{
                      background:'#fde8e8', border:'1px solid #f5c6c6',
                      borderRadius:'8px', padding:'8px 12px', marginBottom:'10px',
                      fontSize:'11px', color:'#721c24'
                    }}>
                      ⚠️ Unidad "<strong>{r.unidad_original}</strong>" no es de peso —
                      ingresa el equivalente en kg manualmente
                    </div>
                  )}

                  {/* Comparación factura vs sistema */}
                  {r.match && r.accion !== 'nuevo' && (
                    <div style={{
                      display:'grid', gridTemplateColumns:'1fr auto 1fr',
                      gap:'8px', alignItems:'center',
                      background:'#f8f9fa', borderRadius:'8px',
                      padding:'8px 10px', marginBottom:'8px', fontSize:'12px'
                    }}>
                      <div>
                        <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>EN LA FACTURA:</div>
                        <div style={{ fontWeight:'500', color:'#856404' }}>{r.nombre}</div>
                      </div>
                      <div style={{ fontSize:'18px', color:'#aaa' }}>≈</div>
                      <div>
                        <div style={{ fontSize:'10px', color:'#888', fontWeight:'700' }}>EN TU SISTEMA:</div>
                        <div style={{ fontWeight:'500', color:'#1a5276' }}>
                          {r.match.nombre_producto || r.match.nombre}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Opciones radio similitud */}
                  {r.match && r.nombre.toLowerCase() !==
                    (r.match.nombre_producto || r.match.nombre).toLowerCase() && (
                    <div style={{ marginBottom:'10px' }}>
                      {[
                        { val:'mismo',    label:`Sí, es el mismo — agregar a "${r.match.nombre_producto || r.match.nombre}"` },
                        { val:'nuevo',    label:'No, es diferente — crear como nueva materia prima' },
                        { val:'renombrar',label:`Renombrar a "${r.nombre}" en todo el sistema` },
                      ].map(op => (
                        <label key={op.val} style={{
                          display:'flex', alignItems:'flex-start', gap:'8px',
                          cursor:'pointer',
                          background: r.accion === op.val ? '#f0f8ff' : 'white',
                          border:`1.5px solid ${r.accion === op.val ? '#3498db' : '#eee'}`,
                          borderRadius:'7px', padding:'7px 10px',
                          marginBottom:'5px', fontSize:'12px'
                        }}>
                          <input type="radio" name={`accion-${i}`} value={op.val}
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
                  )}

                  {/* Nombre editable */}
                  <div style={{ marginBottom:'10px' }}>
                    <div style={{
                      fontSize:'10px', color:'#888', fontWeight:'700', marginBottom:'3px'
                    }}>
                      {r.accion === 'nuevo'
                        ? 'NOMBRE DETECTADO — edita si es incorrecto'
                        : 'NOMBRE — edita si quieres cambiarlo'}
                    </div>
                    <input type="text" value={r.nombre_editado || ''}
                      onChange={e => actualizarNombreIA(i, e.target.value)}
                      style={{
                        width:'100%', padding:'8px 12px',
                        border:`1.5px solid ${borderColor(r)}`,
                        borderRadius:'8px', fontSize:'13px',
                        fontWeight:'bold', boxSizing:'border-box',
                        color:   r.accion === 'nuevo' ? '#721c24' : '#155724',
                        background: r.accion === 'nuevo' ? '#fff8f8' : '#f9fff9'
                      }}
                    />
                  </div>

                  {/* Vincular a existente (solo NUEVO) */}
                  {r.accion === 'nuevo' && (
                    <div style={{ marginBottom:'10px' }}>
                      <div style={{ fontSize:'10px', color:'#888', fontWeight:'700', marginBottom:'3px' }}>
                        ¿VINCULAR A UNA MP EXISTENTE?
                      </div>
                      <select value={r.vincular_a || ''}
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
                        }}>
                        <option value="">— No vincular, crear como nueva MP —</option>
                        {materiasPrimas.map(mp => (
                          <option key={mp.id} value={mp.id}>
                            {mp.nombre_producto || mp.nombre} ({mp.id} · {mp.categoria})
                          </option>
                        ))}
                      </select>
                      {r.vincular_a && (
                        <div style={{ fontSize:'10px', color:'#27ae60', marginTop:'3px' }}>
                          ✓ El stock se sumará a la MP seleccionada
                        </div>
                      )}
                    </div>
                  )}

                  {/* KG y Precio */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>

                    {/* KG */}
                    <div>
                      <div style={{ fontSize:'10px', color:'#888', fontWeight:'700', marginBottom:'3px' }}>
                        {r.unidad_seleccionada === 'kg' || !r.unidad_seleccionada
                          ? 'KG A INGRESAR'
                          : `CANTIDAD (${(r.unidad_seleccionada||'').toUpperCase()})`}
                      </div>
                      <input type="number"
                        value={r.cantidad_editada || ''}
                        placeholder="0"
                        onChange={e => {
                          const n = [...resultadosIA];
                          n[i] = { ...n[i], cantidad_editada: e.target.value };
                          setResultadosIA(n);
                        }}
                        style={{
                          width:'100%', padding:'7px',
                          border:'1.5px solid #27ae60', borderRadius:'7px',
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
                      <input type="number"
                        value={r.precio_editado !== null && r.precio_editado !== undefined
                          ? r.precio_editado : ''}
                        placeholder={precioSistema > 0 ? `${precioSistema.toFixed(2)}` : '0.00'}
                        onChange={e => {
                          const n = [...resultadosIA];
                          n[i] = { ...n[i], precio_editado: e.target.value };
                          setResultadosIA(n);
                        }}
                        style={{
                          width:'100%', padding:'7px',
                          border:`1px solid ${
                            (!r.precio_editado || r.precio_editado === '') &&
                            precioSistema === 0 ? '#e74c3c' : '#ddd'
                          }`,
                          borderRadius:'7px', fontSize:'14px',
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
                </div>
              );
            })}
          </div>
        )}

        {/* Footer botones */}
        {!analizandoIA && resultadosIA.length > 0 && (
          <div style={{
            padding:'12px 14px', borderTop:'1px solid #eee',
            display:'flex', gap:'8px', justifyContent:'flex-end'
          }}>
            <button onClick={() => { setModalCamara(false); setResultadosIA([]); }}
              style={{
                padding:'10px 18px', background:'#95a5a6',
                color:'white', border:'none', borderRadius:'8px',
                cursor:'pointer', fontSize:'13px'
              }}>Cancelar</button>

            <button onClick={confirmarResultadosIA} disabled={guardando}
              style={{
                padding:'10px 24px', background:'#8e44ad',
                color:'white', border:'none', borderRadius:'8px',
                cursor: guardando ? 'not-allowed' : 'pointer',
                fontWeight:'bold', fontSize:'13px',
                opacity: guardando ? 0.7 : 1
              }}>
              {guardando
                ? 'Guardando...'
                : `✅ Confirmar (${resultadosIA.filter(r => r.incluir).length} productos)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}