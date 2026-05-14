import React, { useState } from 'react';

function AsistenteIA() {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [chat, setChat]       = useState([
    { rol: 'bot', texto: 'Hola! Soy tu asistente Candelaria. Puedo ayudarte con costos, fórmulas, inventario y más.' }
  ]);
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    if (!mensaje.trim()) return;
    const userMsg = mensaje.trim();
    setMensaje('');
    setChat(prev => [...prev, { rol: 'user', texto: userMsg }]);
    setCargando(true);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_KEY}`
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            { role: 'system', content: 'Eres el asistente de Embutidos y Jamones Candelaria. Ayudas con costos, fórmulas, inventario y producción. Responde en español, conciso y directo.' },
            ...chat.map(m => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.texto })),
            { role: 'user', content: userMsg }
          ]
        })
      });
      const data = await res.json();
      const respuesta = data.choices?.[0]?.message?.content || 'No pude responder. Intenta de nuevo.';
      setChat(prev => [...prev, { rol: 'bot', texto: respuesta }]);
    } catch(e) {
      setChat(prev => [...prev, { rol: 'bot', texto: 'Error de conexión. Verifica tu clave Groq.' }]);
    }
    setCargando(false);
  }

  return (
    <>
      {/* ── Pill flotante ── */}
      <div
        onClick={() => setAbierto(!abierto)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'white',
          border: '1.5px solid #fde8d8',
          borderRadius: '50px',
          padding: '8px 20px 8px 8px',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(230,126,34,0.15)',
          transition: 'all 0.25s ease',
          userSelect: 'none'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#e67e22';
          e.currentTarget.style.boxShadow = '0 6px 28px rgba(230,126,34,0.3)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#fde8d8';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(230,126,34,0.15)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <RobotOrbita />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>
            Asistente IA
          </span>
          <span style={{ fontSize: '10px', color: '#aaa' }}>
            {abierto ? 'Click para cerrar' : 'Listo para ayudarte'}
          </span>
        </div>

        <BarrasSonido />
      </div>

      {abierto && (
        <PanelChat
          chat={chat}
          mensaje={mensaje}
          setMensaje={setMensaje}
          enviar={enviar}
          cargando={cargando}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

// ── Robot con órbita satélite ─────────────────────────
function RobotOrbita() {
  return (
    <div style={{ width: '44px', height: '44px', position: 'relative', flexShrink: 0 }}>

      {/* DETRÁS del robot — mitad inferior */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)',
        pointerEvents: 'none',
      }}>
        <div style={{ position: 'absolute', inset: 0, animation: 'orbitSpin 4s linear infinite' }}>
          <div style={{
            width: '9px', height: '9px', background: '#e67e22',
            borderRadius: '50%', position: 'absolute',
            top: '0px', left: '50%', transform: 'translateX(-50%)',
            boxShadow: '0 0 6px rgba(230,126,34,0.8)'
          }} />
        </div>
      </div>

      {/* Robot — capa del medio */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        <div style={{
          width: '30px', height: '26px',
          background: '#2c3e50',
          borderRadius: '8px',
          position: 'absolute',
          top: '5px', left: '7px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
        }}>
          <OjoRobot delay="0s" />
          <OjoRobot delay="0.3s" />
        </div>
        <div style={{
          width: '22px', height: '8px',
          background: '#34495e',
          borderRadius: '3px',
          position: 'absolute',
          bottom: '4px', left: '11px'
        }} />
      </div>

      {/* AL FRENTE del robot — mitad superior */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3,
        clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
        pointerEvents: 'none',
      }}>
        <div style={{ position: 'absolute', inset: 0, animation: 'orbitSpin 4s linear infinite' }}>
          <div style={{
            width: '9px', height: '9px', background: '#e67e22',
            borderRadius: '50%', position: 'absolute',
            top: '0px', left: '50%', transform: 'translateX(-50%)',
            boxShadow: '0 0 6px rgba(230,126,34,0.8)'
          }} />
        </div>
      </div>

      <style>{`
        @keyframes orbitSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes eyeGlow {
          0%,100% { background: #e67e22; transform: scale(1); }
          50%      { background: #f39c12; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

function OjoRobot({ delay }) {
  return (
    <div style={{
      width: '7px', height: '7px',
      background: '#e67e22',
      borderRadius: '50%',
      animation: `eyeGlow 1.5s ease-in-out ${delay} infinite`
    }} />
  );
}

// ── Barras de sonido animadas ─────────────────────────
function BarrasSonido() {
  const delays  = ['0s','0.15s','0.3s','0.45s','0.6s'];
  const heights = [6, 14, 10, 16, 8];
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end',
      gap: '2px', height: '18px',
      marginLeft: '4px', flexShrink: 0
    }}>
      {delays.map((d, i) => (
        <div key={i} style={{
          width: '3px', height: `${heights[i]}px`,
          background: '#e67e22', borderRadius: '2px',
          animation: `barWave 1s ease-in-out ${d} infinite`
        }} />
      ))}
      <style>{`
        @keyframes barWave {
          0%,100% { transform: scaleY(0.4); opacity: 0.5; }
          50%      { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Panel de chat ─────────────────────────────────────
function PanelChat({ chat, mensaje, setMensaje, enviar, cargando, onCerrar }) {
  return (
    <div style={{
      position: 'fixed', bottom: '90px', right: '24px',
      zIndex: 9998, width: '320px',
      background: 'white', borderRadius: '16px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
      border: '0.5px solid #e4e7ef',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', animation: 'slideUp 0.25s ease'
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        background: '#1a1a2e', padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: '10px'
      }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '8px',
          background: 'rgba(230,126,34,0.2)',
          border: '1px solid rgba(230,126,34,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px'
        }}>🤖</div>
        <div>
          <div style={{ color: 'white', fontSize: '13px', fontWeight: '600' }}>Asistente IA</div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>Candelaria Intelligence</div>
        </div>
        <button onClick={onCerrar} style={{
          marginLeft: 'auto', background: 'rgba(255,255,255,0.1)',
          border: 'none', color: 'white', borderRadius: '6px',
          padding: '4px 8px', cursor: 'pointer', fontSize: '14px'
        }}>✕</button>
      </div>

      {/* Mensajes */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px',
        maxHeight: '280px', display: 'flex', flexDirection: 'column', gap: '8px'
      }}>
        {chat.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.rol === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              background: m.rol === 'user' ? '#1a1a2e' : '#f5f6fa',
              color: m.rol === 'user' ? 'white' : '#333',
              borderRadius: m.rol === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              padding: '8px 11px', fontSize: '12px', lineHeight: '1.5',
              border: m.rol === 'bot' ? '0.5px solid #e4e7ef' : 'none'
            }}>{m.texto}</div>
          </div>
        ))}
        {cargando && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              background: '#f5f6fa', border: '0.5px solid #e4e7ef',
              borderRadius: '12px 12px 12px 2px',
              padding: '8px 14px', display: 'flex', gap: '4px', alignItems: 'center'
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: '6px', height: '6px',
                  background: '#e67e22', borderRadius: '50%',
                  animation: `dotBounce 1s ease-in-out ${i*0.15}s infinite`
                }} />
              ))}
            </div>
          </div>
        )}
        <style>{`
          @keyframes dotBounce {
            0%,100% { transform: translateY(0); }
            50%      { transform: translateY(-4px); }
          }
        `}</style>
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '0.5px solid #e4e7ef', display: 'flex', gap: '8px' }}>
        <input
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && enviar()}
          placeholder="Pregunta algo..."
          style={{
            flex: 1, background: '#f5f6fa',
            border: '0.5px solid #e4e7ef', borderRadius: '10px',
            padding: '8px 12px', fontSize: '12px', color: '#333', outline: 'none'
          }}
        />
        <button onClick={enviar} disabled={cargando} style={{
          width: '34px', height: '34px',
          background: cargando ? '#ccc' : '#e67e22',
          border: 'none', borderRadius: '10px',
          cursor: cargando ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '15px', color: 'white', flexShrink: 0
        }}>➤</button>
      </div>
    </div>
  );
}

export default AsistenteIA;
