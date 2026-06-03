# Facturación — Mejoras Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar búsqueda avanzada con filtros radio en TabFacturas, filas rojas para anuladas, botones Reenviar/PDF/Otro correo, panel de totales mejorado en nueva venta, y guardar nombre del vendedor en la factura.

**Architecture:** Modificaciones directas a 3 archivos existentes (TabFacturas.js, TabNuevaVenta.js, Facturacion.js) + nueva ruta API para reenvío por correo. Sin nuevos componentes. Migración SQL mínima (1 columna).

**Tech Stack:** React (hooks, inline styles), Supabase, Dátil API (X-Key / X-Password), Vercel Serverless Functions

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| Supabase SQL Editor | Ejecutar | Agregar `vendedor_nombre text` a `facturas` |
| `src/Facturacion.js` | Modificar | Pasar `userRol` a TabNuevaVenta |
| `src/components/facturacion/TabNuevaVenta.js` | Modificar | Guardar vendedor_nombre + totales mejorados |
| `api/reenviar-factura.js` | Crear | Reenviar email vía Dátil API |
| `src/components/facturacion/TabFacturas.js` | Modificar | Filtros radio + filas rojas + botones acción |

---

## Task 1: Migración SQL

**Files:**
- Ejecutar en: Supabase Dashboard → SQL Editor

- [ ] **Step 1: Agregar columna vendedor_nombre**

Abrir Supabase → SQL Editor → New query, pegar y ejecutar:

```sql
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS vendedor_nombre text;
```

- [ ] **Step 2: Verificar**

En Table Editor → tabla `facturas` → confirmar que aparece la columna `vendedor_nombre`.

---

## Task 2: Facturacion.js — pasar userRol a TabNuevaVenta

**Files:**
- Modify: `src/Facturacion.js:39-44`

- [ ] **Step 1: Agregar prop userRol**

Buscar en `src/Facturacion.js` el bloque:

```javascript
        {tabActiva === 'nueva'    && (
          <TabNuevaVenta
            mobile={mobile}
            currentUser={currentUser}
          />
        )}
```

Reemplazar por:

```javascript
        {tabActiva === 'nueva'    && (
          <TabNuevaVenta
            mobile={mobile}
            currentUser={currentUser}
            userRol={userRol}
          />
        )}
```

- [ ] **Step 2: Commit**

```bash
git add src/Facturacion.js
git commit -m "feat(facturacion): pasar userRol a TabNuevaVenta"
```

---

## Task 3: TabNuevaVenta — vendedor_nombre + totales mejorados

**Files:**
- Modify: `src/components/facturacion/TabNuevaVenta.js`

Hay 4 cambios en este archivo: (A) recibir `userRol` en props, (B) artículos contador, (C) guardar `vendedor_nombre` en 3 lugares, (D) mejorar display del TOTAL.

- [ ] **Step 1: Agregar userRol a props (línea 29)**

Cambiar:
```javascript
export default function TabNuevaVenta({ mobile, currentUser }) {
```
Por:
```javascript
export default function TabNuevaVenta({ mobile, currentUser, userRol }) {
```

- [ ] **Step 2: Agregar articulosCount junto a los totales (línea ~128-130)**

Buscar:
```javascript
  // ── Totales ───────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);
  const iva      = parseFloat((subtotal * 0.15).toFixed(2));
  const total    = parseFloat((subtotal + iva).toFixed(2));
```

Reemplazar por:
```javascript
  // ── Totales ───────────────────────────────────────────────
  const subtotal       = items.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);
  const iva            = parseFloat((subtotal * 0.15).toFixed(2));
  const total          = parseFloat((subtotal + iva).toFixed(2));
  const articulosCount = items.filter(i => i.producto_nombre && parseFloat(i.cantidad) > 0).length;
```

- [ ] **Step 3: Agregar vendedor_nombre en emitirFactura (línea ~183-186)**

Buscar en la función `emitirFactura`, el bloque de insert en `facturas`:
```javascript
        subtotal,
        iva,
        total,
        porcentaje_iva:   15,
        forma_pago:       formaPago,
        dias_credito:     formaPago === 'credito' ? diasCredito : 0,
        observaciones,
        vendedor:         currentUser?.email || '',
        created_by:       currentUser?.email || ''
```

Reemplazar por:
```javascript
        subtotal,
        iva,
        total,
        porcentaje_iva:   15,
        forma_pago:       formaPago,
        dias_credito:     formaPago === 'credito' ? diasCredito : 0,
        observaciones,
        vendedor:         currentUser?.email || '',
        vendedor_nombre:  userRol?.nombre    || '',
        created_by:       currentUser?.email || ''
```

- [ ] **Step 4: Agregar vendedor_nombre en guardarBorrador (línea ~253-259)**

Buscar en la función `guardarBorrador`, el objeto `facturaPayload`:
```javascript
      vendedor:         currentUser?.email || '',
      created_by:       currentUser?.email || '',
```
(dentro del `const facturaPayload = {`)

Reemplazar por:
```javascript
      vendedor:         currentUser?.email || '',
      vendedor_nombre:  userRol?.nombre    || '',
      created_by:       currentUser?.email || '',
```

- [ ] **Step 5: Agregar vendedor_nombre en emitirNotaVenta (línea ~379-382)**

Buscar en la función `emitirNotaVenta`, el objeto `facturaPayload`:
```javascript
      vendedor:         currentUser?.email || '',
      created_by:       currentUser?.email || '',
```

Reemplazar por:
```javascript
      vendedor:         currentUser?.email || '',
      vendedor_nombre:  userRol?.nombre    || '',
      created_by:       currentUser?.email || '',
```

- [ ] **Step 6: Mejorar display del TOTAL en la barra inferior (línea ~797-810)**

Buscar:
```javascript
        <div style={{ display: 'flex', gap: mobile ? 16 : 24 }}>
          {[
            ['SUBTOTAL', `$${subtotal.toFixed(2)}`, '#aed6f1'],
            ['IVA 15%',  `$${iva.toFixed(2)}`,      '#f9e79f'],
            ['TOTAL',    `$${total.toFixed(2)}`,     '#a9dfbf'],
          ].map(([l, v, col]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: mobile ? '15px' : '18px', fontWeight: 'bold', color: col }}>
                {v}
              </div>
            </div>
          ))}
        </div>
```

Reemplazar por:
```javascript
        <div style={{ display: 'flex', gap: mobile ? 16 : 24, alignItems: 'flex-end' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>SUBTOTAL</div>
            <div style={{ fontSize: mobile ? '13px' : '15px', fontWeight: 'bold', color: '#aed6f1' }}>
              ${subtotal.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>IVA 15%</div>
            <div style={{ fontSize: mobile ? '13px' : '15px', fontWeight: 'bold', color: '#f9e79f' }}>
              ${iva.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#a9dfbf', fontWeight: 700 }}>TOTAL</div>
            <div style={{ fontSize: mobile ? '24px' : '32px', fontWeight: 'bold', color: 'white', lineHeight: 1 }}>
              ${total.toFixed(2)}
            </div>
            <div style={{ fontSize: '10px', color: '#aaa', marginTop: 2 }}>
              {articulosCount} artículo{articulosCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
```

- [ ] **Step 7: Build y verificar**

```bash
npm run build 2>&1 | grep -i "error\|compiled"
```

Esperado: `Compiled successfully.`

- [ ] **Step 8: Commit**

```bash
git add src/components/facturacion/TabNuevaVenta.js
git commit -m "feat(facturacion): vendedor_nombre en facturas + TOTAL prominente + contador artículos"
```

---

## Task 4: api/reenviar-factura.js

**Files:**
- Create: `api/reenviar-factura.js`

- [ ] **Step 1: Crear el handler**

```javascript
// api/reenviar-factura.js
// Reenvía una factura autorizada por email usando la API de Dátil

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { datil_id, email } = req.body;
  if (!datil_id) return res.status(400).json({ error: 'datil_id requerido' });

  const emails = email ? [email] : [];

  try {
    const url = `https://link.datil.co/invoices/${datil_id}/email`;
    const datilRes = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Key':        process.env.DATIL_API_KEY,
        'X-Password':   process.env.DATIL_PASSWORD,
      },
      body: JSON.stringify(emails.length ? { emails } : {}),
    });

    if (!datilRes.ok) {
      const data = await datilRes.json().catch(() => ({}));
      return res.status(400).json({ error: data?.mensaje || 'Error al reenviar' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add api/reenviar-factura.js
git commit -m "feat(facturacion): API endpoint reenviar-factura vía Dátil"
```

---

## Task 5: TabFacturas — filtros estructurados

**Files:**
- Modify: `src/components/facturacion/TabFacturas.js`

- [ ] **Step 1: Reemplazar estados de filtro (línea ~27-29)**

Buscar:
```javascript
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado,setFiltroEstado]= useState('todas');
```

Reemplazar por:
```javascript
  const [filtroEstado,    setFiltroEstado]    = useState('todas');
  const [filtroModo,      setFiltroModo]      = useState('numero');
  const [filtroNumero,    setFiltroNumero]    = useState('');
  const [filtroCliente,   setFiltroCliente]   = useState('');
  const [filtroVendedor,  setFiltroVendedor]  = useState('');
  const [filtroDesde,     setFiltroDesde]     = useState('');
  const [filtroHasta,     setFiltroHasta]     = useState('');
  const [correoEnvio,     setCorreoEnvio]     = useState({});   // { [facturaId]: email }
  const [reenviando,      setReenviando]      = useState({});   // { [facturaId]: boolean }
```

- [ ] **Step 2: Reemplazar la lógica de filtrado (línea ~432-441)**

Buscar:
```javascript
  const facturasFiltradas = facturas.filter(f => {
    const textoOk = !filtroTexto ||
      f.numero?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
      (f.cliente_nombre || '').toLowerCase().includes(filtroTexto.toLowerCase());
    const estadoOk = filtroEstado === 'nota_venta'
      ? f.tipo === 'nota_venta'
      : filtroEstado === 'todas' || f.estado === filtroEstado;
    return textoOk && estadoOk;
  });
```

Reemplazar por:
```javascript
  const vendedoresUnicos = [...new Set(
    facturas.map(f => f.vendedor_nombre || f.vendedor || '').filter(Boolean)
  )].sort();

  const facturasFiltradas = facturas.filter(f => {
    let modoOk = true;
    if (filtroModo === 'numero' && filtroNumero)
      modoOk = (f.numero || '').toLowerCase().includes(filtroNumero.toLowerCase());
    else if (filtroModo === 'cliente' && filtroCliente)
      modoOk = (f.cliente_nombre || '').toLowerCase().includes(filtroCliente.toLowerCase());
    else if (filtroModo === 'vendedor' && filtroVendedor)
      modoOk = (f.vendedor_nombre || f.vendedor || '') === filtroVendedor;
    else if (filtroModo === 'periodo') {
      const fecha = (f.created_at || '').split('T')[0];
      modoOk = (!filtroDesde || fecha >= filtroDesde) && (!filtroHasta || fecha <= filtroHasta);
    }
    const estadoOk = filtroEstado === 'nota_venta'
      ? f.tipo === 'nota_venta'
      : filtroEstado === 'todas' || f.estado === filtroEstado;
    return modoOk && estadoOk;
  });
```

- [ ] **Step 3: Reemplazar la sección de filtros en el JSX (línea ~464-496)**

Buscar:
```javascript
      {/* Filtros */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <input
          type="text"
          value={filtroTexto}
          onChange={e => setFiltroTexto(e.target.value)}
          placeholder="🔍 Buscar por número o cliente..."
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          style={inputStyle}
        >
          <option value="todas">Todas</option>
          <option value="autorizada">Autorizadas</option>
          <option value="borrador">Borradores</option>
          <option value="anulada">Anuladas</option>
          <option value="nota_venta">Notas de venta</option>
        </select>
        <div style={{
          fontSize: '13px', color: '#555',
          padding: '8px 12px', background: '#f0f7ff',
          borderRadius: 8, fontWeight: 'bold', whiteSpace: 'nowrap',
        }}>
          {facturasFiltradas.length} facturas · ${totalFiltrado.toFixed(2)}
        </div>
      </div>
```

Reemplazar por:
```javascript
      {/* Filtros */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '12px 16px', marginBottom: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {/* Fila 1: modos radio + estado */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {[
            { id: 'numero',   label: '# Factura' },
            { id: 'periodo',  label: '📅 Período' },
            { id: 'cliente',  label: '👤 Cliente' },
            { id: 'vendedor', label: '🧑‍💼 Vendedor' },
          ].map(m => (
            <button key={m.id} onClick={() => setFiltroModo(m.id)} style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
              fontSize: '12px', fontWeight: 'bold',
              background: filtroModo === m.id ? '#1a2a4a' : '#f0f2f5',
              color:      filtroModo === m.id ? 'white'   : '#555',
              border:     filtroModo === m.id ? '2px solid #1a2a4a' : '2px solid transparent',
            }}>{m.label}</button>
          ))}
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            style={{ ...inputStyle, marginLeft: 'auto' }}>
            <option value="todas">Todas</option>
            <option value="autorizada">Autorizadas</option>
            <option value="borrador">Borradores</option>
            <option value="anulada">Anuladas</option>
            <option value="nota_venta">Notas de venta</option>
          </select>
        </div>

        {/* Fila 2: control según modo */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {filtroModo === 'numero' && (
            <input type="text" value={filtroNumero}
              onChange={e => setFiltroNumero(e.target.value)}
              placeholder="🔍 Nº factura..."
              style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
          )}
          {filtroModo === 'cliente' && (
            <input type="text" value={filtroCliente}
              onChange={e => setFiltroCliente(e.target.value)}
              placeholder="🔍 Nombre del cliente..."
              style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
          )}
          {filtroModo === 'vendedor' && (
            <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}>
              <option value="">— Todos los vendedores —</option>
              {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          {filtroModo === 'periodo' && (
            <>
              <label style={{ fontSize: '12px', color: '#555' }}>Desde</label>
              <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
                style={inputStyle} />
              <label style={{ fontSize: '12px', color: '#555' }}>Hasta</label>
              <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
                style={inputStyle} />
            </>
          )}
          <div style={{
            fontSize: '13px', color: '#555', padding: '8px 12px',
            background: '#f0f7ff', borderRadius: 8, fontWeight: 'bold', whiteSpace: 'nowrap',
          }}>
            {facturasFiltradas.length} facturas · ${totalFiltrado.toFixed(2)}
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Build y verificar**

```bash
npm run build 2>&1 | grep -i "error\|compiled"
```

Esperado: `Compiled successfully.`

- [ ] **Step 5: Commit**

```bash
git add src/components/facturacion/TabFacturas.js
git commit -m "feat(facturacion): filtros estructurados — Nº Factura / Período / Cliente / Vendedor"
```

---

## Task 6: TabFacturas — filas rojas para anuladas + botones acción

**Files:**
- Modify: `src/components/facturacion/TabFacturas.js`

- [ ] **Step 1: Agregar función reenviarCorreo**

Después de la función `confirmarAnuladoSRI` (línea ~137), agregar:

```javascript
  // ── Reenviar factura por correo ───────────────────────────
  async function reenviarCorreo(facturaId, datil_id, emailDestino) {
    setReenviando(prev => ({ ...prev, [facturaId]: true }));
    try {
      const res = await fetch('/api/reenviar-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datil_id, email: emailDestino || undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al reenviar');
      mostrarExito('✅ Correo reenviado correctamente');
      setCorreoEnvio(prev => ({ ...prev, [facturaId]: '' }));
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setReenviando(prev => ({ ...prev, [facturaId]: false }));
  }
```

- [ ] **Step 2: Colorear fila completa para anuladas (línea ~516-520)**

Buscar el div principal de cada tarjeta de factura:
```javascript
              <div key={f.id} style={{
                background: 'white', borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden',
                border: abierta ? '2px solid #2980b9' : '2px solid transparent',
              }}>
```

Reemplazar por:
```javascript
              <div key={f.id} style={{
                background: f.estado === 'anulada' ? '#fde8e8'
                          : f.estado === 'borrador' ? '#fef9e7' : 'white',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden',
                border: abierta ? '2px solid #2980b9'
                      : f.estado === 'anulada' ? '2px solid #e74c3c' : '2px solid transparent',
              }}>
```

- [ ] **Step 3: Agregar botones Reenviar y Otro correo en el panel expandido**

Dentro del panel expandido (la sección `{abierta && (...)}`), después de la tabla de detalle y la fila de totales (línea ~758-764), agregar:

```javascript
                    {/* Acciones de correo para facturas autorizadas con datil_id */}
                    {f.estado === 'autorizada' && f.datil_id && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => reenviarCorreo(f.id, f.datil_id)}
                          disabled={reenviando[f.id]}
                          style={{
                            background: reenviando[f.id] ? '#95a5a6' : '#2980b9',
                            color: 'white', border: 'none', borderRadius: 7,
                            padding: '6px 12px', cursor: reenviando[f.id] ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold', fontSize: '12px',
                          }}>
                          {reenviando[f.id] ? '⏳ Enviando...' : '✉️ Reenviar correo'}
                        </button>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="email"
                            value={correoEnvio[f.id] || ''}
                            onChange={e => setCorreoEnvio(prev => ({ ...prev, [f.id]: e.target.value }))}
                            placeholder="otro@correo.com"
                            style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: '12px', width: 180 }}
                          />
                          <button
                            onClick={() => reenviarCorreo(f.id, f.datil_id, correoEnvio[f.id])}
                            disabled={!correoEnvio[f.id] || reenviando[f.id]}
                            style={{
                              background: (!correoEnvio[f.id] || reenviando[f.id]) ? '#95a5a6' : '#27ae60',
                              color: 'white', border: 'none', borderRadius: 7,
                              padding: '6px 12px', cursor: (!correoEnvio[f.id] || reenviando[f.id]) ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold', fontSize: '12px',
                            }}>
                            ✉️ Enviar a este correo
                          </button>
                        </div>
                      </div>
                    )}
```

- [ ] **Step 4: Build y verificar**

```bash
npm run build 2>&1 | grep -i "error\|compiled"
```

Esperado: `Compiled successfully.`

- [ ] **Step 5: Commit**

```bash
git add src/components/facturacion/TabFacturas.js
git commit -m "feat(facturacion): filas rojas anuladas + reenviar correo + enviar a otro correo"
```

---

## Task 7: Push y verificación final

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Verificar en Vercel**

Una vez desplegado, verificar manualmente:
1. Menú Contabilidad → Facturación → pestaña FACTURAS
   - Cambiar modo de búsqueda: debe alternar entre input, fechas y dropdown
   - Facturas anuladas deben tener fondo rojo
   - Al expandir una factura autorizada con datil_id: ver botones de correo
2. Pestaña NUEVA VENTA
   - Agregar un producto → el TOTAL debe verse grande y en blanco
   - Debajo del total: "1 artículo"
3. Emitir una factura de prueba como borrador (sin conexión SRI)
   - En Supabase, verificar que la fila tiene `vendedor_nombre` con el nombre correcto

---

## Self-Review del plan

**Cobertura spec:**
- ✅ Filtros radio Nº Factura / Período / Cliente / Vendedor → Task 5
- ✅ Filas rojas para anuladas → Task 6 Step 2
- ✅ Panel ítems inline al seleccionar → ya existe, no se toca (funciona)
- ✅ PDF button → ya existe en el código actual
- ✅ Reenviar correo → Task 4 + Task 6 Step 3
- ✅ Otro correo → Task 6 Step 3
- ✅ Panel totales mejorado con TOTAL grande → Task 3 Step 6
- ✅ Artículos count → Task 3 Steps 2 + 6
- ✅ vendedor_nombre en facturas → Task 1 (SQL) + Task 3 Steps 3-5

**Consistencia de nombres:**
- `filtroModo`, `filtroNumero`, `filtroCliente`, `filtroVendedor`, `filtroDesde`, `filtroHasta` — definidos en Task 5 Step 1, usados en Step 2 y 3 ✅
- `correoEnvio`, `reenviando` — definidos en Task 5 Step 1, usados en Task 6 Steps 1 y 3 ✅
- `reenviarCorreo` — definida en Task 6 Step 1, llamada en Step 3 ✅
- `articulosCount` — definido en Task 3 Step 2, usado en Step 6 ✅
- `vendedor_nombre` — columna SQL en Task 1, guardada en Task 3 Steps 3-5, leída en Task 5 Step 2 ✅
