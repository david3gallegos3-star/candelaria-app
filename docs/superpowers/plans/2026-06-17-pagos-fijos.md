# Pagos Fijos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar pagos fijos mensuales (IESS, contadora, servicios, etc.) que aparezcan pre-cargados en "Pagos del Mes" y generen asiento automático en libro diario con descripción "[CODIGO] — [Mes Año]".

**Architecture:** Nueva tabla `pagos_fijos` + columna `pago_fijo_id` en `talonario_pagos_banco`. Sección nueva en PagosDelMes.js con modal de administración. Función `generarAsientoPagoFijo()` en asientosContables.js. Los módulos ResumenTalonario, saldoBanco y MovimientosBanco NO necesitan cambios porque ya leen `talonario_pagos_banco` completo.

**Tech Stack:** React, Supabase/PostgREST, asientosContables.js existente.

---

## Archivos

| Archivo | Acción |
|---|---|
| SQL (Supabase SQL Editor) | Crear `pagos_fijos` + columna `pago_fijo_id` |
| `src/utils/asientosContables.js` | Agregar `generarAsientoPagoFijo()` |
| `src/components/contabilidad/talonario/egresos/PagosDelMes.js` | State + cargar() + funciones + UI sección fijos + modal admin |

---

## Task 1: SQL Migration

**Files:**
- Run in: Supabase SQL Editor

- [ ] **Step 1: Ejecutar SQL**

```sql
CREATE TABLE IF NOT EXISTS pagos_fijos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  codigo          text NOT NULL,
  monto_default   numeric DEFAULT 0,
  forma_pago      text DEFAULT '20',
  cuenta_debe_key text NOT NULL DEFAULT 'gasto_caja_id',
  activo          boolean DEFAULT true,
  orden           int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE talonario_pagos_banco
  ADD COLUMN IF NOT EXISTS pago_fijo_id uuid REFERENCES pagos_fijos(id);
```

- [ ] **Step 2: Verificar**

En Supabase → Table Editor → debe existir tabla `pagos_fijos` con 9 columnas. En `talonario_pagos_banco` debe aparecer columna `pago_fijo_id`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: SQL pagos_fijos table + pago_fijo_id en talonario_pagos_banco"
```

---

## Task 2: generarAsientoPagoFijo() en asientosContables.js

**Files:**
- Modify: `src/utils/asientosContables.js` — agregar después de `generarAsientoPagoProveedor`

- [ ] **Step 1: Agregar la función**

Agregar esto al final del archivo `src/utils/asientosContables.js`, después del cierre de `generarAsientoPagoProveedor`:

```js
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export async function generarAsientoPagoFijo({ id, monto, codigo, cuenta_debe_key, mes, año }) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const cuentaDebe = cuentas[cuenta_debe_key];
  if (!cuentaDebe) return { data: null, error: `Cuenta ${cuenta_debe_key} no configurada` };

  const descripcion = `${codigo} — ${MESES_CORTOS[mes - 1]} ${año}`;

  return insertarAsiento({
    fecha:       new Date().toISOString().split('T')[0],
    descripcion,
    tipo:        'tributario',
    origen:      'talonario_pagos_banco',
    origen_id:   id,
    lineas: [
      { cuenta_id: cuentaDebe,       descripcion, debe: monto, haber: 0,     orden: 0 },
      { cuenta_id: cuentas.banco_id, descripcion, debe: 0,     haber: monto, orden: 1 },
    ],
  });
}
```

- [ ] **Step 2: Verificar que el archivo compila**

```bash
npm run build 2>&1 | head -20
```

Esperado: sin errores de sintaxis.

- [ ] **Step 3: Commit**

```bash
git add src/utils/asientosContables.js
git commit -m "feat: generarAsientoPagoFijo — DEBE cuenta / HABER Banco con codigo-mes"
```

---

## Task 3: PagosDelMes.js — state, constants e import

**Files:**
- Modify: `src/components/contabilidad/talonario/egresos/PagosDelMes.js`

- [ ] **Step 1: Agregar import de generarAsientoPagoFijo**

Ubicar la línea actual:
```js
import { supabase } from '../../../../supabase';
```

Agregar debajo:
```js
import { generarAsientoPagoFijo } from '../../../../utils/asientosContables';
```

- [ ] **Step 2: Agregar constantes antes de la función del componente**

Ubicar la línea:
```js
const VACIO = { fecha: '', beneficiario: '', concepto: '', monto: '', forma_pago: '20', comentario: '' };
```

Agregar debajo:
```js
const CUENTA_DEBE_OPTIONS = [
  { value: 'gasto_caja_id',    label: 'Gastos Generales' },
  { value: 'iess_pagar_id',    label: 'IESS por Pagar' },
  { value: 'sueldos_pagar_id', label: 'Sueldos por Pagar' },
];

const VACIO_FIJO = { nombre: '', codigo: '', monto_default: '', forma_pago: '20', cuenta_debe_key: 'gasto_caja_id', orden: 0 };
```

- [ ] **Step 3: Agregar nuevas variables de estado**

Ubicar el bloque de estados existente que termina con:
```js
const [guardando,     setGuardando]     = useState(false);
```

Agregar después:
```js
const [pagosFijos,    setPagosFijos]    = useState([]);
const [montosEdit,    setMontosEdit]    = useState({});
const [registrando,   setRegistrando]   = useState({});
const [editandoFijo,  setEditandoFijo]  = useState(null);
const [modalFijos,    setModalFijos]    = useState(false);
const [formFijo,      setFormFijo]      = useState(null);
const [guardandoFijo, setGuardandoFijo] = useState(false);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/PagosDelMes.js
git commit -m "feat: pagos fijos — imports, constantes y estado"
```

---

## Task 4: PagosDelMes.js — actualizar cargar()

**Files:**
- Modify: `src/components/contabilidad/talonario/egresos/PagosDelMes.js`

- [ ] **Step 1: Reemplazar el cuerpo de cargar()**

Ubicar la función `cargar()` completa actual:
```js
  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const ultimoDia  = new Date(año, mes, 0).getDate();
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

    const [{ data }, { data: pagos }] = await Promise.all([
      supabase.from('talonario_pagos_banco')
        .select('*').eq('mes', mes).eq('año', año).order('fecha'),
      supabase.from('pagos_compras')
        .select('id,monto,forma_pago,fecha_pago,notas,comision,proveedores(nombre),compras(es_personal)')
        .in('forma_pago', ['transferencia','cheque','deposito'])
        .gte('fecha_pago', fechaDesde).lte('fecha_pago', fechaHasta)
        .order('fecha_pago'),
    ]);
    setFilas(data || []);
    setPagosCompras((pagos || []).filter(p => !p.compras?.es_personal));
    setCargando(false);
  }
```

Reemplazar por:
```js
  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const ultimoDia  = new Date(año, mes, 0).getDate();
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

    const [{ data }, { data: pagos }, { data: fijos }] = await Promise.all([
      supabase.from('talonario_pagos_banco')
        .select('*').eq('mes', mes).eq('año', año).order('fecha'),
      supabase.from('pagos_compras')
        .select('id,monto,forma_pago,fecha_pago,notas,comision,proveedores(nombre),compras(es_personal)')
        .in('forma_pago', ['transferencia','cheque','deposito'])
        .gte('fecha_pago', fechaDesde).lte('fecha_pago', fechaHasta)
        .order('fecha_pago'),
      supabase.from('pagos_fijos')
        .select('*').order('orden').order('nombre'),
    ]);

    const filasMes = data || [];
    setFilas(filasMes);
    setPagosCompras((pagos || []).filter(p => !p.compras?.es_personal));
    setPagosFijos(fijos || []);

    // Pre-llenar montos con el default para los no registrados este mes
    const registradosIds = new Set(filasMes.filter(f => f.pago_fijo_id).map(f => f.pago_fijo_id));
    const initMontos = {};
    (fijos || []).forEach(f => {
      if (!registradosIds.has(f.id)) initMontos[f.id] = String(f.monto_default || '');
    });
    setMontosEdit(prev => ({ ...initMontos, ...prev }));
    setCargando(false);
  }
```

- [ ] **Step 2: Verificar que la app carga sin errores**

Abrir Pagos del Mes en el browser — no debe haber errores en consola.

- [ ] **Step 3: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/PagosDelMes.js
git commit -m "feat: pagos fijos — cargar() carga pagos_fijos en paralelo"
```

---

## Task 5: PagosDelMes.js — funciones registrar, editar y CRUD admin

**Files:**
- Modify: `src/components/contabilidad/talonario/egresos/PagosDelMes.js`

- [ ] **Step 1: Agregar funciones después de eliminar()**

Ubicar la función `eliminar()` existente:
```js
  async function eliminar(id) {
    await supabase.from('talonario_pagos_banco').delete().eq('id', id);
    cargar();
  }
```

Agregar debajo:
```js
  async function registrarPagoFijo(fijo) {
    const monto = parseFloat(montosEdit[fijo.id]) || 0;
    if (!monto) return alert('Ingresa un monto mayor a $0');
    setRegistrando(r => ({ ...r, [fijo.id]: true }));

    const { data: pago, error } = await supabase.from('talonario_pagos_banco').insert({
      mes, año,
      fecha:        new Date().toISOString().split('T')[0],
      beneficiario: fijo.nombre,
      concepto:     `${fijo.codigo} — ${fijo.nombre}`,
      monto,
      forma_pago:   fijo.forma_pago,
      pago_fijo_id: fijo.id,
    }).select('id').single();

    if (!error && pago) {
      generarAsientoPagoFijo({ id: pago.id, monto, codigo: fijo.codigo, cuenta_debe_key: fijo.cuenta_debe_key, mes, año })
        .catch(e => console.error('Asiento pago fijo:', e));
    }
    setRegistrando(r => ({ ...r, [fijo.id]: false }));
    cargar();
  }

  async function guardarEdicionFijo(fijo, filaExistente) {
    const monto = parseFloat(montosEdit[fijo.id]) || 0;
    if (!monto) return alert('Ingresa un monto mayor a $0');
    setRegistrando(r => ({ ...r, [fijo.id]: true }));

    await supabase.from('talonario_pagos_banco').update({ monto }).eq('id', filaExistente.id);
    await supabase.from('libro_diario').delete()
      .eq('origen', 'talonario_pagos_banco').eq('origen_id', filaExistente.id);
    generarAsientoPagoFijo({ id: filaExistente.id, monto, codigo: fijo.codigo, cuenta_debe_key: fijo.cuenta_debe_key, mes, año })
      .catch(e => console.error('Asiento pago fijo edit:', e));

    setRegistrando(r => ({ ...r, [fijo.id]: false }));
    setEditandoFijo(null);
    cargar();
  }

  async function guardarFijo() {
    if (!formFijo.nombre || !formFijo.codigo) return alert('Nombre y código son requeridos');
    setGuardandoFijo(true);
    const payload = {
      nombre:          formFijo.nombre.trim(),
      codigo:          formFijo.codigo.trim().toUpperCase(),
      monto_default:   parseFloat(formFijo.monto_default) || 0,
      forma_pago:      formFijo.forma_pago || '20',
      cuenta_debe_key: formFijo.cuenta_debe_key,
      orden:           parseInt(formFijo.orden) || 0,
    };
    if (formFijo.id) {
      await supabase.from('pagos_fijos').update(payload).eq('id', formFijo.id);
    } else {
      await supabase.from('pagos_fijos').insert(payload);
    }
    setGuardandoFijo(false);
    setFormFijo(null);
    cargar();
  }

  async function toggleActivoFijo(fijo) {
    await supabase.from('pagos_fijos').update({ activo: !fijo.activo }).eq('id', fijo.id);
    cargar();
  }

  async function eliminarFijo(id) {
    if (!window.confirm('¿Eliminar este pago fijo del catálogo?')) return;
    await supabase.from('pagos_fijos').delete().eq('id', id);
    cargar();
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/PagosDelMes.js
git commit -m "feat: pagos fijos — funciones registrar, editar y CRUD admin"
```

---

## Task 6: PagosDelMes.js — sección "Pagos Fijos del Mes" en el JSX

**Files:**
- Modify: `src/components/contabilidad/talonario/egresos/PagosDelMes.js`

- [ ] **Step 1: Agregar sección fijos antes del TablaCrud**

El JSX actual empieza con:
```jsx
  return (
    <>
      <TablaCrud
        titulo="🏧 Pagos del Mes"
```

Reemplazar por:
```jsx
  const fijosFiltrados = pagosFijos.filter(f => f.activo);

  return (
    <>
      {/* Encabezado con botón administrar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={() => setModalFijos(true)} style={{
          background: '#1a3a2a', color: 'white', border: 'none', borderRadius: 8,
          padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
        }}>⚙️ Administrar fijos</button>
      </div>

      {/* Sección Pagos Fijos del Mes */}
      {fijosFiltrados.length > 0 && (
        <div style={{ marginBottom: 16, background: 'white', borderRadius: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ background: '#2c3e50', color: 'white', padding: '10px 16px',
            fontWeight: 'bold', fontSize: 13 }}>
            📌 Pagos Fijos del Mes
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f7f5' }}>
                {['Código','Nombre','Cuenta','Monto','Estado'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: h === 'Monto' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fijosFiltrados.map(fijo => {
                const filaReg = filas.find(f => f.pago_fijo_id === fijo.id);
                const cuentaLabel = CUENTA_DEBE_OPTIONS.find(o => o.value === fijo.cuenta_debe_key)?.label || fijo.cuenta_debe_key;
                const estaEditando = editandoFijo === fijo.id;

                return (
                  <tr key={fijo.id} style={{ borderBottom: '1px solid #f0f0f0',
                    background: filaReg ? '#f0fff4' : 'white' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1a3a2a', fontFamily: 'monospace' }}>
                      {fijo.codigo}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{fijo.nombre}</td>
                    <td style={{ padding: '8px 12px', color: '#666', fontSize: 11 }}>{cuentaLabel}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {filaReg && !estaEditando ? (
                        <span style={{ fontWeight: 'bold', color: '#27ae60' }}>
                          ${parseFloat(filaReg.monto||0).toFixed(2)}
                        </span>
                      ) : (
                        <input
                          type="number" min="0" step="0.01"
                          value={montosEdit[fijo.id] ?? String(fijo.monto_default || '')}
                          onChange={e => setMontosEdit(m => ({ ...m, [fijo.id]: e.target.value }))}
                          style={{ width: 90, padding: '4px 8px', borderRadius: 6,
                            border: '1px solid #ddd', fontSize: 12, textAlign: 'right' }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {filaReg && !estaEditando ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ Registrado</span>
                          {esAdminContador && (
                            <button onClick={() => {
                              setEditandoFijo(fijo.id);
                              setMontosEdit(m => ({ ...m, [fijo.id]: String(filaReg.monto || '') }));
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 11, color: '#2980b9' }}>✏️ Editar</button>
                          )}
                        </div>
                      ) : estaEditando ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => guardarEdicionFijo(fijo, filaReg)}
                            disabled={registrando[fijo.id]}
                            style={{ background: '#27ae60', color: 'white', border: 'none',
                              borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                            {registrando[fijo.id] ? '...' : '✓ Guardar'}
                          </button>
                          <button onClick={() => setEditandoFijo(null)}
                            style={{ background: '#f0f2f5', color: '#555', border: 'none',
                              borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => registrarPagoFijo(fijo)}
                          disabled={registrando[fijo.id]}
                          style={{ background: '#2c3e50', color: 'white', border: 'none',
                            borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                            fontSize: 11, fontWeight: 'bold' }}>
                          {registrando[fijo.id] ? '...' : '▶ Registrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TablaCrud
        titulo="🏧 Pagos del Mes"
```

- [ ] **Step 2: Verificar en browser**

Abrir Pagos del Mes. Si no hay pagos fijos configurados aún, no debe aparecer la sección. El botón "⚙️ Administrar fijos" sí debe verse arriba a la derecha.

- [ ] **Step 3: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/PagosDelMes.js
git commit -m "feat: pagos fijos — sección Pagos Fijos del Mes con registrar/editar"
```

---

## Task 7: PagosDelMes.js — modal "Administrar fijos"

**Files:**
- Modify: `src/components/contabilidad/talonario/egresos/PagosDelMes.js`

- [ ] **Step 1: Agregar el modal antes del cierre del fragment**

El JSX termina con:
```jsx
    </>
  );
}
```

Insertar antes del `</>` cierre:
```jsx
      {/* Modal Administrar Fijos */}
      {modalFijos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24,
            width: 680, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>⚙️ Administrar Pagos Fijos</h3>
              <button onClick={() => { setModalFijos(false); setFormFijo(null); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {/* Lista de fijos existentes */}
            {pagosFijos.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#f5f7f5' }}>
                    {['Cód','Nombre','Monto default','Forma pago','Cuenta DEBE','Orden','Activo',''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11,
                        fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagosFijos.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f0f0f0',
                      opacity: f.activo ? 1 : 0.5 }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{f.codigo}</td>
                      <td style={{ padding: '6px 10px' }}>{f.nombre}</td>
                      <td style={{ padding: '6px 10px' }}>${parseFloat(f.monto_default||0).toFixed(2)}</td>
                      <td style={{ padding: '6px 10px' }}>
                        {FORMAS_PAGO.find(fp => fp.value === f.forma_pago)?.label || f.forma_pago}
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: 11 }}>
                        {CUENTA_DEBE_OPTIONS.find(o => o.value === f.cuenta_debe_key)?.label || f.cuenta_debe_key}
                      </td>
                      <td style={{ padding: '6px 10px' }}>{f.orden}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <button onClick={() => toggleActivoFijo(f)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                          {f.activo ? '✅' : '⬜'}
                        </button>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setFormFijo({ ...f })}
                            style={{ background: '#2980b9', color: 'white', border: 'none',
                              borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>
                            ✏️
                          </button>
                          <button onClick={() => eliminarFijo(f.id)}
                            style={{ background: '#e74c3c', color: 'white', border: 'none',
                              borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Formulario agregar / editar */}
            {formFijo ? (
              <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, border: '1.5px solid #ddd' }}>
                <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
                  {formFijo.id ? 'Editar pago fijo' : 'Nuevo pago fijo'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Nombre</label>
                    <input type="text" value={formFijo.nombre}
                      onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))}
                      placeholder="Ej: IESS mensual"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Código</label>
                    <input type="text" value={formFijo.codigo}
                      onChange={e => setFormFijo(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                      placeholder="Ej: IESS"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, fontFamily: 'monospace',
                        boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Monto default ($)</label>
                    <input type="number" min="0" step="0.01" value={formFijo.monto_default}
                      onChange={e => setFormFijo(p => ({ ...p, monto_default: e.target.value }))}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Forma de pago</label>
                    <select value={formFijo.forma_pago}
                      onChange={e => setFormFijo(p => ({ ...p, forma_pago: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12 }}>
                      {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Cuenta DEBE (libro diario)</label>
                    <select value={formFijo.cuenta_debe_key}
                      onChange={e => setFormFijo(p => ({ ...p, cuenta_debe_key: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12 }}>
                      {CUENTA_DEBE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Orden (número)</label>
                    <input type="number" min="0" value={formFijo.orden}
                      onChange={e => setFormFijo(p => ({ ...p, orden: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                  <button onClick={() => setFormFijo(null)}
                    style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #ddd',
                      background: 'white', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                  <button onClick={guardarFijo} disabled={guardandoFijo}
                    style={{ padding: '8px 18px', borderRadius: 6, border: 'none',
                      background: '#1a3a2a', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                    {guardandoFijo ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setFormFijo({ ...VACIO_FIJO })}
                style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: 8,
                  padding: '9px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
                + Nuevo pago fijo
              </button>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Verificar flujo completo en browser**

1. Abrir Pagos del Mes
2. Clic "⚙️ Administrar fijos" → debe abrir modal
3. Crear un pago fijo: código "IESS", nombre "IESS mensual", monto $833, cuenta "IESS por Pagar"
4. Cerrar modal → debe aparecer sección "📌 Pagos Fijos del Mes" con IESS pre-cargado
5. Clic "▶ Registrar" → debe crear fila y mostrar ✅
6. Abrir Libro Diario → debe aparecer asiento: DEBE IESS por Pagar / HABER Banco con descripción "IESS — Jun 2026"

- [ ] **Step 3: Commit final**

```bash
git add src/components/contabilidad/talonario/egresos/PagosDelMes.js
git commit -m "feat: pagos fijos — modal Administrar fijos completo con CRUD"
```

---

## Self-Review

**Spec coverage:**
- ✅ Tabla `pagos_fijos` con nombre, codigo, monto_default, forma_pago, cuenta_debe_key, activo, orden
- ✅ Columna `pago_fijo_id` en `talonario_pagos_banco`
- ✅ Botón "Administrar fijos" → modal CRUD
- ✅ Sección "Pagos Fijos del Mes" con pre-cargado
- ✅ No registrado → input monto editable + botón Registrar
- ✅ Ya registrado → ✅ + botón editar
- ✅ Editar → actualiza talonario_pagos_banco + elimina asiento viejo + crea nuevo
- ✅ generarAsientoPagoFijo: DEBE [cuenta_debe_key] / HABER Banco con "[CODIGO] — [Mes Año]"
- ✅ ResumenTalonario/saldoBanco/MovimientosBanco sin cambios (ya leen talonario_pagos_banco)

**Placeholder scan:** Sin TBD ni TODO.

**Type consistency:** `generarAsientoPagoFijo({ id, monto, codigo, cuenta_debe_key, mes, año })` usado igual en Task 2, Task 5 (registrar) y Task 5 (editar).
