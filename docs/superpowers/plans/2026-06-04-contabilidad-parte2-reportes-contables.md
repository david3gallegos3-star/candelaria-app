# Contabilidad Parte 2 — Módulo Reportes Contables

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un módulo nuevo "Reportes Contables" con 4 reportes formales (Estado de Resultados, Balance General, Libro Mayor, Balance de Comprobación), filtro por mes o rango de fechas, y exportación a PDF y Excel.

**Architecture:** Nuevo módulo en `src/components/contabilidad/reportes/`. Datos vienen del `libro_diario` + `libro_diario_detalle` + `cuentas_contables`. Cada reporte es un componente independiente. El contenedor `TabReportes.js` maneja el selector de período y despacha a cada reporte. La exportación PDF usa `window.print()` con CSS. La exportación Excel usa la librería `xlsx`.

**Tech Stack:** React, Supabase (PostgREST), xlsx (npm).

**IMPORTANTE:** Ejecutar DESPUÉS de Parte 1 para que los datos del libro diario sean correctos.

---

## Archivos a crear/modificar

| Archivo | Rol |
|---|---|
| `src/components/contabilidad/reportes/reporteQueries.js` | Crear — queries Supabase para todos los reportes |
| `src/components/contabilidad/reportes/TabReportes.js` | Crear — contenedor principal |
| `src/components/contabilidad/reportes/EstadoResultados.js` | Crear — reporte ingreso/gasto |
| `src/components/contabilidad/reportes/BalanceGeneral.js` | Crear — reporte activos/pasivos |
| `src/components/contabilidad/reportes/LibroMayor.js` | Crear — movimientos por cuenta |
| `src/components/contabilidad/reportes/BalanceComprobacion.js` | Crear — totales debe/haber |
| `src/App.js` | Modificar — agregar ruta `reportesContables` |
| `src/components/MenuPrincipal.js` (o similar) | Modificar — agregar botón al menú |

---

## Task 1: reporteQueries.js — funciones de consulta

**Archivo:** `src/components/contabilidad/reportes/reporteQueries.js`

Contexto: todos los reportes necesitan los mismos datos base del libro diario. Esta utilidad centraliza las queries.

- [ ] **Paso 1: Crear el archivo**

```javascript
// src/components/contabilidad/reportes/reporteQueries.js
import { supabase } from '../../../supabase';

export async function getAsientosPorPeriodo(fechaDesde, fechaHasta) {
  const { data, error } = await supabase
    .from('libro_diario')
    .select('id')
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta)
    .neq('estado', 'eliminado');
  if (error) throw error;
  return (data || []).map(a => a.id);
}

export async function getAsientosHasta(fechaHasta) {
  // Para Balance General — desde el inicio hasta la fecha
  const { data, error } = await supabase
    .from('libro_diario')
    .select('id')
    .lte('fecha', fechaHasta)
    .neq('estado', 'eliminado');
  if (error) throw error;
  return (data || []).map(a => a.id);
}

export async function getDetallesPorAsientos(asientoIds) {
  if (!asientoIds.length) return [];
  const { data, error } = await supabase
    .from('libro_diario_detalle')
    .select('cuenta_id, debe, haber, asiento_id')
    .in('asiento_id', asientoIds);
  if (error) throw error;
  return data || [];
}

export async function getDetallesConFechaPorAsientos(asientoIds) {
  if (!asientoIds.length) return [];
  const { data, error } = await supabase
    .from('libro_diario_detalle')
    .select(`
      id, cuenta_id, debe, haber, descripcion, orden,
      asiento:libro_diario(fecha, descripcion, origen)
    `)
    .in('asiento_id', asientoIds)
    .order('asiento_id');
  if (error) throw error;
  return data || [];
}

export async function getCuentasContables() {
  const { data, error } = await supabase
    .from('cuentas_contables')
    .select('id, codigo, nombre, tipo, nivel, naturaleza')
    .eq('activa', true)
    .order('codigo');
  if (error) throw error;
  return data || [];
}

export function agruparPorCuenta(detalles) {
  const mapa = {};
  detalles.forEach(d => {
    if (!mapa[d.cuenta_id]) mapa[d.cuenta_id] = { debe: 0, haber: 0 };
    mapa[d.cuenta_id].debe  += parseFloat(d.debe  || 0);
    mapa[d.cuenta_id].haber += parseFloat(d.haber || 0);
  });
  return mapa;
}

export function calcularSaldo(debe, haber, naturaleza) {
  return naturaleza === 'deudora' ? debe - haber : haber - debe;
}
```

- [ ] **Paso 2: Commit**

```bash
git add src/components/contabilidad/reportes/reporteQueries.js
git commit -m "feat(reportes): utilidades de consulta para libro diario"
```

---

## Task 2: BalanceComprobacion.js — primer reporte

**Archivo:** `src/components/contabilidad/reportes/BalanceComprobacion.js`

Contexto: el más simple — muestra totales debe/haber por cuenta para validar que la partida doble cuadra (total debe = total haber).

- [ ] **Paso 1: Crear el componente**

```javascript
// src/components/contabilidad/reportes/BalanceComprobacion.js
import React, { useEffect, useState } from 'react';
import {
  getAsientosPorPeriodo, getDetallesPorAsientos,
  getCuentasContables, agruparPorCuenta, calcularSaldo,
} from './reporteQueries';

export default function BalanceComprobacion({ fechaDesde, fechaHasta, empresa }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (fechaDesde && fechaHasta) cargar();
  }, [fechaDesde, fechaHasta]);

  async function cargar() {
    setCargando(true);
    try {
      const [asientoIds, cuentas] = await Promise.all([
        getAsientosPorPeriodo(fechaDesde, fechaHasta),
        getCuentasContables(),
      ]);
      const detalles = await getDetallesPorAsientos(asientoIds);
      const totales  = agruparPorCuenta(detalles);

      const resultado = cuentas
        .filter(c => totales[c.id])
        .map(c => ({
          ...c,
          debe:  totales[c.id].debe,
          haber: totales[c.id].haber,
          saldo: calcularSaldo(totales[c.id].debe, totales[c.id].haber, c.naturaleza),
        }));
      setFilas(resultado);
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }

  const totalDebe  = filas.reduce((s, f) => s + f.debe,  0);
  const totalHaber = filas.reduce((s, f) => s + f.haber, 0);
  const cuadra     = Math.abs(totalDebe - totalHaber) < 0.01;
  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando...</div>;

  return (
    <div id="reporte-imprimible">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>BALANCE DE COMPROBACIÓN</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Período: {fechaDesde} al {fechaHasta}</div>
      </div>

      {filas.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
          Sin movimientos en este período
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1a2a4a', color: 'white' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Código</th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Cuenta</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Debe</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Haber</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id} style={{ background: i % 2 === 0 ? 'white' : '#f8f9fa', borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{f.codigo}</td>
                <td style={{ padding: '6px 10px' }}>{f.nombre}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{$(f.debe)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{$(f.haber)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold',
                  color: f.saldo >= 0 ? '#27ae60' : '#e74c3c' }}>{$(Math.abs(f.saldo))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#1a2a4a', color: 'white', fontWeight: 'bold' }}>
              <td colSpan={2} style={{ padding: '8px 10px' }}>TOTALES</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{$(totalDebe)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{$(totalHaber)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                {cuadra ? '✅ Cuadra' : '❌ No cuadra'}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add src/components/contabilidad/reportes/BalanceComprobacion.js
git commit -m "feat(reportes): Balance de Comprobación"
```

---

## Task 3: EstadoResultados.js

**Archivo:** `src/components/contabilidad/reportes/EstadoResultados.js`

- [ ] **Paso 1: Crear el componente**

```javascript
// src/components/contabilidad/reportes/EstadoResultados.js
import React, { useEffect, useState } from 'react';
import {
  getAsientosPorPeriodo, getDetallesPorAsientos,
  getCuentasContables, agruparPorCuenta,
} from './reporteQueries';

export default function EstadoResultados({ fechaDesde, fechaHasta, empresa }) {
  const [ingresos, setIngresos] = useState([]);
  const [gastos,   setGastos]   = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (fechaDesde && fechaHasta) cargar();
  }, [fechaDesde, fechaHasta]);

  async function cargar() {
    setCargando(true);
    try {
      const [asientoIds, cuentas] = await Promise.all([
        getAsientosPorPeriodo(fechaDesde, fechaHasta),
        getCuentasContables(),
      ]);
      const detalles = await getDetallesPorAsientos(asientoIds);
      const totales  = agruparPorCuenta(detalles);

      const ing = cuentas
        .filter(c => c.tipo === 'ingreso' && totales[c.id])
        .map(c => ({ ...c, monto: (totales[c.id].haber || 0) - (totales[c.id].debe || 0) }));

      const gas = cuentas
        .filter(c => c.tipo === 'gasto' && totales[c.id])
        .map(c => ({ ...c, monto: (totales[c.id].debe || 0) - (totales[c.id].haber || 0) }));

      setIngresos(ing);
      setGastos(gas);
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }

  const totalIngresos = ingresos.reduce((s, f) => s + f.monto, 0);
  const totalGastos   = gastos.reduce((s, f) => s + f.monto, 0);
  const utilidad      = totalIngresos - totalGastos;
  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;

  const Seccion = ({ titulo, color, filas, total }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 'bold', color, fontSize: 13, borderBottom: `2px solid ${color}`,
        paddingBottom: 4, marginBottom: 8 }}>{titulo}</div>
      {filas.map(f => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between',
          padding: '3px 0', fontSize: 12 }}>
          <span style={{ color: '#555' }}>{f.codigo} — {f.nombre}</span>
          <span style={{ color }}>{$(f.monto)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold',
        borderTop: '1px solid #eee', paddingTop: 6, marginTop: 4, fontSize: 13 }}>
        <span>TOTAL {titulo.toUpperCase()}</span>
        <span style={{ color }}>{$(total)}</span>
      </div>
    </div>
  );

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando...</div>;

  return (
    <div id="reporte-imprimible" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>ESTADO DE RESULTADOS</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Período: {fechaDesde} al {fechaHasta}</div>
      </div>

      <Seccion titulo="Ingresos" color="#27ae60" filas={ingresos} total={totalIngresos} />
      <Seccion titulo="Gastos"   color="#e74c3c" filas={gastos}   total={totalGastos} />

      <div style={{ background: totalIngresos >= totalGastos ? '#e8f5e9' : '#fde8e8',
        borderRadius: 8, padding: '12px 16px', display: 'flex',
        justifyContent: 'space-between', fontWeight: 'bold', fontSize: 15, marginTop: 8 }}>
        <span>{utilidad >= 0 ? 'UTILIDAD DEL PERÍODO' : 'PÉRDIDA DEL PERÍODO'}</span>
        <span style={{ color: utilidad >= 0 ? '#27ae60' : '#e74c3c' }}>{$(Math.abs(utilidad))}</span>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add src/components/contabilidad/reportes/EstadoResultados.js
git commit -m "feat(reportes): Estado de Resultados"
```

---

## Task 4: BalanceGeneral.js

**Archivo:** `src/components/contabilidad/reportes/BalanceGeneral.js`

Nota: el Balance General usa datos ACUMULADOS desde el inicio hasta `fechaHasta` (no solo el período).

- [ ] **Paso 1: Crear el componente**

```javascript
// src/components/contabilidad/reportes/BalanceGeneral.js
import React, { useEffect, useState } from 'react';
import {
  getAsientosHasta, getDetallesPorAsientos,
  getCuentasContables, agruparPorCuenta, calcularSaldo,
} from './reporteQueries';

export default function BalanceGeneral({ fechaHasta, empresa }) {
  const [activos,    setActivos]    = useState([]);
  const [pasivos,    setPasivos]    = useState([]);
  const [patrimonio, setPatrimonio] = useState([]);
  const [cargando,   setCargando]   = useState(false);

  useEffect(() => {
    if (fechaHasta) cargar();
  }, [fechaHasta]);

  async function cargar() {
    setCargando(true);
    try {
      const [asientoIds, cuentas] = await Promise.all([
        getAsientosHasta(fechaHasta),
        getCuentasContables(),
      ]);
      const detalles = await getDetallesPorAsientos(asientoIds);
      const totales  = agruparPorCuenta(detalles);

      const mapear = tipo => cuentas
        .filter(c => c.tipo === tipo && totales[c.id])
        .map(c => ({
          ...c,
          saldo: calcularSaldo(totales[c.id].debe, totales[c.id].haber, c.naturaleza),
        }))
        .filter(c => Math.abs(c.saldo) > 0.01);

      setActivos(mapear('activo'));
      setPasivos(mapear('pasivo'));
      setPatrimonio(mapear('patrimonio'));
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }

  const totalActivos    = activos.reduce((s, f) => s + f.saldo, 0);
  const totalPasivos    = pasivos.reduce((s, f) => s + f.saldo, 0);
  const totalPatrimonio = patrimonio.reduce((s, f) => s + f.saldo, 0);
  const cuadra = Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 0.01;
  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;

  const Grupo = ({ titulo, color, filas, total }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 'bold', color, fontSize: 12, marginBottom: 6 }}>{titulo}</div>
      {filas.map(f => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between',
          padding: '2px 8px', fontSize: 12 }}>
          <span style={{ color: '#555' }}>{f.codigo} — {f.nombre}</span>
          <span>{$(f.saldo)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold',
        borderTop: '1px solid #eee', padding: '4px 8px', marginTop: 4, fontSize: 12 }}>
        <span>TOTAL</span>
        <span style={{ color }}>{$(total)}</span>
      </div>
    </div>
  );

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando...</div>;

  return (
    <div id="reporte-imprimible">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>BALANCE GENERAL</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Al {fechaHasta}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ fontWeight: 'bold', background: '#1a2a4a', color: 'white',
            padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            ACTIVOS
          </div>
          <Grupo titulo="Activo Corriente" color="#27ae60"
            filas={activos.filter(f => f.codigo.startsWith('1.1'))} 
            total={activos.filter(f => f.codigo.startsWith('1.1')).reduce((s,f)=>s+f.saldo,0)} />
          <Grupo titulo="Activo No Corriente" color="#27ae60"
            filas={activos.filter(f => !f.codigo.startsWith('1.1'))} 
            total={activos.filter(f => !f.codigo.startsWith('1.1')).reduce((s,f)=>s+f.saldo,0)} />
          <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold',
            background:'#e8f5e9', padding:'8px 10px', borderRadius:6, fontSize:13 }}>
            <span>TOTAL ACTIVOS</span>
            <span style={{ color:'#27ae60' }}>{$(totalActivos)}</span>
          </div>
        </div>

        <div>
          <div style={{ fontWeight:'bold', background:'#7b241c', color:'white',
            padding:'6px 10px', borderRadius:6, marginBottom:12, fontSize:13 }}>
            PASIVOS Y PATRIMONIO
          </div>
          <Grupo titulo="Pasivos" color="#e74c3c" filas={pasivos} total={totalPasivos} />
          <Grupo titulo="Patrimonio" color="#8e44ad" filas={patrimonio} total={totalPatrimonio} />
          <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold',
            background: cuadra ? '#e8f5e9' : '#fde8e8', padding:'8px 10px', borderRadius:6, fontSize:13 }}>
            <span>TOTAL PAS. + PAT.</span>
            <span style={{ color: cuadra ? '#27ae60' : '#e74c3c' }}>
              {$(totalPasivos + totalPatrimonio)} {cuadra ? '✅' : '❌'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add src/components/contabilidad/reportes/BalanceGeneral.js
git commit -m "feat(reportes): Balance General"
```

---

## Task 5: LibroMayor.js

**Archivo:** `src/components/contabilidad/reportes/LibroMayor.js`

- [ ] **Paso 1: Crear el componente**

```javascript
// src/components/contabilidad/reportes/LibroMayor.js
import React, { useEffect, useState } from 'react';
import {
  getAsientosPorPeriodo, getDetallesConFechaPorAsientos, getCuentasContables,
} from './reporteQueries';

export default function LibroMayor({ fechaDesde, fechaHasta, empresa }) {
  const [cuentas,        setCuentas]        = useState([]);
  const [cuentaSelec,    setCuentaSelec]    = useState('');
  const [movimientos,    setMovimientos]    = useState([]);
  const [cargando,       setCargando]       = useState(false);
  const [cargandoCtas,   setCargandoCtas]   = useState(false);

  useEffect(() => {
    cargarCuentas();
  }, []);

  useEffect(() => {
    if (cuentaSelec && fechaDesde && fechaHasta) cargarMovimientos();
  }, [cuentaSelec, fechaDesde, fechaHasta]);

  async function cargarCuentas() {
    setCargandoCtas(true);
    const ctas = await getCuentasContables();
    setCuentas(ctas);
    setCargandoCtas(false);
  }

  async function cargarMovimientos() {
    setCargando(true);
    try {
      const asientoIds = await getAsientosPorPeriodo(fechaDesde, fechaHasta);
      const detalles   = await getDetallesConFechaPorAsientos(asientoIds);
      const movsCuenta = detalles
        .filter(d => d.cuenta_id === cuentaSelec)
        .sort((a, b) => (a.asiento?.fecha || '').localeCompare(b.asiento?.fecha || ''));
      setMovimientos(movsCuenta);
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }

  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;
  const cuentaObj = cuentas.find(c => c.id === cuentaSelec);
  let saldo = 0;

  return (
    <div id="reporte-imprimible">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>LIBRO MAYOR</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Período: {fechaDesde} al {fechaHasta}</div>
      </div>

      <div className="no-print" style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
          Seleccionar cuenta:
        </label>
        <select value={cuentaSelec} onChange={e => setCuentaSelec(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
            border: '1.5px solid #ddd', fontSize: 13 }}>
          <option value="">— Elegir cuenta —</option>
          {cuentas.map(c => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
          ))}
        </select>
      </div>

      {cuentaObj && (
        <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 12, color: '#1a2a4a' }}>
          {cuentaObj.codigo} — {cuentaObj.nombre}
        </div>
      )}

      {cargando ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>Cargando...</div>
      ) : movimientos.length === 0 && cuentaSelec ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
          Sin movimientos en este período
        </div>
      ) : movimientos.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1a2a4a', color: 'white' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left' }}>Fecha</th>
              <th style={{ padding: '7px 10px', textAlign: 'left' }}>Descripción</th>
              <th style={{ padding: '7px 10px', textAlign: 'right' }}>Debe</th>
              <th style={{ padding: '7px 10px', textAlign: 'right' }}>Haber</th>
              <th style={{ padding: '7px 10px', textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m, i) => {
              saldo += (parseFloat(m.debe || 0) - parseFloat(m.haber || 0));
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #eee',
                  background: i % 2 === 0 ? 'white' : '#f8f9fa' }}>
                  <td style={{ padding: '6px 10px' }}>{m.asiento?.fecha || '—'}</td>
                  <td style={{ padding: '6px 10px', color: '#555' }}>
                    {m.descripcion || m.asiento?.descripcion || '—'}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    {m.debe > 0 ? $(m.debe) : ''}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    {m.haber > 0 ? $(m.haber) : ''}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold',
                    color: saldo >= 0 ? '#27ae60' : '#e74c3c' }}>{$(saldo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add src/components/contabilidad/reportes/LibroMayor.js
git commit -m "feat(reportes): Libro Mayor por cuenta con saldo acumulado"
```

---

## Task 6: TabReportes.js — contenedor principal con período y exportaciones

**Archivo:** `src/components/contabilidad/reportes/TabReportes.js`

- [ ] **Paso 1: Instalar xlsx si no está**

```bash
npm install xlsx
```

- [ ] **Paso 2: Crear TabReportes.js**

```javascript
// src/components/contabilidad/reportes/TabReportes.js
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import EstadoResultados    from './EstadoResultados';
import BalanceGeneral      from './BalanceGeneral';
import LibroMayor          from './LibroMayor';
import BalanceComprobacion from './BalanceComprobacion';

const EMPRESA = 'Embutidos y Jamones Candelaria';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const REPORTES = [
  { id: 'estado_resultados',   label: '📊 Estado de Resultados' },
  { id: 'balance_general',     label: '⚖️ Balance General' },
  { id: 'libro_mayor',         label: '📒 Libro Mayor' },
  { id: 'balance_comprobacion',label: '✅ Balance de Comprobación' },
];

function ultimoDiaMes(mes, año) {
  return new Date(año, mes, 0).toISOString().split('T')[0];
}

export default function TabReportes({ onVolver }) {
  const hoy = new Date();
  const [reporteActivo, setReporteActivo] = useState('estado_resultados');
  const [modoFiltro,    setModoFiltro]    = useState('mes'); // 'mes' | 'rango'
  const [mes,           setMes]           = useState(hoy.getMonth() + 1);
  const [año,           setAño]           = useState(hoy.getFullYear());
  const [desde,         setDesde]         = useState('');
  const [hasta,         setHasta]         = useState('');

  const fechaDesde = modoFiltro === 'mes'
    ? `${año}-${String(mes).padStart(2,'0')}-01`
    : desde;
  const fechaHasta = modoFiltro === 'mes'
    ? ultimoDiaMes(mes, año)
    : hasta;

  function exportarPDF() {
    window.print();
  }

  function exportarExcel() {
    const tabla = document.querySelector('#reporte-imprimible table');
    if (!tabla) { alert('No hay tabla para exportar'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(tabla);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `reporte_${reporteActivo}_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  const componenteProps = { fechaDesde, fechaHasta, fechaHasta, empresa: EMPRESA };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          #reporte-imprimible { margin: 0; padding: 0; }
          body { font-size: 11px; }
        }
      `}</style>

      {/* Header no imprimible */}
      <div className="no-print">
        <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={onVolver} style={{ background:'#f0f2f5', border:'none',
            borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13 }}>
            ← Volver
          </button>
          <div style={{ fontWeight:'bold', fontSize:16, color:'#1a2a4a', flex:1 }}>
            📊 Reportes Contables
          </div>
          <button onClick={exportarPDF} style={{ background:'#e74c3c', color:'white',
            border:'none', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:12 }}>
            📄 PDF
          </button>
          <button onClick={exportarExcel} style={{ background:'#27ae60', color:'white',
            border:'none', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:12 }}>
            📊 Excel
          </button>
        </div>

        {/* Selector de reporte */}
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {REPORTES.map(r => (
            <button key={r.id} onClick={() => setReporteActivo(r.id)} style={{
              padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer',
              background: reporteActivo === r.id ? '#1a2a4a' : '#f0f2f5',
              color: reporteActivo === r.id ? 'white' : '#555',
              fontWeight: reporteActivo === r.id ? 'bold' : 'normal', fontSize:12,
            }}>{r.label}</button>
          ))}
        </div>

        {/* Selector de período */}
        <div style={{ background:'white', borderRadius:10, padding:'14px 16px',
          boxShadow:'0 1px 4px rgba(0,0,0,0.08)', marginBottom:20, display:'flex',
          gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:4 }}>
            {['mes','rango'].map(m => (
              <button key={m} onClick={() => setModoFiltro(m)} style={{
                padding:'6px 12px', borderRadius:6, border:'none', cursor:'pointer',
                background: modoFiltro === m ? '#1a2a4a' : '#f0f2f5',
                color: modoFiltro === m ? 'white' : '#555', fontSize:12,
              }}>{m === 'mes' ? 'Por mes' : 'Rango libre'}</button>
            ))}
          </div>
          {modoFiltro === 'mes' ? (
            <>
              <select value={mes} onChange={e => setMes(Number(e.target.value))}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }}>
                {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={año} onChange={e => setAño(Number(e.target.value))}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }} />
              <span style={{ color:'#888', fontSize:13 }}>al</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }} />
            </>
          )}
        </div>
      </div>

      {/* Reporte activo */}
      <div style={{ background:'white', borderRadius:10, padding:20,
        boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
        {reporteActivo === 'estado_resultados'    && <EstadoResultados    {...componenteProps} />}
        {reporteActivo === 'balance_general'      && <BalanceGeneral      {...componenteProps} />}
        {reporteActivo === 'libro_mayor'          && <LibroMayor          {...componenteProps} />}
        {reporteActivo === 'balance_comprobacion' && <BalanceComprobacion {...componenteProps} />}
      </div>
    </>
  );
}
```

- [ ] **Paso 3: Commit**

```bash
git add src/components/contabilidad/reportes/TabReportes.js
git commit -m "feat(reportes): contenedor principal con período, selector de reporte y exportación"
```

---

## Task 7: App.js — agregar ruta y botón en menú

**Archivo:** `src/App.js`

Contexto: la app usa un estado `pantalla` y una función `navegarA(destino)`. Ya existe la ruta `'libroDiario'`.

- [ ] **Paso 1: Importar TabReportes en App.js**

Agregar el import al inicio de App.js:
```javascript
import TabReportes from './components/contabilidad/reportes/TabReportes';
```

- [ ] **Paso 2: Agregar ruta `reportesContables`**

Buscar el bloque de la ruta `'libroDiario'` (líneas 1065-1071) y agregar un bloque similar después:

```javascript
{pantalla === 'reportesContables' && (
  <TabReportes onVolver={() => navegarA('menuPrincipal')} />
)}
```

- [ ] **Paso 3: Agregar botón en el menú principal**

Buscar el componente `MenuPrincipal` o el bloque donde `pantalla === 'menuPrincipal'` renderiza los botones del menú. Agregar un botón:

```javascript
<button onClick={() => navegarA('reportesContables')}
  style={{ /* mismo estilo que los otros botones del menú */ }}>
  📊 Reportes Contables
</button>
```

- [ ] **Paso 4: Commit y push**

```bash
git add src/App.js
git commit -m "feat(reportes): agregar módulo Reportes Contables al menú y rutas"
git push origin main
```
