# Wizard Producción Dinámica CORTES — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear `WizardProduccionDinamica.js` que guía al operario paso a paso según `config.bloques` de `vista_horneado_config`, e integrarlo en `TabMaduracion.js` con 2 puntos de entrada (Momento 1 y Momento 2).

**Architecture:** Un solo componente autocontenido `WizardProduccionDinamica.js` recibe los bloques del config y construye la secuencia de pasos en tiempo de render. `TabMaduracion.js` lo monta como overlay modal, con el trigger de Momento 1 en el botón "Nueva producción" y el trigger de Momento 2 al terminar el pesaje, solo cuando `config.bloques` está presente.

**Tech Stack:** React 18, Supabase JS v2, inline styles (patrón existente en TabMaduracion.js).

---

## File Map

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| CREATE | `src/components/produccion/WizardProduccionDinamica.js` | Wizard completo: pasos, UI por bloque, writes a Supabase |
| MODIFY | `src/components/produccion/TabMaduracion.js` | 2 puntos de entrada + render del modal wizard |

---

## Task 1: Migración SQL — columna `bloques_resultado`

**Files:**
- SQL a ejecutar en Supabase Dashboard → SQL Editor

- [ ] **Step 1: Ejecutar migración**

En Supabase Dashboard → SQL Editor, ejecutar:

```sql
ALTER TABLE lotes_maduracion
  ADD COLUMN IF NOT EXISTS bloques_resultado JSONB;

COMMENT ON COLUMN lotes_maduracion.bloques_resultado IS
  'Estado del wizard dinámico CORTES. momento: momento1_completado | completado';
```

- [ ] **Step 2: Verificar**

En SQL Editor:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'lotes_maduracion' AND column_name = 'bloques_resultado';
```
Expected: 1 row con `data_type = jsonb`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: SQL migration — bloques_resultado en lotes_maduracion"
```

---

## Task 2: Crear WizardProduccionDinamica.js — esqueleto y progress indicator

**Files:**
- Create: `src/components/produccion/WizardProduccionDinamica.js`

- [ ] **Step 1: Crear el archivo con props, estado y función buildPasos**

```javascript
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
  modo,           // 'momento1' | 'momento2'
  bloques,        // config.bloques del padre
  bloquesHijo,    // config.bloques_hijo
  cfg,            // config completo de vista_horneado_config
  lote,           // lote existente (para momento2) | null (para momento1)
  kgInicial,      // kg de entrada al wizard
  precioCarne,    // $/kg de la carne
  currentUser,
  mpsFormula,     // array de materias_primas para lookups
  onComplete,     // callback al terminar
  onCancel,
}) {
  const [pasoIdx,    setPasoIdx]    = useState(0);
  const [kgActual,   setKgActual]   = useState(parseFloat(kgInicial) || 0);
  const [costoAcum,  setCostoAcum]  = useState((parseFloat(precioCarne) || 0) * (parseFloat(kgInicial) || 0));
  const [resultados, setResultados] = useState([]);
  const [rama,       setRama]       = useState('padre');
  const [kgPadreF,   setKgPadreF]   = useState(null);
  const [kgHijoF,    setKgHijoF]    = useState(null);
  const [stockIdPadre, setStockIdPadre] = useState(null);
  const [inputKg,    setInputKg]    = useState('');
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');

  const pasos = useMemo(
    () => buildPasos({ modo, rama, bloques, bloquesHijo }),
    [modo, rama, bloques, bloquesHijo]
  );

  const pasoActual = pasos[pasoIdx] || null;

  // ── Progress indicator ──────────────────────────────────────────────
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

    let globalIdx = 0;
    if (modo === 'momento2' && rama === 'hijo') {
      globalIdx = pasosPadre.length + pasoIdx;
    } else {
      globalIdx = (modo === 'momento1' ? 0 : 0) + pasoIdx;
    }

    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, padding: '10px 0', borderBottom: '1px solid #e8e8e8' }}>
        {allPasos.map((p, i) => {
          const esActual = i === globalIdx;
          const completado = i < globalIdx;
          const esSep = modo === 'momento2' && i === pasosPadre.length && pasosHijoInd.length > 0;
          return (
            <React.Fragment key={p.id || i}>
              {esSep && <span style={{ color: '#ccc', alignSelf: 'center', fontSize: 11 }}>│</span>}
              <div style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: completado ? '#27ae60' : esActual ? '#2980b9' : '#f0f2f5',
                color: completado || esActual ? 'white' : '#888',
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

        {error && <div style={{ background: '#fdf2f2', border: '1.5px solid #e74c3c', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e74c3c', marginBottom: 12 }}>{error}</div>}

        {/* Contenido del paso actual — se rellena en Tasks 3 y 4 */}
        {pasoActual && renderPaso(pasoActual)}
        {!pasoActual && <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>Sin pasos activos</div>}

      </div>
    </div>
  );

  // renderPaso se define en tasks 3 y 4 (placeholder por ahora)
  function renderPaso(b) {
    return <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>Bloque: {b.tipo}</div>;
  }
}
```

- [ ] **Step 2: Verificar que el archivo existe**

```bash
ls src/components/produccion/WizardProduccionDinamica.js
```

- [ ] **Step 3: Commit**

```bash
git add src/components/produccion/WizardProduccionDinamica.js
git commit -m "feat: WizardProduccionDinamica — esqueleto y progress indicator"
```

---

## Task 3: Funciones de escritura a Supabase (stock writes)

**Files:**
- Modify: `src/components/produccion/WizardProduccionDinamica.js`

Agregar estas helpers DENTRO del componente (antes del `return`), para reutilizarlas en las confirmaciones de cada bloque.

- [ ] **Step 1: Agregar helpers de stock**

Reemplazar en WizardProduccionDinamica.js la función `renderPaso` placeholder y el cierre del return con el siguiente bloque completo (helpers + renderPaso placeholder):

```javascript
  // ── Helpers de stock ─────────────────────────────────────────────────

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
    // Crear MP si no existe
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
    // Inventario
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

  function renderPaso(b) {
    return <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>Bloque: {b.tipo}</div>;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/produccion/WizardProduccionDinamica.js
git commit -m "feat: WizardProduccionDinamica — helpers stock writes"
```

---

## Task 4: Renderizado de bloques — merma y inyección

**Files:**
- Modify: `src/components/produccion/WizardProduccionDinamica.js`

Reemplazar la función `renderPaso` con la versión completa. Las funciones de confirmación (`confirmarMerma`, `confirmarInyeccion`) van dentro del componente junto a los helpers de stock.

- [ ] **Step 1: Agregar confirmarMerma y confirmarInyeccion**

Antes del `return` del componente, añadir estas funciones (después de los helpers de stock):

```javascript
  // ── Confirmaciones por tipo de bloque ─────────────────────────────────

  async function confirmarMerma(b) {
    setGuardando(true); setError('');
    try {
      const loteRef = lote?.lote_id || 'NUEVO';
      let kgSalida = kgActual;
      let nuevoCosto = costoAcum;
      let kgRealInput = parseFloat(inputKg) || 0;

      if (b.merma_tipo === 1) {
        // Auto — sin input
        kgSalida = kgActual * (1 - (parseFloat(b.pct_merma) || 0) / 100);
      } else if (b.merma_tipo === 2) {
        // Valor recuperable — operario ingresó kg
        if (kgRealInput <= 0) { setError('Ingresa los kg reales obtenidos'); setGuardando(false); return; }
        kgSalida  = kgActual - kgRealInput;
        const credito = kgRealInput * (parseFloat(b.precio_merma_kg) || 0);
        nuevoCosto = costoAcum - credito;
      } else if (b.merma_tipo === 3) {
        // Nuevo producto — operario ingresó kg, va a inventario
        if (kgRealInput <= 0) { setError('Ingresa los kg reales obtenidos'); setGuardando(false); return; }
        kgSalida  = kgActual - kgRealInput;
        const credito = kgRealInput * (parseFloat(b.precio_merma_kg) || 0);
        nuevoCosto = costoAcum - credito;
        const mpMerma = b.mp_merma_id
          ? mpsFormula.find(m => String(m.id) === String(b.mp_merma_id))
          : null;
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
      const formulaSal  = b.formula_salmuera || cfg?.formula_salmuera || '';
      // Calcular costo salmuera
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
```

- [ ] **Step 2: Actualizar renderPaso para merma e inyeccion**

Reemplazar la función `renderPaso` con:

```javascript
  function renderPaso(b) {
    const costoKgActual = kgActual > 0 ? costoAcum / kgActual : 0;
    const pct = parseFloat(b.pct_merma || b.pct_inj || 0);

    // ── MERMA ──────────────────────────────────────────────────────────
    if (b.tipo === 'merma') {
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

    // ── INYECCIÓN ───────────────────────────────────────────────────────
    if (b.tipo === 'inyeccion') {
      const kgSalmuera = kgActual * ((parseFloat(b.pct_inj || cfg?.pct_inj || 0)) / 100);
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

    return <div style={{ padding: 16, textAlign: 'center', color: '#888' }}>Bloque pendiente: {b.tipo}</div>;
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/produccion/WizardProduccionDinamica.js
git commit -m "feat: WizardProduccionDinamica — merma y inyección"
```

---

## Task 5: Renderizado de bloques — maduración, rub, adicional, bifurcación

**Files:**
- Modify: `src/components/produccion/WizardProduccionDinamica.js`

- [ ] **Step 1: Agregar funciones de confirmación para rub, adicional, maduracion, bifurcacion**

Antes del `return`, después de `confirmarInyeccion`:

```javascript
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
```

- [ ] **Step 2: Agregar casos a renderPaso para maduracion, rub, adicional, bifurcacion**

En la función `renderPaso`, antes del `return` final de fallback, agregar:

```javascript
    // ── MADURACIÓN ──────────────────────────────────────────────────────
    if (b.tipo === 'maduracion') {
      const kgInputN = parseFloat(inputKg) || 0;
      const mermaReal = kgInputN > 0 ? ((kgActual - kgInputN) / kgActual * 100) : null;
      const mermaEsp  = parseFloat(cfg?.pct_mad || 0);
      const diffColor = mermaReal !== null
        ? (Math.abs(mermaReal - mermaEsp) <= 3 ? '#27ae60' : '#e74c3c') : '#888';
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

    // ── RUB ─────────────────────────────────────────────────────────────
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

    // ── ADICIONAL ───────────────────────────────────────────────────────
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

    // ── BIFURCACIÓN ─────────────────────────────────────────────────────
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
                <div style={{ fontSize: 11, color: '#888' }}>${(costoKgActual).toFixed(4)}/kg</div>
              </div>
              <div style={{ background: '#f3e8fd', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#6c3483' }}>🔀 Hijo</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#6c3483' }}>{kgHijoN.toFixed(3)} kg</div>
                <div style={{ fontSize: 11, color: '#888' }}>${(costoKgActual).toFixed(4)}/kg</div>
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
```

- [ ] **Step 3: Commit**

```bash
git add src/components/produccion/WizardProduccionDinamica.js
git commit -m "feat: WizardProduccionDinamica — maduracion, rub, adicional, bifurcacion"
```

---

## Task 6: Lógica de completar Momento 1 y Momento 2

**Files:**
- Modify: `src/components/produccion/WizardProduccionDinamica.js`

- [ ] **Step 1: Agregar useEffect para detectar fin de paso y llamar completar**

Después de las funciones de confirmación, antes del `return`:

```javascript
  // Detectar fin de pasos y avanzar a siguiente fase
  React.useEffect(() => {
    if (pasoIdx < pasos.length) return; // aún hay pasos
    if (pasos.length === 0) return;

    // Todos los pasos del momento/rama completados
    if (modo === 'momento1') {
      completarMomento1();
    } else if (modo === 'momento2') {
      if (rama === 'padre') {
        const hasBifurcacion = pasos.some(p => p.tipo === 'bifurcacion');
        if (hasBifurcacion && bloquesHijo?.filter(b => b.activo).length > 0) {
          // Pasar a rama hijo
          setRama('hijo');
          setKgActual(kgHijoF || 0);
          setCostoAcum((kgHijoF || 0) * ((kgPadreF && kgActual > 0) ? costoAcum / kgActual : 0));
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
      const fechaEntrada = hoy;
      const fechaSalida = new Date(Date.now() + horas * 3600000).toISOString().split('T')[0];
      const bloquesMad2 = bloquesMad || {};
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
        fecha_entrada: fechaEntrada,
        fecha_salida: fechaSalida,
        kg_inicial: parseFloat(kgInicial),
        bloques_resultado: bloquesResultado,
        ...(formulaSal ? { formula_salmuera: formulaSal } : {}),
      }).select('id,lote_id').single();
      if (loteErr) throw loteErr;

      onComplete({ loteId: loteRow.lote_id, lotesMadId: loteRow.id, bloquesResultado });
    } catch (e) { setError('Error al guardar: ' + e.message); setGuardando(false); }
  }

  async function completarMomento2Padre() {
    if (kgActual <= 0) {
      // Sin bifurcación — el padre tiene todos los kg
      await finalizarRamaPadre(kgActual, costoAcum, null);
      return;
    }
    await finalizarRamaPadre(kgActual, costoAcum, null);
  }

  async function finalizarRamaPadre(kgP, costoP, kgH) {
    setGuardando(true); setError('');
    try {
      const costoKgP = kgP > 0 ? costoP / kgP : 0;
      const corteNombrePadre = lote?.corteNombrePadre || cfg?.producto_nombre || '';
      const formulaSal = resultados.find(r => r.tipo === 'inyeccion')?.formulaSalmuera || lote?.formulaSalmuera || '';

      const stockIdP = await guardarStockLote({
        loteId:         lote?.loteId,
        lotesMadId:     lote?.lotesMadId,
        corteNombre:    corteNombrePadre,
        mpId:           lote?.mpPadreId || null,
        kg:             kgP,
        costoTotal:     costoP,
        costoKg:        costoKgP,
        tipoCorte:      'padre',
        parentLoteId:   null,
        formulaSalmuera: formulaSal,
      });
      setStockIdPadre(stockIdP);

      // Actualizar bloques_resultado con datos del padre
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

  async function completarMomento2Hijo() {
    setGuardando(true); setError('');
    try {
      const costoKgH = kgActual > 0 ? costoAcum / kgActual : 0;
      const corteNombreHijo = lote?.corteNombreHijo || '';
      const formulaSal = lote?.formulaSalmuera || '';

      const stockIdH = await guardarStockLote({
        loteId:         lote?.loteId + '-H',
        lotesMadId:     lote?.lotesMadId,
        corteNombre:    corteNombreHijo,
        mpId:           null,
        kg:             kgActual,
        costoTotal:     costoAcum,
        costoKg:        costoKgH,
        tipoCorte:      'hijo',
        parentLoteId:   lote?.loteId,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/produccion/WizardProduccionDinamica.js
git commit -m "feat: WizardProduccionDinamica — completar Momento 1 y Momento 2"
```

---

## Task 7: Integración en TabMaduracion — Momento 1 (trigger y botón)

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

El Momento 1 se activa cuando el operario quiere registrar una nueva producción para un producto CORTES padre que tiene `bloques` configurados.

- [ ] **Step 1: Agregar import y estados**

Al inicio de TabMaduracion.js, después de los otros imports:

```javascript
import WizardProduccionDinamica from './WizardProduccionDinamica';
```

En el bloque de estados del componente, después de la última declaración existente de `useState`:

```javascript
  // ── Wizard dinámico CORTES ──
  const [wizardDinamico, setWizardDinamico] = useState(null);
  // { modo, bloques, bloquesHijo, cfg, lote, kgInicial, precioCarne, mpsFormula }
```

- [ ] **Step 2: Agregar función abrirWizardMomento1**

Después de la función `esCortesPadreLote`, dentro del componente:

```javascript
  function abrirWizardMomento1(corteNombre, kgIni) {
    const cfg = horneadoCfgs.find(hc =>
      (hc.config?._categoria || '').replace(/[ÓÒ]/g,'O').toUpperCase().includes('CORTES') &&
      hc.producto_nombre?.toLowerCase() === corteNombre.toLowerCase()
    );
    if (!cfg?.config?.bloques) return false; // no tiene flujo dinámico → flujo clásico
    setWizardDinamico({
      modo:        'momento1',
      bloques:     cfg.config.bloques,
      bloquesHijo: cfg.config.bloques_hijo || [],
      cfg:         cfg.config,
      lote:        null,
      kgInicial:   kgIni,
      precioCarne: 0, // se leerá de materias_primas en el wizard
    });
    return true;
  }
```

- [ ] **Step 3: Añadir botón en la sección de CORTES padre en el listado**

En la sección donde se renderizan los lotes activos (buscar el botón `💉 Inyectar` o similar en la UI de TabMaduracion), agregar cerca de ese botón:

```javascript
{/* Solo para CORTES padre con bloques dinámicos */}
{esCortesPadreLote(lote, horneadoCfgs) && (() => {
  const cfg = horneadoCfgs.find(hc =>
    (hc.config?._categoria || '').replace(/[ÓÒ]/g,'O').toUpperCase().includes('CORTES') &&
    (hc.config?.formula_salmuera || '').toLowerCase() === (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase()
  );
  if (!cfg?.config?.bloques) return null;
  return (
    <button onClick={() => abrirWizardMomento1(cfg.producto_nombre, 2)}
      style={{ background: '#1a1a2e', color: '#f9e79f', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>
      🧩 Nueva producción dinámica
    </button>
  );
})()}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "feat: TabMaduracion — trigger Momento 1 wizard dinámico CORTES"
```

---

## Task 8: Integración en TabMaduracion — Momento 2 (pesaje → wizard)

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

- [ ] **Step 1: Modificar el bloque de apertura del cortesWizard (línea ~360)**

Localizar el bloque:
```javascript
// ── Si es CORTES Padre, abrir wizard de separación ──
if (esCortesPadre && cortesWizardMpPadreId) {
```

Justo **antes** de ese bloque, insertar:

```javascript
      // ── Si el lote tiene bloques_resultado → Wizard dinámico Momento 2 ──
      const lotesMadActual = await supabase.from('lotes_maduracion')
        .select('bloques_resultado').eq('id', modalPesaje.id).maybeSingle();
      const brMomento1 = lotesMadActual?.data?.bloques_resultado;
      if (brMomento1?.momento === 'momento1_completado' && esCortesPadre) {
        const { data: deshCfgDin } = await supabase
          .from('deshuese_config').select('corte_hijo')
          .ilike('corte_padre', cortesWizardNombre).maybeSingle();
        const cfgDin = horneadoCfgs.find(hc =>
          (hc.config?.formula_salmuera || '').toLowerCase() === formulaSalActual
        );
        setWizardDinamico({
          modo:        'momento2',
          bloques:     cfgDin?.config?.bloques || [],
          bloquesHijo: cfgDin?.config?.bloques_hijo || [],
          cfg:         cfgDin?.config || {},
          lote: {
            loteId:           loteIdGuardado,
            lotesMadId:       modalPesaje.id,
            corteNombrePadre: cortesWizardNombre,
            corteNombreHijo:  deshCfgDin?.corte_hijo || '',
            mpPadreId:        cortesWizardMpPadreId,
            formulaSalmuera:  formulaSalActual,
            bloquesResultado: brMomento1,
          },
          kgInicial:   cortesWizardKgMad,
          precioCarne: cortesWizardKgMad > 0 ? cortesWizardCosto / cortesWizardKgMad : 0,
        });
        setGuardando(false);
        return;
      }
```

- [ ] **Step 2: Render del wizard dinámico como overlay**

Al final del componente, antes del último cierre `}`, agregar el render condicional del wizard:

```javascript
      {/* ── Wizard dinámico CORTES ── */}
      {wizardDinamico && (
        <WizardProduccionDinamica
          modo={wizardDinamico.modo}
          bloques={wizardDinamico.bloques}
          bloquesHijo={wizardDinamico.bloquesHijo}
          cfg={wizardDinamico.cfg}
          lote={wizardDinamico.lote}
          kgInicial={wizardDinamico.kgInicial}
          precioCarne={wizardDinamico.precioCarne}
          currentUser={currentUser}
          mpsFormula={wizardDinamico.mpsFormula || []}
          onComplete={() => { setWizardDinamico(null); cargar(); }}
          onCancel={() => setWizardDinamico(null)}
        />
      )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "feat: TabMaduracion — trigger Momento 2 wizard dinámico CORTES"
```

---

## Task 9: Pestaña Producción — mostrar resumen de bloques_resultado

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

- [ ] **Step 1: Localizar la sección donde se muestra el resumen del último lote en Producción**

Buscar `produccion` en los tabs o donde se muestra el último lote completado. Agregar después del resumen existente:

```javascript
{/* Resumen flujo dinámico si existe */}
{lote?.bloques_resultado?.pasos?.length > 0 && (
  <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginTop: 10 }}>
    <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#34495e)', padding: '8px 14px' }}>
      <span style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>🧩 Flujo dinámico ejecutado</span>
    </div>
    <div style={{ padding: '10px 14px' }}>
      {lote.bloques_resultado.pasos.map((p, i) => {
        const COLORES = { inyeccion: '#2980b9', maduracion: '#27ae60', rub: '#8e44ad', adicional: '#f39c12', merma: '#e74c3c', bifurcacion: '#6c3483' };
        const color = COLORES[p.tipo] || '#888';
        const costoKg = p.kgSalida > 0 ? p.costoAcum / p.kgSalida : 0;
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', marginBottom: 3, background: i % 2 === 0 ? '#f8f9fa' : 'white', borderRadius: 6, fontSize: 11, borderLeft: `3px solid ${color}` }}>
            <span style={{ color: '#333', fontWeight: 600 }}>{p.tipo} {p.merma_tipo ? `T${p.merma_tipo}` : ''}</span>
            <span style={{ color: '#555' }}>{p.kgSalida?.toFixed(3)} kg · ${costoKg.toFixed(4)}/kg</span>
          </div>
        );
      })}
      {lote.bloques_resultado.padre && (
        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ background: '#eaf4fd', borderRadius: 7, padding: '6px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#1a3a5c' }}>👑 Padre final</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#1a3a5c' }}>{lote.bloques_resultado.padre.kg?.toFixed(3)} kg · ${lote.bloques_resultado.padre.costo_kg?.toFixed(4)}/kg</div>
          </div>
          {lote.bloques_resultado.hijo && (
            <div style={{ background: '#f3e8fd', borderRadius: 7, padding: '6px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#6c3483' }}>🔀 Hijo final</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#6c3483' }}>{lote.bloques_resultado.hijo.kg?.toFixed(3)} kg · ${lote.bloques_resultado.hijo.costo_kg?.toFixed(4)}/kg</div>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "feat: TabMaduracion — resumen bloques_resultado en Producción"
```

---

## Task 10: Pestaña Historial — expandir pasos ejecutados

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

- [ ] **Step 1: Localizar el render de cada lote en Historial y añadir sección expandible**

En la sección de historial, dentro de cada fila de lote, añadir:

```javascript
{lote.bloques_resultado?.pasos?.length > 0 && (
  <details style={{ marginTop: 6 }}>
    <summary style={{ fontSize: 11, color: '#8e44ad', cursor: 'pointer', fontWeight: 600 }}>
      🧩 Ver pasos del flujo dinámico ({lote.bloques_resultado.pasos.length} pasos)
    </summary>
    <div style={{ marginTop: 6, paddingLeft: 8 }}>
      {lote.bloques_resultado.pasos.map((p, i) => {
        const costoKg = p.kgSalida > 0 ? p.costoAcum / p.kgSalida : 0;
        return (
          <div key={i} style={{ fontSize: 10, color: '#555', padding: '2px 0', borderBottom: '1px solid #f0f0f0' }}>
            {p.tipo}{p.merma_tipo ? ` T${p.merma_tipo}` : ''}: {p.kgSalida?.toFixed(3)} kg · ${costoKg.toFixed(4)}/kg
          </div>
        );
      })}
    </div>
  </details>
)}
```

- [ ] **Step 2: Commit final**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "feat: TabMaduracion — historial expandible con pasos dinámicos"
```

---

## Self-Review

**Spec coverage:**
- ✅ Wizard lee `config.bloques` en orden — Task 2 (buildPasos)
- ✅ División por `maduracion` como punto de corte — Task 2 (buildPasos)
- ✅ Merma tipo 1/2/3 — Task 4
- ✅ Inyección con deducción de salmuera — Task 4
- ✅ Rub con deducción de ingredientes — Task 5
- ✅ Adicional con deducción de MP — Task 5
- ✅ Maduración con kg reales — Task 5
- ✅ Bifurcación con división proporcional — Task 5
- ✅ Indicador de progreso — Task 2
- ✅ `bloques_resultado` persistido — Task 6
- ✅ Stock padre+hijo a `stock_lotes_inyectados` — Task 6
- ✅ Trigger Momento 1 en TabMaduracion — Task 7
- ✅ Trigger Momento 2 en TabMaduracion — Task 8
- ✅ Pestaña Producción — Task 9
- ✅ Pestaña Historial — Task 10
- ✅ Solo CORTES — verificado en todas las funciones de detección
- ✅ SQL migration — Task 1

**Type consistency:** `guardarStockLote` recibe el mismo objeto en Task 6 `finalizarRamaPadre` y `completarMomento2Hijo`. Función `descontarIngredientesFormula` llamada igual en confirmarInyeccion y confirmarRub. ✅
