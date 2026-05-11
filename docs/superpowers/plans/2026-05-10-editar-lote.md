# Editar Lote Completado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón "✏️ Editar" en TabHistorial que revierte un lote completado internamente y reabre el wizard con todos los valores anteriores pre-llenados.

**Architecture:** `prepararEdicionLote()` recopila datos, revierte el lote, re-crea la infraestructura DB, y retorna params para el wizard. `WizardProduccionDinamica` recibe `valoresPrevios[]` y pre-llena cada input por índice de paso. Al completar el wizard el tab salta automáticamente a Maduración.

**Tech Stack:** React, Supabase (PostgREST), sin framework de tests — verificación manual en localhost:3000.

---

## File Structure

| Archivo | Rol |
|---------|-----|
| `src/utils/prepararEdicionLote.js` | NUEVO: recopila datos → revierte → re-crea DB → retorna params |
| `src/components/produccion/useProduccion.js` | Agrega `horneadoCfgs` al estado y al return |
| `src/Produccion.js` | Pasa `horneadoCfgs` y `onIrAMaduracion` a TabHistorial |
| `src/components/produccion/WizardProduccionDinamica.js` | Props `valoresPrevios` + `valoresPreviosHijo` + useEffect pre-fill |
| `src/components/produccion/TabHistorial.js` | Estado edición + `handleEditarLote` + botón + render wizard |
| `src/components/produccion/TabMaduracion.js` | Placeholder con kg anterior en modal de pesaje |

---

### Task 1: Crear `prepararEdicionLote.js`

**Files:**
- Create: `src/utils/prepararEdicionLote.js`

- [ ] **Step 1: Crear el archivo**

```javascript
// src/utils/prepararEdicionLote.js
import { supabase } from '../supabase';
import { revertirLote } from './revertirLote';

/**
 * Prepara la edición de un lote completado:
 * 1. Recopila todos los datos antes de revertir
 * 2. Revierte el lote (borra inventario, stock, movimientos)
 * 3. Re-crea produccion_inyeccion + cortes + lotes_maduracion
 * 4. Retorna params para abrir el wizard con valores pre-llenados
 *
 * @param {object} lote - fila de lotes_maduracion con produccion_inyeccion y lotes_maduracion_cortes
 * @param {array}  horneadoCfgs - array de vista_horneado_config
 * @returns {object} params para WizardProduccionDinamica
 */
export async function prepararEdicionLote(lote, horneadoCfgs) {
  // ── 1. Recopilar datos ANTES de revertir ──────────────────
  const produccion   = lote.produccion_inyeccion;
  const cortes       = produccion?.produccion_inyeccion_cortes || [];
  const primerCorte  = cortes[0];
  const pasosPrev    = lote.bloques_resultado?.pasos || [];
  const formulaSal   = (produccion?.formula_salmuera || '').toLowerCase();

  // Buscar config del producto en horneadoCfgs
  const cfgEntry = (horneadoCfgs || []).find(hc => {
    const topLevel = (hc.config?.formula_salmuera || '').toLowerCase();
    const inyBlock = (hc.config?.bloques || []).find(b => b.tipo === 'inyeccion');
    const inyF     = (inyBlock?.formula_salmuera || '').toLowerCase();
    return topLevel === formulaSal || inyF === formulaSal;
  });

  const kgInicial   = parseFloat(primerCorte?.kg_carne_cruda || lote.kg_inicial || 0);
  const precioCarne = primerCorte && parseFloat(primerCorte.kg_carne_cruda || 0) > 0
    ? parseFloat(primerCorte.costo_carne || 0) / parseFloat(primerCorte.kg_carne_cruda)
    : 0;

  // Buscar stock anterior (para kgMadPrevio y mpPadreId)
  const { data: stockEntries } = await supabase
    .from('stock_lotes_inyectados')
    .select('kg_inicial, tipo_corte, corte_nombre, materia_prima_id')
    .eq('lote_id', lote.lote_id);
  const stockPadre  = (stockEntries || []).find(s => s.tipo_corte === 'padre') || (stockEntries || [])[0];
  const kgMadPrevio = parseFloat(stockPadre?.kg_inicial || 0);

  // Separar pasos momento1 (antes de maduracion) y momento2 (después)
  const madIdx         = pasosPrev.findIndex(p => p.tipo === 'maduracion');
  const valoresPrevios = madIdx >= 0
    ? pasosPrev.slice(0, madIdx)
    : pasosPrev.filter(p => ['inyeccion','merma','rub','adicional'].includes(p.tipo));
  const valoresPreviosM2 = madIdx >= 0 ? pasosPrev.slice(madIdx + 1) : [];

  // Pasos hijo para CORTES (guardados en bloques_resultado.hijo o en pasos con tipo bifurcacion)
  const valoresPreviosHijo = lote.bloques_resultado?.hijo?.pasos || [];

  const esBano = ['INMERSION','MARINAD','AHUMAD'].some(k =>
    (cfgEntry?.config?._categoria || '').toUpperCase().includes(k)
  );

  // ── 2. Revertir el lote (borra todo) ─────────────────────
  await revertirLote(lote.lote_id, null);

  // ── 3. Re-crear produccion_inyeccion ──────────────────────
  const hoy = new Date().toISOString().split('T')[0];
  const { data: newProd, error: errProd } = await supabase
    .from('produccion_inyeccion')
    .insert({
      fecha:                hoy,
      formula_salmuera:     produccion.formula_salmuera,
      producto_nombre:      produccion.producto_nombre,
      kg_carne_total:       produccion.kg_carne_total,
      kg_salmuera_requerida: produccion.kg_salmuera_requerida,
      porcentaje_inyeccion: produccion.porcentaje_inyeccion,
      estado:               'abierto',
    })
    .select('id')
    .single();
  if (errProd) throw new Error('Error re-creando produccion: ' + errProd.message);

  // ── 4. Re-crear produccion_inyeccion_cortes ───────────────
  for (const c of cortes) {
    const { error: errCorte } = await supabase.from('produccion_inyeccion_cortes').insert({
      produccion_id:           newProd.id,
      corte_nombre:            c.corte_nombre,
      materia_prima_id:        c.materia_prima_id,
      kg_carne_cruda:          c.kg_carne_cruda,
      kg_carne_limpia:         c.kg_carne_limpia,
      kg_salmuera_asignada:    c.kg_salmuera_asignada,
      costo_carne:             c.costo_carne,
      costo_salmuera_asignado: c.costo_salmuera_asignado,
    });
    if (errCorte) throw new Error('Error re-creando corte: ' + errCorte.message);
  }

  // ── 5. Re-crear lotes_maduracion (mismo lote_id) ─────────
  const { error: errLote } = await supabase.from('lotes_maduracion').insert({
    lote_id:       lote.lote_id,
    produccion_id: newProd.id,
    fecha_entrada: lote.fecha_entrada,
    fecha_salida:  lote.fecha_salida,
    estado:        'madurando',
    kg_inicial:    kgInicial,
  });
  if (errLote) throw new Error('Error re-creando lote: ' + errLote.message);

  // ── 6. Retornar params para el wizard ─────────────────────
  return {
    savedLoteId:         lote.lote_id,
    kgInicial,
    precioCarne,
    bloques:             cfgEntry?.config?.bloques       || [],
    bloquesHijo:         cfgEntry?.config?.bloques_hijo  || [],
    cfg:                 cfgEntry?.config                || {},
    esBano,
    formulaSalmuera:     produccion.formula_salmuera     || '',
    corteNombrePadre:    primerCorte?.corte_nombre       || '',
    mpPadreId:           stockPadre?.materia_prima_id    || null,
    valoresPrevios,
    valoresPreviosM2,
    valoresPreviosHijo,
    kgMadPrevio,
  };
}
```

- [ ] **Step 2: Verificar que no hay errores de sintaxis**

Abrir el archivo en el editor y confirmar que no hay errores de lint. No hay test automatizado aquí — se prueba en Task 5.

- [ ] **Step 3: Commit**

```
git add src/utils/prepararEdicionLote.js
git commit -m "feat: prepararEdicionLote — revert + recrear infra para edicion"
```

---

### Task 2: Agregar `horneadoCfgs` a `useProduccion`

**Files:**
- Modify: `src/components/produccion/useProduccion.js`

El hook actualmente NO carga `horneadoCfgs`. Hay que agregarlo como estado, cargarlo al montar, y exportarlo.

- [ ] **Step 1: Agregar estado después de la línea `const esAdmin = ...` (línea ~46)**

Encontrar:
```javascript
  const esAdmin = userRol?.rol === 'admin';
```

Reemplazar con:
```javascript
  const esAdmin = userRol?.rol === 'admin';

  const [horneadoCfgs, setHorneadoCfgs] = useState([]);
```

- [ ] **Step 2: Agregar carga de horneadoCfgs después del useEffect inicial (línea ~49)**

Encontrar:
```javascript
  useEffect(() => { cargarTodo(); }, []);
  useRealtime([
```

Reemplazar con:
```javascript
  useEffect(() => { cargarTodo(); }, []);
  useEffect(() => {
    supabase.from('vista_horneado_config').select('producto_nombre,config')
      .then(({ data }) => setHorneadoCfgs(data || []));
  }, []);
  useRealtime([
```

- [ ] **Step 3: Agregar `horneadoCfgs` al return (línea ~438, después de `historialAgrupado`)**

Encontrar:
```javascript
    historialAgrupado,
    kgHoy, costoHoy, kgMes, costoMes,
```

Reemplazar con:
```javascript
    historialAgrupado,
    horneadoCfgs,
    kgHoy, costoHoy, kgMes, costoMes,
```

- [ ] **Step 4: Verificar en browser**

Abrir `localhost:3000` → Producción → Historial. No deben aparecer errores en consola.

- [ ] **Step 5: Commit**

```
git add src/components/produccion/useProduccion.js
git commit -m "feat: useProduccion expone horneadoCfgs para edicion de lotes"
```

---

### Task 3: Actualizar `Produccion.js`

**Files:**
- Modify: `src/Produccion.js`

Hay que pasar `horneadoCfgs` y `onIrAMaduracion` a TabHistorial.

- [ ] **Step 1: Localizar el bloque TabHistorial en Produccion.js (~línea 136)**

Encontrar:
```javascript
        {p.tab === 'historial' && (
          <TabHistorial
            historialAgrupado={p.historialAgrupado}
            produccionDiaria={p.produccionDiaria}
            esAdmin={p.esAdmin}
            setModalRevertir={p.setModalRevertir}
            recargarHistorial={p.cargarTodo}
            currentUser={currentUser}
            userRol={userRol}
          />
        )}
```

Reemplazar con:
```javascript
        {p.tab === 'historial' && (
          <TabHistorial
            historialAgrupado={p.historialAgrupado}
            produccionDiaria={p.produccionDiaria}
            esAdmin={p.esAdmin}
            setModalRevertir={p.setModalRevertir}
            recargarHistorial={p.cargarTodo}
            currentUser={currentUser}
            userRol={userRol}
            horneadoCfgs={p.horneadoCfgs}
            onIrAMaduracion={() => p.setTab('maduracion')}
          />
        )}
```

- [ ] **Step 2: Verificar en browser**

Abrir `localhost:3000` → Producción → Historial. No deben aparecer errores.

- [ ] **Step 3: Commit**

```
git add src/Produccion.js
git commit -m "feat: Produccion pasa horneadoCfgs y onIrAMaduracion a TabHistorial"
```

---

### Task 4: `WizardProduccionDinamica` — props pre-fill

**Files:**
- Modify: `src/components/produccion/WizardProduccionDinamica.js`

Añadir props `valoresPrevios` y `valoresPreviosHijo`, y un useEffect que pre-llena `inputKg` al cambiar de paso.

- [ ] **Step 1: Añadir props al destructuring (línea ~42)**

Encontrar:
```javascript
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
  esBano,
  savedLoteId,
  onComplete,
  onCancel,
}) {
```

Reemplazar con:
```javascript
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
  esBano,
  savedLoteId,
  onComplete,
  onCancel,
  valoresPrevios    = [],
  valoresPreviosHijo = [],
}) {
```

- [ ] **Step 2: Añadir useEffect de pre-fill después de la línea ~146**

El archivo tiene este useEffect al final del bloque de efectos:
```javascript
  }, [pasoActual?.id, pasoActual?.tipo]); // eslint-disable-line react-hooks/exhaustive-deps
```

Justo DESPUÉS de esa línea, insertar:
```javascript

  // Pre-llenar inputKg con el valor anterior cuando viene de edición
  React.useEffect(() => {
    const prevArr = rama === 'hijo' ? valoresPreviosHijo : valoresPrevios;
    if (!prevArr.length) return;
    const prev = prevArr[pasoIdx];
    if (!prev) return;
    const tipo = pasoActual?.tipo;
    if (!tipo) return;
    if (tipo === 'merma' && parseFloat(prev.kgMermaReal) > 0) {
      setInputKg(String(prev.kgMermaReal));
    } else if (!['inyeccion','rub','adicional','maduracion'].includes(tipo) && parseFloat(prev.kgSalida) > 0) {
      setInputKg(String(prev.kgSalida));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasoIdx, rama]);
```

- [ ] **Step 3: Verificar que el wizard existente sigue funcionando**

Abrir `localhost:3000` → Producción → Registrar producción → hacer una producción nueva de CORTES o INMERSIÓN de prueba. Verificar que el wizard funciona igual que antes (los props nuevos tienen default `[]` y el useEffect no hace nada si `prevArr.length === 0`).

- [ ] **Step 4: Commit**

```
git add src/components/produccion/WizardProduccionDinamica.js
git commit -m "feat: WizardProduccionDinamica acepta valoresPrevios para pre-llenar inputs"
```

---

### Task 5: `TabHistorial` — botón Editar + lógica + wizard

**Files:**
- Modify: `src/components/produccion/TabHistorial.js`

Esta es la tarea principal. Se añaden: import de `prepararEdicionLote`, nuevos props, estados de edición, función `handleEditarLote`, el wizard en overlay, y el botón junto a Revertir.

- [ ] **Step 1: Añadir import de `prepararEdicionLote` (línea ~4)**

Encontrar:
```javascript
import { revertirLote } from '../../utils/revertirLote';
```

Reemplazar con:
```javascript
import { revertirLote } from '../../utils/revertirLote';
import { prepararEdicionLote } from '../../utils/prepararEdicionLote';
import WizardProduccionDinamica from './WizardProduccionDinamica';
```

- [ ] **Step 2: Añadir nuevos props al destructuring (línea ~9)**

Encontrar:
```javascript
export default function TabHistorial({
  historialAgrupado,
  produccionDiaria,
  esAdmin,
  setModalRevertir,
  recargarHistorial,
  currentUser,
  userRol,
}) {
```

Reemplazar con:
```javascript
export default function TabHistorial({
  historialAgrupado,
  produccionDiaria,
  esAdmin,
  setModalRevertir,
  recargarHistorial,
  currentUser,
  userRol,
  horneadoCfgs = [],
  onIrAMaduracion,
}) {
```

- [ ] **Step 3: Añadir estados de edición después de `const [revirtiendo, setRevirtiendo] = useState(null);` (línea ~19)**

Encontrar:
```javascript
  const [revirtiendo,      setRevirtiendo]      = useState(null); // lote_id en proceso
```

Reemplazar con:
```javascript
  const [revirtiendo,      setRevirtiendo]      = useState(null); // lote_id en proceso
  const [preparando,       setPreparando]       = useState(false);
  const [wizardEdicion,    setWizardEdicion]    = useState(null);
```

- [ ] **Step 4: Añadir función `handleEditarLote` justo antes de `handleRevertirLote`**

Encontrar:
```javascript
  async function handleRevertirLote(lote) {
```

Insertar ANTES:
```javascript
  async function handleEditarLote(lote) {
    if (!window.confirm(
      `¿Editar Lote ${lote.lote_id}?\n\n` +
      `El lote se reabrirá con los valores anteriores precargados.\n` +
      `Podrás corregir lo que esté mal y confirmar de nuevo.`
    )) return;
    setPreparando(true);
    try {
      const params = await prepararEdicionLote(lote, horneadoCfgs);
      setLotesMaduracion(prev => prev.filter(l => l.lote_id !== lote.lote_id));
      setWizardEdicion(params);
    } catch (e) {
      alert('Error al preparar edición: ' + e.message);
    }
    setPreparando(false);
  }

```

- [ ] **Step 5: Añadir botón "✏️ Editar" junto al botón Revertir en la sección de lotesMaduracion**

Encontrar el bloque del botón Revertir en la sección `{lotesMaduracion.map(lote => {`:
```javascript
                  {puedeRevertir && (
                    <button
                      disabled={revirtiendo === lote.lote_id}
                      onClick={() => handleRevertirLote(lote)}
```

Reemplazar con:
```javascript
                  {puedeRevertir && (
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                      <button
                        disabled={preparando}
                        onClick={() => handleEditarLote(lote)}
                        style={{
                          background: 'none', border: '1.5px solid #2980b9',
                          color: '#2980b9', borderRadius: 8, padding: '5px 12px',
                          cursor: preparando ? 'not-allowed' : 'pointer',
                          fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap',
                          opacity: preparando ? 0.6 : 1,
                        }}>
                        {preparando ? '⏳' : '✏️ Editar'}
                      </button>
                    <button
                      disabled={revirtiendo === lote.lote_id}
                      onClick={() => handleRevertirLote(lote)}
```

Y después del cierre del botón Revertir (`</button>`), cerrar el `</div>`:
```javascript
                    </button>
                    </div>
```

- [ ] **Step 6: Añadir el wizard en overlay al final del return, antes del cierre del `<div>` principal**

Encontrar la última línea del return (el `</div>` que cierra todo):
```javascript
      {todasFechas.map(fecha => {
```

Al FINAL del `return (` block, antes del cierre `</div>`, añadir:
```javascript
      {/* ── Wizard de edición de lote ── */}
      {wizardEdicion && (
        <WizardProduccionDinamica
          modo="momento1"
          bloques={wizardEdicion.bloques}
          bloquesHijo={wizardEdicion.bloquesHijo}
          cfg={wizardEdicion.cfg}
          kgInicial={wizardEdicion.kgInicial}
          precioCarne={wizardEdicion.precioCarne}
          currentUser={currentUser}
          mpsFormula={[]}
          esBano={wizardEdicion.esBano}
          savedLoteId={wizardEdicion.savedLoteId}
          valoresPrevios={wizardEdicion.valoresPrevios}
          valoresPreviosHijo={wizardEdicion.valoresPreviosHijo}
          onComplete={() => {
            setWizardEdicion(null);
            if (onIrAMaduracion) onIrAMaduracion();
          }}
          onCancel={async () => {
            if (window.confirm('¿Cancelar la edición? El lote quedará en maduración sin completar.')) {
              setWizardEdicion(null);
              if (onIrAMaduracion) onIrAMaduracion();
            }
          }}
        />
      )}
```

- [ ] **Step 7: Verificar en browser**

Abrir `localhost:3000` → Producción → Historial. Verificar que:
- El lote completado aparece
- Aparecen botones "✏️ Editar" y "🔄 Revertir" (si eres admin)
- Al presionar "Editar" aparece el modal de confirmación
- Al confirmar, el wizard abre con los valores anteriores en los inputs

- [ ] **Step 8: Commit**

```
git add src/components/produccion/TabHistorial.js
git commit -m "feat: TabHistorial boton Editar con wizard pre-llenado"
```

---

### Task 6: `TabMaduracion` — hint de kg anterior en pesaje

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

El lote re-creado tiene `kg_inicial` (el kg de carne original). En el modal de pesaje, mostrar ese valor como placeholder para orientar al operario sobre el peso anterior.

- [ ] **Step 1: Localizar el input de KG HOY en el modal de pesaje (~línea 1807)**

Encontrar:
```javascript
  value={pesajes[p.corte_nombre] ?? ''}
  onChange={e => setPesajes(prev => ({ ...prev, [p.corte_nombre]: e.target.value }))}
  placeholder="0.000"
```

Reemplazar con:
```javascript
  value={pesajes[p.corte_nombre] ?? ''}
  onChange={e => setPesajes(prev => ({ ...prev, [p.corte_nombre]: e.target.value }))}
  placeholder={modalPesaje?.kg_inicial > 0 ? `Anterior: ${parseFloat(modalPesaje.kg_inicial).toFixed(3)} kg` : '0.000'}
```

- [ ] **Step 2: Verificar en browser**

Completar el flujo de edición hasta llegar al modal de pesaje. Verificar que el placeholder muestra el kg anterior (ej. "Anterior: 1.500 kg").

- [ ] **Step 3: Commit**

```
git add src/components/produccion/TabMaduracion.js
git commit -m "feat: TabMaduracion placeholder kg anterior en modal pesaje edicion"
```

---

## Prueba de flujo completo

Después de todos los tasks, verificar el flujo E2E en `localhost:3000`:

**Caso 1: AHUMADOS con horneado**
1. Hacer una producción de Alitas Ahumadas (wizard momento1 + pesaje + wizard momento2)
2. Ir a Historial → verificar que aparece el lote
3. Presionar "✏️ Editar"
4. En el wizard, verificar que los inputs de merma tienen los valores anteriores pre-llenados
5. Cambiar un valor (ej. kg merma) y confirmar todos los pasos
6. App salta a Maduración → lote aparece como "LISTO PARA PESAJE"
7. Registrar pesaje → el placeholder muestra el kg anterior
8. Completar wizard momento2 (pre-llenado con valores anteriores)
9. Ir a Historial → verificar que el lote aparece con los nuevos valores

**Caso 2: INMERSIÓN simple**
1. Hacer producción de Salon de Res
2. Editar → wizard pre-llenado
3. Completar → pesaje → completar
4. Verificar en Despacho que el stock refleja los nuevos kg

**Caso 3: Cancelar edición**
1. Iniciar edición → cancelar en el wizard
2. Confirmar el alert → app salta a Maduración
3. Verificar que el lote aparece en "LISTO PARA PESAJE" (no se pierde)
