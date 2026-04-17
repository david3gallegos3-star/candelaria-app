import React, { useState, useRef, useEffect } from 'react';

const SYSTEM_PROMPT = `Eres un asistente experto de Embutidos y Jamones Candelaria de Ibarra, Ecuador. 
Ayudas con producción, fórmulas, ingredientes, costos y materias primas de embutidos.
Responde siempre en español, de forma clara y concisa.`;

function GeminiChat({ formulaContexto }) {
  const [abierto,   setAbierto]   = useState(false);
  const [mensaje,   setMensaje]   = useState('');
  const [chat,      setChat]      = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [pos,       setPos]       = useState({ bottom:20, right:20 });
  const [drag,      setDrag]      = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const chatRef  = useRef();
  const headerRef = useRef();

  // Auto scroll al último mensaje
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat, cargando]);

  // ── Drag ──────────────────────────────────────────────────
  function onMouseDown(e) {
    setDrag(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      bottom: pos.bottom,
      right:  pos.right
    });
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (!drag || !dragStart) return;
      const dx = dragStart.x - e.clientX;
      const dy = dragStart.y - e.clientY;
      setPos({
        right:  Math.max(0, dragStart.right  + dx),
        bottom: Math.max(0, dragStart.bottom + dy)
      });
    }
    function onMouseUp() { setDrag(false); }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [drag, dragStart]);

  // ── Enviar mensaje ────────────────────────────────────────
    async function enviar() {
      if (!mensaje.trim() || cargando) return;
      const pregunta = mensaje.trim();
      setMensaje('');
      setChat(prev => [...prev, { rol:'tu', texto:pregunta }]);
      setCargando(true);

      try {
        const response = await fetch('/api/chat', {
          method:  'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({
            mensaje:   pregunta,
            historial: chat,
            contexto:  formulaContexto || null
          })
        });
        const data = await response.json();
        setChat(prev => [...prev, { rol:'ia', texto: data.texto || 'Sin respuesta' }]);
      } catch(e) {
        setChat(prev => [...prev, { rol:'ia', texto:'Error: ' + e.message }]);
      }
      setCargando(false);
    }
  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{
      position:'fixed',
      bottom: `${pos.bottom}px`,
      right:  `${pos.right}px`,
      zIndex: 1000,
      userSelect: drag ? 'none' : 'auto'
    }}>

      {/* ── Botón minimizado ── */}
      {!abierto && (
        <button onClick={() => setAbierto(true)} style={{
          background:'linear-gradient(135deg,#4285f4,#1a73e8)',
          color:'white', border:'none', borderRadius:'50px',
          padding:'12px 18px', cursor:'pointer', fontSize:'14px',
          fontWeight:'bold',
          boxShadow:'0 4px 15px rgba(66,133,244,0.4)',
          display:'flex', alignItems:'center', gap:8,
          transition:'transform 0.2s'
        }}
          onMouseEnter={e => e.currentTarget.style.transform='scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
        >
          <div style={{
            width:8, height:8, background:'#34a853',
            borderRadius:'50%', animation:'pulse 2s infinite'
          }}/>
          🤖 Asistente
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </button>
      )}

      {/* ── Chat abierto ── */}
      {abierto && (
        <div style={{
          width:'340px', background:'white',
          borderRadius:'14px',
          boxShadow:'0 8px 40px rgba(0,0,0,0.2)',
          display:'flex', flexDirection:'column',
          overflow:'hidden'
        }}>
          {/* Header — arrastrable */}
          <div
            ref={headerRef}
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
                <div style={{
                  width:8, height:8, background:'#34a853',
                  borderRadius:'50%'
                }}/>
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
              <button onClick={() => setAbierto(false)} title="Minimizar" style={{
                background:'rgba(255,255,255,0.2)', border:'none',
                color:'white', cursor:'pointer', borderRadius:'4px',
                padding:'2px 8px', fontSize:'14px'
              }}>—</button>
              <button onClick={() => { setAbierto(false); setChat([]); }} title="Cerrar" style={{
                background:'rgba(255,255,255,0.2)', border:'none',
                color:'white', cursor:'pointer', borderRadius:'4px',
                padding:'2px 8px', fontSize:'14px'
              }}>✕</button>
            </div>
          </div>

          {/* Mensajes */}
          <div ref={chatRef} style={{
            height:'280px', overflowY:'auto',
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
                  <>
                    Tengo la fórmula activa cargada.<br/>
                    Pregúntame qué quieres saber<br/>
                    o qué mejorar en ella.
                  </>
                ) : (
                  <>
                    Hola, soy tu asistente.<br/>
                    Pregúntame sobre producción,<br/>
                    fórmulas o costos.
                  </>
                )}
              </div>
            )}

            {chat.map((m, i) => (
              <div key={i} style={{
                display:'flex',
                justifyContent: m.rol === 'tu' ? 'flex-end' : 'flex-start'
              }}>
                <span style={{
                  background: m.rol === 'tu' ? '#4285f4' : 'white',
                  color:      m.rol === 'tu' ? 'white'   : '#333',
                  padding:'8px 12px', borderRadius:
                    m.rol === 'tu' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  maxWidth:'82%', fontSize:'13px',
                  boxShadow:'0 1px 3px rgba(0,0,0,0.1)',
                  lineHeight:'1.5', whiteSpace:'pre-wrap',
                  wordBreak:'break-word'
                }}>
                  {m.texto}
                </span>
              </div>
            ))}

            {cargando && (
              <div style={{ display:'flex', justifyContent:'flex-start' }}>
                <span style={{
                  background:'white', padding:'8px 14px',
                  borderRadius:'12px 12px 12px 2px',
                  fontSize:'13px', color:'#888',
                  boxShadow:'0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <span style={{ animation:'pulse 1s infinite' }}>●</span>{' '}
                  <span style={{ animationDelay:'0.2s', animation:'pulse 1s infinite' }}>●</span>{' '}
                  <span style={{ animationDelay:'0.4s', animation:'pulse 1s infinite' }}>●</span>
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{
            padding:'10px', display:'flex', gap:'8px',
            borderTop:'1px solid #eee', background:'white'
          }}>
            <input
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && enviar()}
              placeholder="Escribe tu pregunta..."
              style={{
                flex:1, padding:'9px 12px', borderRadius:'8px',
                border:'1px solid #ddd', fontSize:'13px',
                outline:'none'
              }}
            />
            <button onClick={enviar} disabled={cargando || !mensaje.trim()} style={{
              background: cargando || !mensaje.trim() ? '#ccc' : '#4285f4',
              color:'white', border:'none', borderRadius:'8px',
              padding:'8px 14px', cursor: cargando ? 'not-allowed' : 'pointer',
              fontSize:'14px', transition:'background 0.2s'
            }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GeminiChat;