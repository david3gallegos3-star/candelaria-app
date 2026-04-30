// ============================================
// PantallaInyeccion.js
// Producción: inyección de salmuera en cortes
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const TABS = [
  { key: 'nueva', label: '💉 Nueva Producción' },
  { key: 'lotes', label: '📋 Lotes' },
];

export default function PantallaInyeccion({ onVolver, currentUser }) {
  const [tab,                 setTab]                 = useState('nueva');
  const [formulasSalmuera,    setFormulasSalmuera]    = useState([]);
  const [formulaSelec,        setFormulaSelec]        = useState(null);
  const [ingredientesFormula, setIngredientesFormula] = useState([]);
  const [filasCort,           setFilasCort]           = useState([]); // {mp, kg, precio_kg}
  const [mps,                 setMps]                 = useState([]); // todas las MPs
  const [inventario,          setInventario]          = useState([]);
  const [lotes,               setLotes]               = useState([]);
  const [cargando,            setCargando]            = useState(true);
  const [guardando,           setGuardando]           = useState(false);
  const [error,               setError]               = useState('');
  const [exito,               setExito]               = useState('');
  const [notas,               setNotas]               = useState('');
  const [buscadorCorte,       setBuscadorCorte]       = useState('');
  const [modalRetazos,        setModalRetazos]        = useState(null);
  const [filasRetazos,        setFilasRetazos]        = useState([]);
  const [guardandoRetazos,    setGuardandoRetazos]    = useState(false);
  const [porcentajeSalmuera,  setPorcentajeSalmuera]  = useState(20);

  // ── Carga inicial ─────────────────────────────────────
  const cargarInicial = useCallback(async () => {
    setCargando(true);
    const [{ data: fs }, { data: mp }, { data: inv }] = await Promise.all([
      // Fórmulas de salmuera — por categoria (no por slug)
      supabase.from('productos')
        .select('id,nombre,categoria')
        .eq('categoria', 'SALMUERAS')
        .eq('eliminado', false)
        .order('nombre'),
      supabase.from('materias_primas')
        .select('id,nombre,nombre_producto,precio_kg,categoria')
        .eq('eliminado', false)
        .order('nombre'),
      supabase.from('inventario_mp').select('materia_prima_id,stock_kg,nombre'),
    ]);
    setFormulasSalmuera(fs || []);
    setMps(mp || []);
    setInventario(inv || []);
    await cargarLotes();
    setCargando(false);
  }, []);

  async function cargarLotes() {
    const { data } = await supabase
      .from('produccion_inyeccion')
      .select('*, produccion_inyeccion_cortes(*), produccion_inyeccion_ingredientes(*)')
      .in('estado', ['abierto', 'cerrado', 'revertido'])
      .order('created_at', { ascending: false })
      .limit(30);
    setLotes(data || []);
  }

  useEffect(() => { cargarInicial(); }, [cargarInicial]);

  // Ingredientes al cambiar fórmula + cargar porcentaje_salmuera
  useEffect(() => {
    if (!formulaSelec) { setIngredientesFormula([]); setPorcentajeSalmuera(20); return; }
    Promise.all([
      supabase.from('formulaciones').select('*')
        .eq('producto_nombre', formulaSelec.nombre).order('orden'),
      supabase.from('config_productos').select('porcentaje_salmuera')
        .eq('producto_nombre', formulaSelec.nombre).maybeSingle()
    ]).then(([{ data: filas }, { data: cfg }]) => {
      setIngredientesFormula(filas || []);
      setPorcentajeSalmuera(parseFloat(cfg?.porcentaje_salmuera) || 20);
    });
  }, [formulaSelec]);

  // ── Cálculos ──────────────────────────────────────────
  const kgCarneTotal    = filasCort.reduce((s, f) => s + (parseFloat(f.kg) || 0), 0);
  const kgSalmueraReq   = kgCarneTotal * (porcentajeSalmuera / 100);
  const totalGramosForm = ingredientesFormula.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0);
  // kgBase: usa 1 kg cuando aún no hay cortes, para mostrar la fórmula de referencia
  const kgBase = kgSalmueraReq > 0 ? kgSalmueraReq : 1;

  const ingredientesExp = totalGramosForm > 0
    ? ingredientesFormula
        .filter(f => f.ingrediente_nombre)
        .map(f => {
          const proporcion = (parseFloat(f.gramos) || 0) / totalGramosForm;
          const kgUsados   = kgBase * proporcion;
          const mp = mps.find(m => m.id === f.materia_prima_id)
                  || mps.find(m => (m.nombre_producto || m.nombre)?.toLowerCase() === f.ingrediente_nombre?.toLowerCase());
          const precioKg = parseFloat(mp?.precio_kg || 0);
          const invReg   = inventario.find(i => i.materia_prima_id === f.materia_prima_id);
          const stockKg  = parseFloat(invReg?.stock_kg || 0);
          return {
            nombre: f.ingrediente_nombre,
            materia_prima_id: f.materia_prima_id,
            kgUsados, precioKg,
            costo:   kgUsados * precioKg,
            stockKg,
            stockOk: stockKg >= kgUsados - 0.001,
          };
        })
    : [];

  const costoSalmueraTotal = ingredientesExp.reduce((s, i) => s + i.costo, 0);
  const costoSalmuera_kg   = kgBase > 0 ? costoSalmueraTotal / kgBase : 0;

  // Costo por corte
  const cortesConCosto = filasCort.map(f => {
    const kg          = parseFloat(f.kg) || 0;
    const precioKg    = parseFloat(f.precio_kg) || 0;
    const costoCarne  = kg * precioKg;
    const costoSal    = kgCarneTotal > 0 ? costoSalmueraTotal * (kg / kgCarneTotal) : 0;
    const costoTotal  = costoCarne + costoSal;
    const costoKg     = kg > 0 ? costoTotal / kg : 0;
    const invReg      = inventario.find(i => i.materia_prima_id === f.mp?.id);
    const stockCarne  = parseFloat(invReg?.stock_kg || 0);
    return { ...f, costoCarne, costoSal, costoTotal, costoKg, stockCarne, stockOk: !f.mp?.id || stockCarne >= kg - 0.001 };
  });

  // MPs filtradas para buscador de cortes
  const mpsFiltradas = mps.filter(m => {
    const txt = buscadorCorte.toLowerCase();
    if (!txt) return true;
    return (m.nombre || '').toLowerCase().includes(txt) ||
           (m.nombre_producto || '').toLowerCase().includes(txt);
  }).slice(0, 30);

  // ── Cortes: agregar / quitar / actualizar ─────────────
  function agregarCorte(mp) {
    if (filasCort.find(f => f.mp?.id === mp.id)) return;
    setFilasCort(prev => [...prev, {
      mp,
      kg: '',
      precio_kg: parseFloat(mp.precio_kg || 0).toFixed(4),
    }]);
    setBuscadorCorte('');
  }

  function quitarCorte(mpId) {
    setFilasCort(prev => prev.filter(f => f.mp?.id !== mpId));
  }

  function actualizarFila(mpId, campo, valor) {
    setFilasCort(prev => prev.map(f => f.mp?.id === mpId ? { ...f, [campo]: valor } : f));
  }

  // ── Guardar producción ────────────────────────────────
  async function guardarProduccion() {
    setError('');
    if (!formulaSelec)    { setError('Selecciona una fórmula de salmuera'); return; }
    if (filasCort.length === 0) { setError('Agrega al menos un corte'); return; }
    if (kgCarneTotal <= 0) { setError('Ingresa kg de carne para al menos un corte'); return; }

    const hayStockBajo = cortesConCosto.some(c => !c.stockOk) ||
                         ingredientesExp.some(i => !i.stockOk);
    if (hayStockBajo && !window.confirm('⚠️ Hay stock insuficiente. ¿Continuar de todas formas?')) return;

    setGuardando(true);
    try {
      const fecha = new Date().toISOString().split('T')[0];
      const costoCarneTotal = cortesConCosto.reduce((s, c) => s + c.costoCarne, 0);

      const { data: prod, error: e1 } = await supabase.from('produccion_inyeccion').insert({
        fecha,
        formula_salmuera:      formulaSelec.nombre,
        porcentaje_inyeccion:  100,
        kg_carne_total:        kgCarneTotal,
        kg_salmuera_requerida: kgSalmueraReq,
        costo_carne_total:     costoCarneTotal,
        costo_salmuera_total:  costoSalmueraTotal,
        costo_total:           costoCarneTotal + costoSalmueraTotal,
        estado:                'abierto',
        usuario_nombre:        currentUser?.email || '',
        user_id:               currentUser?.id || null,
        notas:                 notas || null,
      }).select().single();
      if (e1) throw e1;
      const prodId = prod.id;

      // Cortes
      const filasCorte = cortesConCosto.filter(f => parseFloat(f.kg) > 0).map(f => ({
        produccion_id:          prodId,
        corte_nombre:           f.mp.nombre_producto || f.mp.nombre,
        materia_prima_id:       f.mp.id,
        kg_carne_cruda:         parseFloat(f.kg),
        precio_kg_carne:        parseFloat(f.precio_kg),
        costo_carne:            f.costoCarne,
        kg_salmuera_asignada:   kgCarneTotal > 0 ? kgSalmueraReq * (parseFloat(f.kg) / kgCarneTotal) : 0,
        costo_salmuera_asignado: f.costoSal,
        kg_retazos:             0,
        kg_carne_limpia:        parseFloat(f.kg),
        costo_final_kg:         0,
      }));
      if (filasCorte.length > 0) {
        const { error: e2 } = await supabase.from('produccion_inyeccion_cortes').insert(filasCorte);
        if (e2) throw e2;
      }

      // Ingredientes salmuera
      if (ingredientesExp.length > 0) {
        const { error: e3 } = await supabase.from('produccion_inyeccion_ingredientes').insert(
          ingredientesExp.map(i => ({
            produccion_id:    prodId,
            materia_prima_id: i.materia_prima_id || null,
            ingrediente_nombre: i.nombre,
            kg_usados:        i.kgUsados,
            precio_kg:        i.precioKg,
            costo_total:      i.costo,
          }))
        );
        if (e3) throw e3;
      }

      // Descontar inventario ingredientes salmuera
      for (const ing of ingredientesExp) {
        if (!ing.materia_prima_id || ing.kgUsados <= 0) continue;
        const invR = inventario.find(i => i.materia_prima_id === ing.materia_prima_id);
        if (invR) {
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, parseFloat(invR.stock_kg) - ing.kgUsados) })
            .eq('materia_prima_id', ing.materia_prima_id);
        }
      }
      // Descontar inventario carnes
      for (const c of filasCorte) {
        if (!c.materia_prima_id || c.kg_carne_cruda <= 0) continue;
        const invR = inventario.find(i => i.materia_prima_id === c.materia_prima_id);
        if (invR) {
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, parseFloat(invR.stock_kg) - c.kg_carne_cruda) })
            .eq('materia_prima_id', c.materia_prima_id);
        }
      }

      setFormulaSelec(null); setFilasCort([]); setNotas('');
      setExito(`✅ Producción registrada — Lote #${prodId.slice(-6).toUpperCase()}`);
      setTimeout(() => setExito(''), 6000);
      await cargarInicial();
      setTab('lotes');
    } catch (e) { setError('Error al guardar: ' + e.message); }
    setGuardando(false);
  }

  // ── Revertir lote ─────────────────────────────────────
  async function revertirLote(lote) {
    if (!window.confirm(`¿Revertir lote del ${lote.fecha}? Se restaura el inventario.`)) return;
    try {
      for (const ing of (lote.produccion_inyeccion_ingredientes || [])) {
        if (!ing.materia_prima_id || parseFloat(ing.kg_usados) <= 0) continue;
        const invR = inventario.find(i => i.materia_prima_id === ing.materia_prima_id);
        const nuevoStock = parseFloat(invR?.stock_kg || 0) + parseFloat(ing.kg_usados);
        if (invR) {
          await supabase.from('inventario_mp').update({ stock_kg: nuevoStock }).eq('materia_prima_id', ing.materia_prima_id);
        } else {
          await supabase.from('inventario_mp').insert({ materia_prima_id: ing.materia_prima_id, nombre: ing.ingrediente_nombre, stock_kg: parseFloat(ing.kg_usados), stock_minimo_kg: 0 });
        }
      }
      for (const c of (lote.produccion_inyeccion_cortes || [])) {
        if (!c.materia_prima_id || parseFloat(c.kg_carne_cruda) <= 0) continue;
        const invR = inventario.find(i => i.materia_prima_id === c.materia_prima_id);
        const nuevoStock = parseFloat(invR?.stock_kg || 0) + parseFloat(c.kg_carne_cruda);
        if (invR) await supabase.from('inventario_mp').update({ stock_kg: nuevoStock }).eq('materia_prima_id', c.materia_prima_id);
      }
      await supabase.from('produccion_inyeccion').update({ estado: 'revertido', fecha_reversion: new Date().toISOString(), revertido_por: currentUser?.email || '' }).eq('id', lote.id);
      setExito('✅ Lote revertido — inventario restaurado'); setTimeout(() => setExito(''), 5000);
      await cargarInicial();
    } catch (e) { setError('Error al revertir: ' + e.message); }
  }

  // ── Retazos ───────────────────────────────────────────
  function abrirRetazos(lote) {
    setFilasRetazos((lote.produccion_inyeccion_cortes || []).map(c => ({
      id: c.id, corte_nombre: c.corte_nombre,
      kg_carne_cruda: parseFloat(c.kg_carne_cruda || 0),
      kg_retazos: parseFloat(c.kg_retazos || 0),
      precio_venta_retazo_kg: parseFloat(c.precio_venta_retazo_kg || 0),
      costo_carne: parseFloat(c.costo_carne || 0),
      costo_salmuera_asignado: parseFloat(c.costo_salmuera_asignado || 0),
    })));
    setModalRetazos(lote);
  }

  async function guardarRetazos() {
    setGuardandoRetazos(true);
    try {
      for (const f of filasRetazos) {
        const kgLimpia   = Math.max(0, f.kg_carne_cruda - f.kg_retazos);
        const ingRetr    = f.kg_retazos * f.precio_venta_retazo_kg;
        const costoFinalKg = kgLimpia > 0
          ? (f.costo_carne + f.costo_salmuera_asignado - ingRetr) / kgLimpia : 0;
        await supabase.from('produccion_inyeccion_cortes').update({
          kg_retazos: f.kg_retazos,
          precio_venta_retazo_kg: f.precio_venta_retazo_kg,
          ingreso_retazos: ingRetr,
          kg_carne_limpia: kgLimpia,
          costo_final_kg: costoFinalKg,
        }).eq('id', f.id);
      }
      setModalRetazos(null);
      setExito('✅ Retazos guardados'); setTimeout(() => setExito(''), 4000);
      await cargarLotes();
      const { data } = await supabase.from('produccion_inyeccion').select('*, produccion_inyeccion_cortes(*), produccion_inyeccion_ingredientes(*)').in('estado', ['abierto','cerrado','revertido']).order('created_at', { ascending: false }).limit(30);
      setLotes(data || []);
    } catch (e) { setError('Error retazos: ' + e.message); }
    setGuardandoRetazos(false);
  }

  async function cerrarLote(lote) {
    if (!window.confirm(`¿Cerrar lote del ${lote.fecha}?`)) return;
    await supabase.from('produccion_inyeccion').update({ estado: 'cerrado', fecha_cierre: new Date().toISOString().split('T')[0] }).eq('id', lote.id);
    setExito('✅ Lote cerrado'); setTimeout(() => setExito(''), 3000);
    const { data } = await supabase.from('produccion_inyeccion').select('*, produccion_inyeccion_cortes(*), produccion_inyeccion_ingredientes(*)').in('estado', ['abierto','cerrado','revertido']).order('created_at', { ascending: false }).limit(30);
    setLotes(data || []);
  }

  if (cargando) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f2f5', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:40 }}>💉</div>
      <div style={{ color:'#555' }}>Cargando módulo de inyección...</div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'"Segoe UI", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1a3a5c,#2980b9)', padding:'14px 20px', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
          <button onClick={onVolver} style={{ background:'rgba(255,255,255,0.15)', color:'white', border:'none', borderRadius:8, padding:'7px 12px', cursor:'pointer', fontSize:13 }}>← Volver</button>
          <div style={{ color:'white', fontWeight:'bold', fontSize:18 }}>💉 Inyección de Salmuera — Cortes de Res</div>
        </div>
        <div style={{ display:'flex', gap:0, borderTop:'1px solid rgba(255,255,255,0.15)', paddingTop:8 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:'8px 20px', background:'transparent', color: tab===t.key ? 'white' : 'rgba(255,255,255,0.6)', border:'none', borderBottom: tab===t.key ? '3px solid #4fc3f7' : '3px solid transparent', cursor:'pointer', fontSize:13, fontWeight:'bold', whiteSpace:'nowrap' }}>{t.label}</button>
          ))}
        </div>
      </div>

      {exito && <div style={{ background:'#d4edda', color:'#155724', padding:'10px 20px', fontWeight:'bold', fontSize:13, textAlign:'center' }}>{exito}</div>}
      {error && (
        <div style={{ background:'#fdecea', color:'#721c24', padding:'10px 20px', fontSize:13, textAlign:'center', display:'flex', justifyContent:'center', gap:10 }}>
          ⚠️ {error}
          <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#721c24', fontWeight:'bold' }}>✕</button>
        </div>
      )}

      {/* ── TAB: NUEVA PRODUCCIÓN ── */}
      {tab === 'nueva' && (
        <div style={{ padding:'16px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:16 }}>

            {/* Columna izquierda: formulario */}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* 1. Seleccionar salmuera */}
              <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
                <h4 style={{ margin:'0 0 12px', color:'#1a3a5c', fontSize:14, borderBottom:'2px solid #2980b9', paddingBottom:6 }}>🧂 1. Fórmula de Salmuera</h4>
                {formulasSalmuera.length === 0 ? (
                  <div style={{ color:'#e74c3c', fontSize:13, padding:'10px 0' }}>
                    ⚠️ No hay fórmulas de salmuera. Crea un producto en la categoría <b>SALMUERAS</b> del módulo de Fórmulas.
                  </div>
                ) : (
                  <>
                    <select
                      value={formulaSelec?.id || ''}
                      onChange={e => {
                        const f = formulasSalmuera.find(x => x.id === e.target.value) || null;
                        setFormulaSelec(f);
                      }}
                      style={{ width:'100%', padding:'11px 12px', borderRadius:8, border:'1.5px solid #2980b9', fontSize:14, color: formulaSelec ? '#1a3a5c' : '#999', background:'white', outline:'none', cursor:'pointer' }}
                    >
                      <option value="">— Selecciona una salmuera —</option>
                      {formulasSalmuera.map(f => (
                        <option key={f.id} value={f.id}>{f.nombre}</option>
                      ))}
                    </select>
                    {formulaSelec && (
                      <div style={{ marginTop:10, background:'#eaf4fb', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#1a3a5c' }}>
                        ✅ <b>{formulaSelec.nombre}</b> — fórmula por 1 kg · escala al total de cortes
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 2. Cortes a inyectar */}
              <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
                <h4 style={{ margin:'0 0 12px', color:'#6c3483', fontSize:14, borderBottom:'2px solid #6c3483', paddingBottom:6 }}>🥩 2. Cortes a Inyectar</h4>

                {/* Cortes ya agregados */}
                {filasCort.map(f => {
                  const cCalc = cortesConCosto.find(c => c.mp?.id === f.mp?.id);
                  return (
                    <div key={f.mp?.id} style={{ background: cCalc?.stockOk === false ? '#fdecea' : '#f8f9fa', border:`1px solid ${cCalc?.stockOk === false ? '#f5c6cb' : '#e0e0e0'}`, borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <span style={{ fontWeight:'bold', fontSize:13, color:'#1a1a2e' }}>🥩 {f.mp?.nombre_producto || f.mp?.nombre}</span>
                        <button onClick={() => quitarCorte(f.mp?.id)} style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:18, lineHeight:1 }}>✕</button>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                        <div>
                          <label style={{ fontSize:11, color:'#888', display:'block', marginBottom:3 }}>Kg de carne</label>
                          <input type="number" min="0" step="0.1"
                            value={f.kg}
                            onChange={e => actualizarFila(f.mp?.id, 'kg', e.target.value)}
                            style={{ width:'100%', padding:'8px', borderRadius:7, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', boxSizing:'border-box', outline:'none' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize:11, color:'#888', display:'block', marginBottom:3 }}>Precio $/kg</label>
                          <input type="number" min="0" step="0.01"
                            value={f.precio_kg}
                            onChange={e => actualizarFila(f.mp?.id, 'precio_kg', e.target.value)}
                            style={{ width:'100%', padding:'8px', borderRadius:7, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', boxSizing:'border-box', outline:'none' }}
                          />
                        </div>
                      </div>
                      {cCalc?.stockOk === false && (
                        <div style={{ fontSize:11, color:'#e74c3c', marginTop:4 }}>⚠️ Stock insuficiente para este corte</div>
                      )}
                      {parseFloat(f.kg) > 0 && cCalc && formulaSelec && kgCarneTotal > 0 && (
                        <div style={{ fontSize:11, color:'#555', marginTop:6, display:'flex', justifyContent:'space-between' }}>
                          <span>Salmuera: <b>{(kgSalmueraReq * (parseFloat(f.kg) / kgCarneTotal)).toFixed(3)} kg</b></span>
                          <span>Costo/kg: <b style={{ color:'#27ae60' }}>${cCalc.costoKg.toFixed(4)}</b></span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Buscador — siempre visible para agregar más cortes */}
                <div style={{ marginTop: filasCort.length > 0 ? 8 : 0 }}>
                  <input
                    placeholder={filasCort.length === 0 ? '🔍 Buscar corte de res para agregar...' : '➕ Agregar otro corte — escribe para buscar...'}
                    value={buscadorCorte}
                    onChange={e => setBuscadorCorte(e.target.value)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${filasCort.length > 0 ? '#6c3483' : '#ddd'}`, fontSize:13, boxSizing:'border-box', marginBottom:6, outline:'none', background: filasCort.length > 0 ? '#fdf6ff' : 'white' }}
                  />
                  {buscadorCorte && (
                    <div style={{ maxHeight:180, overflowY:'auto', border:'1px solid #e0e0e0', borderRadius:8, marginBottom:6, boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}>
                      {mpsFiltradas.length === 0
                        ? <div style={{ padding:'12px', color:'#aaa', fontSize:12, textAlign:'center' }}>Sin resultados</div>
                        : mpsFiltradas.map(mp => {
                            const yaAgregado = filasCort.find(f => f.mp?.id === mp.id);
                            return (
                              <div key={mp.id} onClick={() => !yaAgregado && agregarCorte(mp)}
                                style={{ padding:'9px 12px', cursor: yaAgregado ? 'default' : 'pointer', borderBottom:'1px solid #f5f5f5', fontSize:13, background: yaAgregado ? '#f0faf4' : 'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <span style={{ color: yaAgregado ? '#27ae60' : '#1a1a2e' }}>{yaAgregado ? '✅ ' : '＋ '}{mp.nombre_producto || mp.nombre}</span>
                                <span style={{ color:'#888', fontSize:11 }}>${parseFloat(mp.precio_kg || 0).toFixed(2)}/kg</span>
                              </div>
                            );
                          })
                      }
                    </div>
                  )}
                </div>

                {filasCort.length === 0 && !buscadorCorte && (
                  <div style={{ textAlign:'center', padding:'16px', color:'#aaa', fontSize:12 }}>
                    Escribe arriba para buscar y agregar cortes de res
                  </div>
                )}

              </div>

              {/* Notas */}
              <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
                <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:6 }}>📝 Notas (opcional)</label>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:13, resize:'vertical', boxSizing:'border-box', outline:'none' }}
                  placeholder="Observaciones..." />
              </div>
            </div>

            {/* Columna derecha: hoja del formulador + botón */}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Totales */}
              <div style={{ background:'#1a3a5c', borderRadius:12, padding:16 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    ['Total kg cortes',   `${kgCarneTotal.toFixed(3)} kg`,  'white'],
                    ['Salmuera a preparar',`${kgSalmueraReq.toFixed(3)} kg`, '#4fc3f7'],
                  ].map(([l, v, col]) => (
                    <div key={l} style={{ textAlign:'center', background:'rgba(255,255,255,0.08)', borderRadius:8, padding:'10px' }}>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>{l}</div>
                      <div style={{ fontSize:18, fontWeight:'bold', color:col }}>{v}</div>
                    </div>
                  ))}
                </div>
                {formulaSelec && kgCarneTotal > 0 && (
                  <div style={{ marginTop:10, fontSize:11, color:'rgba(255,255,255,0.6)', textAlign:'center' }}>
                    {kgCarneTotal.toFixed(1)} kg carne × {porcentajeSalmuera}% = {kgSalmueraReq.toFixed(3)} kg salmuera
                  </div>
                )}
              </div>

              {/* Hoja del formulador */}
              {formulaSelec && ingredientesExp.length > 0 && (
                <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
                  <h4 style={{ margin:'0 0 10px', color:'#1a1a2e', fontSize:14, borderBottom:'2px solid #8e44ad', paddingBottom:6 }}>
                    🧪 Hoja del Formulador
                  </h4>
                  <div style={{ fontSize:11, marginBottom:8, padding:'6px 10px', borderRadius:6,
                    background: kgSalmueraReq > 0 ? '#eaf4fb' : '#fff9e6',
                    color: kgSalmueraReq > 0 ? '#1a3a5c' : '#b7770d'
                  }}>
                    {kgSalmueraReq > 0
                      ? <>Ingredientes para <b>{kgSalmueraReq.toFixed(3)} kg</b> de salmuera ({formulaSelec.nombre})</>
                      : <>Referencia por <b>1 kg</b> — agrega cortes para ver la escala real</>
                    }
                  </div>
                  {ingredientesExp.map((ing, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid #f5f5f5', fontSize:12 }}>
                      <div>
                        <div style={{ fontWeight:'bold', color:'#1a1a2e' }}>{ing.nombre}</div>
                        <div style={{ color: ing.stockOk ? '#aaa' : '#e74c3c', fontSize:10 }}>
                          Stock: {ing.stockKg.toFixed(3)} kg {!ing.stockOk && '⚠️ insuf.'}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontWeight:'bold', color: ing.stockOk ? '#1a1a2e' : '#e74c3c' }}>{ing.kgUsados.toFixed(4)} kg</div>
                        <div style={{ color:'#27ae60', fontSize:11 }}>${ing.costo.toFixed(4)}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ background:'#f8f9fa', borderRadius:8, padding:'8px 12px', marginTop:10, display:'flex', justifyContent:'space-between', fontSize:13 }}>
                    <span style={{ color:'#555' }}>Costo salmuera total</span>
                    <span style={{ fontWeight:'bold', color:'#e67e22' }}>${costoSalmueraTotal.toFixed(4)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#888', marginTop:4 }}>
                    <span>Costo salmuera/kg</span>
                    <span>${costoSalmuera_kg.toFixed(4)}/kg</span>
                  </div>
                </div>
              )}

              {/* Costo por corte */}
              {formulaSelec && cortesConCosto.filter(c => parseFloat(c.kg) > 0).length > 0 && (
                <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
                  <h4 style={{ margin:'0 0 10px', color:'#1a1a2e', fontSize:14, borderBottom:'2px solid #27ae60', paddingBottom:6 }}>
                    📊 Costo por Corte
                  </h4>
                  {cortesConCosto.filter(c => parseFloat(c.kg) > 0).map((c, i) => (
                    <div key={i} style={{ background:'#f8f9fa', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                      <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:13, marginBottom:6 }}>🥩 {c.mp?.nombre_producto || c.mp?.nombre}</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, fontSize:11 }}>
                        {[
                          ['Carne', `$${c.costoCarne.toFixed(3)}`, '#e74c3c'],
                          ['Salmuera', `$${c.costoSal.toFixed(3)}`, '#8e44ad'],
                          ['Total', `$${c.costoTotal.toFixed(3)}`, '#1a3a5c'],
                        ].map(([l, v, col]) => (
                          <div key={l} style={{ textAlign:'center', background:'white', borderRadius:6, padding:'6px' }}>
                            <div style={{ color:'#888', marginBottom:2 }}>{l}</div>
                            <div style={{ fontWeight:'bold', color:col }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ background:'#27ae60', borderRadius:6, padding:'6px 10px', marginTop:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ color:'white', fontSize:11 }}>Costo/kg (antes de retazos)</span>
                        <span style={{ color:'white', fontWeight:'bold', fontSize:14 }}>${c.costoKg.toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Botón guardar */}
              <button onClick={guardarProduccion}
                disabled={guardando || !formulaSelec || kgCarneTotal <= 0}
                style={{ padding:'16px', background: guardando || !formulaSelec || kgCarneTotal <= 0 ? '#95a5a6' : 'linear-gradient(135deg,#27ae60,#1e8449)', color:'white', border:'none', borderRadius:12, fontSize:16, fontWeight:'bold', cursor: guardando || !formulaSelec || kgCarneTotal <= 0 ? 'default' : 'pointer' }}>
                {guardando ? '⏳ Registrando...' : '💉 Registrar Producción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: LOTES ── */}
      {tab === 'lotes' && (
        <div style={{ padding:'16px 20px' }}>
          {lotes.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#888' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:18, fontWeight:'bold' }}>Sin lotes registrados</div>
            </div>
          ) : lotes.map(lote => {
            const colorEstado = { abierto:'#27ae60', cerrado:'#2980b9', revertido:'#e74c3c' }[lote.estado] || '#888';
            const cortes = lote.produccion_inyeccion_cortes || [];
            return (
              <div key={lote.id} style={{ background:'white', borderRadius:14, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
                <div style={{ background:'#1a3a5c', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ color:'white', fontWeight:'bold', fontSize:14 }}>💉 {lote.fecha} — {lote.formula_salmuera}</div>
                    <div style={{ color:'rgba(255,255,255,0.6)', fontSize:11 }}>
                      {parseFloat(lote.kg_carne_total).toFixed(2)} kg · {parseFloat(lote.porcentaje_inyeccion)}% inyección · #{lote.id.slice(-6).toUpperCase()}
                    </div>
                  </div>
                  <span style={{ background:colorEstado, color:'white', borderRadius:20, padding:'3px 12px', fontSize:12, fontWeight:'bold', textTransform:'uppercase' }}>{lote.estado}</span>
                </div>
                <div style={{ padding:'12px 16px' }}>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'#f5f5f5' }}>
                          {['Corte','Kg Carne','Kg Salmuera','Retazos','Kg Limpia','Costo/kg'].map(h => (
                            <th key={h} style={{ padding:'6px 10px', textAlign: h==='Corte' ? 'left' : 'right', color:'#555', fontWeight:700, borderBottom:'1px solid #e0e0e0', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cortes.map((c, i) => (
                          <tr key={c.id} style={{ background: i%2===0 ? 'white' : '#fafafa', borderBottom:'1px solid #f0f0f0' }}>
                            <td style={{ padding:'7px 10px', fontWeight:'bold' }}>{c.corte_nombre}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right' }}>{parseFloat(c.kg_carne_cruda).toFixed(2)}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right', color:'#2980b9' }}>{parseFloat(c.kg_salmuera_asignada).toFixed(3)}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right', color: parseFloat(c.kg_retazos)>0 ? '#e67e22' : '#aaa' }}>{parseFloat(c.kg_retazos).toFixed(2)}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right' }}>{parseFloat(c.kg_carne_limpia).toFixed(2)}</td>
                            <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:'bold', color: parseFloat(c.costo_final_kg)>0 ? '#27ae60' : '#aaa' }}>
                              {parseFloat(c.costo_final_kg)>0 ? `$${parseFloat(c.costo_final_kg).toFixed(4)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {lote.estado !== 'revertido' && (
                    <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                      {lote.estado === 'abierto' && (
                        <>
                          <button onClick={() => abrirRetazos(lote)} style={{ padding:'8px 16px', background:'#e67e22', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:'bold' }}>🗑️ Registrar Retazos</button>
                          <button onClick={() => cerrarLote(lote)} style={{ padding:'8px 16px', background:'#2980b9', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:'bold' }}>🔒 Cerrar Lote</button>
                        </>
                      )}
                      <button onClick={() => revertirLote(lote)} style={{ padding:'8px 16px', background:'#fdecea', color:'#e74c3c', border:'1px solid #f5c6cb', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:'bold' }}>↩️ Revertir</button>
                    </div>
                  )}
                  {lote.notas && <div style={{ fontSize:11, color:'#888', marginTop:8, fontStyle:'italic' }}>📝 {lote.notas}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal retazos */}
      {modalRetazos && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontWeight:'bold', fontSize:17, marginBottom:16, color:'#1a1a2e' }}>🗑️ Registrar Retazos — {modalRetazos.fecha}</div>
            {filasRetazos.map((f, i) => (
              <div key={f.id} style={{ background:'#f8f9fa', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>
                <div style={{ fontWeight:'bold', fontSize:13, marginBottom:6 }}>🥩 {f.corte_nombre} — {f.kg_carne_cruda.toFixed(2)} kg</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, color:'#555', display:'block', marginBottom:4 }}>Kg retazos</label>
                    <input type="number" min="0" step="0.01" value={filasRetazos[i].kg_retazos}
                      onChange={e => { const v=[...filasRetazos]; v[i]={...v[i], kg_retazos: parseFloat(e.target.value)||0}; setFilasRetazos(v); }}
                      style={{ width:'100%', padding:'8px', borderRadius:7, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', boxSizing:'border-box', outline:'none' }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#555', display:'block', marginBottom:4 }}>Precio retazo $/kg</label>
                    <input type="number" min="0" step="0.01" value={filasRetazos[i].precio_venta_retazo_kg}
                      onChange={e => { const v=[...filasRetazos]; v[i]={...v[i], precio_venta_retazo_kg: parseFloat(e.target.value)||0}; setFilasRetazos(v); }}
                      style={{ width:'100%', padding:'8px', borderRadius:7, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', boxSizing:'border-box', outline:'none' }} />
                  </div>
                </div>
                <div style={{ fontSize:11, color:'#27ae60', marginTop:6 }}>
                  Ingreso: ${(f.kg_retazos * f.precio_venta_retazo_kg).toFixed(4)} · Kg limpia: {Math.max(0, f.kg_carne_cruda - f.kg_retazos).toFixed(2)} kg ·
                  Costo/kg final: ${f.kg_carne_cruda - f.kg_retazos > 0
                    ? ((f.costo_carne + f.costo_salmuera_asignado - f.kg_retazos * f.precio_venta_retazo_kg) / Math.max(0.001, f.kg_carne_cruda - f.kg_retazos)).toFixed(4)
                    : '0.0000'}
                </div>
              </div>
            ))}
            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button onClick={() => setModalRetazos(null)} style={{ flex:1, padding:'12px', background:'#f5f5f5', color:'#555', border:'none', borderRadius:10, fontSize:14, cursor:'pointer', fontWeight:'bold' }}>Cancelar</button>
              <button onClick={guardarRetazos} disabled={guardandoRetazos} style={{ flex:2, padding:'12px', background: guardandoRetazos ? '#95a5a6' : '#e67e22', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:'bold', cursor: guardandoRetazos ? 'default' : 'pointer' }}>
                {guardandoRetazos ? '⏳ Guardando...' : '✅ Guardar Retazos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
