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
      const toSheet = rows => XLSX.utils.aoa_to_sheet(rows);
      const hdr = cols => [cols];

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

      // RESUMEN
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
