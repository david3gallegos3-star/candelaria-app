import React, { useState } from 'react';
import { supabase } from '../../supabase';

const COLORES_ORIGEN = {
  facturacion:     { border:'#3b82f6', bg:'#0d1b2e', label:'🧾', text:'#60a5fa' },
  compras:         { border:'#f59e0b', bg:'#1a1000', label:'🛒', text:'#fbbf24' },
  nomina:          { border:'#8b5cf6', bg:'#0d1127', label:'👥', text:'#c4b5fd' },
  caja_chica:      { border:'#22c55e', bg:'#0a1f0a', label:'💵', text:'#86efac' },
  manual:          { border:'#94a3b8', bg:'#1e293b', label:'✏️', text:'#e2e8f0' },
  asiento_inicial: { border:'#f97316', bg:'#1a0d00', label:'🏁', text:'#fdba74' },
  anulacion:       { border:'#ef4444', bg:'#2a0a0a', label:'↩️', text:'#fca5a5' },
  cobros:          { border:'#06b6d4', bg:'#062a30', label:'💰', text:'#67e8f9' },
  pagos_compras:   { border:'#d946ef', bg:'#2a0a2e', label:'💸', text:'#f0abfc' },
};

function esAnulacion(asiento) {
  return /^(Anulación|Reversión|Nota de [Cc]rédito)/.test(asiento.descripcion || '');
}

const FILTROS = ['Todos', 'Confirmados', 'Provisionales', 'facturacion', 'compras', 'nomina', 'caja_chica'];

export default function TabResumen({ asientos, vistaMode, onRefresh, currentUser }) {
  const [filtro,    setFiltro]    = useState('Todos');
  const [seleccion, setSeleccion] = useState(new Set());
  const [cargando,  setCargando]  = useState(false);

  const filtrados = asientos.filter(a => {
    if (vistaMode === 'sri' && a.tipo === 'interno') return false;
    if (filtro === 'Confirmados')   return a.estado === 'confirmado';
    if (filtro === 'Provisionales') return a.estado === 'provisional';
    if (['facturacion','compras','nomina','caja_chica'].includes(filtro)) return a.origen === filtro;
    return true;
  });

  const provisionales = filtrados.filter(a => a.estado === 'provisional');

  async function confirmarSeleccionados() {
    const ids = seleccion.size > 0
      ? [...seleccion]
      : provisionales.map(a => a.id);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Confirmar ${ids.length} asiento(s)?`)) return;
    setCargando(true);
    await supabase.from('libro_diario')
      .update({ estado:'confirmado', confirmado_por: currentUser?.email, confirmado_at: new Date().toISOString() })
      .in('id', ids);
    setSeleccion(new Set());
    await onRefresh();
    setCargando(false);
  }

  async function eliminarAsiento(id) {
    if (!window.confirm('¿Eliminar este asiento provisional?')) return;
    await supabase.from('libro_diario').update({ estado:'eliminado' }).eq('id', id).eq('estado','provisional');
    await onRefresh();
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ color:'#6b7280', fontSize:10 }}>Filtrar:</span>
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            background: filtro===f ? '#1e3a5f' : '#1e293b',
            border: `1px solid ${filtro===f ? '#2563eb' : '#475569'}`,
            color:  filtro===f ? '#93c5fd' : '#cbd5e1',
            padding:'4px 12px', borderRadius:20, fontSize:11, cursor:'pointer'
          }}>{f}</button>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background:'#111827', borderRadius:8, border:'1px solid #1f2937', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 100px 90px 90px 1fr',
                      gap:8, padding:'8px 12px 8px 42px', background:'#1f2937',
                      borderBottom:'1px solid #374151' }}>
          {['Fecha','Descripción','Cuenta','Debe','Haber','Estado'].map((h,i) => (
            <div key={i} style={{ textAlign: i>=3&&i<=4?'right': i===5?'right':'left' }}>
              <div style={{ fontSize:7, marginBottom:1, opacity: i===3||i===4 ? 0.5 : 0 }}>
                {i === 3 ? <span style={{ color:'#4ade80' }}>tengo</span>
                 : i === 4 ? <span style={{ color:'#f87171' }}>salió de:</span>
                 : '·'}
              </div>
              <div style={{ color:'#9ca3af', fontSize:11, fontWeight:'bold', textTransform:'uppercase' }}>{h}</div>
            </div>
          ))}
        </div>

        {filtrados.length === 0 && (
          <div style={{ textAlign:'center', padding:'30px', color:'#6b7280', fontSize:13 }}>
            No hay asientos para este período / filtro
          </div>
        )}

        {filtrados.map(asiento => {
          const col = esAnulacion(asiento) ? COLORES_ORIGEN.anulacion : (COLORES_ORIGEN[asiento.origen] || COLORES_ORIGEN.manual);
          const lineas = asiento.libro_diario_detalle || [];
          return (
            <div key={asiento.id} style={{ borderLeft:`3px solid ${col.border}`, background:col.bg,
                                            borderTop:'1px solid #1f2937' }}>
              <div style={{ padding:'6px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox"
                    checked={seleccion.has(asiento.id)}
                    disabled={asiento.estado !== 'provisional'}
                    onChange={e => {
                      const s = new Set(seleccion);
                      e.target.checked ? s.add(asiento.id) : s.delete(asiento.id);
                      setSeleccion(s);
                    }}
                  />
                  <span style={{ color:col.text, fontSize:11, fontWeight:'bold' }}>
                    {col.label} {asiento.origen.toUpperCase()} — {asiento.descripcion}
                  </span>
                  <span style={{ color:'#6b7280', fontSize:11 }}>{asiento.fecha}</span>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={{
                    background: asiento.estado==='confirmado' ? '#065f46' : '#78350f',
                    color:      asiento.estado==='confirmado' ? '#6ee7b7' : '#fcd34d',
                    fontSize:11, padding:'3px 10px', borderRadius:10
                  }}>
                    {asiento.estado==='confirmado' ? '✓ Confirmado' : '⏳ Provisional'}
                  </span>
                  {asiento.estado === 'provisional' && (
                    <button onClick={() => eliminarAsiento(asiento.id)} style={{
                      background:'none', border:'none', color:'#ef4444',
                      cursor:'pointer', fontSize:12, padding:'0 4px'
                    }}>🗑</button>
                  )}
                </div>
              </div>
              {lineas.map((l, i) => (
                <div key={i} style={{ display:'grid',
                  gridTemplateColumns:'80px 1fr 100px 90px 90px 1fr',
                  gap:8, padding:'6px 12px 6px 42px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color:'#6b7280', fontSize:12 }}>{i===0 ? asiento.fecha : ''}</div>
                  <div style={{ color:'#e5e7eb', fontSize:12 }}>{l.descripcion}</div>
                  <div style={{ color:'#7dd3fc', fontSize:12 }}>{l.cuentas_contables?.codigo}</div>
                  <div style={{ color:'#4ade80', fontSize:12, textAlign:'right', fontWeight:'bold' }}>
                    {parseFloat(l.debe)>0 ? `$${parseFloat(l.debe).toFixed(2)}` : '—'}
                  </div>
                  <div style={{ color:'#f87171', fontSize:12, textAlign:'right', fontWeight:'bold' }}>
                    {parseFloat(l.haber)>0 ? `$${parseFloat(l.haber).toFixed(2)}` : '—'}
                  </div>
                  <div></div><div></div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {provisionales.length > 0 && (
        <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={confirmarSeleccionados} disabled={cargando} style={{
            background: cargando ? '#374151' : '#065f46',
            color:'#6ee7b7', border:'none', borderRadius:7,
            padding:'8px 20px', cursor:'pointer', fontSize:12, fontWeight:'bold'
          }}>
            {cargando ? '⏳...' : `✓ Confirmar ${seleccion.size>0?seleccion.size:provisionales.length} provisionales`}
          </button>
        </div>
      )}
    </div>
  );
}
