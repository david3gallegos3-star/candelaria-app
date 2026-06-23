import React, { useState } from 'react';

export default function SelectBuscable({ valor, opciones, onChange, placeholder, style }) {
  const [texto, setTexto] = useState('');
  const [foco,  setFoco]  = useState(false);

  const seleccionada = opciones.find(o => o.value === valor);
  const mostrar = foco ? texto : (seleccionada?.label || '');

  const filtradas = foco
    ? opciones.filter(o => o.label.toLowerCase().includes(texto.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        value={mostrar}
        onChange={e => setTexto(e.target.value)}
        onFocus={() => { setFoco(true); setTexto(''); }}
        onBlur={() => setTimeout(() => setFoco(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1.5px solid #ddd',
          fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
      />
      {foco && filtradas.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'white', border: '1px solid #ddd', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
          {filtradas.map(o => (
            <div key={o.value}
              onMouseDown={() => { onChange(o.value); setTexto(''); setFoco(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#333',
                borderBottom: '1px solid #f0f0f0' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
