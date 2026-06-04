# Hotmail Sync — Búsqueda por mes y vista previa con categorización

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La sincronización Hotmail busca emails del mes seleccionado en el Talonario y muestra una vista previa donde el usuario categoriza cada transacción como Personal o Empresa antes de cargar.

**Architecture:** Tres archivos modificados. `leer-emails-banco` recibe `mes`/`año`, calcula un rango amplio de búsqueda de emails, y solo guarda/retorna estados con `periodo_mes`/`periodo_año` que coincidan. `cargar-estado-cuenta` recibe un array `categorias` y enruta cada transacción a `talonario_pagos_personales` (Personal) o `talonario_pagos_banco` (Empresa). `HotmailSync.js` pasa mes/año del TalonarioContext, reemplaza "Cargar al Talonario" con un modal de preview con toggles.

**Tech Stack:** React, Supabase Edge Functions (Deno/TypeScript), Microsoft Graph API.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `supabase/functions/leer-emails-banco/index.ts` | Recibir mes/año, calcular rango, filtrar por periodo |
| `supabase/functions/cargar-estado-cuenta/index.ts` | Recibir categorias[], enrutar a tabla correcta |
| `src/components/contabilidad/talonario/hotmail/HotmailSync.js` | Pasar mes/año, modal de preview con categorización |

---

## Task 1: Edge function — búsqueda por mes/año

**Archivo:** `supabase/functions/leer-emails-banco/index.ts`

Contexto: La función actualmente hardcodea `desde = Date.now() - 45 días`. Vamos a recibir `mes` y `año` del frontend y calcular un rango dinámico: 30 días antes del primer día del mes hasta el último día del mes. Solo se procesan/retornan estados cuyo `periodo_mes` y `periodo_año` coincidan con lo solicitado.

- [ ] **Paso 1: Agregar helper `calcularRango` antes de `Deno.serve`**

Reemplazar el bloque actual de `const desde = ...` dentro del handler por un helper reutilizable. Agregar esta función justo antes de `Deno.serve(async (req) => {`:

```typescript
function calcularRango(mes: number, año: number): { desde: string; hasta: string } {
  const primerDia = new Date(año, mes - 1, 1);
  const desde = new Date(primerDia);
  desde.setDate(desde.getDate() - 30);
  const hasta = new Date(año, mes, 0, 23, 59, 59);
  return {
    desde: desde.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    hasta: hasta.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}
```

- [ ] **Paso 2: Recibir `mes` y `año` del body y calcular rango**

Dentro de `Deno.serve`, reemplazar:
```typescript
const { userId } = await req.json();
if (!userId) throw new Error('userId requerido');
// ...
const desde = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  .toISOString().replace(/\.\d{3}Z$/, 'Z');
```

Por:
```typescript
const { userId, mes, año } = await req.json();
if (!mes || !año) throw new Error('mes y año requeridos');
const { desde, hasta } = calcularRango(mes, año);
```

- [ ] **Paso 3: Actualizar la query de Graph API para usar `hasta`**

Reemplazar:
```typescript
const graphUrl = `https://graph.microsoft.com/v1.0/me/messages` +
  `?$filter=${encodeURIComponent(`receivedDateTime ge ${desde}`)}` +
  `&$orderby=${encodeURIComponent('receivedDateTime desc')}` +
  `&$count=true` +
  `&$top=50&$select=id,subject,receivedDateTime,body,hasAttachments`;
```

Por:
```typescript
const graphUrl = `https://graph.microsoft.com/v1.0/me/messages` +
  `?$filter=${encodeURIComponent(`receivedDateTime ge ${desde} and receivedDateTime le ${hasta}`)}` +
  `&$orderby=${encodeURIComponent('receivedDateTime desc')}` +
  `&$count=true` +
  `&$top=50&$select=id,subject,receivedDateTime,body,hasAttachments`;
```

- [ ] **Paso 4: Separar el check de emails ya procesados del filtro por período**

Reemplazar:
```typescript
const { data: existing } = await supabase
  .from('bank_statements')
  .select('ms_email_id, banco, ultimos4, periodo_mes, periodo_año, estado');
```

Por (dos queries separadas):
```typescript
// Todos los emails procesados (para no reprocesar con Claude)
const { data: allProcessed } = await supabase
  .from('bank_statements')
  .select('ms_email_id');

// Solo los del período solicitado (para mostrar como pendientes)
const { data: existing } = await supabase
  .from('bank_statements')
  .select('ms_email_id, banco, ultimos4, periodo_mes, periodo_año, estado')
  .eq('periodo_mes', mes)
  .eq('periodo_año', año);

const processedEmailIds = new Set((allProcessed || []).map((s: any) => s.ms_email_id));
```

Y eliminar la línea:
```typescript
const processedEmailIds = new Set((existing || []).map((s: any) => s.ms_email_id));
```

- [ ] **Paso 5: Filtrar inserts por periodo_mes/año**

Dentro del loop de emails, después de `if (!extracted?.es_estado_cuenta) continue;`, agregar:
```typescript
if (extracted.periodo_mes !== mes || extracted.periodo_año !== año) {
  console.log(`Email período ${extracted.periodo_mes}/${extracted.periodo_año} — no coincide con ${mes}/${año}, omitiendo`);
  continue;
}
```

- [ ] **Paso 6: Actualizar el check de `processedEmailIds` en el loop**

Reemplazar el bloque actual que usa `processedEmailIds.has(email.id)`:
```typescript
if (processedEmailIds.has(email.id)) {
  const stmt = (existing || []).find((s: any) => s.ms_email_id === email.id);
  if (stmt && stmt.estado === 'procesado') {
    const { data: fullStmt } = await supabase
      .from('bank_statements').select('*').eq('ms_email_id', email.id).single();
    if (fullStmt) pendientes.push(fullStmt);
  }
  continue;
}
```

Por:
```typescript
if (processedEmailIds.has(email.id)) {
  const stmtExisting = (existing || []).find((s: any) => s.ms_email_id === email.id);
  if (stmtExisting && stmtExisting.estado === 'procesado') {
    const { data: fullStmt } = await supabase
      .from('bank_statements').select('*').eq('ms_email_id', email.id).single();
    if (fullStmt) pendientes.push(fullStmt);
  }
  continue;
}
```

- [ ] **Paso 7: Desplegar la edge function**

```bash
npx supabase functions deploy leer-emails-banco --no-verify-jwt
```

Resultado esperado: `Deployed Functions on project cfrcdtxkdomwlnqnzgvb: leer-emails-banco`

- [ ] **Paso 8: Commit**

```bash
git add supabase/functions/leer-emails-banco/index.ts
git commit -m "feat(hotmail): búsqueda de emails filtrada por mes y año seleccionados"
```

---

## Task 2: HotmailSync.js — pasar mes/año al sincronizar

**Archivo:** `src/components/contabilidad/talonario/hotmail/HotmailSync.js`

Contexto: Agregar `MESES` al destructure de `useTalonario`, pasar `mes`/`año` a la edge function, actualizar el label del botón de sincronizar, y filtrar `cargarPendientes` por mes/año.

- [ ] **Paso 1: Agregar MESES al destructure de useTalonario**

Reemplazar:
```javascript
const { mes, año } = useTalonario();
```

Por:
```javascript
const { mes, año, MESES } = useTalonario();
```

- [ ] **Paso 2: Filtrar cargarPendientes por mes/año**

Reemplazar la función `cargarPendientes`:
```javascript
async function cargarPendientes() {
  const { data } = await supabase.from('bank_statements')
    .select('*')
    .eq('estado', 'procesado')
    .order('created_at', { ascending: false });
  setStatements(data || []);
}
```

Por:
```javascript
async function cargarPendientes() {
  const { data } = await supabase.from('bank_statements')
    .select('*')
    .eq('estado', 'procesado')
    .eq('periodo_mes', mes)
    .eq('periodo_año', año)
    .order('created_at', { ascending: false });
  setStatements(data || []);
}
```

- [ ] **Paso 3: Recargar pendientes cuando cambia mes/año**

Reemplazar:
```javascript
useEffect(() => { cargarToken(); }, []);
```

Por:
```javascript
useEffect(() => { cargarToken(); }, []);
useEffect(() => { if (tokenInfo) cargarPendientes(); }, [mes, año]);
```

- [ ] **Paso 4: Pasar mes/año a la edge function en sincronizar**

Reemplazar en la función `sincronizar`:
```javascript
const { data, error } = await supabase.functions.invoke('leer-emails-banco', {
  body: { userId: tokenInfo.user_id },
});
```

Por:
```javascript
const { data, error } = await supabase.functions.invoke('leer-emails-banco', {
  body: { userId: tokenInfo.user_id, mes, año },
});
```

- [ ] **Paso 5: Actualizar label del botón de sincronizar**

Reemplazar:
```javascript
{sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar estados de cuenta'}
```

Por:
```javascript
{sincronizando ? '⏳ Sincronizando...' : `🔄 Sincronizar ${MESES[mes - 1]} ${año}`}
```

- [ ] **Paso 6: Commit**

```bash
git add src/components/contabilidad/talonario/hotmail/HotmailSync.js
git commit -m "feat(hotmail): sincronizar filtra por mes/año seleccionado en Talonario"
```

---

## Task 3: Edge function — cargar con categorías Personal/Empresa

**Archivo:** `supabase/functions/cargar-estado-cuenta/index.ts`

Contexto: La función actualmente siempre inserta en `talonario_pagos_personales`. Vamos a recibir un array `categorias: { index: number, destino: 'personal' | 'empresa' }[]` y enrutar cada transacción a su tabla correcta. Si `categorias` no viene (compatibilidad hacia atrás), todo va a 'personal'.

- [ ] **Paso 1: Actualizar el handler para recibir categorias**

Reemplazar:
```typescript
const { statementId, userId } = await req.json();
```

Por:
```typescript
const { statementId, userId, categorias } = await req.json();
// categorias: Array<{ index: number, destino: 'personal' | 'empresa' }> | undefined
const catMap = new Map<number, 'personal' | 'empresa'>(
  (categorias || []).map((c: any) => [c.index, c.destino])
);
```

- [ ] **Paso 2: Separar filas en dos arrays y enrutar**

Reemplazar todo el bloque `const rows: any[] = [];` + el loop `for (const t of transacciones)` + el `if (rows.length > 0)` por:

```typescript
const personalRows: any[] = [];
const empresaRows: any[] = [];

for (let i = 0; i < transacciones.length; i++) {
  const t = transacciones[i];
  const categoria = categoriaDeTransaccion(t.tipo_transaccion || 'consumo', stmt.tipo_cuenta);
  if (!categoria) continue; // omitir pagos al banco

  const destino = catMap.size > 0 ? (catMap.get(i) || 'personal') : 'personal';

  let concepto = t.descripcion || '';
  if (t.cuota_actual && t.cuota_total) {
    concepto += ` (Cuota ${t.cuota_actual}/${t.cuota_total})`;
  }

  if (destino === 'empresa') {
    empresaRows.push({
      mes, año,
      fecha:        parseFecha(t.fecha),
      beneficiario: t.descripcion || stmt.banco,
      concepto,
      monto:        parseFloat(t.monto) || 0,
      forma_pago:   stmt.tipo_cuenta === 'tarjeta_credito' ? '19' : '20',
      comentario:   comentarioBase,
    });
  } else {
    personalRows.push({
      mes, año,
      fecha:        parseFecha(t.fecha),
      beneficiario: t.descripcion || stmt.banco,
      concepto,
      monto:        parseFloat(t.monto) || 0,
      categoria,
      forma_pago:   stmt.tipo_cuenta === 'tarjeta_credito' ? '19' : '20',
      comentario:   comentarioBase,
    });
  }
}

if (personalRows.length > 0) {
  await supabase.from('talonario_pagos_personales').insert(personalRows);
}
if (empresaRows.length > 0) {
  await supabase.from('talonario_pagos_banco').insert(empresaRows);
}
```

- [ ] **Paso 3: Actualizar el retorno para incluir conteo por tabla**

Reemplazar:
```typescript
return new Response(JSON.stringify({ ok: true, transacciones_cargadas: rows.length }),
```

Por:
```typescript
return new Response(JSON.stringify({
  ok: true,
  transacciones_cargadas: personalRows.length + empresaRows.length,
  personal: personalRows.length,
  empresa: empresaRows.length,
}),
```

- [ ] **Paso 4: Desplegar**

```bash
npx supabase functions deploy cargar-estado-cuenta --no-verify-jwt
```

Resultado esperado: `Deployed Functions on project cfrcdtxkdomwlnqnzgvb: cargar-estado-cuenta`

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/cargar-estado-cuenta/index.ts
git commit -m "feat(hotmail): categorizar transacciones como Personal o Empresa al cargar"
```

---

## Task 4: HotmailSync.js — modal de vista previa con categorización

**Archivo:** `src/components/contabilidad/talonario/hotmail/HotmailSync.js`

Contexto: Reemplazar el botón "Cargar al Talonario" en `TarjetaEstado` por "Ver transacciones". Al hacer clic se abre un modal inline con la lista de transacciones del estado. Cada transacción tiene un toggle Personal/Empresa. Los pagos (`tipo_transaccion === 'pago'`) se ocultan. Los préstamos se pre-seleccionan como Empresa; el resto como Personal.

- [ ] **Paso 1: Agregar estados nuevos en HotmailSync**

Agregar justo después de `const [cargando, setCargando] = useState(null);`:
```javascript
const [modalStmt,   setModalStmt]   = useState(null);
const [categorias,  setCategorias]  = useState({});
const [cargandoMod, setCargandoMod] = useState(false);
```

- [ ] **Paso 2: Agregar función abrirModal**

Agregar después de `cargarTodos`:
```javascript
function abrirModal(stmt) {
  const txs = (stmt.datos_json?.transacciones || stmt.datos_json?.cargos || [])
    .filter(t => t.tipo_transaccion !== 'pago');
  const cats = {};
  txs.forEach((t, i) => {
    cats[i] = t.tipo_transaccion === 'prestamo' ? 'empresa' : 'personal';
  });
  setCategorias(cats);
  setModalStmt(stmt);
}
```

- [ ] **Paso 3: Agregar función cargarConCategorias**

Agregar después de `abrirModal`:
```javascript
async function cargarConCategorias() {
  if (!modalStmt) return;
  setCargandoMod(true);
  const txs = (modalStmt.datos_json?.transacciones || modalStmt.datos_json?.cargos || [])
    .filter(t => t.tipo_transaccion !== 'pago');
  const categoriasArray = txs.map((_, i) => ({ index: i, destino: categorias[i] || 'personal' }));
  try {
    const { error } = await supabase.functions.invoke('cargar-estado-cuenta', {
      body: { statementId: modalStmt.id, userId: tokenInfo?.user_id, categorias: categoriasArray },
    });
    if (error) throw new Error(error.message);
    setStatements(prev => prev.map(s => s.id === modalStmt.id ? { ...s, estado: 'cargado' } : s));
    setModalStmt(null);
  } catch (e) {
    alert('Error al cargar: ' + e.message);
  }
  setCargandoMod(false);
}
```

- [ ] **Paso 4: Actualizar TarjetaEstado — cambiar prop y botón**

Reemplazar la firma del componente:
```javascript
function TarjetaEstado({ stmt, onCargar, cargando }) {
```

Por:
```javascript
function TarjetaEstado({ stmt, onVerTransacciones }) {
```

Reemplazar el bloque del botón al final del componente:
```javascript
{stmt.estado !== 'cargado' ? (
  <button onClick={() => onCargar(stmt.id)} disabled={cargando === stmt.id} style={{
    marginTop: 10, width: '100%',
    background: cargando === stmt.id ? '#95a5a6' : '#27ae60',
    color: 'white', border: 'none', borderRadius: 8,
    padding: '8px 0', cursor: cargando === stmt.id ? 'not-allowed' : 'pointer',
    fontWeight: 'bold', fontSize: 12,
  }}>
    {cargando === stmt.id ? '⏳ Cargando...' : '✅ Cargar al Talonario'}
  </button>
) : (
  <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#27ae60', fontWeight: 'bold' }}>
    ✅ Ya cargado al Talonario
  </div>
)}
```

Por:
```javascript
{stmt.estado !== 'cargado' ? (
  <button onClick={() => onVerTransacciones(stmt)} style={{
    marginTop: 10, width: '100%',
    background: '#2980b9', color: 'white', border: 'none', borderRadius: 8,
    padding: '8px 0', cursor: 'pointer', fontWeight: 'bold', fontSize: 12,
  }}>
    👁 Ver transacciones y categorizar
  </button>
) : (
  <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#27ae60', fontWeight: 'bold' }}>
    ✅ Ya cargado al Talonario
  </div>
)}
```

- [ ] **Paso 5: Actualizar el render de TarjetaEstado en el map**

Reemplazar:
```javascript
<TarjetaEstado key={stmt.id} stmt={stmt} onCargar={cargarAlTalonario} cargando={cargando} />
```

Por:
```javascript
<TarjetaEstado key={stmt.id} stmt={stmt} onVerTransacciones={abrirModal} />
```

- [ ] **Paso 6: Eliminar el botón "Cargar todos" (ya no aplica con el nuevo flujo)**

Eliminar el bloque:
```javascript
{statements.some(s => s.estado !== 'cargado') && (
  <button onClick={cargarTodos} style={{
    background: '#27ae60', color: 'white', border: 'none',
    borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 12,
  }}>
    ✅ Cargar todos al Talonario
  </button>
)}
```

- [ ] **Paso 7: Agregar el modal de preview antes del `return` final del componente**

Agregar justo antes del `return (` del componente `HotmailSync`:

```javascript
const modalTxs = modalStmt
  ? (modalStmt.datos_json?.transacciones || modalStmt.datos_json?.cargos || [])
      .filter(t => t.tipo_transaccion !== 'pago')
  : [];
```

- [ ] **Paso 8: Agregar el JSX del modal al final del return de HotmailSync**

Agregar justo antes del cierre `</div>` final del return:

```javascript
{modalStmt && (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }}>
    <div style={{
      background: 'white', borderRadius: 12, padding: 20,
      width: '100%', maxWidth: 620, maxHeight: '85vh',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    }}>
      <div style={{ fontWeight: 'bold', fontSize: 15, color: '#1a2a4a', marginBottom: 4 }}>
        {modalStmt.banco}{modalStmt.red_tarjeta ? ` — ${modalStmt.red_tarjeta}` : ''}
        {modalStmt.ultimos4 ? ` ****${modalStmt.ultimos4}` : ''}
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
        {modalTxs.length} transacciones · Elige destino por cada una
      </div>

      <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
        {modalTxs.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0', borderBottom: '1px solid #f0f0f0',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#222' }}>
                {t.descripcion}
                {t.cuota_actual ? ` (${t.cuota_actual}/${t.cuota_total})` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {t.fecha} · <strong style={{ color: '#e74c3c' }}>${parseFloat(t.monto || 0).toFixed(2)}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => setCategorias(prev => ({ ...prev, [i]: 'personal' }))}
                style={{
                  background: categorias[i] !== 'empresa' ? '#2980b9' : '#eee',
                  color: categorias[i] !== 'empresa' ? 'white' : '#555',
                  border: 'none', borderRadius: 6, padding: '4px 10px',
                  fontSize: 11, cursor: 'pointer', fontWeight: 'bold',
                }}
              >Personal</button>
              <button
                onClick={() => setCategorias(prev => ({ ...prev, [i]: 'empresa' }))}
                style={{
                  background: categorias[i] === 'empresa' ? '#27ae60' : '#eee',
                  color: categorias[i] === 'empresa' ? 'white' : '#555',
                  border: 'none', borderRadius: 6, padding: '4px 10px',
                  fontSize: 11, cursor: 'pointer', fontWeight: 'bold',
                }}
              >Empresa</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={() => setModalStmt(null)}
          style={{
            background: 'white', color: '#555', border: '1.5px solid #ddd',
            borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 12,
          }}
        >Cancelar</button>
        <button
          onClick={cargarConCategorias}
          disabled={cargandoMod}
          style={{
            background: cargandoMod ? '#95a5a6' : '#27ae60',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '8px 20px', cursor: cargandoMod ? 'not-allowed' : 'pointer',
            fontWeight: 'bold', fontSize: 12,
          }}
        >
          {cargandoMod ? '⏳ Cargando...' : '✅ Cargar seleccionadas'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Paso 9: Commit y push**

```bash
git add src/components/contabilidad/talonario/hotmail/HotmailSync.js
git commit -m "feat(hotmail): vista previa con categorización Personal/Empresa antes de cargar"
git push origin main
```

Resultado esperado: Vercel inicia auto-deploy.
