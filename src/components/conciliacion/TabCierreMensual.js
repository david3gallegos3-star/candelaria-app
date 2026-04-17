// ============================================
// TabCierreMensual.js
// Cierre mensual unificado — resumen ejecutivo
// Ventas · Compras · Nómina · Producción · IVA
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export default function TabCierreMensual({ mobile }) {
  const now  = new Date();
  const [mes,       setMes]       = useState(now.getMonth());
  const [anio,      setAnio]      = useState(now.getFullYear());
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const generar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    const desde = `${anio}-${String(mes + 1).padStart(2,'0')}-01`;
    const hasta = new Date(anio, mes + 1, 0).toISOString().slice(0, 10);
    const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;

    const [
      { data: facturas },
      { data: compras },
      { data: nomina },
      { data: cierresProduccion },
      { data: cxcPend },
      { data: cxpPend },
    ] = await Promise.all([
      supabase.from('facturas')
        .select('subtotal, iva, total, estado')
        .gte('created_at', desde + 'T00:00:00')
        .lte('created_at', hasta + 'T23:59:59')
        .in('estado', ['autorizada', 'borrador']),
      supabase.from('compras')
        .select('subtotal, iva, total, fecha')
        .gte('fecha', desde)
        .lte('fecha', hasta),
      supabase.from('nomina')
        .select('sueldo_prop, iess_empleado, iess_patronal, costo_patronal, sueldo_neto')
        .eq('periodo', periodoStr),
      supabase.from('cierres_produccion')
        .select('kg_producidos_reales, producto_nombre, fecha')
        .gte('fecha', desde)
        .lte('fecha', hasta),
      supabase.from('cuentas_cobrar')
        .select('monto_total, monto_cobrado, estado')
        .eq('estado', 'pendiente'),
      supabase.from('cuentas_pagar')
        .select('monto_total, monto_pagado, estado')
        .eq('estado', 'pendiente'),
    ]);

    // ── Ventas ──────────────────────────────────────────────
    const ventasSubtotal = (facturas || []).reduce((s, f) => s + (parseFloat(f.subtotal) || 0), 0);
    const ventasIVA      = (facturas || []).reduce((s, f) => s + (parseFloat(f.iva)      || 0), 0);
    const ventasTotal    = (facturas || []).reduce((s, f) => s + (parseFloat(f.total)    || 0), 0);
    const nFacturas      = (facturas || []).length;

    // ── Compras ─────────────────────────────────────────────
    const comprasSubtotal = (compras || []).reduce((s, c) => s + (parseFloat(c.subtotal) || 0), 0);
    const comprasIVA      = (compras || []).reduce((s, c) => s + (parseFloat(c.iva)      || 0), 0);
    const comprasTotal    = (compras || []).reduce((s, c) => s + (parseFloat(c.total)    || 0), 0);
    const nCompras        = (compras || []).length;

    // ── Nómina ───────────────────────────────────────────────
    const nominaTotal     = (nomina || []).reduce((s, n) => s + (parseFloat(n.costo_patronal) || 0), 0);
    const nominaNeto      = (nomina || []).reduce((s, n) => s + (parseFloat(n.sueldo_neto)    || 0), 0);
    const nominaIESSTotal = (nomina || []).reduce((s, n) =>
      s + (parseFloat(n.iess_empleado) || 0) + (parseFloat(n.iess_patronal) || 0), 0);
    const nEmpleados      = (nomina || []).length;

    // ── Producción ───────────────────────────────────────────
    const kgProducidos = (cierresProduccion || []).reduce((s, c) =>
      s + (parseFloat(c.kg_producidos_reales) || 0), 0);
    const productosUnicos = [...new Set((cierresProduccion || []).map(c => c.producto_nombre))];
    const nCierres = (cierresProduccion || []).length;

    // ── IVA a pagar ──────────────────────────────────────────
    const ivaPagar = ventasIVA - comprasIVA;

    // ── Cuentas pendientes ───────────────────────────────────
    const xCobrar = (cxcPend || []).reduce((s, c) =>
      s + (parseFloat(c.monto_total) || 0) - (parseFloat(c.monto_cobrado) || 0), 0);
    const xPagar  = (cxpPend || []).reduce((s, c) =>
      s + (parseFloat(c.monto_total) || 0) - (parseFloat(c.monto_pagado)  || 0), 0);

    // ── Margen bruto estimado ────────────────────────────────
    const margenBruto = ventasSubtotal - comprasSubtotal - nominaTotal;
    const margenPct   = ventasSubtotal > 0
      ? ((margenBruto / ventasSubtotal) * 100).toFixed(1)
      : '0.0';

    setResultado({
      periodo: `${MESES[mes]} ${anio}`,
      ventas:     { subtotal: ventasSubtotal, iva: ventasIVA, total: ventasTotal, n: nFacturas },
      compras:    { subtotal: comprasSubtotal, iva: comprasIVA, total: comprasTotal, n: nCompras },
      nomina:     { total: nominaTotal, neto: nominaNeto, iess: nominaIESSTotal, n: nEmpleados },
      produccion: { kg: kgProducidos, productos: productosUnicos, n: nCierres },
      ivaPagar,
      xCobrar, xPagar,
      margenBruto, margenPct,
    });
    setCargando(false);
  }, [mes, anio]);

  function exportarPDF() {
    if (!resultado) return;
    const r = resultado;
    window.print();
  }

  function exportarCSV() {
    if (!resultado) return;
    const r = resultado;
    const rows = [
      ['CIERRE MENSUAL — EMBUTIDOS CANDELARIA', '', ''],
      ['Período', r.periodo, ''],
      ['', '', ''],
      ['SECCIÓN', 'DESCRIPCIÓN', 'VALOR ($)'],
      ['VENTAS', `${r.ventas.n} facturas`,               ''],
      ['',       'Base imponible',                        r.ventas.subtotal.toFixed(2)],
      ['',       'IVA cobrado',                           r.ventas.iva.toFixed(2)],
      ['',       'TOTAL VENTAS',                          r.ventas.total.toFixed(2)],
      ['', '', ''],
      ['COMPRAS', `${r.compras.n} compras`,               ''],
      ['',        'Base imponible',                        r.compras.subtotal.toFixed(2)],
      ['',        'IVA pagado',                            r.compras.iva.toFixed(2)],
      ['',        'TOTAL COMPRAS',                         r.compras.total.toFixed(2)],
      ['', '', ''],
      ['NÓMINA', `${r.nomina.n} empleados`,               ''],
      ['',       'Sueldos neto',                           r.nomina.neto.toFixed(2)],
      ['',       'IESS (emp + pat)',                       r.nomina.iess.toFixed(2)],
      ['',       'COSTO PATRONAL TOTAL',                   r.nomina.total.toFixed(2)],
      ['', '', ''],
      ['PRODUCCIÓN', `${r.produccion.n} cierres`,         ''],
      ['',           'Kg producidos',                     r.produccion.kg.toFixed(1)],
      ['',           'Productos',                         r.produccion.productos.join(', ')],
      ['', '', ''],
      ['IVA', 'IVA ventas − IVA compras',                 r.ivaPagar.toFixed(2)],
      ['COBRAR', 'Cuentas por cobrar pendientes',         r.xCobrar.toFixed(2)],
      ['PAGAR',  'Cuentas por pagar pendientes',          r.xPagar.toFixed(2)],
      ['', '', ''],
      ['MARGEN BRUTO', `${r.margenPct}%`,                 r.margenBruto.toFixed(2)],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `CierreMensual_${resultado.periodo.replace(' ','_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    padding: mobile ? '12px' : '16px', marginBottom: '12px'
  };
  const inputStyle = {
    padding: '7px 10px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  function Bloque({ titulo, emoji, children }) {
    return (
      <div style={card}>
        <div style={{
          fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a',
          borderBottom: '2px solid #e0e0e0', paddingBottom: '8px', marginBottom: '12px'
        }}>
          {emoji} {titulo}
        </div>
        {children}
      </div>
    );
  }

  function Fila({ label, valor, color, bold }) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '5px 0', fontSize: bold ? '14px' : '13px',
        fontWeight: bold ? 'bold' : 'normal',
        color: color || '#444',
        borderBottom: '1px solid #f5f5f5'
      }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'monospace' }}>
          {typeof valor === 'number' ? `$${valor.toFixed(2)}` : valor}
        </span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>

      {/* Controles */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: 3, fontWeight: 600 }}>Mes</div>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inputStyle}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: 3, fontWeight: 600 }}>Año</div>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px' }} />
        </div>
        <button onClick={generar} disabled={cargando} style={{
          background: cargando ? '#aaa' : 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 18px', cursor: cargando ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {cargando ? '⏳ Generando...' : '📋 Generar cierre'}
        </button>
        {resultado && (
          <button onClick={exportarCSV} style={{
            background: '#27ae60', color: 'white', border: 'none',
            borderRadius: '8px', padding: '9px 16px',
            cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
          }}>📥 Exportar CSV</button>
        )}
      </div>

      {resultado && (
        <>
          {/* Encabezado */}
          <div style={{
            ...card,
            background: 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
            color: 'white', textAlign: 'center', padding: '16px'
          }}>
            <div style={{ fontSize: '11px', opacity: 0.8, letterSpacing: '1px' }}>
              EMBUTIDOS CANDELARIA — CIERRE MENSUAL
            </div>
            <div style={{ fontSize: mobile ? '17px' : '22px', fontWeight: 'bold', margin: '4px 0' }}>
              {resultado.periodo}
            </div>
          </div>

          {/* KPIs principales */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: '8px', marginBottom: '12px'
          }}>
            {[
              { label: 'Ventas totales',    valor: resultado.ventas.total,    color: '#27ae60' },
              { label: 'Compras totales',   valor: resultado.compras.total,   color: '#e74c3c' },
              { label: 'Costo nómina',      valor: resultado.nomina.total,    color: '#8e44ad' },
              { label: 'Margen bruto',
                valor: `${resultado.margenPct}%`,
                color: resultado.margenBruto >= 0 ? '#27ae60' : '#e74c3c',
                esTexto: true },
            ].map(r => (
              <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: mobile ? '14px' : '17px', fontWeight: 'bold', color: r.color }}>
                  {r.esTexto ? r.valor : `$${r.valor.toFixed(2)}`}
                </div>
              </div>
            ))}
          </div>

          {/* Ventas */}
          <Bloque titulo={`Ventas — ${resultado.ventas.n} facturas`} emoji="🧾">
            <Fila label="Base imponible"     valor={resultado.ventas.subtotal} color="#333" />
            <Fila label="IVA cobrado (15%)"  valor={resultado.ventas.iva}      color="#2980b9" />
            <Fila label="TOTAL VENTAS"       valor={resultado.ventas.total}    color="#27ae60" bold />
          </Bloque>

          {/* Compras */}
          <Bloque titulo={`Compras — ${resultado.compras.n} compras`} emoji="📦">
            <Fila label="Base imponible"     valor={resultado.compras.subtotal} color="#333" />
            <Fila label="IVA pagado"         valor={resultado.compras.iva}      color="#8e44ad" />
            <Fila label="TOTAL COMPRAS"      valor={resultado.compras.total}    color="#e74c3c" bold />
          </Bloque>

          {/* Nómina */}
          <Bloque titulo={`Nómina — ${resultado.nomina.n} empleados`} emoji="👥">
            <Fila label="Sueldos netos a pagar"  valor={resultado.nomina.neto}  color="#333" />
            <Fila label="IESS empleado + patronal" valor={resultado.nomina.iess} color="#8e44ad" />
            <Fila label="COSTO PATRONAL TOTAL"   valor={resultado.nomina.total} color="#2c1a4a" bold />
          </Bloque>

          {/* Producción */}
          <Bloque titulo={`Producción — ${resultado.produccion.n} cierres`} emoji="🏭">
            <Fila label="Kg producidos"  valor={`${resultado.produccion.kg.toFixed(1)} kg`} color="#333" />
            <Fila label="Productos"
              valor={resultado.produccion.productos.length > 0
                ? resultado.produccion.productos.join(', ')
                : '—'}
              color="#555" />
          </Bloque>

          {/* IVA y cuentas pendientes */}
          <Bloque titulo="Fiscal y pendientes" emoji="📊">
            <Fila label="IVA a pagar al SRI (ventas − compras)"
              valor={resultado.ivaPagar}
              color={resultado.ivaPagar >= 0 ? '#e74c3c' : '#27ae60'} bold />
            <Fila label="Cuentas por cobrar pendientes"
              valor={resultado.xCobrar}
              color={resultado.xCobrar > 0 ? '#f39c12' : '#27ae60'} />
            <Fila label="Cuentas por pagar pendientes"
              valor={resultado.xPagar}
              color={resultado.xPagar > 0 ? '#e74c3c' : '#27ae60'} />
          </Bloque>

          {/* Resultado final */}
          <div style={{
            ...card,
            background: resultado.margenBruto >= 0
              ? 'linear-gradient(135deg,#27ae60,#1e8449)'
              : 'linear-gradient(135deg,#e74c3c,#c0392b)',
            color: 'white',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px'
          }}>
            <div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>MARGEN BRUTO ESTIMADO</div>
              <div style={{ fontSize: '12px', opacity: 0.75, marginTop: 2 }}>
                Ventas − Compras − Nómina
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: mobile ? '22px' : '28px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                ${resultado.margenBruto.toFixed(2)}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>{resultado.margenPct}%</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
