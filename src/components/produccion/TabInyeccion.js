// ============================================
// TabInyeccion.js — Inyección de salmuera
// ============================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';
import WizardProduccionDinamica from './WizardProduccionDinamica';

export default function TabInyeccion({ currentUser, mobile, onSalmueraChange }) {
  const [formulasSalmuera,    setFormulasSalmuera]    = useState([]);
  const [formulaSelec,        setFormulaSelec]        = useState(null);
  const [ingredientesFormula, setIngredientesFormula] = useState([]);
  const [filasCort,           setFilasCort]           = useState([]);
  const [mps,                 setMps]                 = useState([]);
  const [inventario,          setInventario]          = useState([]);
  const [cargando,            setCargando]            = useState(true);
  const inicializado = useRef(false);
  const [guardando,           setGuardando]           = useState(false);
  const [error,               setError]               = useState('');
  const [exito,               setExito]               = useState('');
  const [notas,               setNotas]               = useState('');
  const [buscadorCorte,       setBuscadorCorte]       = useState('');
  const [porcentajeSalmuera,  setPorcentajeSalmuera]  = useState(20);
  const [diasMaduracion,      setDiasMaduracion]      = useState(5);
  const [horneadoCfgInj,      setHorneadoCfgInj]      = useState(null);
  const [horneadoCfgProdNombre, setHorneadoCfgProdNombre] = useState(null);
  const [esInmersionInj,      setEsInmersionInj]      = useState(false);
  const [wizardM1,            setWizardM1]            = useState(null);
  const [kgSubprodIny,        setKgSubprodIny]        = useState({});   // { tipo: kg } para sub-productos inyección
  const [spInyMp,             setSpInyMp]             = useState(null); // info MP para mp_existente

  const cargarInicial = useCallback(async () => {
    if (!inicializado.current) setCargando(true);
    const [{ data: fs }, { data: mp }, { data: inv }] = await Promise.all([
      supabase.from('productos').select('id,nombre,categoria').eq('categoria', 'SALMUERAS').eq('eliminado', false).order('nombre'),
      supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg,categoria').eq('eliminado', false).order('nombre'),
      supabase.from('inventario_mp').select('materia_prima_id,stock_kg,nombre'),
    ]);
    setFormulasSalmuera(fs || []);
    setMps(mp || []);
    setInventario(inv || []);
    setCargando(false);
    inicializado.current = true;
  }, []);

  useEffect(() => { cargarInicial(); }, [cargarInicial]);
  useRealtime(['productos', 'materias_primas', 'inventario_mp', 'formulaciones', 'config_productos', 'vista_horneado_config', 'produccion_inyeccion', 'produccion_inyeccion_cortes', 'lotes_maduracion'], cargarInicial);

  useEffect(() => {
    if (!formulaSelec) {
      setIngredientesFormula([]);
      setPorcentajeSalmuera(20);
      if (onSalmueraChange) onSalmueraChange(null);
      return;
    }
    Promise.all([
      supabase.from('formulaciones').select('*').eq('producto_nombre', formulaSelec.nombre).order('orden'),
      supabase.from('config_productos').select('porcentaje_salmuera,dias_maduracion').eq('producto_nombre', formulaSelec.nombre).maybeSingle(),
      supabase.from('vista_horneado_config').select('config'),
    ]).then(async ([{ data: filas }, { data: cfg }, { data: hcfgs }]) => {
      setIngredientesFormula(filas || []);
      setPorcentajeSalmuera(parseFloat(cfg?.porcentaje_salmuera) || 20);
      setDiasMaduracion(parseFloat(cfg?.dias_maduracion) || 5);

      // Buscar config del producto horneado que usa esta salmuera
      const match = (hcfgs || []).find(c =>
        (c.config?.formula_salmuera || '').toLowerCase() === formulaSelec.nombre.toLowerCase()
      );
      const cfgH = match?.config || null;
      setHorneadoCfgInj(cfgH);
      setHorneadoCfgProdNombre(match?.producto_nombre || null);
      const catH = (cfgH?._categoria || '').replace(/[ÓÒ]/g,'O').toUpperCase();
      setEsInmersionInj(catH.includes('INMERSION'));
      setKgSubprodIny('');

      // Cargar info de la MP si hay mp_existente activo en inyeccion
      const spInyRaw2 = cfgH?.subproductos?.inyeccion;
      const isNewFmt2 = spInyRaw2 && ('perdida' in spInyRaw2 || 'nueva_mp' in spInyRaw2 || 'mp_existente' in spInyRaw2);
      const spExistCfg = isNewFmt2 ? spInyRaw2?.mp_existente : (spInyRaw2?.tipo === 'mp_existente' ? spInyRaw2 : null);
      if (spExistCfg?.activo && spExistCfg?.mp_id) {
        const { data: mpSp } = await supabase.from('materias_primas')
          .select('id,nombre,nombre_producto,precio_kg').eq('id', spExistCfg.mp_id).maybeSingle();
        setSpInyMp(mpSp || null);
      } else {
        setSpInyMp(null);
      }
    });
  }, [formulaSelec]);

  // Cálculos
  const tieneBloquesDin = !!(horneadoCfgInj?.bloques && horneadoCfgInj.bloques.length > 0);
  const kgCarneTotal    = filasCort.reduce((s, f) => s + (parseFloat(f.kg) || 0), 0);
  const totalGramosForm = ingredientesFormula.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0);
  const spInyRaw = horneadoCfgInj?.subproductos?.inyeccion;
  const spInyIsNew = spInyRaw && ('perdida' in spInyRaw || 'nueva_mp' in spInyRaw || 'mp_existente' in spInyRaw);
  const spInyItems = spInyRaw
    ? spInyIsNew
      ? ['perdida','nueva_mp','mp_existente'].filter(t => spInyRaw[t]?.activo).map(t => ({ tipo: t, sp: spInyRaw[t] }))
      : (spInyRaw.activo ? [{ tipo: spInyRaw.tipo || 'perdida', sp: spInyRaw }] : [])
    : [];
  const haySpIny        = spInyItems.length > 0;
  const kgSubprodInyNum = haySpIny
    ? spInyItems.reduce((s, x) => s + Math.max(0, parseFloat(kgSubprodIny[x.tipo] || 0)), 0)
    : 0;
  const kgCarneNeta     = Math.max(0, kgCarneTotal - kgSubprodInyNum); // peso que realmente se inyecta
  const kgSalmueraReq   = kgCarneNeta * (porcentajeSalmuera / 100);
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

  const costoSalmueraTotal = ingredientesExp.length > 0
    ? ingredientesExp.reduce((s, i) => s + i.costo, 0)
    : precioVentaKgSalmuera * kgSalmueraReq;
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
        grupo: f.seccion || f.grupo || 'MP', precioKg,
        costo: kgReales * precioKg, stockKg,
        stockOk: stockKg >= kgReales - 0.001,
      };
    });
    const totalKg    = ingReales.reduce((s, i) => s + i.kgUsados, 0);
    const costoTotal = ingReales.reduce((s, i) => s + i.costo, 0);
    onSalmueraChange({
      formula: formulaSelec, ingredientes: ingReales, kgBase: totalKg,
      costoTotal, costoKg: totalKg > 0 ? costoTotal / totalKg : 0,
      kgCarneTotal: kgSalmueraReq,
      kgCarneBruta: kgCarneNeta,
      porcentajeSalmuera,
    });
  }, [formulaSelec, ingredientesFormula, mps, inventario, kgCarneTotal, kgSalmueraReq]);

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

      // Ratio para ajustar cada corte al peso neto (descontando sub-producto de inyección)
      const ratioNeto = kgCarneTotal > 0 ? kgCarneNeta / kgCarneTotal : 1;

      // Guardar costo BRUTO de carne; los créditos de sub-productos de inyección
      // se aplican una sola vez en confirmarHorneado (via creditoIny)
      const { data: prod, error: e1 } = await supabase.from('produccion_inyeccion').insert({
        fecha, formula_salmuera: formulaSelec.nombre, porcentaje_inyeccion: 100,
        kg_carne_total: kgCarneNeta, kg_salmuera_requerida: kgSalmueraReq,
        costo_carne_total: costoCarneTotal, costo_salmuera_total: costoSalmueraTotal,
        costo_total: costoCarneTotal + costoSalmueraTotal, estado: 'abierto',
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null,
        notas: notas || null,
      }).select().single();
      if (e1) throw e1;
      const prodId = prod.id;

      const filasCorte = cortesConCosto.filter(f => parseFloat(f.kg) > 0).map(f => {
        const kgCarne    = parseFloat(f.kg) * ratioNeto; // kg neto que realmente se inyecta
        const kgSal      = kgCarneNeta > 0 ? kgSalmueraReq * (kgCarne / kgCarneNeta) : 0;
        const costoSal   = f.costoSal || 0;
        const costoCarne = f.costoCarne || 0; // BRUTO — créditos se aplican en confirmarHorneado
        // INMERSIÓN: salmuera no suma peso, solo costo
        const kgTotal    = esInmersionInj ? kgCarne : kgCarne + kgSal;
        const costo_final_kg = kgTotal > 0 ? (costoCarne + costoSal) / kgTotal : 0;
        return {
          produccion_id: prodId, corte_nombre: f.mp.nombre_producto || f.mp.nombre,
          materia_prima_id: f.mp.id, kg_carne_cruda: kgCarne,
          _kg_original: parseFloat(f.kg), // solo para uso interno (stock), no se guarda en DB
          precio_kg_carne: parseFloat(f.precio_kg), costo_carne: costoCarne,
          kg_salmuera_asignada: kgSal, costo_salmuera_asignado: costoSal,
          kg_retazos: 0, kg_carne_limpia: kgCarne,
          costo_final_kg,
        };
      });
      if (filasCorte.length > 0) {
        // Quitar campo interno antes de insertar en DB
        const filasDB = filasCorte.map(({ _kg_original, ...rest }) => rest);
        const { error: e2 } = await supabase.from('produccion_inyeccion_cortes').insert(filasDB);
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

      // ── Crear lote en maduración ──────────────────────────
      const [yy, mm, dd] = fecha.split('-');
      const fechaStr = `${dd}/${mm}/${yy.slice(2)}`;
      const { count: lotesHoy } = await supabase
        .from('lotes_maduracion')
        .select('id', { count: 'exact', head: true })
        .eq('fecha_entrada', fecha);
      const loteId = (lotesHoy || 0) === 0 ? fechaStr : `${fechaStr}/${lotesHoy}`;

      const horasMad = parseFloat(horneadoCfgInj?.horas_mad ?? null);
      const minMad   = parseFloat(horneadoCfgInj?.minutos_mad ?? 0);
      const fechaSalidaObj = new Date(fecha + 'T12:00:00');
      if (!isNaN(horasMad)) {
        const totalMs = (horasMad * 60 + minMad) * 60 * 1000;
        fechaSalidaObj.setTime(fechaSalidaObj.getTime() + totalMs);
      } else {
        fechaSalidaObj.setDate(fechaSalidaObj.getDate() + Math.round(diasMaduracion));
      }
      const fechaSalida = fechaSalidaObj.toISOString().split('T')[0];

      const { data: lote, error: e4 } = await supabase.from('lotes_maduracion').insert({
        lote_id:       loteId,
        produccion_id: prodId,
        fecha_entrada: fecha,
        fecha_salida:  fechaSalida,
        estado:        'madurando',
      }).select().single();
      if (e4) throw e4;

      // Persistir kg de sub-productos de inyección → se incluyen en produccion_horneado_lotes
      if (haySpIny && lote) {
        const spInyReal = {};
        for (const { tipo } of spInyItems) {
          const kg = Math.max(0, parseFloat(kgSubprodIny[tipo] || 0));
          if (kg > 0) spInyReal[`inyeccion_${tipo}`] = kg;
        }
        if (Object.keys(spInyReal).length > 0) {
          await supabase.from('lotes_maduracion')
            .update({ sp_inyeccion_real: spInyReal })
            .eq('id', lote.id);
        }
      }

      // ── Descontar stock del inventario ────────────────────
      const fechaHoy = new Date().toISOString().split('T')[0];
      // 1. Descontar carnes (cortes) + registrar movimiento SALIDA
      for (const f of filasCorte) {
        const { data: inv } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', f.materia_prima_id).maybeSingle();
        if (inv) {
          const kgDescontar = f._kg_original || f.kg_carne_cruda; // usar kg bruto para el stock
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) - kgDescontar) })
            .eq('id', inv.id);
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: f.materia_prima_id,
            nombre_mp:        f.corte_nombre,
            tipo:             'salida',
            kg:               kgDescontar,
            motivo:           `Inyección — ${formulaSelec.nombre}`,
            usuario_nombre:   currentUser?.email || '',
            user_id:          currentUser?.id || null,
            fecha:            fechaHoy,
          });
        }
      }
      // 2. Descontar ingredientes de salmuera + registrar movimiento SALIDA
      for (const i of ingredientesExp) {
        if (!i.materia_prima_id) continue;
        const { data: inv } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', i.materia_prima_id).maybeSingle();
        if (inv) {
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) - i.kgUsados) })
            .eq('id', inv.id);
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: i.materia_prima_id,
            nombre_mp:        i.nombre,
            tipo:             'salida',
            kg:               i.kgUsados,
            motivo:           `Inyección — ${formulaSelec.nombre}`,
            usuario_nombre:   currentUser?.email || '',
            user_id:          currentUser?.id || null,
            fecha:            fechaHoy,
          });
        }
      }

      // Sub-productos de inyección → inventario (solo tipos crédito)
      for (const { tipo, sp } of spInyItems) {
        if (tipo === 'perdida') continue;
        const kgSp = Math.max(0, parseFloat(kgSubprodIny[tipo] || 0));
        if (kgSp <= 0) continue;
        let mpSpId = null;
        let mpSpNombre = '';
        if (tipo === 'mp_existente' && sp.mp_id) {
          mpSpId     = sp.mp_id;
          mpSpNombre = spInyMp?.nombre_producto || spInyMp?.nombre || sp.mp_id;
        } else if (tipo === 'nueva_mp' && sp.nombre) {
          const { data: mpEx } = await supabase.from('materias_primas')
            .select('id').ilike('nombre', sp.nombre).maybeSingle();
          if (mpEx) {
            mpSpId = mpEx.id;
          } else {
            const { data: nueva } = await supabase.from('materias_primas').insert({
              nombre: sp.nombre, nombre_producto: sp.nombre,
              categoria: 'SUB-PRODUCTOS', precio_kg: parseFloat(sp.precio_kg || 0),
              tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
            }).select('id').single();
            mpSpId = nueva?.id;
          }
          mpSpNombre = sp.nombre;
        }
        if (mpSpId) {
          const { data: invSp } = await supabase.from('inventario_mp')
            .select('id,stock_kg').eq('materia_prima_id', mpSpId).maybeSingle();
          if (invSp) {
            await supabase.from('inventario_mp').update({ stock_kg: (invSp.stock_kg || 0) + kgSp }).eq('id', invSp.id);
          } else {
            await supabase.from('inventario_mp').insert({ materia_prima_id: mpSpId, stock_kg: kgSp, nombre: mpSpNombre });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: mpSpId, nombre_mp: mpSpNombre,
            tipo: 'entrada', kg: kgSp,
            motivo: `Sub-producto Inyección (${tipo}) — ${fecha}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha,
          });
        }
      }

      setFormulaSelec(null); setFilasCort([]); setNotas(''); setKgSubprodIny({});
      setExito('✅ Producción registrada — lote en maduración hasta ' + fechaSalida);
      setTimeout(() => setExito(''), 8000);
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

          {/* 2b. Sub-producto Inyección */}
          {haySpIny && filasCort.length > 0 && kgCarneTotal > 0 && (
            <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:'2px solid #e67e2233' }}>
              <h4 style={{ margin:'0 0 10px', color:'#e67e22', fontSize:14, borderBottom:'2px solid #e67e2244', paddingBottom:6 }}>
                📦 Sub-productos de Inyección
              </h4>
              {spInyItems.map(({ tipo, sp }) => {
                const nombre = tipo === 'nueva_mp' ? sp.nombre
                             : tipo === 'mp_existente' ? (spInyMp?.nombre_producto || spInyMp?.nombre || 'MP existente')
                             : (sp.nombre || 'Merma/retazos');
                const esPerd = tipo === 'perdida';
                const color  = esPerd ? '#e74c3c' : '#27ae60';
                const kgT    = Math.max(0, parseFloat(kgSubprodIny[tipo] || 0));
                return (
                  <div key={tipo} style={{ marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:700, color, marginBottom:4 }}>
                      {esPerd ? '❌' : '📦'} {nombre}
                      <span style={{ fontWeight:400, color:'#888', marginLeft:6, fontSize:11 }}>
                        {esPerd ? '— merma, sin crédito' : '— entra a inventario'}
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <input type="number" min="0" step="0.001"
                        value={kgSubprodIny[tipo] ?? ''}
                        onChange={e => setKgSubprodIny(prev => ({ ...prev, [tipo]: e.target.value }))}
                        placeholder="0.000"
                        style={{ flex:1, padding:'10px 12px', borderRadius:8, border:`2px solid ${color}88`, fontSize:16, fontWeight:'bold', textAlign:'right', outline:'none' }} />
                      <span style={{ fontWeight:700, color:'#555', fontSize:14 }}>kg</span>
                    </div>
                  </div>
                );
              })}
              {kgSubprodInyNum > 0 && (
                <div style={{ background:'#f8f9fa', borderRadius:8, padding:'10px 12px', fontSize:12, marginTop:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:'#555' }}>Total carne entrada</span>
                    <span style={{ fontWeight:700 }}>{kgCarneTotal.toFixed(3)} kg</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', color:'#e74c3c' }}>
                    <span>− Sub-productos totales</span>
                    <span style={{ fontWeight:700 }}>−{kgSubprodInyNum.toFixed(3)} kg</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', color:'#2980b9', fontWeight:700, borderTop:'1px solid #eee', marginTop:6, paddingTop:6 }}>
                    <span>= Carne a inyectar</span>
                    <span>{kgCarneNeta.toFixed(3)} kg</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', color:'#2980b9', marginTop:3 }}>
                    <span>Salmuera ({porcentajeSalmuera}% de {kgCarneNeta.toFixed(3)} kg)</span>
                    <span style={{ fontWeight:700 }}>{kgSalmueraReq.toFixed(3)} kg</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notas */}
          <div style={{ background:'white', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:6 }}>📝 Notas (opcional)</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:13, resize:'vertical', boxSizing:'border-box', outline:'none' }}
              placeholder="Observaciones..." />
          </div>
        </div>

        {/* Columna derecha: botón guardar */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button
            disabled={guardando || !formulaSelec || kgCarneTotal <= 0}
            onClick={() => {
              const catCfg  = (horneadoCfgInj?._categoria || '').replace(/[ÓÒÔ]/g,'O').toUpperCase();
              const tipoCfg = (horneadoCfgInj?.tipo || '').toLowerCase();
              const esBano  = (catCfg.includes('INMERSION') || catCfg.includes('MARINAD'))
                              && tipoCfg !== 'padre' && tipoCfg !== 'hijo';
              if (tieneBloquesDin && esBano) {
                const bloques   = horneadoCfgInj.bloques || [];
                const madIdx    = bloques.findIndex(b => b.tipo === 'maduracion');
                const preMad    = (madIdx >= 0 ? bloques.slice(0, madIdx) : bloques).filter(b => b.activo);
                const pasosDin  = preMad.filter(b => b.tipo !== 'inyeccion' && b.tipo !== 'merma');
                if (pasosDin.length > 0) {
                  const precioCarne = cortesConCosto.length > 0
                    ? cortesConCosto.reduce((s, c) => s + c.costoKg * (parseFloat(c.kg) || 0), 0) / (kgCarneTotal || 1)
                    : 0;
                  setWizardM1({
                    bloques,
                    bloquesHijo: horneadoCfgInj.bloques_hijo || [],
                    cfg:         horneadoCfgInj,
                    kgInicial:   kgCarneTotal,
                    precioCarne,
                    esBano,
                    prodNombre:  horneadoCfgProdNombre,
                  });
                } else {
                  guardarProduccion();
                }
              } else {
                guardarProduccion();
              }
            }}
            style={{ padding:'16px', background: guardando || !formulaSelec || kgCarneTotal <= 0 ? '#95a5a6' : 'linear-gradient(135deg,#27ae60,#1e8449)', color:'white', border:'none', borderRadius:12, fontSize:16, fontWeight:'bold', cursor: guardando || !formulaSelec || kgCarneTotal <= 0 ? 'default' : 'pointer' }}>
            {guardando ? '⏳ Registrando...' : '💉 Registrar Producción'}
          </button>
        </div>
      </div>

      {/* ── Wizard Momento 1 ── */}
      {wizardM1 && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', padding:20 }}>
            <div style={{ fontWeight:700, fontSize:15, color:'#1a1a2e', marginBottom:14 }}>
              🧩 Flujo dinámico — {wizardM1.prodNombre || 'Producción'} · {(wizardM1.kgInicial || 0).toFixed(3)} kg
            </div>
            <WizardProduccionDinamica
              modo="momento1"
              bloques={wizardM1.bloques}
              bloquesHijo={wizardM1.bloquesHijo}
              cfg={wizardM1.cfg}
              lote={null}
              kgInicial={wizardM1.kgInicial}
              precioCarne={wizardM1.precioCarne}
              currentUser={currentUser}
              mpsFormula={mps}
              esBano={wizardM1.esBano}
              onComplete={({ loteId }) => {
                setWizardM1(null);
                setExito(`Lote ${loteId} registrado con flujo dinámico ✓`);
                setFilasCort([]);
                setFormulaSelec(null);
              }}
              onCancel={() => setWizardM1(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
