// ============================================
// FormulacionInputs.js
// Utilidades y componentes de input reutilizables
// ============================================
import { useState, useEffect } from 'react';

export const isMobile = () => window.innerWidth < 700;

export function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function GramosInput({ value, onCommit, disabled, mobile }) {
  const [local, setLocal] = useState(String(value ?? 0));
  useEffect(() => { setLocal(String(value ?? 0)); }, [value]);
  return (
    <input
      type="number" inputMode="numeric"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      disabled={disabled}
      style={{
        width:'100%', padding: mobile ? '6px 4px' : '4px',
        border: disabled ? '1.5px solid #e0e0e0' : '1.5px solid #e3f2fd',
        borderRadius:'6px', fontSize: mobile ? '14px' : '12px',
        fontWeight:'700', textAlign: mobile ? 'center' : 'right',
        color: disabled ? '#aaa' : '#1565c0',
        background: disabled ? '#f0f0f0' : '#f3f8ff',
        boxSizing:'border-box'
      }}
    />
  );
}

export function NoteInput({ value, onCommit, disabled, placeholder, style }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      disabled={disabled}
      placeholder={disabled ? '' : placeholder}
      style={style}
    />
  );
}

export function EspecInput({ value, onCommit, disabled, placeholder, style }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      disabled={disabled}
      placeholder={disabled ? '' : placeholder}
      style={style}
    />
  );
}

export function NumInput({ value, onChange, disabled, style, step, placeholder }) {
  const [local, setLocal] = useState(String(value ?? ''));
  useEffect(() => { setLocal(String(value ?? '')); }, [value]);
  return (
    <input
      type="number" inputMode="decimal"
      step={step || 'any'}
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      disabled={disabled}
      style={style}
    />
  );
}

export function TextInput({ value, onChange, disabled, style, placeholder }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      disabled={disabled}
      style={style}
    />
  );
}