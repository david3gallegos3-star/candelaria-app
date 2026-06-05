import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import TabResumen        from './components/libroDiario/TabResumen';
import TabPlanCuentas    from './components/libroDiario/TabPlanCuentas';
import TabAsientoInicial from './components/libroDiario/TabAsientoInicial';
import { sincronizarAsientos } from './utils/asientosContables';

const TABS = ['📊 Resumen', '📋 Asientos', '📈 Plan de Cuentas', '⚙️ Asiento Inicial'];

export default function LibroDiario({ onVolver, onVolverMenu, userRol, currentUser }) {
  const [tabActivo, setTabActivo] = useState(0);
  const [vistaMode, setVistaMode] = useState('gerencial');
  const [periodo,   setPeriodo]   = useState(new Date().toISOString().slice(0, 7));
  const [asientos,  setAsientos]  = useState([]);
  const [kpis,      setKpis]      = useState({ debe: 0, haber: 0, pendientes: 0 });
  const [syncing,   setSyncing]   = useState(false);
  const [msgSync,   setMsgSync]   = useState('');

  useEffect(() => { cargarAsientos(); }, [periodo]);

  async function cargarAsientos() {
    const desde = periodo + '-01';
    const [y, m] = periodo.split('-').map(Number);
    const hasta = new Date(y, m, 0).toISOString().split('T')[0]; // último día real del mes
    const { data, error } = await supabase
      .from('libro_diario')
      .select('*, libro_diario_detalle(*, cuentas_contables(codigo, nombre, tipo))')
      .gte('fecha', desde).lte('fecha', hasta)
      .neq('estado', 'eliminado')
      .order('fecha').order('created_at');

    if (error) console.error('Error cargando libro_diario:', error);
    const lista = data || [];
    setAsientos(lista);

    let debe = 0, haber = 0, pendientes = 0;
    lista.forEach(a => {
      (a.libro_diario_detalle || []).forEach(d => {
        debe  += parseFloat(d.debe  || 0);
        haber += parseFloat(d.haber || 0);
      });
      if (a.estado === 'provisional') pendientes++;
    });
    setKpis({ debe, haber, pendientes });
  }

  async function handleSync() {
    setSyncing(true);
    setMsgSync('');
    const resultado = await sincronizarAsientos();
    await cargarAsientos();
    setMsgSync(`✓ ${resultado.sincronizados} asiento(s) sincronizados`);
    setSyncing(false);
    setTimeout(() => setMsgSync(''), 4000);
  }

  const balance = Math.abs(kpis.debe - kpis.haber);
  const cuadrado = balance < 0.01;

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', fontFamily:'Arial,sans-serif' }}>
      {/* Top bar */}
      <div style={{
        background:'#1e293b', padding:'10px 20px',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        borderBottom:'1px solid #334155'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onVolver} style={{
            background:'none', border:'1px solid #475569', color:'#94a3b8',
            borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:12
          }}>← Volver</button>
          <span style={{ color:'white', fontWeight:'bold', fontSize:15 }}>📒 Libro Diario</span>
          <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
            style={{ background:'#374151', color:'#e2e8f0', border:'1px solid #4b5563',
                     borderRadius:6, padding:'4px 8px', fontSize:12 }} />
          <div style={{ display:'flex', background:'#111827', borderRadius:6,
                        border:'1px solid #374151', overflow:'hidden' }}>
            <button onClick={() => setVistaMode('gerencial')} style={{
              background: vistaMode==='gerencial' ? '#1d4ed8' : 'transparent',
              color: vistaMode==='gerencial' ? 'white' : '#6b7280',
              border:'none', padding:'4px 12px', cursor:'pointer', fontSize:11, fontWeight:'bold'
            }}>👔 Gerencial</button>
            <button onClick={() => setVistaMode('sri')} style={{
              background: vistaMode==='sri' ? '#1d4ed8' : 'transparent',
              color: vistaMode==='sri' ? 'white' : '#6b7280',
              border:'none', padding:'4px 12px', cursor:'pointer', fontSize:11
            }}>🏛️ SRI</button>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {msgSync && <span style={{ color:'#4ade80', fontSize:11 }}>{msgSync}</span>}
          <button onClick={handleSync} disabled={syncing} style={{
            background: syncing ? '#374151' : '#6d28d9', color:'white',
            border:'none', borderRadius:6, padding:'6px 14px',
            cursor: syncing ? 'default' : 'pointer', fontSize:12, fontWeight:'bold'
          }}>{syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar'}</button>
          <button style={{
            background:'#0369a1', color:'white', border:'none',
            borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:12
          }}>📥 Exportar</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr',
                    borderBottom:'1px solid #1e293b' }}>
        {[
          { label:'DEBE TOTAL',  value:`$${kpis.debe.toFixed(2)}`,  color:'#4ade80', bg:'#052e16' },
          { label:'HABER TOTAL', value:`$${kpis.haber.toFixed(2)}`, color:'#f87171', bg:'#450a0a' },
          { label:'BALANCE',
            value: cuadrado ? '✓ $0.00' : `⚠ $${balance.toFixed(2)}`,
            color: cuadrado ? '#4ade80' : '#fbbf24', bg:'#0c1a2e' },
          { label:'PENDIENTES',  value:kpis.pendientes, color:'#fbbf24', bg:'#422006' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, padding:'14px 20px', textAlign:'center' }}>
            <div style={{ color:k.color, fontSize:9, fontWeight:'bold', letterSpacing:1, marginBottom:4 }}>
              {k.label}
            </div>
            <div style={{ color:'white', fontSize:22, fontWeight:'bold' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'2px solid #334155' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTabActivo(i)} style={{
            background:'none', border:'none', padding:'10px 20px', cursor:'pointer',
            fontSize:12, fontWeight: tabActivo===i ? 'bold' : 'normal',
            color:    tabActivo===i ? '#3b82f6' : '#9ca3af',
            borderBottom: tabActivo===i ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom:'-2px'
          }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding:'16px 20px' }}>
        {(tabActivo === 0 || tabActivo === 1) && (
          <TabResumen
            asientos={asientos}
            vistaMode={vistaMode}
            onRefresh={cargarAsientos}
            currentUser={currentUser}
          />
        )}
        {tabActivo === 2 && <TabPlanCuentas />}
        {tabActivo === 3 && <TabAsientoInicial currentUser={currentUser} onDone={cargarAsientos} />}
      </div>
    </div>
  );
}
