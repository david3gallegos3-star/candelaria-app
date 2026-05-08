// src/components/produccion/WizardProduccionDinamica.js
import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabase';

// Construye la lista de pasos activos para el momento/rama indicado
function buildPasos({ modo, rama, bloques, bloquesHijo }) {
  const activos = (arr) => (arr || []).filter(b => b.activo);
  if (modo === 'momento1') {
    const madIdx = (bloques || []).findIndex(b => b.tipo === 'maduracion');
    return activos(madIdx >= 0 ? bloques.slice(0, madIdx) : bloques);
  }
  if (modo === 'momento2') {
    if (rama === 'padre') {
      const madIdx = (bloques || []).findIndex(b => b.tipo === 'maduracion');
      return activos(madIdx >= 0 ? bloques.slice(madIdx) : bloques);
    }
    if (rama === 'hijo') return activos(bloquesHijo);
  }
  return [];
}

// Etiqueta corta para el progress indicator
function labelPaso(b) {
  const MAP = {
    inyeccion:   '💉 Inyección',
    maduracion:  '🧊 Maduración',
    rub:         '🧂 Rub',
    adicional:   '🍋 Adicional',
    bifurcacion: '🔀 Bifurcación',
  };
  if (b.tipo === 'merma') return `✂️ ${b.nombre_merma || 'Merma'} T${b.merma_tipo}`;
  return MAP[b.tipo] || b.tipo;
}

export default function WizardProduccionDinamica({
  modo,
  bloques,
  bloquesHijo,
  cfg,
  lote,
  kgInicial,
  precioCarne,
  currentUser,
  mpsFormula,
  onComplete,
  onCancel,
}) {
  const [pasoIdx,      setPasoIdx]      = useState(0);
  const [kgActual,     setKgActual]     = useState(parseFloat(kgInicial) || 0);
  const [costoAcum,    setCostoAcum]    = useState((parseFloat(precioCarne) || 0) * (parseFloat(kgInicial) || 0));
  const [resultados,   setResultados]   = useState([]);
  const [rama,         setRama]         = useState('padre');
  const [kgPadreF,     setKgPadreF]     = useState(null);
  const [kgHijoF,      setKgHijoF]      = useState(null);
  const [stockIdPadre, setStockIdPadre] = useState(null);
  const [inputKg,      setInputKg]      = useState('');
  const [guardando,    setGuardando]    = useState(false);
  const [error,        setError]        = useState('');

  const pasos = useMemo(
    () => buildPasos({ modo, rama, bloques, bloquesHijo }),
    [modo, rama, bloques, bloquesHijo]
  );

  const pasoActual = pasos[pasoIdx] || null;

  const pasosPadre = useMemo(
    () => buildPasos({ modo, rama: 'padre', bloques, bloquesHijo }),
    [modo, bloques, bloquesHijo]
  );
  const pasosHijoInd = useMemo(
    () => buildPasos({ modo: 'momento2', rama: 'hijo', bloques, bloquesHijo }),
    [modo, bloques, bloquesHijo]
  );

  function renderProgress() {
    const allPasos = modo === 'momento1'
      ? pasosPadre
      : [...pasosPadre, ...pasosHijoInd];

    const globalIdx = (modo === 'momento2' && rama === 'hijo')
      ? pasosPadre.length + pasoIdx
      : pasoIdx;

    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, padding: '10px 0', borderBottom: '1px solid #e8e8e8' }}>
        {allPasos.map((p, i) => {
          const esActual  = i === globalIdx;
          const completado = i < globalIdx;
          const esSep     = modo === 'momento2' && i === pasosPadre.length && pasosHijoInd.length > 0;
          return (
            <React.Fragment key={p.id || i}>
              {esSep && <span style={{ color: '#ccc', alignSelf: 'center', fontSize: 11 }}>│</span>}
              <div style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: completado ? '#27ae60' : esActual ? '#2980b9' : '#f0f2f5',
                color: (completado || esActual) ? 'white' : '#888',
                border: esActual ? '2px solid #1a5276' : '2px solid transparent',
              }}>
                {completado ? '✓ ' : esActual ? '● ' : '○ '}
                {labelPaso(p)}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // ── Helpers de stock ──────────────────────────────────────────────────

  async function descontarIngredientesFormula(formulaNombre, kgTotal, loteIdRef) {
    if (!formulaNombre) return;
    const hoy = new Date().toISOString().split('T')[0];
    const { data: filas } = await supabase.from('formulaciones')
      .select('ingrediente_nombre,gramos,materia_prima_id')
      .eq('producto_nombre', formulaNombre);
    if (!filas?.length) return;
    const totalGr = filas.reduce((s, r) => s + (r.gramos || 0), 0);
    for (const f of filas) {
      if (!f.materia_prima_id) continue;
      const kgUsar = totalGr > 0 ? (f.gramos / totalGr) * kgTotal : 0;
      if (kgUsar <= 0) continue;
      const { data: inv } = await supabase.from('inventario_mp')
        .select('id,stock_kg').eq('materia_prima_id', f.materia_prima_id).maybeSingle();
      if (inv) {
        await supabase.from('inventario_mp')
          .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) - kgUsar) }).eq('id', inv.id);
      }
      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: f.materia_prima_id,
        nombre_mp: f.ingrediente_nombre || '',
        tipo: 'salida', kg: kgUsar,
        motivo: `Flujo dinámico CORTES — ${formulaNombre} — Lote ${loteIdRef}`,
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
      });
    }
  }

  async function descontarMpDirecto(mpId, kgUsar, nombreMp, loteIdRef) {
    if (!mpId || kgUsar <= 0) return;
    const hoy = new Date().toISOString().split('T')[0];
    const { data: inv } = await supabase.from('inventario_mp')
      .select('id,stock_kg').eq('materia_prima_id', mpId).maybeSingle();
    if (inv) {
      await supabase.from('inventario_mp')
        .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) - kgUsar) }).eq('id', inv.id);
    }
    await supabase.from('inventario_movimientos').insert({
      materia_prima_id: mpId, nombre_mp: nombreMp || '',
      tipo: 'salida', kg: kgUsar,
      motivo: `Flujo dinámico CORTES — Adicional — Lote ${loteIdRef}`,
      usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
    });
  }

  async function ingresarMpAInventario(mpId, nombreMp, kgEntrada, loteIdRef) {
    if (!mpId || kgEntrada <= 0) return;
    const hoy = new Date().toISOString().split('T')[0];
    const { data: inv } = await supabase.from('inventario_mp')
      .select('id,stock_kg').eq('materia_prima_id', mpId).maybeSingle();
    if (inv) {
      await supabase.from('inventario_mp')
        .update({ stock_kg: (inv.stock_kg || 0) + kgEntrada }).eq('id', inv.id);
    } else {
      await supabase.from('inventario_mp')
        .insert({ materia_prima_id: mpId, stock_kg: kgEntrada, nombre: nombreMp });
    }
    await supabase.from('inventario_movimientos').insert({
      materia_prima_id: mpId, nombre_mp: nombreMp || '',
      tipo: 'entrada', kg: kgEntrada,
      motivo: `Merma tipo 3 — Flujo dinámico CORTES — Lote ${loteIdRef}`,
      usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
    });
  }

  async function guardarStockLote({ loteId, lotesMadId, corteNombre, mpId, kg, costoTotal, costoKg, tipoCorte, parentLoteId, formulaSalmuera }) {
    const hoy = new Date().toISOString().split('T')[0];
    let mpFinalId = mpId;
    if (!mpFinalId) {
      const { data: existMp } = await supabase.from('materias_primas')
        .select('id').ilike('nombre', corteNombre).ilike('categoria', 'inyectados').eq('eliminado', false).maybeSingle();
      if (existMp) {
        mpFinalId = existMp.id;
      } else {
        const { data: existIds } = await supabase.from('materias_primas').select('id').eq('categoria', 'Inyectados');
        const nums  = (existIds || []).map(m => parseInt((m.id || '').replace(/\D/g,'') || '0')).filter(n => !isNaN(n));
        const nextN = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        const { data: nuevaMp } = await supabase.from('materias_primas').insert({
          id: 'INY' + String(nextN).padStart(3,'0'),
          nombre: corteNombre, nombre_producto: corteNombre,
          categoria: 'Inyectados', precio_kg: 0,
          tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
        }).select('id').single();
        mpFinalId = nuevaMp?.id;
      }
    }
    if (!mpFinalId) return null;
    const { data: inv } = await supabase.from('inventario_mp')
      .select('id,stock_kg').eq('materia_prima_id', mpFinalId).maybeSingle();
    if (inv) {
      await supabase.from('inventario_mp').update({ stock_kg: (inv.stock_kg || 0) + kg }).eq('id', inv.id);
    } else {
      await supabase.from('inventario_mp').insert({ materia_prima_id: mpFinalId, stock_kg: kg, nombre: corteNombre });
    }
    await supabase.from('inventario_movimientos').insert({
      materia_prima_id: mpFinalId, nombre_mp: corteNombre,
      tipo: 'entrada', kg,
      motivo: `Flujo dinámico CORTES ${tipoCorte} — Lote ${loteId}`,
      usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
    });
    const { data: stockRow } = await supabase.from('stock_lotes_inyectados').insert({
      lote_id: loteId, lote_maduracion_id: lotesMadId,
      corte_nombre: corteNombre, materia_prima_id: mpFinalId,
      kg_inicial: kg, kg_disponible: kg, kg_inyectado: kg,
      costo_total: costoTotal, costo_iny_kg: costoKg, costo_mad_kg: costoKg,
      tipo_corte: tipoCorte, formula_salmuera: formulaSalmuera || '',
      fecha_entrada: hoy,
      ...(parentLoteId ? { parent_lote_id: parentLoteId } : {}),
    }).select('id').single();
    return stockRow?.id || null;
  }

  // ── Confirmaciones por tipo de bloque ─────────────────────────────────

  async function confirmarMerma(b) {
    setGuardando(true); setError('');
    try {
      const loteRef = lote?.lote_id || 'NUEVO';
      let kgSalida = kgActual;
      let nuevoCosto = costoAcum;
      let kgRealInput = parseFloat(inputKg) || 0;

      if (b.merma_tipo === 1) {
        kgSalida = kgActual * (1 - (parseFloat(b.pct_merma) || 0) / 100);
      } else if (b.merma_tipo === 2) {
        if (kgRealInput <= 0) { setError('Ingresa los kg reales obtenidos'); setGuardando(false); return; }
        kgSalida  = kgActual - kgRealInput;
        const credito = kgRealInput * (parseFloat(b.precio_merma_kg) || 0);
        nuevoCosto = costoAcum - credito;
      } else if (b.merma_tipo === 3) {
        if (kgRealInput <= 0) { setError('Ingresa los kg reales obtenidos'); setGuardando(false); return; }
        kgSalida  = kgActual - kgRealInput;
        const credito = kgRealInput * (parseFloat(b.precio_merma_kg) || 0);
        nuevoCosto = costoAcum - credito;
        const mpMerma = b.mp_merma_id ? mpsFormula.find(m => String(m.id) === String(b.mp_merma_id)) : null;
        if (b.mp_merma_id) {
          await ingresarMpAInventario(b.mp_merma_id, mpMerma?.nombre_producto || mpMerma?.nombre || b.nombre_merma || 'Merma', kgRealInput, loteRef);
        }
      }

      const res = { tipo: b.tipo, merma_tipo: b.merma_tipo, kgEntrada: kgActual, kgSalida, costoAcum: nuevoCosto, kgMermaReal: b.merma_tipo === 1 ? kgActual - kgSalida : kgRealInput };
      setResultados(prev => [...prev, res]);
      setKgActual(kgSalida);
      setCostoAcum(nuevoCosto);
      setInputKg('');
      setPasoIdx(prev => prev + 1);
    } catch (e) { setError(e.message); }
    setGuardando(false);
  }

  async function confirmarInyeccion(b) {
    setGuardando(true); setError('');
    try {
      const loteRef = lote?.lote_id || 'NUEVO';
      const pct = parseFloat(b.pct_inj || cfg?.pct_inj || 0) / 100;
      const kgSalmuera = kgActual * pct;
      const formulaSal = b.formula_salmuera || cfg?.formula_salmuera || '';
      let costoSalmuera = 0;
      if (formulaSal) {
        const { data: salFilas } = await supabase.from('formulaciones')
          .select('gramos,materia_prima_id').eq('producto_nombre', formulaSal);
        const totalGr = (salFilas || []).reduce((s, r) => s + (r.gramos || 0), 0);
        const { data: mpsSal } = salFilas?.length
          ? await supabase.from('materias_primas').select('id,precio_kg').in('id', salFilas.map(r => r.materia_prima_id).filter(Boolean))
          : { data: [] };
        for (const f of (salFilas || [])) {
          const mp = (mpsSal || []).find(m => m.id === f.materia_prima_id);
          const kgIng = totalGr > 0 ? (f.gramos / totalGr) * kgSalmuera : 0;
          costoSalmuera += kgIng * parseFloat(mp?.precio_kg || 0);
        }
        await descontarIngredientesFormula(formulaSal, kgSalmuera, loteRef);
      }
      const kgSalida = kgActual + kgSalmuera;
      const nuevoCosto = costoAcum + costoSalmuera;
      const res = { tipo: 'inyeccion', kgEntrada: kgActual, kgSalida, costoAcum: nuevoCosto, kgSalmuera, costoSalmuera, formulaSalmuera: formulaSal };
      setResultados(prev => [...prev, res]);
      setKgActual(kgSalida);
      setCostoAcum(nuevoCosto);
      setPasoIdx(prev => prev + 1);
    } catch (e) { setError(e.message); }
    setGuardando(false);
  }

  async function confirmarRub(b) {
    setGuardando(true); setError('');
    try {
      const loteRef = lote?.lote_id || 'NUEVO';
      const formulaRub = b.formula_rub || cfg?.formula_rub || '';
      const kgBase = parseFloat(b.kg_rub_base || cfg?.kg_rub_base || 1);
      const escala = kgActual / kgBase;
      let costoRub = 0;
      if (formulaRub) {
        const { data: rubFilas } = await supabase.from('formulaciones')
          .select('gramos,materia_prima_id').eq('producto_nombre', formulaRub);
        const totalGr = (rubFilas || []).reduce((s, r) => s + (r.gramos || 0), 0);
        const kgRubTotal = (totalGr / 1000) * escala;
        const { data: mpsRub } = rubFilas?.length
          ? await supabase.from('materias_primas').select('id,precio_kg').in('id', rubFilas.map(r => r.materia_prima_id).filter(Boolean))
          : { data: [] };
        for (const f of (rubFilas || [])) {
          const mp = (mpsRub || []).find(m => m.id === f.materia_prima_id);
          const kgIng = totalGr > 0 ? ((f.gramos / 1000) * escala) : 0;
          costoRub += kgIng * parseFloat(mp?.precio_kg || 0);
        }
        await descontarIngredientesFormula(formulaRub, kgRubTotal, loteRef);
      }
      const nuevoCosto = costoAcum + costoRub;
      const res = { tipo: 'rub', kgEntrada: kgActual, kgSalida: kgActual, costoAcum: nuevoCosto, costoRub, formulaRub };
      setResultados(prev => [...prev, res]);
      setCostoAcum(nuevoCosto);
      setPasoIdx(prev => prev + 1);
    } catch (e) { setError(e.message); }
    setGuardando(false);
  }

  async function confirmarAdicional(b) {
    setGuardando(true); setError('');
    try {
      const loteRef = lote?.lote_id || 'NUEVO';
      const mpAdic = b.mp_adicional_id ? mpsFormula.find(m => String(m.id) === String(b.mp_adicional_id)) : null;
      const precioMp = parseFloat(mpAdic?.precio_kg || 0);
      const grN = parseFloat(b.gramos_adicional || 0);
      const kgAdicTotal = (grN / 1000) * kgActual;
      const costoAdic = kgAdicTotal * precioMp;
      if (b.mp_adicional_id && kgAdicTotal > 0) {
        await descontarMpDirecto(b.mp_adicional_id, kgAdicTotal, mpAdic?.nombre_producto || mpAdic?.nombre || '', loteRef);
      }
      const nuevoCosto = costoAcum + costoAdic;
      const res = { tipo: 'adicional', kgEntrada: kgActual, kgSalida: kgActual, costoAcum: nuevoCosto, costoAdic, mpNombre: mpAdic?.nombre_producto || mpAdic?.nombre };
      setResultados(prev => [...prev, res]);
      setCostoAcum(nuevoCosto);
      setPasoIdx(prev => prev + 1);
    } catch (e) { setError(e.message); }
    setGuardando(false);
  }

  function confirmarMaduracion() {
    const kgReal = parseFloat(inputKg) || 0;
    if (kgReal <= 0) { setError('Ingresa los kg reales después de maduración'); return; }
    const kgMermaReal = kgActual - kgReal;
    const pctMermaReal = kgActual > 0 ? (kgMermaReal / kgActual * 100) : 0;
    const pctMermaEsp  = parseFloat(cfg?.pct_mad || 0);
    const res = { tipo: 'maduracion', kgEntrada: kgActual, kgSalida: kgReal, costoAcum, kgMermaReal, pctMermaReal, pctMermaEsp };
    setResultados(prev => [...prev, res]);
    setKgActual(kgReal);
    setInputKg('');
    setPasoIdx(prev => prev + 1);
  }

  function confirmarBifurcacion() {
    const kgP = parseFloat(inputKg) || 0;
    if (kgP <= 0 || kgP >= kgActual) { setError('El peso Padre debe ser > 0 y < total disponible'); return; }
    const kgH = parseFloat((kgActual - kgP).toFixed(3));
    const costoKg = kgActual > 0 ? costoAcum / kgActual : 0;
    setKgPadreF(kgP);
    setKgHijoF(kgH);
    const res = { tipo: 'bifurcacion', kgEntrada: kgActual, kgPadre: kgP, kgHijo: kgH, costoKg, costoPadre: kgP * costoKg, costoHijo: kgH * costoKg };
    setResultados(prev => [...prev, res]);
    setKgActual(kgP);
    setCostoAcum(kgP * costoKg);
    setInputKg('');
    setPasoIdx(prev => prev + 1);
  }

  // ── Detectar fin de pasos y avanzar a siguiente fase ─────────────────
  React.useEffect(() => {
    if (pasoIdx < pasos.length) return;
    if (pasos.length === 0) return;

    if (modo === 'momento1') {
      completarMomento1();
    } else if (modo === 'momento2') {
      if (rama === 'padre') {
        const hasBifurcacion = pasos.some(p => p.tipo === 'bifurcacion');
        if (hasBifurcacion && (bloquesHijo || []).filter(b => b.activo).length > 0) {
          const costoKgBif = kgActual > 0 ? costoAcum / kgActual : 0;
          setRama('hijo');
          setKgActual(kgHijoF || 0);
          setCostoAcum((kgHijoF || 0) * costoKgBif);
          setPasoIdx(0);
          setInputKg('');
        } else {
          completarMomento2Padre();
        }
      } else if (rama === 'hijo') {
        completarMomento2Hijo();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasoIdx, pasos.length]);

  async function completarMomento1() {
    setGuardando(true); setError('');
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const bloquesMad = (bloques || []).find(b => b.tipo === 'maduracion');
      const horas = parseFloat(bloquesMad?.horas_mad || cfg?.horas_mad || 72);
      const fechaSalida = new Date(Date.now() + horas * 3600000).toISOString().split('T')[0];
      const formulaSal = resultados.find(r => r.tipo === 'inyeccion')?.formulaSalmuera || cfg?.formula_salmuera || '';

      const bloquesResultado = {
        momento: 'momento1_completado',
        pasos: resultados,
        kgPostMomento1: kgActual,
        costoAcumMomento1: costoAcum,
      };

      const loteId = `L${Date.now()}`;
      const { data: loteRow, error: loteErr } = await supabase.from('lotes_maduracion').insert({
        lote_id: loteId,
        estado: 'activo',
        fecha_entrada: hoy,
        fecha_salida: fechaSalida,
        kg_inicial: parseFloat(kgInicial),
        bloques_resultado: bloquesResultado,
        ...(formulaSal ? { formula_salmuera: formulaSal } : {}),
      }).select('id,lote_id').single();
      if (loteErr) throw loteErr;

      onComplete({ loteId: loteRow.lote_id, lotesMadId: loteRow.id, bloquesResultado });
    } catch (e) { setError('Error al guardar: ' + e.message); setGuardando(false); }
  }

  async function finalizarRamaPadre(kgP, costoP) {
    setGuardando(true); setError('');
    try {
      const costoKgP = kgP > 0 ? costoP / kgP : 0;
      const corteNombrePadre = lote?.corteNombrePadre || cfg?.producto_nombre || '';
      const formulaSal = resultados.find(r => r.tipo === 'inyeccion')?.formulaSalmuera || lote?.formulaSalmuera || '';

      const stockIdP = await guardarStockLote({
        loteId:          lote?.loteId,
        lotesMadId:      lote?.lotesMadId,
        corteNombre:     corteNombrePadre,
        mpId:            lote?.mpPadreId || null,
        kg:              kgP,
        costoTotal:      costoP,
        costoKg:         costoKgP,
        tipoCorte:       'padre',
        parentLoteId:    null,
        formulaSalmuera: formulaSal,
      });
      setStockIdPadre(stockIdP);

      const bloquesRes = lote?.bloquesResultado || {};
      const bloquesActualizados = {
        ...bloquesRes,
        momento: kgHijoF ? 'padre_completado' : 'completado',
        pasos: [...(bloquesRes.pasos || []), ...resultados],
        padre: { kg: kgP, costo_kg: costoKgP, stock_id: stockIdP },
      };
      await supabase.from('lotes_maduracion')
        .update({ bloques_resultado: bloquesActualizados, estado: kgHijoF ? 'activo' : 'completado' })
        .eq('id', lote?.lotesMadId);

      if (!kgHijoF) onComplete({ bloquesResultado: bloquesActualizados });
    } catch (e) { setError('Error al guardar padre: ' + e.message); }
    setGuardando(false);
  }

  async function completarMomento2Padre() {
    await finalizarRamaPadre(kgActual, costoAcum);
  }

  async function completarMomento2Hijo() {
    setGuardando(true); setError('');
    try {
      const costoKgH = kgActual > 0 ? costoAcum / kgActual : 0;
      const corteNombreHijo = lote?.corteNombreHijo || '';
      const formulaSal = lote?.formulaSalmuera || '';

      const stockIdH = await guardarStockLote({
        loteId:          (lote?.loteId || '') + '-H',
        lotesMadId:      lote?.lotesMadId,
        corteNombre:     corteNombreHijo,
        mpId:            null,
        kg:              kgActual,
        costoTotal:      costoAcum,
        costoKg:         costoKgH,
        tipoCorte:       'hijo',
        parentLoteId:    lote?.loteId,
        formulaSalmuera: formulaSal,
      });

      const bloquesRes = lote?.bloquesResultado || {};
      const bloquesActualizados = {
        ...bloquesRes,
        momento: 'completado',
        pasos: [...(bloquesRes.pasos || []), ...resultados],
        hijo: { kg: kgActual, costo_kg: costoKgH, stock_id: stockIdH },
      };
      await supabase.from('lotes_maduracion')
        .update({ bloques_resultado: bloquesActualizados, estado: 'completado' })
        .eq('id', lote?.lotesMadId);

      onComplete({ bloquesResultado: bloquesActualizados });
    } catch (e) { setError('Error al guardar hijo: ' + e.message); }
    setGuardando(false);
  }

  function renderPaso(b) {
    const costoKgActual = kgActual > 0 ? costoAcum / kgActual : 0;

    if (b.tipo === 'merma') {
      const pct = parseFloat(b.pct_merma || 0);
      const kgEstimado = kgActual * (pct / 100);
      const inputNeeded = b.merma_tipo === 2 || b.merma_tipo === 3;
      const kgInputN = parseFloat(inputKg) || 0;
      const credito = inputNeeded && kgInputN > 0 ? kgInputN * parseFloat(b.precio_merma_kg || 0) : 0;
      const mpMerma = b.mp_merma_id ? mpsFormula.find(m => String(m.id) === String(b.mp_merma_id)) : null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fdf2f2', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #e74c3c' }}>
            <div style={{ fontWeight: 700, color: '#e74c3c', fontSize: 14, marginBottom: 8 }}>
              ✂️ Merma {b.nombre_merma ? `— ${b.nombre_merma}` : ''} (Tipo {b.merma_tipo})
            </div>
            <div style={{ fontSize: 12, color: '#555' }}>
              <div>Entrada: <strong>{kgActual.toFixed(3)} kg</strong> · ${costoKgActual.toFixed(4)}/kg</div>
              {b.merma_tipo === 1 && <div style={{ marginTop: 4 }}>Estimado: <strong style={{ color: '#e74c3c' }}>{kgEstimado.toFixed(3)} kg merma</strong> → quedan {(kgActual - kgEstimado).toFixed(3)} kg</div>}
              {b.merma_tipo === 1 && <div style={{ marginTop: 4, color: '#888' }}>El costo se absorbe → sube el costo/kg del producto restante.</div>}
              {(b.merma_tipo === 2 || b.merma_tipo === 3) && (
                <div style={{ marginTop: 4 }}>
                  {b.merma_tipo === 3 && mpMerma && <div>Destino: <strong>{mpMerma.nombre_producto || mpMerma.nombre}</strong> · ${parseFloat(mpMerma.precio_kg||0).toFixed(4)}/kg</div>}
                  {b.merma_tipo === 2 && b.nombre_merma && <div>Subproducto: <strong>{b.nombre_merma}</strong> · ${parseFloat(b.precio_merma_kg||0).toFixed(4)}/kg</div>}
                </div>
              )}
            </div>
          </div>
          {inputNeeded && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#e74c3c', display: 'block', marginBottom: 4 }}>
                {b.merma_tipo === 3 ? 'kg obtenidos (irán a inventario)' : 'kg reales obtenidos'}
              </label>
              <input type="number" min="0" step="0.001" placeholder="0.000"
                value={inputKg} onChange={e => setInputKg(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid #e74c3c', fontSize: 15, fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }} />
              {credito > 0 && (
                <div style={{ marginTop: 6, background: '#eafaf1', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: '#27ae60', fontWeight: 600 }}>
                  Crédito generado: ${credito.toFixed(4)}
                </div>
              )}
            </div>
          )}
          <button onClick={() => confirmarMerma(b)} disabled={guardando}
            style={{ width: '100%', padding: '12px', background: guardando ? '#aaa' : '#e74c3c', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: guardando ? 'default' : 'pointer' }}>
            {guardando ? 'Procesando...' : b.merma_tipo === 1 ? '✓ Confirmar merma' : '✓ Confirmar kg obtenidos'}
          </button>
        </div>
      );
    }

    if (b.tipo === 'inyeccion') {
      const kgSalmuera = kgActual * (parseFloat(b.pct_inj || cfg?.pct_inj || 0) / 100);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#eaf4fd', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #2980b9' }}>
            <div style={{ fontWeight: 700, color: '#2980b9', fontSize: 14, marginBottom: 8 }}>💉 Inyección de Salmuera</div>
            <div style={{ fontSize: 12, color: '#555' }}>
              <div>Carne actual: <strong>{kgActual.toFixed(3)} kg</strong></div>
              <div style={{ marginTop: 4 }}>% inyección: <strong>{b.pct_inj || cfg?.pct_inj || 0}%</strong></div>
              <div style={{ marginTop: 4 }}>Salmuera a inyectar: <strong style={{ color: '#2980b9' }}>{kgSalmuera.toFixed(3)} kg</strong></div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>→ {(kgActual + kgSalmuera).toFixed(3)} kg después de inyección</div>
              {(b.formula_salmuera || cfg?.formula_salmuera) && (
                <div style={{ marginTop: 4, color: '#888' }}>Fórmula: {b.formula_salmuera || cfg?.formula_salmuera}</div>
              )}
            </div>
          </div>
          <button onClick={() => confirmarInyeccion(b)} disabled={guardando}
            style={{ width: '100%', padding: '12px', background: guardando ? '#aaa' : '#2980b9', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: guardando ? 'default' : 'pointer' }}>
            {guardando ? 'Procesando...' : '💉 Confirmar inyección'}
          </button>
        </div>
      );
    }

    if (b.tipo === 'maduracion') {
      const kgInputN = parseFloat(inputKg) || 0;
      const mermaReal = kgInputN > 0 ? ((kgActual - kgInputN) / kgActual * 100) : null;
      const mermaEsp  = parseFloat(cfg?.pct_mad || 0);
      const diffColor = mermaReal !== null ? (Math.abs(mermaReal - mermaEsp) <= 3 ? '#27ae60' : '#e74c3c') : '#888';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#f0fff4', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #27ae60' }}>
            <div style={{ fontWeight: 700, color: '#27ae60', fontSize: 14, marginBottom: 8 }}>🧊 Pesaje — Salida de Maduración</div>
            <div style={{ fontSize: 12, color: '#555' }}>
              <div>Entrada: <strong>{kgActual.toFixed(3)} kg</strong> · ${costoKgActual.toFixed(4)}/kg</div>
              <div style={{ marginTop: 4 }}>Merma esperada: <strong>{mermaEsp}%</strong> → esperado {(kgActual * (1 - mermaEsp/100)).toFixed(3)} kg</div>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#27ae60', display: 'block', marginBottom: 4 }}>kg reales de salida</label>
            <input type="number" min="0" step="0.001" placeholder="0.000"
              value={inputKg} onChange={e => setInputKg(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid #27ae60', fontSize: 15, fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }} />
            {mermaReal !== null && (
              <div style={{ marginTop: 6, fontSize: 12, color: diffColor, fontWeight: 600 }}>
                Merma real: {mermaReal.toFixed(1)}% {Math.abs(mermaReal - mermaEsp) <= 3 ? '✓ dentro de lo esperado' : '⚠️ diferencia con lo esperado'}
              </div>
            )}
          </div>
          <button onClick={confirmarMaduracion} disabled={guardando || !inputKg}
            style={{ width: '100%', padding: '12px', background: !inputKg ? '#ccc' : '#27ae60', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: !inputKg ? 'default' : 'pointer' }}>
            ✓ Confirmar pesaje
          </button>
        </div>
      );
    }

    if (b.tipo === 'rub') {
      const kgBase = parseFloat(b.kg_rub_base || cfg?.kg_rub_base || 1);
      const escala = kgBase > 0 ? kgActual / kgBase : 0;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#f5eeff', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #8e44ad' }}>
            <div style={{ fontWeight: 700, color: '#8e44ad', fontSize: 14, marginBottom: 8 }}>🧂 Rub / Especias</div>
            <div style={{ fontSize: 12, color: '#555' }}>
              <div>Fórmula: <strong>{b.formula_rub || cfg?.formula_rub || '—'}</strong></div>
              <div style={{ marginTop: 4 }}>Escala: {kgBase} kg base × {escala.toFixed(3)} = <strong>{kgActual.toFixed(3)} kg carne</strong></div>
            </div>
          </div>
          <button onClick={() => confirmarRub(b)} disabled={guardando}
            style={{ width: '100%', padding: '12px', background: guardando ? '#aaa' : '#8e44ad', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: guardando ? 'default' : 'pointer' }}>
            {guardando ? 'Procesando...' : '🧂 Confirmar y descontar Rub'}
          </button>
        </div>
      );
    }

    if (b.tipo === 'adicional') {
      const mpAdic = b.mp_adicional_id ? mpsFormula.find(m => String(m.id) === String(b.mp_adicional_id)) : null;
      const grN = parseFloat(b.gramos_adicional || 0);
      const kgTotal = (grN / 1000) * kgActual;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff8e8', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #f39c12' }}>
            <div style={{ fontWeight: 700, color: '#f39c12', fontSize: 14, marginBottom: 8 }}>🍋 Ingrediente Adicional</div>
            <div style={{ fontSize: 12, color: '#555' }}>
              <div>MP: <strong>{mpAdic?.nombre_producto || mpAdic?.nombre || '—'}</strong> · ${parseFloat(mpAdic?.precio_kg||0).toFixed(4)}/kg</div>
              <div style={{ marginTop: 4 }}>{grN}g/kg × {kgActual.toFixed(3)} kg = <strong>{kgTotal.toFixed(3)} kg</strong></div>
            </div>
          </div>
          <button onClick={() => confirmarAdicional(b)} disabled={guardando}
            style={{ width: '100%', padding: '12px', background: guardando ? '#aaa' : '#f39c12', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: guardando ? 'default' : 'pointer' }}>
            {guardando ? 'Procesando...' : '🍋 Confirmar y descontar adicional'}
          </button>
        </div>
      );
    }

    if (b.tipo === 'bifurcacion') {
      const kgPadreN = parseFloat(inputKg) || 0;
      const kgHijoN = kgPadreN > 0 ? Math.max(0, kgActual - kgPadreN) : 0;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#f3e8fd', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #6c3483' }}>
            <div style={{ fontWeight: 700, color: '#6c3483', fontSize: 14, marginBottom: 8 }}>🔀 Bifurcación Padre / Hijo</div>
            <div style={{ fontSize: 12, color: '#555' }}>
              <div>Total disponible: <strong>{kgActual.toFixed(3)} kg</strong> · ${costoKgActual.toFixed(4)}/kg</div>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6c3483', display: 'block', marginBottom: 4 }}>
              kg para el Padre (👑 {cfg?.corte_nombre || 'Padre'})
            </label>
            <input type="number" min="0" step="0.001" placeholder="0.000"
              value={inputKg} onChange={e => setInputKg(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid #6c3483', fontSize: 15, fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }} />
          </div>
          {kgPadreN > 0 && kgPadreN < kgActual && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#eaf4fd', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#1a3a5c' }}>👑 Padre</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#1a3a5c' }}>{kgPadreN.toFixed(3)} kg</div>
                <div style={{ fontSize: 11, color: '#888' }}>${costoKgActual.toFixed(4)}/kg</div>
              </div>
              <div style={{ background: '#f3e8fd', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#6c3483' }}>🔀 Hijo</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#6c3483' }}>{kgHijoN.toFixed(3)} kg</div>
                <div style={{ fontSize: 11, color: '#888' }}>${costoKgActual.toFixed(4)}/kg</div>
              </div>
            </div>
          )}
          <button onClick={confirmarBifurcacion} disabled={guardando || kgPadreN <= 0 || kgPadreN >= kgActual}
            style={{ width: '100%', padding: '12px', background: (guardando || kgPadreN <= 0 || kgPadreN >= kgActual) ? '#ccc' : '#6c3483', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: (kgPadreN <= 0 || kgPadreN >= kgActual) ? 'default' : 'pointer' }}>
            {guardando ? 'Procesando...' : '🔀 Dividir lote'}
          </button>
        </div>
      );
    }

    return (
      <div style={{ padding: 16, background: '#f8f9fa', borderRadius: 10, textAlign: 'center', color: '#888' }}>
        Bloque pendiente: <strong>{b.tipo}</strong>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1a1a2e' }}>
              {modo === 'momento1' ? '🏭 Registrar Producción' : '⚖️ Pesaje — Continuar flujo'}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {rama === 'hijo' ? '🔀 Rama Hijo' : '👑 Rama Padre'} · {kgActual.toFixed(3)} kg · ${costoAcum > 0 && kgActual > 0 ? (costoAcum / kgActual).toFixed(4) : '—'}/kg
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {renderProgress()}

        {error && (
          <div style={{ background: '#fdf2f2', border: '1.5px solid #e74c3c', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e74c3c', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {pasoActual ? renderPaso(pasoActual) : (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>Sin pasos activos</div>
        )}

      </div>
    </div>
  );
}
