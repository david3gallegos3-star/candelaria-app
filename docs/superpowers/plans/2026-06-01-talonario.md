# Talonario — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo Talonario dentro de Contabilidad que consolida todos los movimientos financieros mensuales en pestañas agrupadas, con columnas MES (devengo) y CONSOLIDADO (caja) en el Resumen, más importación/exportación Excel.

**Architecture:** Context + componentes por sección. `TalonarioContext` comparte mes/año/permisos. Cada sección es un componente independiente bajo `src/components/contabilidad/talonario/`. La entrada principal es `src/Talonario.js`. Las secciones de solo lectura leen tablas existentes; las secciones manuales usan 4 tablas nuevas.

**Tech Stack:** React (hooks + inline styles), Supabase (PostgREST), `xlsx` (ya instalado ^0.18.5), Claude API (para import IA)

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| Supabase SQL editor | Crear | 4 tablas nuevas |
| `src/Talonario.js` | Crear | Punto de entrada del módulo |
| `src/components/MenuContabilidad.js` | Modificar | Agregar card Talonario |
| `src/App.js` | Modificar | Import + case 'talonario' |
| `src/components/contabilidad/talonario/TalonarioContext.js` | Crear | Estado compartido mes/año/rol |
| `src/components/contabilidad/talonario/TabTalonario.js` | Crear | Navegación + header + submenús |
| `src/components/contabilidad/talonario/ingresos/CobrosEfectivo.js` | Crear | Lee cobros forma_pago='efectivo' |
| `src/components/contabilidad/talonario/ingresos/CobrosTransferencia.js` | Crear | Lee cobros transf/depósito |
| `src/components/contabilidad/talonario/ingresos/CobrosCheques.js` | Crear | Lee cobros cheque |
| `src/components/contabilidad/talonario/ingresos/OtrosIngresos.js` | Crear | CRUD talonario_otros_ingresos |
| `src/components/contabilidad/talonario/egresos/GastosEfectivo.js` | Crear | Lee caja_gastos (solo lectura) |
| `src/components/contabilidad/talonario/egresos/PagosDelMes.js` | Crear | CRUD talonario_pagos_banco |
| `src/components/contabilidad/talonario/egresos/PagosPersonales.js` | Crear | CRUD talonario_pagos_personales (3 cat) |
| `src/components/contabilidad/talonario/compras/ComprasTalonario.js` | Crear | Lee compras (solo lectura) |
| `src/components/contabilidad/talonario/compras/FacturasPersonales.js` | Crear | CRUD talonario_facturas_personales |
| `src/components/contabilidad/talonario/ResumenTalonario.js` | Crear | Auto-calculado MES + CONSOLIDADO |
| `src/components/contabilidad/talonario/shared/ExcelExport.js` | Crear | Descarga .xlsx idéntico al original |
| `src/components/contabilidad/talonario/shared/ExcelImport.js` | Crear | Subida .xlsx con IA + vista previa |

---

## Task 1: Base de datos — tablas nuevas

**Files:**
- Ejecutar en: Supabase Dashboard → SQL Editor

- [ ] **Step 1: Crear las 4 tablas**

Abrir Supabase → SQL Editor → New query, pegar y ejecutar:

```sql
-- Facturas personales
CREATE TABLE IF NOT EXISTS talonario_facturas_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  proveedor text,
  descripcion text,
  monto numeric(12,2) NOT NULL DEFAULT 0,
  tiene_factura boolean DEFAULT true,
  forma_pago text DEFAULT '20',
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Pagos del mes (banco)
CREATE TABLE IF NOT EXISTS talonario_pagos_banco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  beneficiario text,
  concepto text,
  monto numeric(12,2) NOT NULL DEFAULT 0,
  forma_pago text DEFAULT '20',
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Pagos personales
CREATE TABLE IF NOT EXISTS talonario_pagos_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  beneficiario text,
  concepto text,
  monto numeric(12,2) NOT NULL DEFAULT 0,
  categoria text NOT NULL DEFAULT 'otros',
  forma_pago text DEFAULT '20',
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Otros ingresos
CREATE TABLE IF NOT EXISTS talonario_otros_ingresos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes integer NOT NULL,
  año integer NOT NULL,
  fecha date,
  descripcion text,
  monto numeric(12,2) NOT NULL DEFAULT 0,
  forma_pago text DEFAULT '01',
  comentario text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- RLS: habilitar y permitir a usuarios autenticados
ALTER TABLE talonario_facturas_personales ENABLE ROW LEVEL SECURITY;
ALTER TABLE talonario_pagos_banco         ENABLE ROW LEVEL SECURITY;
ALTER TABLE talonario_pagos_personales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE talonario_otros_ingresos      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON talonario_facturas_personales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON talonario_pagos_banco         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON talonario_pagos_personales    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON talonario_otros_ingresos      FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Verificar tablas creadas**

En Supabase → Table Editor confirmar que aparecen las 4 tablas.

---

## Task 2: TalonarioContext

**Files:**
- Create: `src/components/contabilidad/talonario/TalonarioContext.js`

- [ ] **Step 1: Crear el directorio y el contexto**

```javascript
// src/components/contabilidad/talonario/TalonarioContext.js
import React, { createContext, useContext, useState } from 'react';

const TalonarioContext = createContext(null);

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function TalonarioProvider({ userRol, children }) {
  const hoy = new Date();
  const [mes, setMes]   = useState(hoy.getMonth() + 1);  // 1-12
  const [año, setAño]   = useState(hoy.getFullYear());

  const esAdminContador = userRol?.rol === 'admin' || userRol?.rol === 'contador';

  // Rango de fechas del mes seleccionado (para filtrar tablas con columna fecha)
  const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
  const ultimoDia  = new Date(año, mes, 0).getDate();
  const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

  return (
    <TalonarioContext.Provider value={{
      mes, setMes,
      año, setAño,
      esAdminContador,
      fechaDesde,
      fechaHasta,
      MESES,
    }}>
      {children}
    </TalonarioContext.Provider>
  );
}

export function useTalonario() {
  return useContext(TalonarioContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/TalonarioContext.js
git commit -m "feat(talonario): TalonarioContext con mes/año/permisos"
```

---

## Task 3: Entrada principal + registro en app

**Files:**
- Create: `src/Talonario.js`
- Modify: `src/components/MenuContabilidad.js`
- Modify: `src/App.js`

- [ ] **Step 1: Crear src/Talonario.js**

```javascript
// src/Talonario.js
import React from 'react';
import { TalonarioProvider } from './components/contabilidad/talonario/TalonarioContext';
import TabTalonario from './components/contabilidad/talonario/TabTalonario';

export default function Talonario({ onVolver, onVolverMenu, userRol }) {
  return (
    <TalonarioProvider userRol={userRol}>
      <TabTalonario onVolver={onVolver} onVolverMenu={onVolverMenu} />
    </TalonarioProvider>
  );
}
```

- [ ] **Step 2: Agregar card en MenuContabilidad.js**

En `src/components/MenuContabilidad.js`, en el array `SUBMODULOS` (línea ~4), agregar después del último elemento:

```javascript
  {
    emoji: '📒', titulo: 'Talonario',
    desc: 'Resumen mensual de ingresos y egresos',
    color: '#1a5276', border: 'rgba(26,82,118,0.4)',
    destino: 'talonario',
  },
```

- [ ] **Step 3: Registrar en App.js**

En `src/App.js`, agregar el import junto a los otros imports de módulos (cerca de línea 33):

```javascript
import Talonario from './Talonario';
```

Y agregar el case de pantalla después del bloque de `rrhh` (cerca de línea 1115):

```javascript
if (pantalla === 'talonario')
  return <Talonario
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
  />;
```

- [ ] **Step 4: Commit**

```bash
git add src/Talonario.js src/components/MenuContabilidad.js src/App.js
git commit -m "feat(talonario): registrar módulo en app y menú contabilidad"
```

---

## Task 4: TabTalonario — navegación y shell

**Files:**
- Create: `src/components/contabilidad/talonario/TabTalonario.js`

- [ ] **Step 1: Crear el shell de navegación**

```javascript
// src/components/contabilidad/talonario/TabTalonario.js
import React, { useState } from 'react';
import { useTalonario } from './TalonarioContext';
import ResumenTalonario      from './ResumenTalonario';
import CobrosEfectivo        from './ingresos/CobrosEfectivo';
import CobrosTransferencia   from './ingresos/CobrosTransferencia';
import CobrosCheques         from './ingresos/CobrosCheques';
import OtrosIngresos         from './ingresos/OtrosIngresos';
import GastosEfectivo        from './egresos/GastosEfectivo';
import PagosDelMes           from './egresos/PagosDelMes';
import PagosPersonales       from './egresos/PagosPersonales';
import ComprasTalonario      from './compras/ComprasTalonario';
import FacturasPersonales    from './compras/FacturasPersonales';
import ExcelExport           from './shared/ExcelExport';
import ExcelImport           from './shared/ExcelImport';

const GRUPOS = [
  { id: 'resumen',  label: '📊 RESUMEN',   subs: null },
  { id: 'ingresos', label: '💵 INGRESOS',   subs: [
    { id: 'cobros_efectivo',       label: 'Cobros Efectivo' },
    { id: 'cobros_transferencia',  label: 'Cobros Transf./Depósito' },
    { id: 'cobros_cheques',        label: 'Cobros Cheques' },
    { id: 'otros_ingresos',        label: 'Otros Ingresos' },
  ]},
  { id: 'egresos',  label: '💸 EGRESOS',   subs: [
    { id: 'gastos_efectivo', label: 'Gastos Efectivo' },
    { id: 'pagos_mes',       label: 'Pagos del Mes' },
    { id: 'pagos_personales',label: 'Pagos Personales' },
  ]},
  { id: 'compras',  label: '🛒 COMPRAS',   subs: [
    { id: 'compras_tab',        label: 'Compras' },
    { id: 'facturas_personales',label: 'Facturas Personales' },
  ]},
];

export default function TabTalonario({ onVolver, onVolverMenu }) {
  const { mes, setMes, año, setAño, MESES, esAdminContador } = useTalonario();
  const [seccion,         setSeccion]         = useState('resumen');
  const [grupoAbierto,    setGrupoAbierto]    = useState(null);
  const [showImport,      setShowImport]      = useState(false);

  function seleccionar(id) {
    setSeccion(id);
    setGrupoAbierto(null);
  }

  function toggleGrupo(id) {
    setGrupoAbierto(prev => prev === id ? null : id);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '"Segoe UI",system-ui,sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1a2a4a', color: 'white', padding: '10px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onVolver} style={{ background: 'none', border: 'none',
          color: 'white', cursor: 'pointer', fontSize: 18 }}>←</button>
        <span style={{ fontWeight: 'bold', fontSize: 15 }}>📒 TALONARIO</span>

        {/* Selector mes/año */}
        <select value={mes} onChange={e => setMes(Number(e.target.value))}
          style={{ padding: '4px 8px', borderRadius: 6, border: 'none', fontSize: 13 }}>
          {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={año} onChange={e => setAño(Number(e.target.value))}
          style={{ padding: '4px 8px', borderRadius: 6, border: 'none', fontSize: 13 }}>
          {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExcelExport />
          {esAdminContador && (
            <button onClick={() => setShowImport(true)}
              style={{ background: '#2980b9', color: 'white', border: 'none',
                borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>
              📤 Subir Excel
            </button>
          )}
        </div>
      </div>

      {/* Pestañas grupos */}
      <div style={{ display: 'flex', background: 'white', borderBottom: '2px solid #1a2a4a',
                    fontSize: 12, position: 'relative' }}>
        {GRUPOS.map(g => (
          <div key={g.id} style={{ position: 'relative' }}>
            <button
              onClick={() => g.subs ? toggleGrupo(g.id) : seleccionar(g.id)}
              style={{
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 12,
                background: seccion === g.id || (g.subs && g.subs.some(s => s.id === seccion))
                  ? '#1a2a4a' : 'transparent',
                color: seccion === g.id || (g.subs && g.subs.some(s => s.id === seccion))
                  ? 'white' : '#333',
              }}>
              {g.label}{g.subs ? ' ▾' : ''}
            </button>
            {/* Submenú desplegable */}
            {g.subs && grupoAbierto === g.id && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 100,
                background: 'white', border: '1px solid #ddd', borderRadius: '0 0 8px 8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 200,
              }}>
                {g.subs.map(s => (
                  <button key={s.id} onClick={() => seleccionar(s.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 16px', border: 'none', cursor: 'pointer',
                      background: seccion === s.id ? '#eaf4ff' : 'transparent',
                      color: seccion === s.id ? '#1a2a4a' : '#333',
                      fontWeight: seccion === s.id ? 'bold' : 'normal',
                      fontSize: 12,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ padding: 16 }}>
        {seccion === 'resumen'              && <ResumenTalonario />}
        {seccion === 'cobros_efectivo'      && <CobrosEfectivo />}
        {seccion === 'cobros_transferencia' && <CobrosTransferencia />}
        {seccion === 'cobros_cheques'       && <CobrosCheques />}
        {seccion === 'otros_ingresos'       && <OtrosIngresos />}
        {seccion === 'gastos_efectivo'      && <GastosEfectivo />}
        {seccion === 'pagos_mes'            && <PagosDelMes />}
        {seccion === 'pagos_personales'     && <PagosPersonales />}
        {seccion === 'compras_tab'          && <ComprasTalonario />}
        {seccion === 'facturas_personales'  && <FacturasPersonales />}
      </div>

      {showImport && <ExcelImport onClose={() => setShowImport(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Crear directorios necesarios**

```bash
mkdir -p src/components/contabilidad/talonario/ingresos
mkdir -p src/components/contabilidad/talonario/egresos
mkdir -p src/components/contabilidad/talonario/compras
mkdir -p src/components/contabilidad/talonario/shared
```

- [ ] **Step 3: Commit**

```bash
git add src/components/contabilidad/talonario/TabTalonario.js
git commit -m "feat(talonario): shell de navegación con pestañas agrupadas"
```

---

## Task 5: Secciones de cobros (solo lectura)

Estas tres secciones leen la tabla `cobros` filtrando por `forma_pago` y `fecha` en el rango del mes. Son idénticas en estructura, solo cambia el filtro.

**Files:**
- Create: `src/components/contabilidad/talonario/ingresos/CobrosEfectivo.js`
- Create: `src/components/contabilidad/talonario/ingresos/CobrosTransferencia.js`
- Create: `src/components/contabilidad/talonario/ingresos/CobrosCheques.js`

- [ ] **Step 1: Crear CobrosEfectivo.js**

```javascript
// src/components/contabilidad/talonario/ingresos/CobrosEfectivo.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function CobrosEfectivo() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('cobros')
        .select('id, fecha, monto, forma_pago, observaciones, clientes(nombre)')
        .eq('forma_pago', 'efectivo')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',      label: 'Fecha' },
    { key: 'cliente',    label: 'Cliente',  render: f => f.clientes?.nombre || '—' },
    { key: 'monto',      label: 'Monto',    render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago', label: 'Forma Pago', render: () => 'Efectivo (01)' },
    { key: 'obs',        label: 'Comentario', render: f => f.observaciones || '' },
  ];

  return (
    <TablaLectura
      titulo="💵 Cobros Efectivo"
      filas={filas}
      columnas={columnas}
      cargando={cargando}
      campoMonto="monto"
    />
  );
}
```

- [ ] **Step 2: Crear CobrosTransferencia.js**

```javascript
// src/components/contabilidad/talonario/ingresos/CobrosTransferencia.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function CobrosTransferencia() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('cobros')
        .select('id, fecha, monto, forma_pago, observaciones, clientes(nombre)')
        .in('forma_pago', ['transferencia', 'deposito'])
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',      label: 'Fecha' },
    { key: 'cliente',    label: 'Cliente',  render: f => f.clientes?.nombre || '—' },
    { key: 'monto',      label: 'Monto',    render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago', label: 'Forma Pago', render: f => f.forma_pago === 'deposito' ? 'Depósito (20)' : 'Transferencia (20)' },
    { key: 'obs',        label: 'Comentario', render: f => f.observaciones || '' },
  ];

  return (
    <TablaLectura
      titulo="🏦 Cobros Transferencia / Depósito"
      filas={filas}
      columnas={columnas}
      cargando={cargando}
      campoMonto="monto"
    />
  );
}
```

- [ ] **Step 3: Crear CobrosCheques.js**

```javascript
// src/components/contabilidad/talonario/ingresos/CobrosCheques.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function CobrosCheques() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('cobros')
        .select('id, fecha, monto, forma_pago, observaciones, clientes(nombre)')
        .eq('forma_pago', 'cheque')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',      label: 'Fecha' },
    { key: 'cliente',    label: 'Cliente',  render: f => f.clientes?.nombre || '—' },
    { key: 'monto',      label: 'Monto',    render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago', label: 'Forma Pago', render: () => 'Cheque (20)' },
    { key: 'obs',        label: 'Comentario', render: f => f.observaciones || '' },
  ];

  return (
    <TablaLectura
      titulo="📝 Cobros Cheques"
      filas={filas}
      columnas={columnas}
      cargando={cargando}
      campoMonto="monto"
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/contabilidad/talonario/ingresos/
git commit -m "feat(talonario): secciones cobros efectivo/transferencia/cheques"
```

---

## Task 6: TablaLectura + TablaCrud — componentes compartidos

Antes de continuar con las secciones manuales, crear los dos componentes reutilizables.

**Files:**
- Create: `src/components/contabilidad/talonario/shared/TablaLectura.js`
- Create: `src/components/contabilidad/talonario/shared/TablaCrud.js`

- [ ] **Step 1: Crear TablaLectura.js**

```javascript
// src/components/contabilidad/talonario/shared/TablaLectura.js
import React from 'react';

const SRI_LABELS = { '01': 'Efectivo', '16': 'Débito', '19': 'Crédito', '20': 'Transf./Cheque/Depósito' };

export function SriLabel({ codigo }) {
  return <span>{SRI_LABELS[codigo] || codigo || '—'} {codigo ? `(${codigo})` : ''}</span>;
}

export function TablaLectura({ titulo, filas, columnas, cargando, campoMonto }) {
  const total = filas.reduce((s, f) => s + parseFloat(f[campoMonto] || 0), 0);

  return (
    <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: '#1a2a4a' }}>{titulo}</h3>
        <span style={{ color: '#27ae60', fontWeight: 'bold', fontSize: 14 }}>
          Total: ${total.toFixed(2)}
        </span>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Cargando...</div>
      ) : filas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
          Sin registros para este mes
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {columnas.map(c => (
                  <th key={c.key} style={{
                    padding: '8px 10px', textAlign: c.align || 'left',
                    borderBottom: '2px solid #e0e0e0', color: '#555', fontWeight: 'bold',
                  }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.id || i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  {columnas.map(c => (
                    <td key={c.key} style={{ padding: '7px 10px', textAlign: c.align || 'left' }}>
                      {c.render ? c.render(f) : (f[c.key] || '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear TablaCrud.js**

```javascript
// src/components/contabilidad/talonario/shared/TablaCrud.js
import React, { useState } from 'react';
import { SriLabel } from './TablaLectura';

const FORMAS_PAGO = [
  { value: '01', label: 'Efectivo (01)' },
  { value: '16', label: 'Débito (16)' },
  { value: '19', label: 'Crédito (19)' },
  { value: '20', label: 'Transf./Cheque/Depósito (20)' },
];

export { FORMAS_PAGO };

export function TablaCrud({
  titulo,
  filas,
  columnas,        // [{ key, label, align?, render? }]
  campoMonto,
  cargando,
  esAdminContador,
  onAgregar,       // () => void — abre el formulario vacío
  onEditar,        // (fila) => void
  onEliminar,      // (id) => void
}) {
  const total = filas.reduce((s, f) => s + parseFloat(f[campoMonto] || 0), 0);

  return (
    <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: '#1a2a4a' }}>{titulo}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: 14 }}>
            Total: ${total.toFixed(2)}
          </span>
          {esAdminContador && (
            <button onClick={onAgregar}
              style={{ background: '#27ae60', color: 'white', border: 'none',
                borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
              + Agregar
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Cargando...</div>
      ) : filas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
          Sin registros para este mes
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {columnas.map(c => (
                  <th key={c.key} style={{
                    padding: '8px 10px', textAlign: c.align || 'left',
                    borderBottom: '2px solid #e0e0e0', color: '#555', fontWeight: 'bold',
                  }}>{c.label}</th>
                ))}
                {esAdminContador && <th style={{ padding: '8px 10px', borderBottom: '2px solid #e0e0e0' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.id || i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  {columnas.map(c => (
                    <td key={c.key} style={{ padding: '7px 10px', textAlign: c.align || 'left' }}>
                      {c.render ? c.render(f) : (f[c.key] || '—')}
                    </td>
                  ))}
                  {esAdminContador && (
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => onEditar(f)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: '#2980b9', fontSize: 13, marginRight: 8 }}>✏️</button>
                      <button onClick={() => { if(window.confirm('¿Eliminar este registro?')) onEliminar(f.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: '#e74c3c', fontSize: 13 }}>🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/contabilidad/talonario/shared/TablaLectura.js
git add src/components/contabilidad/talonario/shared/TablaCrud.js
git commit -m "feat(talonario): componentes compartidos TablaLectura y TablaCrud"
```

---

## Task 7: Otros Ingresos (manual)

**Files:**
- Create: `src/components/contabilidad/talonario/ingresos/OtrosIngresos.js`

- [ ] **Step 1: Crear OtrosIngresos.js**

```javascript
// src/components/contabilidad/talonario/ingresos/OtrosIngresos.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';

const VACIO = { fecha: '', descripcion: '', monto: '', forma_pago: '01', comentario: '' };

export default function OtrosIngresos() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,    setFilas]    = useState([]);
  const [cargando, setCargando] = useState(false);
  const [form,     setForm]     = useState(null);  // null = cerrado, {} = nuevo, {id,...} = editando
  const [guardando,setGuardando]= useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from('talonario_otros_ingresos')
      .select('*').eq('mes', mes).eq('año', año).order('fecha');
    setFilas(data || []);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.descripcion || !form.monto) return alert('Descripción y monto son requeridos');
    setGuardando(true);
    const payload = { mes, año, fecha: form.fecha || null, descripcion: form.descripcion,
      monto: parseFloat(form.monto), forma_pago: form.forma_pago, comentario: form.comentario || null };
    if (form.id) {
      await supabase.from('talonario_otros_ingresos').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_otros_ingresos').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_otros_ingresos').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',       label: 'Fecha' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'monto',       label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',  label: 'Forma Pago', render: f => `${f.forma_pago === '01' ? 'Efectivo' : 'Transf./Depósito'} (${f.forma_pago})` },
    { key: 'comentario',  label: 'Comentario' },
  ];

  return (
    <>
      <TablaCrud
        titulo="➕ Otros Ingresos"
        filas={filas}
        columnas={columnas}
        campoMonto="monto"
        cargando={cargando}
        esAdminContador={esAdminContador}
        onAgregar={() => setForm({ ...VACIO })}
        onEditar={f => setForm({ ...f })}
        onEliminar={eliminar}
      />

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 380, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar ingreso' : 'Nuevo ingreso'}
            </h3>
            {[
              ['fecha',       'Fecha',       'date'],
              ['descripcion', 'Descripción', 'text'],
              ['monto',       'Monto ($)',   'number'],
              ['comentario',  'Comentario',  'text'],
            ].map(([key, lbl, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Forma de Pago</label>
              <select value={form.forma_pago || '01'} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd',
                  background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/ingresos/OtrosIngresos.js
git commit -m "feat(talonario): sección Otros Ingresos con CRUD"
```

---

## Task 8: Gastos Efectivo (solo lectura)

**Files:**
- Create: `src/components/contabilidad/talonario/egresos/GastosEfectivo.js`

- [ ] **Step 1: Crear GastosEfectivo.js**

```javascript
// src/components/contabilidad/talonario/egresos/GastosEfectivo.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function GastosEfectivo() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('caja_gastos')
        .select('id, fecha, concepto, monto, tipo')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',   label: 'Fecha' },
    { key: 'concepto',label: 'Concepto' },
    { key: 'tipo',    label: 'Tipo' },
    { key: 'monto',   label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'fp',      label: 'Forma Pago', render: () => 'Efectivo (01)' },
  ];

  return (
    <TablaLectura
      titulo="💸 Gastos Efectivo"
      filas={filas}
      columnas={columnas}
      cargando={cargando}
      campoMonto="monto"
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/GastosEfectivo.js
git commit -m "feat(talonario): sección Gastos Efectivo (solo lectura)"
```

---

## Task 9: Pagos del Mes (manual)

**Files:**
- Create: `src/components/contabilidad/talonario/egresos/PagosDelMes.js`

- [ ] **Step 1: Crear PagosDelMes.js**

```javascript
// src/components/contabilidad/talonario/egresos/PagosDelMes.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';

const VACIO = { fecha: '', beneficiario: '', concepto: '', monto: '', forma_pago: '20', comentario: '' };

export default function PagosDelMes() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,     setFilas]     = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [form,      setForm]      = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from('talonario_pagos_banco')
      .select('*').eq('mes', mes).eq('año', año).order('fecha');
    setFilas(data || []);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.concepto || !form.monto) return alert('Concepto y monto son requeridos');
    setGuardando(true);
    const payload = { mes, año, fecha: form.fecha || null, beneficiario: form.beneficiario || null,
      concepto: form.concepto, monto: parseFloat(form.monto),
      forma_pago: form.forma_pago, comentario: form.comentario || null };
    if (form.id) {
      await supabase.from('talonario_pagos_banco').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_pagos_banco').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_pagos_banco').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',        label: 'Fecha' },
    { key: 'beneficiario', label: 'Beneficiario' },
    { key: 'concepto',     label: 'Concepto' },
    { key: 'monto',        label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',   label: 'Forma Pago', render: f => {
      const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
      return fp ? fp.label : f.forma_pago;
    }},
    { key: 'comentario', label: 'Comentario' },
  ];

  return (
    <>
      <TablaCrud
        titulo="🏧 Pagos del Mes"
        filas={filas}
        columnas={columnas}
        campoMonto="monto"
        cargando={cargando}
        esAdminContador={esAdminContador}
        onAgregar={() => setForm({ ...VACIO })}
        onEditar={f => setForm({ ...f })}
        onEliminar={eliminar}
      />

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar pago' : 'Nuevo pago del mes'}
            </h3>
            {[
              ['fecha',        'Fecha',        'date'],
              ['beneficiario', 'Beneficiario', 'text'],
              ['concepto',     'Concepto',     'text'],
              ['monto',        'Monto ($)',     'number'],
              ['comentario',   'Comentario',   'text'],
            ].map(([key, lbl, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Forma de Pago</label>
              <select value={form.forma_pago || '20'} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#e74c3c', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/PagosDelMes.js
git commit -m "feat(talonario): sección Pagos del Mes con CRUD"
```

---

## Task 10: Pagos Personales (manual, 3 categorías)

**Files:**
- Create: `src/components/contabilidad/talonario/egresos/PagosPersonales.js`

- [ ] **Step 1: Crear PagosPersonales.js**

```javascript
// src/components/contabilidad/talonario/egresos/PagosPersonales.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';

const CATEGORIAS = [
  { value: 'prestamos',     label: '🏦 Préstamos' },
  { value: 'tarjetas',      label: '💳 Tarjetas' },
  { value: 'gastos_personal',label: '👤 Gastos Personales' },
  { value: 'otros',         label: '📋 Otros' },
];

const VACIO = { fecha: '', beneficiario: '', concepto: '', monto: '',
  categoria: 'prestamos', forma_pago: '20', comentario: '' };

export default function PagosPersonales() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,     setFilas]     = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [form,      setForm]      = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from('talonario_pagos_personales')
      .select('*').eq('mes', mes).eq('año', año).order('categoria').order('fecha');
    setFilas(data || []);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.concepto || !form.monto) return alert('Concepto y monto son requeridos');
    setGuardando(true);
    const payload = { mes, año, fecha: form.fecha || null, beneficiario: form.beneficiario || null,
      concepto: form.concepto, monto: parseFloat(form.monto), categoria: form.categoria,
      forma_pago: form.forma_pago, comentario: form.comentario || null };
    if (form.id) {
      await supabase.from('talonario_pagos_personales').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_pagos_personales').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_pagos_personales').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',        label: 'Fecha' },
    { key: 'categoria',    label: 'Categoría', render: f => CATEGORIAS.find(c => c.value === f.categoria)?.label || f.categoria },
    { key: 'beneficiario', label: 'Beneficiario' },
    { key: 'concepto',     label: 'Concepto' },
    { key: 'monto',        label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',   label: 'Forma Pago', render: f => {
      const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
      return fp ? fp.label : f.forma_pago;
    }},
    { key: 'comentario',   label: 'Comentario' },
  ];

  // Subtotales por categoría
  const totales = CATEGORIAS.map(cat => ({
    ...cat,
    total: filas.filter(f => f.categoria === cat.value).reduce((s, f) => s + parseFloat(f.monto || 0), 0),
  }));

  return (
    <>
      {/* Resumen por categoría */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {totales.map(cat => (
          <div key={cat.value} style={{ background: 'white', borderRadius: 8, padding: '10px 14px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minWidth: 140 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{cat.label}</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: '#e74c3c' }}>${cat.total.toFixed(2)}</div>
          </div>
        ))}
      </div>

      <TablaCrud
        titulo="👤 Pagos Personales"
        filas={filas}
        columnas={columnas}
        campoMonto="monto"
        cargando={cargando}
        esAdminContador={esAdminContador}
        onAgregar={() => setForm({ ...VACIO })}
        onEditar={f => setForm({ ...f })}
        onEliminar={eliminar}
      />

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar pago personal' : 'Nuevo pago personal'}
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Categoría</label>
              <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {[
              ['fecha',        'Fecha',        'date'],
              ['beneficiario', 'Beneficiario', 'text'],
              ['concepto',     'Concepto',     'text'],
              ['monto',        'Monto ($)',     'number'],
              ['comentario',   'Comentario',   'text'],
            ].map(([key, lbl, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Forma de Pago</label>
              <select value={form.forma_pago || '20'} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#e74c3c', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/egresos/PagosPersonales.js
git commit -m "feat(talonario): sección Pagos Personales con 3 categorías"
```

---

## Task 11: Compras (solo lectura)

**Files:**
- Create: `src/components/contabilidad/talonario/compras/ComprasTalonario.js`

- [ ] **Step 1: Crear ComprasTalonario.js**

```javascript
// src/components/contabilidad/talonario/compras/ComprasTalonario.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function ComprasTalonario() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('compras')
        .select('id, fecha, total, tiene_factura, forma_pago, proveedores(nombre)')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',         label: 'Fecha' },
    { key: 'proveedor',     label: 'Proveedor', render: f => f.proveedores?.nombre || '—' },
    { key: 'tiene_factura', label: 'Tipo', render: f => f.tiene_factura ? 'Con factura' : 'Sin factura' },
    { key: 'total',         label: 'Total', render: f => `$${parseFloat(f.total||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',    label: 'Forma Pago', render: f => {
      const map = { efectivo: 'Efectivo (01)', transferencia: 'Transf. (20)',
                    cheque: 'Cheque (20)', debito: 'Débito (16)', credito: 'Crédito (19)' };
      return map[f.forma_pago] || f.forma_pago || '—';
    }},
  ];

  const totalCon    = filas.filter(f =>  f.tiene_factura).reduce((s, f) => s + parseFloat(f.total||0), 0);
  const totalSin    = filas.filter(f => !f.tiene_factura).reduce((s, f) => s + parseFloat(f.total||0), 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[['Con factura', totalCon], ['Sin factura', totalSin]].map(([lbl, val]) => (
          <div key={lbl} style={{ background: 'white', borderRadius: 8, padding: '10px 16px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: '#1a5276' }}>${val.toFixed(2)}</div>
          </div>
        ))}
      </div>
      <TablaLectura
        titulo="🛒 Compras del Mes"
        filas={filas}
        columnas={columnas}
        cargando={cargando}
        campoMonto="total"
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/compras/ComprasTalonario.js
git commit -m "feat(talonario): sección Compras (solo lectura)"
```

---

## Task 12: Facturas Personales (manual)

**Files:**
- Create: `src/components/contabilidad/talonario/compras/FacturasPersonales.js`

- [ ] **Step 1: Crear FacturasPersonales.js**

```javascript
// src/components/contabilidad/talonario/compras/FacturasPersonales.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';

const VACIO = { fecha: '', proveedor: '', descripcion: '', monto: '',
  tiene_factura: true, forma_pago: '20', comentario: '' };

export default function FacturasPersonales() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,     setFilas]     = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [form,      setForm]      = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from('talonario_facturas_personales')
      .select('*').eq('mes', mes).eq('año', año).order('fecha');
    setFilas(data || []);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.descripcion || !form.monto) return alert('Descripción y monto son requeridos');
    setGuardando(true);
    const payload = { mes, año, fecha: form.fecha || null, proveedor: form.proveedor || null,
      descripcion: form.descripcion, monto: parseFloat(form.monto),
      tiene_factura: form.tiene_factura !== false,
      forma_pago: form.forma_pago, comentario: form.comentario || null };
    if (form.id) {
      await supabase.from('talonario_facturas_personales').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_facturas_personales').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_facturas_personales').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',         label: 'Fecha' },
    { key: 'proveedor',     label: 'Proveedor' },
    { key: 'descripcion',   label: 'Descripción' },
    { key: 'tiene_factura', label: 'Factura', render: f => f.tiene_factura ? '✅' : '❌' },
    { key: 'monto',         label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',    label: 'Forma Pago', render: f => {
      const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
      return fp ? fp.label : f.forma_pago;
    }},
    { key: 'comentario', label: 'Comentario' },
  ];

  return (
    <>
      <TablaCrud
        titulo="📄 Facturas Personales"
        filas={filas}
        columnas={columnas}
        campoMonto="monto"
        cargando={cargando}
        esAdminContador={esAdminContador}
        onAgregar={() => setForm({ ...VACIO })}
        onEditar={f => setForm({ ...f })}
        onEliminar={eliminar}
      />

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar factura personal' : 'Nueva factura personal'}
            </h3>
            {[
              ['fecha',       'Fecha',       'date'],
              ['proveedor',   'Proveedor',   'text'],
              ['descripcion', 'Descripción', 'text'],
              ['monto',       'Monto ($)',   'number'],
              ['comentario',  'Comentario',  'text'],
            ].map(([key, lbl, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="tieneFact" checked={form.tiene_factura !== false}
                onChange={e => setForm(p => ({ ...p, tiene_factura: e.target.checked }))} />
              <label htmlFor="tieneFact" style={{ fontSize: 13 }}>Tiene factura</label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Forma de Pago</label>
              <select value={form.forma_pago || '20'} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#8e44ad', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/compras/FacturasPersonales.js
git commit -m "feat(talonario): sección Facturas Personales con CRUD"
```

---

## Task 13: ResumenTalonario

**Files:**
- Create: `src/components/contabilidad/talonario/ResumenTalonario.js`

- [ ] **Step 1: Crear ResumenTalonario.js**

```javascript
// src/components/contabilidad/talonario/ResumenTalonario.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabase';
import { useTalonario } from './TalonarioContext';

function suma(arr, campo) {
  return arr.reduce((s, r) => s + parseFloat(r[campo] || 0), 0);
}

export default function ResumenTalonario() {
  const { mes, año, fechaDesde, fechaHasta, MESES, esAdminContador } = useTalonario();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [saldoBanco, setSaldoBanco] = useState('');
  const [editandoSaldo, setEditandoSaldo] = useState(false);

  useEffect(() => { cargar(); }, [mes, año]);

  async function cargar() {
    setCargando(true);
    const [
      { data: facturas },
      { data: cobros },
      { data: gastos },
      { data: compras },
      { data: nomina },
      { data: pagosB },
      { data: pagosP },
      { data: otrosI },
      { data: cxc },
      { data: config },
    ] = await Promise.all([
      supabase.from('facturas').select('total').gte('fecha_emision', fechaDesde).lte('fecha_emision', fechaHasta).neq('estado', 'anulada'),
      supabase.from('cobros').select('monto,forma_pago').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('caja_gastos').select('monto').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('compras').select('total,tiene_factura').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('nomina').select('sueldo_prop,iess_patronal').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_banco').select('monto').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_personales').select('monto,categoria').eq('mes', mes).eq('año', año),
      supabase.from('talonario_otros_ingresos').select('monto').eq('mes', mes).eq('año', año),
      supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').eq('estado', 'pendiente'),
      supabase.from('config_contabilidad').select('valor').eq('clave', `saldo_banco_${año}_${mes}`).single(),
    ]);

    const totalVentas    = suma(facturas || [], 'total');
    const totalOtrosI    = suma(otrosI   || [], 'monto');
    const totalGastos    = suma(gastos   || [], 'monto');
    const comprasCon     = (compras || []).filter(c =>  c.tiene_factura).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const comprasSin     = (compras || []).filter(c => !c.tiene_factura).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const totalSueldos   = suma(nomina   || [], 'sueldo_prop');
    const totalIess      = suma(nomina   || [], 'iess_patronal');
    const totalPagosB    = suma(pagosB   || [], 'monto');
    const totalPagosP    = suma(pagosP   || [], 'monto');
    const pagosPrestTarj = (pagosP || []).filter(p => ['prestamos','tarjetas'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const pagosGastPers  = (pagosP || []).filter(p => ['gastos_personal','otros'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);

    const cobroEfect = (cobros||[]).filter(c => c.forma_pago==='efectivo').reduce((s,c) => s+parseFloat(c.monto||0), 0);
    const cobroCheq  = (cobros||[]).filter(c => c.forma_pago==='cheque').reduce((s,c) => s+parseFloat(c.monto||0), 0);
    const cobroTransf= (cobros||[]).filter(c => ['transferencia','deposito'].includes(c.forma_pago)).reduce((s,c) => s+parseFloat(c.monto||0), 0);

    const cxcPendiente = (cxc||[]).reduce((s,c) => s + parseFloat(c.monto_total||0) - parseFloat(c.monto_cobrado||0), 0);

    setSaldoBanco(config?.valor?.saldo || '');
    setDatos({ totalVentas, totalOtrosI, totalGastos, comprasCon, comprasSin,
      totalSueldos, totalIess, totalPagosB, totalPagosP,
      cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers, cxcPendiente });
    setCargando(false);
  }

  async function guardarSaldo(val) {
    await supabase.from('config_contabilidad')
      .upsert({ clave: `saldo_banco_${año}_${mes}`, valor: { saldo: val } }, { onConflict: 'clave' });
    setEditandoSaldo(false);
  }

  if (cargando || !datos) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando resumen...</div>;

  const {
    totalVentas, totalOtrosI, totalGastos, comprasCon, comprasSin,
    totalSueldos, totalIess, totalPagosB, totalPagosP,
    cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers, cxcPendiente,
  } = datos;

  // MES
  const totalIngMes  = totalVentas + totalOtrosI;
  const totalEgrMes  = totalGastos + comprasCon + comprasSin + totalSueldos + totalIess + totalPagosB + totalPagosP;
  const utilidadBruta= totalIngMes - totalEgrMes;

  // CONSOLIDADO
  const totalIngCons = cobroEfect + cobroCheq + cobroTransf + totalOtrosI;
  const totalEgrCons = totalGastos + totalPagosB + pagosPrestTarj + pagosGastPers;

  const $ = v => `$${parseFloat(v||0).toFixed(2)}`;
  const fila = (label, valor, color) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12 }}>
      <span>{label}</span>
      <span style={{ color: color || '#333', fontWeight: color ? 'bold' : 'normal' }}>{$(valor)}</span>
    </div>
  );
  const totalRow = (label, valor, bg, textColor='white') => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0',
      borderTop:'1px solid #eee', marginTop:4, fontWeight:'bold', fontSize:12 }}>
      <span>{label}</span>
      <span style={{ background: bg, color: textColor, padding:'1px 8px', borderRadius:4 }}>{$(valor)}</span>
    </div>
  );
  const titulo = (label, color) => (
    <div style={{ fontWeight:'bold', color, margin:'10px 0 4px', fontSize:12 }}>{label}</div>
  );

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

      {/* Columna MES */}
      <div style={{ border:'2px solid #1a2a4a', borderRadius:10, overflow:'hidden' }}>
        <div style={{ background:'#1a2a4a', color:'white', padding:'10px 14px', textAlign:'center', fontWeight:'bold', fontSize:13 }}>
          {MESES[mes-1].toUpperCase()} {año}<br/>
          <span style={{ fontSize:10, opacity:0.8 }}>Embutidos y Jamones Candelaria</span>
        </div>
        <div style={{ padding:14 }}>
          {titulo('INGRESOS', '#27ae60')}
          {fila('(+) Total ventas del mes', totalVentas, '#27ae60')}
          {fila('(+) Otros ingresos', totalOtrosI, '#27ae60')}
          {totalRow('TOTAL INGRESOS', totalIngMes, '#27ae60')}

          {titulo('EGRESOS', '#e74c3c')}
          {fila('(-) Gastos efectivo', totalGastos, '#e74c3c')}
          {fila('(-) Proveedores con factura', comprasCon, '#e74c3c')}
          {fila('(-) Proveedores sin factura', comprasSin, '#e74c3c')}
          {fila('(-) Sueldos', totalSueldos, '#e74c3c')}
          {fila('(-) IESS patronal', totalIess, '#e74c3c')}
          {fila('(-) Pagos del mes', totalPagosB, '#e74c3c')}
          {fila('(-) Pagos personales', totalPagosP, '#e74c3c')}
          {totalRow('TOTAL EGRESOS', totalEgrMes, '#e74c3c')}

          <div style={{ marginTop:12, background:'#ffd700', padding:'8px 10px',
            borderRadius:6, display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:13 }}>
            <span>UTILIDAD BRUTA</span>
            <span style={{ color: utilidadBruta >= 0 ? '#155724' : '#721c24' }}>{$(utilidadBruta)}</span>
          </div>
        </div>
      </div>

      {/* Columna CONSOLIDADO */}
      <div style={{ border:'2px solid #2980b9', borderRadius:10, overflow:'hidden' }}>
        <div style={{ background:'#2980b9', color:'white', padding:'10px 14px', textAlign:'center', fontWeight:'bold', fontSize:13 }}>
          CONSOLIDADO<br/>
          <span style={{ fontSize:10, opacity:0.8 }}>Embutidos y Jamones Candelaria</span>
        </div>
        <div style={{ padding:14 }}>
          {titulo('INGRESOS (cobros reales)', '#27ae60')}
          {fila('(+) Cobros efectivo', cobroEfect, '#27ae60')}
          {fila('(+) Cobros cheque', cobroCheq, '#27ae60')}
          {fila('(+) Cobros transf./depósito', cobroTransf, '#27ae60')}
          {fila('(+) Otros ingresos', totalOtrosI, '#27ae60')}
          {totalRow('TOTAL', totalIngCons, '#27ae60')}

          {titulo('EGRESOS (pagos reales)', '#e74c3c')}
          {fila('(-) Gastos efectivo', totalGastos, '#e74c3c')}
          {fila('(-) Pagos con banco', totalPagosB, '#e74c3c')}
          {fila('(-) Tarjetas/préstamos', pagosPrestTarj, '#e74c3c')}
          {fila('(-) Gastos personales', pagosGastPers, '#e74c3c')}
          {totalRow('TOTAL', totalEgrCons, '#e74c3c')}

          {titulo('ACTIVOS', '#555')}
          {fila('(+) Cuentas por cobrar', cxcPendiente, '#27ae60')}

          <div style={{ marginTop:10, background:'#1a2a4a', color:'white', padding:'7px 10px',
            borderRadius:6, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
            <span>💳 Saldo cuenta corriente</span>
            {editandoSaldo ? (
              <div style={{ display:'flex', gap:6 }}>
                <input type="number" value={saldoBanco} onChange={e => setSaldoBanco(e.target.value)}
                  style={{ width:100, padding:'3px 6px', borderRadius:4, border:'none', fontSize:12 }} />
                <button onClick={() => guardarSaldo(saldoBanco)}
                  style={{ background:'#27ae60', color:'white', border:'none', borderRadius:4,
                    padding:'3px 8px', cursor:'pointer', fontSize:11 }}>✓</button>
              </div>
            ) : (
              <span onClick={() => esAdminContador && setEditandoSaldo(true)}
                style={{ fontWeight:'bold', cursor: esAdminContador ? 'pointer' : 'default' }}>
                {saldoBanco ? `$${parseFloat(saldoBanco).toFixed(2)}` : (esAdminContador ? '✏️ Ingresar' : '—')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/ResumenTalonario.js
git commit -m "feat(talonario): Resumen auto-calculado MES + CONSOLIDADO"
```

---

## Task 14: ExcelExport

**Files:**
- Create: `src/components/contabilidad/talonario/shared/ExcelExport.js`

- [ ] **Step 1: Crear ExcelExport.js**

```javascript
// src/components/contabilidad/talonario/shared/ExcelExport.js
import React, { useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';

export default function ExcelExport() {
  const { mes, año, fechaDesde, fechaHasta, MESES } = useTalonario();
  const [generando, setGenerando] = useState(false);

  async function descargar() {
    setGenerando(true);
    try {
      const XLSX = await import('xlsx');

      const [
        { data: cobros },
        { data: gastos },
        { data: compras },
        { data: pagosB },
        { data: pagosP },
        { data: otrosI },
        { data: factP },
        { data: nomina },
        { data: cobrosAll },
        { data: facturas },
        { data: cxc },
      ] = await Promise.all([
        supabase.from('cobros').select('fecha,monto,forma_pago,observaciones,clientes(nombre)').gte('fecha',fechaDesde).lte('fecha',fechaHasta).order('fecha'),
        supabase.from('caja_gastos').select('fecha,concepto,monto,tipo').gte('fecha',fechaDesde).lte('fecha',fechaHasta).order('fecha'),
        supabase.from('compras').select('fecha,total,tiene_factura,forma_pago,proveedores(nombre)').gte('fecha',fechaDesde).lte('fecha',fechaHasta).order('fecha'),
        supabase.from('talonario_pagos_banco').select('*').eq('mes',mes).eq('año',año).order('fecha'),
        supabase.from('talonario_pagos_personales').select('*').eq('mes',mes).eq('año',año).order('categoria').order('fecha'),
        supabase.from('talonario_otros_ingresos').select('*').eq('mes',mes).eq('año',año).order('fecha'),
        supabase.from('talonario_facturas_personales').select('*').eq('mes',mes).eq('año',año).order('fecha'),
        supabase.from('nomina').select('sueldo_prop,iess_patronal').eq('mes',mes).eq('año',año),
        supabase.from('cobros').select('fecha,monto,forma_pago,clientes(nombre)').gte('fecha',fechaDesde).lte('fecha',fechaHasta),
        supabase.from('facturas').select('total').gte('fecha_emision',fechaDesde).lte('fecha_emision',fechaHasta).neq('estado','anulada'),
        supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').eq('estado','pendiente'),
      ]);

      const s = (arr, campo) => (arr||[]).reduce((t,r) => t + parseFloat(r[campo]||0), 0);
      const $ = v => parseFloat((v||0).toFixed(2));

      const wb = XLSX.utils.book_new();

      // Helpers
      const hdr = cols => [cols];
      const toSheet = (rows) => XLSX.utils.aoa_to_sheet(rows);

      // GASTOS EFECTIVO
      const gastosRows = hdr(['Fecha','Concepto','Tipo','Monto','Forma Pago'])
        .concat((gastos||[]).map(r => [r.fecha, r.concepto||'', r.tipo||'', $(r.monto), 'Efectivo (01)']))
        .concat([['','','','Total', $(s(gastos,'monto'))]]);
      XLSX.utils.book_append_sheet(wb, toSheet(gastosRows), 'GASTOS EFECTIVO');

      // COBROS EFECTIVO
      const cobEfRows = hdr(['Fecha','Cliente','Monto','Forma Pago','Observaciones'])
        .concat((cobros||[]).filter(c=>c.forma_pago==='efectivo').map(r => [r.fecha, r.clientes?.nombre||'', $(r.monto), 'Efectivo (01)', r.observaciones||'']))
        .concat([['','','Total','','']]);
      XLSX.utils.book_append_sheet(wb, toSheet(cobEfRows), 'COBROS EFECTIVO');

      // COBROS TRANSF/DEP
      const cobTrRows = hdr(['Fecha','Cliente','Monto','Forma Pago','Observaciones'])
        .concat((cobros||[]).filter(c=>['transferencia','deposito'].includes(c.forma_pago)).map(r => [r.fecha, r.clientes?.nombre||'', $(r.monto), r.forma_pago==='deposito'?'Depósito (20)':'Transf. (20)', r.observaciones||'']))
        .concat([['','','Total','','']]);
      XLSX.utils.book_append_sheet(wb, toSheet(cobTrRows), 'COBROS TRANSF-DEP');

      // COBROS CHEQUES
      const cobChRows = hdr(['Fecha','Cliente','Monto','Forma Pago','Observaciones'])
        .concat((cobros||[]).filter(c=>c.forma_pago==='cheque').map(r => [r.fecha, r.clientes?.nombre||'', $(r.monto), 'Cheque (20)', r.observaciones||'']))
        .concat([['','','Total','','']]);
      XLSX.utils.book_append_sheet(wb, toSheet(cobChRows), 'COBROS CHEQUES');

      // PAGOS MES
      const pagBRows = hdr(['Fecha','Beneficiario','Concepto','Monto','Forma Pago','Comentario'])
        .concat((pagosB||[]).map(r => [r.fecha||'', r.beneficiario||'', r.concepto||'', $(r.monto), r.forma_pago||'', r.comentario||'']))
        .concat([['','','','Total','','']]);
      XLSX.utils.book_append_sheet(wb, toSheet(pagBRows), 'PAGOS MES');

      // OTROS PAGOS PERSONALES
      const pagPRows = hdr(['Fecha','Categoría','Beneficiario','Concepto','Monto','Forma Pago','Comentario'])
        .concat((pagosP||[]).map(r => [r.fecha||'', r.categoria||'', r.beneficiario||'', r.concepto||'', $(r.monto), r.forma_pago||'', r.comentario||'']))
        .concat([['','','','','Total','','']]);
      XLSX.utils.book_append_sheet(wb, toSheet(pagPRows), 'OTROS PAGOS PERSONALES');

      // COMPRAS
      const compRows = hdr(['Fecha','Proveedor','Tipo','Total','Forma Pago'])
        .concat((compras||[]).map(r => [r.fecha, r.proveedores?.nombre||'', r.tiene_factura?'Con factura':'Sin factura', $(r.total), r.forma_pago||'']))
        .concat([['','','','Total','']]);
      XLSX.utils.book_append_sheet(wb, toSheet(compRows), 'COMPRAS');

      // COMPRAS PERSONAL
      const factPRows = hdr(['Fecha','Proveedor','Descripción','Factura','Monto','Forma Pago','Comentario'])
        .concat((factP||[]).map(r => [r.fecha||'', r.proveedor||'', r.descripcion||'', r.tiene_factura?'Sí':'No', $(r.monto), r.forma_pago||'', r.comentario||'']))
        .concat([['','','','','Total','','']]);
      XLSX.utils.book_append_sheet(wb, toSheet(factPRows), 'COMPRAS PERSONAL');

      // RESUMEN (hoja 1)
      const totalVentas = s(facturas,'total');
      const totalOtrosI = s(otrosI,'monto');
      const totalGastos = s(gastos,'monto');
      const comprasCon  = (compras||[]).filter(c=>c.tiene_factura).reduce((t,r)=>t+$(r.total),0);
      const comprasSin  = (compras||[]).filter(c=>!c.tiene_factura).reduce((t,r)=>t+$(r.total),0);
      const totalSueldos= s(nomina,'sueldo_prop');
      const totalIess   = s(nomina,'iess_patronal');
      const totalPagosB = s(pagosB,'monto');
      const totalPagosP = s(pagosP,'monto');
      const cobroEfect  = (cobrosAll||[]).filter(c=>c.forma_pago==='efectivo').reduce((t,r)=>t+$(r.monto),0);
      const cobroCheq   = (cobrosAll||[]).filter(c=>c.forma_pago==='cheque').reduce((t,r)=>t+$(r.monto),0);
      const cobroTransf = (cobrosAll||[]).filter(c=>['transferencia','deposito'].includes(c.forma_pago)).reduce((t,r)=>t+$(r.monto),0);
      const cxcPend     = (cxc||[]).reduce((t,r)=>t+$(r.monto_total)-$(r.monto_cobrado),0);
      const ingMes      = totalVentas + totalOtrosI;
      const egrMes      = totalGastos + comprasCon + comprasSin + totalSueldos + totalIess + totalPagosB + totalPagosP;

      const resumenRows = [
        [`${MESES[mes-1].toUpperCase()} ${año}`, '', 'CONSOLIDADO', ''],
        ['INGRESOS', '', 'INGRESOS', ''],
        ['(+) Total ventas del mes', $(totalVentas), '(+) Cobros efectivo', $(cobroEfect)],
        ['(+) Otros ingresos', $(totalOtrosI), '(+) Cobros cheque', $(cobroCheq)],
        ['', '', '(+) Cobros transf./depósito', $(cobroTransf)],
        ['', '', '(+) Otros ingresos', $(totalOtrosI)],
        ['TOTAL INGRESOS', $(ingMes), 'TOTAL', $(cobroEfect+cobroCheq+cobroTransf+totalOtrosI)],
        ['EGRESOS', '', 'EGRESOS', ''],
        ['(-) Gastos efectivo', $(totalGastos), '(-) Gastos efectivo', $(totalGastos)],
        ['(-) Proveedores con factura', $(comprasCon), '(-) Pagos con banco', $(totalPagosB)],
        ['(-) Proveedores sin factura', $(comprasSin), '(-) Tarjetas/préstamos', $((pagosP||[]).filter(p=>['prestamos','tarjetas'].includes(p.categoria)).reduce((t,r)=>t+$(r.monto),0))],
        ['(-) Sueldos', $(totalSueldos), '(-) Gastos personales', $((pagosP||[]).filter(p=>['gastos_personal','otros'].includes(p.categoria)).reduce((t,r)=>t+$(r.monto),0))],
        ['(-) IESS patronal', $(totalIess), '', ''],
        ['(-) Pagos del mes', $(totalPagosB), '', ''],
        ['(-) Pagos personales', $(totalPagosP), '', ''],
        ['TOTAL EGRESOS', $(egrMes), 'TOTAL', $(totalGastos+totalPagosB+totalPagosP)],
        ['UTILIDAD BRUTA', $(ingMes - egrMes), 'ACTIVOS', ''],
        ['', '', '(+) Cuentas por cobrar', $(cxcPend)],
      ];
      XLSX.utils.book_append_sheet(wb, toSheet(resumenRows), 'RESUMEN');

      XLSX.writeFile(wb, `Talonario_${MESES[mes-1]}_${año}.xlsx`);
    } catch (e) {
      alert('Error al generar Excel: ' + e.message);
    }
    setGenerando(false);
  }

  return (
    <button onClick={descargar} disabled={generando}
      style={{ background: '#27ae60', color: 'white', border: 'none',
        borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>
      {generando ? '⏳ Generando...' : '📥 Descargar Excel'}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/contabilidad/talonario/shared/ExcelExport.js
git commit -m "feat(talonario): descarga Excel con todas las hojas"
```

---

## Task 15: ExcelImport (con IA)

**Files:**
- Create: `src/components/contabilidad/talonario/shared/ExcelImport.js`

- [ ] **Step 1: Crear ExcelImport.js**

```javascript
// src/components/contabilidad/talonario/shared/ExcelImport.js
import React, { useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';

const TABLA_MAP = {
  'GASTOS EFECTIVO':        { tabla: null,   nota: 'Solo lectura — proviene de Caja Chica' },
  'COBROS EFECTIVO':        { tabla: null,   nota: 'Solo lectura — proviene de Cobros' },
  'COBROS TRANSF-DEP':      { tabla: null,   nota: 'Solo lectura — proviene de Cobros' },
  'COBROS CHEQUES':         { tabla: null,   nota: 'Solo lectura — proviene de Cobros' },
  'COMPRAS':                { tabla: null,   nota: 'Solo lectura — proviene de Compras' },
  'PAGOS MES':              { tabla: 'talonario_pagos_banco' },
  'OTROS PAGOS PERSONALES': { tabla: 'talonario_pagos_personales' },
  'COMPRAS PERSONAL':       { tabla: 'talonario_facturas_personales' },
};

export default function ExcelImport({ onClose }) {
  const { mes, año } = useTalonario();
  const [paso,      setPaso]      = useState('upload');  // 'upload' | 'preview' | 'done'
  const [analisis,  setAnalisis]  = useState(null);
  const [analizando,setAnalizando]= useState(false);
  const [importando,setImportando]= useState(false);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAnalizando(true);

    try {
      const XLSX = await import('xlsx');
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });

      const hojas = wb.SheetNames.map(nombre => {
        const ws   = wb.Sheets[nombre];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        return { nombre, rows };
      });

      // Llamar a IA para parsear
      const hojasTxt = hojas.map(h =>
        `=== HOJA: ${h.nombre} ===\n` + h.rows.map(r => r.join('\t')).join('\n')
      ).join('\n\n');

      const resp = await supabase.functions.invoke('analizar-talonario', {
        body: { contenido: hojasTxt, mes, año }
      });

      if (resp.error) throw new Error(resp.error.message);
      setAnalisis(resp.data);
      setPaso('preview');
    } catch (err) {
      alert('Error al analizar: ' + err.message);
    }
    setAnalizando(false);
  }

  async function importarSeleccionados(modo) {
    // modo: 'all' | 'new'
    setImportando(true);
    try {
      for (const hoja of analisis.hojas || []) {
        const info = TABLA_MAP[hoja.nombre];
        if (!info?.tabla || !hoja.filas?.length) continue;

        let filasAInsertar = hoja.filas;
        if (modo === 'new') {
          // Obtener existentes para dedup básico por fecha+monto
          const { data: exist } = await supabase
            .from(info.tabla).select('fecha,monto').eq('mes', mes).eq('año', año);
          const claves = new Set((exist||[]).map(r => `${r.fecha}_${r.monto}`));
          filasAInsertar = hoja.filas.filter(f => !claves.has(`${f.fecha}_${f.monto}`));
        }

        if (filasAInsertar.length > 0) {
          const payload = filasAInsertar.map(f => ({ ...f, mes, año }));
          await supabase.from(info.tabla).insert(payload);
        }
      }
      setPaso('done');
    } catch (err) {
      alert('Error al importar: ' + err.message);
    }
    setImportando(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 520,
        maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>📤 Subir Excel histórico</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        {paso === 'upload' && (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              Selecciona el archivo Excel del talonario para cargarlo como datos históricos de {mes}/{año}.
              Las secciones de solo lectura (Cobros, Compras, Gastos) serán ignoradas.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile}
              style={{ display: 'block', marginBottom: 12 }} />
            {analizando && (
              <div style={{ padding: 16, textAlign: 'center', color: '#2980b9' }}>
                ⏳ Analizando con IA...
              </div>
            )}
          </div>
        )}

        {paso === 'preview' && analisis && (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              La IA encontró los siguientes datos para importar:
            </p>
            {(analisis.hojas || []).map(hoja => {
              const info = TABLA_MAP[hoja.nombre];
              return (
                <div key={hoja.nombre} style={{ marginBottom: 12, padding: '10px 14px',
                  background: '#f8f9fa', borderRadius: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                    {hoja.nombre}
                    {!info?.tabla && <span style={{ color: '#e74c3c', fontWeight: 'normal', marginLeft: 8, fontSize: 12 }}>(solo lectura — no se importará)</span>}
                  </div>
                  {info?.tabla && (
                    <div style={{ color: '#555' }}>
                      {hoja.filas?.length || 0} filas encontradas
                      {typeof hoja.nuevas === 'number' && ` · ${hoja.nuevas} nuevas`}
                    </div>
                  )}
                  {info?.nota && <div style={{ color: '#888', fontSize: 12 }}>{info.nota}</div>}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6,
                border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={() => importarSeleccionados('new')} disabled={importando}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: '#2980b9', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {importando ? '⏳ Importando...' : 'Solo las nuevas'}
              </button>
              <button onClick={() => importarSeleccionados('all')} disabled={importando}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {importando ? '⏳ Importando...' : 'Importar todo'}
              </button>
            </div>
          </div>
        )}

        {paso === 'done' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 8 }}>¡Importación completada!</div>
            <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 6, border: 'none',
              background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 14 }}>
              Cerrar
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
```

**Nota:** `ExcelImport` llama a una Supabase Edge Function `analizar-talonario`. La función procesa el texto de las hojas con la Claude API y devuelve `{ hojas: [{ nombre, filas: [{fecha, monto, concepto, ...}] }] }`. Crear esta Edge Function es el siguiente paso.

- [ ] **Step 2: Crear Edge Function analizar-talonario**

En Supabase Dashboard → Edge Functions → New Function, crear `analizar-talonario`:

```typescript
// supabase/functions/analizar-talonario/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

serve(async (req) => {
  const { contenido, mes, año } = await req.json();

  const prompt = `Eres un asistente contable. Analiza el siguiente contenido de un Excel de talonario financiero y extrae los datos de cada hoja en formato JSON.

Para cada hoja, devuelve un array de filas con los campos relevantes según la hoja:
- PAGOS MES: { fecha, beneficiario, concepto, monto, forma_pago (01/16/19/20), comentario }
- OTROS PAGOS PERSONALES: { fecha, categoria (prestamos/tarjetas/gastos_personal/otros), beneficiario, concepto, monto, forma_pago, comentario }
- COMPRAS PERSONAL: { fecha, proveedor, descripcion, monto, tiene_factura (true/false), forma_pago, comentario }

Para fecha usa formato YYYY-MM-DD. Para monto usa número decimal. Para forma_pago mapea: efectivo→01, débito→16, crédito→19, transferencia/cheque/depósito→20.

Devuelve SOLO JSON válido con esta estructura:
{ "hojas": [{ "nombre": "NOMBRE_HOJA", "filas": [...] }] }

Contenido del Excel (mes ${mes}/${año}):
${contenido.substring(0, 8000)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text;

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'No se pudo parsear la respuesta de IA', raw: text }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/components/contabilidad/talonario/shared/ExcelImport.js
git commit -m "feat(talonario): importación Excel con IA (modal + edge function)"
```

---

## Task 16: Verificación final

- [ ] **Step 1: Verificar que el módulo abre desde Contabilidad**

1. Ir a Contabilidad → debe aparecer card "📒 Talonario"
2. Clic → abre el módulo con header y pestañas
3. Selector de mes/año funciona
4. Todas las pestañas y submenús abren sin error

- [ ] **Step 2: Verificar secciones de solo lectura**

1. Cobros Efectivo → muestra cobros en efectivo del mes seleccionado
2. Compras → muestra compras del mes
3. Gastos Efectivo → muestra gastos de caja chica

- [ ] **Step 3: Verificar CRUD en secciones manuales (como admin/contador)**

1. Pagos del Mes → agregar un pago → aparece en tabla → editar → eliminar
2. Pagos Personales → agregar en cada categoría → subtotales actualizan
3. Otros Ingresos → agregar → eliminar

- [ ] **Step 4: Verificar Resumen**

1. Números del Resumen reflejan los datos de las secciones
2. Cambiar mes/año → Resumen recalcula
3. Saldo cuenta corriente editable para admin/contador

- [ ] **Step 5: Verificar descarga Excel**

1. Clic en "📥 Descargar Excel"
2. Se descarga `.xlsx` con el nombre `Talonario_Diciembre_2026.xlsx`
3. Abrir en Excel → verificar que tiene las hojas correctas con datos

- [ ] **Step 6: Commit final**

```bash
git add .
git commit -m "feat(talonario): módulo completo — secciones, resumen, Excel"
```

---

## Auto-revisión del spec

| Sección spec | Tarea que la implementa |
|---|---|
| Navegación Option A (pestañas agrupadas) | Task 4 |
| DB: 4 tablas nuevas | Task 1 |
| TalonarioContext | Task 2 |
| Resumen MES + CONSOLIDADO | Task 13 |
| Distinción devengo vs caja | Task 13 (filtros fechaDesde/fechaHasta vs mes/año) |
| CobrosEfectivo/Transferencia/Cheques | Task 5 |
| Otros Ingresos | Task 7 |
| Gastos Efectivo solo lectura | Task 8 |
| Pagos del Mes manual | Task 9 |
| Pagos Personales 3 categorías | Task 10 |
| Compras solo lectura | Task 11 |
| Facturas Personales manual | Task 12 |
| Excel exportar | Task 14 |
| Excel importar con IA | Task 15 |
| Solo admin/contador editan | ✅ en TablaCrud + cada sección |
| SRI codes (01/16/19/20) | ✅ en FORMAS_PAGO de TablaCrud |
| Saldo cuenta corriente manual | Task 13 (upsert en config_contabilidad) |
| Registrar en App.js y MenuContabilidad | Task 3 |
