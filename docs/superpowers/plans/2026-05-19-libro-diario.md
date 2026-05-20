# Libro Diario Contable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el cerebro contable de Candelaria — un Libro Diario de doble entrada que genera asientos automáticos desde Facturación, Compras, Nómina y Caja Chica, con visor para David (Gerencial) y la contadora (SRI).

**Architecture:** Hybrid approach — cada módulo escribe su asiento en tiempo real al guardar (doble escritura), más un botón Sincronizar que escanea registros sin asiento como red de seguridad. Todos los generadores de asientos viven en `src/utils/asientosContables.js` como funciones puras. La UI principal en `src/LibroDiario.js` tiene 4 tabs: Resumen, Asientos, Plan de Cuentas, Asiento Inicial.

**Tech Stack:** React 18, Supabase (PostgREST + JS client), JavaScript (no TypeScript)

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| CREATE | `supabase/migrations/20260519_libro_diario.sql` | 4 tablas + seed Plan de Cuentas |
| CREATE | `src/utils/asientosContables.js` | Generadores puros de asientos por módulo |
| CREATE | `src/LibroDiario.js` | Pantalla principal + tabs + KPIs + botón Sync |
| CREATE | `src/components/libroDiario/TabResumen.js` | Tabla de asientos + filtros + confirmar |
| CREATE | `src/components/libroDiario/TabPlanCuentas.js` | Árbol jerárquico Plan de Cuentas |
| CREATE | `src/components/libroDiario/TabAsientoInicial.js` | Wizard saldos iniciales |
| MODIFY | `src/components/MenuContabilidad.js` | Agregar botón Libro Diario |
| MODIFY | `src/App.js` | Agregar ruta `libroDiario` |
| MODIFY | `src/components/facturacion/TabNuevaVenta.js` | Hook asiento al emitir/guardar factura |
| MODIFY | `src/components/compras/TabIngresoCompra.js` | Hook asiento al guardar compra |
| MODIFY | `src/components/rrhh/TabNomina.js` | Hook asiento al confirmar nómina |
| MODIFY | `src/components/facturacion/TabCajaChica.js` | Hook asiento al cerrar caja |

---

## Task 1: Migración SQL — 4 tablas + Plan de Cuentas

**Files:**
- Create: `supabase/migrations/20260519_libro_diario.sql`

- [ ] **Step 1.1: Crear el archivo de migración**

```sql
-- supabase/migrations/20260519_libro_diario.sql

-- ── 1. cuentas_contables ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cuentas_contables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text UNIQUE NOT NULL,
  nombre      text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto')),
  nivel       int  NOT NULL CHECK (nivel BETWEEN 1 AND 4),
  naturaleza  text NOT NULL CHECK (naturaleza IN ('deudora','acreedora')),
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ── 2. libro_diario (cabecera) ────────────────────────────────
CREATE TABLE IF NOT EXISTS libro_diario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           date NOT NULL,
  descripcion     text NOT NULL,
  tipo            text NOT NULL DEFAULT 'tributario' CHECK (tipo IN ('tributario','interno')),
  origen          text NOT NULL CHECK (origen IN ('facturacion','compras','nomina','caja_chica','manual','asiento_inicial')),
  origen_id       uuid,
  estado          text NOT NULL DEFAULT 'provisional' CHECK (estado IN ('provisional','confirmado','eliminado')),
  confirmado_por  text,
  confirmado_at   timestamptz,
  created_at      timestamptz DEFAULT now(),
  created_by      text
);

-- ── 3. libro_diario_detalle (líneas debe/haber) ───────────────
CREATE TABLE IF NOT EXISTS libro_diario_detalle (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asiento_id  uuid NOT NULL REFERENCES libro_diario(id) ON DELETE CASCADE,
  cuenta_id   uuid NOT NULL REFERENCES cuentas_contables(id),
  descripcion text,
  debe        numeric(12,2) NOT NULL DEFAULT 0,
  haber       numeric(12,2) NOT NULL DEFAULT 0,
  orden       int NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ── 4. config_contabilidad ────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_contabilidad (
  clave text PRIMARY KEY,
  valor jsonb NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_libro_diario_fecha    ON libro_diario(fecha);
CREATE INDEX IF NOT EXISTS idx_libro_diario_estado   ON libro_diario(estado);
CREATE INDEX IF NOT EXISTS idx_libro_diario_origen   ON libro_diario(origen, origen_id);
CREATE INDEX IF NOT EXISTS idx_detalle_asiento_id    ON libro_diario_detalle(asiento_id);

-- ── 5. Seed Plan de Cuentas Ecuador ──────────────────────────
INSERT INTO cuentas_contables (codigo, nombre, tipo, nivel, naturaleza) VALUES
-- ACTIVO
('1',       'ACTIVO',                          'activo',    1, 'deudora'),
('1.1',     'Activo Corriente',                'activo',    2, 'deudora'),
('1.1.1',   'Caja y Bancos',                   'activo',    3, 'deudora'),
('1.1.1.01','Caja General',                    'activo',    4, 'deudora'),
('1.1.1.02','Caja Chica',                      'activo',    4, 'deudora'),
('1.1.1.03','Bancos',                          'activo',    4, 'deudora'),
('1.1.2',   'Cuentas por Cobrar',              'activo',    3, 'deudora'),
('1.1.2.01','Clientes',                        'activo',    4, 'deudora'),
('1.1.3',   'Inventarios',                     'activo',    3, 'deudora'),
('1.1.3.01','Inventario Materia Prima',        'activo',    4, 'deudora'),
('1.1.3.02','Inventario Producto Terminado',   'activo',    4, 'deudora'),
('1.1.4',   'IVA',                             'activo',    3, 'deudora'),
('1.1.4.01','IVA en Compras',                  'activo',    4, 'deudora'),
-- PASIVO
('2',       'PASIVO',                          'pasivo',    1, 'acreedora'),
('2.1',     'Pasivo Corriente',                'pasivo',    2, 'acreedora'),
('2.1.1',   'Cuentas por Pagar',               'pasivo',    3, 'acreedora'),
('2.1.1.01','Proveedores',                     'pasivo',    4, 'acreedora'),
('2.1.2',   'Obligaciones Laborales',          'pasivo',    3, 'acreedora'),
('2.1.2.01','IESS por Pagar',                  'pasivo',    4, 'acreedora'),
('2.1.2.02','Sueldos por Pagar',               'pasivo',    4, 'acreedora'),
('2.1.3',   'Obligaciones Tributarias',        'pasivo',    3, 'acreedora'),
('2.1.3.01','IVA Ventas por Pagar',            'pasivo',    4, 'acreedora'),
('2.1.3.02','Retenciones por Pagar',           'pasivo',    4, 'acreedora'),
-- PATRIMONIO
('3',       'PATRIMONIO',                      'patrimonio',1, 'acreedora'),
('3.1',     'Capital',                         'patrimonio',2, 'acreedora'),
('3.1.1',   'Capital Social',                  'patrimonio',3, 'acreedora'),
('3.1.1.01','Capital Social',                  'patrimonio',4, 'acreedora'),
-- INGRESOS
('4',       'INGRESOS',                        'ingreso',   1, 'acreedora'),
('4.1',     'Ingresos Operacionales',          'ingreso',   2, 'acreedora'),
('4.1.1',   'Ventas',                          'ingreso',   3, 'acreedora'),
('4.1.1.01','Ventas 15% IVA',                  'ingreso',   4, 'acreedora'),
('4.1.1.02','Ingresos Gerenciales',            'ingreso',   4, 'acreedora'),
-- GASTOS
('5',       'GASTOS',                          'gasto',     1, 'deudora'),
('5.1',     'Gastos Operacionales',            'gasto',     2, 'deudora'),
('5.1.1',   'Gastos de Personal',              'gasto',     3, 'deudora'),
('5.1.1.01','Gasto Sueldos y Salarios',        'gasto',     4, 'deudora'),
('5.1.1.02','Gasto IESS Patronal',             'gasto',     4, 'deudora'),
('5.1.2',   'Gastos Generales',                'gasto',     3, 'deudora'),
('5.1.2.01','Gasto Caja Chica',                'gasto',     4, 'deudora'),
('5.1.2.02','Costo Materia Prima',             'gasto',     4, 'deudora')
ON CONFLICT (codigo) DO NOTHING;

-- ── 6. Config inicial ─────────────────────────────────────────
INSERT INTO config_contabilidad (clave, valor) VALUES
('asiento_inicial', '{"completado": false, "fecha": null, "banco": 0, "caja": 0, "inventario": 0, "patrimonio": 0}'),
('cuentas_modulos', jsonb_build_object(
  'caja_general_id',      (SELECT id FROM cuentas_contables WHERE codigo = '1.1.1.01'),
  'caja_chica_id',        (SELECT id FROM cuentas_contables WHERE codigo = '1.1.1.02'),
  'banco_id',             (SELECT id FROM cuentas_contables WHERE codigo = '1.1.1.03'),
  'cxc_id',               (SELECT id FROM cuentas_contables WHERE codigo = '1.1.2.01'),
  'inventario_mp_id',     (SELECT id FROM cuentas_contables WHERE codigo = '1.1.3.01'),
  'iva_compras_id',       (SELECT id FROM cuentas_contables WHERE codigo = '1.1.4.01'),
  'cxp_id',               (SELECT id FROM cuentas_contables WHERE codigo = '2.1.1.01'),
  'iess_pagar_id',        (SELECT id FROM cuentas_contables WHERE codigo = '2.1.2.01'),
  'sueldos_pagar_id',     (SELECT id FROM cuentas_contables WHERE codigo = '2.1.2.02'),
  'iva_ventas_id',        (SELECT id FROM cuentas_contables WHERE codigo = '2.1.3.01'),
  'capital_id',           (SELECT id FROM cuentas_contables WHERE codigo = '3.1.1.01'),
  'ventas_gravadas_id',   (SELECT id FROM cuentas_contables WHERE codigo = '4.1.1.01'),
  'ventas_internas_id',   (SELECT id FROM cuentas_contables WHERE codigo = '4.1.1.02'),
  'sueldos_id',           (SELECT id FROM cuentas_contables WHERE codigo = '5.1.1.01'),
  'iess_patronal_id',     (SELECT id FROM cuentas_contables WHERE codigo = '5.1.1.02'),
  'gasto_caja_id',        (SELECT id FROM cuentas_contables WHERE codigo = '5.1.2.01'),
  'costo_mp_id',          (SELECT id FROM cuentas_contables WHERE codigo = '5.1.2.02')
))
ON CONFLICT (clave) DO NOTHING;
```

- [ ] **Step 1.2: Ejecutar en Supabase SQL Editor**

Abre Supabase → SQL Editor → pega el contenido completo → Run.
Verifica: `SELECT COUNT(*) FROM cuentas_contables;` debe retornar 40.
Verifica: `SELECT clave FROM config_contabilidad;` debe mostrar `asiento_inicial` y `cuentas_modulos`.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260519_libro_diario.sql
git commit -m "feat: migración SQL libro diario — 4 tablas + Plan de Cuentas Ecuador"
```

---

## Task 2: `src/utils/asientosContables.js` — Generadores de asientos

**Files:**
- Create: `src/utils/asientosContables.js`

- [ ] **Step 2.1: Crear el archivo de utilidades**

```javascript
// src/utils/asientosContables.js
// Generadores puros de asientos contables por módulo.
// Cada función lee config_contabilidad, construye el asiento
// y lo inserta en libro_diario + libro_diario_detalle.

import { supabase } from '../supabase';

// ── Cargar mapeo de cuentas (con caché en módulo) ─────────────
let _cuentas = null;
export async function getCuentasModulos() {
  if (_cuentas) return _cuentas;
  const { data } = await supabase
    .from('config_contabilidad')
    .select('valor')
    .eq('clave', 'cuentas_modulos')
    .single();
  _cuentas = data?.valor || {};
  return _cuentas;
}
export function invalidarCacheContable() { _cuentas = null; }

// ── Insertar asiento completo ─────────────────────────────────
async function insertarAsiento(cabecera, lineas) {
  const { data: asiento, error: errA } = await supabase
    .from('libro_diario')
    .insert(cabecera)
    .select()
    .single();
  if (errA) { console.error('[LibroDiario] Error cabecera:', errA.message); return null; }

  const detalles = lineas.map((l, i) => ({ ...l, asiento_id: asiento.id, orden: i }));
  const { error: errD } = await supabase
    .from('libro_diario_detalle')
    .insert(detalles);
  if (errD) { console.error('[LibroDiario] Error detalle:', errD.message); return null; }

  return asiento;
}

// ── Verificar si ya existe asiento para este origen ──────────
async function yaExisteAsiento(origen, origen_id) {
  const { data } = await supabase
    .from('libro_diario')
    .select('id')
    .eq('origen', origen)
    .eq('origen_id', origen_id)
    .neq('estado', 'eliminado')
    .maybeSingle();
  return !!data;
}

// ─────────────────────────────────────────────────────────────
// GENERADOR 1 — Factura emitida / Nota de venta
// tipo: 'tributario' (con IVA) | 'interno' (sin IVA)
// ─────────────────────────────────────────────────────────────
export async function generarAsientoFactura(factura, currentUser) {
  if (!factura?.id) return;
  if (await yaExisteAsiento('facturacion', factura.id)) return;

  const c = await getCuentasModulos();
  const esInterno = factura.tipo === 'interno';

  const subtotal = parseFloat(factura.subtotal || 0);
  const iva      = parseFloat(factura.iva || 0);
  const total    = parseFloat(factura.total || 0);

  const cabecera = {
    fecha:       factura.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    descripcion: `${esInterno ? 'Nota Venta' : 'Factura'} ${factura.numero} — ${factura.cliente_nombre || 'Cliente'}`,
    tipo:        esInterno ? 'interno' : 'tributario',
    origen:      'facturacion',
    origen_id:   factura.id,
    estado:      'provisional',
    created_by:  currentUser?.email || '',
  };

  let lineas;
  if (esInterno) {
    // Regla 1: sin IVA, va a Ingresos Gerenciales
    lineas = [
      { cuenta_id: factura.forma_pago === 'credito' ? c.cxc_id : c.caja_general_id,
        descripcion: 'Cobro nota de venta', debe: total, haber: 0 },
      { cuenta_id: c.ventas_internas_id,
        descripcion: 'Ingreso gerencial', debe: 0, haber: total },
    ];
  } else {
    // Tributario: CxC o Caja DEBE / Ventas HABER + IVA Ventas HABER
    const cuentaCobro = factura.forma_pago === 'credito' ? c.cxc_id : c.caja_general_id;
    lineas = [
      { cuenta_id: cuentaCobro, descripcion: 'Cuentas por cobrar / Caja', debe: total, haber: 0 },
      { cuenta_id: c.ventas_gravadas_id, descripcion: 'Ventas gravadas 15%', debe: 0, haber: subtotal },
    ];
    if (iva > 0) {
      lineas.push({ cuenta_id: c.iva_ventas_id, descripcion: 'IVA Ventas 15%', debe: 0, haber: iva });
    }
  }

  return insertarAsiento(cabecera, lineas);
}

// ─────────────────────────────────────────────────────────────
// GENERADOR 2 — Cobro de factura (pago recibido)
// ─────────────────────────────────────────────────────────────
export async function generarAsientoCobro(cobro, facturaNumero, currentUser) {
  if (!cobro?.id) return;
  if (await yaExisteAsiento('facturacion', cobro.id)) return;

  const c = await getCuentasModulos();
  const monto = parseFloat(cobro.monto || 0);
  const cuentaDestino = cobro.forma_pago === 'transferencia' ? c.banco_id : c.caja_general_id;

  const cabecera = {
    fecha:       cobro.fecha || new Date().toISOString().split('T')[0],
    descripcion: `Cobro Factura ${facturaNumero}`,
    tipo:        'tributario',
    origen:      'facturacion',
    origen_id:   cobro.id,
    estado:      'provisional',
    created_by:  currentUser?.email || '',
  };

  const lineas = [
    { cuenta_id: cuentaDestino, descripcion: 'Cobro recibido', debe: monto, haber: 0 },
    { cuenta_id: c.cxc_id, descripcion: 'Cancelación CxC', debe: 0, haber: monto },
  ];

  return insertarAsiento(cabecera, lineas);
}

// ─────────────────────────────────────────────────────────────
// GENERADOR 3 — Compra de materia prima
// ─────────────────────────────────────────────────────────────
export async function generarAsientoCompra(compra, currentUser) {
  if (!compra?.id) return;
  if (await yaExisteAsiento('compras', compra.id)) return;

  const c = await getCuentasModulos();
  const subtotal = parseFloat(compra.subtotal || 0);
  const iva      = parseFloat(compra.iva_valor || 0);
  const total    = parseFloat(compra.neto_pagar || compra.total || subtotal + iva);

  const cabecera = {
    fecha:       compra.fecha || new Date().toISOString().split('T')[0],
    descripcion: `Compra MP — ${compra.proveedor_nombre || 'Proveedor'}${compra.num_factura ? ' F:' + compra.num_factura : ''}`,
    tipo:        'tributario',
    origen:      'compras',
    origen_id:   compra.id,
    estado:      'provisional',
    created_by:  currentUser?.email || '',
  };

  const cuentaCredito = compra.forma_pago === 'credito' ? c.cxp_id : c.banco_id;
  const lineas = [
    { cuenta_id: c.inventario_mp_id, descripcion: 'Inventario Materia Prima', debe: subtotal, haber: 0 },
  ];
  if (iva > 0) {
    lineas.push({ cuenta_id: c.iva_compras_id, descripcion: 'IVA en Compras', debe: iva, haber: 0 });
  }
  lineas.push({ cuenta_id: cuentaCredito, descripcion: compra.forma_pago === 'credito' ? 'CxP Proveedor' : 'Pago Banco', debe: 0, haber: total });

  return insertarAsiento(cabecera, lineas);
}

// ─────────────────────────────────────────────────────────────
// GENERADOR 4 — Rol de nómina
// ─────────────────────────────────────────────────────────────
export async function generarAsientoNomina(nominaId, totalSueldos, totalIessPatronal, mesLabel, currentUser) {
  if (!nominaId) return;
  if (await yaExisteAsiento('nomina', nominaId)) return;

  const c = await getCuentasModulos();

  const cabecera = {
    fecha:       new Date().toISOString().split('T')[0],
    descripcion: `Nómina ${mesLabel}`,
    tipo:        'interno',
    origen:      'nomina',
    origen_id:   nominaId,
    estado:      'provisional',
    created_by:  currentUser?.email || '',
  };

  const lineas = [
    { cuenta_id: c.sueldos_id, descripcion: 'Gasto Sueldos y Salarios', debe: totalSueldos, haber: 0 },
    { cuenta_id: c.banco_id,   descripcion: 'Pago neto nómina',         debe: 0, haber: totalSueldos },
  ];
  if (totalIessPatronal > 0) {
    lineas.push({ cuenta_id: c.iess_patronal_id, descripcion: 'Gasto IESS Patronal', debe: totalIessPatronal, haber: 0 });
    lineas.push({ cuenta_id: c.iess_pagar_id,    descripcion: 'IESS por Pagar',       debe: 0, haber: totalIessPatronal });
  }

  return insertarAsiento(cabecera, lineas);
}

// ─────────────────────────────────────────────────────────────
// GENERADOR 5 — Cierre Caja Chica
// ─────────────────────────────────────────────────────────────
export async function generarAsientoCierre(cajaId, fecha, totalGastos, currentUser) {
  if (!cajaId) return;
  if (await yaExisteAsiento('caja_chica', cajaId)) return;

  const c = await getCuentasModulos();
  if (!c.caja_chica_id) { console.warn('[LibroDiario] caja_chica_id no configurado'); return; }
  if (totalGastos <= 0) return;

  const cabecera = {
    fecha:       fecha,
    descripcion: `Cierre Caja Chica ${fecha}`,
    tipo:        'interno',
    origen:      'caja_chica',
    origen_id:   cajaId,
    estado:      'provisional',
    created_by:  currentUser?.email || '',
  };

  const lineas = [
    { cuenta_id: c.gasto_caja_id,  descripcion: 'Gastos de caja chica', debe: totalGastos, haber: 0 },
    { cuenta_id: c.caja_chica_id,  descripcion: 'Salida de caja chica', debe: 0, haber: totalGastos },
  ];

  return insertarAsiento(cabecera, lineas);
}

// ─────────────────────────────────────────────────────────────
// SINCRONIZADOR — Escanea registros sin asiento y los crea
// ─────────────────────────────────────────────────────────────
export async function sincronizarAsientesPendientes(currentUser) {
  let creados = 0;

  // Facturas sin asiento
  const { data: facturas } = await supabase
    .from('facturas')
    .select('*')
    .in('estado', ['autorizada', 'borrador'])
    .order('created_at');
  for (const f of facturas || []) {
    if (!(await yaExisteAsiento('facturacion', f.id))) {
      await generarAsientoFactura(f, currentUser);
      creados++;
    }
  }

  // Compras sin asiento
  const { data: compras } = await supabase
    .from('compras')
    .select('*, proveedores(nombre)')
    .order('fecha');
  for (const c of compras || []) {
    if (!(await yaExisteAsiento('compras', c.id))) {
      await generarAsientoCompra({ ...c, proveedor_nombre: c.proveedores?.nombre }, currentUser);
      creados++;
    }
  }

  return creados;
}
```

- [ ] **Step 2.2: Verificar que el archivo no tiene errores de sintaxis**

```bash
node --check src/utils/asientosContables.js 2>&1 || echo "Revisar errores"
```

- [ ] **Step 2.3: Commit**

```bash
git add src/utils/asientosContables.js
git commit -m "feat: utilidades generadoras de asientos contables por módulo"
```

---

## Task 3: `src/LibroDiario.js` — Pantalla principal

**Files:**
- Create: `src/LibroDiario.js`

- [ ] **Step 3.1: Crear LibroDiario.js**

```javascript
// src/LibroDiario.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import TabResumen       from './components/libroDiario/TabResumen';
import TabPlanCuentas   from './components/libroDiario/TabPlanCuentas';
import TabAsientoInicial from './components/libroDiario/TabAsientoInicial';
import { sincronizarAsientesPendientes } from './utils/asientosContables';

const TABS = ['📊 Resumen', '📋 Asientos', '📈 Plan de Cuentas', '⚙️ Asiento Inicial'];

export default function LibroDiario({ onVolver, onVolverMenu, userRol, currentUser }) {
  const [tabActivo, setTabActivo] = useState(0);
  const [vistaMode, setVistaMode] = useState('gerencial'); // 'gerencial' | 'sri'
  const [periodo,   setPeriodo]   = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [asientos,  setAsientos]  = useState([]);
  const [kpis,      setKpis]      = useState({ debe: 0, haber: 0, pendientes: 0 });
  const [syncing,   setSyncing]   = useState(false);
  const [msgSync,   setMsgSync]   = useState('');

  useEffect(() => { cargarAsientos(); }, [periodo]);

  async function cargarAsientos() {
    const desde = periodo + '-01';
    const hasta = periodo + '-31';
    const { data } = await supabase
      .from('libro_diario')
      .select('*, libro_diario_detalle(*, cuentas_contables(codigo, nombre, tipo))')
      .gte('fecha', desde).lte('fecha', hasta)
      .neq('estado', 'eliminado')
      .order('fecha').order('created_at');

    const lista = data || [];
    setAsientos(lista);

    let debe = 0, haber = 0, pendientes = 0;
    lista.forEach(a => {
      (a.libro_diario_detalle || []).forEach(d => {
        debe  += parseFloat(d.debe  || 0);
        haber += parseFloat(d.haber || 0);
      });
      if (a.estado === 'provisional') pendientes++;
    });
    setKpis({ debe, haber, pendientes });
  }

  async function handleSync() {
    setSyncing(true);
    setMsgSync('');
    const n = await sincronizarAsientesPendientes(currentUser);
    await cargarAsientos();
    setMsgSync(`✓ ${n} asiento(s) sincronizados`);
    setSyncing(false);
    setTimeout(() => setMsgSync(''), 4000);
  }

  const balance = Math.abs(kpis.debe - kpis.haber);
  const cuadrado = balance < 0.01;

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', fontFamily:'Arial,sans-serif' }}>
      {/* Top bar */}
      <div style={{
        background:'#1e293b', padding:'10px 20px',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        borderBottom:'1px solid #334155'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onVolver} style={{
            background:'none', border:'1px solid #475569', color:'#94a3b8',
            borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:12
          }}>← Volver</button>
          <span style={{ color:'white', fontWeight:'bold', fontSize:15 }}>📒 Libro Diario</span>
          <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
            style={{ background:'#374151', color:'#e2e8f0', border:'1px solid #4b5563',
                     borderRadius:6, padding:'4px 8px', fontSize:12 }} />
          {/* Toggle Vista */}
          <div style={{ display:'flex', background:'#111827', borderRadius:6,
                        border:'1px solid #374151', overflow:'hidden' }}>
            <button onClick={() => setVistaMode('gerencial')} style={{
              background: vistaMode==='gerencial' ? '#1d4ed8' : 'transparent',
              color: vistaMode==='gerencial' ? 'white' : '#6b7280',
              border:'none', padding:'4px 12px', cursor:'pointer', fontSize:11, fontWeight:'bold'
            }}>👔 Gerencial</button>
            <button onClick={() => setVistaMode('sri')} style={{
              background: vistaMode==='sri' ? '#1d4ed8' : 'transparent',
              color: vistaMode==='sri' ? 'white' : '#6b7280',
              border:'none', padding:'4px 12px', cursor:'pointer', fontSize:11
            }}>🏛️ SRI</button>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {msgSync && <span style={{ color:'#4ade80', fontSize:11 }}>{msgSync}</span>}
          <button onClick={handleSync} disabled={syncing} style={{
            background: syncing ? '#374151' : '#6d28d9', color:'white',
            border:'none', borderRadius:6, padding:'6px 14px',
            cursor: syncing ? 'default' : 'pointer', fontSize:12, fontWeight:'bold'
          }}>{syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar'}</button>
          <button style={{
            background:'#0369a1', color:'white', border:'none',
            borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:12
          }}>📥 Exportar</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr',
                    borderBottom:'1px solid #1e293b' }}>
        {[
          { label:'DEBE TOTAL',    value:`$${kpis.debe.toFixed(2)}`,   color:'#4ade80', bg:'#052e16' },
          { label:'HABER TOTAL',   value:`$${kpis.haber.toFixed(2)}`,  color:'#f87171', bg:'#450a0a' },
          { label:'BALANCE',
            value: cuadrado ? '✓ $0.00' : `⚠ $${balance.toFixed(2)}`,
            color: cuadrado ? '#4ade80' : '#fbbf24', bg:'#0c1a2e' },
          { label:'PENDIENTES',    value:kpis.pendientes,               color:'#fbbf24', bg:'#422006' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, padding:'14px 20px', textAlign:'center' }}>
            <div style={{ color: k.color, fontSize:9, fontWeight:'bold', letterSpacing:1, marginBottom:4 }}>
              {k.label}
            </div>
            <div style={{ color:'white', fontSize:22, fontWeight:'bold' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'2px solid #334155' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTabActivo(i)} style={{
            background:'none', border:'none', padding:'10px 20px', cursor:'pointer',
            fontSize:12, fontWeight: tabActivo===i ? 'bold' : 'normal',
            color:    tabActivo===i ? '#3b82f6' : '#9ca3af',
            borderBottom: tabActivo===i ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom:'-2px'
          }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding:'16px 20px' }}>
        {(tabActivo === 0 || tabActivo === 1) && (
          <TabResumen
            asientos={asientos}
            vistaMode={vistaMode}
            onRefresh={cargarAsientos}
            currentUser={currentUser}
          />
        )}
        {tabActivo === 2 && <TabPlanCuentas />}
        {tabActivo === 3 && <TabAsientoInicial currentUser={currentUser} onDone={cargarAsientos} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: Commit**

```bash
git add src/LibroDiario.js
git commit -m "feat: pantalla principal LibroDiario con KPIs, tabs y botón Sync"
```

---

## Task 4: `TabResumen.js` — Tabla de asientos + confirmar

**Files:**
- Create: `src/components/libroDiario/TabResumen.js`

- [ ] **Step 4.1: Crear TabResumen.js**

```javascript
// src/components/libroDiario/TabResumen.js
import React, { useState } from 'react';
import { supabase } from '../../supabase';

const COLORES_ORIGEN = {
  facturacion:    { border:'#3b82f6', bg:'#0d1b2e', label:'🧾', text:'#60a5fa' },
  compras:        { border:'#f59e0b', bg:'#1a1000', label:'🛒', text:'#fbbf24' },
  nomina:         { border:'#8b5cf6', bg:'#0d1127', label:'👥', text:'#c4b5fd' },
  caja_chica:     { border:'#22c55e', bg:'#0a1f0a', label:'💵', text:'#86efac' },
  manual:         { border:'#94a3b8', bg:'#1e293b', label:'✏️', text:'#e2e8f0' },
  asiento_inicial:{ border:'#f97316', bg:'#1a0d00', label:'🏁', text:'#fdba74' },
};

const FILTROS = ['Todos', 'Confirmados', 'Provisionales', 'facturacion', 'compras', 'nomina', 'caja_chica'];

export default function TabResumen({ asientos, vistaMode, onRefresh, currentUser }) {
  const [filtro,    setFiltro]    = useState('Todos');
  const [seleccion, setSeleccion] = useState(new Set());
  const [cargando,  setCargando]  = useState(false);

  const filtrados = asientos.filter(a => {
    if (vistaMode === 'sri' && a.tipo === 'interno') return false;
    if (filtro === 'Confirmados')  return a.estado === 'confirmado';
    if (filtro === 'Provisionales')return a.estado === 'provisional';
    if (['facturacion','compras','nomina','caja_chica'].includes(filtro)) return a.origen === filtro;
    return true;
  });

  const provisionales = filtrados.filter(a => a.estado === 'provisional');

  async function confirmarSeleccionados() {
    const ids = seleccion.size > 0
      ? [...seleccion]
      : provisionales.map(a => a.id);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Confirmar ${ids.length} asiento(s)?`)) return;
    setCargando(true);
    await supabase.from('libro_diario')
      .update({ estado:'confirmado', confirmado_por: currentUser?.email, confirmado_at: new Date().toISOString() })
      .in('id', ids);
    setSeleccion(new Set());
    await onRefresh();
    setCargando(false);
  }

  async function eliminarAsiento(id) {
    if (!window.confirm('¿Eliminar este asiento provisional?')) return;
    await supabase.from('libro_diario').update({ estado:'eliminado' }).eq('id', id).eq('estado','provisional');
    await onRefresh();
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <span style={{ color:'#6b7280', fontSize:10 }}>Filtrar:</span>
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            background: filtro===f ? '#1e3a5f' : '#1e293b',
            border: `1px solid ${filtro===f ? '#2563eb' : '#334155'}`,
            color:  filtro===f ? '#93c5fd' : '#6b7280',
            padding:'3px 10px', borderRadius:20, fontSize:10, cursor:'pointer'
          }}>{f}</button>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background:'#111827', borderRadius:8, border:'1px solid #1f2937', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'30px 80px 1fr 100px 90px 90px 110px 60px',
                      gap:8, padding:'8px 12px', background:'#1f2937',
                      borderBottom:'1px solid #374151' }}>
          {['','Fecha','Descripción','Cuenta','Debe','Haber','Estado',''].map((h,i) => (
            <div key={i} style={{ color:'#9ca3af', fontSize:9, fontWeight:'bold',
                                   textTransform:'uppercase', textAlign: i>=4&&i<=5?'right':'left' }}>{h}</div>
          ))}
        </div>

        {filtrados.length === 0 && (
          <div style={{ textAlign:'center', padding:'30px', color:'#6b7280', fontSize:13 }}>
            No hay asientos para este período / filtro
          </div>
        )}

        {filtrados.map(asiento => {
          const col = COLORES_ORIGEN[asiento.origen] || COLORES_ORIGEN.manual;
          const lineas = asiento.libro_diario_detalle || [];
          return (
            <div key={asiento.id} style={{ borderLeft:`3px solid ${col.border}`, background:col.bg,
                                            borderTop:'1px solid #1f2937' }}>
              {/* Cabecera asiento */}
              <div style={{ padding:'6px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox"
                    checked={seleccion.has(asiento.id)}
                    disabled={asiento.estado !== 'provisional'}
                    onChange={e => {
                      const s = new Set(seleccion);
                      e.target.checked ? s.add(asiento.id) : s.delete(asiento.id);
                      setSeleccion(s);
                    }}
                  />
                  <span style={{ color:col.text, fontSize:9, fontWeight:'bold' }}>
                    {col.label} {asiento.origen.toUpperCase()} — {asiento.descripcion}
                  </span>
                  <span style={{ color:'#6b7280', fontSize:9 }}>{asiento.fecha}</span>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={{
                    background: asiento.estado==='confirmado' ? '#065f46' : '#78350f',
                    color:      asiento.estado==='confirmado' ? '#6ee7b7' : '#fcd34d',
                    fontSize:8, padding:'2px 8px', borderRadius:10
                  }}>
                    {asiento.estado==='confirmado' ? '✓ Confirmado' : '⏳ Provisional'}
                  </span>
                  {asiento.estado === 'provisional' && (
                    <button onClick={() => eliminarAsiento(asiento.id)} style={{
                      background:'none', border:'none', color:'#ef4444',
                      cursor:'pointer', fontSize:12, padding:'0 4px'
                    }}>🗑</button>
                  )}
                </div>
              </div>
              {/* Líneas */}
              {lineas.map((l, i) => (
                <div key={i} style={{ display:'grid',
                  gridTemplateColumns:'30px 80px 1fr 100px 90px 90px 110px 60px',
                  gap:8, padding:'3px 12px 3px 42px', borderTop:'1px solid rgba(255,255,255,0.03)' }}>
                  <div></div>
                  <div style={{ color:'#6b7280', fontSize:9 }}>{i===0 ? asiento.fecha : ''}</div>
                  <div style={{ color:'#e5e7eb', fontSize:9 }}>{l.descripcion}</div>
                  <div style={{ color:'#7dd3fc', fontSize:9 }}>{l.cuentas_contables?.codigo}</div>
                  <div style={{ color:'#4ade80', fontSize:9, textAlign:'right' }}>
                    {parseFloat(l.debe)>0 ? `$${parseFloat(l.debe).toFixed(2)}` : '—'}
                  </div>
                  <div style={{ color:'#f87171', fontSize:9, textAlign:'right' }}>
                    {parseFloat(l.haber)>0 ? `$${parseFloat(l.haber).toFixed(2)}` : '—'}
                  </div>
                  <div></div><div></div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Botón confirmar */}
      {provisionales.length > 0 && (
        <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={confirmarSeleccionados} disabled={cargando} style={{
            background: cargando ? '#374151' : '#065f46',
            color:'#6ee7b7', border:'none', borderRadius:7,
            padding:'8px 20px', cursor:'pointer', fontSize:12, fontWeight:'bold'
          }}>
            {cargando ? '⏳...' : `✓ Confirmar ${seleccion.size>0?seleccion.size:provisionales.length} provisionales`}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.2: Commit**

```bash
git add src/components/libroDiario/TabResumen.js
git commit -m "feat: TabResumen — tabla asientos con filtros, confirmar y eliminar"
```

---

## Task 5: `TabPlanCuentas.js` — Árbol Plan de Cuentas

**Files:**
- Create: `src/components/libroDiario/TabPlanCuentas.js`

- [ ] **Step 5.1: Crear TabPlanCuentas.js**

```javascript
// src/components/libroDiario/TabPlanCuentas.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const TIPO_COLOR = {
  activo:     '#3b82f6',
  pasivo:     '#ef4444',
  patrimonio: '#8b5cf6',
  ingreso:    '#22c55e',
  gasto:      '#f59e0b',
};

export default function TabPlanCuentas() {
  const [cuentas, setCuentas] = useState([]);

  useEffect(() => {
    supabase.from('cuentas_contables').select('*').order('codigo').then(({ data }) => {
      setCuentas(data || []);
    });
  }, []);

  const nivel1 = cuentas.filter(c => c.nivel === 1);

  function hijos(codigo) {
    const partes = codigo.split('.');
    return cuentas.filter(c => {
      const cp = c.codigo.split('.');
      return cp.length === partes.length + 1 && c.codigo.startsWith(codigo + '.');
    });
  }

  function Cuenta({ c, depth = 0 }) {
    const [abierto, setAbierto] = useState(depth < 2);
    const childs = hijos(c.codigo);
    const color = TIPO_COLOR[c.tipo] || '#94a3b8';
    return (
      <div>
        <div onClick={() => childs.length && setAbierto(!abierto)}
          style={{
            display:'flex', alignItems:'center', gap:8,
            padding:`5px ${8 + depth * 20}px`,
            background: depth===0 ? '#1e293b' : 'transparent',
            borderBottom:'1px solid #1f2937',
            cursor: childs.length ? 'pointer' : 'default',
          }}>
          {childs.length > 0 && (
            <span style={{ color:'#6b7280', fontSize:10, width:10 }}>{abierto ? '▾' : '▸'}</span>
          )}
          {childs.length === 0 && <span style={{ width:10 }}></span>}
          <span style={{ color:'#6b7280', fontSize:10, fontFamily:'monospace', width:80 }}>{c.codigo}</span>
          <span style={{ color: depth===0 ? color : '#e5e7eb', fontSize: depth===0 ? 13 : 12,
                         fontWeight: depth===0 ? 'bold' : 'normal' }}>{c.nombre}</span>
          <span style={{ marginLeft:'auto', background: color+'22', color, fontSize:9,
                         padding:'1px 6px', borderRadius:8 }}>{c.tipo}</span>
          <span style={{ color:'#6b7280', fontSize:9, width:60 }}>{c.naturaleza}</span>
        </div>
        {abierto && childs.map(ch => <Cuenta key={ch.id} c={ch} depth={depth+1} />)}
      </div>
    );
  }

  return (
    <div style={{ background:'#111827', borderRadius:8, border:'1px solid #1f2937', overflow:'hidden' }}>
      <div style={{ display:'flex', gap:8, padding:'10px 14px', background:'#1e293b',
                    borderBottom:'1px solid #334155', flexWrap:'wrap' }}>
        {Object.entries(TIPO_COLOR).map(([tipo, color]) => (
          <span key={tipo} style={{ background:color+'22', color, fontSize:10,
                                    padding:'2px 8px', borderRadius:8 }}>{tipo}</span>
        ))}
      </div>
      {nivel1.map(c => <Cuenta key={c.id} c={c} depth={0} />)}
    </div>
  );
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/components/libroDiario/TabPlanCuentas.js
git commit -m "feat: TabPlanCuentas — árbol jerárquico Plan de Cuentas Ecuador"
```

---

## Task 6: `TabAsientoInicial.js` — Wizard de saldos iniciales

**Files:**
- Create: `src/components/libroDiario/TabAsientoInicial.js`

- [ ] **Step 6.1: Crear TabAsientoInicial.js**

```javascript
// src/components/libroDiario/TabAsientoInicial.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { getCuentasModulos, invalidarCacheContable } from '../../utils/asientosContables';

export default function TabAsientoInicial({ currentUser, onDone }) {
  const [config,    setConfig]    = useState(null);
  const [banco,     setBanco]     = useState('');
  const [caja,      setCaja]      = useState('');
  const [inventario,setInventario]= useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg,       setMsg]       = useState('');

  useEffect(() => {
    supabase.from('config_contabilidad').select('valor').eq('clave','asiento_inicial').single()
      .then(({ data }) => setConfig(data?.valor || {}));
  }, []);

  const yaCompletado = config?.completado === true;

  async function guardarAsientoInicial() {
    const b = parseFloat(banco)     || 0;
    const c = parseFloat(caja)      || 0;
    const i = parseFloat(inventario)|| 0;
    const patrimonio = b + c + i;
    if (patrimonio <= 0) return setMsg('Ingresa al menos un saldo mayor a 0');

    setGuardando(true);
    const cuentas = await getCuentasModulos();

    const fecha = new Date().toISOString().split('T')[0];
    const { data: asiento, error } = await supabase.from('libro_diario').insert({
      fecha, descripcion: 'Asiento Inicial — Saldos de apertura',
      tipo: 'interno', origen: 'asiento_inicial', origen_id: null,
      estado: 'confirmado', confirmado_por: currentUser?.email,
      confirmado_at: new Date().toISOString(), created_by: currentUser?.email,
    }).select().single();

    if (error) { setMsg('Error: ' + error.message); setGuardando(false); return; }

    const lineas = [];
    if (b > 0) lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.banco_id,       descripcion:'Saldo inicial Banco',     debe:b, haber:0, orden:0 });
    if (c > 0) lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.caja_general_id, descripcion:'Saldo inicial Caja',      debe:c, haber:0, orden:1 });
    if (i > 0) lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.inventario_mp_id,descripcion:'Saldo inicial Inventario',debe:i, haber:0, orden:2 });
    lineas.push({ asiento_id:asiento.id, cuenta_id:cuentas.capital_id, descripcion:'Patrimonio inicial', debe:0, haber:patrimonio, orden:3 });

    await supabase.from('libro_diario_detalle').insert(lineas);

    await supabase.from('config_contabilidad').update({
      valor: { completado:true, fecha, banco:b, caja:c, inventario:i, patrimonio }
    }).eq('clave','asiento_inicial');

    invalidarCacheContable();
    setMsg(`✓ Asiento inicial creado — Patrimonio: $${patrimonio.toFixed(2)}`);
    setConfig({ completado:true });
    setGuardando(false);
    onDone();
  }

  if (yaCompletado) return (
    <div style={{ background:'#111827', borderRadius:10, padding:24, maxWidth:500 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
      <div style={{ color:'#4ade80', fontSize:16, fontWeight:'bold', marginBottom:8 }}>
        Asiento inicial completado
      </div>
      <div style={{ color:'#6b7280', fontSize:12, lineHeight:1.7 }}>
        Banco: ${config.banco?.toFixed(2)} | Caja: ${config.caja?.toFixed(2)} | Inventario: ${config.inventario?.toFixed(2)}<br/>
        Patrimonio total: ${config.patrimonio?.toFixed(2)}<br/>
        Fecha: {config.fecha}
      </div>
    </div>
  );

  return (
    <div style={{ background:'#111827', borderRadius:10, padding:24, maxWidth:500 }}>
      <div style={{ color:'white', fontSize:16, fontWeight:'bold', marginBottom:4 }}>
        ⚙️ Asiento Inicial
      </div>
      <div style={{ color:'#6b7280', fontSize:12, marginBottom:20 }}>
        Ingresa los saldos actuales para crear el asiento de apertura contable. Solo se hace una vez.
      </div>

      {[['🏦 Banco', banco, setBanco], ['💵 Caja General', caja, setCaja], ['📦 Inventario MP', inventario, setInventario]].map(([lbl, val, set]) => (
        <div key={lbl} style={{ marginBottom:14 }}>
          <label style={{ color:'#9ca3af', fontSize:11, display:'block', marginBottom:4 }}>{lbl}</label>
          <input type="number" min="0" step="0.01" value={val}
            onChange={e => set(e.target.value)} placeholder="0.00"
            style={{ background:'#1e293b', border:'1.5px solid #334155', color:'white',
                     borderRadius:8, padding:'9px 12px', width:'100%', boxSizing:'border-box', fontSize:13 }} />
        </div>
      ))}

      <div style={{ background:'#1e293b', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
        <div style={{ color:'#6b7280', fontSize:11, marginBottom:4 }}>Patrimonio (calculado automático):</div>
        <div style={{ color:'#4ade80', fontSize:18, fontWeight:'bold' }}>
          ${((parseFloat(banco)||0)+(parseFloat(caja)||0)+(parseFloat(inventario)||0)).toFixed(2)}
        </div>
      </div>

      {msg && <div style={{ color: msg.startsWith('✓') ? '#4ade80' : '#f87171', fontSize:12, marginBottom:12 }}>{msg}</div>}

      <button onClick={guardarAsientoInicial} disabled={guardando} style={{
        background: guardando ? '#374151' : '#065f46', color:'#6ee7b7',
        border:'none', borderRadius:8, padding:'11px 24px',
        cursor: guardando ? 'default' : 'pointer', fontSize:13, fontWeight:'bold', width:'100%'
      }}>{guardando ? '⏳ Creando asiento...' : '✓ Crear Asiento Inicial'}</button>
    </div>
  );
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/components/libroDiario/TabAsientoInicial.js
git commit -m "feat: TabAsientoInicial — wizard saldos de apertura con partida doble"
```

---

## Task 7: Routing — MenuContabilidad + App.js

**Files:**
- Modify: `src/components/MenuContabilidad.js`
- Modify: `src/App.js`

- [ ] **Step 7.1: Agregar Libro Diario al array SUBMODULOS en MenuContabilidad.js**

En `src/components/MenuContabilidad.js`, dentro del array `SUBMODULOS`, agregar como primer elemento:

```javascript
{
  emoji: '📒', titulo: 'Libro Diario',
  desc: 'Cerebro contable — asientos, cuentas, saldos',
  color: '#1e3a5f', border: 'rgba(30,58,95,0.6)',
  destino: 'libroDiario',
},
```

- [ ] **Step 7.2: Importar y agregar ruta en App.js**

En `src/App.js`, agregar el import junto a los otros imports de módulos:

```javascript
import LibroDiario from './LibroDiario';
```

Y agregar la ruta después de `pantalla === 'contabilidad'`:

```javascript
if (pantalla === 'libroDiario')
  return <LibroDiario
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
    currentUser={user}
  />;
```

- [ ] **Step 7.3: Verificar compilación**

```bash
npx react-scripts build 2>&1 | tail -5
```

Esperado: `Compiled successfully.`

- [ ] **Step 7.4: Commit**

```bash
git add src/components/MenuContabilidad.js src/App.js
git commit -m "feat: ruta libroDiario en App.js y botón en MenuContabilidad"
```

---

## Task 8: Integración — Facturación (TabNuevaVenta.js)

**Files:**
- Modify: `src/components/facturacion/TabNuevaVenta.js`

- [ ] **Step 8.1: Agregar import al inicio del archivo**

En `src/components/facturacion/TabNuevaVenta.js`, agregar después de los imports existentes:

```javascript
import { generarAsientoFactura } from '../../utils/asientosContables';
```

- [ ] **Step 8.2: Llamar generador en emitirFactura()**

Dentro de la función `emitirFactura()`, justo después de `setFacturaEmitida(...)` (línea ~199), agregar:

```javascript
// Generar asiento contable automático
const facturaParaAsiento = {
  ...factura,
  cliente_nombre: clienteObj.nombre,
  tipo: 'tributario',
};
generarAsientoFactura(facturaParaAsiento, currentUser).catch(console.error);
```

- [ ] **Step 8.3: Llamar generador en guardarBorrador()**

Dentro de la función `guardarBorrador()`, justo después de `setFacturaEmitida(...)` (línea ~271), agregar:

```javascript
// Generar asiento contable para borrador
const facturaParaAsiento = {
  ...factura,
  cliente_nombre: clienteObj.nombre,
  tipo: 'interno', // borradores van como internos
};
generarAsientoFactura(facturaParaAsiento, currentUser).catch(console.error);
```

- [ ] **Step 8.4: Commit**

```bash
git add src/components/facturacion/TabNuevaVenta.js
git commit -m "feat: asiento automático al emitir/guardar factura"
```

---

## Task 9: Integración — Compras (TabIngresoCompra.js)

**Files:**
- Modify: `src/components/compras/TabIngresoCompra.js`

- [ ] **Step 9.1: Agregar import**

En `src/components/compras/TabIngresoCompra.js`, agregar después de imports existentes:

```javascript
import { generarAsientoCompra } from '../../utils/asientosContables';
```

- [ ] **Step 9.2: Localizar la función guardar y agregar hook**

Busca la función donde se hace `supabase.from('compras').insert(...)` y retorna el registro guardado. Después de que la compra se inserta exitosamente, agregar:

```javascript
// Asiento contable — Regla 2: trazabilidad ATS
const { data: prov } = await supabase.from('proveedores')
  .select('nombre').eq('id', proveedorId).single();
generarAsientoCompra({
  id:               compraGuardada.id,
  fecha:            fecha,
  subtotal:         parseFloat(baseIva15 || 0) + parseFloat(baseIva0 || 0),
  iva_valor:        parseFloat(baseIva15 || 0) * 0.15,
  neto_pagar:       parseFloat(baseIva15 || 0) + parseFloat(baseIva0 || 0) + (parseFloat(baseIva15||0)*0.15),
  forma_pago:       formaPago,
  proveedor_nombre: prov?.nombre || '',
  num_factura:      numFactura,
}, currentUser).catch(console.error);
```

- [ ] **Step 9.3: Commit**

```bash
git add src/components/compras/TabIngresoCompra.js
git commit -m "feat: asiento automático al registrar compra de MP"
```

---

## Task 10: Integración — Nómina (TabNomina.js)

**Files:**
- Modify: `src/components/rrhh/TabNomina.js`

- [ ] **Step 10.1: Agregar import**

```javascript
import { generarAsientoNomina } from '../../utils/asientosContables';
```

- [ ] **Step 10.2: Hook al confirmar nómina**

Busca la función donde se genera/confirma el rol de pago (donde se inserta en tabla `nomina`). Después del insert exitoso, agregar:

```javascript
// Calcular totales para el asiento
const totalSueldosNetos = (nominas || []).reduce((s, n) => {
  return s + parseFloat(n.sueldo_prop || 0) + parseFloat(n.total_extras || 0)
           - parseFloat(n.total_atrasos || 0) - parseFloat(n.iess_empleado || 0)
           - parseFloat(n.anticipo || 0) - parseFloat(n.compras_empresa || 0);
}, 0);
const iessPatronalTotal = (nominas || []).reduce((s, n) => {
  return s + parseFloat(n.sueldo_prop || 0) * 0.1215; // 12.15% patronal Ecuador
}, 0);

generarAsientoNomina(
  nominaId,                               // ID del período de nómina
  Math.max(0, totalSueldosNetos),
  iessPatronalTotal,
  `${MESES[mesActual - 1]} ${anioActual}`,
  currentUser
).catch(console.error);
```

- [ ] **Step 10.3: Commit**

```bash
git add src/components/rrhh/TabNomina.js
git commit -m "feat: asiento automático al generar rol de nómina"
```

---

## Task 11: Integración — Caja Chica (TabCajaChica.js)

**Files:**
- Modify: `src/components/facturacion/TabCajaChica.js`

- [ ] **Step 11.1: Agregar import**

```javascript
import { generarAsientoCierre } from '../../utils/asientosContables';
```

- [ ] **Step 11.2: Hook al guardar cierre de caja**

Busca la función que guarda el cierre diario (donde se hace `supabase.from('caja_chica').update(...)` o `.insert(...)` con el `caja_cierre`). Después del guardado exitoso, agregar:

```javascript
// Asiento de cierre — Regla 3: usa caja_chica_id del mapeo dinámico
const totalGastosDia = gastos.reduce((s, g) => s + (parseFloat(g.valor) || 0), 0);
if (totalGastosDia > 0) {
  generarAsientoCierre(
    cajaId,          // ID del registro caja_chica del día
    fecha,
    totalGastosDia,
    currentUser
  ).catch(console.error);
}
```

- [ ] **Step 11.3: Commit**

```bash
git add src/components/facturacion/TabCajaChica.js
git commit -m "feat: asiento automático al cerrar caja chica diaria"
```

---

## Task 12: Prueba end-to-end + commit final

- [ ] **Step 12.1: Prueba manual — Libro Diario visible**

1. `npm start` → abre `localhost:3000`
2. Login → Menú Principal → Contabilidad → Libro Diario
3. Verifica: KPIs muestran $0.00 (sin movimientos aún)
4. Tab "⚙️ Asiento Inicial" → ingresa Banco: 5000, Caja: 500, Inventario: 3000 → "Crear Asiento Inicial"
5. Tab "📊 Resumen" → debe aparecer el asiento inicial como Confirmado con 4 líneas

- [ ] **Step 12.2: Prueba manual — Asiento desde Facturación**

1. Contabilidad → Facturación → Nueva Venta → selecciona producto, cantidad, emite
2. Vuelve → Libro Diario → "🔄 Sincronizar" (si no apareció automático)
3. Verifica: asiento de Facturación aparece como Provisional con líneas CxC DEBE / Ventas HABER / IVA HABER

- [ ] **Step 12.3: Prueba manual — Confirmar asiento**

1. En la tabla de asientos, selecciona el asiento provisional
2. Click "✓ Confirmar 1 provisional"
3. Verifica: estado cambia a Confirmado (verde)

- [ ] **Step 12.4: Prueba manual — Plan de Cuentas**

1. Tab "📈 Plan de Cuentas" → verifica árbol con 5 grupos (ACTIVO/PASIVO/PATRIMONIO/INGRESOS/GASTOS)
2. Click en ACTIVO → se expande y muestra subcuentas

- [ ] **Step 12.5: Build de producción**

```bash
npx react-scripts build 2>&1 | tail -5
```

Esperado: `Compiled successfully.`

- [ ] **Step 12.6: Commit final**

```bash
git add -A
git commit -m "feat: Libro Diario Contable completo — KPIs, asientos automáticos, Plan de Cuentas"
```
