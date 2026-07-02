// src/components/contabilidad/talonario/ResumenTalonario.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabase';
import { useTalonario } from './TalonarioContext';
import { calcularNetoBancoMes, calcularSaldoCalculado, calcularDiferencia } from '../../../utils/saldoBanco';

function suma(arr, campo) {
  return arr.reduce((s, r) => s + parseFloat(r[campo] || 0), 0);
}

function fmtFecha(f) {
  if (!f) return '';
  const s = String(f).slice(0, 10);
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}

const MAX_DETALLE = 200;

function FilaDetalle({ label, valor, color, registros }) {
  const [abierto, setAbierto] = useState(false);
  const tiene = registros && registros.length > 0;

  return (
    <>
      <div
        onClick={() => tiene && setAbierto(a => !a)}
        style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '3px 0', fontSize: 12,
          cursor: tiene ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {label}
          {tiene && <span style={{ fontSize: 9, color: '#aaa' }}>{abierto ? '▲' : '▼'}</span>}
        </span>
        <span style={{ color: color || '#333', fontWeight: color ? 'bold' : 'normal' }}>
          ${parseFloat(valor || 0).toFixed(2)}
        </span>
      </div>
      {abierto && registros && (
        <div style={{
          background: '#f8f9fa', borderLeft: '3px solid #ddd',
          marginLeft: 8, marginBottom: 4,
          padding: '4px 8px', fontSize: 11, borderRadius: '0 4px 4px 0',
        }}>
          {registros.slice(0, MAX_DETALLE).map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', gap: 8,
              padding: '2px 0',
              borderBottom: i < Math.min(registros.length, MAX_DETALLE) - 1 ? '1px solid #eee' : 'none',
            }}>
              <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.nombre || '—'}
              </span>
              <span style={{ color: '#888', whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha)}</span>
              <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                ${parseFloat(r.monto || 0).toFixed(2)}
              </span>
            </div>
          ))}
          {registros.length > MAX_DETALLE && (
            <div style={{ color: '#888', padding: '4px 0', fontStyle: 'italic' }}>
              ... y {registros.length - MAX_DETALLE} más
            </div>
          )}
        </div>
      )}
    </>
  );
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
    ] = await Promise.all([
      supabase.from('facturas').select('total,forma_pago,numero,cliente_nombre,created_at').gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59').neq('estado', 'anulada'),
      supabase.from('cobros').select('id,fecha,monto,forma_pago,observaciones,clientes(nombre),facturas(numero)').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('caja_chica').select('id,fecha').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('compras').select('total,comision,tiene_factura,forma_pago,es_personal,fecha,proveedor_nombre,proveedores(nombre)').gte('fecha', fechaDesde).lte('fecha', fechaHasta).neq('estado', 'anulada'),
      supabase.from('nomina').select('sueldo_prop,sueldo_neto,iess_patronal,estado,empleados(nombre)').eq('periodo', periodo),
      supabase.from('talonario_pagos_banco').select('id,fecha,monto,concepto,beneficiario,pago_fijo_id,origen_servicio_basico_id').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_personales').select('monto,categoria,beneficiario,fecha').eq('mes', mes).eq('año', año),
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
        .select('valor, cuentas_cobrar(estado), empleados(nombre)')
        .eq('tipo', 'compra').eq('activo', true).eq('periodo', periodo),
    ]);

    const cajaIds = (cajas || []).map(c => c.id);
    const cajaFechasMap = Object.fromEntries((cajas || []).map(c => [c.id, c.fecha]));
    const [{ data: gastos }, { data: entregas }] = cajaIds.length > 0
      ? await Promise.all([
          supabase.from('caja_gastos').select('valor,es_personal,origen_servicio_basico_id,detalle,proveedor,caja_id').in('caja_id', cajaIds),
          supabase.from('caja_entregas').select('cantidad').in('caja_id', cajaIds),
        ])
      : [{ data: [] }, { data: [] }];

    const totalVentas    = suma(facturas || [], 'total') - suma(notasCredito || [], 'total');
    const totalOtrosI    = suma(otrosI   || [], 'monto');
    const totalGastos    = suma((gastos||[]).filter(g => !g.es_personal), 'valor');
    // Un servicio basico pagado en efectivo se cuenta en MES via totalServicioBasico
    // (dentro de totalPagosFijos, mas abajo), no via totalGastos -- si tambien se dejara
    // en totalGastos, se contaria dos veces SOLO en el lado MES. CONSOLIDADO si debe
    // seguir usando totalGastos tal cual (sin excluir), porque ahi es la unica via por
    // la que se cuenta ese gasto.
    const totalServicioBasicoEfectivo = (gastos || [])
      .filter(g => g.origen_servicio_basico_id)
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
    const totalServicioBasicoBanco = (pagosB || [])
      .filter(p => p.origen_servicio_basico_id)
      .reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const totalServicioBasico = totalServicioBasicoBanco + totalServicioBasicoEfectivo;
    const totalPagosFijos = (pagosB || []).filter(p => p.pago_fijo_id).reduce((s,p) => s + parseFloat(p.monto||0), 0) + totalServicioBasico;
    const totalPagosP    = suma(pagosP   || [], 'monto');
    const pagosPrestTarj = (pagosP || []).filter(p => ['prestamos','tarjetas'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const pagosGastPers  = (pagosP || [])
      .filter(p => ['gastos_personal','otros'].includes(p.categoria))
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
    setDatos({
      totalVentas, totalOtrosI, totalGastos, totalGastosMes, comprasCon, comprasSin,
      totalSueldos, totalIess, totalPagosB, totalPagosFijos, totalPagosP,
      cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
      pagosPrestamos, pagosTarjetas,
      gastosPersonalesCaja, totalComprasPersonales, comprasPersonalesPagadas,
      totalConsumoPersonal, totalCreditosEmpleados, totalSueldosPagados,
      comprasBancoTotal,
      cxcPendiente, cxpPendiente, saldoCalculado, pendienteInicial, movsBanco,
      raw: {
        facturas:          facturas          || [],
        cobros:            cobros            || [],
        gastos:            gastos            || [],
        cajaFechasMap,
        compras:           compras           || [],
        nomina:            nomina            || [],
        pagosB:            pagosB            || [],
        pagosP:            pagosP            || [],
        otrosI:            otrosI            || [],
        creditosEmpleados: creditosEmpleadosRaw || [],
      },
    });
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
    raw,
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

  // ── Arrays de registros para drill-down ───────────────────────────────

  const regVentas = [
    ...raw.facturas.map(f => ({
      nombre: f.cliente_nombre || f.numero || 'Factura',
      fecha:  f.created_at,
      monto:  parseFloat(f.total || 0),
    })),
    ...raw.cobros
      .filter(c => c.forma_pago === 'credito' || c.forma_pago === 'credito_nomina')
      .map(c => ({
        nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro crédito',
        fecha:  c.fecha,
        monto:  parseFloat(c.monto || 0),
      })),
  ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  const regOtrosI = raw.otrosI.map(o => ({
    nombre: o.descripcion || o.empresa || 'Otro ingreso',
    fecha:  o.fecha,
    monto:  parseFloat(o.monto || 0),
  }));

  const regGastosMes = raw.gastos
    .filter(g => !g.es_personal && !g.origen_servicio_basico_id)
    .map(g => ({
      nombre: g.detalle || g.proveedor || 'Gasto efectivo',
      fecha:  raw.cajaFechasMap[g.caja_id] || '',
      monto:  parseFloat(g.valor || 0),
    }));

  const regComprasCon = raw.compras
    .filter(c => c.tiene_factura && !c.es_personal)
    .map(c => ({
      nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Proveedor',
      fecha:  c.fecha,
      monto:  parseFloat(c.total || 0),
    }));

  const regComprasSin = raw.compras
    .filter(c => !c.tiene_factura && !c.es_personal)
    .map(c => ({
      nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Proveedor',
      fecha:  c.fecha,
      monto:  parseFloat(c.total || 0),
    }));

  const regSueldos = raw.nomina.map(n => ({
    nombre: n.empleados?.nombre || 'Empleado',
    fecha:  '',
    monto:  parseFloat(n.sueldo_neto || 0),
  }));

  const regIess = raw.nomina.map(n => ({
    nombre: n.empleados?.nombre || 'Empleado',
    fecha:  '',
    monto:  parseFloat(n.iess_patronal || 0),
  }));

  const regPagosFijos = [
    ...raw.pagosB.filter(p => p.pago_fijo_id).map(p => ({
      nombre: p.concepto || p.beneficiario || 'Pago fijo',
      fecha:  p.fecha,
      monto:  parseFloat(p.monto || 0),
    })),
    ...raw.pagosB.filter(p => p.origen_servicio_basico_id).map(p => ({
      nombre: p.concepto || p.beneficiario || 'Servicio básico',
      fecha:  p.fecha,
      monto:  parseFloat(p.monto || 0),
    })),
    ...raw.gastos.filter(g => g.origen_servicio_basico_id).map(g => ({
      nombre: g.detalle || g.proveedor || 'Servicio básico efectivo',
      fecha:  raw.cajaFechasMap[g.caja_id] || '',
      monto:  parseFloat(g.valor || 0),
    })),
  ];

  const regPrestamos = raw.pagosP
    .filter(p => p.categoria === 'prestamos')
    .map(p => ({ nombre: p.beneficiario || 'Préstamo', fecha: p.fecha, monto: parseFloat(p.monto || 0) }));

  const regTarjetas = raw.pagosP
    .filter(p => p.categoria === 'tarjetas')
    .map(p => ({ nombre: p.beneficiario || 'Tarjeta', fecha: p.fecha, monto: parseFloat(p.monto || 0) }));

  const regPagosPersonales = [
    ...raw.pagosP
      .filter(p => ['gastos_personal','otros'].includes(p.categoria))
      .map(p => ({ nombre: p.beneficiario || 'Gasto personal', fecha: p.fecha, monto: parseFloat(p.monto || 0) })),
    ...raw.gastos
      .filter(g => g.es_personal)
      .map(g => ({ nombre: g.detalle || g.proveedor || 'Gasto personal caja', fecha: raw.cajaFechasMap[g.caja_id] || '', monto: parseFloat(g.valor || 0) })),
    ...raw.compras
      .filter(c => c.es_personal)
      .map(c => ({ nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Compra personal', fecha: c.fecha, monto: parseFloat(c.total || 0) })),
  ];

  const regCobroEfect = [
    ...raw.cobros.filter(c => c.forma_pago === 'efectivo').map(c => ({
      nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro',
      fecha: c.fecha, monto: parseFloat(c.monto || 0),
    })),
    ...raw.facturas.filter(f => f.forma_pago === 'efectivo').map(f => ({
      nombre: f.cliente_nombre || f.numero || 'Venta efectivo',
      fecha: f.created_at, monto: parseFloat(f.total || 0),
    })),
  ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  const regCobroCheq = [
    ...raw.cobros.filter(c => c.forma_pago === 'cheque').map(c => ({
      nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro',
      fecha: c.fecha, monto: parseFloat(c.monto || 0),
    })),
    ...raw.facturas.filter(f => f.forma_pago === 'cheque').map(f => ({
      nombre: f.cliente_nombre || f.numero || 'Venta cheque',
      fecha: f.created_at, monto: parseFloat(f.total || 0),
    })),
  ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  const regCobroTransf = [
    ...raw.cobros
      .filter(c => ['transferencia','deposito','tarjeta_credito'].includes(c.forma_pago))
      .map(c => ({ nombre: c.clientes?.nombre || c.facturas?.numero || 'Cobro', fecha: c.fecha, monto: parseFloat(c.monto || 0) })),
    ...raw.facturas
      .filter(f => ['transferencia','tarjeta_credito'].includes(f.forma_pago))
      .map(f => ({ nombre: f.cliente_nombre || f.numero || 'Venta transf', fecha: f.created_at, monto: parseFloat(f.total || 0) })),
  ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  const regGastosCons = raw.gastos
    .filter(g => !g.es_personal)
    .map(g => ({
      nombre: g.detalle || g.proveedor || 'Gasto efectivo',
      fecha:  raw.cajaFechasMap[g.caja_id] || '',
      monto:  parseFloat(g.valor || 0),
    }));

  const regPagosConBanco = [
    ...raw.pagosB.map(p => ({
      nombre: p.concepto || p.beneficiario || 'Pago banco',
      fecha: p.fecha, monto: parseFloat(p.monto || 0),
    })),
    ...raw.compras
      .filter(c => ['transferencia','cheque','deposito'].includes(c.forma_pago) && !c.es_personal)
      .map(c => ({ nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Compra banco', fecha: c.fecha, monto: parseFloat(c.total || 0) + parseFloat(c.comision || 0) })),
    ...raw.nomina
      .filter(n => n.estado === 'pagado')
      .map(n => ({ nombre: `Sueldo — ${n.empleados?.nombre || 'Empleado'}`, fecha: '', monto: parseFloat(n.sueldo_neto || 0) })),
  ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  const regPrestTarjCons = raw.pagosP
    .filter(p => ['prestamos','tarjetas'].includes(p.categoria))
    .map(p => ({ nombre: p.beneficiario || p.categoria, fecha: p.fecha, monto: parseFloat(p.monto || 0) }));

  const regGastPersonalesCons = [
    ...raw.pagosP
      .filter(p => ['gastos_personal','otros'].includes(p.categoria))
      .map(p => ({ nombre: p.beneficiario || 'Gasto personal', fecha: p.fecha, monto: parseFloat(p.monto || 0) })),
    ...raw.gastos
      .filter(g => g.es_personal)
      .map(g => ({ nombre: g.detalle || g.proveedor || 'Gasto personal caja', fecha: raw.cajaFechasMap[g.caja_id] || '', monto: parseFloat(g.valor || 0) })),
    ...raw.compras
      .filter(c => c.es_personal && c.forma_pago !== 'credito')
      .map(c => ({ nombre: c.proveedores?.nombre || c.proveedor_nombre || 'Compra personal', fecha: c.fecha, monto: parseFloat(c.total || 0) })),
  ];

  const regCreditosEmps = raw.creditosEmpleados
    .filter(m => m.cuentas_cobrar?.estado === 'pagada')
    .map(m => ({ nombre: m.empleados?.nombre || 'Empleado', fecha: '', monto: parseFloat(m.valor || 0) }));

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
          <FilaDetalle label="(+) Total ventas del mes" valor={totalVentas} color="#27ae60" registros={regVentas} />
          <FilaDetalle label="(+) Otros ingresos" valor={totalOtrosI} color="#27ae60" registros={regOtrosI} />
          {totalRow('TOTAL INGRESOS', totalIngMes, '#27ae60')}

          {titulo('EGRESOS', '#e74c3c')}
          <FilaDetalle label="(-) Gastos efectivo" valor={totalGastosMes} color="#e74c3c" registros={regGastosMes} />
          <FilaDetalle label="(-) Proveedores con factura" valor={comprasCon} color="#e74c3c" registros={regComprasCon} />
          <FilaDetalle label="(-) Proveedores sin factura" valor={comprasSin} color="#e74c3c" registros={regComprasSin} />
          <FilaDetalle label="(-) Sueldos" valor={totalSueldos} color="#e74c3c" registros={regSueldos} />
          <FilaDetalle label="(-) IESS patronal" valor={totalIess} color="#e74c3c" registros={regIess} />
          <FilaDetalle label="(-) Pagos Fijos (sistema, servicios, contadora, etc.)" valor={totalPagosFijos} color="#e74c3c" registros={regPagosFijos} />
          <FilaDetalle label="(-) Préstamos" valor={pagosPrestamos} color="#e74c3c" registros={regPrestamos} />
          <FilaDetalle label="(-) Tarjetas" valor={pagosTarjetas} color="#e74c3c" registros={regTarjetas} />
          <FilaDetalle label="(-) Pagos personales" valor={totalPagosPersonalesTotal} color="#e74c3c" registros={regPagosPersonales} />
          <FilaDetalle label="(-) Consumo Personal" valor={totalConsumoPersonal} color="#e74c3c" registros={[]} />
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
          <FilaDetalle label="(+) Cobros efectivo" valor={cobroEfect} color="#27ae60" registros={regCobroEfect} />
          <FilaDetalle label="(+) Cobros cheque" valor={cobroCheq} color="#27ae60" registros={regCobroCheq} />
          <FilaDetalle label="(+) Cobros transf./depósito" valor={cobroTransf} color="#27ae60" registros={regCobroTransf} />
          <FilaDetalle label="(+) Otros ingresos" valor={totalOtrosI} color="#27ae60" registros={regOtrosI} />
          {totalRow('TOTAL', totalIngCons, '#27ae60')}

          {titulo('EGRESOS (pagos reales)', '#e74c3c')}
          <FilaDetalle label="(-) Gastos efectivo" valor={totalGastos} color="#e74c3c" registros={regGastosCons} />
          <FilaDetalle label="(-) Pagos con banco" valor={totalPagosB + comprasBancoTotal + totalSueldosPagados} color="#e74c3c" registros={regPagosConBanco} />
          <FilaDetalle label="(-) Tarjetas/préstamos" valor={pagosPrestTarj} color="#e74c3c" registros={regPrestTarjCons} />
          <FilaDetalle label="(-) Gastos personales" valor={pagosGastPersTotal} color="#e74c3c" registros={regGastPersonalesCons} />
          <FilaDetalle label="(-) Créditos Empleados" valor={totalCreditosEmpleados} color="#e74c3c" registros={regCreditosEmps} />
          {totalRow('TOTAL', totalEgrCons, '#e74c3c')}

          {titulo('ACTIVOS', '#555')}
          <FilaDetalle label="(+) Cuentas por cobrar" valor={cxcPendiente} color="#27ae60" registros={[]} />
          <FilaDetalle label="(-) Cuentas por pagar" valor={cxpPendiente} color="#e74c3c" registros={[]} />

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
