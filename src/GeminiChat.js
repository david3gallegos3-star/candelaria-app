import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

function GeminiChat({ formulaContexto, onDescargarExcel }) {
  const [abierto,      setAbierto]      = useState(false);
  const [mensaje,      setMensaje]      = useState('');
  const [chat,         setChat]         = useState([]);
  const [cargando,     setCargando]     = useState(false);
  const [sugerenciaXL, setSugerenciaXL] = useState(null);
  const [pos,          setPos]          = useState({ bottom: 20, right: 20 });
  const [drag,         setDrag]         = useState(false);
  const [dragStart,    setDragStart]    = useState(null);
  const [imagen,       setImagen]       = useState(null); // { base64, mediaType, preview }
  const chatRef    = useRef();
  const wrapRef    = useRef();
  const fileRef    = useRef();

  // Auto scroll
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat, cargando]);

  // ── Drag mouse ────────────────────────────────────────────
  function startDrag(clientX, clientY) {
    setDrag(true);
    setDragStart({ x: clientX, y: clientY, bottom: pos.bottom, right: pos.right });
  }
  function onMouseDown(e) { startDrag(e.clientX, e.clientY); }
  function onTouchStart(e) {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }

  useEffect(() => {
    function move(clientX, clientY) {
      if (!drag || !dragStart) return;
      const dx = dragStart.x - clientX;
      const dy = dragStart.y - clientY;
      setPos({
        right:  Math.max(0, Math.min(window.innerWidth  - 60, dragStart.right  + dx)),
        bottom: Math.max(0, Math.min(window.innerHeight - 60, dragStart.bottom + dy)),
      });
    }
    function onMouseMove(e) { move(e.clientX, e.clientY); }
    function onTouchMove(e) { const t = e.touches[0]; move(t.clientX, t.clientY); }
    function stop() { setDrag(false); }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   stop);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend',  stop);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   stop);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend',  stop);
    };
  }, [drag, dragStart]);

  // ── Seleccionar imagen ────────────────────────────────────
  function seleccionarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const mediaType = file.type; // image/jpeg, image/png, etc.
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const base64  = dataUrl.split(',')[1];
      setImagen({ base64, mediaType, preview: dataUrl, nombre: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // ── Enviar mensaje ────────────────────────────────────────
  async function enviar() {
    if ((!mensaje.trim() && !imagen) || cargando) return;
    const pregunta   = mensaje.trim();
    const imgActual  = imagen;
    setMensaje('');
    setImagen(null);

    // Mostrar en el chat: texto + miniatura si hay imagen
    setChat(prev => [...prev, { rol: 'tu', texto: pregunta, imagen: imgActual }]);
    setCargando(true);
    try {
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje:   pregunta,
          historial: chat,
          contexto:  formulaContexto || null,
          imagen:    imgActual ? { base64: imgActual.base64, mediaType: imgActual.mediaType } : null
        })
      });
      const data  = await response.json();
      let textoRaw = data.texto || 'Sin respuesta';

      // Extraer bloque FORMULA_JSON si existe
      const matchFull  = textoRaw.match(/<FORMULA_JSON>([\s\S]*?)<\/FORMULA_JSON>/);
      const matchOpen  = textoRaw.match(/<FORMULA_JSON>([\s\S]*)/);
      const matchUsado = matchFull || matchOpen;
      if (matchUsado) {
        try {
          const parsed = JSON.parse(matchUsado[1].trim());
          if (parsed.nombre && (parsed.mp || parsed.ad)) setSugerenciaXL(parsed);
        } catch(_) {}
        textoRaw = textoRaw
          .replace(/<FORMULA_JSON>[\s\S]*?<\/FORMULA_JSON>/g, '')
          .replace(/<FORMULA_JSON>[\s\S]*/g, '')
          .trim();
      }

      setChat(prev => [...prev, { rol: 'ia', texto: textoRaw }]);
    } catch(e) {
      setChat(prev => [...prev, { rol: 'ia', texto: 'Error: ' + e.message }]);
    }
    setCargando(false);
  }

  // ── Descargar sugerencia IA como Excel ───────────────────
  function descargarSugerencia() {
    if (!sugerenciaXL) return;
    const { nombre, mp = [], ad = [] } = sugerenciaXL;
    const totalG = [...mp, ...ad].reduce((s, i) => s + (i.g || 0), 0);

    const fila = (seccion, n, g) => ({
      'SECCIÓN': seccion, 'DETALLE': n,
      'GRAMOS':  Math.round(g),
      'KILOS':   parseFloat((g / 1000).toFixed(3)),
      '% TOTAL': totalG > 0 ? parseFloat(((g / totalG) * 100).toFixed(2)) : 0,
      '$/KG': '', 'COSTO $': '', 'NOTA': '← Sugerencia IA'
    });
    const filaVacia = () => ({ 'SECCIÓN':'','DETALLE':'','GRAMOS':'','KILOS':'','% TOTAL':'','$/KG':'','COSTO $':'','NOTA':'' });
    const subTot = (label, items) => {
      const g = items.reduce((s, i) => s + (i.g || 0), 0);
      return { 'SECCIÓN':'','DETALLE':label,'GRAMOS':Math.round(g),'KILOS':parseFloat((g/1000).toFixed(3)),'% TOTAL':totalG>0?parseFloat(((g/totalG)*100).toFixed(2)):0,'$/KG':'','COSTO $':'','NOTA':'' };
    };

    const datos = [
      ...mp.map(i => fila('MATERIAS PRIMAS', i.n, i.g)),
      subTot('SUB-TOTAL MATERIAS PRIMAS', mp),
      filaVacia(),
      ...ad.map(i => fila('CONDIMENTOS Y ADITIVOS', i.n, i.g)),
      subTot('SUB-TOTAL CONDIMENTOS', ad),
      filaVacia(),
      { 'SECCIÓN':'','DETALLE':'TOTAL CRUDO','GRAMOS':Math.round(totalG),'KILOS':parseFloat((totalG/1000).toFixed(3)),'% TOTAL':100,'$/KG':'','COSTO $':'','NOTA':'' },
    ];

    const ws = XLSX.utils.json_to_sheet(datos);
    ws['!cols'] = [{wch:22},{wch:35},{wch:10},{wch:10},{wch:10},{wch:12},{wch:12},{wch:25}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (nombre || 'Sugerencia').substring(0, 31));
    XLSX.writeFile(wb, `Sugerencia_IA_${nombre || 'formula'}.xlsx`);
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div ref={wrapRef} style={{
      position: 'fixed',
      bottom:   `${pos.bottom}px`,
      right:    `${pos.right}px`,
      zIndex:   1000,
      userSelect: drag ? 'none' : 'auto'
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* ── Botón cerrado — arrastrable ── */}
      {!abierto && (
        <button
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onClick={() => !drag && setAbierto(true)}
          style={{
            background: 'linear-gradient(135deg,#4285f4,#1a73e8)',
            color: 'white', border: 'none', borderRadius: '50px',
            padding: '12px 18px', cursor: drag ? 'grabbing' : 'grab',
            fontSize: '14px', fontWeight: 'bold',
            boxShadow: '0 4px 15px rgba(66,133,244,0.4)',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'transform 0.2s', userSelect: 'none'
          }}
          onMouseEnter={e => { if (!drag) e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <div style={{
            width: 8, height: 8, background: '#34a853',
            borderRadius: '50%', animation: 'pulse 2s infinite'
          }}/>
          🤖 Asistente
        </button>
      )}

      {/* ── Chat abierto ── */}
      {abierto && (
        <div style={{
          width: '500px', background: 'white', borderRadius: '14px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', maxWidth: 'calc(100vw - 24px)'
        }}>

          {/* Header — arrastrable */}
          <div
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            style={{
              background: 'linear-gradient(135deg,#4285f4,#1a73e8)',
              padding: '12px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: drag ? 'grabbing' : 'grab', userSelect: 'none'
            }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, background: '#34a853', borderRadius: '50%' }}/>
                <span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>
                  🤖 Asistente Candelaria
                </span>
              </div>
              {formulaContexto && (
                <div style={{ fontSize: '10px', color: '#a8d5f5', marginTop: 2 }}>
                  📋 Fórmula cargada — puedes preguntar sobre ella
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {sugerenciaXL && (
                <button onClick={descargarSugerencia} title="Descargar sugerencia de la IA en Excel"
                  style={{
                    background: '#e65100', border: 'none', color: 'white',
                    cursor: 'pointer', borderRadius: '6px',
                    padding: '4px 10px', fontSize: '12px', fontWeight: 'bold',
                    animation: 'pulse 2s infinite'
                  }}>🤖 Excel IA</button>
              )}
              <button onClick={() => setAbierto(false)} title="Minimizar" style={{
                background: 'rgba(255,255,255,0.2)', border: 'none',
                color: 'white', cursor: 'pointer', borderRadius: '4px',
                padding: '2px 8px', fontSize: '14px'
              }}>—</button>
              <button onClick={() => { setAbierto(false); setChat([]); setSugerenciaXL(null); setImagen(null); }} title="Cerrar" style={{
                background: 'rgba(255,255,255,0.2)', border: 'none',
                color: 'white', cursor: 'pointer', borderRadius: '4px',
                padding: '2px 8px', fontSize: '14px'
              }}>✕</button>
            </div>
          </div>

          {/* Mensajes */}
          <div ref={chatRef} style={{
            height: '420px', overflowY: 'auto',
            padding: '12px', background: '#f8f9fa',
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            {chat.length === 0 && (
              <div style={{
                color: '#888', textAlign: 'center',
                marginTop: formulaContexto ? '20px' : '60px',
                fontSize: '13px', lineHeight: '1.6'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>🤖</div>
                {formulaContexto ? (
                  <>
                    Tengo la fórmula activa cargada.<br/>
                    Pregúntame qué quieres saber o qué mejorar.<br/>
                    <span style={{ fontSize: '11px', color: '#aaa', marginTop: 6, display: 'block' }}>
                      📎 También puedes subir una foto del producto
                    </span>
                  </>
                ) : (
                  <>
                    Hola, soy tu asistente.<br/>
                    Pregúntame sobre producción,<br/>
                    fórmulas o costos.<br/>
                    <span style={{ fontSize: '11px', color: '#aaa', marginTop: 6, display: 'block' }}>
                      📎 Puedes adjuntar fotos para análisis
                    </span>
                  </>
                )}
              </div>
            )}

            {chat.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: m.rol === 'tu' ? 'flex-end' : 'flex-start'
              }}>
                <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', alignItems: m.rol === 'tu' ? 'flex-end' : 'flex-start', gap: 4 }}>
                  {/* Miniatura de imagen si el mensaje la incluye */}
                  {m.imagen && (
                    <img
                      src={m.imagen.preview}
                      alt={m.imagen.nombre}
                      style={{
                        maxWidth: '160px', maxHeight: '120px',
                        borderRadius: '10px', border: '2px solid #4285f4',
                        objectFit: 'cover'
                      }}
                    />
                  )}
                  {m.texto && (
                    <span style={{
                      background: m.rol === 'tu' ? '#4285f4' : 'white',
                      color:      m.rol === 'tu' ? 'white'   : '#333',
                      padding: '9px 13px',
                      borderRadius: m.rol === 'tu' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '13px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                    }}>
                      {m.texto}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {cargando && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <span style={{
                  background: 'white', padding: '10px 14px',
                  borderRadius: '12px 12px 12px 2px',
                  fontSize: '16px', color: '#4285f4',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)', letterSpacing: 3
                }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>●</span>
                  <span style={{ animation: 'pulse 1s 0.2s infinite' }}>●</span>
                  <span style={{ animation: 'pulse 1s 0.4s infinite' }}>●</span>
                </span>
              </div>
            )}
          </div>

          {/* Preview imagen seleccionada */}
          {imagen && (
            <div style={{
              padding: '8px 10px', background: '#e8f4fd',
              borderTop: '1px solid #cce0f5',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <img src={imagen.preview} alt="preview"
                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '2px solid #4285f4' }}
              />
              <div style={{ flex: 1, fontSize: '12px', color: '#1a5276', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📎 {imagen.nombre}
              </div>
              <button onClick={() => setImagen(null)} style={{
                background: '#e74c3c', color: 'white', border: 'none',
                borderRadius: '50%', width: 22, height: 22,
                cursor: 'pointer', fontSize: '12px', flexShrink: 0
              }}>✕</button>
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '10px', display: 'flex', gap: 8,
            borderTop: '1px solid #eee', background: 'white', alignItems: 'center'
          }}>
            {/* Botón adjuntar */}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={seleccionarArchivo}
            />
            <button
              onClick={() => fileRef.current.click()}
              title="Adjuntar foto"
              style={{
                background: imagen ? '#4285f4' : '#f0f0f0',
                color: imagen ? 'white' : '#555',
                border: 'none', borderRadius: '8px',
                padding: '10px 12px', cursor: 'pointer',
                fontSize: '16px', flexShrink: 0,
                transition: 'all 0.2s'
              }}>📎</button>

            <input
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && enviar()}
              placeholder={imagen ? 'Escribe sobre la imagen...' : 'Escribe tu pregunta...'}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: '8px',
                border: '1px solid #ddd', fontSize: '13px', outline: 'none'
              }}
            />
            <button
              onClick={enviar}
              disabled={cargando || (!mensaje.trim() && !imagen)}
              style={{
                background: (cargando || (!mensaje.trim() && !imagen)) ? '#ccc' : '#4285f4',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '8px 16px', cursor: cargando ? 'not-allowed' : 'pointer',
                fontSize: '16px', transition: 'background 0.2s', flexShrink: 0
              }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GeminiChat;
