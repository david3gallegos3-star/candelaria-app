// BloquesDinamicos.js — Flujo dinámico de bloques para CORTES
// Punto de entrada: BloquesDinamicosEditor + calcBloques
import React, { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// calcBloques: procesa el array de bloques en orden y devuelve
// pasos de costo acumulado + resultado final.
// ─────────────────────────────────────────────────────────────
export function calcBloques({ bloques, kgIni, precioCarne, precioKgSalmuera, costoRubFormula, kgRubBase, mpAdic, esBano = false }) {
  let kg = kgIni;
  let costoAcum = precioCarne * kgIni;
  const pasos = [];
  let mermaGrupoBase = null; // base para mermas consecutivas (todas desde el mismo peso)

  for (const b of (bloques || [])) {
    if (!b.activo) continue;

    if (b.tipo !== 'merma') mermaGrupoBase = null; // romper grupo al encontrar bloque no-merma

    if (b.tipo === 'inyeccion') {
      const pct   = parseFloat(b.pct_inj || 0) / 100;
      const kgSal = kg * pct;
      const cSal  = kgSal * precioKgSalmuera;
      costoAcum  += cSal;
      const pctPeso = b.pct_peso_inj != null
        ? (parseFloat(b.pct_peso_inj) || 0) / 100
        : (esBano ? 0 : 1);
      kg += kgSal * pctPeso;
      pasos.push({ tipo: 'inyeccion', label: `💉 Inyección ${b.pct_inj}%`, kg, costoAcum, kgSal, cSal });

    } else if (b.tipo === 'maduracion') {
      const kgAntes  = kg;
      const kgSalida = parseFloat(b.kg_salida_mad || 0);
      if (kgSalida > 0 && kgSalida < kg) {
        kg = kgSalida;
      } else {
        const pctM = parseFloat(b.pct_mad || 0) / 100;
        kg = kg * (1 - pctM);
      }
      const mermaKg = kgAntes - kg;
      const pctReal = kgAntes > 0 ? (mermaKg / kgAntes * 100) : 0;
      pasos.push({ tipo: 'maduracion', label: `🧊 Maduración`, kg, costoAcum, kgAntes, mermaKg, pctReal });

    } else if (b.tipo === 'rub') {
      const kgRubN = parseFloat(b.kg_rub_base || kgRubBase || 1);
      const cRub   = kgRubN > 0 ? (kg / kgRubN) * costoRubFormula : 0;
      costoAcum   += cRub;
      pasos.push({ tipo: 'rub', label: `🧂 Rub/Especias`, kg, costoAcum, cRub });

    } else if (b.tipo === 'adicional') {
      const pAdic = mpAdic ? parseFloat(mpAdic.precio_kg || 0) : 0;
      const grN   = parseFloat(b.gramos_adicional || 0);
      const cAdic = (grN / 1000) * pAdic * kg;
      costoAcum  += cAdic;
      pasos.push({ tipo: 'adicional', label: `🍋 Adicional`, kg, costoAcum, cAdic });

    } else if (b.tipo === 'merma') {
      if (mermaGrupoBase === null) mermaGrupoBase = kg; // primer merma del grupo → guardar base
      const kgAntes  = kg;
      const pctM     = parseFloat(b.pct_merma || 0) / 100;
      const kgMerma  = Math.min(mermaGrupoBase * pctM, kg); // % sobre base del grupo
      kg = kgAntes - kgMerma;
      let credito = 0;
      if (b.merma_tipo === 2 || b.merma_tipo === 3) {
        credito    = kgMerma * parseFloat(b.precio_merma_kg || 0);
        costoAcum -= credito;
      }
      const mermaLabel = b.merma_tipo === 1
        ? '✂️ Merma'
        : `✂️ ${b.nombre_merma || 'Merma'}`;
      pasos.push({ tipo: 'merma', label: mermaLabel, kg, costoAcum, kgMerma, credito, merma_tipo: b.merma_tipo });

    } else if (b.tipo === 'bifurcacion') {
      const kgHijo   = parseFloat(b.kg_para_hijo || 0);
      const kgPadre  = Math.max(0, kg - kgHijo);
      const costoKg  = kg > 0 ? costoAcum / kg : 0;
      const costoPadre = kgPadre * costoKg;
      const costoHijo  = kgHijo  * costoKg;
      pasos.push({ tipo: 'bifurcacion', label: `🔀 Bifurcación`, kg, costoAcum, kgPadre, kgHijo, costoKg, costoPadre, costoHijo });
      kg        = kgPadre;
      costoAcum = costoPadre;

    } else if (b.tipo === 'horneado') {
      const kgAntes = kg;
      const pctM    = parseFloat(b.pct_merma_horneado || 0) / 100;
      kg = kg * (1 - pctM);
      const mermaKg = kgAntes - kg;
      pasos.push({ tipo: 'horneado', label: `🔥 Merma Horneado`, kg, costoAcum, kgAntes, mermaKg, pctReal: pctM * 100 });
    }
  }

  const costoKgFinal = kg > 0 ? costoAcum / kg : 0;
  return { kg, costoAcum, costoKgFinal, pasos };
}

// ─────────────────────────────────────────────────────────────
// Colores / iconos / etiquetas por tipo de bloque
// ─────────────────────────────────────────────────────────────
const BLOQUE_META = {
  inyeccion:   { color: '#2980b9', icon: '💉', label: 'Inyección de Salmuera' },
  maduracion:  { color: '#27ae60', icon: '🧊', label: 'Maduración' },
  rub:         { color: '#8e44ad', icon: '🧂', label: 'Rub / Especias' },
  adicional:   { color: '#f39c12', icon: '🍋', label: 'Adicional' },
  merma:       { color: '#e74c3c', icon: '✂️', label: 'Merma' },
  horneado:    { color: '#e67e22', icon: '🔥', label: 'Merma Horneado' },
  bifurcacion: { color: '#6c3483', icon: '🔀', label: 'Bifurcación Padre/Hijo' },
};

// ─────────────────────────────────────────────────────────────
// BloquesDinamicosEditor — componente principal
// ─────────────────────────────────────────────────────────────
export function BloquesDinamicosEditor({
  bloques, setBloques,
  bloqueExpandido, setBloqueExpandido,
  modoEdicion,
  // datos del producto
  producto, precioCarne, precioKgSalmuera, costoRubFormula,
  kgRubBase, mpAdic, deshueseConfig,
  // selectores
  formulaciones, rubFormulas, mpsFormula,
  // sync con estados clásicos (para compatibilidad al guardar)
  kgSalBase, pctSalmueraFormula,
  setFormulaSalmueraNombre, setPctInj, setKgSalBase,
  setHorasMad, setMinutosMad, setPctMad, setKgSalidaMad,
  setFormulaRubNombre, setKgRubBase,
  setMpAdicionalId, setGramosAdicional,
  setKgParaHijo, setMargenPadre, setMargenHijo,
  margenPadre, margenHijo,
  // para hijo: tipos de bloque disponibles (sin bifurcacion por defecto si se pasa)
  esBano = false,
  tiposDisponibles,
  // tipos a excluir siempre (ej. ['bifurcacion'] para inmersión/marinados)
  tiposExcluidos,
  // etiqueta del punto de partida (para hijo: "Entrada desde padre")
  labelInicial, iconoInicial, colorInicial,
  // para hijo: margen usa setMargenHijo directamente (ya está en props)
}) {
  const kgIni = parseFloat(kgSalBase) || 2;

  // Cuando la fórmula de salmuera carga su porcentaje, actualizar el bloque automáticamente
  useEffect(() => {
    if (pctSalmueraFormula == null) return;
    setBloques(prev => prev.map(b =>
      b.tipo === 'inyeccion' ? { ...b, pct_inj: pctSalmueraFormula } : b
    ));
    setPctInj(String(pctSalmueraFormula));
  }, [pctSalmueraFormula]);

  const resultado = calcBloques({ bloques, kgIni, precioCarne, precioKgSalmuera, costoRubFormula, kgRubBase: parseFloat(kgRubBase) || 1, mpAdic, esBano });

  const dragIdx    = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  // Buscador de MP para merma tipo 2
  const [mermaBusq,    setMermaBusq]    = useState({});  // { [blockId]: texto }
  const [mermaAbierto, setMermaAbierto] = useState(null); // blockId con dropdown abierto

  function handleDragStart(e, idx) {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== idx) setDragOver(idx);
  }

  function handleDrop(e, idx) {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) { setDragOver(null); return; }
    setBloques(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(idx, 0, item);
      return arr;
    });
    dragIdx.current = null;
    setDragOver(null);
  }

  function handleDragEnd() {
    dragIdx.current = null;
    setDragOver(null);
  }

  function updateBloque(id, campos) {
    setBloques(prev => prev.map(b => b.id === id ? { ...b, ...campos } : b));
  }

  function removeBloque(id) {
    setBloques(prev => prev.filter(b => b.id !== id));
  }

  function addBloque(tipo) {
    const newId = () => Math.random().toString(36).slice(2, 9);
    const templates = {
      inyeccion:   { tipo: 'inyeccion',   activo: true, formula_salmuera: '', pct_inj: 20, kg_sal_base: 2, pct_peso_inj: null },
      maduracion:  { tipo: 'maduracion',  activo: true, horas_mad: 72, minutos_mad: 0, pct_mad: 0, kg_salida_mad: 0 },
      rub:         { tipo: 'rub',         activo: true, formula_rub: '', kg_rub_base: 1 },
      adicional:   { tipo: 'adicional',   activo: true, mp_adicional_id: '', gramos_adicional: 0 },
      merma:       { tipo: 'merma',       activo: true, merma_tipo: 1, pct_merma: 5, precio_merma_kg: 0, nombre_merma: '', mp_merma_id: '' },
      horneado:    { tipo: 'horneado',    activo: true, pct_merma_horneado: 30 },
      bifurcacion: { tipo: 'bifurcacion', activo: true, kg_para_hijo: 0, margen_padre: parseFloat(margenPadre) || 15, margen_hijo: parseFloat(margenHijo) || 15, deshuese_hijo: { pct_res_segunda: 0, pct_puntas: 0, pct_desecho: 0 } },
    };
    setBloques(prev => [...prev, { id: newId(), ...templates[tipo] }]);
  }

  // Estilo base para inputs del editor
  const baseInputStyle = (extra = {}) => ({
    width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 13,
    fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box',
    background: modoEdicion ? 'white' : '#f8f9fa', ...extra,
  });

  return (
    <>
      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#2c3e50)', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: '#f9e79f', fontWeight: 'bold', fontSize: 13 }}>🧩 Flujo dinámico</span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginLeft: 10 }}>
            {bloques.filter(b => b.activo).length} bloques activos · {bloques.length} total
          </span>
        </div>
      </div>

      {/* ── Carne inicial — solo para padre/independiente, el hijo ya lo muestra arriba ── */}
      {!labelInicial && (
        <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12, border: '2px solid #e67e22', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 18 }}>🥩</span>
          <span style={{ fontWeight: 700, color: '#e67e22', flex: 1, fontSize: 13 }}>Carne inicial</span>
          <input
            type="number" min="0.1" step="0.1"
            value={kgSalBase}
            disabled={!modoEdicion}
            onChange={e => setKgSalBase(e.target.value)}
            style={{ width: 80, padding: '7px 10px', borderRadius: 7, border: '2px solid #e67e22', fontSize: 15, fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? 'white' : '#fef9e7' }}
          />
          <span style={{ fontSize: 12, color: '#888' }}>kg</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#27ae60' }}>${precioCarne.toFixed(4)}/kg</span>
        </div>
      )}

      {/* ── Lista de bloques ── */}
      <div style={{ marginBottom: 12 }}>
        {bloques.map((b, idx) => {
          if (tiposExcluidos && tiposExcluidos.includes(b.tipo)) return null;
          const meta = BLOQUE_META[b.tipo] || { color: '#888', icon: '📦', label: b.tipo };
          const isExp = bloqueExpandido === b.id;

          return (
            <div key={b.id}
              draggable={modoEdicion && b.tipo !== 'bifurcacion'}
              onDragStart={e => handleDragStart(e, idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={e => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                background: 'white', borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 8,
                border: dragOver === idx
                  ? '2px solid #2980b9'
                  : b.activo ? `2px solid ${meta.color}30` : '2px solid #eee',
                opacity: dragIdx.current === idx ? 0.4 : b.activo ? 1 : 0.65,
                transition: 'border 0.1s, opacity 0.1s',
              }}>

              {/* Bloque header */}
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setBloqueExpandido(isExp ? null : b.id)}>

                {/* Handle drag — solo en modo edición */}
                {modoEdicion && b.tipo !== 'bifurcacion' && (
                  <span
                    onMouseDown={e => e.stopPropagation()}
                    style={{ cursor: 'grab', color: '#bbb', fontSize: 17, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}
                    title="Arrastrar para reordenar"
                  >⠿</span>
                )}

                {/* Toggle ON/OFF — bifurcación siempre ON, no se puede apagar */}
                <button onClick={e => { e.stopPropagation(); if (modoEdicion && b.tipo !== 'bifurcacion') updateBloque(b.id, { activo: !b.activo }); }}
                  style={{ background: b.activo ? meta.color : '#ccc', color: 'white', border: 'none', borderRadius: 10, padding: '2px 8px', fontSize: 10, cursor: (modoEdicion && b.tipo !== 'bifurcacion') ? 'pointer' : 'default', fontWeight: 'bold', minWidth: 34 }}>
                  {b.activo ? 'ON' : 'OFF'}
                </button>

                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <span style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 13, flex: 1 }}>{meta.label}</span>

                {/* Resumen rápido */}
                {b.activo && b.tipo === 'inyeccion' && b.pct_inj > 0 && (
                  <span style={{ fontSize: 11, color: meta.color, background: `${meta.color}15`, padding: '2px 8px', borderRadius: 6 }}>{b.pct_inj}%</span>
                )}
                {b.activo && b.tipo === 'maduracion' && b.horas_mad > 0 && (
                  <span style={{ fontSize: 11, color: meta.color, background: `${meta.color}15`, padding: '2px 8px', borderRadius: 6 }}>{b.horas_mad}h</span>
                )}
                {b.activo && b.tipo === 'merma' && (
                  <span style={{ fontSize: 11, color: meta.color, background: `${meta.color}15`, padding: '2px 8px', borderRadius: 6 }}>Tipo {b.merma_tipo} · {b.pct_merma}%</span>
                )}
                {b.activo && b.tipo === 'horneado' && b.pct_merma_horneado > 0 && (
                  <span style={{ fontSize: 11, color: meta.color, background: `${meta.color}15`, padding: '2px 8px', borderRadius: 6 }}>{b.pct_merma_horneado}%</span>
                )}

                {/* Eliminar — solo en modo edición */}
                {modoEdicion && b.tipo !== 'bifurcacion' && b.tipo !== 'maduracion' && b.tipo !== 'inyeccion' && (
                  <button onClick={e => { e.stopPropagation(); removeBloque(b.id); }}
                    style={{ background: '#fdf2f2', border: 'none', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#e74c3c' }}>✕</button>
                )}

                <span style={{ fontSize: 13, color: '#bbb' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Config expandida */}
              {isExp && (
                <div style={{ borderTop: `2px solid ${meta.color}20`, padding: '12px 14px', background: '#fafbfc' }}>

                  {/* ── INYECCIÓN ── */}
                  {b.tipo === 'inyeccion' && (() => {
                    // kg que llegan a este bloque (del paso anterior en el flujo)
                    const activeIdx = bloques.slice(0, idx).filter(b2 => b2.activo).length;
                    const kgAntes   = activeIdx === 0 ? kgIni : (resultado.pasos[activeIdx - 1]?.kg || kgIni);
                    const kgSal     = kgAntes * ((b.pct_inj || 0) / 100);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>Fórmula de salmuera</label>
                          <select value={b.formula_salmuera} disabled={!modoEdicion}
                            onChange={e => { updateBloque(b.id, { formula_salmuera: e.target.value }); setFormulaSalmueraNombre(e.target.value); }}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${meta.color}`, fontSize: 13, background: modoEdicion ? 'white' : '#f8f9fa', boxSizing: 'border-box' }}>
                            <option value="">— seleccionar salmuera —</option>
                            {formulaciones.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        {/* % inyección — viene automático de la fórmula de salmuera */}
                        <div style={{ background: `${meta.color}10`, borderRadius: 7, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: meta.color, fontWeight: 600 }}>% Inyección</span>
                          {(b.pct_inj || 0) > 0
                            ? <span style={{ fontSize: 20, fontWeight: 900, color: meta.color }}>{b.pct_inj}%</span>
                            : <span style={{ fontSize: 11, color: '#aaa' }}>— selecciona salmuera —</span>
                          }
                        </div>
                        {(b.pct_inj || 0) > 0 && (
                          <div style={{ fontSize: 11, color: meta.color, background: `${meta.color}10`, padding: '8px 12px', borderRadius: 6 }}>
                            <div>
                              {kgAntes.toFixed(3)} kg × {b.pct_inj}% = <strong>{kgSal.toFixed(3)} kg salmuera</strong>
                              {precioKgSalmuera > 0 && ` · $${(kgSal * precioKgSalmuera).toFixed(4)}`}
                            </div>
                            <div style={{ marginTop: 4, fontWeight: 700, color: meta.color }}>
                              {(() => {
                                const pctPesoP = b.pct_peso_inj != null ? (parseFloat(b.pct_peso_inj) || 0) / 100 : (esBano ? 0 : 1);
                                const kgPreview = kgAntes + kgSal * pctPesoP;
                                return <>→ <strong style={{ fontSize: 13 }}>{kgPreview.toFixed(3)} kg</strong> total después de inyección</>;
                              })()}
                            </div>
                          </div>
                        )}
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>
                            % que agrega peso
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={b.pct_peso_inj ?? ''}
                            disabled={!modoEdicion}
                            placeholder="vacío = auto"
                            onChange={e => {
                              const val = e.target.value.replace(',', '.');
                              updateBloque(b.id, { pct_peso_inj: val === '' ? null : parseFloat(val) || 0 });
                            }}
                            style={baseInputStyle({ border: `1.5px solid ${meta.color}` })}
                          />
                          <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
                            % de la salmuera que entra a la carne (vacío = 0% INMERSIÓN / 100% CORTES)
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── MADURACIÓN ── */}
                  {b.tipo === 'maduracion' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>Horas</label>
                          <input type="number" min="0" step="1" value={b.horas_mad}
                            style={baseInputStyle({ border: `1.5px solid ${meta.color}` })} disabled={!modoEdicion}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; updateBloque(b.id, { horas_mad: v }); setHorasMad(String(v)); }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>Minutos</label>
                          <input type="number" min="0" max="59" step="1" value={b.minutos_mad}
                            style={baseInputStyle({ border: `1.5px solid ${meta.color}` })} disabled={!modoEdicion}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; updateBloque(b.id, { minutos_mad: v }); setMinutosMad(String(v)); }} />
                        </div>
                      </div>
                      {(() => {
                        // kg que entran a este bloque de maduración
                        const activeIdx  = bloques.slice(0, idx).filter(b2 => b2.activo).length;
                        const kgEntrada  = activeIdx === 0 ? kgIni : (resultado.pasos[activeIdx - 1]?.kg || kgIni);
                        const kgSalidaB  = parseFloat(b.kg_salida_mad || 0);
                        const mermaKg    = kgSalidaB > 0 ? kgEntrada - kgSalidaB : 0;
                        const pctMerma   = kgEntrada > 0 && kgSalidaB > 0 ? (mermaKg / kgEntrada * 100) : null;
                        return (
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#e74c3c', display: 'block', marginBottom: 4 }}>
                              kg salida maduración
                              {kgEntrada > 0 && (
                                <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
                                  entrada: {kgEntrada.toFixed(3)} kg
                                </span>
                              )}
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input type="text" inputMode="decimal" value={b.kg_salida_mad || ''} placeholder="ej: 1.800"
                                style={baseInputStyle({ border: '1.5px solid #e74c3c', textAlign: 'left' })} disabled={!modoEdicion}
                                onChange={e => { const raw = e.target.value.replace(',', '.'); updateBloque(b.id, { kg_salida_mad: raw }); setKgSalidaMad(raw); }}
                                onBlur={e => { const v = parseFloat(e.target.value.replace(',', '.')) || 0; updateBloque(b.id, { kg_salida_mad: v }); setKgSalidaMad(String(v)); }} />
                              {pctMerma !== null && (
                                <div style={{ background: '#fdf2f2', border: '1.5px solid #e74c3c', borderRadius: 7, padding: '6px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: 10, color: '#888' }}>merma</div>
                                  <div style={{ fontSize: 14, fontWeight: 900, color: '#e74c3c' }}>{pctMerma.toFixed(1)}%</div>
                                  <div style={{ fontSize: 10, color: '#aaa' }}>−{mermaKg.toFixed(3)} kg</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── RUB ── */}
                  {b.tipo === 'rub' && (() => {
                    const activeIdx  = bloques.slice(0, idx).filter(b2 => b2.activo).length;
                    const kgActual   = activeIdx === 0 ? kgIni : (resultado.pasos[activeIdx - 1]?.kg || kgIni);
                    const kgBase     = parseFloat(b.kg_rub_base) || 1;
                    const costoKgRub = kgBase > 0 ? costoRubFormula / kgBase : 0;
                    const costoTotal = costoKgRub * kgActual;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>Fórmula de rub</label>
                          <select value={b.formula_rub} disabled={!modoEdicion}
                            onChange={e => { updateBloque(b.id, { formula_rub: e.target.value }); setFormulaRubNombre(e.target.value); }}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${meta.color}`, fontSize: 13, background: modoEdicion ? 'white' : '#f8f9fa', boxSizing: 'border-box' }}>
                            <option value="">— sin rub —</option>
                            {rubFormulas.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>
                            Fórmula base para
                            <span style={{ fontWeight: 400, color: '#aaa', marginLeft: 6 }}>
                              (la fórmula está calculada para cuántos kg)
                            </span>
                          </label>
                          <input type="number" min="0.1" step="0.1" value={b.kg_rub_base}
                            style={baseInputStyle({ border: `1.5px solid ${meta.color}` })} disabled={!modoEdicion}
                            onChange={e => { const v = parseFloat(e.target.value) || 1; updateBloque(b.id, { kg_rub_base: v }); setKgRubBase(String(v)); }} />
                        </div>
                        {costoRubFormula > 0 && (
                          <div style={{ background: `${meta.color}10`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 11, color: meta.color, marginBottom: 6 }}>
                              ${costoRubFormula.toFixed(4)} fórmula ÷ {kgBase} kg base = ${costoKgRub.toFixed(4)}/kg
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <div style={{ background: 'white', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>kg en proceso ahora</div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: meta.color }}>{kgActual.toFixed(3)} kg</div>
                              </div>
                              <div style={{ background: 'white', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>costo total rub</div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: meta.color }}>${costoTotal.toFixed(4)}</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── ADICIONAL ── */}
                  {b.tipo === 'adicional' && (() => {
                    const activeIdx  = bloques.slice(0, idx).filter(b2 => b2.activo).length;
                    const kgActual   = activeIdx === 0 ? kgIni : (resultado.pasos[activeIdx - 1]?.kg || kgIni);
                    const mpSel      = b.mp_adicional_id ? (mpsFormula || []).find(m => String(m.id) === String(b.mp_adicional_id)) : null;
                    const precioMp   = parseFloat(mpSel?.precio_kg || 0);
                    const grN        = parseFloat(b.gramos_adicional || 0);
                    const costoTotal = (grN / 1000) * precioMp * kgActual;
                    return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>Materia prima adicional</label>
                        <select value={b.mp_adicional_id} disabled={!modoEdicion}
                          onChange={e => { updateBloque(b.id, { mp_adicional_id: e.target.value }); setMpAdicionalId(e.target.value); }}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${meta.color}`, fontSize: 13, background: modoEdicion ? 'white' : '#f8f9fa', boxSizing: 'border-box' }}>
                          <option value="">— sin adicional —</option>
                          {(mpsFormula || []).filter(m => {
                            const cat = (m.categoria || '').toUpperCase();
                            return !cat.includes('EMPAQUE') && !cat.includes('ETIQUETA') && !cat.includes('SALMUERA') && !cat.includes('FUNDA');
                          }).map(m => <option key={m.id} value={String(m.id)}>{m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/kg</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>Gramos por kg en proceso</label>
                        <input type="number" min="0" step="1" value={b.gramos_adicional}
                          style={baseInputStyle({ border: `1.5px solid ${meta.color}` })} disabled={!modoEdicion}
                          onChange={e => { const v = parseFloat(e.target.value) || 0; updateBloque(b.id, { gramos_adicional: v }); setGramosAdicional(String(v)); }} />
                      </div>
                      {mpSel && grN > 0 && (
                        <div style={{ background: `${meta.color}10`, borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11, color: meta.color, marginBottom: 6 }}>
                            {grN}g/kg × ${precioMp.toFixed(4)}/kg = ${(grN / 1000 * precioMp).toFixed(4)}/kg proceso
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ background: 'white', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>kg en proceso ahora</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: meta.color }}>{kgActual.toFixed(3)} kg</div>
                            </div>
                            <div style={{ background: 'white', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>costo total adicional</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: meta.color }}>${costoTotal.toFixed(4)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* ── MERMA ── */}
                  {b.tipo === 'merma' && (() => {
                    const activeBlocksBefore = bloques.slice(0, idx).filter(b2 => b2.activo);
                    const activeIdx = activeBlocksBefore.length;
                    // Buscar el inicio del grupo de mermas consecutivas (mismo base que calcBloques)
                    let grupoStartIdx = activeIdx;
                    for (let j = activeBlocksBefore.length - 1; j >= 0; j--) {
                      if (activeBlocksBefore[j].tipo === 'merma') { grupoStartIdx = j; } else break;
                    }
                    const kgActual  = grupoStartIdx === 0 ? kgIni : (resultado.pasos[grupoStartIdx - 1]?.kg || kgIni);
                    const pctM      = parseFloat(b.pct_merma || 0) / 100;
                    const kgMerma   = kgActual * pctM;
                    const precioRec = parseFloat(b.precio_merma_kg || 0);
                    const credito   = kgMerma * precioRec;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Tipo selector */}
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>Tipo de merma</label>
                          <select value={b.merma_tipo} disabled={!modoEdicion}
                            onChange={e => updateBloque(b.id, { merma_tipo: parseInt(e.target.value) })}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1.5px solid ${meta.color}`, fontSize: 13, background: modoEdicion ? 'white' : '#f8f9fa', boxSizing: 'border-box' }}>
                            <option value={1}>Tipo 1 — Descarte total (costo se absorbe)</option>
                            <option value={2}>Tipo 2 — Subproducto con valor (crédito + agrega a inventario)</option>
                          </select>
                        </div>

                        {/* % merma — todos los tipos */}
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>
                            % merma
                            {kgActual > 0 && (
                              <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
                                sobre {kgActual.toFixed(3)} kg en proceso
                              </span>
                            )}
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="number" min="0" max="99" step="0.1" value={b.pct_merma}
                              style={baseInputStyle({ border: `1.5px solid ${meta.color}` })} disabled={!modoEdicion}
                              onChange={e => updateBloque(b.id, { pct_merma: parseFloat(e.target.value) || 0 })} />
                            {kgMerma > 0 && (
                              <div style={{ background: '#fdf2f2', border: `1.5px solid ${meta.color}`, borderRadius: 7, padding: '6px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div style={{ fontSize: 10, color: '#888' }}>kg merma</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: meta.color }}>{kgMerma.toFixed(3)} kg</div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tipo 1: solo info */}
                        {b.merma_tipo === 1 && (
                          <div style={{ fontSize: 11, color: '#888', background: '#f8f9fa', padding: '8px 12px', borderRadius: 6 }}>
                            El peso baja, el costo se absorbe → sube el costo/kg del producto restante.
                          </div>
                        )}

                        {/* Tipo 2: buscar en MP + precio auto-llenado */}
                        {b.merma_tipo === 2 && (
                          <>
                            <div style={{ position: 'relative' }}>
                              <label style={{ fontSize: 11, fontWeight: 600, color: '#27ae60', display: 'block', marginBottom: 4 }}>Subproducto (buscar en MP)</label>
                              <input
                                type="text"
                                value={mermaAbierto === b.id ? (mermaBusq[b.id] ?? b.nombre_merma ?? '') : (b.nombre_merma || '')}
                                placeholder="Buscar materia prima…"
                                disabled={!modoEdicion}
                                style={baseInputStyle({ border: '1.5px solid #27ae60', textAlign: 'left' })}
                                onChange={e => {
                                  setMermaBusq(prev => ({ ...prev, [b.id]: e.target.value }));
                                  setMermaAbierto(b.id);
                                }}
                                onFocus={() => {
                                  setMermaBusq(prev => ({ ...prev, [b.id]: b.nombre_merma || '' }));
                                  setMermaAbierto(b.id);
                                }}
                                onBlur={() => setTimeout(() => setMermaAbierto(null), 150)}
                              />
                              {mermaAbierto === b.id && modoEdicion && (() => {
                                const q = (mermaBusq[b.id] || '').toLowerCase();
                                const filtradas = (mpsFormula || []).filter(m => {
                                  const n = (m.nombre_producto || m.nombre || '').toLowerCase();
                                  return !q || n.includes(q);
                                }).slice(0, 20);
                                return filtradas.length === 0 ? null : (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99, background: 'white', border: '1.5px solid #27ae60', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                                    {filtradas.map(m => {
                                      const nombre = m.nombre_producto || m.nombre || '';
                                      const precio = parseFloat(m.precio_kg || 0);
                                      return (
                                        <div key={m.id}
                                          onMouseDown={() => {
                                            updateBloque(b.id, { nombre_merma: nombre, precio_merma_kg: precio });
                                            setMermaAbierto(null);
                                            setMermaBusq(prev => ({ ...prev, [b.id]: '' }));
                                          }}
                                          style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid #f0f0f0' }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#eafaf1'}
                                          onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                                          <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{nombre}</span>
                                          <span style={{ color: '#27ae60', fontWeight: 700 }}>${precio.toFixed(4)}/kg</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 600, color: '#27ae60', display: 'block', marginBottom: 4 }}>Precio recuperable ($/kg)</label>
                              <input type="number" min="0" step="0.01" value={b.precio_merma_kg}
                                style={baseInputStyle({ border: '1.5px solid #27ae60' })} disabled={!modoEdicion}
                                onChange={e => updateBloque(b.id, { precio_merma_kg: parseFloat(e.target.value) || 0 })} />
                            </div>
                            {kgMerma > 0 && precioRec > 0 && (
                              <div style={{ background: '#eafaf1', border: '1.5px solid #27ae60', borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ fontSize: 11, color: '#27ae60', marginBottom: 6 }}>
                                  {kgMerma.toFixed(3)} kg × ${precioRec.toFixed(4)}/kg
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 600 }}>Crédito recuperado</span>
                                  <span style={{ fontSize: 20, fontWeight: 900, color: '#27ae60' }}>${credito.toFixed(4)}</span>
                                </div>
                              </div>
                            )}
                          </>
                        )}

                      </div>
                    );
                  })()}

                  {/* ── HORNEADO ── */}
                  {b.tipo === 'horneado' && (() => {
                    const activeIdx = bloques.slice(0, idx).filter(b2 => b2.activo).length;
                    const kgAntes   = activeIdx === 0 ? kgIni : (resultado.pasos[activeIdx - 1]?.kg || kgIni);
                    const pctM      = parseFloat(b.pct_merma_horneado || 0) / 100;
                    const kgMerma   = kgAntes * pctM;
                    const kgSalida  = kgAntes - kgMerma;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>
                            % merma post-horno
                            {kgAntes > 0 && (
                              <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
                                sobre {kgAntes.toFixed(3)} kg en proceso
                              </span>
                            )}
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="number" min="0" max="99" step="0.1" value={b.pct_merma_horneado}
                              style={baseInputStyle({ border: `1.5px solid ${meta.color}` })} disabled={!modoEdicion}
                              onChange={e => updateBloque(b.id, { pct_merma_horneado: parseFloat(e.target.value) || 0 })} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>%</span>
                            {kgMerma > 0 && (
                              <div style={{ background: '#fef3e2', border: `1.5px solid ${meta.color}`, borderRadius: 7, padding: '6px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div style={{ fontSize: 10, color: '#888' }}>kg merma</div>
                                <div style={{ fontSize: 14, fontWeight: 900, color: meta.color }}>{kgMerma.toFixed(3)} kg</div>
                              </div>
                            )}
                          </div>
                        </div>
                        {kgMerma > 0 && (
                          <div style={{ background: '#fef3e2', border: `1.5px solid ${meta.color}`, borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 11, color: meta.color, marginBottom: 4 }}>
                              {kgAntes.toFixed(3)} kg → pierde {kgMerma.toFixed(3)} kg → quedan <strong>{kgSalida.toFixed(3)} kg</strong>
                            </div>
                            <div style={{ fontSize: 10, color: '#888' }}>
                              El costo se absorbe → sube el costo/kg del producto restante.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── BIFURCACIÓN ── */}
                  {b.tipo === 'bifurcacion' && (() => {
                    const activeIdx = bloques.slice(0, idx).filter(b2 => b2.activo).length;
                    const kgAntes   = activeIdx === 0 ? kgIni : (resultado.pasos[activeIdx - 1]?.kg || kgIni);
                    const kgHijoV   = parseFloat(b.kg_para_hijo || 0);
                    const kgPadreV  = Math.max(0, kgAntes - kgHijoV);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>
                            kg que van al Hijo ({deshueseConfig?.corte_hijo || 'producto hijo'})
                            <span style={{ fontWeight: 400, color: '#aaa', marginLeft: 8 }}>disponibles: {kgAntes.toFixed(3)} kg</span>
                          </label>
                          <input type="number" min="0" step="0.001" value={b.kg_para_hijo} placeholder="ej: 1.000"
                            style={baseInputStyle({ border: `1.5px solid ${meta.color}`, textAlign: 'left' })} disabled={!modoEdicion}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; updateBloque(b.id, { kg_para_hijo: v }); setKgParaHijo(String(v)); }} />
                        </div>
                        {kgHijoV > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ background: '#eaf4fd', borderRadius: 7, padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#1a3a5c', marginBottom: 2 }}>👑 Padre</div>
                              <div style={{ fontSize: 18, fontWeight: 900, color: '#1a3a5c' }}>{kgPadreV.toFixed(3)} kg</div>
                            </div>
                            <div style={{ background: '#f3e8fd', borderRadius: 7, padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#6c3483', marginBottom: 2 }}>🔀 Hijo</div>
                              <div style={{ fontSize: 18, fontWeight: 900, color: '#6c3483' }}>{kgHijoV.toFixed(3)} kg</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Agregar bloque ── */}
      {modoEdicion && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600 }}>+ Agregar bloque:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(BLOQUE_META)
              .filter(([tipo]) => !tiposDisponibles || tiposDisponibles.includes(tipo))
              .filter(([tipo]) => !tiposExcluidos || !tiposExcluidos.includes(tipo))
              .filter(([tipo]) => tipo !== 'bifurcacion' || !bloques.some(b => b.tipo === 'bifurcacion'))
              .filter(([tipo]) => tipo !== 'maduracion' || !bloques.some(b => b.tipo === 'maduracion'))
              .filter(([tipo]) => tipo !== 'inyeccion' || !bloques.some(b => b.tipo === 'inyeccion'))
              .map(([tipo, meta]) => (
                <button key={tipo} onClick={() => addBloque(tipo)}
                  style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px dashed ${meta.color}60`, background: `${meta.color}08`, cursor: 'pointer', fontSize: 11, color: meta.color, fontWeight: 600 }}>
                  {meta.icon} {meta.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── Resultado paso a paso ── */}
      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
        <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#34495e)', padding: '10px 16px' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📊 Flujo de costo — paso a paso</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          {/* Punto de partida — solo para padre (el hijo ya muestra el flujo del padre arriba) */}
          {!labelInicial && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#fef9e7', borderRadius: 7, marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#e67e22', fontWeight: 600 }}>🥩 {kgSalBase} kg carne</span>
              <span style={{ fontWeight: 700, color: '#27ae60' }}>${(parseFloat(kgSalBase) * precioCarne).toFixed(4)} · ${precioCarne.toFixed(4)}/kg</span>
            </div>
          )}

          {resultado.pasos.length === 0 && (
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, padding: '16px' }}>
              Activa al menos un bloque para ver el cálculo paso a paso
            </div>
          )}

          {resultado.pasos.map((p, i) => {
            const costoKg = p.kg > 0 ? p.costoAcum / p.kg : 0;
            let detalle = '';
            if (p.tipo === 'inyeccion')   detalle = `+${p.kgSal.toFixed(3)} kg salmuera · +$${p.cSal.toFixed(4)}`;
            if (p.tipo === 'maduracion')  detalle = `−${p.mermaKg.toFixed(3)} kg merma (${p.pctReal.toFixed(1)}%)`;
            if (p.tipo === 'rub')         detalle = `+$${p.cRub.toFixed(4)} costo rub`;
            if (p.tipo === 'adicional')   detalle = `+$${p.cAdic.toFixed(4)} costo adicional`;
            if (p.tipo === 'merma')       detalle = `−${p.kgMerma.toFixed(3)} kg${p.credito > 0 ? ` · −$${p.credito.toFixed(4)} crédito` : ''}`;
            if (p.tipo === 'horneado')    detalle = `−${p.mermaKg.toFixed(3)} kg merma (${p.pctReal.toFixed(1)}%)`;
            if (p.tipo === 'bifurcacion') detalle = `Padre ${p.kgPadre.toFixed(3)} kg · Hijo ${p.kgHijo.toFixed(3)} kg`;

            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', marginBottom: 4, background: i % 2 === 0 ? '#f8f9fa' : 'white', borderRadius: 7, fontSize: 12, borderLeft: `3px solid ${BLOQUE_META[p.tipo]?.color || '#888'}` }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{p.label}</div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{detalle}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#1a1a2e' }}>{p.kg.toFixed(3)} kg</div>
                  <div style={{ fontSize: 10, color: '#555' }}>${costoKg.toFixed(4)}/kg</div>
                </div>
              </div>
            );
          })}

          {/* Resultado final */}
          {resultado.pasos.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', borderRadius: 10, padding: '14px 16px', marginTop: 10 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Costo final — {producto.nombre}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#f9e79f' }}>${resultado.costoKgFinal.toFixed(4)}/kg</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                {resultado.kg.toFixed(3)} kg finales · ${resultado.costoAcum.toFixed(4)} costo total
              </div>
              {/* Margen de ganancia — siempre visible y editable */}
              {(() => {
                const bifB = bloques.find(b => b.tipo === 'bifurcacion' && b.activo);
                const mgVal = bifB ? String(bifB.margen_padre ?? margenPadre) : margenPadre;
                const mg    = parseFloat(mgVal) || 0;
                const pvp   = mg > 0 && mg < 100 && resultado.costoKgFinal > 0
                  ? resultado.costoKgFinal / (1 - mg / 100) : 0;
                return (
                  <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1 }}>Margen de ganancia</span>
                      <input
                        type="number" min="0" max="99" step="1"
                        value={mgVal}
                        disabled={!modoEdicion}
                        onChange={e => {
                          const v = e.target.value;
                          if (bifB) updateBloque(bifB.id, { margen_padre: parseFloat(v) || 0 });
                          setMargenPadre(v);
                        }}
                        style={{ width: 60, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)', color: 'white' }}
                      />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>%</span>
                    </div>
                    {pvp > 0 && (
                      <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                        Precio de venta → <strong style={{ color: '#a9dfbf', fontSize: 16 }}>${pvp.toFixed(4)}/kg</strong>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
