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
      { data: cxp },
      { data: config },
      { data: notasCredito },
      { data: pagosCompras },
      { data: consumoPersonal },
      { data: creditosEmpleadosRaw },
      { data: serviciosBasicosFijos },
    ] = await Promise.all([
      supabase.from('facturas').select('total,forma_pago').gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59').neq('estado', 'anulada'),
      supabase.from('cobros').select('id,fecha,monto,forma_pago,observaciones,clientes(nombre),facturas(numero)').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('caja_chica').select('id').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('compras').select('total,comision,tiene_factura,forma_pago,es_personal').gte('fecha', fechaDesde).lte('fecha', fechaHasta).neq('estado', 'anulada'),
      supabase.from('nomina').select('sueldo_prop,sueldo_neto,iess_patronal,estado').eq('periodo', periodo),
      supabase.from('talonario_pagos_banco').select('id,fecha,monto,concepto,beneficiario,pago_fijo_id').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_personales').select('monto,categoria,pago_fijo_personal_id').eq('mes', mes).eq('año', año),
      supabase.from('talonario_otros_ingresos').select('id,fecha,monto,descripcion,empresa,forma_pago').eq('mes', mes).eq('año', año),
      supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').in('estado', ['pendiente', 'parcial']),
      supabase.from('cuentas_pagar').select('saldo_pendiente').in('estado', ['pendiente', 'parcial']),
      supabase.from('config_contabilidad').select('valor').eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
      supabase.from('notas_credito').select('total').eq('es_manual', false)
        .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59'),
      // Pagos a proveedores por banco de compras registradas a credito (Compras -> Pagos)
      supabase.from('pagos_compras').select('monto,comision,forma_pago,compras(es_personal)')
        .in('forma_pago', ['transferencia','cheque','deposito'])
        .gte('fecha_pago', fechaDesde).lte('fecha_pago', fechaHasta),
      supabase.from('talonario_consumo_personal').select('valor').eq('mes', mes).eq('año', año),
      supabase.from('nomina_movimientos')
        .select('valor, cuentas_cobrar(estado)')
        .eq('tipo', 'compra').eq('activo', true).eq('periodo', periodo),
      supabase.from('pagos_fijos_personales').select('id').eq('es_servicio_basico', true),
    ]);

    const cajaIds = (cajas || []).map(c => c.id);
    const [{ data: gastos }, { data: entregas }] = cajaIds.length > 0
      ? await Promise.all([
          supabase.from('caja_gastos').select('valor,es_personal,origen_pago_personal_id').in('caja_id', cajaIds),
          supabase.from('caja_entregas').select('cantidad').in('caja_id', cajaIds),
        ])
      : [{ data: [] }, { data: [] }];

    const totalVentas    = suma(facturas || [], 'total') - suma(notasCredito || [], 'total');
    const totalOtrosI    = suma(otrosI   || [], 'monto');
    const totalGastos    = suma((gastos||[]).filter(g => !g.es_personal), 'valor');
    // Un servicio basico pagado en efectivo ya se cuenta en MES via totalServicioBasico
    // (dentro de totalPagosFijos, mas abajo) -- si tambien se dejara en totalGastos, se
    // contaria dos veces SOLO en el lado MES. CONSOLIDADO si debe seguir usando totalGastos
    // tal cual (sin excluir), porque ahi es la unica via por la que se cuenta ese gasto.
    const totalServicioBasicoEfectivo = (gastos || [])
      .filter(g => g.origen_pago_personal_id)
      .reduce((s,g) => s + parseFloat(g.valor || 0), 0);
    const totalGastosMes = totalGastos - totalServicioBasicoEfectivo;
    const gastosPersonalesCaja = suma((gastos||[]).filter(g => g.es_personal), 'valor');
    const comprasCon     = (compras || []).filter(c =>  c.tiene_factura && !c.es_personal).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const comprasSin     = (compras || []).filter(c => !c.tiene_factura && !c.es_personal).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const totalComprasPersonales    = suma((compras||[]).filter(c => c.es_personal), 'total');
    const comprasPersonalesPagadas  = suma((compras||[]).filter(c => c.es_personal && c.forma_pago !== 'credito'), 'total')
      + (pagosCompras||[]).filter(p => p.compras?.es_personal).reduce((s,p) => s + parseFloat(p.monto||0) + parseFloat(p.comision||0), 0);
    const totalConsumoPersonal = suma(consumoPersonal || [], 'valor');
    // Solo cuenta el credito si la nomina de este periodo YA se genero y
    // marco la cuenta por cobrar del empleado como pagada -- si la nomina
    // de este mes aun no se genera, el movimiento existe pero no debe
    // contarse todavia (se contaria en el mes en que SI se liquide).
    const totalCreditosEmpleados = (creditosEmpleadosRaw || [])
      .filter(m => m.cuentas_cobrar?.estado === 'pagada')
      .reduce((s, m) => s + parseFloat(m.valor || 0), 0);
    const totalSueldos   = suma(nomina   || [], 'sueldo_neto');
    // Solo cuenta como pago real de caja si la nomina de ese empleado ya se
    // marco 'pagado' este mes -- si solo esta 'generado', el dinero todavia
    // no salio del banco/caja.
    // OJO -- esto NO es doble conteo con totalCreditosEmpleados, aunque
    // sueldo_neto ya resta internamente los mismos creditos_nomina que
    // totalCreditosEmpleados suma por separado. Es intencional, confirmado
    // explicitamente con David con un ejemplo numerico: sueldo $485, credito
    // $50, neto real $435 -- el Total Egresos CONSOLIDADO debe mostrar $485
    // ($435 Sueldos + $50 Creditos Empleados), no $435. La linea "Sueldos"
    // mide solo el efectivo/banco que de verdad salio; "Creditos Empleados"
    // mide el valor de producto que salio sin cobro de caja (se "cobro" via
    // descuento de nomina en vez de dinero). Juntas reconstruyen el costo
    // total del empleado ese mes -- no se pisan, cada una mide algo distinto.
    const totalSueldosPagados = suma((nomina || []).filter(n => n.estado === 'pagado'), 'sueldo_neto');
    const totalIess      = suma(nomina   || [], 'iess_patronal');
    const totalPagosB    = suma(pagosB   || [], 'monto');
    // Pagos Fijos (sistema, servicios basicos, contadora, arriendo, etc.) son gastos
    // nuevos genuinos del mes, distintos de un pago generico que liquida una compra ya
    // contada en Proveedores -- se distinguen por tener pago_fijo_id. Solo estos cuentan
    // en el lado MES; los pagos genericos a proveedores NO (ver totalEgrMes mas abajo).
    const idsServicioBasico = new Set((serviciosBasicosFijos || []).map(s => s.id));
    const totalServicioBasico = (pagosP || [])
      .filter(p => idsServicioBasico.has(p.pago_fijo_personal_id))
      .reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const totalPagosFijos = (pagosB || []).filter(p => p.pago_fijo_id).reduce((s,p) => s + parseFloat(p.monto||0), 0) + totalServicioBasico;
    const totalPagosP    = suma(pagosP   || [], 'monto');
    const pagosPrestTarj = (pagosP || []).filter(p => ['prestamos','tarjetas'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const pagosGastPers  = (pagosP || [])
      .filter(p => ['gastos_personal','otros'].includes(p.categoria) && !idsServicioBasico.has(p.pago_fijo_personal_id))
      .reduce((s,p) => s + parseFloat(p.monto||0), 0);
    // Solo para el lado MES (izquierdo): la contadora muestra Prestamos y Tarjetas como
    // lineas separadas en su propio resumen. El lado CONSOLIDADO (derecho) se queda
    // junto en "Tarjetas/préstamos" (pagosPrestTarj), sin cambios.
    const pagosPrestamos = (pagosP || []).filter(p => p.categoria === 'prestamos').reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const pagosTarjetas  = (pagosP || []).filter(p => p.categoria === 'tarjetas').reduce((s,p) => s + parseFloat(p.monto||0), 0);

    // Cobros reales = cobros de CxC (tabla cobros) + ventas de contado (facturas pagadas directo, nunca generan cobro)
    const cobroEfect = (cobros||[]).filter(c => c.forma_pago==='efectivo').reduce((s,c) => s+parseFloat(c.monto||0), 0)
      + (facturas||[]).filter(f => f.forma_pago==='efectivo').reduce((s,f) => s+parseFloat(f.total||0), 0);
    const cobroCheq  = (cobros||[]).filter(c => c.forma_pago==='cheque').reduce((s,c) => s+parseFloat(c.monto||0), 0)
      + (facturas||[]).filter(f => f.forma_pago==='cheque').reduce((s,f) => s+parseFloat(f.total||0), 0);
    const cobroTransf= (cobros||[]).filter(c => ['transferencia','deposito','tarjeta_credito'].includes(c.forma_pago)).reduce((s,c) => s+parseFloat(c.monto||0), 0)
      + (facturas||[]).filter(f => ['transferencia','tarjeta_credito'].includes(f.forma_pago)).reduce((s,f) => s+parseFloat(f.total||0), 0);

    const cxcPendiente = (cxc||[]).reduce((s,c) => s + parseFloat(c.monto_total||0) - parseFloat(c.monto_cobrado||0), 0);
    const cxpPendiente = (cxp||[]).reduce((s,c) => s + parseFloat(c.saldo_pendiente||0), 0);

    // Movimientos banco detallados
    const cobrosTransfDet = (cobros||[]).filter(c => ['transferencia','deposito'].includes(c.forma_pago));
    const otrosIngBancoDet = (otrosI||[]).filter(o => o.forma_pago !== '01');
    const otrosIngBancoTotal = otrosIngBancoDet.reduce((s,o) => s + parseFloat(o.monto||0), 0);
    const ventasBancoTotal  = (facturas||[]).filter(f => ['transferencia','cheque'].includes(f.forma_pago)).reduce((s,f) => s + parseFloat(f.total||0), 0);
    const comprasBancoTotal = (compras||[]).filter(c => ['transferencia','cheque','deposito'].includes(c.forma_pago) && !c.es_personal).reduce((s,c) => s + parseFloat(c.total||0) + parseFloat(c.comision||0), 0)
      + (pagosCompras||[]).filter(p => !p.compras?.es_personal).reduce((s,p) => s + parseFloat(p.monto||0) + parseFloat(p.comision||0), 0);
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
    setDatos({ totalVentas, totalOtrosI, totalGastos, totalGastosMes, comprasCon, comprasSin,
      totalSueldos, totalIess, totalPagosB, totalPagosFijos, totalPagosP,
      cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
      pagosPrestamos, pagosTarjetas,
      gastosPersonalesCaja, totalComprasPersonales, comprasPersonalesPagadas,
      totalConsumoPersonal, totalCreditosEmpleados, totalSueldosPagados,
      comprasBancoTotal,
      cxcPendiente, cxpPendiente, saldoCalculado, pendienteInicial, movsBanco });
    setCargando(false);
  }


  if (cargando || !datos) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando resumen...</div>;

  const {
    totalVentas, totalOtrosI, totalGastos, totalGastosMes, comprasCon, comprasSin,
    totalSueldos, totalIess, totalPagosB, totalPagosFijos, totalPagosP,
    cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
    pagosPrestamos, pagosTarjetas,
    gastosPersonalesCaja, totalComprasPersonales, comprasPersonalesPagadas,
    totalConsumoPersonal, totalCreditosEmpleados, totalSueldosPagados,
    comprasBancoTotal,
    cxcPendiente, cxpPendiente, saldoCalculado, pendienteInicial, movsBanco,
  } = datos;

  const { dif, cuadra, color: difColor } = calcularDiferencia(saldoBanco, saldoCalculado);

  const totalIngMes  = totalVentas + totalOtrosI;
  // "Pagos personales" (lado MES) ya NO incluye Prestamos/Tarjetas -- esos van en sus
  // propias lineas separadas abajo, igual que en el resumen propio de la contadora.
  const totalPagosPersonalesTotal = pagosGastPers + gastosPersonalesCaja + totalComprasPersonales;
  // "Pagos del mes" GENERICOS (sin pago_fijo_id) NO van en el lado MES: casi siempre
  // liquidan una compra que ya se contó como "Proveedores con/sin factura" cuando se
  // compró (devengado). Sumarlos aquí duplicaba el gasto. Solo cuentan en el lado
  // CONSOLIDADO (totalEgrCons), que es base caja real. Los Pagos FIJOS (sistema,
  // servicios básicos, contadora, etc., con pago_fijo_id) SÍ son gasto nuevo genuino
  // del mes -- igual que el resumen propio de la contadora.
  const totalEgrMes  = totalGastosMes + comprasCon + comprasSin + totalSueldos + totalIess
    + totalPagosFijos + pagosPrestamos + pagosTarjetas + totalPagosPersonalesTotal + totalConsumoPersonal;
  const utilidadBruta= totalIngMes - totalEgrMes;

  const totalIngCons = cobroEfect + cobroCheq + cobroTransf + totalOtrosI;
  const pagosGastPersTotal = pagosGastPers + gastosPersonalesCaja + comprasPersonalesPagadas;
  const totalEgrCons = totalGastos + totalPagosB + comprasBancoTotal + pagosPrestTarj + pagosGastPersTotal + totalCreditosEmpleados + totalSueldosPagados;

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
          {fila('(-) Gastos efectivo', totalGastosMes, '#e74c3c')}
          {fila('(-) Proveedores con factura', comprasCon, '#e74c3c')}
          {fila('(-) Proveedores sin factura', comprasSin, '#e74c3c')}
          {fila('(-) Sueldos', totalSueldos, '#e74c3c')}
          {fila('(-) IESS patronal', totalIess, '#e74c3c')}
          {fila('(-) Pagos Fijos (sistema, servicios, contadora, etc.)', totalPagosFijos, '#e74c3c')}
          {fila('(-) Préstamos', pagosPrestamos, '#e74c3c')}
          {fila('(-) Tarjetas', pagosTarjetas, '#e74c3c')}
          {fila('(-) Pagos personales', totalPagosPersonalesTotal, '#e74c3c')}
          {fila('(-) Consumo Personal', totalConsumoPersonal, '#e74c3c')}
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
          {fila('(-) Pagos con banco', totalPagosB + comprasBancoTotal + totalSueldosPagados, '#e74c3c')}
          {fila('(-) Tarjetas/préstamos', pagosPrestTarj, '#e74c3c')}
          {fila('(-) Gastos personales', pagosGastPersTotal, '#e74c3c')}
          {fila('(-) Créditos Empleados', totalCreditosEmpleados, '#e74c3c')}
          {totalRow('TOTAL', totalEgrCons, '#e74c3c')}

          {titulo('ACTIVOS', '#555')}
          {fila('(+) Cuentas por cobrar', cxcPendiente, '#27ae60')}
          {fila('(-) Cuentas por pagar', cxpPendiente, '#e74c3c')}

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
