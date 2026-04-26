// ============================================
// TabDespacho.js — stock por lote (FIFO)
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export default function TabDespacho({ mobile, currentUser }) {
  const [fecha,          setFecha]          = useState(hoy());
  const [stockLotes,     setStockLotes]     = useState([]); // [{corte_nombre, total, lotes:[...]}]
  const [registros,      setRegistros]      = useState([]);
  const [cierre,         setCierre]         = useState(null);
  const [cargando,       setCargando]       = useState(true);

  const [modal,          setModal]          = useState(false);
  const [editando,       setEditando]       = useState(null);
  const [corteSelec,     setCorteSelec]     = useState('');
  const [loteSelecId,    setLoteSelecId]    = useState(''); // id de stock_lotes_inyectados
  const [pesoAntes,      setPesoAntes]      = useState('');
  const [pesoFunda,      setPesoFunda]      = useState('');
  const [pesoRemanente,  setPesoRemanente]  = useState('');
  const [guardando,      setGuardando]      = useState(false);
  const [errorModal,     setErrorModal]     = useState('');

  const [modalCierre,    setModalCierre]    = useState(false);
  const [pesoHueso,      setPesoHueso]      = useState('');
  const [pesoAserrin,    setPesoAserrin]    = useState('');
  const [pesoCarnudo,    setPesoCarnudo]    = useState('');
  const [guardandoCierre,setGuardandoCierre]= useState(false);

  const [exito,          setExito]          = useState('');
  const [error,          setError]          = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: lotesData }, { data: regs }, { data: cierreData }] = await Promise.all([
      supabase.from('stock_lotes_inyectados')
        .select('*')
        .gt('kg_disponible', 0)
        .order('fecha_entrada', { ascending: true }),
      supabase.from('despacho_cortes')
        .select('*').eq('fecha', fecha)
        .order('created_at', { ascending: false }),
      supabase.from('despacho_cierre_dia')
        .select('*').eq('fecha', fecha).maybeSingle(),
    ]);

    // Agrupar lotes por corte_nombre
    const grouped = {};
    (lotesData || []).forEach(row => {
      if (!grouped[row.corte_nombre]) {
        grouped[row.corte_nombre] = {
          corte_nombre:     row.corte_nombre,
          materia_prima_id: row.materia_prima_id,
          lotes:            [],
          total:            0,
        };
      }
      grouped[row.corte_nombre].lotes.push(row);
      grouped[row.corte_nombre].total += parseFloat(row.kg_disponible || 0);
    });
    setStockLotes(Object.values(grouped));
    setRegistros(regs || []);
    setCierre(cierreData || null);
    setCargando(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditando(null); setCorteSelec(''); setLoteSelecId('');
    setPesoAntes(''); setPesoFunda(''); setPesoRemanente('');
    setErrorModal(''); setModal(true);
  }

  function abrirEditar(reg) {
    setEditando(reg); setCorteSelec(reg.corte_nombre || '');
    setLoteSelecId('');
    setPesoAntes(String(reg.peso_antes || ''));
    setPesoFunda(String(reg.peso_funda || ''));
    setPesoRemanente(String(reg.peso_remanente || ''));
    setErrorModal(''); setModal(true);
  }

  async function guardarRegistro() {
    const antes     = parseFloat(pesoAntes);
    const funda     = parseFloat(pesoFunda);
    const remanente = parseFloat(pesoRemanente || 0);

    if (!corteSelec)           { setErrorModal('Selecciona un corte'); return; }
    if (!loteSelecId)          { setErrorModal('Selecciona el lote del que vas a cortar'); return; }
    if (!antes || antes <= 0)  { setErrorModal('Ingresa el peso antes de cortar'); return; }
    if (!funda || funda <= 0)  { setErrorModal('Ingresa el peso de la funda'); return; }
    if (funda + remanente > antes + 0.01) {
      setErrorModal('Funda + Remanente no puede superar el Peso Antes'); return;
    }

    const corteData = stockLotes.find(s => s.corte_nombre === corteSelec);
    const loteData  = corteData?.lotes.find(l => l.id === loteSelecId);
    const mpId      = corteData?.materia_prima_id || null;
    const usado     = antes - remanente;

    if (!editando && loteData && usado > parseFloat(loteData.kg_disponible) + 0.01) {
      setErrorModal(`El lote ${loteData.lote_id} solo tiene ${parseFloat(loteData.kg_disponible).toFixed(3)} kg disponibles`);
      return;
    }

    setGuardando(true); setErrorModal('');

    try {
      const payload = {
        fecha,
        corte_nombre:  corteSelec,
        peso_antes:    antes,
        peso_funda:    funda,
        peso_remanente: remanente,
        usuario_nombre: currentUser?.email || '',
        user_id:        currentUser?.id    || null,
      };

      if (editando) {
        const usadoAnterior = editando.peso_antes - (editando.peso_remanente || 0);
        const diff = usadoAnterior - usado; // positivo = devolver stock, negativo = quitar más
        await supabase.from('despacho_cortes').update(payload).eq('id', editando.id);

        // Ajustar lote seleccionado
        const { data: loteAnt } = await supabase.from('stock_lotes_inyectados')
          .select('kg_disponible, kg_inicial').eq('id', loteSelecId).maybeSingle();
        if (loteAnt) {
          const nuevo = Math.min(parseFloat(loteAnt.kg_inicial), Math.max(0, parseFloat(loteAnt.kg_disponible) + diff));
          await supabase.from('stock_lotes_inyectados').update({ kg_disponible: nuevo }).eq('id', loteSelecId);
        }
      } else {
        await supabase.from('despacho_cortes').insert(payload);

        // Descontar del lote seleccionado
        const { data: loteAct } = await supabase.from('stock_lotes_inyectados')
          .select('kg_disponible').eq('id', loteSelecId).maybeSingle();
        if (loteAct) {
          await supabase.from('stock_lotes_inyectados')
            .update({ kg_disponible: Math.max(0, parseFloat(loteAct.kg_disponible) - usado) })
            .eq('id', loteSelecId);
        }
      }

      // Actualizar inventario_mp total buscando por nombre del corte
      const { data: mpRec } = await supabase.from('materias_primas')
        .select('id').eq('nombre', corteSelec).eq('categoria', 'Inyectados').maybeSingle();
      if (mpRec) {
        const { data: inv } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', mpRec.id).maybeSingle();
        if (inv) {
          const ajuste = editando
            ? (editando.peso_antes - (editando.peso_remanente||0)) - usado
            : -usado;
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) + ajuste) })
            .eq('id', inv.id);
        }
      }

      setModal(false);
      mostrarExito(editando ? '✅ Registro actualizado' : '✅ Corte registrado');
      await cargar();
    } catch (e) { setErrorModal('Error: ' + e.message); }
    setGuardando(false);
  }

  async function eliminarRegistro(reg) {
    if (!window.confirm(`¿Eliminar el registro de "${reg.corte_nombre}"?`)) return;
    const usado = reg.peso_antes - (reg.peso_remanente || 0);
    // Devolver al lote con más espacio disponible de ese corte
    const { data: lotes } = await supabase.from('stock_lotes_inyectados')
      .select('id, kg_disponible, kg_inicial').eq('corte_nombre', reg.corte_nombre)
      .order('kg_disponible', { ascending: false }).limit(1);
    if (lotes?.[0]) {
      const lote = lotes[0];
      await supabase.from('stock_lotes_inyectados')
        .update({ kg_disponible: Math.min(parseFloat(lote.kg_inicial), parseFloat(lote.kg_disponible) + usado) })
        .eq('id', lote.id);
    }
    // Restaurar en inventario_mp buscando por nombre del corte
    const { data: mp } = await supabase.from('materias_primas')
      .select('id').eq('nombre', reg.corte_nombre).eq('categoria', 'Inyectados').maybeSingle();
    if (mp) {
      const { data: inv } = await supabase.from('inventario_mp')
        .select('id, stock_kg').eq('materia_prima_id', mp.id).maybeSingle();
      if (inv) {
        await supabase.from('inventario_mp')
          .update({ stock_kg: (inv.stock_kg || 0) + usado }).eq('id', inv.id);
      }
    }
    await supabase.from('despacho_cortes').delete().eq('id', reg.id);
    mostrarExito('🗑️ Registro eliminado');
    await cargar();
  }

  async function guardarCierre() {
    setGuardandoCierre(true);
    try {
      const payload = {
        fecha,
        peso_hueso:    parseFloat(pesoHueso    || 0),
        peso_aserrin:  parseFloat(pesoAserrin  || 0),
        peso_carnudo:  parseFloat(pesoCarnudo  || 0),
        usuario_nombre: currentUser?.email || '',
      };
      if (cierre) {
        await supabase.from('despacho_cierre_dia').update(payload).eq('id', cierre.id);
      } else {
        await supabase.from('despacho_cierre_dia').insert(payload);
      }
      setModalCierre(false);
      mostrarExito('✅ Cierre del día registrado');
      await cargar();
    } catch (e) { setError('Error: ' + e.message); }
    setGuardandoCierre(false);
  }

  function abrirCierre() {
    setPesoHueso(String(cierre?.peso_hueso   || ''));
    setPesoAserrin(String(cierre?.peso_aserrin || ''));
    setPesoCarnudo(String(cierre?.peso_carnudo || ''));
    setModalCierre(true);
  }

  function mostrarExito(msg) { setExito(msg); setTimeout(() => setExito(''), 5000); }

  const totalFunda     = registros.reduce((s, r) => s + (r.peso_funda     || 0), 0);
  const totalRemanente = registros.reduce((s, r) => s + (r.peso_remanente || 0), 0);
  const totalAntes     = registros.reduce((s, r) => s + (r.peso_antes     || 0), 0);
  const totalMerma     = registros.reduce((s, r) => s + ((r.peso_antes||0) - (r.peso_funda||0) - (r.peso_remanente||0)), 0);

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid #ddd', fontSize: 13, outline: 'none'
  };

  return (
    <div>
      {exito && <div style={{ background:'#d4edda', color:'#155724', padding:'12px 16px', borderRadius:10, marginBottom:14, fontWeight:'bold', fontSize:13 }}>{exito}</div>}
      {error && <div style={{ background:'#ffeaea', color:'#e74c3c', padding:'12px 16px', borderRadius:10, marginBottom:14, fontSize:13 }}>{error}</div>}

      {/* Barra superior */}
      <div style={{ background:'white', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', padding:'12px 16px', marginBottom:14, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:11, color:'#777', marginBottom:3, fontWeight:600 }}>Fecha</div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:13, outline:'none' }} />
        </div>
        <div style={{ flex:1 }} />
        <button onClick={abrirNuevo} style={{ background:'linear-gradient(135deg,#1a1a2e,#2c3e50)', color:'white', border:'none', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:'bold' }}>
          + Registrar corte
        </button>
        <button onClick={abrirCierre} style={{ background: cierre ? 'linear-gradient(135deg,#27ae60,#1e8449)' : 'linear-gradient(135deg,#e67e22,#d35400)', color:'white', border:'none', borderRadius:8, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:'bold' }}>
          {cierre ? '✅ Ver cierre del día' : '🔒 Cierre del día'}
        </button>
      </div>

      {/* Stock por lotes */}
      {stockLotes.length > 0 && (
        <div style={{ background:'white', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:'bold', color:'#888', marginBottom:10, textTransform:'uppercase' }}>
            💉 Stock Inyectados — por lote
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {stockLotes.map(corte => (
              <div key={corte.corte_nombre} style={{ border:'1.5px solid #e8f4fd', borderRadius:10, overflow:'hidden' }}>
                {/* Header corte */}
                <div style={{ background:'#1a1a2e', padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ color:'white', fontWeight:'bold', fontSize:13 }}>🥩 {corte.corte_nombre}</span>
                  <span style={{ background:'#27ae60', color:'white', borderRadius:10, padding:'2px 10px', fontSize:12, fontWeight:'bold' }}>
                    TOTAL: {corte.total.toFixed(3)} kg
                  </span>
                </div>
                {/* Lotes */}
                <div style={{ padding:'8px 14px', display:'flex', flexWrap:'wrap', gap:8 }}>
                  {corte.lotes.map(lote => (
                    <div key={lote.id} style={{ background:'#eaf4fd', borderRadius:8, padding:'5px 12px', fontSize:12 }}>
                      <span style={{ color:'#555', marginRight:6 }}>Lote {lote.lote_id}</span>
                      <span style={{ fontWeight:'bold', color: parseFloat(lote.kg_disponible) < parseFloat(lote.kg_inicial) * 0.2 ? '#e74c3c' : '#2980b9' }}>
                        {parseFloat(lote.kg_disponible).toFixed(3)} kg
                      </span>
                      <span style={{ color:'#aaa', fontSize:10, marginLeft:4 }}>
                        / {parseFloat(lote.kg_inicial).toFixed(3)} kg
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumen del día */}
      {registros.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:10, marginBottom:14 }}>
          {[
            { label:'PESO ANTES',  val:`${totalAntes.toFixed(3)} kg`,     color:'#1a3a5c', bg:'#e8f4fd' },
            { label:'EN FUNDAS',   val:`${totalFunda.toFixed(3)} kg`,     color:'#155724', bg:'#d4edda' },
            { label:'REMANENTE',   val:`${totalRemanente.toFixed(3)} kg`, color:'#856404', bg:'#fff3cd' },
            { label:'MERMA CORTE', val:`${totalMerma.toFixed(3)} kg`,     color:'#721c24', bg:'#fde8e8' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:10, color:s.color, fontWeight:700, marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize: mobile ? 16 : 20, fontWeight:'bold', color:s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista registros */}
      {cargando ? (
        <div style={{ textAlign:'center', padding:40, color:'#888' }}>⏳ Cargando...</div>
      ) : registros.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, background:'white', borderRadius:12, color:'#aaa' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>📦</div>
          <div style={{ fontWeight:'bold' }}>Sin registros para esta fecha</div>
          <div style={{ fontSize:12, marginTop:4 }}>Presiona "+ Registrar corte" para comenzar</div>
        </div>
      ) : (
        <div style={{ background:'white', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
          {!mobile && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 100px 100px 90px', gap:8, padding:'10px 16px', background:'#f0f2f5', fontSize:10, fontWeight:'bold', color:'#888' }}>
              {['CORTE','ANTES','FUNDA','REMANENTE','MERMA','ACCIONES'].map(h => (
                <div key={h} style={{ textAlign: h !== 'CORTE' ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>
          )}
          {registros.map((reg, idx) => {
            const merma    = (reg.peso_antes||0) - (reg.peso_funda||0) - (reg.peso_remanente||0);
            const pctMerma = reg.peso_antes > 0 ? ((merma / reg.peso_antes) * 100).toFixed(1) : 0;
            return (
              <div key={reg.id} style={{ display: mobile ? 'block' : 'grid', gridTemplateColumns:'1fr 100px 100px 100px 100px 90px', gap:8, padding: mobile ? 14 : '11px 16px', background: idx%2===0 ? 'white' : '#fafafa', borderBottom:'1px solid #f0f0f0', alignItems:'center' }}>
                <div style={{ fontWeight:'bold', fontSize:13, color:'#1a1a2e', marginBottom: mobile ? 6 : 0 }}>🥩 {reg.corte_nombre}</div>
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize:13 }}>{mobile && <span style={{ fontSize:10, color:'#888', fontWeight:'bold' }}>ANTES: </span>}{parseFloat(reg.peso_antes||0).toFixed(3)} kg</div>
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize:13, color:'#27ae60', fontWeight:'bold' }}>{mobile && <span style={{ fontSize:10, color:'#888', fontWeight:'bold' }}>FUNDA: </span>}{parseFloat(reg.peso_funda||0).toFixed(3)} kg</div>
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize:13, color:'#e67e22' }}>{mobile && <span style={{ fontSize:10, color:'#888', fontWeight:'bold' }}>REMANENTE: </span>}{parseFloat(reg.peso_remanente||0).toFixed(3)} kg</div>
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize:13, color: merma > 0 ? '#e74c3c' : '#27ae60', fontWeight:'bold' }}>
                  {merma.toFixed(3)} kg <span style={{ fontSize:10, color:'#aaa' }}>({pctMerma}%)</span>
                </div>
                <div style={{ display:'flex', gap:6, justifyContent: mobile ? 'flex-start' : 'flex-end', marginTop: mobile ? 8 : 0 }}>
                  <button onClick={() => abrirEditar(reg)} style={{ background:'#f0f2f5', border:'none', borderRadius:7, padding:'6px 10px', cursor:'pointer', fontSize:12 }}>✏️</button>
                  <button onClick={() => eliminarRegistro(reg)} style={{ background:'#fde8e8', border:'none', borderRadius:7, padding:'6px 10px', cursor:'pointer', fontSize:12, color:'#e74c3c' }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cierre && (
        <div style={{ background:'#d4edda', borderRadius:12, padding:'14px 18px', marginTop:14, display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontWeight:'bold', color:'#155724' }}>✅ Cierre del día registrado</span>
          <span style={{ fontSize:13, color:'#1a5276' }}>🦴 Hueso: <b>{cierre.peso_hueso} kg</b></span>
          <span style={{ fontSize:13, color:'#856404' }}>🪵 Aserrín: <b>{cierre.peso_aserrin} kg</b></span>
          <span style={{ fontSize:13, color:'#155724' }}>🥩 Carnudo: <b>{cierre.peso_carnudo} kg</b></span>
        </div>
      )}

      {/* Modal registrar/editar */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:480, boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight:'bold', fontSize:16, color:'#1a1a2e', marginBottom:18 }}>
              {editando ? '✏️ Editar registro' : '📦 Registrar corte'}
            </div>

            {/* 1. Seleccionar corte */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Corte *</label>
              <select value={corteSelec} onChange={e => { setCorteSelec(e.target.value); setLoteSelecId(''); }} style={inputStyle}>
                <option value="">— Selecciona un corte —</option>
                {stockLotes.map(s => (
                  <option key={s.corte_nombre} value={s.corte_nombre}>
                    {s.corte_nombre} · {s.total.toFixed(3)} kg totales
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Seleccionar lote */}
            {corteSelec && (() => {
              const c = stockLotes.find(s => s.corte_nombre === corteSelec);
              if (!c) return null;
              return (
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'#1a5276', display:'block', marginBottom:4 }}>
                    🧊 ¿De cuál lote vas a cortar? *
                  </label>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {c.lotes.map(l => (
                      <label key={l.id} style={{
                        display:'flex', alignItems:'center', gap:10, cursor:'pointer',
                        background: loteSelecId === l.id ? '#eaf4fd' : '#f8f9fa',
                        border: `2px solid ${loteSelecId === l.id ? '#2980b9' : '#e0e0e0'}`,
                        borderRadius:8, padding:'8px 12px', transition:'all 0.15s'
                      }}>
                        <input type="radio" name="lote" value={l.id}
                          checked={loteSelecId === l.id}
                          onChange={() => setLoteSelecId(l.id)}
                          style={{ accentColor:'#2980b9' }} />
                        <div style={{ flex:1 }}>
                          <span style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:13 }}>
                            Lote {l.lote_id}
                          </span>
                          <span style={{ color:'#2980b9', fontWeight:'bold', marginLeft:10, fontSize:13 }}>
                            {parseFloat(l.kg_disponible).toFixed(3)} kg disponibles
                          </span>
                          <span style={{ color:'#aaa', fontSize:11, marginLeft:6 }}>
                            / {parseFloat(l.kg_inicial).toFixed(3)} kg iniciales
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
              {[
                { label:'Peso antes (kg) *', val:pesoAntes,     set:setPesoAntes,     color:'#1a3a5c' },
                { label:'Peso funda (kg) *', val:pesoFunda,     set:setPesoFunda,     color:'#155724' },
                { label:'Remanente (kg)',     val:pesoRemanente, set:setPesoRemanente, color:'#856404' },
              ].map(({ label, val, set, color }) => (
                <div key={label}>
                  <label style={{ fontSize:11, fontWeight:600, color, display:'block', marginBottom:4 }}>{label}</label>
                  <input type="number" min="0" step="0.001" value={val}
                    onChange={e => set(e.target.value)}
                    style={{ ...inputStyle, borderColor:color, textAlign:'right' }} />
                </div>
              ))}
            </div>

            {pesoAntes && pesoFunda && (
              <div style={{ background:'#f0f4f8', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:'bold', color:'#555', marginBottom:8 }}>📊 Comparación</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, fontSize:12 }}>
                  <div><div style={{ color:'#888', marginBottom:2 }}>Antes</div><div style={{ fontWeight:'bold', color:'#1a3a5c', fontSize:14 }}>{parseFloat(pesoAntes||0).toFixed(3)} kg</div></div>
                  <div><div style={{ color:'#888', marginBottom:2 }}>Funda + Rem.</div><div style={{ fontWeight:'bold', color:'#27ae60', fontSize:14 }}>{(parseFloat(pesoFunda||0)+parseFloat(pesoRemanente||0)).toFixed(3)} kg</div></div>
                  <div><div style={{ color:'#888', marginBottom:2 }}>Merma</div>
                    <div style={{ fontWeight:'bold', fontSize:14, color: (parseFloat(pesoAntes||0)-parseFloat(pesoFunda||0)-parseFloat(pesoRemanente||0))>0.001 ? '#e74c3c':'#27ae60' }}>
                      {(parseFloat(pesoAntes||0)-parseFloat(pesoFunda||0)-parseFloat(pesoRemanente||0)).toFixed(3)} kg
                    </div>
                  </div>
                </div>
              </div>
            )}

            {errorModal && <div style={{ background:'#ffeaea', border:'1px solid #e74c3c', borderRadius:8, padding:'10px 14px', color:'#e74c3c', fontSize:13, marginBottom:14 }}>{errorModal}</div>}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ background:'#f0f2f5', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancelar</button>
              <button onClick={guardarRegistro} disabled={guardando} style={{ background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a1a2e,#2c3e50)', color:'white', border:'none', borderRadius:8, padding:'10px 24px', cursor: guardando ? 'default' : 'pointer', fontSize:13, fontWeight:'bold' }}>
                {guardando ? 'Guardando...' : editando ? '💾 Actualizar' : '✅ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cierre */}
      {modalCierre && (() => {
        // Calcular merma total del día desde los registros
        const mermaTotalDia = registros.reduce((s, r) =>
          s + Math.max(0, (r.peso_antes||0) - (r.peso_funda||0) - (r.peso_remanente||0)), 0);

        // Agrupar registros por corte para el resumen
        const porCorte = {};
        registros.forEach(r => {
          const mermaR = Math.max(0, (r.peso_antes||0) - (r.peso_funda||0) - (r.peso_remanente||0));
          if (!porCorte[r.corte_nombre]) porCorte[r.corte_nombre] = { corte: r.corte_nombre, cortes: 0, merma: 0 };
          porCorte[r.corte_nombre].cortes++;
          porCorte[r.corte_nombre].merma += mermaR;
        });
        const resumenCortes = Object.values(porCorte);

        const totalIdentificado = parseFloat(pesoHueso||0) + parseFloat(pesoAserrin||0) + parseFloat(pesoCarnudo||0);
        const mermaEnMaquina    = mermaTotalDia - totalIdentificado;

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:500, boxShadow:'0 8px 32px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
              <div style={{ fontWeight:'bold', fontSize:16, color:'#1a1a2e', marginBottom:4 }}>🔒 Cierre del día — {fecha}</div>
              <div style={{ fontSize:12, color:'#888', marginBottom:16 }}>Registra los subproductos del día de corte</div>

              {/* Resumen de cortes del día */}
              {resumenCortes.length > 0 && (
                <div style={{ background:'#f8f9fa', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
                  <div style={{ fontWeight:'bold', fontSize:12, color:'#555', marginBottom:8 }}>📋 Lo cortado hoy:</div>
                  {resumenCortes.map(c => (
                    <div key={c.corte} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#555', marginBottom:4 }}>
                      <span>🥩 {c.corte} <span style={{ color:'#888' }}>({c.cortes} corte{c.cortes!==1?'s':''})</span></span>
                      <span style={{ color:'#e74c3c', fontWeight:'bold' }}>merma: {c.merma.toFixed(3)} kg</span>
                    </div>
                  ))}
                  <div style={{ borderTop:'1px solid #e0e0e0', marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:13 }}>
                    <span>Total merma del día</span>
                    <span style={{ color:'#e74c3c' }}>{mermaTotalDia.toFixed(3)} kg</span>
                  </div>
                  <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>
                    Distribuye esta merma entre hueso, aserrín y carnudo abajo ↓
                  </div>
                </div>
              )}

              {/* Inputs subproductos */}
              {[
                { label:'🦴 Peso hueso / no reutilizable (kg)', val:pesoHueso,   set:setPesoHueso,   color:'#555'    },
                { label:'🪵 Peso aserrín (kg)',                  val:pesoAserrin, set:setPesoAserrin, color:'#856404' },
                { label:'🥩 Peso carnudo (kg)',                  val:pesoCarnudo, set:setPesoCarnudo, color:'#155724' },
              ].map(({ label, val, set, color }) => (
                <div key={label} style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, fontWeight:600, color, display:'block', marginBottom:4 }}>{label}</label>
                  <input type="number" min="0" step="0.001" value={val} onChange={e => set(e.target.value)}
                    placeholder="0.000" style={{ ...inputStyle, borderColor:'#ddd', textAlign:'right', fontSize:15 }} />
                </div>
              ))}

              {/* Panel de balance */}
              {mermaTotalDia > 0 && (
                <div style={{ background: mermaEnMaquina < 0 ? '#fdecea' : '#f0f8ff', borderRadius:10, padding:'12px 14px', marginBottom:16, border:`1.5px solid ${mermaEnMaquina < 0 ? '#e74c3c' : '#aed6f1'}` }}>
                  <div style={{ fontWeight:'bold', fontSize:12, color:'#1a5276', marginBottom:8 }}>⚖️ Balance de merma del día</div>
                  <div style={{ fontSize:12, color:'#555', display:'flex', flexDirection:'column', gap:4 }}>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span>Merma total registrada</span>
                      <span style={{ fontWeight:'bold', color:'#e74c3c' }}>{mermaTotalDia.toFixed(3)} kg</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span>Identificado (hueso + aserrín + carnudo)</span>
                      <span style={{ fontWeight:'bold', color:'#27ae60' }}>{totalIdentificado.toFixed(3)} kg</span>
                    </div>
                    <div style={{ borderTop:'1px solid #ddd', paddingTop:6, marginTop:2, display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:13 }}>
                      <span>🔧 Merma en máquina / utensilios</span>
                      <span style={{ color: mermaEnMaquina < 0 ? '#e74c3c' : '#8e44ad' }}>
                        {mermaEnMaquina.toFixed(3)} kg
                      </span>
                    </div>
                    {mermaEnMaquina < 0 && (
                      <div style={{ fontSize:11, color:'#e74c3c', marginTop:2 }}>
                        ⚠️ El total identificado supera la merma registrada — revisa los pesos
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setModalCierre(false)} style={{ background:'#f0f2f5', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancelar</button>
                <button onClick={guardarCierre} disabled={guardandoCierre} style={{ background: guardandoCierre ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)', color:'white', border:'none', borderRadius:8, padding:'10px 24px', cursor: guardandoCierre ? 'default' : 'pointer', fontSize:13, fontWeight:'bold' }}>
                  {guardandoCierre ? 'Guardando...' : '✅ Confirmar cierre'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
