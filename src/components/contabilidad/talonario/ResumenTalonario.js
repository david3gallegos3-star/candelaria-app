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
    const periodo = `${año}-${String(mes).padStart(2,'0')}`;
    const [
      { data: facturas },
      { data: cobros },
      { data: cajas },
      { data: compras },
      { data: nomina },
      { data: pagosB },
      { data: pagosP },
      { data: otrosI },
      { data: cxc },
      { data: config },
    ] = await Promise.all([
      supabase.from('facturas').select('total').gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59').neq('estado', 'anulada'),
      supabase.from('cobros').select('id,fecha,monto,forma_pago,observaciones,clientes(nombre),facturas(numero)').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('caja_chica').select('id').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('compras').select('total,tiene_factura').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('nomina').select('sueldo_prop,iess_patronal').eq('periodo', periodo),
      supabase.from('talonario_pagos_banco').select('id,fecha,monto,descripcion,banco').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_personales').select('monto,categoria').eq('mes', mes).eq('año', año),
      supabase.from('talonario_otros_ingresos').select('id,fecha,monto,descripcion,empresa,forma_pago').eq('mes', mes).eq('año', año),
      supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').in('estado', ['pendiente', 'parcial']),
      supabase.from('config_contabilidad').select('valor').eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
    ]);

    const cajaIds = (cajas || []).map(c => c.id);
    const { data: gastos } = cajaIds.length > 0
      ? await supabase.from('caja_gastos').select('valor').in('caja_id', cajaIds)
      : { data: [] };

    const totalVentas    = suma(facturas || [], 'total');
    const totalOtrosI    = suma(otrosI   || [], 'monto');
    const totalGastos    = suma(gastos   || [], 'valor');
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

    // Movimientos banco detallados
    const cobrosTransfDet = (cobros||[]).filter(c => ['transferencia','deposito'].includes(c.forma_pago));
    const otrosIngBancoDet = (otrosI||[]).filter(o => o.forma_pago !== '01');
    const otrosIngBancoTotal = otrosIngBancoDet.reduce((s,o) => s + parseFloat(o.monto||0), 0);
    const saldoCalculadoBanco = cobroTransf + otrosIngBancoTotal - totalPagosB;

    // Tabla movimientos banco: entradas y salidas ordenadas por fecha
    const movsBanco = [
      ...cobrosTransfDet.map(c => ({
        fecha: c.fecha, tipo: 'entrada',
        descripcion: `Cobro ${c.forma_pago} — ${c.clientes?.nombre || c.facturas?.numero || ''}`,
        monto: parseFloat(c.monto||0),
      })),
      ...otrosIngBancoDet.map(o => ({
        fecha: o.fecha || '', tipo: 'entrada',
        descripcion: `Otro ingreso — ${o.descripcion || o.empresa || ''}`,
        monto: parseFloat(o.monto||0),
      })),
      ...(pagosB||[]).map(p => ({
        fecha: p.fecha || '', tipo: 'salida',
        descripcion: `Pago banco — ${p.descripcion || p.banco || ''}`,
        monto: parseFloat(p.monto||0),
      })),
    ].sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));

    setSaldoBanco(config?.valor?.saldo || '');
    setDatos({ totalVentas, totalOtrosI, totalGastos, comprasCon, comprasSin,
      totalSueldos, totalIess, totalPagosB, totalPagosP,
      cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
      cxcPendiente, saldoCalculadoBanco, movsBanco });
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
    cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
    cxcPendiente, saldoCalculadoBanco, movsBanco,
  } = datos;

  const totalIngMes  = totalVentas + totalOtrosI;
  const totalEgrMes  = totalGastos + comprasCon + comprasSin + totalSueldos + totalIess + totalPagosB + totalPagosP;
  const utilidadBruta= totalIngMes - totalEgrMes;

  const totalIngCons = cobroEfect + cobroCheq + cobroTransf + totalOtrosI;
  const totalEgrCons = totalGastos + totalPagosB + pagosPrestTarj + pagosGastPers;

  const $ = v => `$${parseFloat(v||0).toFixed(2)}`;
  const fila = (label, valor, color) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12 }}>
      <span>{label}</span>
      <span style={{ color: color || '#333', fontWeight: color ? 'bold' : 'normal' }}>{$(valor)}</span>
    </div>
  );
  const totalRow = (label, valor, bg) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0',
      borderTop:'1px solid #eee', marginTop:4, fontWeight:'bold', fontSize:12 }}>
      <span>{label}</span>
      <span style={{ background: bg, color: 'white', padding:'1px 8px', borderRadius:4 }}>{$(valor)}</span>
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

          {/* Saldo banco calculado vs real */}
          <div style={{ marginTop:10, background:'#f0f2f5', borderRadius:6, overflow:'hidden', fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderBottom:'1px solid #ddd' }}>
              <span style={{ color:'#555' }}>💳 Saldo banco calculado (mes)</span>
              <span style={{ fontWeight:'bold', color: saldoCalculadoBanco >= 0 ? '#27ae60' : '#e74c3c' }}>
                ${parseFloat(saldoCalculadoBanco||0).toFixed(2)}
              </span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderBottom:'1px solid #ddd', background:'#1a2a4a' }}>
              <span style={{ color:'#aaa' }}>💳 Saldo banco real</span>
              {editandoSaldo ? (
                <div style={{ display:'flex', gap:6 }}>
                  <input type="number" value={saldoBanco} onChange={e => setSaldoBanco(e.target.value)}
                    style={{ width:100, padding:'3px 6px', borderRadius:4, border:'none', fontSize:12 }} />
                  <button onClick={() => guardarSaldo(saldoBanco)}
                    style={{ background:'#27ae60', color:'white', border:'none', borderRadius:4,
                      padding:'3px 8px', cursor:'pointer', fontSize:11 }}>✓</button>
                </div>
              ) : (
                <span onClick={() => setEditandoSaldo(true)}
                  style={{ fontWeight:'bold', color:'white', cursor:'pointer' }}>
                  {saldoBanco ? `$${parseFloat(saldoBanco).toFixed(2)}` : '✏️ Ingresar'}
                </span>
              )}
            </div>
            {saldoBanco && (
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px',
                background: Math.abs(parseFloat(saldoBanco) - saldoCalculadoBanco) < 0.01 ? '#e8f5e9' : '#fde8e8' }}>
                <span style={{ color:'#555' }}>Diferencia</span>
                <span style={{ fontWeight:'bold', color: Math.abs(parseFloat(saldoBanco) - saldoCalculadoBanco) < 0.01 ? '#27ae60' : '#e74c3c' }}>
                  {Math.abs(parseFloat(saldoBanco) - saldoCalculadoBanco) < 0.01
                    ? '✓ Cuadra'
                    : `${(parseFloat(saldoBanco) - saldoCalculadoBanco) > 0 ? '+' : ''}$${(parseFloat(saldoBanco) - saldoCalculadoBanco).toFixed(2)}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Tabla movimientos banco */}
      {movsBanco.length > 0 && (
        <div style={{ gridColumn:'1/-1', border:'2px solid #2980b9', borderRadius:10, overflow:'hidden', marginTop:4 }}>
          <div style={{ background:'#2980b9', color:'white', padding:'8px 14px', fontWeight:'bold', fontSize:13 }}>
            🏦 Movimientos Banco — {MESES[mes-1]} {año}
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f0f2f5', fontSize:11, fontWeight:'bold', color:'#555' }}>
                <th style={{ padding:'6px 12px', textAlign:'left' }}>FECHA</th>
                <th style={{ padding:'6px 12px', textAlign:'left' }}>DESCRIPCIÓN</th>
                <th style={{ padding:'6px 12px', textAlign:'right', color:'#27ae60' }}>ENTRADA (+)</th>
                <th style={{ padding:'6px 12px', textAlign:'right', color:'#e74c3c' }}>SALIDA (-)</th>
              </tr>
            </thead>
            <tbody>
              {movsBanco.map((m, i) => {
                const [y,mo,d] = (m.fecha||'').split('-');
                const fmtF = m.fecha ? `${parseInt(d)}/${parseInt(mo)}/${y}` : '—';
                return (
                  <tr key={i} style={{ borderTop:'1px solid #f0f0f0', fontSize:12 }}>
                    <td style={{ padding:'5px 12px', color:'#888' }}>{fmtF}</td>
                    <td style={{ padding:'5px 12px', color:'#333' }}>{m.descripcion}</td>
                    <td style={{ padding:'5px 12px', textAlign:'right', color:'#27ae60', fontWeight:'bold' }}>
                      {m.tipo === 'entrada' ? `$${m.monto.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding:'5px 12px', textAlign:'right', color:'#e74c3c', fontWeight:'bold' }}>
                      {m.tipo === 'salida' ? `$${m.monto.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#1a2a4a', color:'white', fontWeight:'bold', fontSize:12 }}>
                <td colSpan={2} style={{ padding:'6px 12px' }}>TOTAL MES</td>
                <td style={{ padding:'6px 12px', textAlign:'right', color:'#4ade80' }}>
                  ${movsBanco.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.monto,0).toFixed(2)}
                </td>
                <td style={{ padding:'6px 12px', textAlign:'right', color:'#f87171' }}>
                  ${movsBanco.filter(m=>m.tipo==='salida').reduce((s,m)=>s+m.monto,0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

    </div>
  );
}
