import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const TIPO_COLOR = {
  activo:     '#3b82f6',
  pasivo:     '#ef4444',
  patrimonio: '#8b5cf6',
  ingreso:    '#22c55e',
  gasto:      '#f59e0b',
};

export default function TabPlanCuentas() {
  const [cuentas, setCuentas] = useState([]);

  useEffect(() => {
    supabase.from('cuentas_contables').select('*').order('codigo').then(({ data }) => {
      setCuentas(data || []);
    });
  }, []);

  const nivel1 = cuentas.filter(c => c.nivel === 1);

  function hijos(codigo) {
    const partes = codigo.split('.');
    return cuentas.filter(c => {
      const cp = c.codigo.split('.');
      return cp.length === partes.length + 1 && c.codigo.startsWith(codigo + '.');
    });
  }

  function Cuenta({ c, depth = 0 }) {
    const [abierto, setAbierto] = useState(depth < 2);
    const childs = hijos(c.codigo);
    const color = TIPO_COLOR[c.tipo] || '#94a3b8';
    return (
      <div>
        <div onClick={() => childs.length && setAbierto(!abierto)}
          style={{
            display:'flex', alignItems:'center', gap:8,
            padding:`5px ${8 + depth * 20}px`,
            background: depth===0 ? '#1e293b' : 'transparent',
            borderBottom:'1px solid #1f2937',
            cursor: childs.length ? 'pointer' : 'default',
          }}>
          {childs.length > 0 && (
            <span style={{ color:'#6b7280', fontSize:10, width:10 }}>{abierto ? '▾' : '▸'}</span>
          )}
          {childs.length === 0 && <span style={{ width:10 }}></span>}
          <span style={{ color:'#6b7280', fontSize:10, fontFamily:'monospace', width:80 }}>{c.codigo}</span>
          <span style={{ color: depth===0 ? color : '#e5e7eb', fontSize: depth===0 ? 13 : 12,
                         fontWeight: depth===0 ? 'bold' : 'normal' }}>{c.nombre}</span>
          <span style={{ marginLeft:'auto', background: color+'22', color, fontSize:9,
                         padding:'1px 6px', borderRadius:8 }}>{c.tipo}</span>
          <span style={{ color:'#6b7280', fontSize:9, width:60 }}>{c.naturaleza}</span>
        </div>
        {abierto && childs.map(ch => <Cuenta key={ch.id} c={ch} depth={depth+1} />)}
      </div>
    );
  }

  return (
    <div style={{ background:'#111827', borderRadius:8, border:'1px solid #1f2937', overflow:'hidden' }}>
      <div style={{ display:'flex', gap:8, padding:'10px 14px', background:'#1e293b',
                    borderBottom:'1px solid #334155', flexWrap:'wrap' }}>
        {Object.entries(TIPO_COLOR).map(([tipo, color]) => (
          <span key={tipo} style={{ background:color+'22', color, fontSize:10,
                                    padding:'2px 8px', borderRadius:8 }}>{tipo}</span>
        ))}
      </div>
      {nivel1.map(c => <Cuenta key={c.id} c={c} depth={0} />)}
    </div>
  );
}
