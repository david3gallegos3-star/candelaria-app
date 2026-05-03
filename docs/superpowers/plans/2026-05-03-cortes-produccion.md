# CORTES: Producción Padre-Hijo + Costos + Cierre Sierra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task with checkpoints.

**Goal:** Implementar el módulo completo de CORTES — fórmula CB correcta en Costos 1kg, wizard Padre/Hijo en TabMaduracion, y tab Cierre Sierra en VistaCorte.

**Architecture:** (1) VistaCorte.js guarda `_categoria:'CORTES'` y `formula_salmuera` en `vista_horneado_config`, lo que permite que TabMaduracion detecte el lote como CORTES Padre y abra un wizard de separación en vez de ir directo al stock. El wizard calcula costos proporcionales y crea 2 entradas en `stock_lotes_inyectados`. (2) Tab Cierre Sierra registra la merma de sierra diaria y calcula el factor de impacto por kg.

**Tech Stack:** React, Supabase PostgREST, JavaScript ES2020

---

## Task 1: SQL — Ejecutar en Supabase

**Files:**
- Ninguno (SQL en Supabase Dashboard)

- [ ] **Step 1: Agregar columnas a stock_lotes_inyectados**

Ir a Supabase → SQL Editor y ejecutar:

```sql
ALTER TABLE stock_lotes_inyectados
  ADD COLUMN IF NOT EXISTS tipo_corte text DEFAULT 'independiente',
  ADD COLUMN IF NOT EXISTS parent_lote_id text,
  ADD COLUMN IF NOT EXISTS formula_salmuera text;
```

No borra datos. Solo agrega columnas con defaults.

- [ ] **Step 2: Crear tabla cierre_sierra_diario**

```sql
CREATE TABLE IF NOT EXISTS cierre_sierra_diario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         date NOT NULL,
  kg_hueso      numeric(10,3) DEFAULT 0,
  kg_aserrin    numeric(10,3) DEFAULT 0,
  precio_aserrin_kg numeric(10,4) DEFAULT 0,
  kg_carnudo    numeric(10,3) DEFAULT 0,
  precio_carnudo_kg numeric(10,4) DEFAULT 0,
  valor_subproductos numeric(10,4) DEFAULT 0,
  kg_cortes_producidos numeric(10,3) DEFAULT 0,
  factor_impacto_kg numeric(10,4) DEFAULT 0,
  notas         text,
  usuario_nombre text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE cierre_sierra_diario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON cierre_sierra_diario
  FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 3: Verificar**

Ir a Table Editor → `stock_lotes_inyectados` → confirmar que aparecen las columnas `tipo_corte`, `parent_lote_id`, `formula_salmuera`. Verificar que `cierre_sierra_diario` existe.

---

## Task 2: VistaCorte.js — Costos 1kg: selector salmuera + fórmula CB

**Files:**
- Modify: `src/components/formulacion/VistaCorte.js`

El objetivo: cargar formulaciones de salmuera, mostrar selector, calcular CB correctamente.
`CB = (kgCarne×$Carne + kgSal×$Sal_por_kg + kgRub) / (1 + %Inj/100)`

- [ ] **Step 1: Agregar estado para formulaciones y mps**

Después de `const [precioPuntas, setPrecioPuntas] = useState(0);` (línea ~23) agregar:

```javascript
  // Formulaciones salmuera
  const [formulaciones,       setFormulaciones]       = useState([]);
  const [formulaSalmueraNombre, setFormulaSalmueraNombre] = useState('');
  const [formulaSalmueraIngs,   setFormulaSalmueraIngs]   = useState([]); // ingredientes con costo
  const [mpsFormula,           setMpsFormula]           = useState([]);
  const [pctRub,               setPctRub]               = useState('');
  const [costoRubKg,           setCostoRubKg]           = useState('');
```

- [ ] **Step 2: Cargar formulaciones en cargarTodo()**

Al final del try en `cargarTodo()`, antes del catch, agregar:

```javascript
      // Formulaciones salmuera + todas las MPs para ingredientes
      const [{ data: fmls }, { data: allMps }] = await Promise.all([
        supabase.from('formulaciones').select('nombre,categoria').not('nombre', 'is', null),
        supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg').eq('eliminado', false),
      ]);
      const nombresUnicos = [...new Set((fmls || []).map(f => f.nombre))];
      const salmueras = nombresUnicos.filter(n =>
        (fmls || []).some(f => f.nombre === n && (f.categoria || '').toUpperCase().includes('SALMUERA'))
      );
      setFormulaciones(salmueras);
      setMpsFormula(allMps || []);
```

- [ ] **Step 3: Cargar ingredientes cuando cambia formulaSalmueraNombre**

Después del `useEffect(() => { cargarTodo(); }...)`, agregar:

```javascript
  useEffect(() => {
    if (!formulaSalmueraNombre || mpsFormula.length === 0) {
      setFormulaSalmueraIngs([]);
      return;
    }
    (async () => {
      const { data: rows } = await supabase
        .from('formulaciones')
        .select('ingrediente_nombre,gramos,materia_prima_id')
        .eq('nombre', formulaSalmueraNombre);
      const ings = (rows || []).map(r => {
        const mp = mpsFormula.find(m => m.id === r.materia_prima_id)
          || mpsFormula.find(m => (m.nombre_producto||m.nombre||'').toLowerCase() === (r.ingrediente_nombre||'').toLowerCase());
        return {
          nombre: r.ingrediente_nombre,
          gramos: parseFloat(r.gramos) || 0,
          precioKg: parseFloat(mp?.precio_kg || 0),
          costo: (parseFloat(r.gramos) / 1000) * parseFloat(mp?.precio_kg || 0),
        };
      });
      setFormulaSalmueraIngs(ings);
    })();
  }, [formulaSalmueraNombre, mpsFormula]);
```

- [ ] **Step 4: Cargar config guardada de fórmula y rub**

En `cargarTodo()`, dentro del bloque `if (cfg)` que carga la config (alrededor de `if (c.pct_inj)`), agregar:

```javascript
        if (c.formula_salmuera) setFormulaSalmueraNombre(c.formula_salmuera);
        if (c.pct_rub)          setPctRub(String(c.pct_rub));
        if (c.costo_rub_kg)     setCostoRubKg(String(c.costo_rub_kg));
```

- [ ] **Step 5: Guardar formula_salmuera, _categoria, rub en guardarConfig()**

Reemplazar el objeto `newConfig` en `guardarConfig()`:

```javascript
    const newConfig = {
      pct_inj:           parseFloat(pctInj)         || 0,
      pct_mad:           parseFloat(pctMad)          || 0,
      pct_res_segunda:   parseFloat(pctResSegunda)   || 0,
      pct_puntas:        parseFloat(pctPuntas)       || 0,
      pct_desecho:       parseFloat(pctDesecho)      || 0,
      costo_mad_padre:   parseFloat(costoMadPadre)   || 0,
      formula_salmuera:  formulaSalmueraNombre        || '',
      pct_rub:           parseFloat(pctRub)          || 0,
      costo_rub_kg:      parseFloat(costoRubKg)      || 0,
      tipo,
      _categoria:        'CORTES',
      _updated:          new Date().toISOString(),
    };
```

- [ ] **Step 6: Calcular costos de salmuera derivados del selector**

Antes del `return (` del componente (cerca de `const cFinalActual = getCFinal();`), agregar:

```javascript
  // Costos salmuera desde fórmula seleccionada
  const totalGrFormula    = formulaSalmueraIngs.reduce((s, i) => s + i.gramos, 0);
  const costoTotalFormula = formulaSalmueraIngs.reduce((s, i) => s + i.costo,  0);
  const totalKgFormula    = totalGrFormula / 1000;
  const precioKgSalmuera  = totalKgFormula > 0 ? costoTotalFormula / totalKgFormula : 0;
```

- [ ] **Step 7: Reemplazar el bloque de Fase 1 — Inyección en Tab Costos 1kg**

Buscar el bloque que empieza con `{/* Fase 1: Inyección */}` (línea ~329 en el render del tipo padre/independiente) y reemplazarlo por:

```jsx
                {/* Fase 1: Inyección */}
                <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                  <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', padding: '10px 16px' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>💉 Fase 1 — Inyección de Salmuera</span>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>% Inyección</label>
                        <input type="number" min="0" max="100" step="0.1" placeholder="ej: 20"
                          value={pctInj} onChange={e => setPctInj(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #2980b9', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#2980b9', fontWeight: 600, display: 'block', marginBottom: 4 }}>Fórmula Salmuera</label>
                        <select value={formulaSalmueraNombre} onChange={e => setFormulaSalmueraNombre(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #2980b9', fontSize: 13, background: 'white', boxSizing: 'border-box' }}>
                          <option value="">— seleccionar —</option>
                          {formulaciones.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>

                    {formulaSalmueraIngs.length > 0 && (
                      <div style={{ background: '#eaf4fd', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 11 }}>
                        {formulaSalmueraIngs.map((ing, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: '#2980b9' }}>
                            <span>{ing.nombre} ({ing.gramos}g)</span>
                            <span>${ing.costo.toFixed(4)}</span>
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid #aed6f1', marginTop: 4, paddingTop: 4, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                          <span>Costo/kg salmuera</span>
                          <span>${precioKgSalmuera.toFixed(4)}</span>
                        </div>
                      </div>
                    )}

                    {/* Rub */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#8e44ad', fontWeight: 600, display: 'block', marginBottom: 4 }}>% Rub / kg carne</label>
                        <input type="number" min="0" step="0.1" placeholder="ej: 2.5"
                          value={pctRub} onChange={e => setPctRub(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #8e44ad', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#8e44ad', fontWeight: 600, display: 'block', marginBottom: 4 }}>Precio Rub ($/kg)</label>
                        <input type="number" min="0" step="0.01" placeholder="ej: 3.50"
                          value={costoRubKg} onChange={e => setCostoRubKg(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #8e44ad', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
                      </div>
                    </div>

                    {(() => {
                      const pctInjN  = parseFloat(pctInj)     || 0;
                      const pctRubN  = parseFloat(pctRub)     || 0;
                      const rubKgN   = parseFloat(costoRubKg) || 0;
                      const kgSal1   = pctInjN / 100;
                      const PT       = 1 + kgSal1;
                      const costoSal = kgSal1 * precioKgSalmuera;
                      const costoRub = (pctRubN / 100) * rubKgN;
                      const CI       = precioCarne + costoSal + costoRub;
                      const CB       = PT > 0 ? CI / PT : 0;
                      if (!pctInjN || !precioCarne) return null;
                      return (
                        <div style={{ background: '#f0f8ff', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 }}>Para 1 kg de carne:</div>
                          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.8 }}>
                            <div>CI = ${precioCarne.toFixed(4)} + ${costoSal.toFixed(4)} + ${costoRub.toFixed(4)} = <strong>${CI.toFixed(4)}</strong></div>
                            <div>PT = 1 + {kgSal1.toFixed(3)} kg salmuera = <strong>{PT.toFixed(3)} kg</strong></div>
                            <div style={{ borderTop: '1px solid #dde3ea', paddingTop: 6, marginTop: 4 }}>
                              CB = CI ÷ PT = <strong style={{ fontSize: 15, color: '#1a3a5c' }}>${CB.toFixed(4)}/kg</strong>
                              <span style={{ color: '#27ae60', marginLeft: 8, fontSize: 11 }}>↓ el agua baja el costo</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
```

- [ ] **Step 8: Commit**

```bash
git add src/components/formulacion/VistaCorte.js
git commit -m "CORTES VistaCorte: selector salmuera, fórmula CB=CI/PT, campos Rub, guarda _categoria CORTES"
```

---

## Task 3: VistaCorte.js — Tab Cierre Sierra (nuevo tab)

**Files:**
- Modify: `src/components/formulacion/VistaCorte.js`

- [ ] **Step 1: Agregar estado Cierre Sierra**

Después de los estados de Pruebas (alrededor de `const [pruebaEtiSel...]`), agregar:

```javascript
  // Cierre Sierra
  const [cierreFecha,       setCierreFecha]       = useState(new Date().toISOString().split('T')[0]);
  const [cierreKgHueso,     setCierreKgHueso]     = useState('');
  const [cierreKgAserrin,   setCierreKgAserrin]   = useState('');
  const [cierrePrecioAserrin, setCierrePrecioAserrin] = useState('');
  const [cierreKgCarnudo,   setCierreKgCarnudo]   = useState('');
  const [cierrePrecioCarnudo, setCierrePrecioCarnudo] = useState('');
  const [cierreNotas,       setCierreNotas]       = useState('');
  const [historicoCierres,  setHistoricoCierres]  = useState([]);
  const [guardandoCierre,   setGuardandoCierre]   = useState(false);
  const [errorCierre,       setErrorCierre]       = useState('');
  const [kgCortesDia,       setKgCortesDia]       = useState(0);
```

- [ ] **Step 2: Cargar histórico de cierres en cargarTodo()**

Al final del bloque `try` en `cargarTodo()`, agregar:

```javascript
      const { data: cierres } = await supabase
        .from('cierre_sierra_diario')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(30);
      setHistoricoCierres(cierres || []);
```

- [ ] **Step 3: Agregar tab "Cierre" al array de tabs**

Buscar `const tabs = [` y agregar un quinto tab:

```javascript
  const tabs = [
    ['costos',    '📐 Costos 1 kg'],
    ['pruebas',   '🧪 Pruebas'],
    ['produccion','📦 Producción'],
    ['historial', '📋 Historial'],
    ['cierre',    '🪚 Cierre Sierra'],
  ];
```

- [ ] **Step 4: Función guardarCierre()**

Antes del `return (` del componente, agregar:

```javascript
  async function guardarCierre() {
    const hoy = cierreFecha || new Date().toISOString().split('T')[0];
    const kgH = parseFloat(cierreKgHueso)       || 0;
    const kgA = parseFloat(cierreKgAserrin)     || 0;
    const pA  = parseFloat(cierrePrecioAserrin) || 0;
    const kgC = parseFloat(cierreKgCarnudo)     || 0;
    const pC  = parseFloat(cierrePrecioCarnudo) || 0;

    // Kg de cortes producidos ese día (desde stock_lotes_inyectados)
    const { data: lotesHoy } = await supabase
      .from('stock_lotes_inyectados')
      .select('kg_inicial')
      .eq('fecha_entrada', hoy);
    const kgDia = (lotesHoy || []).reduce((s, l) => s + parseFloat(l.kg_inicial || 0), 0);
    setKgCortesDia(kgDia);

    const valorSub = (kgA * pA) + (kgC * pC);
    const fi = kgDia > 0 ? valorSub / kgDia : 0;

    setGuardandoCierre(true);
    setErrorCierre('');
    try {
      await supabase.from('cierre_sierra_diario').insert({
        fecha: hoy,
        kg_hueso: kgH,
        kg_aserrin: kgA, precio_aserrin_kg: pA,
        kg_carnudo: kgC, precio_carnudo_kg: pC,
        valor_subproductos: valorSub,
        kg_cortes_producidos: kgDia,
        factor_impacto_kg: fi,
        notas: cierreNotas || null,
        usuario_nombre: '',
      });
      const { data: cierres } = await supabase
        .from('cierre_sierra_diario')
        .select('*').order('fecha', { ascending: false }).limit(30);
      setHistoricoCierres(cierres || []);
      setCierreKgHueso(''); setCierreKgAserrin(''); setCierrePrecioAserrin('');
      setCierreKgCarnudo(''); setCierrePrecioCarnudo(''); setCierreNotas('');
    } catch (e) {
      setErrorCierre('Error: ' + e.message);
    }
    setGuardandoCierre(false);
  }
```

- [ ] **Step 5: Agregar render del Tab Cierre Sierra**

Justo antes del `</div>` de cierre del return del componente (al final del JSX), agregar:

```jsx
      {/* ══════════════════════════════════════════
          TAB CIERRE SIERRA
      ══════════════════════════════════════════ */}
      {tabActivo === 'cierre' && (() => {
        const kgH  = parseFloat(cierreKgHueso)       || 0;
        const kgA  = parseFloat(cierreKgAserrin)     || 0;
        const pA   = parseFloat(cierrePrecioAserrin) || 0;
        const kgC  = parseFloat(cierreKgCarnudo)     || 0;
        const pC   = parseFloat(cierrePrecioCarnudo) || 0;
        const valorSub = (kgA * pA) + (kgC * pC);
        const fi   = kgCortesDia > 0 ? valorSub / kgCortesDia : 0;
        const avgFi = historicoCierres.length > 0
          ? historicoCierres.reduce((s, c) => s + parseFloat(c.factor_impacto_kg || 0), 0) / historicoCierres.length
          : 0;
        return (
          <div>
            <div style={{ background: 'white', borderRadius: 12, padding: '16px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 14, marginBottom: 12 }}>🪚 Cierre Diario — Merma Sierra</div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Fecha</label>
                <input type="date" value={cierreFecha} onChange={e => setCierreFecha(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>Kg Hueso ($0)</label>
                  <input type="number" min="0" step="0.001" placeholder="0.000"
                    value={cierreKgHueso} onChange={e => setCierreKgHueso(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #7f8c8d', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#e67e22', display: 'block', marginBottom: 4 }}>Kg Aserrín</label>
                  <input type="number" min="0" step="0.001" placeholder="0.000"
                    value={cierreKgAserrin} onChange={e => setCierreKgAserrin(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #e67e22', fontSize: 13, boxSizing: 'border-box' }} />
                  <input type="number" min="0" step="0.01" placeholder="$/kg"
                    value={cierrePrecioAserrin} onChange={e => setCierrePrecioAserrin(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e67e22', fontSize: 12, boxSizing: 'border-box', marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#e74c3c', display: 'block', marginBottom: 4 }}>Kg Carnudo</label>
                  <input type="number" min="0" step="0.001" placeholder="0.000"
                    value={cierreKgCarnudo} onChange={e => setCierreKgCarnudo(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #e74c3c', fontSize: 13, boxSizing: 'border-box' }} />
                  <input type="number" min="0" step="0.01" placeholder="$/kg"
                    value={cierrePrecioCarnudo} onChange={e => setCierrePrecioCarnudo(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e74c3c', fontSize: 12, boxSizing: 'border-box', marginTop: 4 }} />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Notas</label>
                <input type="text" placeholder="Observaciones opcionales"
                  value={cierreNotas} onChange={e => setCierreNotas(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {(kgA > 0 || kgC > 0) && (
                <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#555' }}>
                    Valor aserrín: ${(kgA * pA).toFixed(4)} · Valor carnudo: ${(kgC * pC).toFixed(4)}
                  </div>
                  <div style={{ fontWeight: 700, color: '#27ae60', fontSize: 13, marginTop: 4 }}>
                    Valor total sub-productos: ${valorSub.toFixed(4)}
                  </div>
                  {kgCortesDia > 0 && (
                    <div style={{ color: '#2980b9', fontSize: 12, marginTop: 4 }}>
                      KG Cortes producidos hoy: {kgCortesDia.toFixed(3)} kg
                      <br />Factor impacto: <strong>${fi.toFixed(4)}/kg</strong> (crédito al costo)
                    </div>
                  )}
                </div>
              )}

              {errorCierre && (
                <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '8px 12px', color: '#e74c3c', fontSize: 12, marginBottom: 8 }}>{errorCierre}</div>
              )}

              <button onClick={guardarCierre} disabled={guardandoCierre} style={{
                width: '100%', padding: 12, background: guardandoCierre ? '#aaa' : '#1a3a5c',
                color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: guardandoCierre ? 'default' : 'pointer',
              }}>
                {guardandoCierre ? '⏳ Guardando...' : '💾 Registrar Cierre'}
              </button>
            </div>

            {/* Histórico */}
            {historicoCierres.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>📋 Historial ({historicoCierres.length})</span>
                  {avgFi > 0 && <span style={{ color: '#27ae60', fontSize: 12 }}>Promedio FI: ${avgFi.toFixed(4)}/kg</span>}
                </div>
                {historicoCierres.map(c => (
                  <div key={c.id} style={{ borderTop: '1px solid #f0f0f0', padding: '8px 0', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555' }}>
                    <span>{c.fecha}</span>
                    <span>H:{parseFloat(c.kg_hueso||0).toFixed(1)}kg · A:{parseFloat(c.kg_aserrin||0).toFixed(1)}kg · C:{parseFloat(c.kg_carnudo||0).toFixed(1)}kg</span>
                    <span style={{ fontWeight: 700, color: '#27ae60' }}>${parseFloat(c.factor_impacto_kg||0).toFixed(4)}/kg</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/formulacion/VistaCorte.js
git commit -m "CORTES VistaCorte: tab Cierre Sierra — registro merma sierra, factor impacto, historial"
```

---

## Task 4: TabMaduracion.js — Estados + detección CORTES Padre

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

- [ ] **Step 1: Agregar estados para el wizard CORTES**

Buscar el bloque `const [modalHorneado, setModalHorneado]` (línea ~35) y DESPUÉS del bloque de estados existentes, agregar:

```javascript
  // ── Wizard separación CORTES Padre/Hijo ──
  const [modalCortesWizard, setModalCortesWizard] = useState(null);
  // { loteId, lotesMadId, kgMad, costoTotal, corteNombrePadre, corteNombreHijo, mpPadreId, formulaSalmuera }
  const [cortesWizardPaso,  setCortesWizardPaso]  = useState(1);
  const [cortesKgPadre,     setCortesKgPadre]     = useState('');
  const [cortesSpItems,     setCortesSpItems]     = useState([]);
  // cortesSpItems: [{ tipo: 'nueva_mp'|'perdida', nombre: '', kg: '', precio: '', mp_id: null }]
  const [guardandoCortes,   setGuardandoCortes]   = useState(false);
  const [errorCortes,       setErrorCortes]       = useState('');
  const [mpsParaCortes,     setMpsParaCortes]     = useState([]);
```

- [ ] **Step 2: Agregar función helper esCortesPadreLote()**

Después de la función `esInmersionLote()`, agregar:

```javascript
  function esCortesPadreLote(lote, cfgs) {
    const formulaSal = (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
    if (!formulaSal) return false;
    const cfg = cfgs.find(hc =>
      formulaSal === (hc.config?.formula_salmuera || '').toLowerCase()
    ) || cfgs.find(hc =>
      formulaSal && (hc.config?.formula_salmuera || '') &&
      formulaSal.includes((hc.config?.formula_salmuera || '').toLowerCase())
    );
    const cat = (cfg?.config?._categoria || '').replace(/[ÓÒ]/g, 'O').toUpperCase();
    return cat.includes('CORTES') && cfg?.config?.tipo === 'padre';
  }
```

- [ ] **Step 3: Commit (solo estados y helper)**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "CORTES TabMaduracion: estados wizard Padre/Hijo + helper esCortesPadreLote"
```

---

## Task 5: TabMaduracion.js — Interceptar confirmarPesaje para CORTES Padre

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

- [ ] **Step 1: Detectar CORTES Padre al inicio de confirmarPesaje()**

Al inicio de `confirmarPesaje()`, justo después de `setError('');` y antes del try, agregar:

```javascript
    const formulaSalActual = (modalPesaje.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
    const cfgCortesEntry   = horneadoCfgs.find(hc =>
      formulaSalActual && formulaSalActual === (hc.config?.formula_salmuera || '').toLowerCase()
    );
    const esCortesPadre = cfgCortesEntry &&
      (cfgCortesEntry.config?._categoria || '').replace(/[ÓÒ]/g, 'O').toUpperCase().includes('CORTES') &&
      cfgCortesEntry.config?.tipo === 'padre';
```

- [ ] **Step 2: En el for loop, skip inventario/stock para CORTES Padre**

Buscar en `confirmarPesaje()` el bloque `if (mpId) {` que hace los inserts de inventario y stock (líneas ~261-305). Envolver todo ese bloque `if (mpId)` con:

```javascript
        if (mpId) {
          if (!esCortesPadre) {
            // ── FLUJO NORMAL: actualizar inventario y stock ──
            const { data: inv } = await supabase.from('inventario_mp')
              .select('id, stock_kg').eq('materia_prima_id', mpId).maybeSingle();
            if (inv) {
              await supabase.from('inventario_mp')
                .update({ stock_kg: (inv.stock_kg || 0) + kgMad }).eq('id', inv.id);
            } else {
              await supabase.from('inventario_mp').insert({
                materia_prima_id: mpId, stock_kg: kgMad, nombre: p.corte_nombre,
              });
            }
            await supabase.from('inventario_movimientos').insert({
              materia_prima_id: mpId, nombre_mp: p.corte_nombre,
              tipo: 'entrada', kg: kgMad,
              motivo: `Pesaje maduración — Lote ${modalPesaje.lote_id}`,
              usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
            });
            const { data: stockEntry } = await supabase.from('stock_lotes_inyectados').insert({
              lote_id:            modalPesaje.lote_id,
              lote_maduracion_id: modalPesaje.id,
              corte_nombre:       p.corte_nombre,
              materia_prima_id:   mpId,
              kg_inicial:         kgMad,
              kg_disponible:      kgMad,
              fecha_entrada:      hoy,
              kg_inyectado:       kgInj,
              costo_total:        costoTotal,
              costo_iny_kg:       costoInyKg,
              costo_mad_kg:       costoMadKg,
            }).select('id').single();

            if (deshueseMap[p.corte_nombre] && stockEntry) {
              deshueseEntries.push({
                corteNombre: p.corte_nombre,
                nombreHijo:  deshueseMap[p.corte_nombre],
                stockId:     stockEntry.id,
                kgMad, cMadKg: costoMadKg, costoTotal,
                loteId: modalPesaje.lote_id,
              });
            }
          } else {
            // ── CORTES PADRE: guardar mpId para el wizard ──
            cortesWizardMpPadreId = mpId;
            cortesWizardKgMad     = kgMad;
            cortesWizardCosto     = costoTotal;
            cortesWizardNombre    = p.corte_nombre;
          }
        }
```

Antes del for loop, declarar las variables temporales:
```javascript
      let cortesWizardMpPadreId = null;
      let cortesWizardKgMad     = 0;
      let cortesWizardCosto     = 0;
      let cortesWizardNombre    = '';
```

- [ ] **Step 3: Después del for loop, si esCortesPadre abrir wizard**

Buscar el bloque después del for loop que empieza `// Marcar lote completado`. Justo DESPUÉS de `setModalPesaje(null); await cargar();` y ANTES de `const formulaSal = ...`, insertar:

```javascript
      // ── Si es CORTES Padre, abrir wizard de separación ──
      if (esCortesPadre && cortesWizardMpPadreId) {
        const { data: deshCfg } = await supabase
          .from('deshuese_config')
          .select('corte_hijo')
          .eq('corte_padre', cortesWizardNombre)
          .eq('activo', true)
          .maybeSingle();

        const { data: allMps } = await supabase
          .from('materias_primas')
          .select('id, nombre, nombre_producto, precio_kg, categoria')
          .eq('eliminado', false);
        setMpsParaCortes(allMps || []);

        setModalCortesWizard({
          loteId:          loteIdGuardado,
          lotesMadId:      modalPesaje.id,
          kgMad:           cortesWizardKgMad,
          costoTotal:      cortesWizardCosto,
          corteNombrePadre: cortesWizardNombre,
          corteNombreHijo: deshCfg?.corte_hijo || '',
          mpPadreId:       cortesWizardMpPadreId,
          formulaSalmuera: formulaSalActual,
        });
        setCortesWizardPaso(1);
        setCortesKgPadre('');
        setCortesSpItems([]);
        setErrorCortes('');
        setGuardando(false);
        return;
      }
```

- [ ] **Step 4: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "CORTES TabMaduracion: confirmarPesaje detecta Padre, skip stock, abre wizard"
```

---

## Task 6: TabMaduracion.js — confirmarSeparacionCortes()

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

- [ ] **Step 1: Agregar la función confirmarSeparacionCortes()**

Después de la función `completarInmersion()`, agregar:

```javascript
  // ── Separación Padre/Hijo para lotes CORTES ──
  async function confirmarSeparacionCortes() {
    if (!modalCortesWizard) return;
    const { loteId, lotesMadId, kgMad, costoTotal, corteNombrePadre, corteNombreHijo, mpPadreId, formulaSalmuera } = modalCortesWizard;

    const kgPadre = parseFloat(cortesKgPadre) || 0;
    if (kgPadre <= 0 || kgPadre >= kgMad) {
      setErrorCortes('El peso Padre debe ser mayor que 0 y menor que el total madurado');
      return;
    }
    const kgHijoTotal = parseFloat((kgMad - kgPadre).toFixed(3));

    // Sub-productos del Hijo
    let creditoHijo  = 0;
    let kgSpTotal    = 0;
    for (const sp of cortesSpItems) {
      const kg = parseFloat(sp.kg) || 0;
      kgSpTotal += kg;
      if (sp.tipo !== 'perdida') creditoHijo += kg * (parseFloat(sp.precio) || 0);
    }
    const kgFinalHijo = Math.max(0, parseFloat((kgHijoTotal - kgSpTotal).toFixed(3)));

    // Distribución de costo proporcional
    const fracHijo        = kgMad > 0 ? kgHijoTotal / kgMad : 0;
    const costoBaseHijo   = costoTotal * fracHijo;
    const costoFinalHijo  = Math.max(0, costoBaseHijo - creditoHijo);
    const costoFinalPadre = costoTotal - costoBaseHijo;
    const cFinalPadre     = kgPadre    > 0 ? costoFinalPadre / kgPadre    : 0;
    const cFinalHijo      = kgFinalHijo > 0 ? costoFinalHijo  / kgFinalHijo : 0;

    setGuardandoCortes(true);
    setErrorCortes('');
    try {
      const hoy        = new Date().toISOString().split('T')[0];
      const loteIdHijo = loteId + '-H';

      // ── PADRE ──
      const { data: invPadre } = await supabase.from('inventario_mp')
        .select('id, stock_kg').eq('materia_prima_id', mpPadreId).maybeSingle();
      if (invPadre) {
        await supabase.from('inventario_mp').update({ stock_kg: (invPadre.stock_kg || 0) + kgPadre }).eq('id', invPadre.id);
      } else {
        await supabase.from('inventario_mp').insert({ materia_prima_id: mpPadreId, stock_kg: kgPadre, nombre: corteNombrePadre });
      }
      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: mpPadreId, nombre_mp: corteNombrePadre,
        tipo: 'entrada', kg: kgPadre,
        motivo: `Separación Padre — Lote ${loteId}`,
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
      });
      await supabase.from('stock_lotes_inyectados').insert({
        lote_id: loteId, lote_maduracion_id: lotesMadId,
        corte_nombre: corteNombrePadre, materia_prima_id: mpPadreId,
        kg_inicial: kgPadre, kg_disponible: kgPadre, fecha_entrada: hoy,
        kg_inyectado: kgPadre,
        costo_total: costoFinalPadre, costo_iny_kg: cFinalPadre, costo_mad_kg: cFinalPadre,
        tipo_corte: 'padre', formula_salmuera: formulaSalmuera,
      });

      // ── HIJO ──
      if (corteNombreHijo && kgFinalHijo > 0) {
        const { data: mpHijoEx } = await supabase.from('materias_primas')
          .select('id').eq('nombre', corteNombreHijo).eq('categoria', 'Inyectados').maybeSingle();
        let mpHijoId = mpHijoEx?.id;
        if (!mpHijoId) {
          const { data: existIds } = await supabase.from('materias_primas').select('id').eq('categoria', 'Inyectados');
          const nums   = (existIds || []).map(m => parseInt((m.id || '').replace(/\D/g,'') || '0')).filter(n => !isNaN(n));
          const nextN  = nums.length > 0 ? Math.max(...nums) + 1 : 1;
          const { data: nuevaMp } = await supabase.from('materias_primas').insert({
            id: 'INY' + String(nextN).padStart(3,'0'),
            nombre: corteNombreHijo, nombre_producto: corteNombreHijo,
            categoria: 'Inyectados', precio_kg: 0,
            tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
          }).select('id').single();
          mpHijoId = nuevaMp?.id;
        }
        if (mpHijoId) {
          const { data: invH } = await supabase.from('inventario_mp')
            .select('id, stock_kg').eq('materia_prima_id', mpHijoId).maybeSingle();
          if (invH) {
            await supabase.from('inventario_mp').update({ stock_kg: (invH.stock_kg || 0) + kgFinalHijo }).eq('id', invH.id);
          } else {
            await supabase.from('inventario_mp').insert({ materia_prima_id: mpHijoId, stock_kg: kgFinalHijo, nombre: corteNombreHijo });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: mpHijoId, nombre_mp: corteNombreHijo,
            tipo: 'entrada', kg: kgFinalHijo,
            motivo: `Separación Hijo — Lote ${loteId}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });
          await supabase.from('stock_lotes_inyectados').insert({
            lote_id: loteIdHijo, lote_maduracion_id: lotesMadId,
            corte_nombre: corteNombreHijo, materia_prima_id: mpHijoId,
            kg_inicial: kgFinalHijo, kg_disponible: kgFinalHijo, fecha_entrada: hoy,
            kg_inyectado: kgHijoTotal,
            costo_total: costoFinalHijo, costo_iny_kg: cFinalHijo, costo_mad_kg: cFinalHijo,
            tipo_corte: 'hijo', parent_lote_id: loteId, formula_salmuera: formulaSalmuera,
          });

          // Sub-productos con valor → sumar a inventario
          for (const sp of cortesSpItems) {
            const kg = parseFloat(sp.kg) || 0;
            if (kg <= 0 || sp.tipo === 'perdida' || !sp.mp_id) continue;
            const { data: invSp } = await supabase.from('inventario_mp')
              .select('id, stock_kg').eq('materia_prima_id', sp.mp_id).maybeSingle();
            if (invSp) {
              await supabase.from('inventario_mp').update({ stock_kg: (invSp.stock_kg || 0) + kg }).eq('id', invSp.id);
            } else {
              await supabase.from('inventario_mp').insert({ materia_prima_id: sp.mp_id, stock_kg: kg, nombre: sp.nombre });
            }
            await supabase.from('inventario_movimientos').insert({
              materia_prima_id: sp.mp_id, nombre_mp: sp.nombre,
              tipo: 'entrada', kg,
              motivo: `Sub-producto Hijo Lote ${loteIdHijo}`,
              usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
            });
          }
        }
      }

      setModalCortesWizard(null);
      setCortesKgPadre('');
      setCortesSpItems([]);
      setExito(`✅ Separación completa — ${kgPadre.toFixed(3)} kg ${corteNombrePadre} + ${kgFinalHijo.toFixed(3)} kg ${corteNombreHijo}`);
      setTimeout(() => setExito(''), 8000);
      await cargar();
    } catch (e) {
      setErrorCortes('Error: ' + e.message);
    }
    setGuardandoCortes(false);
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "CORTES TabMaduracion: confirmarSeparacionCortes — inserta Padre e Hijo en stock con costos proporcionales"
```

---

## Task 7: TabMaduracion.js — Wizard JSX Padre/Hijo

**Files:**
- Modify: `src/components/produccion/TabMaduracion.js`

- [ ] **Step 1: Agregar JSX del wizard después del modal de horneado**

Buscar `{/* ══ Modal Horneado — Pastrame — Wizard 3 pasos ══ */}` (línea ~1608) y DESPUÉS del bloque `{modalHorneado && (...)}`, agregar el wizard de CORTES:

```jsx
      {/* ══ Wizard CORTES — Separación Padre / Hijo ══ */}
      {modalCortesWizard && (() => {
        const { kgMad, costoTotal, corteNombrePadre, corteNombreHijo } = modalCortesWizard;
        const kgPadreN   = parseFloat(cortesKgPadre) || 0;
        const kgHijoN    = kgPadreN > 0 ? parseFloat((kgMad - kgPadreN).toFixed(3)) : 0;
        const listoP1    = kgPadreN > 0 && kgPadreN < kgMad;

        // Cálculo resumen paso 2
        let creditoHijo = 0, kgSpTotal = 0;
        cortesSpItems.forEach(sp => {
          const kg = parseFloat(sp.kg) || 0;
          kgSpTotal += kg;
          if (sp.tipo !== 'perdida') creditoHijo += kg * (parseFloat(sp.precio) || 0);
        });
        const kgFinalHijo     = Math.max(0, parseFloat((kgHijoN - kgSpTotal).toFixed(3)));
        const fracHijo        = kgMad > 0 ? kgHijoN / kgMad : 0;
        const costoBaseHijo   = costoTotal * fracHijo;
        const costoFinalHijo  = Math.max(0, costoBaseHijo - creditoHijo);
        const costoFinalPadre = costoTotal - costoBaseHijo;
        const cFinalPadre     = kgPadreN    > 0 ? costoFinalPadre / kgPadreN    : 0;
        const cFinalHijo      = kgFinalHijo > 0 ? costoFinalHijo  / kgFinalHijo : 0;

        const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
        const box     = { background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' };

        return (
          <div style={overlay}>
            <div style={box}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', borderRadius: '16px 16px 0 0', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: 'white', fontWeight: 900, fontSize: 15 }}>✂️ Separación Padre / Hijo</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>Total madurado: {kgMad.toFixed(3)} kg · Paso {cortesWizardPaso}/2</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2].map(n => (
                    <div key={n} style={{ width: 28, height: 28, borderRadius: '50%', background: cortesWizardPaso >= n ? 'white' : 'rgba(255,255,255,0.3)', color: cortesWizardPaso >= n ? '#1a3a5c' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>{n}</div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 20 }}>
                {/* ── PASO 1: División kg ── */}
                {cortesWizardPaso === 1 && (
                  <>
                    <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: 14, fontSize: 14 }}>¿Cuántos kg se quedan como {corteNombrePadre}?</div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>👑 KG para {corteNombrePadre} (Padre)</label>
                      <input
                        type="number" min="0.001" max={kgMad - 0.001} step="0.001"
                        placeholder={`0 – ${kgMad.toFixed(3)}`}
                        value={cortesKgPadre}
                        onChange={e => { setCortesKgPadre(e.target.value); setErrorCortes(''); }}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #1a3a5c', fontSize: 16, fontWeight: 'bold', boxSizing: 'border-box' }}
                        autoFocus
                      />
                    </div>

                    {listoP1 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#f0f8ff', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>👑 {corteNombrePadre}</div>
                          <div style={{ fontWeight: 900, color: '#1a3a5c', fontSize: 18 }}>{kgPadreN.toFixed(3)} kg</div>
                          <div style={{ fontSize: 11, color: '#27ae60' }}>${cFinalPadre.toFixed(4)}/kg</div>
                        </div>
                        <div style={{ background: '#f5f0ff', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>🔀 {corteNombreHijo || 'Hijo'}</div>
                          <div style={{ fontWeight: 900, color: '#6c3483', fontSize: 18 }}>{kgHijoN.toFixed(3)} kg</div>
                          <div style={{ fontSize: 11, color: '#27ae60' }}>${(kgMad > 0 ? (costoTotal - costoFinalPadre) / kgHijoN : 0).toFixed(4)}/kg</div>
                        </div>
                      </div>
                    )}

                    {errorCortes && <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '8px 12px', color: '#e74c3c', fontSize: 12, marginBottom: 10 }}>{errorCortes}</div>}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setModalCortesWizard(null)} style={{ flex: 1, padding: '11px', background: '#f0f2f5', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                      <button onClick={() => { if (!listoP1) { setErrorCortes('Ingresa un peso válido'); return; } setCortesWizardPaso(2); setErrorCortes(''); }} disabled={!listoP1}
                        style={{ flex: 2, padding: '11px', background: listoP1 ? 'linear-gradient(135deg,#1a3a5c,#2980b9)' : '#aaa', color: 'white', border: 'none', borderRadius: 10, cursor: listoP1 ? 'pointer' : 'default', fontSize: 13, fontWeight: 'bold' }}>
                        Siguiente → Sub-productos Hijo
                      </button>
                    </div>
                  </>
                )}

                {/* ── PASO 2: Sub-productos del Hijo ── */}
                {cortesWizardPaso === 2 && (
                  <>
                    <div style={{ fontWeight: 700, color: '#6c3483', marginBottom: 4, fontSize: 14 }}>🔀 Sub-productos del Hijo ({corteNombreHijo || 'Hijo'})</div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>KG disponibles para el hijo: {kgHijoN.toFixed(3)} kg</div>

                    {cortesSpItems.map((sp, idx) => (
                      <div key={idx} style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px', marginBottom: 8, position: 'relative' }}>
                        <button onClick={() => setCortesSpItems(prev => prev.filter((_, i) => i !== idx))}
                          style={{ position: 'absolute', top: 8, right: 8, background: '#e74c3c', color: 'white', border: 'none', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>×</button>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }}>Tipo</label>
                            <select value={sp.tipo} onChange={e => setCortesSpItems(prev => prev.map((s,i) => i===idx ? {...s, tipo: e.target.value, precio: e.target.value==='perdida' ? '0' : s.precio, mp_id: e.target.value==='perdida' ? null : s.mp_id} : s))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 12 }}>
                              <option value="perdida">Pérdida (sin valor)</option>
                              <option value="nueva_mp">MP con valor</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }}>Nombre</label>
                            {sp.tipo === 'nueva_mp' ? (
                              <select value={sp.mp_id || ''} onChange={e => {
                                const mp = mpsParaCortes.find(m => String(m.id) === e.target.value);
                                setCortesSpItems(prev => prev.map((s,i) => i===idx ? {...s, mp_id: e.target.value, nombre: mp ? (mp.nombre_producto||mp.nombre) : s.nombre, precio: mp ? String(mp.precio_kg||'') : s.precio} : s));
                              }} style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1.5px solid #27ae60', fontSize: 12 }}>
                                <option value="">— seleccionar MP —</option>
                                {mpsParaCortes.map(m => <option key={m.id} value={String(m.id)}>{m.nombre_producto||m.nombre}</option>)}
                              </select>
                            ) : (
                              <input type="text" placeholder="ej: Hueso" value={sp.nombre}
                                onChange={e => setCortesSpItems(prev => prev.map((s,i) => i===idx ? {...s, nombre: e.target.value} : s))}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 12 }} />
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }}>Kg</label>
                            <input type="number" min="0" step="0.001" placeholder="0.000" value={sp.kg}
                              onChange={e => setCortesSpItems(prev => prev.map((s,i) => i===idx ? {...s, kg: e.target.value} : s))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 12 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }}>{sp.tipo === 'perdida' ? 'Valor: $0' : '$/kg'}</label>
                            <input type="number" min="0" step="0.01" placeholder="0.00" value={sp.precio} disabled={sp.tipo === 'perdida'}
                              onChange={e => setCortesSpItems(prev => prev.map((s,i) => i===idx ? {...s, precio: e.target.value} : s))}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 12, background: sp.tipo === 'perdida' ? '#f8f8f8' : 'white' }} />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button onClick={() => setCortesSpItems(prev => [...prev, { tipo: 'perdida', nombre: '', kg: '', precio: '0', mp_id: null }])}
                      style={{ width: '100%', padding: '9px', background: '#f0f2f5', border: '1.5px dashed #bbb', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#666', marginBottom: 14 }}>
                      + Agregar sub-producto
                    </button>

                    {/* Resumen */}
                    <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#2c3e50)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 8, fontWeight: 'bold' }}>RESULTADO SEPARACIÓN</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>👑 {corteNombrePadre}</div>
                          <div style={{ color: '#7ec8f7', fontWeight: 900, fontSize: 16 }}>{kgPadreN.toFixed(3)} kg</div>
                          <div style={{ color: '#a9dfbf', fontSize: 11 }}>${cFinalPadre.toFixed(4)}/kg</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>🔀 {corteNombreHijo||'Hijo'}</div>
                          <div style={{ color: '#d7bde2', fontWeight: 900, fontSize: 16 }}>{kgFinalHijo.toFixed(3)} kg</div>
                          <div style={{ color: '#a9dfbf', fontSize: 11 }}>${cFinalHijo.toFixed(4)}/kg</div>
                        </div>
                      </div>
                      {creditoHijo > 0 && (
                        <div style={{ color: '#a9dfbf', fontSize: 11, marginTop: 8, textAlign: 'center' }}>Crédito sub-productos Hijo: −${creditoHijo.toFixed(4)}</div>
                      )}
                    </div>

                    {errorCortes && <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '8px 12px', color: '#e74c3c', fontSize: 12, marginBottom: 10 }}>{errorCortes}</div>}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setCortesWizardPaso(1)} style={{ flex: 1, padding: '11px', background: '#f0f2f5', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}>← Atrás</button>
                      <button onClick={confirmarSeparacionCortes} disabled={guardandoCortes}
                        style={{ flex: 2, padding: '11px', background: guardandoCortes ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)', color: 'white', border: 'none', borderRadius: 10, cursor: guardandoCortes ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                        {guardandoCortes ? '⏳ Guardando...' : '✅ Confirmar Separación'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
```

- [ ] **Step 2: Commit final**

```bash
git add src/components/produccion/TabMaduracion.js
git commit -m "CORTES TabMaduracion: wizard Padre/Hijo — Paso 1 kg, Paso 2 sub-productos, resumen costos"
```

---

## Task 8: Deploy y prueba end-to-end

- [ ] **Step 1: Push a GitHub (despliega a Vercel)**

```bash
git push
```

- [ ] **Step 2: Crear producto Padre en CORTES**
  - App → Formulación → Nuevo Producto → Categoría CORTES
  - Marcar "Tiene producto hijo", indicar nombre del Padre y del Hijo
  - Guardar

- [ ] **Step 3: Abrir el Padre → Tab Costos 1kg**
  - Seleccionar fórmula salmuera
  - Ingresar % Inyección
  - Verificar que CB = CI/PT se muestra correctamente
  - Guardar configuración

- [ ] **Step 4: Registrar producción desde Producción → Registrar**
  - Seleccionar corte padre, ingresar kg carne, completar inyección
  - Ir a TabMaduracion → cuando el lote esté listo, registrar pesaje
  - Verificar que abre wizard "Separación Padre/Hijo"

- [ ] **Step 5: Completar wizard**
  - Paso 1: ingresar kg para el Padre, verificar kg Hijo calculado
  - Paso 2: opcionalmente agregar sub-productos Hijo
  - Confirmar → verificar mensaje de éxito
  - Ir a VistaCorte del Padre y del Hijo → Tab Producción → verificar lotes

- [ ] **Step 6: Cierre Sierra**
  - Abrir cualquier CORTE → Tab Cierre Sierra
  - Registrar pesos de hueso, aserrín, carnudo
  - Verificar cálculo FI y guardar en historial
