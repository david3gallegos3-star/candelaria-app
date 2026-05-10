# AHUMADOS-HORNEADOS Dinámico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo viejo hardcodeado de Pastrame (modal 3 pasos) con el mismo sistema dinámico de bloques que usan CORTES e INMERSIÓN, agregando soporte para inyección mixta: costo = 100% de la salmuera preparada, peso = % configurable de esa salmuera.

**Architecture:** AHUMADOS-HORNEADOS pasa a ser tratado como `esBano=true` igual que INMERSIÓN. La diferencia está en el bloque inyección: nuevo campo `pct_peso_inj` que controla qué % de la salmuera preparada agrega peso (0%=INMERSIÓN, 100%=CORTES, 20%=AHUMADOS típico). El wizard momento1 corre desde TabInyeccion, momento2 desde TabMaduracion. Formulacion.js redirige AHUMADOS a VistaCorte en lugar de VistaHorneado.

**Tech Stack:** React, Supabase, BloquesDinamicos, WizardProduccionDinamica, TabInyeccion, TabMaduracion, Formulacion.js

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/formulacion/BloquesDinamicos.js` | `pct_peso_inj` en template + calcBloques + UI |
| `src/components/produccion/WizardProduccionDinamica.js` | usar `pct_peso_inj` en `confirmarInyeccion` |
| `src/Formulacion.js` | AHUMADOS → VistaCorte (no VistaHorneado) |
| `src/components/produccion/TabInyeccion.js` | AHUMADOS en `detectarEsBano` |
| `src/components/produccion/TabMaduracion.js` | AHUMADOS en `esCatBano`, eliminar modal Pastrame |

---

## Task 1: BloquesDinamicos.js — campo pct_peso_inj en bloque inyección

**Files:**
- Modify: `src/components/formulacion/BloquesDinamicos.js`

### Contexto
`calcBloques` (línea ~20) actualmente tiene:
```javascript
if (b.tipo === 'inyeccion') {
  const pct   = parseFloat(b.pct_inj || 0) / 100;
  const kgSal = kg * pct;
  const cSal  = kgSal * precioKgSalmuera;
  costoAcum  += cSal;
  if (!esBano) kg += kgSal;  // ← hardcodeado: esBano=nunca agrega peso
```

Necesitamos: costo siempre = `kgSal × precio`, pero peso = `kgSal × pct_peso_inj/100`.

- [ ] **Step 1: Modificar calcBloques para usar pct_peso_inj**

En `src/components/formulacion/BloquesDinamicos.js`, reemplazar el bloque inyeccion en `calcBloques` (busca `if (b.tipo === 'inyeccion')`):

```javascript
if (b.tipo === 'inyeccion') {
  const pct   = parseFloat(b.pct_inj || 0) / 100;
  const kgSal = kg * pct;
  const cSal  = kgSal * precioKgSalmuera;
  costoAcum  += cSal;
  // pct_peso_inj: % de la salmuera que agrega peso (undefined → backward compat vía esBano)
  const pctPeso = b.pct_peso_inj != null
    ? parseFloat(b.pct_peso_inj) / 100
    : (esBano ? 0 : 1);
  kg += kgSal * pctPeso;
  pasos.push({ tipo: 'inyeccion', label: `💉 Inyección ${b.pct_inj}%`, kg, costoAcum, kgSal, cSal });
```

- [ ] **Step 2: Agregar pct_peso_inj al template del bloque**

En la función `addBloque`, template `inyeccion` (busca `inyeccion: { tipo: 'inyeccion', activo: true`):

```javascript
inyeccion: { tipo: 'inyeccion', activo: true, formula_salmuera: '', pct_inj: 20, kg_sal_base: 2, pct_peso_inj: null },
```

`null` → backward compatible (usa esBano para decidir).

- [ ] **Step 3: Agregar campo UI en el editor del bloque inyección**

Dentro del renderizado del bloque inyección (busca el section que muestra `pct_inj` con un input), agregar después del input de `pct_inj`:

```jsx
{/* Solo mostrar pct_peso_inj si NO es 100% ni 0% (es decir, AHUMADOS) */}
<div style={{ marginTop: 8 }}>
  <label style={{ fontSize: 11, fontWeight: 600, color: meta.color, display: 'block', marginBottom: 4 }}>
    % que agrega peso
  </label>
  <input
    type="text"
    inputMode="decimal"
    value={b.pct_peso_inj ?? ''}
    disabled={!modoEdicion}
    placeholder="vacío = automático"
    onChange={e => {
      const val = e.target.value.replace(',', '.');
      updateBloque(b.id, { pct_peso_inj: val === '' ? null : parseFloat(val) || 0 });
    }}
    style={baseInputStyle({ border: `1.5px solid ${meta.color}` })}
  />
  <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
    % de la salmuera que entra a la carne (vacío = 0% para INMERSIÓN, 100% para CORTES)
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/formulacion/BloquesDinamicos.js
git commit -m "BloquesDinamicos: pct_peso_inj en bloque inyeccion para AHUMADOS"
```

---

## Task 2: WizardProduccionDinamica.js — pct_peso_inj en confirmarInyeccion

**Files:**
- Modify: `src/components/produccion/WizardProduccionDinamica.js`

### Contexto
`confirmarInyeccion` (línea ~357) actualmente:
```javascript
const kgSalida = esBano ? kgActual : kgActual + kgSalmuera;
```
Para AHUMADOS `esBano=true` pero SÍ debe agregar una fracción de peso.

- [ ] **Step 1: Modificar kgSalida en confirmarInyeccion**

Busca `const kgSalida = esBano ? kgActual : kgActual + kgSalmuera;` y reemplaza:

```javascript
const pctPeso = b.pct_peso_inj != null
  ? parseFloat(b.pct_peso_inj) / 100
  : (esBano ? 0 : 1);
const kgSalida = kgActual + kgSalmuera * pctPeso;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/produccion/WizardProduccionDinamica.js
git commit -m "WizardProduccionDinamica: pct_peso_inj en confirmarInyeccion"
```

---

## Task 3: Formulacion.js — AHUMADOS va a VistaCorte

**Files:**
- Modify: `src/Formulacion.js`

### Contexto
Actualmente (línea ~26-65):
```javascript
const esBano     = catUp.includes('INMERSION') || catUp.includes('MARINAD');
const esHorneado = producto?.categoria === 'AHUMADOS - HORNEADOS' || ...;
...
if (esHorneado) return (<VistaHorneado ... />);
if (esCorte || esBano) return (<div>...<VistaCorte esBano={esBano} /></div>);
```

AHUMADOS entra a `VistaHorneado`. Necesita entrar a `VistaCorte` con `esBano=true`.

- [ ] **Step 1: Agregar AHUMADOS a esBano y eliminar redirect a VistaHorneado**

Busca:
```javascript
const esBano       = catUp.includes('INMERSION') || catUp.includes('MARINAD');
const esHorneado   = producto?.categoria === 'AHUMADOS - HORNEADOS' || producto?.categoria === 'AHUMADOS-HORNEADOS';
```

Reemplaza con:
```javascript
const esBano       = catUp.includes('INMERSION') || catUp.includes('MARINAD') || catUp.includes('AHUMAD');
```

Luego busca el bloque:
```javascript
if (esHorneado) return (
  <VistaHorneado producto={producto} mobile={f.mobile} onVolver={onVolver} />
);
```
Y **elimínalo** completo.

- [ ] **Step 2: Actualizar el subtítulo del header para AHUMADOS**

Busca (línea ~75):
```javascript
<div style={{ color:'rgba(255,255,255,0.65)', fontSize:11 }}>{esBano ? (catUp.includes('MARINAD') ? 'Marinado — historial de costos' : 'Inmersión — historial de costos') : 'Corte de carne — historial de costos'}</div>
```

Reemplaza con:
```javascript
<div style={{ color:'rgba(255,255,255,0.65)', fontSize:11 }}>
  {esBano
    ? catUp.includes('MARINAD')  ? 'Marinado — historial de costos'
    : catUp.includes('AHUMAD')   ? 'Ahumado/Horneado — historial de costos'
    : 'Inmersión — historial de costos'
    : 'Corte de carne — historial de costos'}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/Formulacion.js
git commit -m "Formulacion: AHUMADOS-HORNEADOS usa VistaCorte dinamico"
```

---

## Task 4: TabInyeccion.js — AHUMADOS en detectarEsBano

**Files:**
- Modify: `src/components/produccion/TabInyeccion.js`

### Contexto
`detectarEsBano` (línea ~121) solo detecta INMERSION y MARINAD. AHUMADOS necesita correr el wizard momento1 desde TabInyeccion para guardar sus pasos en `bloques_resultado`.

- [ ] **Step 1: Agregar AHUMADOS a detectarEsBano**

Busca:
```javascript
function detectarEsBano(cfg) {
  const cat = (cfg._categoria || '').toUpperCase().replace(/[ÓÒÔÖ]/g, 'O');
  return cat.includes('INMERSION') || cat.includes('MARINAD');
}
```

Reemplaza con:
```javascript
function detectarEsBano(cfg) {
  const cat = (cfg._categoria || '').toUpperCase().replace(/[ÓÒÔÖ]/g, 'O');
  return cat.includes('INMERSION') || cat.includes('MARINAD') || cat.includes('AHUMAD');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/produccion/TabInyeccion.js
git commit -m "TabInyeccion: AHUMADOS-HORNEADOS lanza wizard momento1"
```

---

## Task 5: TabMaduracion.js — AHUMADOS en esCatBano + eliminar modal Pastrame

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

### Contexto
`esCatBano` solo incluye INMERSION y MARINAD. El modal Pastrame (estados + funciones + JSX) es el flujo viejo a eliminar.

- [ ] **Step 1: Agregar AHUMADOS a esCatBano**

Busca:
```javascript
function esCatBano(cat) {
  const c = (cat || '').replace(/[ÓÒÔ]/g,'O').toUpperCase();
  return c.includes('INMERSION') || c.includes('MARINAD');
}
```

Reemplaza con:
```javascript
function esCatBano(cat) {
  const c = (cat || '').replace(/[ÓÒÔ]/g,'O').toUpperCase();
  return c.includes('INMERSION') || c.includes('MARINAD') || c.includes('AHUMAD');
}
```

- [ ] **Step 2: Eliminar estados del modal Pastrame**

Busca y elimina el bloque completo de estados (líneas ~62-74):
```javascript
// ── Modal Horneado (Pastrame) — wizard 3 pasos ──
const [modalHorneado,  setModalHorneado]  = useState(null);
const [horneadoPaso,   setHorneadoPaso]   = useState(1);
const [hrnHornoKg,     setHrnHornoKg]     = useState('');
const [hrnReposoKg,    setHrnReposoKg]    = useState('');
const [guardHorneado,  setGuardHorneado]  = useState(false);
const [errorHorneado,  setErrorHorneado]  = useState('');
const [mpMostaza,      setMpMostaza]      = useState(null);
const [rubCostoKg,     setRubCostoKg]     = useState(0);
const [rubFilas,       setRubFilas]       = useState([]);
const [paso1Listo,     setPaso1Listo]     = useState(false);
const [paso2Listo,     setPaso2Listo]     = useState(false);
const [imprevisto,     setImprevisto]     = useState({ activo: false, kgDaniado: '', motivo: '' });
```

- [ ] **Step 3: Eliminar carga de datos Pastrame del useEffect**

En el `useEffect` de carga (línea ~181), busca y elimina:
```javascript
// Mostaza para Pastrame
supabase.from('materias_primas').select('id,nombre,precio_kg')
  .ilike('nombre', '%mostaza%').limit(1)
  .then(({ data }) => setMpMostaza(data?.[0] || null));
// Costo Rub Pastrame por kg
supabase.from('formulaciones').select('gramos,materia_prima_id')
  .eq('producto_nombre', 'Rub Pastrame')
  .then(async ({ data: rubFilas }) => { ... });
```

- [ ] **Step 4: Eliminar variable esHorneado y su lógica en confirmarPesaje**

En `confirmarPesaje` (línea ~580) busca y elimina:
```javascript
const esHorneado     = !!cfgHornEntry;
const cfgHorn        = cfgHornEntry?.config || {};
const productoNombreHorn = cfgHornEntry?.producto_nombre || '';
```

Y el bloque que usa `esHorneado`:
```javascript
let horneadoWizardData = null;
if (esHorneado) {
  // preparar datos para modal viejo
  ...
}
```

Y las líneas que lo referencian:
```javascript
pendingFlow: esHorneado ? 'horneado' : ...
horneadoData: horneadoWizardData,
...
} else if (esHorneado && horneadoWizardData) {
  setModalHorneado(horneadoWizardData);
}
```

También en la segunda llamada a `confirmarPesaje` (~línea 890) el mismo patrón.

- [ ] **Step 5: Eliminar funciones registrarMostaza, registrarRub, completarHorneadoBano**

Busca y elimina las funciones que empiezan en ~línea 1121:
```javascript
async function registrarMostaza() { ... }
async function registrarRub() { ... }
async function completarHorneadoBano() { ... }
```

- [ ] **Step 6: Eliminar JSX del modal Pastrame**

Busca en el return JSX el bloque del modal horneado (busca `{modalHorneado && (` o similar) y elimina todo ese bloque hasta su cierre `)}`.

- [ ] **Step 7: Corregir kgInj en confirmarPesaje para AHUMADOS**

AHUMADOS no es `esInmPesaje` (no es INMERSION) pero tampoco debe usar `kgCarneReal + kg_salmuera_asignada` completo. La solución: si existe el paso de inyección en `bloques_resultado.pasos`, usar su `kgSalida` directamente.

Busca (línea ~364):
```javascript
const kgInj = esInmPesaje ? kgCarneReal : kgCarneReal + parseFloat(p.kg_salmuera_asignada || 0);
```

Reemplaza con:
```javascript
const inyPaso = (modalPesaje.bloques_resultado?.pasos || []).find(paso => paso.tipo === 'inyeccion');
const kgInj = inyPaso
  ? parseFloat(inyPaso.kgSalida || 0)
  : esInmPesaje ? kgCarneReal : kgCarneReal + parseFloat(p.kg_salmuera_asignada || 0);
```

- [ ] **Step 8: Mismo fix en la visualización del modal pesaje**

Busca (en el modal de pesaje, línea ~2650 aprox):
```javascript
const kgInj  = esInmModal ? kgCarneReal : kgCarneReal + kgSalModal;
```

Reemplaza con:
```javascript
const inyPasoModal = (modalPesaje.bloques_resultado?.pasos || []).find(paso => paso.tipo === 'inyeccion');
const kgInj  = inyPasoModal
  ? parseFloat(inyPasoModal.kgSalida || 0)
  : esInmModal ? kgCarneReal : kgCarneReal + kgSalModal;
```

- [ ] **Step 9: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "TabMaduracion: AHUMADOS dinamico, eliminar modal Pastrame viejo"
```

---

## Prueba manual al finalizar

1. Ir a Formulación → seleccionar producto AHUMADOS-HORNEADOS → debe abrir VistaCorte (no VistaHorneado)
2. En Costos 1kg → configurar bloques: merma → inyección (pct_inj=50%, pct_peso_inj=20%) → maduracion → horneado → verificar que el costo usa 50% y el peso sube solo 10% (20% de 50%)
3. Registrar producción → wizard momento1 debe mostrar los pasos dinámicos
4. En TabMaduracion → botón "Registrar pesaje" → pesaje modal muestra kg correcto (kgCarneReal + 10%)
5. Completar pesaje → wizard momento2 → horneado
6. En Producción tab → FLUJO debe mostrar todos los pasos dinámicos del wizard
