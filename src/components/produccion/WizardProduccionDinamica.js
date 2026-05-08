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

  // ── renderPaso — placeholder, se completa en Tasks 4-5 ──────────────
  function renderPaso(b) {
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
