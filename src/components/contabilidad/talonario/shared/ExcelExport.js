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
      const periodo = `${año}-${String(mes).padStart(2, '0')}`;
      const ultimoDia = new Date(año, mes, 0).getDate();
      const mesNombre = MESES[mes - 1].toUpperCase();

      const [
        { data: cobros },
        { data: cajas },
        { data: compras },
        { data: pagosB },
        { data: pagosP },
        { data: otrosI },
        { data: factP },
        { data: nomina },
        { data: facturas },
        { data: cxc },
        { data: saldoConfig },
      ] = await Promise.all([
        supabase.from('cobros')
          .select('fecha,monto,forma_pago,observaciones,clientes(nombre),cuentas_cobrar(monto_total),facturas(numero)')
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
        supabase.from('caja_chica').select('id,fecha')
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
        supabase.from('compras')
          .select('fecha,total,tiene_factura,numero_factura,proveedor_nombre,forma_pago,proveedores(ruc)')
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
        supabase.from('talonario_pagos_banco').select('*').eq('mes', mes).eq('año', año).order('fecha'),
        supabase.from('talonario_pagos_personales').select('*').eq('mes', mes).eq('año', año).order('categoria').order('fecha'),
        supabase.from('talonario_otros_ingresos').select('*').eq('mes', mes).eq('año', año).order('fecha'),
        supabase.from('talonario_facturas_personales').select('*').eq('mes', mes).eq('año', año).order('fecha'),
        supabase.from('nomina').select('sueldo_prop,iess_patronal').eq('periodo', periodo),
        supabase.from('facturas').select('total')
          .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59')
          .neq('estado', 'anulada'),
        supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').in('estado', ['pendiente', 'parcial']),
        supabase.from('config_contabilidad').select('valor')
          .eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
      ]);

      const cajaIds = (cajas || []).map(c => c.id);
      const { data: gastos } = cajaIds.length > 0
        ? await supabase.from('caja_gastos').select('valor,detalle,proveedor,caja_id').in('caja_id', cajaIds)
        : { data: [] };
      const cajaFechaMap = Object.fromEntries((cajas || []).map(c => [c.id, c.fecha]));

      const sum = (arr, campo) => parseFloat(((arr || []).reduce((t, r) => t + parseFloat(r[campo] || 0), 0)).toFixed(2));
      const n = v => parseFloat((v || 0).toFixed(2));

      // ── Estilos ──────────────────────────────────────────────────────────
      const YELLOW   = { fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }, font: { bold: true } };
      const BLUE_HDR = { fill: { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } }, font: { bold: true } };
      const GREEN    = { fill: { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } }, font: { bold: true } };
      const RED      = { fill: { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } }, font: { bold: true } };
      const BOLD     = { font: { bold: true } };
      const TITLE    = { font: { bold: true, sz: 13 } };

      function styleRow(ws, rowIdx, numCols, style, colOffset = 0) {
        for (let c = colOffset; c < colOffset + numCols; c++) {
          const ref = XLSX.utils.encode_cell({ r: rowIdx, c });
          if (!ws[ref]) ws[ref] = { t: 'z', v: '' };
          ws[ref].s = style;
        }
      }
      function styleCell(ws, ref, style) {
        if (!ws[ref]) ws[ref] = { t: 'z', v: '' };
        ws[ref].s = style;
      }

      const wb = XLSX.utils.book_new();

      // ── RESUMEN ──────────────────────────────────────────────────────────
      const totalVentas  = sum(facturas, 'total');
      const totalOtrosI  = sum(otrosI, 'monto');
      const totalGastos  = sum(gastos, 'valor');
      const comprasCon   = (compras || []).filter(c => c.tiene_factura).reduce((t, r) => t + n(r.total), 0);
      const comprasSin   = (compras || []).filter(c => !c.tiene_factura).reduce((t, r) => t + n(r.total), 0);
      const totalSueldos = sum(nomina, 'sueldo_prop');
      const totalIess    = sum(nomina, 'iess_patronal');
      const totalPagosB  = sum(pagosB, 'monto');
      const totalPagosP  = sum(pagosP, 'monto');
      const cobroEfect   = (cobros || []).filter(c => c.forma_pago === 'efectivo').reduce((t, r) => t + n(r.monto), 0);
      const cobroCheq    = (cobros || []).filter(c => c.forma_pago === 'cheque').reduce((t, r) => t + n(r.monto), 0);
      const cobroTransf  = (cobros || []).filter(c => ['transferencia', 'deposito'].includes(c.forma_pago)).reduce((t, r) => t + n(r.monto), 0);
      const cxcPend      = (cxc || []).reduce((t, r) => t + n(r.monto_total) - n(r.monto_cobrado), 0);
      const pagosPT      = (pagosP || []).filter(p => ['prestamos', 'tarjetas'].includes(p.categoria)).reduce((t, r) => t + n(r.monto), 0);
      const pagosGP      = (pagosP || []).filter(p => p.categoria === 'gastos_personal').reduce((t, r) => t + n(r.monto), 0);
      const pagosOtros   = (pagosP || []).filter(p => p.categoria === 'otros').reduce((t, r) => t + n(r.monto), 0);
      const ingMes  = n(totalVentas + totalOtrosI);
      const egrMes  = n(totalGastos + comprasCon + comprasSin + totalSueldos + totalIess + totalPagosB + totalPagosP);
      const ingCons = n(cobroEfect + cobroCheq + cobroTransf + totalOtrosI);
      const egrCons = n(totalGastos + totalPagosB + pagosPT + pagosGP + pagosOtros);

      // Cols A-C = tabla izquierda (idx 0-2), cols F-H = tabla derecha (idx 5-7)
      const E = (a='',b='',c='',f='',g='',h='') => [a, b, c, '', '', f, g, h];
      const resRows = [
        E('','','','','',''),
        E('','','','','',''),
        E('','','','','',''),
        E(`${mesNombre} ${año}`,'','','','','CONSOLIDADO'),
        E('','','','','',''),
        E('EMBUTIDOS Y JAMONES CANDELARIA','','','','','EMBUTIDOS Y JAMONES CANDELARIA'),
        E('','','','','',''),
        E('INGRESOS','','','','','INGRESOS'),
        E(`(+) TOTAL VENTAS DEL 01 AL ${ultimoDia} ${mesNombre}`,'',n(totalVentas),'','','(+) COBROS EFECTIVO','',n(cobroEfect)),
        E('(+) OTROS INGRESOS','',n(totalOtrosI),'','','(+) COBROS CHEQUE','',n(cobroCheq)),
        E('','','','','','(+) COBROS TRANSFERENCIA - DEPOSITOS','',n(cobroTransf)),
        E('','','','','','(+) OTROS INGRESOS','',n(totalOtrosI)),
        E('TOTAL INGRESOS','',n(ingMes),'','','TOTAL','',n(ingCons)),
        E('','','','','',''),
        E('EGRESOS','','','','','EGRESOS'),
        E('(-) GASTOS EFECTIVO','',n(totalGastos),'','','(-) GASTOS EN EFECTIVO','',n(totalGastos)),
        E('(-) PROVEEDORES CON FACT','',n(comprasCon),'','','(-) PAGOS CON BANCOS (PROVEEDORES, SUELDOS)','',n(totalPagosB)),
        E('(-) PROVEEDORES SIN FACT','',n(comprasSin),'','','(-) TARJETAS, PRESTAMOS, AHORRO','',n(pagosPT)),
        E('(-) SUELDOS','',n(totalSueldos),'','','(-) GASTOS PERSONALES','',n(pagosGP)),
        E('(-) IESS','',n(totalIess),'','','(-) OTROS GASTOS PERSONALES','',n(pagosOtros)),
        E('(-) PAGOS DEL MES','',n(totalPagosB)),
        E('(-) PAGOS PERSONALES','',n(totalPagosP)),
        E('TOTAL EGRESOS','',n(egrMes),'','','TOTAL','',n(egrCons)),
        E('','','','','',''),
        E('(UTILIDAD BRUTA) INGRESOS - EGRESOS','',n(ingMes - egrMes),'','','ACTIVOS'),
        E('','','','','','(+) CUENTAS POR COBRAR','',n(cxcPend)),
        E('','','','','','TOTAL','',n(cxcPend)),
        E('','','','','',''),
        E('','','','','','(-) CUENTAS POR PAGAR','',0),
      ];
      const wsRes = XLSX.utils.aoa_to_sheet(resRows);
      styleCell(wsRes, 'A4', TITLE);  styleCell(wsRes, 'F4', TITLE);
      styleCell(wsRes, 'A8', BOLD);   styleCell(wsRes, 'F8', BOLD);
      // TOTAL INGRESOS (row idx 12)
      styleRow(wsRes, 12, 3, GREEN);
      styleCell(wsRes, 'F13', GREEN); styleCell(wsRes, 'H13', GREEN);
      styleCell(wsRes, 'A15', BOLD);  styleCell(wsRes, 'F15', BOLD);
      // TOTAL EGRESOS (row idx 22)
      styleRow(wsRes, 22, 3, RED);
      styleCell(wsRes, 'F23', RED);   styleCell(wsRes, 'H23', RED);
      // UTILIDAD BRUTA (row idx 24)
      styleRow(wsRes, 24, 3, YELLOW);
      styleCell(wsRes, 'F25', BOLD);
      // TOTAL ACTIVOS (row idx 26)
      styleCell(wsRes, 'F27', GREEN); styleCell(wsRes, 'H27', GREEN);
      wsRes['!cols'] = [
        { wch: 42 }, { wch: 4 }, { wch: 15 }, { wch: 3 }, { wch: 3 },
        { wch: 42 }, { wch: 4 }, { wch: 15 },
      ];
      XLSX.utils.book_append_sheet(wb, wsRes, 'RESUMEN');

      // ── GASTOS ───────────────────────────────────────────────────────────
      const gastosData = (gastos || []).map(r => [
        r.proveedor || '', cajaFechaMap[r.caja_id] || '', r.detalle || '', n(r.valor),
      ]);
      const wsGastos = XLSX.utils.aoa_to_sheet([
        ['GASTOS EN EFECTIVO', '', '', ''],
        ['PROVEEDOR', 'FECHA', 'DETALLE', 'VALOR'],
        ...gastosData,
        ['', '', 'TOTAL', n(sum(gastos, 'valor'))],
      ]);
      styleRow(wsGastos, 0, 4, TITLE);
      styleRow(wsGastos, 1, 4, BLUE_HDR);
      styleRow(wsGastos, 2 + gastosData.length, 4, YELLOW);
      wsGastos['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 45 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsGastos, 'GASTOS');

      // ── COBROS helper ─────────────────────────────────────────────────────
      const HDR_COB = ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero_venta_pedido'];
      const COB_COLS = [{ wch: 15 }, { wch: 28 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 25 }];

      function cobrosRows(list) {
        return list.map(r => [
          r.forma_pago?.toUpperCase() || '',
          r.clientes?.nombre || '',
          n(r.cuentas_cobrar?.monto_total ?? r.monto),
          n(r.monto),
          r.fecha || '',
          r.facturas?.numero || '',
        ]);
      }
      function buildCobSheet(data, titulo) {
        const total = n(data.reduce((t, r) => t + parseFloat(r[3] || 0), 0));
        const ws = XLSX.utils.aoa_to_sheet([
          [titulo, '', '', '', '', ''],
          HDR_COB,
          ...data,
          ['', '', '', total, 'TOTAL', ''],
        ]);
        styleRow(ws, 0, 6, YELLOW);
        styleRow(ws, 1, 6, BLUE_HDR);
        styleRow(ws, 2 + data.length, 6, YELLOW);
        ws['!cols'] = COB_COLS;
        return ws;
      }

      // ── COBROS EFECTIVO ───────────────────────────────────────────────────
      const cobEfData = cobrosRows((cobros || []).filter(c => c.forma_pago === 'efectivo'));
      XLSX.utils.book_append_sheet(wb, buildCobSheet(cobEfData, 'COBROS EN EFECTIVO'), 'COBROS EFECTIVO');

      // ── COBROS TRANSF DEPO ────────────────────────────────────────────────
      const cobTrData  = cobrosRows((cobros || []).filter(c => c.forma_pago === 'transferencia'));
      const cobDepData = cobrosRows((cobros || []).filter(c => ['deposito', 'tarjeta_credito', 'tarjeta'].includes(c.forma_pago)));
      const cobTrTotal  = n(cobTrData.reduce((t, r) => t + parseFloat(r[3] || 0), 0));
      const cobDepTotal = n(cobDepData.reduce((t, r) => t + parseFloat(r[3] || 0), 0));

      const wsCobTr = XLSX.utils.aoa_to_sheet([
        ['COBROS EN TRANSFERENCIA', '', '', '', '', ''],
        HDR_COB, ...cobTrData,
        ['', '', '', cobTrTotal, 'TOTAL', ''],
      ]);
      XLSX.utils.sheet_add_aoa(wsCobTr, [
        ['COBROS EN DEPOSITO Y TARJETA', '', '', '', '', ''],
        HDR_COB, ...cobDepData,
        ['', '', '', cobDepTotal, 'TOTAL', ''],
      ], { origin: 'H1' });
      styleRow(wsCobTr, 0, 6, YELLOW);
      styleRow(wsCobTr, 1, 6, BLUE_HDR);
      styleRow(wsCobTr, 2 + cobTrData.length, 6, YELLOW);
      styleRow(wsCobTr, 0, 6, YELLOW, 7);
      styleRow(wsCobTr, 1, 6, BLUE_HDR, 7);
      styleRow(wsCobTr, 2 + cobDepData.length, 6, YELLOW, 7);
      wsCobTr['!cols'] = [...COB_COLS, { wch: 3 }, ...COB_COLS];
      XLSX.utils.book_append_sheet(wb, wsCobTr, 'COBROS TRANSF DEPO');

      // ── COBROS CHEQUES ────────────────────────────────────────────────────
      const cobChData = cobrosRows((cobros || []).filter(c => c.forma_pago === 'cheque'));
      XLSX.utils.book_append_sheet(wb, buildCobSheet(cobChData, 'COBROS EN CHEQUE'), 'COBROS CHEQUES');

      // ── PAGOS MES ─────────────────────────────────────────────────────────
      const pagosBData = (pagosB || []).map(r => [
        r.beneficiario || r.concepto || '', r.fecha || '', n(r.monto), r.forma_pago || '',
      ]);
      const saldoReal = saldoConfig?.valor?.saldo ? parseFloat(saldoConfig.valor.saldo) : '';
      const wsPagos = XLSX.utils.aoa_to_sheet([
        ['PAGOS PROVEEDORES/ BANCOS', '', '', ''],
        ...pagosBData,
        ['', '', n(sum(pagosB, 'monto')), 'TOTAL'],
        ['', '', '', ''], ['', '', '', ''], ['', '', '', ''],
        [`SALDO AL ${ultimoDia} ${mesNombre} ${año} CUENTA CORRIENTE`, '', saldoReal, ''],
      ]);
      styleRow(wsPagos, 0, 4, TITLE);
      styleRow(wsPagos, 1 + pagosBData.length, 4, YELLOW);
      wsPagos['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsPagos, 'PAGOS MES');

      // ── OTROS PAGOS PERSONALES ────────────────────────────────────────────
      const secciones = [
        { label: 'PAGOS PRESTAMO Y TARJETA',     lista: (pagosP || []).filter(p => ['prestamos', 'tarjetas'].includes(p.categoria)) },
        { label: 'PAGOS GASTOS PERSONALES',       lista: (pagosP || []).filter(p => p.categoria === 'gastos_personal') },
        { label: 'PAGOS OTROS GASTOS PERSONALES', lista: (pagosP || []).filter(p => p.categoria === 'otros') },
      ];

      const otrosPRows = [];
      const otrosPStyles = [];
      let rowPtr = 0;
      for (const sec of secciones) {
        const data = sec.lista.map(r => [r.beneficiario || r.concepto || '', r.fecha || '', n(r.monto)]);
        const total = n(data.reduce((t, r) => t + parseFloat(r[2] || 0), 0));
        otrosPStyles.push({ titleRow: rowPtr, hdrRow: rowPtr + 1, totRow: rowPtr + 2 + data.length });
        otrosPRows.push([sec.label, '', ''], ['NOMBRE', 'FECHA', 'VALOR'], ...data, ['', 'TOTAL', total], ['', '', ''], ['', '', '']);
        rowPtr += 2 + data.length + 3;
      }
      const wsOtros = XLSX.utils.aoa_to_sheet(otrosPRows);
      for (const s of otrosPStyles) {
        styleRow(wsOtros, s.titleRow, 3, TITLE);
        styleRow(wsOtros, s.hdrRow,   3, BLUE_HDR);
        styleRow(wsOtros, s.totRow,   3, YELLOW);
      }
      wsOtros['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsOtros, 'OTROS PAGOS PERSONALES');

      // ── COMPRAS ───────────────────────────────────────────────────────────
      const compConData = (compras || []).filter(c => c.tiene_factura).map(r => [
        r.fecha || '', r.proveedores?.ruc || '', r.proveedor_nombre || '', r.numero_factura || '', n(r.total),
      ]);
      const compSinData = (compras || []).filter(c => !c.tiene_factura).map(r => [
        r.fecha || '', r.proveedor_nombre || '', n(r.total),
      ]);
      const compConTotal = n(compConData.reduce((t, r) => t + parseFloat(r[4] || 0), 0));
      const compSinTotal = n(compSinData.reduce((t, r) => t + parseFloat(r[2] || 0), 0));

      const wsComp = XLSX.utils.aoa_to_sheet([
        ['COMPRAS CON FACTURA', '', '', '', ''],
        ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR'],
        ...compConData,
        ['', '', '', 'TOTAL', compConTotal],
      ]);
      XLSX.utils.sheet_add_aoa(wsComp, [
        ['COMPRAS SIN FACTURA', '', ''],
        ['FECHA', 'PROVEEDOR', 'VALOR'],
        ...compSinData,
        ['', 'TOTAL', compSinTotal],
      ], { origin: 'G1' });
      styleRow(wsComp, 0, 5, YELLOW);
      styleRow(wsComp, 1, 5, BLUE_HDR);
      styleRow(wsComp, 2 + compConData.length, 5, YELLOW);
      styleRow(wsComp, 0, 3, YELLOW, 6);
      styleRow(wsComp, 1, 3, BLUE_HDR, 6);
      styleRow(wsComp, 2 + compSinData.length, 3, YELLOW, 6);
      wsComp['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 32 }, { wch: 22 }, { wch: 13 }, { wch: 3 },
        { wch: 12 }, { wch: 32 }, { wch: 13 },
      ];
      XLSX.utils.book_append_sheet(wb, wsComp, 'COMPRAS');

      // ── COMPRAS -PERSONAL ─────────────────────────────────────────────────
      const wsCompP = XLSX.utils.aoa_to_sheet([
        ['FACTURAS GASTOS PERSONALES', '', '', '', '', ''],
        ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', 'DETALLE'],
        ['', '', '', 'TOTAL', 0, ''],
      ]);
      styleRow(wsCompP, 0, 6, YELLOW);
      styleRow(wsCompP, 1, 6, BLUE_HDR);
      styleRow(wsCompP, 2, 6, YELLOW);
      wsCompP['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 32 }, { wch: 22 }, { wch: 13 }, { wch: 55 }];
      XLSX.utils.book_append_sheet(wb, wsCompP, 'COMPRAS -PERSONAL');

      XLSX.writeFile(wb, `Talonario_${MESES[mes - 1]}_${año}.xlsx`, { bookType: 'xlsx', cellStyles: true });

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
