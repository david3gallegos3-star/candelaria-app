import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { getCuentasModulos } from '../../utils/asientosContables';

export default function TabAsientoInicial({ currentUser, onDone }) {
  const [config,     setConfig]     = useState(null);
  const [banco,      setBanco]      = useState('');
  const [caja,       setCaja]       = useState('');
  const [inventario, setInventario] = useState('');
  const [guardando,  setGuardando]  = useState(false);
  const [msg,        setMsg]        = useState('');

  useEffect(() => {
    supabase.from('config_contabilidad').select('valor').eq('clave','asiento_inicial').single()
      .then(({ data }) => setConfig(data?.valor || {}));
  }, []);

  const yaCompletado = config?.completado === true;

  async function guardarAsientoInicial() {
    const b = parseFloat(banco)      || 0;
    const c = parseFloat(caja)       || 0;
    const i = parseFloat(inventario) || 0;
    const patrimonio = b + c + i;
    if (patrimonio <= 0) return setMsg('Ingresa al menos un saldo mayor a 0');

    setGuardando(true);
    const cuentas = await getCuentasModulos();

    const fecha = new Date().toISOString().split('T')[0];
    const { data: asiento, error } = await supabase.from('libro_diario').insert({
      fecha, descripcion: 'Asiento Inicial — Saldos de apertura',
      tipo: 'interno', origen: 'asiento_inicial', origen_id: null,
      estado: 'confirmado', confirmado_por: currentUser?.email,
      confirmado_at: new Date().toISOString(), created_by: currentUser?.email,
    }).select().single();

    if (error) { setMsg('Error: ' + error.message); setGuardando(false); return; }

    const lineas = [];
    if (b > 0) lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.banco_id,        descripcion:'Saldo inicial Banco',     debe:b, haber:0, orden:0 });
    if (c > 0) lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.caja_general_id,  descripcion:'Saldo inicial Caja',      debe:c, haber:0, orden:1 });
    if (i > 0) lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.inventario_mp_id, descripcion:'Saldo inicial Inventario',debe:i, haber:0, orden:2 });
    lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.capital_id, descripcion:'Patrimonio inicial', debe:0, haber:patrimonio, orden:3 });

    await supabase.from('libro_diario_detalle').insert(lineas);

    await supabase.from('config_contabilidad').update({
      valor: { completado:true, fecha, banco:b, caja:c, inventario:i, patrimonio }
    }).eq('clave','asiento_inicial');

    setMsg(`✓ Asiento inicial creado — Patrimonio: $${patrimonio.toFixed(2)}`);
    setConfig({ completado:true, banco:b, caja:c, inventario:i, patrimonio, fecha });
    setGuardando(false);
    onDone();
  }

  if (yaCompletado) return (
    <div style={{ background:'#111827', borderRadius:10, padding:24, maxWidth:500 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
      <div style={{ color:'#4ade80', fontSize:16, fontWeight:'bold', marginBottom:8 }}>
        Asiento inicial completado
      </div>
      <div style={{ color:'#6b7280', fontSize:12, lineHeight:1.7 }}>
        Banco: ${(config.banco || 0).toFixed(2)} | Caja: ${(config.caja || 0).toFixed(2)} | Inventario: ${(config.inventario || 0).toFixed(2)}<br/>
        Patrimonio total: ${(config.patrimonio || 0).toFixed(2)}<br/>
        Fecha: {config.fecha}
      </div>
    </div>
  );

  return (
    <div style={{ background:'#111827', borderRadius:10, padding:24, maxWidth:500 }}>
      <div style={{ color:'white', fontSize:16, fontWeight:'bold', marginBottom:4 }}>
        ⚙️ Asiento Inicial
      </div>
      <div style={{ color:'#6b7280', fontSize:12, marginBottom:20 }}>
        Ingresa los saldos actuales para crear el asiento de apertura contable. Solo se hace una vez.
      </div>

      {[['🏦 Banco', banco, setBanco], ['💵 Caja General', caja, setCaja], ['📦 Inventario MP', inventario, setInventario]].map(([lbl, val, set]) => (
        <div key={lbl} style={{ marginBottom:14 }}>
          <label style={{ color:'#9ca3af', fontSize:11, display:'block', marginBottom:4 }}>{lbl}</label>
          <input type="number" min="0" step="0.01" value={val}
            onChange={e => set(e.target.value)} placeholder="0.00"
            style={{ background:'#1e293b', border:'1.5px solid #334155', color:'white',
                     borderRadius:8, padding:'9px 12px', width:'100%', boxSizing:'border-box', fontSize:13 }} />
        </div>
      ))}

      <div style={{ background:'#1e293b', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
        <div style={{ color:'#6b7280', fontSize:11, marginBottom:4 }}>Patrimonio (calculado automático):</div>
        <div style={{ color:'#4ade80', fontSize:18, fontWeight:'bold' }}>
          ${((parseFloat(banco)||0)+(parseFloat(caja)||0)+(parseFloat(inventario)||0)).toFixed(2)}
        </div>
      </div>

      {msg && <div style={{ color: msg.startsWith('✓') ? '#4ade80' : '#f87171', fontSize:12, marginBottom:12 }}>{msg}</div>}

      <button onClick={guardarAsientoInicial} disabled={guardando} style={{
        background: guardando ? '#374151' : '#065f46', color:'#6ee7b7',
        border:'none', borderRadius:8, padding:'11px 24px',
        cursor: guardando ? 'default' : 'pointer', fontSize:13, fontWeight:'bold', width:'100%'
      }}>{guardando ? '⏳ Creando asiento...' : '✓ Crear Asiento Inicial'}</button>
    </div>
  );
}
