// ============================================
// TabInyeccion.js — Inyección de salmuera
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

export default function TabInyeccion({ currentUser, mobile, onSalmueraChange }) {
  const [formulasSalmuera,    setFormulasSalmuera]    = useState([]);
  const [formulaSelec,        setFormulaSelec]        = useState(null);
  const [ingredientesFormula, setIngredientesFormula] = useState([]);
  const [filasCort,           setFilasCort]           = useState([]);
  const [mps,                 setMps]                 = useState([]);
  const [inventario,          setInventario]          = useState([]);
  const [cargando,            setCargando]            = useState(true);
  const [guardando,           setGuardando]           = useState(false);
  const [error,               setError]               = useState('');
  const [exito,               setExito]               = useState('');
  const [notas,               setNotas]               = useState('');
  const [buscadorCorte,       setBuscadorCorte]       = useState('');

  const cargarInicial = useCallback(async () => {
    setCargando(true);
    const [{ data: fs }, { data: mp }, { data: inv }] = await Promise.all([
      supabase.from('productos').select('id,nombre,categoria').eq('categoria', 'SALMUERAS').eq('eliminado', false).order('nombre'),
      supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg,categoria').eq('eliminado', false).order('nombre'),
      supabase.from('inventario_mp').select('materia_prima_id,stock_kg,nombre'),
    ]);
    setFormulasSalmuera(fs || []);
    setMps(mp || []);
    setInventario(inv || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargarInicial(); }, [cargarInicial]);

  useEffect(() => {
    if (!formulaSelec) {
      setIngredientesFormula([]);
      if (onSalmueraChange) onSalmueraChange(null);
      return;
    }
    supabase.from('formulaciones').select('*')
      .eq('producto_nombre', formulaSelec.nombre)
      .order('orden')
      .then(({ data }) => setIngredientesFormula(data || []));
  }, [formulaSelec]);

  // Cálculos
  const kgCarneTotal    = filasCort.reduce((s, f) => s + (parseFloat(f.kg) || 0), 0);
  const totalGramosForm = ingredientesFormula.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0);
  const kgSalmueraReq   = totalGramosForm > 0 ? (totalGramosForm / 1000) * kgCarneTotal : kgCarneTotal;
  const kgBase          = kgSalmueraReq > 0 ? kgSalmueraReq : 1;

  const ingredientesExp = totalGramosForm > 0
    ? ingredientesFormula.filter(f => f.ingrediente_nombre).map(f => {
        const proporcion = (parseFloat(f.gramos) || 0) / totalGramosForm;
        const kgUsados   = kgBase * proporcion;
        const mp = mps.find(m => m.id === f.materia_prima_id)
                || mps.find(m => (m.nombre_producto || m.nombre)?.toLowerCase() === f.ingrediente_nombre?.toLowerCase());
        const precioKg = parseFloat(mp?.precio_kg || 0);
        const invReg   = inventario.find(i => i.materia_prima_id === f.materia_prima_id);
        const stockKg  = parseFloat(invReg?.stock_kg || 0);
        return {
          nombre: f.ingrediente_nombre, materia_prima_id: f.materia_prima_id,
          kgUsados, precioKg, costo: kgUsados * precioKg, stockKg,
          stockOk: stockKg >= kgUsados - 0.001,
        };
      })
    : [];

  // Precio de venta/kg de la fórmula de salmuera (desde materias_primas, categoría Salmuera)
  const mpSalmuera = formulaSelec
    ? mps.find(m => (m.nombre_producto || m.nombre)?.toLowerCase() === formulaSelec.nombre?.toLowerCase() && m.categoria?.toLowerCase().includes('salmuera'))
      || mps.find(m => (m.nombre_producto || m.nombre)?.toLowerCase() === formulaSelec.nombre?.toLowerCase())
    : null;
  const precioVentaKgSalmuera = parseFloat(mpSalmuera?.precio_kg || 0);

  const costoSalmueraTotal = precioVentaKgSalmuera > 0
    ? precioVentaKgSalmuera * kgSalmueraReq
    : ingredientesExp.reduce((s, i) => s + i.costo, 0);
  const costoSalmuera_kg   = kgBase > 0 ? costoSalmueraTotal / kgBase : 0;

  const cortesConCosto = filasCort.map(f => {
    const kg         = parseFloat(f.kg) || 0;
    const precioKg   = parseFloat(f.precio_kg) || 0;
    const costoCarne = kg * precioKg;
    const costoSal   = kgCarneTotal > 0 ? costoSalmueraTotal * (kg / kgCarneTotal) : 0;
    const costoTotal = costoCarne + costoSal;
    const costoKg    = kg > 0 ? costoTotal / kg : 0;
    const invReg     = inventario.find(i => i.materia_prima_id === f.mp?.id);
    const stockCarne = parseFloat(invReg?.stock_kg || 0);
    return { ...f, costoCarne, costoSal, costoTotal, costoKg, stockCarne, stockOk: !f.mp?.id || stockCarne >= kg - 0.001 };
  });

  // Notificar detalle al panel derecho
  useEffect(() => {
    if (!onSalmueraChange) return;
    if (!formulaSelec || ingredientesFormula.length === 0) {
      if (!formulaSelec) onSalmueraChange(null);
      return;
    }
    const ingReales = ingredientesFormula.filter(f => f.ingrediente_nombre).map(f => {
      const gramos   = parseFloat(f.gramos) || 0;
      const kgReales = gramos / 1000;
      const mp       = mps.find(m => m.id === f.materia_prima_id)
                    || mps.find(m => (m.nombre_producto || m.nombre)?.toLowerCase() === f.ingrediente_nombre?.toLowerCase());
      const precioKg = parseFloat(mp?.precio_kg || 0);
      const invReg   = inventario.find(i => i.materia_prima_id === f.materia_prima_id);
      const stockKg  = parseFloat(invReg?.stock_kg || 0);
      return {
        nombre: f.ingrediente_nombre, gramos, kgUsados: kgReales,
        grupo: f.grupo || 'MP', precioKg,
        costo: kgReales * precioKg, stockKg,
        stockOk: stockKg >= kgReales - 0.001,
      };
    });
    const totalKg    = ingReales.reduce((s, i) => s + i.kgUsados, 0);
    const costoTotal = ingReales.reduce((s, i) => s + i.costo, 0);
    onSalmueraChange({
      formula: formulaSelec, ingredientes: ingReales, kgBase: totalKg,
      costoTotal, costoKg: totalKg > 0 ? costoTotal / totalKg : 0, kgCarneTotal,
    });
  }, [formulaSelec, ingredientesFormula, mps, inventario, kgCarneTotal]);

  const mpsFiltradas = mps.filter(m => {
    const txt = buscadorCorte.toLowerCase();
    if (!txt) return true;
    return (m.nombre || '').toLowerCase().includes(txt) ||
           (m.nombre_producto || '').toLowerCase().includes(txt);
  }).slice(0, 30);

  function agregarCorte(mp) {
    if (filasCort.find(f => f.mp?.id === mp.id)) return;
    setFilasCort(prev => [...prev, { mp, kg: '', precio_kg: parseFloat(mp.precio_kg || 0).toFixed(4) }]);
    setBuscadorCorte('');
  }
  function quitarCorte(mpId) { setFilasCort(prev => prev.filter(f => f.mp?.id !== mpId)); }
  function actualizarFila(mpId, campo, valor) {
    setFilasCort(prev => prev.map(f => f.mp?.id === mpId ? { ...f, [campo]: valor } : f));
  }

  async function guardarProduccion() {
    setError('');
    if (!formulaSelec)          { setError('Selecciona una fórmula de salmuera'); return; }
    if (filasCort.length === 0) { setError('Agrega al menos un corte'); return; }
    if (kgCarneTotal <= 0)      { setError('Ingresa kg de carne para al menos un corte'); return; }

    const hayStockBajo = cortesConCosto.some(c => !c.stockOk) || ingredientesExp.some(i => !i.stockOk);
    if (hayStockBajo && !window.confirm('⚠️ Hay stock insuficiente. ¿Continuar de todas formas?')) return;

    setGuardando(true);
    try {
      const fecha = new Date().toISOString().split('T')[0];
      const costoCarneTotal = cortesConCosto.reduce((s, c) => s + c.costoCarne, 0);

      const { data: prod, error: e1 } = await supabase.from('produccion_inyeccion').insert({
        fecha, formula_salmuera: formulaSelec.nombre, porcentaje_inyeccion: 100,
        kg_carne_total: kgCarneTotal, kg_salmuera_requerida: kgSalmueraReq,
        costo_carne_total: costoCarneTotal, costo_salmuera_total: costoSalmueraTotal,
        costo_total: costoCarneTotal + costoSalmueraTotal, estado: 'abierto',
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null,
        notas: notas || null,
      }).select().single();
      if (e1) throw e1;
      const prodId = prod.id;

      const filasCorte = cortesConCosto.filter(f => parseFloat(f.kg) > 0).map(f => ({
        produccion_id: prodId, corte_nombre: f.mp.nombre_producto || f.mp.nombre,
        materia_prima_id: f.mp.id, kg_carne_cruda: parseFloat(f.kg),
        precio_kg_carne: parseFloat(f.precio_kg), costo_carne: f.costoCarne,
        kg_salmuera_asignada: kgCarneTotal > 0 ? kgSalmueraReq * (parseFloat(f.kg) / kgCarneTotal) : 0,
        costo_salmuera_asignado: f.costoSal, kg_retazos: 0,
        kg_carne_limpia: parseFloat(f.kg), costo_final_kg: 0,
      }));
      if (filasCorte.length > 0) {
        const { error: e2 } = await supabase.from('produccion_inyeccion_cortes').insert(filasCorte);
        if (e2) throw e2;
      }

      if (ingredientesExp.length > 0) {
        const { error: e3 } = await supabase.from('produccion_inyeccion_ingredientes').insert(
          ingredientesExp.map(i => ({
            produccion_id: prodId, materia_prima_id: i.materia_prima_id || null,
            ingrediente_nombre: i.nombre, kg_usados: i.kgUsados,
            precio_kg: i.precioKg, costo_total: i.costo,
          }))
        );
        if (e3) throw e3;
      }

      setFormulaSelec(null); setFilasCort([]); setNotas('');
      setExito('✅ Producción registrada — ve a Cierre del día para completar el registro');
      setTimeout(() => setExito(''), 8000);
      await cargarInicial();
    } catch (e) { setError('Error al guardar: ' + e.message); }
    setGuardando(false);
  }

  if (cargando) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'40px', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:32 }}>💉</div>
      <div style={{ color:'#555', fontSize:13 }}>Cargando...</div>
    </div>
  );

  return (
    <div>
      {exito && <div style={{ background:'#d4edda', color:'#155724', padding:'10px 16px', fontWeight:'bold', fontSize:13, textAlign:'center', borderRadius:8, marginBottom:10 }}>{exito}</div>}
      {error && (
        <div style={{ background:'#fdecea', color:'#721c24', padding:'10px 16px', fontSize:13, textAlign:'center', borderRadius:8, marginBottom:10, display:'flex', justifyContent:'center', gap:10 }}>
          ⚠️ {error}
          <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#721c24', fontWeight:'bold' }}>✕</button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:16 }}>
        {/* Columna izquierda */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* 1. Salmuera */}
          <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            <h4 style={{ margin:'0 0 12px', color:'#1a3a5c', fontSize:14, borderBottom:'2px solid #2980b9', paddingBottom:6 }}>🧂 1. Fórmula de Salmuera</h4>
            {formulasSalmuera.length === 0 ? (
              <div style={{ color:'#e74c3c', fontSize:13 }}>⚠️ No hay fórmulas. Crea un producto en categoría <b>SALMUERAS</b>.</div>
            ) : (
              <>
                <select
                  value={formulaSelec?.id || ''}
                  onChange={e => {
                    const found = formulasSalmuera.find(x => String(x.id) === String(e.target.value));
                    setFormulaSelec(found || null);
                  }}
                  style={{ width:'100%', padding:'11px 12px', borderRadius:8, border:'1.5px solid #2980b9', fontSize:14, color: formulaSelec ? '#1a3a5c' : '#999', background:'white', outline:'none', cursor:'pointer' }}>
                  <option value="">— Selecciona una salmuera —</option>
                  {formulasSalmuera.map(f => <option key={f.id} value={String(f.id)}>{f.nombre}</option>)}
                </select>
                {formulaSelec && (
                  <div style={{ marginTop:8, display:'flex', alignItems:'center', justifyContent:'space-between', background:'#1a3a5c', borderRadius:10, padding:'10px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:20 }}>🧂</span>
                      <div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>Seleccionada</div>
                        <div style={{ fontSize:14, fontWeight:'bold', color:'white' }}>{formulaSelec.nombre}</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 2. Cortes */}
          <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            <h4 style={{ margin:'0 0 12px', color:'#6c3483', fontSize:14, borderBottom:'2px solid #6c3483', paddingBottom:6 }}>🥩 2. Cortes a Inyectar</h4>
            {filasCort.map(f => {
              const cCalc = cortesConCosto.find(c => c.mp?.id === f.mp?.id);
              return (
                <div key={f.mp?.id} style={{ background: cCalc?.stockOk === false ? '#fdecea' : '#f8f9fa', border:`1px solid ${cCalc?.stockOk === false ? '#f5c6cb' : '#e0e0e0'}`, borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontWeight:'bold', fontSize:13 }}>🥩 {f.mp?.nombre_producto || f.mp?.nombre}</span>
                    <button onClick={() => quitarCorte(f.mp?.id)} style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:18 }}>✕</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div>
                      <label style={{ fontSize:11, color:'#888', display:'block', marginBottom:3 }}>Kg de carne</label>
                      <input type="number" min="0" step="0.1" value={f.kg}
                        onChange={e => actualizarFila(f.mp?.id, 'kg', e.target.value)}
                        style={{ width:'100%', padding:'8px', borderRadius:7, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', boxSizing:'border-box', outline:'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize:11, color:'#888', display:'block', marginBottom:3 }}>Precio $/kg</label>
                      <input type="number" min="0" step="0.01" value={f.precio_kg}
                        onChange={e => actualizarFila(f.mp?.id, 'precio_kg', e.target.value)}
                        style={{ width:'100%', padding:'8px', borderRadius:7, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', boxSizing:'border-box', outline:'none' }} />
                    </div>
                  </div>
                  {cCalc?.stockOk === false && <div style={{ fontSize:11, color:'#e74c3c', marginTop:4 }}>⚠️ Stock insuficiente</div>}
                </div>
              );
            })}
            <div style={{ marginTop: filasCort.length > 0 ? 8 : 0 }}>
              <input placeholder={filasCort.length === 0 ? '🔍 Buscar materia prima...' : '➕ Agregar otro corte...'}
                value={buscadorCorte} onChange={e => setBuscadorCorte(e.target.value)}
                style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:13, boxSizing:'border-box', marginBottom:6, outline:'none' }} />
              {buscadorCorte && (
                <div style={{ maxHeight:180, overflowY:'auto', border:'1px solid #e0e0e0', borderRadius:8, marginBottom:6 }}>
                  {mpsFiltradas.length === 0
                    ? <div style={{ padding:'12px', color:'#aaa', fontSize:12, textAlign:'center' }}>Sin resultados</div>
                    : mpsFiltradas.map(mp => {
                        const yaAgregado = filasCort.find(f => f.mp?.id === mp.id);
                        return (
                          <div key={mp.id} onClick={() => !yaAgregado && agregarCorte(mp)}
                            style={{ padding:'9px 12px', cursor: yaAgregado ? 'default' : 'pointer', borderBottom:'1px solid #f5f5f5', fontSize:13, background: yaAgregado ? '#f0faf4' : 'white', display:'flex', justifyContent:'space-between' }}>
                            <span style={{ color: yaAgregado ? '#27ae60' : '#1a1a2e' }}>{yaAgregado ? '✅ ' : '＋ '}{mp.nombre_producto || mp.nombre}</span>
                            <span style={{ color:'#888', fontSize:11 }}>${parseFloat(mp.precio_kg || 0).toFixed(2)}/kg</span>
                          </div>
                        );
                      })
                  }
                </div>
              )}
              {filasCort.length === 0 && !buscadorCorte && (
                <div style={{ textAlign:'center', padding:'16px', color:'#aaa', fontSize:12 }}>Escribe arriba para buscar materias primas</div>
              )}
            </div>
          </div>

          {/* Notas */}
          <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:6 }}>📝 Notas (opcional)</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:13, resize:'vertical', boxSizing:'border-box', outline:'none' }}
              placeholder="Observaciones..." />
          </div>
        </div>

        {/* Columna derecha: botón guardar */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <button onClick={guardarProduccion} disabled={guardando || !formulaSelec || kgCarneTotal <= 0}
            style={{ padding:'16px', background: guardando || !formulaSelec || kgCarneTotal <= 0 ? '#95a5a6' : 'linear-gradient(135deg,#27ae60,#1e8449)', color:'white', border:'none', borderRadius:12, fontSize:16, fontWeight:'bold', cursor: guardando || !formulaSelec || kgCarneTotal <= 0 ? 'default' : 'pointer' }}>
            {guardando ? '⏳ Registrando...' : '💉 Registrar Producción'}
          </button>
        </div>
      </div>
    </div>
  );
}
