# Spec B: Editar Lote Completado — Design

## Goal
Permitir corregir cualquier valor de un lote ya completado (kg carne, precio, mermas en cualquier posición, kg post-maduración, pasos post-pesaje) sin tener que hacer el proceso manualmente desde cero. El sistema revierte internamente y reabre el wizard con todos los valores anteriores pre-llenados.

## Scope
- Edición de lotes con estado `'completado'` desde TabHistorial
- Aplica a todos los tipos de producto: CORTES (padre/hijo), INMERSIÓN, MARINADOS, AHUMADOS-HORNEADOS
- Permisos: admin siempre, producción dentro de 24h desde `updated_at`
- No incluye edición de fórmulas de salmuera ni configuración de bloques

---

## Flujo completo

```
1. TabHistorial → botón "✏️ Editar" (junto a "🔄 Revertir")
2. Modal confirmación: "Se reabrirá el lote para edición con valores precargados"
3. prepararEdicionLote():
   a. Recopila datos del lote antes de revertir
   b. Llama revertirLote() — deshace inventario, stock, movimientos
   c. Re-crea produccion_inyeccion + produccion_inyeccion_cortes + lotes_maduracion
   d. Retorna { savedLoteId, kgInicial, precioCarne, bloques, bloquesHijo,
                cfg, esBano, valoresPrevios, valoresPreviosHijo, kgMadPrevio,
                corteNombrePadre, corteNombreHijo, mpPadreId, formulaSalmuera }
4. Abre WizardProduccionDinamica modo='momento1' con prop valoresPrevios
5. Wizard ejecuta pasos con valores pre-llenados → operario corrige lo que esté mal
6. Al completar wizard → Produccion.js cambia a tab 'maduracion'
7. En TabMaduracion el lote aparece como "LISTO PARA PESAJE"
8. Operario hace pesaje (kg anterior visible como placeholder/hint)
9. Si producto requiere wizard momento2 (CORTES/AHUMADOS) → abre con valoresPreviosM2
10. Lote completado con valores corregidos
```

---

## Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `src/utils/prepararEdicionLote.js` | NUEVO — orquesta revert + re-creación |
| `src/components/produccion/TabHistorial.js` | Botón Editar + modal + llama prepararEdicionLote + abre wizard |
| `src/components/produccion/WizardProduccionDinamica.js` | Nuevo prop `valoresPrevios` + `valoresPreviosHijo` |
| `src/components/produccion/TabMaduracion.js` | Hint del kg previo en modal de pesaje |
| `src/Produccion.js` | Callback `onIrAMaduracion` para switch de tab desde TabHistorial |

---

## Núcleo: `prepararEdicionLote.js`

```javascript
export async function prepararEdicionLote(lote, horneadoCfgs, supabase) {
  // 1. Recopilar TODOS los datos ANTES de revertir
  const produccion = lote.produccion_inyeccion;
  const cortes = produccion?.produccion_inyeccion_cortes || [];
  const primerCorte = cortes[0];
  const pasosPrev = lote.bloques_resultado?.pasos || [];
  const formulaSal = (produccion?.formula_salmuera || '').toLowerCase();

  // Buscar config del producto
  const cfg = horneadoCfgs.find(hc => {
    const top = (hc.config?.formula_salmuera || '').toLowerCase();
    const inyBlock = (hc.config?.bloques || []).find(b => b.tipo === 'inyeccion');
    const inyF = (inyBlock?.formula_salmuera || '').toLowerCase();
    return top === formulaSal || inyF === formulaSal;
  });

  const kgInicial = parseFloat(primerCorte?.kg_carne_cruda || lote.kg_inicial || 0);
  const precioCarne = primerCorte
    ? parseFloat(primerCorte.costo_carne / (primerCorte.kg_carne_cruda || 1))
    : 0;

  // Para CORTES: buscar kg madurado del stock padre
  const { data: stockEntries } = await supabase
    .from('stock_lotes_inyectados')
    .select('kg_inicial, tipo_corte, corte_nombre, materia_prima_id')
    .eq('lote_id', lote.lote_id);
  const stockPadre = (stockEntries || []).find(s => s.tipo_corte === 'padre') || stockEntries?.[0];
  const kgMadPrevio = stockPadre?.kg_inicial || 0;

  // Separar pasos momento1 y momento2
  const madIdx = pasosPrev.findIndex(p => p.tipo === 'maduracion');
  const valoresPrevios = madIdx >= 0 ? pasosPrev.slice(0, madIdx) : pasosPrev.filter(p => ['inyeccion','merma','rub','adicional'].includes(p.tipo));
  const valoresPreviosM2 = madIdx >= 0 ? pasosPrev.slice(madIdx + 1) : [];

  // Pasos hijo (CORTES)
  const valoresPreviosHijo = lote.bloques_resultado?.hijo?.pasos || [];

  // 2. Revertir lote
  await revertirLote(lote.lote_id, null);

  // 3. Re-crear produccion_inyeccion
  const hoy = new Date().toISOString().split('T')[0];
  const { data: newProd } = await supabase.from('produccion_inyeccion').insert({
    fecha: hoy,
    formula_salmuera: produccion.formula_salmuera,
    producto_nombre: produccion.producto_nombre,
    kg_carne_total: produccion.kg_carne_total,
    kg_salmuera_requerida: produccion.kg_salmuera_requerida,
    porcentaje_inyeccion: produccion.porcentaje_inyeccion,
    estado: 'abierto',
  }).select('id').single();

  // 4. Re-crear produccion_inyeccion_cortes
  for (const c of cortes) {
    await supabase.from('produccion_inyeccion_cortes').insert({
      produccion_id: newProd.id,
      corte_nombre: c.corte_nombre,
      materia_prima_id: c.materia_prima_id,
      kg_carne_cruda: c.kg_carne_cruda,
      kg_carne_limpia: c.kg_carne_limpia,
      kg_salmuera_asignada: c.kg_salmuera_asignada,
      costo_carne: c.costo_carne,
      costo_salmuera_asignado: c.costo_salmuera_asignado,
    });
  }

  // 5. Re-crear lotes_maduracion
  const loteId = lote.lote_id; // mantener mismo ID
  await supabase.from('lotes_maduracion').insert({
    lote_id: loteId,
    produccion_id: newProd.id,
    fecha_entrada: lote.fecha_entrada,
    fecha_salida: lote.fecha_salida,
    estado: 'madurando',
    kg_inicial: kgInicial,
  });

  return {
    savedLoteId: loteId,
    kgInicial,
    precioCarne,
    bloques: cfg?.config?.bloques || [],
    bloquesHijo: cfg?.config?.bloques_hijo || [],
    cfg: cfg?.config || {},
    esBano: ['INMERSION','MARINAD','AHUMAD'].some(k => (cfg?.config?._categoria||'').toUpperCase().includes(k)),
    formulaSalmuera: produccion.formula_salmuera,
    corteNombrePadre: primerCorte?.corte_nombre || '',
    mpPadreId: stockPadre?.materia_prima_id || null,
    valoresPrevios,      // pasos momento1 anteriores
    valoresPreviosM2,    // pasos momento2 anteriores
    valoresPreviosHijo,  // pasos hijo anteriores (CORTES)
    kgMadPrevio,         // kg madurado anterior (hint en pesaje)
  };
}
```

---

## WizardProduccionDinamica — cambios

### Nuevo prop
```javascript
valoresPrevios = [],   // array de pasos previos momento1 (índice = posición del paso)
valoresPreviosHijo = [] // array de pasos previos hijo (CORTES)
```

### Uso en cada paso
Al inicializar el input para el paso `i`, buscar en `valoresPrevios` el valor anterior:

```javascript
// Al montar el paso (en useEffect que observa pasoActual)
useEffect(() => {
  if (!valoresPrevios.length) return;
  const prev = valoresPrevios[pasoIdx];
  if (!prev) return;
  // Para merma: pre-llenar con kg real anterior
  if (pasoActual.tipo === 'merma' && prev.kgMermaReal > 0) {
    setInputKg(String(prev.kgMermaReal));
  }
  // Para horneado/pesaje: pre-llenar con kgSalida anterior
  if (['horneado','ahumado','enfriado'].includes(pasoActual.tipo) && prev.kgSalida > 0) {
    setInputKg(String(prev.kgSalida));
  }
}, [pasoIdx]);
```

### Para rama hijo (CORTES)
Igual pero usando `valoresPreviosHijo` cuando `rama === 'hijo'`.

---

## TabHistorial — cambios

```javascript
// Estado
const [editandoLote, setEditandoLote] = useState(null);
const [preparando, setPreparando] = useState(false);
const [wizardEdicion, setWizardEdicion] = useState(null);

// Función principal
async function handleEditarLote(lote) {
  if (!window.confirm(`¿Editar Lote ${lote.lote_id}?\n\nEl lote se reabrirá con todos los valores precargados para que puedas corregirlos.`)) return;
  setPreparando(true);
  try {
    const params = await prepararEdicionLote(lote, horneadoCfgs, supabase);
    setWizardEdicion(params);
    setLotesMaduracion(prev => prev.filter(l => l.lote_id !== lote.lote_id));
  } catch (e) {
    alert('Error al preparar edición: ' + e.message);
  }
  setPreparando(false);
}

// Render
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
    onComplete={() => { setWizardEdicion(null); onIrAMaduracion(); }}
    onCancel={() => setWizardEdicion(null)}
  />
)}
```

### Botón en cada lote del historial
```jsx
{puedeRevertir && (
  <button onClick={() => handleEditarLote(lote)} disabled={preparando}>
    ✏️ {preparando ? 'Preparando...' : 'Editar'}
  </button>
)}
```

---

## TabMaduracion — cambios

En el modal de pesaje, mostrar hint del kg anterior cuando el lote viene de edición:

```javascript
// El lote puede tener kg_inicial como referencia del peso anterior
// Mostrar en el input como placeholder
<input
  placeholder={`Anterior: ${lote.kg_inicial?.toFixed(3) || '—'} kg`}
  value={pesajes[p.corte_nombre] || ''}
  onChange={...}
/>
```

---

## Produccion.js — cambios

```javascript
// TabHistorial recibe callback para cambiar de tab
{p.tab === 'historial' && (
  <TabHistorial
    ...
    onIrAMaduracion={() => p.setTab('maduracion')}
    horneadoCfgs={p.horneadoCfgs} // nuevo: pasar configs al historial
  />
)}
```

`horneadoCfgs` se carga en `useProduccion` igual que en TabMaduracion.

---

## Permisos

```
Admin      → botón Editar siempre visible
Produccion → botón Editar visible si updated_at < 24h
Otros      → no ven el botón
```

---

## Casos especiales

### CORTES con padre/hijo
- `valoresPrevios` cubre los pasos del padre (antes de bifurcación)
- `valoresPreviosHijo` cubre los pasos del hijo
- El wizard ya maneja la bifurcación; solo recibe los valores pre-llenados

### BANO con pct_peso_inj (AHUMADOS/INMERSIÓN)
- El step de inyección recalcula automáticamente con el `pct_peso_inj` de la config
- `valoresPrevios[0]` (inyeccion) provee el `kgSalida` como referencia visual solamente
- El cálculo real lo hace el wizard con las mismas fórmulas de siempre

### Productos sin momento2 (INMERSIÓN simple)
- `valoresPreviosM2 = []` — no se usa
- No se abre wizard momento2 (igual que en producción nueva)

### Múltiples mermas en posiciones arbitrarias
- El match es por índice (posición `i` en `pasos[]`), no por tipo
- Funciona independientemente del orden configurado en cada producto
