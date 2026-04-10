// ============================================
// StockInput.js
// Input editable inline para stock
// ============================================
import React, { useState, useEffect } from 'react';

export default function StockInput({ mp, onSave, disabled }) {
  const [editando, setEditando] = useState(false);
  const [valor,    setValor]    = useState(mp.stock_kg.toString());

  useEffect(() => { setValor(mp.stock_kg.toString()); }, [mp.stock_kg]);

  if (disabled || !editando) {
    return (
      <div
        onClick={() => !disabled && setEditando(true)}
        title={disabled ? '' : 'Click para editar'}
        style={{
          fontWeight:'bold', fontSize:'14px',
          color: mp.stock_kg === 0 ? '#e74c3c' : '#1a1a2e',
          cursor: disabled ? 'default' : 'pointer',
          padding:'2px 6px', borderRadius:'5px',
          background: !disabled ? '#f8f9fa' : 'transparent',
          display:'inline-block', minWidth:'60px', textAlign:'center'
        }}>
        {mp.stock_kg.toFixed(1)} kg
        {!disabled && (
          <span style={{ fontSize:'9px', color:'#aaa', marginLeft:'3px' }}>✏️</span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display:'flex', gap:'4px', alignItems:'center', justifyContent:'center' }}>
      <input
        type="number"
        value={valor}
        onChange={e => setValor(e.target.value)}
        autoFocus
        style={{
          width:'70px', padding:'4px 6px',
          border:'2px solid #27ae60', borderRadius:'6px',
          fontSize:'13px', fontWeight:'bold', textAlign:'center'
        }}
        onKeyDown={e => {
          if (e.key === 'Enter')  { onSave(mp, valor); setEditando(false); }
          if (e.key === 'Escape') { setEditando(false); }
        }}
        onBlur={() => { onSave(mp, valor); setEditando(false); }}
      />
    </div>
  );
}