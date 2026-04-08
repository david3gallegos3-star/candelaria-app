import React, { useState } from 'react';
import Groq from 'groq-sdk';

const groq = new Groq({ 
  apiKey: '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',
  dangerouslyAllowBrowser: true 
});

function GeminiChat() {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [chat, setChat] = useState([]);
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    if (!mensaje.trim()) return;
    const pregunta = mensaje;
    setMensaje('');
    setChat(prev => [...prev, { rol: 'tu', texto: pregunta }]);
    setCargando(true);
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'Eres un asistente experto de la empresa Embutidos y Jamones Candelaria de Ibarra, Ecuador. Ayudas con producción, fórmulas, ingredientes, costos y materias primas de embutidos.' },
          { role: 'user', content: pregunta }
        ],
        model: 'llama-3.3-70b-versatile',
      });
      const respuesta = completion.choices[0]?.message?.content || 'Sin respuesta';
      setChat(prev => [...prev, { rol: 'ia', texto: respuesta }]);
    } catch (e) {
      setChat(prev => [...prev, { rol: 'ia', texto: 'Error: ' + e.message }]);
    }
    setCargando(false);
  }

  return (
    <div style={{ position:'fixed', bottom:'20px', right:'20px', zIndex:1000 }}>
      {!abierto ? (
        <button onClick={() => setAbierto(true)}
          style={{ background:'#4285f4', color:'white', border:'none', borderRadius:'50px', padding:'14px 20px', cursor:'pointer', fontSize:'16px', boxShadow:'0 4px 15px rgba(0,0,0,0.3)' }}>
          🤖 Asistente IA
        </button>
      ) : (
        <div style={{ width:'340px', background:'white', borderRadius:'12px', boxShadow:'0 8px 30px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column' }}>
          <div style={{ background:'#4285f4', padding:'14px', borderRadius:'12px 12px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'white', fontWeight:'bold' }}>🤖 Asistente Candelaria</span>
            <button onClick={() => setAbierto(false)} style={{ background:'none', border:'none', color:'white', fontSize:'18px', cursor:'pointer' }}>✕</button>
          </div>
          <div style={{ height:'280px', overflowY:'auto', padding:'12px', background:'#f8f9fa' }}>
            {chat.length === 0 && <p style={{ color:'#888', textAlign:'center', marginTop:'80px' }}>Hola! Pregúntame sobre producción, ingredientes o fórmulas 😊</p>}
            {chat.map((m, i) => (
              <div key={i} style={{ marginBottom:'10px', textAlign: m.rol==='tu' ? 'right' : 'left' }}>
                <span style={{ background: m.rol==='tu' ? '#4285f4' : 'white', color: m.rol==='tu' ? 'white' : '#333', padding:'8px 12px', borderRadius:'12px', display:'inline-block', maxWidth:'80%', fontSize:'13px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' }}>
                  {m.texto}
                </span>
              </div>
            ))}
            {cargando && <p style={{ color:'#888', fontSize:'13px' }}>Escribiendo...</p>}
          </div>
          <div style={{ padding:'10px', display:'flex', gap:'8px', borderTop:'1px solid #eee' }}>
            <input value={mensaje} onChange={e => setMensaje(e.target.value)} onKeyPress={e => e.key==='Enter' && enviar()}
              placeholder="Escribe tu pregunta..."
              style={{ flex:1, padding:'8px', borderRadius:'8px', border:'1px solid #ddd', fontSize:'13px' }} />
            <button onClick={enviar} style={{ background:'#4285f4', color:'white', border:'none', borderRadius:'8px', padding:'8px 14px', cursor:'pointer' }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GeminiChat;