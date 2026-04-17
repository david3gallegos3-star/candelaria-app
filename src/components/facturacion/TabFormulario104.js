// ============================================
// TabFormulario104.js
// Reporte IVA mensual — casillas Formulario 104 SRI Ecuador
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export default function TabFormulario104({ mobile }) {
  const now  = new Date();
  const [mes,           setMes]           = useState(now.getMonth());
  const [anio,          setAnio]          = useState(now.getFullYear());
  const [credAnterior,  setCredAnterior]  = useState('');   // casilla 601 — ingreso manual
  const [resultado,     setResultado]     = useState(null);
  const [cargando,      setCargando]      = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    const desde = `${anio}-${String(mes + 1).padStart(2,'0')}-01`;
    const hasta = new Date(anio, mes + 1, 0).toISOString().slice(0, 10); // último día del mes

    const [{ data: facturas }, { data: compras }, { data: notasDebito }] = await Promise.all([
      supabase.from('facturas')
        .select('subtotal, iva, porcentaje_iva, estado')
        .gte('created_at', desde + 'T00:00:00')
        .lte('created_at', hasta + 'T23:59:59')
        .in('estado', ['autorizada', 'borrador']),
      supabase.from('compras')
        .select('subtotal, iva, fecha')
        .gte('fecha', desde)
        .lte('fecha', hasta),
      // notas_debito si existen — ignorar si no hay tabla
      supabase.from('facturas')
        .select('subtotal, iva')
        .gte('created_at', desde + 'T00:00:00')
        .lte('created_at', hasta + 'T23:59:59')
        .eq('estado', 'anulada'),
    ]);

    // ── Ventas ──────────────────────────────────────────────
    const ventasGravadas = (facturas || []).filter(f =>
      (parseFloat(f.porcentaje_iva) || 0) > 0
    );
    const ventasTarifa0  = (facturas || []).filter(f =>
      (parseFloat(f.porcentaje_iva) || 0) === 0
    );

    const c401 = ventasTarifa0.reduce((s, f)  => s + (parseFloat(f.subtotal) || 0), 0); // ventas 0%
    const c411 = ventasGravadas.reduce((s, f) => s + (parseFloat(f.subtotal) || 0), 0); // ventas 15%
    const c451 = ventasGravadas.reduce((s, f) => s + (parseFloat(f.iva)      || 0), 0); // IVA cobrado
    const c431 = c401 + c411; // total ventas

    // Notas crédito / facturas anuladas (reducen ventas)
    const c415 = (notasDebito || []).reduce((s, f) => s + (parseFloat(f.subtotal) || 0), 0);
    const c453 = (notasDebito || []).reduce((s, f) => s + (parseFloat(f.iva)      || 0), 0);

    // ── Compras / adquisiciones ──────────────────────────────
    const comprasConIva = (compras || []).filter(c => (parseFloat(c.iva) || 0) > 0);
    const comprasSinIva = (compras || []).filter(c => (parseFloat(c.iva) || 0) === 0);

    const c500 = comprasSinIva.reduce((s, c) => s + (parseFloat(c.subtotal) || 0), 0); // compras sin IVA
    const c507 = comprasConIva.reduce((s, c) => s + (parseFloat(c.subtotal) || 0), 0); // base compras con IVA
    const c557 = comprasConIva.reduce((s, c) => s + (parseFloat(c.iva)      || 0), 0); // IVA en compras

    const c601 = parseFloat(credAnterior) || 0; // crédito tributario mes anterior

    // ── Liquidación ──────────────────────────────────────────
    const ivaEnVentas   = c451 - c453;               // IVA causado neto
    const creditoTotal  = c557 + c601;               // total crédito tributario
    const c699          = ivaEnVentas - creditoTotal; // > 0 = pagar; < 0 = crédito a favor

    setResultado({
      periodo: `${MESES[mes]} ${anio}`,
      c401, c411, c415, c431,
      c451, c453,
      c500, c507, c557, c601,
      ivaEnVentas, creditoTotal, c699,
      nFacturas: (facturas || []).length,
      nCompras:  (compras  || []).length,
    });
    setCargando(false);
  }, [mes, anio, credAnterior]);

  function exportarCSV() {
    if (!resultado) return;
    const r = resultado;
    const rows = [
      ['FORMULARIO 104 — SRI ECUADOR', '', ''],
      ['Período', r.periodo, ''],
      ['', '', ''],
      ['CASILLA', 'DESCRIPCIÓN', 'VALOR ($)'],
      ['401', 'Ventas locales 0% sin crédito tributario',      r.c401.toFixed(2)],
      ['411', 'Ventas locales gravadas 15%',                    r.c411.toFixed(2)],
      ['415', 'Notas de crédito / facturas anuladas (base)',    r.c415.toFixed(2)],
      ['431', 'Total ventas y otras operaciones',               r.c431.toFixed(2)],
      ['451', 'IVA cobrado en ventas',                          r.c451.toFixed(2)],
      ['453', 'IVA en facturas anuladas / notas crédito',       r.c453.toFixed(2)],
      ['', '', ''],
      ['500', 'Compras netas sin IVA',                          r.c500.toFixed(2)],
      ['507', 'Adquisiciones con derecho a crédito tributario', r.c507.toFixed(2)],
      ['557', 'IVA en adquisiciones',                           r.c557.toFixed(2)],
      ['601', 'Crédito tributario mes anterior',                r.c601.toFixed(2)],
      ['', '', ''],
      ['699', r.c699 >= 0 ? 'IVA A PAGAR' : 'CRÉDITO TRIBUTARIO A FAVOR', Math.abs(r.c699).toFixed(2)],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `F104_${resultado.periodo.replace(' ', '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Estilos ───────────────────────────────────────────────
  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    padding: mobile ? '12px' : '16px', marginBottom: '12px'
  };
  const inputStyle = {
    padding: '7px 10px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  function Fila({ casilla, desc, valor, bold, color, border }) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 12px', borderRadius: '6px',
        background: bold ? '#f0f7ff' : 'transparent',
        borderTop: border ? '1px solid #e0e0e0' : 'none',
        marginBottom: '2px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: '#1e3a6e', color: 'white',
            borderRadius: '5px', padding: '2px 7px',
            fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace',
            minWidth: '34px', textAlign: 'center'
          }}>{casilla}</span>
          <span style={{ fontSize: '12px', color: '#444', fontWeight: bold ? '600' : 'normal' }}>
            {desc}
          </span>
        </div>
        <span style={{
          fontSize: bold ? '14px' : '13px', fontWeight: bold ? 'bold' : 'normal',
          color: color || '#333', fontFamily: 'monospace', minWidth: '80px', textAlign: 'right'
        }}>
          ${(valor || 0).toFixed(2)}
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
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: 3, fontWeight: 600 }}>
            Casilla 601 — Crédito mes anterior ($)
          </div>
          <input type="number" min="0" step="0.01"
            value={credAnterior}
            onChange={e => setCredAnterior(e.target.value)}
            placeholder="0.00"
            style={{ ...inputStyle, width: '110px' }} />
        </div>
        <button onClick={analizar} disabled={cargando} style={{
          background: cargando ? '#aaa' : 'linear-gradient(135deg,#1a2a4a,#1e3a6e)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 18px', cursor: cargando ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {cargando ? '⏳ Calculando...' : '🔍 Generar F-104'}
        </button>
        {resultado && (
          <button onClick={exportarCSV} style={{
            background: '#27ae60', color: 'white', border: 'none',
            borderRadius: '8px', padding: '9px 16px',
            cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
          }}>📥 Exportar CSV</button>
        )}
      </div>

      {/* Formulario 104 */}
      {resultado && (
        <>
          {/* Encabezado */}
          <div style={{
            ...card,
            background: 'linear-gradient(135deg,#1a2a4a,#1e3a6e)',
            color: 'white', textAlign: 'center', padding: '14px'
          }}>
            <div style={{ fontSize: '11px', opacity: 0.8, letterSpacing: '1px' }}>
              SERVICIO DE RENTAS INTERNAS — ECUADOR
            </div>
            <div style={{ fontSize: mobile ? '15px' : '18px', fontWeight: 'bold', margin: '4px 0' }}>
              FORMULARIO 104 — DECLARACIÓN DE IVA
            </div>
            <div style={{ fontSize: '13px', opacity: 0.9 }}>
              Período: {resultado.periodo}
              &nbsp;·&nbsp;
              {resultado.nFacturas} facturas · {resultado.nCompras} compras
            </div>
          </div>

          {/* Sección A — Ventas */}
          <div style={card}>
            <div style={{
              fontWeight: 'bold', fontSize: '12px', color: '#1e3a6e',
              letterSpacing: '0.5px', marginBottom: '10px',
              borderBottom: '2px solid #1e3a6e', paddingBottom: '6px'
            }}>
              A. VENTAS Y OTRAS OPERACIONES
            </div>
            <Fila casilla="401" desc="Ventas locales gravadas con tarifa 0% (sin crédito)"   valor={resultado.c401} />
            <Fila casilla="411" desc="Ventas locales gravadas con tarifa 15%"                 valor={resultado.c411} />
            {resultado.c415 > 0 && (
              <Fila casilla="415" desc="Notas de crédito / facturas anuladas (base)"          valor={resultado.c415} color="#e74c3c" />
            )}
            <Fila casilla="431" desc="TOTAL VENTAS Y OTRAS OPERACIONES"                       valor={resultado.c431} bold />
            <div style={{ height: 8 }} />
            <Fila casilla="451" desc="IVA cobrado en ventas (tarifa 15%)"                     valor={resultado.c451} color="#2980b9" />
            {resultado.c453 > 0 && (
              <Fila casilla="453" desc="IVA en facturas anuladas / notas crédito"             valor={resultado.c453} color="#e74c3c" />
            )}
          </div>

          {/* Sección B — Adquisiciones */}
          <div style={card}>
            <div style={{
              fontWeight: 'bold', fontSize: '12px', color: '#1e3a6e',
              letterSpacing: '0.5px', marginBottom: '10px',
              borderBottom: '2px solid #1e3a6e', paddingBottom: '6px'
            }}>
              B. ADQUISICIONES Y PAGOS
            </div>
            {resultado.c500 > 0 && (
              <Fila casilla="500" desc="Compras netas locales sin IVA"                        valor={resultado.c500} />
            )}
            <Fila casilla="507" desc="Adquisiciones con derecho a crédito tributario (base)"  valor={resultado.c507} />
            <Fila casilla="557" desc="IVA en adquisiciones"                                   valor={resultado.c557} color="#8e44ad" />
            <Fila casilla="601" desc="Crédito tributario mes anterior"                        valor={resultado.c601} color="#f39c12" />
          </div>

          {/* Sección C — Liquidación */}
          <div style={card}>
            <div style={{
              fontWeight: 'bold', fontSize: '12px', color: '#1e3a6e',
              letterSpacing: '0.5px', marginBottom: '10px',
              borderBottom: '2px solid #1e3a6e', paddingBottom: '6px'
            }}>
              C. LIQUIDACIÓN DEL IMPUESTO AL VALOR AGREGADO
            </div>
            <Fila casilla="—" desc="IVA causado en ventas (451 − 453)"                       valor={resultado.ivaEnVentas} color="#2980b9" />
            <Fila casilla="—" desc="Total crédito tributario (557 + 601)"                    valor={resultado.creditoTotal} color="#8e44ad" />
            <div style={{ height: 6 }} />
            <div style={{
              padding: '14px 16px', borderRadius: '10px',
              background: resultado.c699 >= 0
                ? 'linear-gradient(135deg,#e74c3c,#c0392b)'
                : 'linear-gradient(135deg,#27ae60,#1e8449)',
              color: 'white', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: 2 }}>CASILLA 699</div>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                  {resultado.c699 >= 0
                    ? '⚠️ IVA A PAGAR AL SRI'
                    : '✅ CRÉDITO TRIBUTARIO A FAVOR'}
                </div>
              </div>
              <div style={{ fontSize: mobile ? '24px' : '30px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                ${Math.abs(resultado.c699).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Nota informativa */}
          <div style={{
            background: '#fff8e1', border: '1px solid #f39c12',
            borderRadius: '10px', padding: '10px 14px',
            fontSize: '12px', color: '#7d5f00'
          }}>
            ℹ️ Este formulario es informativo. Los valores provienen de facturas emitidas y compras
            registradas en el sistema. Verifica con tu contadora antes de presentar al SRI.
            Las casillas 402–410, 412–414, y las de retenciones (800+) deben completarse manualmente.
          </div>
        </>
      )}
    </div>
  );
}
