import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

// ── Detecta y parsea FORMULA_JSON al final de la respuesta ──
function parsearFormula(texto) {
  const idx = texto.indexOf('FORMULA_JSON:');
  if (idx === -1) return null;
  const jsonStr = texto.substring(idx + 'FORMULA_JSON:'.length).trim();
  // Extrae el primer objeto JSON balanceado
  let depth = 0, start = jsonStr.indexOf('{'), end = -1;
  if (start === -1) return null;
  for (let i = start; i < jsonStr.length; i++) {
    if (jsonStr[i] === '{') depth++;
    else if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  try { return JSON.parse(jsonStr.substring(start, end + 1)); } catch { return null; }
}

// ── Texto visible sin el bloque FORMULA_JSON ──
function textoVisible(texto) {
  const idx = texto.indexOf('FORMULA_JSON:');
  return idx === -1 ? texto : texto.substring(0, idx).trim();
}

// ── Genera Excel con el mismo formato + columna de comparación ──
function descargarExcelSugerencia(formula, formulaActual) {
  const mpList  = formula.mp  || [];
  const adList  = formula.ad  || [];
  const totalG  = [...mpList, ...adList].reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0);
  const totMPg  = mpList.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0);
  const totADg  = adList.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0);

  const pct   = (g) => totalG > 0 ? parseFloat(((g / totalG) * 100).toFixed(2)) : 0;
  const norm  = (s) => (s || '').toLowerCase().trim();
  const vacia = () => ({ 'SECCIÓN':'','DETALLE':'','GRAMOS':'','KILOS':'','% TOTAL':'','$/KG':'','COSTO $':'','NOTA':'','CAMBIO vs FÓRMULA ACTUAL':'' });

  // Busca el ingrediente en la fórmula actual y retorna el texto de cambio
  function cambio(nombre, gramosNuevo, seccionActual) {
    if (!formulaActual) return '';
    const lista = seccionActual === 'mp' ? (formulaActual.mp || []) : (formulaActual.ad || []);
    const orig  = lista.find(x => norm(x.nombre) === norm(nombre));
    if (!orig) return '🆕 NUEVO';
    const diff = Math.round(gramosNuevo - orig.gramos);
    if (diff === 0) return '✅ IGUAL';
    return diff > 0 ? `⬆️ AUMENTÓ +${diff}g` : `⬇️ DISMINUYÓ ${diff}g`;
  }

  const fila = (seccion, secKey, nombre, g) => ({
    'SECCIÓN':   seccion,
    'DETALLE':   nombre,
    'GRAMOS':    Math.round(g),
    'KILOS':     parseFloat((g / 1000).toFixed(3)),
    '% TOTAL':   pct(g),
    '$/KG':      '',
    'COSTO $':   '',
    'NOTA':      '',
    'CAMBIO vs FÓRMULA ACTUAL': cambio(nombre, g, secKey)
  });

  // Ingredientes eliminados (en fórmula actual pero no en sugerencia)
  function eliminados(listaActual, listaNueva, seccion) {
    if (!formulaActual) return [];
    return (listaActual || [])
      .filter(orig => !listaNueva.find(n => norm(n.nombre) === norm(orig.nombre)))
      .map(orig => ({
        ...vacia(),
        'SECCIÓN': seccion,
        'DETALLE': orig.nombre,
        'GRAMOS':  0,
        'KILOS':   0,
        '% TOTAL': 0,
        'CAMBIO vs FÓRMULA ACTUAL': `❌ ELIMINADO (era ${orig.gramos}g)`
      }));
  }

  const datos = [
    ...mpList.map(i => fila('MATERIAS PRIMAS', 'mp', i.nombre || '', parseFloat(i.gramos) || 0)),
    ...eliminados(formulaActual?.mp, mpList, 'MATERIAS PRIMAS'),
    { ...vacia(), 'DETALLE':'SUB-TOTAL MATERIAS PRIMAS', 'GRAMOS':Math.round(totMPg), 'KILOS':parseFloat((totMPg/1000).toFixed(3)), '% TOTAL':pct(totMPg) },
    vacia(),
    ...adList.map(i => fila('CONDIMENTOS Y ADITIVOS', 'ad', i.nombre || '', parseFloat(i.gramos) || 0)),
    ...eliminados(formulaActual?.ad, adList, 'CONDIMENTOS Y ADITIVOS'),
    { ...vacia(), 'DETALLE':'SUB-TOTAL CONDIMENTOS', 'GRAMOS':Math.round(totADg), 'KILOS':parseFloat((totADg/1000).toFixed(3)), '% TOTAL':pct(totADg) },
    vacia(),
    { ...vacia(), 'DETALLE':'TOTAL CRUDO', 'GRAMOS':Math.round(totalG), 'KILOS':parseFloat((totalG/1000).toFixed(3)), '% TOTAL':100 },
  ];

  const ws = XLSX.utils.json_to_sheet(datos);
  ws['!cols'] = [{wch:22},{wch:35},{wch:10},{wch:10},{wch:10},{wch:12},{wch:12},{wch:25},{wch:30}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (formula.nombre || 'Sugerencia IA').substring(0, 31));
  XLSX.writeFile(wb, `${formula.nombre || 'Sugerencia_IA'}_sugerencia_IA.xlsx`);
}

const POS_DEFAULT = { bottom: 20, right: 20 };
const SIZE_DEFAULT = { width: 360, height: 300 };

function GeminiChat({ formulaContexto, formulaIngredientes }) {
  const [abierto,     setAbierto]     = useState(false);
  const [mensaje,     setMensaje]     = useState('');
  const [chat,        setChat]        = useState([]);
  const [cargando,    setCargando]    = useState(false);
  const [pos,         setPos]         = useState(POS_DEFAULT);
  const [size,        setSize]        = useState(SIZE_DEFAULT);
  const [drag,        setDrag]        = useState(false);
  const [dragStart,   setDragStart]   = useState(null);
  const [resizing,    setResizing]    = useState(false);
  const [resizeStart, setResizeStart] = useState(null);
  const [archivo,       setArchivo]       = useState(null);
  const [btnDragging,   setBtnDragging]   = useState(false);
  const [btnDragStart,  setBtnDragStart]  = useState(null);
  const btnHasMoved = useRef(false);
  const chatKeyRef  = useRef(null);

  const chatRef = useRef();
  const fileRef = useRef();

  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat, cargando]);

  // ── Persistencia por fórmula ──
  const chatKey = formulaIngredientes?.nombre
    ? `chat_formula_${formulaIngredientes.nombre}`
    : null;

  // Cargar historial cuando cambia la fórmula activa
  useEffect(() => {
    chatKeyRef.current = chatKey;
    if (!chatKey) { setChat([]); return; }
    try {
      const saved = localStorage.getItem(chatKey);
      setChat(saved ? JSON.parse(saved) : []);
    } catch { setChat([]); }
  }, [chatKey]);

  // Guardar historial en cada cambio del chat (sin imágenes base64)
  useEffect(() => {
    const key = chatKeyRef.current;
    if (!key || chat.length === 0) return;
    try {
      const chatParaGuardar = chat.map(m => ({ ...m, previewUrl: null }));
      localStorage.setItem(key, JSON.stringify(chatParaGuardar));
    } catch {}
  }, [chat]);

  // ── Cerrar: resetea posición ──
  function cerrar(limpiarChat) {
    setAbierto(false);
    setPos(POS_DEFAULT);
    if (limpiarChat) {
      setChat([]);
      setArchivo(null);
      if (chatKeyRef.current) localStorage.removeItem(chatKeyRef.current);
    }
  }

  // ── Drag burbuja minimizada ──
  function onBtnMouseDown(e) {
    e.preventDefault();
    btnHasMoved.current = false;
    setBtnDragStart({ x:e.clientX, y:e.clientY, bottom:pos.bottom, right:pos.right });
    setBtnDragging(true);
  }

  // ── Drag (mover el chat abierto) ──
  function onMouseDown(e) {
    setDrag(true);
    setDragStart({ x:e.clientX, y:e.clientY, bottom:pos.bottom, right:pos.right });
  }

  // ── Resize (esquina superior izquierda) ──
  function onResizeMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    setResizeStart({ x:e.clientX, y:e.clientY, width:size.width, height:size.height });
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (drag && dragStart) {
        setPos({
          right:  Math.max(0, dragStart.right  + (dragStart.x - e.clientX)),
          bottom: Math.max(0, dragStart.bottom + (dragStart.y - e.clientY))
        });
      }
      if (resizing && resizeStart) {
        const dw = resizeStart.x - e.clientX;
        const dh = resizeStart.y - e.clientY;
        setSize({
          width:  Math.max(280, Math.min(700, resizeStart.width  + dw)),
          height: Math.max(200, Math.min(600, resizeStart.height + dh))
        });
      }
      if (btnDragging && btnDragStart) {
        const dx = Math.abs(e.clientX - btnDragStart.x);
        const dy = Math.abs(e.clientY - btnDragStart.y);
        if (dx > 5 || dy > 5) {
          btnHasMoved.current = true;
          setPos({
            right:  Math.max(0, btnDragStart.right  + (btnDragStart.x - e.clientX)),
            bottom: Math.max(0, btnDragStart.bottom + (btnDragStart.y - e.clientY))
          });
        }
      }
    }
    function onMouseUp() {
      if (btnDragging && !btnHasMoved.current) setAbierto(true); // fue click
      setDrag(false);
      setResizing(false);
      setBtnDragging(false);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [drag, dragStart, resizing, resizeStart, btnDragging, btnDragStart]);

  // ── Seleccionar archivo ──
  function onSeleccionarArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // dataUrl = "data:image/jpeg;base64,XXXXX"
      const [meta, base64] = dataUrl.split(',');
      const mimeType = meta.match(/:(.*?);/)[1];
      setArchivo({
        base64,
        mimeType,
        nombre: file.name,
        previewUrl: file.type.startsWith('image/') ? dataUrl : null
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // ── Enviar ──
  async function enviar() {
    if ((!mensaje.trim() && !archivo) || cargando) return;
    const pregunta = mensaje.trim();
    const archivoEnviado = archivo;
    setMensaje('');
    setArchivo(null);

    const msgUsuario = {
      rol: 'tu',
      texto: pregunta || `[Archivo: ${archivoEnviado?.nombre}]`,
      previewUrl: archivoEnviado?.previewUrl || null,
      nombreArchivo: archivoEnviado && !archivoEnviado.previewUrl ? archivoEnviado.nombre : null
    };
    setChat(prev => [...prev, msgUsuario]);
    setCargando(true);

    try {
      const body = {
        mensaje:   pregunta,
        historial: chat,
        contexto:  formulaContexto || null,
        archivo:   archivoEnviado ? { base64: archivoEnviado.base64, mimeType: archivoEnviado.mimeType } : null
      };
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type':'application/json' },
        body:    JSON.stringify(body)
      });
      const data = await response.json();
      const textoIA = data.texto || 'Sin respuesta';
      setChat(prev => [...prev, { rol:'ia', texto: textoIA }]);
    } catch(e) {
      setChat(prev => [...prev, { rol:'ia', texto:'Error: ' + e.message }]);
    }
    setCargando(false);
  }

  // ── Render ──
  return (
    <div style={{
      position:'fixed',
      bottom:`${pos.bottom}px`,
      right:`${pos.right}px`,
      zIndex:1000,
      userSelect: (drag || resizing) ? 'none' : 'auto'
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Burbuja minimizada — arrastrable */}
      {!abierto && (
        <button
          onMouseDown={onBtnMouseDown}
          style={{
            background:'linear-gradient(135deg,#4285f4,#1a73e8)',
            color:'white', border:'none', borderRadius:'50px',
            padding:'12px 18px', fontSize:'14px', fontWeight:'bold',
            boxShadow:'0 4px 15px rgba(66,133,244,0.4)',
            display:'flex', alignItems:'center', gap:8,
            cursor: btnDragging ? 'grabbing' : 'grab',
            userSelect:'none'
          }}
        >
          <div style={{ width:8, height:8, background:'#34a853', borderRadius:'50%', animation:'pulse 2s infinite' }}/>
          🤖 Asistente
        </button>
      )}

      {/* Chat abierto */}
      {abierto && (
        <div style={{
          width:`${size.width}px`, background:'white',
          borderRadius:'14px', position:'relative',
          boxShadow:'0 8px 40px rgba(0,0,0,0.2)',
          display:'flex', flexDirection:'column',
          overflow:'hidden'
        }}>
          {/* Grip de redimensionar — esquina superior izquierda */}
          <div
            onMouseDown={onResizeMouseDown}
            title="Arrastra para redimensionar"
            style={{
              position:'absolute', top:0, left:0,
              width:18, height:18, zIndex:10,
              cursor:'nwse-resize',
              background:'linear-gradient(135deg,rgba(255,255,255,0.3),transparent)',
              borderRadius:'0 0 6px 0'
            }}>
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ position:'absolute', top:2, left:2, opacity:0.5 }}>
              <line x1="2" y1="10" x2="10" y2="2" stroke="white" strokeWidth="1.5"/>
              <line x1="6" y1="10" x2="10" y2="6" stroke="white" strokeWidth="1.5"/>
            </svg>
          </div>

          {/* Header arrastrable */}
          <div
            onMouseDown={onMouseDown}
            style={{
              background:'linear-gradient(135deg,#4285f4,#1a73e8)',
              padding:'12px 14px',
              display:'flex', justifyContent:'space-between', alignItems:'center',
              cursor: drag ? 'grabbing' : 'grab',
              userSelect:'none'
            }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, background:'#34a853', borderRadius:'50%' }}/>
                <span style={{ color:'white', fontWeight:'bold', fontSize:'13px' }}>
                  🤖 Asistente Candelaria
                </span>
              </div>
              {formulaContexto && (
                <div style={{ fontSize:'10px', color:'#a8d5f5', marginTop:2 }}>
                  📋 Fórmula cargada — puedes preguntar sobre ella
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={() => cerrar(false)} title="Minimizar (vuelve a esquina)" style={{
                background:'rgba(255,255,255,0.2)', border:'none',
                color:'white', cursor:'pointer', borderRadius:'4px',
                padding:'2px 8px', fontSize:'14px'
              }}>—</button>
              <button onClick={() => cerrar(true)} title="Cerrar y limpiar" style={{
                background:'rgba(255,255,255,0.2)', border:'none',
                color:'white', cursor:'pointer', borderRadius:'4px',
                padding:'2px 8px', fontSize:'14px'
              }}>✕</button>
            </div>
          </div>

          {/* Mensajes */}
          <div ref={chatRef} style={{
            height:`${size.height}px`, overflowY:'auto',
            padding:'12px', background:'#f8f9fa',
            display:'flex', flexDirection:'column', gap:8
          }}>
            {chat.length === 0 && (
              <div style={{
                color:'#888', textAlign:'center',
                marginTop: formulaContexto ? '20px' : '60px',
                fontSize:'13px', lineHeight:'1.6'
              }}>
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>🤖</div>
                {formulaContexto ? (
                  <>Tengo la fórmula activa cargada.<br/>Pregúntame qué quieres saber<br/>o qué mejorar en ella.</>
                ) : (
                  <>Hola, soy tu asistente.<br/>Pregúntame sobre producción,<br/>fórmulas o costos.<br/><br/>📎 Puedes subir fotos o archivos.</>
                )}
              </div>
            )}

            {chat.map((m, i) => {
              const esIA      = m.rol === 'ia';
              const formula   = esIA ? parsearFormula(m.texto) : null;
              const textoMostrar = esIA ? textoVisible(m.texto) : m.texto;
              return (
                <div key={i} style={{
                  display:'flex',
                  flexDirection:'column',
                  alignItems: esIA ? 'flex-start' : 'flex-end'
                }}>
                  {/* Preview imagen del usuario */}
                  {m.previewUrl && (
                    <img src={m.previewUrl} alt="adjunto"
                      style={{ maxWidth:180, maxHeight:120, borderRadius:8, marginBottom:4, objectFit:'cover' }}
                    />
                  )}
                  {/* Nombre de archivo no-imagen */}
                  {m.nombreArchivo && (
                    <div style={{
                      background:'#e8f4fd', color:'#1a5276',
                      padding:'6px 10px', borderRadius:8,
                      fontSize:'12px', marginBottom:4
                    }}>📄 {m.nombreArchivo}</div>
                  )}
                  {/* Burbuja de texto */}
                  {textoMostrar && (
                    <span style={{
                      background: esIA ? 'white' : '#4285f4',
                      color:      esIA ? '#333'  : 'white',
                      padding:'8px 12px',
                      borderRadius: esIA ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                      maxWidth:'85%', fontSize:'13px',
                      boxShadow:'0 1px 3px rgba(0,0,0,0.1)',
                      lineHeight:'1.5', whiteSpace:'pre-wrap',
                      wordBreak:'break-word'
                    }}>
                      {textoMostrar}
                    </span>
                  )}
                  {/* Botón Excel cuando hay FORMULA_JSON */}
                  {formula && (
                    <button
                      onClick={() => descargarExcelSugerencia(formula, formulaIngredientes)}
                      style={{
                        marginTop:6,
                        background:'linear-gradient(135deg,#27ae60,#1e8449)',
                        color:'white', border:'none', borderRadius:8,
                        padding:'7px 14px', cursor:'pointer',
                        fontSize:'12px', fontWeight:'bold',
                        display:'flex', alignItems:'center', gap:6,
                        boxShadow:'0 2px 8px rgba(39,174,96,0.3)'
                      }}>
                      📥 Descargar fórmula Excel
                    </button>
                  )}
                </div>
              );
            })}

            {cargando && (
              <div style={{ display:'flex', justifyContent:'flex-start' }}>
                <span style={{
                  background:'white', padding:'8px 14px',
                  borderRadius:'12px 12px 12px 2px',
                  fontSize:'13px', color:'#888',
                  boxShadow:'0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <span style={{ animation:'pulse 1s infinite' }}>●</span>{' '}
                  <span style={{ animation:'pulse 1s 0.2s infinite' }}>●</span>{' '}
                  <span style={{ animation:'pulse 1s 0.4s infinite' }}>●</span>
                </span>
              </div>
            )}
          </div>

          {/* Preview archivo adjunto */}
          {archivo && (
            <div style={{
              padding:'8px 10px', background:'#f0f8ff',
              borderTop:'1px solid #dce8f5',
              display:'flex', alignItems:'center', gap:8
            }}>
              {archivo.previewUrl
                ? <img src={archivo.previewUrl} alt="prev"
                    style={{ width:40, height:40, objectFit:'cover', borderRadius:6 }} />
                : <div style={{ fontSize:'22px' }}>📄</div>
              }
              <div style={{ flex:1, fontSize:'12px', color:'#333', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {archivo.nombre}
              </div>
              <button onClick={() => setArchivo(null)} style={{
                background:'none', border:'none', color:'#e74c3c',
                cursor:'pointer', fontSize:'16px', padding:'0 4px'
              }}>✕</button>
            </div>
          )}

          {/* Input */}
          <div style={{
            padding:'10px', display:'flex', gap:'6px', alignItems:'center',
            borderTop:'1px solid #eee', background:'white'
          }}>
            {/* Botón adjuntar */}
            <button
              onClick={() => fileRef.current.click()}
              title="Adjuntar imagen o PDF"
              style={{
                background: archivo ? '#e8f4fd' : '#f0f0f0',
                border: archivo ? '1.5px solid #4285f4' : '1.5px solid #ddd',
                borderRadius:'8px', cursor:'pointer',
                padding:'8px 10px', fontSize:'16px',
                color: archivo ? '#4285f4' : '#888',
                flexShrink:0
              }}>📎</button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display:'none' }}
              onChange={onSeleccionarArchivo}
            />

            <input
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && enviar()}
              placeholder={archivo ? 'Mensaje opcional...' : 'Escribe tu pregunta...'}
              style={{
                flex:1, padding:'9px 12px', borderRadius:'8px',
                border:'1px solid #ddd', fontSize:'13px', outline:'none'
              }}
            />
            <button
              onClick={enviar}
              disabled={cargando || (!mensaje.trim() && !archivo)}
              style={{
                background: (cargando || (!mensaje.trim() && !archivo)) ? '#ccc' : '#4285f4',
                color:'white', border:'none', borderRadius:'8px',
                padding:'8px 14px', cursor: cargando ? 'not-allowed' : 'pointer',
                fontSize:'14px', transition:'background 0.2s', flexShrink:0
              }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GeminiChat;
