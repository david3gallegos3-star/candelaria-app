// src/components/contabilidad/talonario/ResumenTalonario.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabase';
import { useTalonario } from './TalonarioContext';
import { calcularNetoBancoMes, calcularSaldoCalculado, calcularDiferencia } from '../../../utils/saldoBanco';

function suma(arr, campo) {
  return arr.reduce((s, r) => s + parseFloat(r[campo] || 0), 0);
}

export default function ResumenTalonario() {
  const { mes, año, fechaDesde, fechaHasta, MESES, esAdminContador } = useTalonario();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [saldoBanco, setSaldoBanco] = useState('');

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
      supabase.from('facturas').select('total,forma_pago').gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59').neq('estado', 'anulada'),
      supabase.from('cobros').select('id,fecha,monto,forma_pago,observaciones,clientes(nombre),facturas(numero)').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('caja_chica').select('id').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('compras').select('total,comision,tiene_factura,forma_pago,es_personal').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('nomina').select('sueldo_prop,iess_patronal').eq('periodo', periodo),
      supabase.from('talonario_pagos_banco').select('id,fecha,monto,concepto,beneficiario').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_personales').select('monto,categoria').eq('mes', mes).eq('año', año),
      supabase.from('talonario_otros_ingresos').select('id,fecha,monto,descripcion,empresa,forma_pago').eq('mes', mes).eq('año', año),
      supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').in('estado', ['pendiente', 'parcial']),
      supabase.from('config_contabilidad').select('valor').eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
    ]);

    const cajaIds = (cajas || []).map(c => c.id);
    const [{ data: gastos }, { data: entregas }] = cajaIds.length > 0
      ? await Promise.all([
          supabase.from('caja_gastos').select('valor,es_personal').in('caja_id', cajaIds),
          supabase.from('caja_entregas').select('cantidad').in('caja_id', cajaIds),
        ])
      : [{ data: [] }, { data: [] }];

    const totalVentas    = suma(facturas || [], 'total');
    const totalOtrosI    = suma(otrosI   || [], 'monto');
    const totalGastos    = suma((gastos||[]).filter(g => !g.es_personal), 'valor');
    const gastosPersonalesCaja = suma((gastos||[]).filter(g => g.es_personal), 'valor');
    const comprasCon     = (compras || []).filter(c =>  c.tiene_factura && !c.es_personal).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const comprasSin     = (compras || []).filter(c => !c.tiene_factura && !c.es_personal).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const totalComprasPersonales    = suma((compras||[]).filter(c => c.es_personal), 'total');
    const comprasPersonalesPagadas  = suma((compras||[]).filter(c => c.es_personal && c.forma_pago !== 'credito'), 'total');
    const totalSueldos   = suma(nomina   || [], 'sueldo_prop');
    const totalIess      = suma(nomina   || [], 'iess_patronal');
    const totalPagosB    = suma(pagosB   || [], 'monto');
    const totalPagosP    = suma(pagosP   || [], 'monto');
    const pagosPrestTarj = (pagosP || []).filter(p => ['prestamos','tarjetas'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const pagosGastPers  = (pagosP || []).filter(p => ['gastos_personal','otros'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);

    const cobroEfect = (cobros||[]).filter(c => c.forma_pago==='efectivo').reduce((s,c) => s+parseFloat(c.monto||0), 0);
    const cobroCheq  = (cobros||[]).filter(c => c.forma_pago==='cheque').reduce((s,c) => s+parseFloat(c.monto||0), 0);
    const cobroTransf= (cobros||[]).filter(c => ['transferencia','deposito','tarjeta_credito'].includes(c.forma_pago)).reduce((s,c) => s+parseFloat(c.monto||0), 0);

    const cxcPendiente = (cxc||[]).reduce((s,c) => s + parseFloat(c.monto_total||0) - parseFloat(c.monto_cobrado||0), 0);

    // Movimientos banco detallados
    const cobrosTransfDet = (cobros||[]).filter(c => ['transferencia','deposito'].includes(c.forma_pago));
    const otrosIngBancoDet = (otrosI||[]).filter(o => o.forma_pago !== '01');
    const otrosIngBancoTotal = otrosIngBancoDet.reduce((s,o) => s + parseFloat(o.monto||0), 0);
    const ventasBancoTotal  = (facturas||[]).filter(f => ['transferencia','cheque'].includes(f.forma_pago)).reduce((s,f) => s + parseFloat(f.total||0), 0);
    const comprasBancoTotal = (compras||[]).filter(c => ['transferencia','cheque','deposito'].includes(c.forma_pago) && !c.es_personal).reduce((s,c) => s + parseFloat(c.total||0) + parseFloat(c.comision||0), 0);
    const totalEntregasCaja = suma(entregas || [], 'cantidad');
    const { neto: netoBancoMes } = await calcularNetoBancoMes(año, mes);
    const { saldoCalculado, pendienteInicial } = await calcularSaldoCalculado(año, mes, netoBancoMes);

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
        descripcion: `Pago banco — ${p.concepto || p.beneficiario || ''}`,
        monto: parseFloat(p.monto||0),
      })),
    ].sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));

    setSaldoBanco(config?.valor?.saldo || '');
    setDatos({ totalVentas, totalOtrosI, totalGastos, comprasCon, comprasSin,
      totalSueldos, totalIess, totalPagosB, totalPagosP,
      cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
      gastosPersonalesCaja, totalComprasPersonales, comprasPersonalesPagadas,
      comprasBancoTotal,
      cxcPendiente, saldoCalculado, pendienteInicial, movsBanco });
    setCargando(false);
  }


  if (cargando || !datos) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando resumen...</div>;

  const {
    totalVentas, totalOtrosI, totalGastos, comprasCon, comprasSin,
    totalSueldos, totalIess, totalPagosB, totalPagosP,
    cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
    gastosPersonalesCaja, totalComprasPersonales, comprasPersonalesPagadas,
    comprasBancoTotal,
    cxcPendiente, saldoCalculado, pendienteInicial, movsBanco,
  } = datos;

  const { dif, cuadra, color: difColor } = calcularDiferencia(saldoBanco, saldoCalculado);

  const totalIngMes  = totalVentas + totalOtrosI;
  const totalPagosPersonalesTotal = totalPagosP + gastosPersonalesCaja + totalComprasPersonales;
  const totalEgrMes  = totalGastos + comprasCon + comprasSin + totalSueldos + totalIess + totalPagosB + totalPagosPersonalesTotal;
  const utilidadBruta= totalIngMes - totalEgrMes;

  const totalIngCons = cobroEfect + cobroCheq + cobroTransf + totalOtrosI;
  const pagosGastPersTotal = pagosGastPers + gastosPersonalesCaja + comprasPersonalesPagadas;
  const totalEgrCons = totalGastos + totalPagosB + comprasBancoTotal + pagosPrestTarj + pagosGastPersTotal;

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
          {fila('(-) Pagos personales', totalPagosPersonalesTotal, '#e74c3c')}
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
          {fila('(-) Pagos con banco', totalPagosB + comprasBancoTotal, '#e74c3c')}
          {fila('(-) Tarjetas/préstamos', pagosPrestTarj, '#e74c3c')}
          {fila('(-) Gastos personales', pagosGastPersTotal, '#e74c3c')}
          {totalRow('TOTAL', totalEgrCons, '#e74c3c')}

          {titulo('ACTIVOS', '#555')}
          {fila('(+) Cuentas por cobrar', cxcPendiente, '#27ae60')}
          {fila('(-) Cuentas por pagar', 0, '#e74c3c')}

          {/* Saldo banco calculado vs real */}
          <div style={{ marginTop:10, background:'#f0f2f5', borderRadius:6, overflow:'hidden', fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderBottom:'1px solid #ddd' }}>
              <span style={{ color:'#555' }}>💳 Saldo banco calculado</span>
              <span style={{ fontWeight:'bold', color: saldoCalculado >= 0 ? '#27ae60' : '#e74c3c' }}>
                ${parseFloat(saldoCalculado||0).toFixed(2)}
              </span>
            </div>
            {pendienteInicial && (
              <div style={{ padding:'4px 10px', fontSize:10, color:'#e67e22', background:'#fdf0e3' }}>
                ⚠️ Pendiente configurar Asiento Inicial (Libro Diario)
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderBottom:'1px solid #ddd', background:'#1a2a4a' }}>
              <span style={{ color:'#aaa' }}>💳 Saldo banco real</span>
              <span style={{ fontWeight:'bold', color:'white' }}>
                ${saldoBanco ? parseFloat(saldoBanco).toFixed(2) : '0.00'}
              </span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px',
              background: !saldoBanco ? '#f0f2f5' : cuadra ? '#e8f5e9' : (dif < 0 ? '#fde8e8' : '#fdf0e3') }}>
              <span style={{ color:'#555' }}>Diferencia</span>
              <span style={{ fontWeight:'bold', color: !saldoBanco ? '#27ae60' : difColor }}>
                {!saldoBanco ? '$0.00' : cuadra ? '✓ Cuadra' : `${dif>0?'+':''}$${dif.toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
