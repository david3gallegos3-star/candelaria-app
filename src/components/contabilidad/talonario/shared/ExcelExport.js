import React, { useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { calcularNetoBancoMes, calcularSaldoCalculado } from '../../../../utils/saldoBanco';

export default function ExcelExport() {
  const { mes, año, fechaDesde, fechaHasta, MESES } = useTalonario();
  const [generando, setGenerando] = useState(false);

  async function descargar() {
    setGenerando(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const periodo   = `${año}-${String(mes).padStart(2, '0')}`;
      const ultimoDia = new Date(año, mes, 0).getDate();
      const mesNombre = MESES[mes - 1].toUpperCase();

      // ── Queries ────────────────────────────────────────────────────────────
      const [
        { data: cobros },
        { data: cajas },
        { data: compras },
        { data: pagosB },
        { data: pagosP },
        { data: otrosI },
        { data: comprasPersonal },
        { data: nomina },
        { data: facturas },
        { data: cxc },
        { data: saldoConfig },
        { data: notasCredito },
      ] = await Promise.all([
        supabase.from('cobros')
          .select('fecha,monto,forma_pago,observaciones,clientes(nombre),cuentas_cobrar(monto_total),facturas(numero)')
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
        supabase.from('caja_chica').select('id,fecha')
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
        supabase.from('compras')
          .select('fecha,total,tiene_factura,numero_factura,proveedor_nombre,forma_pago,proveedores(ruc)')
          .eq('es_personal', false)
          .neq('estado', 'anulada')
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
        supabase.from('talonario_pagos_banco').select('*').eq('mes', mes).eq('año', año).order('fecha'),
        supabase.from('talonario_pagos_personales').select('*').eq('mes', mes).eq('año', año).order('categoria').order('fecha'),
        supabase.from('talonario_otros_ingresos').select('*').eq('mes', mes).eq('año', año).order('fecha'),
        supabase.from('talonario_registro_facturas_dueno')
          .select('fecha,ruc,proveedor,numero_factura,valor,detalle')
          .eq('mes', mes).eq('año', año).order('fecha'),
        supabase.from('nomina').select('sueldo_prop,iess_patronal').eq('periodo', periodo),
        supabase.from('facturas').select('total,forma_pago')
          .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59')
          .neq('estado', 'anulada'),
        supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').in('estado', ['pendiente', 'parcial']),
        supabase.from('config_contabilidad').select('valor')
          .eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
        supabase.from('notas_credito').select('total').eq('es_manual', false)
          .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59'),
      ]);

      const sum = (arr, campo) => parseFloat(((arr || []).reduce((t, r) => t + parseFloat(r[campo] || 0), 0)).toFixed(2));
      const n = v => parseFloat((v || 0).toFixed(2));

      const cajaIds = (cajas || []).map(c => c.id);
      const { data: gastos } = cajaIds.length > 0
        ? await supabase.from('caja_gastos').select('valor,detalle,proveedor,caja_id').in('caja_id', cajaIds)
        : { data: [] };
      const cajaFechaMap = Object.fromEntries((cajas || []).map(c => [c.id, c.fecha]));

      const { neto: netoBancoMes } = await calcularNetoBancoMes(año, mes);
      const { saldoCalculado } = await calcularSaldoCalculado(año, mes, netoBancoMes);
      const saldoReal = saldoConfig?.valor?.saldo ? parseFloat(saldoConfig.valor.saldo) : null;
      const diferencia = saldoReal !== null ? n(saldoReal - saldoCalculado) : null;

      // ── Totales calculados ─────────────────────────────────────────────────
      const totalVentas  = n(sum(facturas, 'total') - sum(notasCredito, 'total'));
      const totalOtrosI  = sum(otrosI, 'monto');
      const totalGastos  = sum(gastos, 'valor');
      const comprasCon   = n((compras || []).filter(c => c.tiene_factura).reduce((t, r) => t + n(r.total), 0));
      const comprasSin   = n((compras || []).filter(c => !c.tiene_factura).reduce((t, r) => t + n(r.total), 0));
      const totalSueldos = sum(nomina, 'sueldo_prop');
      const totalIess    = sum(nomina, 'iess_patronal');
      const totalPagosB  = sum(pagosB, 'monto');
      const totalPagosP  = sum(pagosP, 'monto');
      const cobroEfect   = n((cobros || []).filter(c => c.forma_pago === 'efectivo').reduce((t, r) => t + n(r.monto), 0));
      const cobroCheq    = n((cobros || []).filter(c => c.forma_pago === 'cheque').reduce((t, r) => t + n(r.monto), 0));
      const cobroTransf  = n(
        (cobros || []).filter(c => ['transferencia', 'deposito', 'tarjeta_credito'].includes(c.forma_pago)).reduce((t, r) => t + n(r.monto), 0)
        + (facturas || []).filter(f => ['transferencia', 'tarjeta_credito'].includes(f.forma_pago)).reduce((t, f) => t + n(f.total), 0)
      );
      const cxcPend        = n((cxc || []).reduce((t, r) => t + n(r.monto_total) - n(r.monto_cobrado), 0));
      const pagosPT        = n((pagosP || []).filter(p => ['prestamos', 'tarjetas'].includes(p.categoria)).reduce((t, r) => t + n(r.monto), 0));
      const pagosGP        = n((pagosP || []).filter(p => p.categoria === 'gastos_personal').reduce((t, r) => t + n(r.monto), 0));
      const pagosOtros     = n((pagosP || []).filter(p => p.categoria === 'otros').reduce((t, r) => t + n(r.monto), 0));
      const pagosPrestamos = n((pagosP || []).filter(p => p.categoria === 'prestamos').reduce((t, r) => t + n(r.monto), 0));
      const pagosTarjetas  = n((pagosP || []).filter(p => p.categoria === 'tarjetas').reduce((t, r) => t + n(r.monto), 0));
      const ingMes         = n(totalVentas + totalOtrosI);
      const egrMes         = n(totalGastos + comprasCon + comprasSin + totalSueldos + totalIess + totalPagosB + totalPagosP);
      const ingCons        = n(cobroEfect + cobroCheq + cobroTransf + totalOtrosI);
      const egrCons        = n(totalGastos + totalPagosB + pagosPT + pagosGP + pagosOtros);

      // ── ExcelJS helpers ────────────────────────────────────────────────────
      const COLOR = {
        NAVY: 'FF1A2A4A', BLUE: 'FF2980B9', WHITE: 'FFFFFFFF', DARK: 'FF1A1A2E',
        GREEN_BG: 'FFC6EFCE', GREEN_FG: 'FF155724',
        RED_BG:   'FFFFC7CE', RED_FG:   'FF9B2335',
        YELL_BG:  'FFFFFF00', YELL_FG:  'FF7D6608',
        COL_HDR:  'FFBDD7EE',
      };
      const NUM_FMT = '$#,##0.00';

      function colLetter(c) {
        let s = '';
        while (c > 0) { s = String.fromCharCode(((c - 1) % 26) + 65) + s; c = Math.floor((c - 1) / 26); }
        return s;
      }
      function rng(r1, c1, r2, c2) { return `${colLetter(c1)}${r1}:${colLetter(c2)}${r2}`; }
      function solid(cell, argb)    { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }
      function bold(cell, size = 11){ cell.font = { ...(cell.font || {}), bold: true, size }; }
      function white(cell)          { cell.font = { ...(cell.font || {}), color: { argb: COLOR.WHITE } }; }
      function center(cell)         { cell.alignment = { ...(cell.alignment || {}), horizontal: 'center', vertical: 'middle' }; }
      function right(cell)          { cell.alignment = { ...(cell.alignment || {}), horizontal: 'right' }; }
      function numVal(cell, v)      { cell.value = v; cell.numFmt = NUM_FMT; right(cell); }
      function formulaVal(cell, formula, result) { cell.value = { formula, result }; cell.numFmt = NUM_FMT; right(cell); }
      function colHdr(cell, text)   { cell.value = text; solid(cell, COLOR.COL_HDR); bold(cell); center(cell); }

      function tableTitle(ws, row, c1, c2, text, bgArgb, rowH = 22) {
        ws.mergeCells(rng(row, c1, row, c2));
        const cell = ws.getCell(row, c1);
        cell.value = text;
        solid(cell, bgArgb);
        bold(cell, 13);
        white(cell);
        center(cell);
        ws.getRow(row).height = rowH;
      }

      function colorRow(ws, row, c1, c2, bgArgb, fgArgb) {
        for (let c = c1; c <= c2; c++) {
          const cell = ws.getCell(row, c);
          solid(cell, bgArgb);
          cell.font = { bold: true, color: { argb: fgArgb } };
        }
      }

      function boxBorder(ws, r1, r2, c1, c2) {
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            const cell = ws.getCell(r, c);
            const b = { ...(cell.border || {}) };
            if (r === r1) b.top    = { style: 'medium' };
            if (r === r2) b.bottom = { style: 'medium' };
            if (c === c1) b.left   = { style: 'medium' };
            if (c === c2) b.right  = { style: 'medium' };
            if (Object.keys(b).length) cell.border = b;
          }
        }
      }

      function setCols(ws, widths) { widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; }); }

      const wb = new ExcelJS.Workbook();
      wb.calcProperties.fullCalcOnLoad = true;

      // RESUMEN se crea primero para quedar como primera pestaña — se llena al final
      const wsRes = wb.addWorksheet('RESUMEN');
      setCols(wsRes, [42, 14, 4, 4, 42, 14]);

      // ── GASTOS ─────────────────────────────────────────────────────────────
      const wsGastos = wb.addWorksheet('GASTOS');
      setCols(wsGastos, [25, 12, 45, 13]);

      tableTitle(wsGastos, 1, 1, 4, 'GASTOS EN EFECTIVO', COLOR.NAVY);
      wsGastos.getCell(1, 1).font = { bold: true, color: { argb: COLOR.WHITE }, size: 12 };
      ['PROVEEDOR', 'FECHA', 'DETALLE', 'VALOR'].forEach((h, i) => colHdr(wsGastos.getCell(2, i + 1), h));

      let gastRow = 3;
      (gastos || []).forEach(r => {
        wsGastos.getCell(gastRow, 1).value = r.proveedor || '';
        wsGastos.getCell(gastRow, 2).value = cajaFechaMap[r.caja_id] || '';
        wsGastos.getCell(gastRow, 3).value = r.detalle || '';
        numVal(wsGastos.getCell(gastRow, 4), n(r.valor));
        gastRow++;
      });
      const gastTotalRow = gastRow;
      wsGastos.getCell(gastRow, 3).value = 'TOTAL';
      if (gastRow > 3)
        formulaVal(wsGastos.getCell(gastRow, 4), `SUM(D3:D${gastRow - 1})`, sum(gastos, 'valor'));
      else
        numVal(wsGastos.getCell(gastRow, 4), 0);
      colorRow(wsGastos, gastRow, 1, 4, COLOR.YELL_BG, COLOR.YELL_FG);
      wsGastos.getCell(gastRow, 4).numFmt = NUM_FMT;

      // ── COBROS helper ──────────────────────────────────────────────────────
      const HDR_COB = ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero_venta_pedido'];

      function buildCobSheet(name, list, titulo) {
        const ws = wb.addWorksheet(name);
        setCols(ws, [16, 30, 14, 14, 14, 26]);
        tableTitle(ws, 1, 1, 6, titulo, COLOR.NAVY);
        HDR_COB.forEach((h, i) => colHdr(ws.getCell(2, i + 1), h));
        let row = 3;
        list.forEach(r => {
          ws.getCell(row, 1).value = r.forma_pago?.toUpperCase() || '';
          ws.getCell(row, 2).value = r.clientes?.nombre || '';
          numVal(ws.getCell(row, 3), n(r.cuentas_cobrar?.monto_total ?? r.monto));
          numVal(ws.getCell(row, 4), n(r.monto));
          ws.getCell(row, 5).value = r.fecha || '';
          ws.getCell(row, 6).value = r.facturas?.numero || '';
          row++;
        });
        const total = n(list.reduce((t, r) => t + n(r.monto), 0));
        ws.getCell(row, 3).value = 'TOTAL';
        if (row > 3)
          formulaVal(ws.getCell(row, 4), `SUM(D3:D${row - 1})`, total);
        else
          numVal(ws.getCell(row, 4), total);
        colorRow(ws, row, 1, 6, COLOR.YELL_BG, COLOR.YELL_FG);
        ws.getCell(row, 4).numFmt = NUM_FMT;
        return { ws, totalRow: row };
      }

      const { totalRow: cobEfectTotalRow } = buildCobSheet(
        'COBROS EFECTIVO', (cobros || []).filter(c => c.forma_pago === 'efectivo'), 'COBROS EN EFECTIVO'
      );

      // ── COBROS TRANSF DEPO (dos tablas lado a lado) ────────────────────────
      const wsCobTr = wb.addWorksheet('COBROS TRANSF DEPO');
      setCols(wsCobTr, [16, 30, 14, 14, 14, 26, 4, 16, 30, 14, 14, 14, 26]);

      const cobTrList  = (cobros || []).filter(c => c.forma_pago === 'transferencia');
      const cobDepList = (cobros || []).filter(c => ['deposito', 'tarjeta_credito', 'tarjeta'].includes(c.forma_pago));

      function buildCobSide(ws, list, titulo, startCol) {
        tableTitle(ws, 1, startCol, startCol + 5, titulo, COLOR.NAVY);
        HDR_COB.forEach((h, i) => colHdr(ws.getCell(2, startCol + i), h));
        let row = 3;
        list.forEach(r => {
          ws.getCell(row, startCol).value = r.forma_pago?.toUpperCase() || '';
          ws.getCell(row, startCol + 1).value = r.clientes?.nombre || '';
          numVal(ws.getCell(row, startCol + 2), n(r.cuentas_cobrar?.monto_total ?? r.monto));
          numVal(ws.getCell(row, startCol + 3), n(r.monto));
          ws.getCell(row, startCol + 4).value = r.fecha || '';
          ws.getCell(row, startCol + 5).value = r.facturas?.numero || '';
          row++;
        });
        const valueCol = startCol + 3;
        const total = n(list.reduce((t, r) => t + n(r.monto), 0));
        ws.getCell(row, startCol + 2).value = 'TOTAL';
        if (row > 3)
          formulaVal(ws.getCell(row, valueCol), `SUM(${colLetter(valueCol)}3:${colLetter(valueCol)}${row - 1})`, total);
        else
          numVal(ws.getCell(row, valueCol), total);
        colorRow(ws, row, startCol, startCol + 5, COLOR.YELL_BG, COLOR.YELL_FG);
        ws.getCell(row, valueCol).numFmt = NUM_FMT;
        return row;
      }

      const cobTrTotalRow  = buildCobSide(wsCobTr, cobTrList,  'COBROS EN TRANSFERENCIA',      1);
      const cobDepTotalRow = buildCobSide(wsCobTr, cobDepList, 'COBROS EN DEPOSITO Y TARJETA', 8);

      const { totalRow: cobCheqTotalRow } = buildCobSheet(
        'COBROS CHEQUES', (cobros || []).filter(c => c.forma_pago === 'cheque'), 'COBROS EN CHEQUE'
      );

      // ── PAGOS MES ──────────────────────────────────────────────────────────
      const wsPagos = wb.addWorksheet('PAGOS MES');
      setCols(wsPagos, [42, 14, 14, 22]);
      tableTitle(wsPagos, 1, 1, 4, 'PAGOS PROVEEDORES/ BANCOS', COLOR.NAVY);

      let pagRow = 2;
      (pagosB || []).forEach(r => {
        wsPagos.getCell(pagRow, 1).value = r.beneficiario || r.concepto || '';
        wsPagos.getCell(pagRow, 2).value = r.fecha || '';
        numVal(wsPagos.getCell(pagRow, 3), n(r.monto));
        wsPagos.getCell(pagRow, 4).value = r.forma_pago || '';
        pagRow++;
      });
      const pagosTotalRow = pagRow;
      wsPagos.getCell(pagRow, 2).value = 'TOTAL';
      if (pagRow > 2)
        formulaVal(wsPagos.getCell(pagRow, 3), `SUM(C2:C${pagRow - 1})`, sum(pagosB, 'monto'));
      else
        numVal(wsPagos.getCell(pagRow, 3), 0);
      colorRow(wsPagos, pagRow, 1, 4, COLOR.YELL_BG, COLOR.YELL_FG);
      wsPagos.getCell(pagRow, 3).numFmt = NUM_FMT;
      pagRow += 4;

      wsPagos.getCell(pagRow, 1).value = `SALDO AL ${ultimoDia} ${mesNombre} ${año} CUENTA CORRIENTE`;
      bold(wsPagos.getCell(pagRow, 1));
      if (saldoReal !== null) numVal(wsPagos.getCell(pagRow, 3), saldoReal);

      // ── OTROS PAGOS PERSONALES ─────────────────────────────────────────────
      const wsOtros = wb.addWorksheet('OTROS PAGOS PERSONALES');
      setCols(wsOtros, [34, 14, 14]);

      const secsPP = [
        { titulo: 'PAGOS PRESTAMO Y TARJETA',     lista: (pagosP || []).filter(p => ['prestamos', 'tarjetas'].includes(p.categoria)) },
        { titulo: 'PAGOS GASTOS PERSONALES',       lista: (pagosP || []).filter(p => p.categoria === 'gastos_personal') },
        { titulo: 'PAGOS OTROS GASTOS PERSONALES', lista: (pagosP || []).filter(p => p.categoria === 'otros') },
      ];

      let otrosRow = 1;
      let pagosPTotalRow, pagosGPTotalRow, pagosOtrosTotalRow;
      secsPP.forEach((sec, idx) => {
        tableTitle(wsOtros, otrosRow, 1, 3, sec.titulo, COLOR.NAVY); otrosRow++;
        ['NOMBRE', 'FECHA', 'VALOR'].forEach((h, i) => colHdr(wsOtros.getCell(otrosRow, i + 1), h)); otrosRow++;
        const dataStartRow = otrosRow;
        sec.lista.forEach(r => {
          wsOtros.getCell(otrosRow, 1).value = r.beneficiario || r.concepto || '';
          wsOtros.getCell(otrosRow, 2).value = r.fecha || '';
          numVal(wsOtros.getCell(otrosRow, 3), n(r.monto));
          otrosRow++;
        });
        const secTotal = n(sec.lista.reduce((t, r) => t + n(r.monto), 0));
        wsOtros.getCell(otrosRow, 2).value = 'TOTAL';
        if (otrosRow > dataStartRow)
          formulaVal(wsOtros.getCell(otrosRow, 3), `SUM(C${dataStartRow}:C${otrosRow - 1})`, secTotal);
        else
          numVal(wsOtros.getCell(otrosRow, 3), 0);
        colorRow(wsOtros, otrosRow, 1, 3, COLOR.YELL_BG, COLOR.YELL_FG);
        wsOtros.getCell(otrosRow, 3).numFmt = NUM_FMT;
        if (idx === 0) pagosPTotalRow  = otrosRow;
        else if (idx === 1) pagosGPTotalRow  = otrosRow;
        else                pagosOtrosTotalRow = otrosRow;
        otrosRow += 3;
      });

      // ── COMPRAS (dos tablas lado a lado) ───────────────────────────────────
      const wsComp = wb.addWorksheet('COMPRAS');
      setCols(wsComp, [12, 16, 32, 22, 13, 4, 12, 32, 13]);

      const compConList = (compras || []).filter(c => c.tiene_factura);
      const compSinList = (compras || []).filter(c => !c.tiene_factura);

      tableTitle(wsComp, 1, 1, 5, 'COMPRAS CON FACTURA', COLOR.NAVY);
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR'].forEach((h, i) => colHdr(wsComp.getCell(2, i + 1), h));
      let compRow = 3;
      compConList.forEach(r => {
        wsComp.getCell(compRow, 1).value = r.fecha || '';
        wsComp.getCell(compRow, 2).value = r.proveedores?.ruc || '';
        wsComp.getCell(compRow, 3).value = r.proveedor_nombre || '';
        wsComp.getCell(compRow, 4).value = r.numero_factura || '';
        numVal(wsComp.getCell(compRow, 5), n(r.total));
        compRow++;
      });
      const compConTotalRow = compRow;
      const compConTotal = n(compConList.reduce((t, r) => t + n(r.total), 0));
      wsComp.getCell(compRow, 4).value = 'TOTAL';
      if (compRow > 3)
        formulaVal(wsComp.getCell(compRow, 5), `SUM(E3:E${compRow - 1})`, compConTotal);
      else
        numVal(wsComp.getCell(compRow, 5), compConTotal);
      colorRow(wsComp, compRow, 1, 5, COLOR.YELL_BG, COLOR.YELL_FG);
      wsComp.getCell(compRow, 5).numFmt = NUM_FMT;

      tableTitle(wsComp, 1, 7, 9, 'COMPRAS SIN FACTURA', COLOR.NAVY);
      ['FECHA', 'PROVEEDOR', 'VALOR'].forEach((h, i) => colHdr(wsComp.getCell(2, 7 + i), h));
      let compSinRow = 3;
      compSinList.forEach(r => {
        wsComp.getCell(compSinRow, 7).value = r.fecha || '';
        wsComp.getCell(compSinRow, 8).value = r.proveedor_nombre || '';
        numVal(wsComp.getCell(compSinRow, 9), n(r.total));
        compSinRow++;
      });
      const compSinTotalRow = compSinRow;
      const compSinTotal = n(compSinList.reduce((t, r) => t + n(r.total), 0));
      wsComp.getCell(compSinRow, 8).value = 'TOTAL';
      if (compSinRow > 3)
        formulaVal(wsComp.getCell(compSinRow, 9), `SUM(I3:I${compSinRow - 1})`, compSinTotal);
      else
        numVal(wsComp.getCell(compSinRow, 9), compSinTotal);
      colorRow(wsComp, compSinRow, 7, 9, COLOR.YELL_BG, COLOR.YELL_FG);
      wsComp.getCell(compSinRow, 9).numFmt = NUM_FMT;

      // ── COMPRAS -PERSONAL ─────────────────────────────────────────────────
      const wsCompP = wb.addWorksheet('COMPRAS -PERSONAL');
      setCols(wsCompP, [12, 16, 32, 22, 13, 55]);
      tableTitle(wsCompP, 1, 1, 6, 'FACTURAS GASTOS PERSONALES', COLOR.NAVY);
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', 'DETALLE'].forEach((h, i) => colHdr(wsCompP.getCell(2, i + 1), h));
      let compPRow = 3;
      (comprasPersonal || []).forEach(r => {
        wsCompP.getCell(compPRow, 1).value = r.fecha || '';
        wsCompP.getCell(compPRow, 2).value = r.ruc || '';
        wsCompP.getCell(compPRow, 3).value = r.proveedor || '';
        wsCompP.getCell(compPRow, 4).value = r.numero_factura || '';
        numVal(wsCompP.getCell(compPRow, 5), n(r.valor));
        wsCompP.getCell(compPRow, 6).value = r.detalle || '';
        compPRow++;
      });
      const compPTotal = n((comprasPersonal || []).reduce((t, r) => t + n(r.valor), 0));
      wsCompP.getCell(compPRow, 4).value = 'TOTAL';
      if (compPRow > 3)
        formulaVal(wsCompP.getCell(compPRow, 5), `SUM(E3:E${compPRow - 1})`, compPTotal);
      else
        numVal(wsCompP.getCell(compPRow, 5), compPTotal);
      colorRow(wsCompP, compPRow, 1, 6, COLOR.YELL_BG, COLOR.YELL_FG);
      wsCompP.getCell(compPRow, 5).numFmt = NUM_FMT;

      // ── FILL RESUMEN (todas las referencias de hojas ya están disponibles) ──
      tableTitle(wsRes, 2, 1, 2, `${mesNombre} ${año}`, COLOR.NAVY, 26);
      tableTitle(wsRes, 2, 5, 6, 'CONSOLIDADO', COLOR.BLUE, 26);

      wsRes.mergeCells(rng(3, 1, 3, 2));
      wsRes.getCell(3, 1).value = 'EMBUTIDOS Y JAMONES CANDELARIA';
      bold(wsRes.getCell(3, 1)); center(wsRes.getCell(3, 1));
      wsRes.mergeCells(rng(3, 5, 3, 6));
      wsRes.getCell(3, 5).value = 'EMBUTIDOS Y JAMONES CANDELARIA';
      bold(wsRes.getCell(3, 5)); center(wsRes.getCell(3, 5));

      wsRes.getCell(5, 1).value = 'INGRESOS'; bold(wsRes.getCell(5, 1));
      wsRes.getCell(5, 5).value = 'INGRESOS'; bold(wsRes.getCell(5, 5));

      // Ingresos izquierda (MES)
      wsRes.getCell(6, 1).value = `(+) TOTAL VENTAS DEL 01 AL ${ultimoDia} ${mesNombre}`;
      numVal(wsRes.getCell(6, 2), totalVentas);

      wsRes.getCell(7, 1).value = '(+) OTROS INGRESOS';
      numVal(wsRes.getCell(7, 2), totalOtrosI);

      wsRes.getCell(8, 1).value = 'TOTAL INGRESOS';
      formulaVal(wsRes.getCell(8, 2), 'B6+B7', ingMes);
      colorRow(wsRes, 8, 1, 2, COLOR.GREEN_BG, COLOR.GREEN_FG);
      wsRes.getCell(8, 2).numFmt = NUM_FMT;

      // Ingresos derecha (CONSOLIDADO)
      wsRes.getCell(6, 5).value = '(+) COBROS EFECTIVO';
      formulaVal(wsRes.getCell(6, 6), `'COBROS EFECTIVO'!D${cobEfectTotalRow}`, cobroEfect);

      wsRes.getCell(7, 5).value = '(+) COBROS CHEQUE';
      formulaVal(wsRes.getCell(7, 6), `'COBROS CHEQUES'!D${cobCheqTotalRow}`, cobroCheq);

      wsRes.getCell(8, 5).value = '(+) COBROS TRANSFERENCIA - DEPOSITOS';
      numVal(wsRes.getCell(8, 6), cobroTransf);

      wsRes.getCell(9, 5).value = '(+) OTROS INGRESOS';
      numVal(wsRes.getCell(9, 6), totalOtrosI);

      wsRes.getCell(10, 5).value = 'TOTAL';
      formulaVal(wsRes.getCell(10, 6), 'F6+F7+F8+F9', ingCons);
      colorRow(wsRes, 10, 5, 6, COLOR.GREEN_BG, COLOR.GREEN_FG);
      wsRes.getCell(10, 6).numFmt = NUM_FMT;

      wsRes.getCell(12, 1).value = 'EGRESOS'; bold(wsRes.getCell(12, 1));
      wsRes.getCell(12, 5).value = 'EGRESOS'; bold(wsRes.getCell(12, 5));

      // Egresos izquierda (MES) — fórmula donde hay hoja fuente, estático donde no
      const egresosIzq = [
        [13, '(-) GASTOS EFECTIVO',     `'GASTOS'!D${gastTotalRow}`,   totalGastos],
        [14, '(-) PROVEEDORES CON FACT', `'COMPRAS'!E${compConTotalRow}`, comprasCon],
        [15, '(-) PROVEEDORES SIN FACT', `'COMPRAS'!I${compSinTotalRow}`, comprasSin],
        [16, '(-) SUELDOS',              null,                           totalSueldos],
        [17, '(-) IESS',                 null,                           totalIess],
        [18, '(-) PAGOS DEL MES',        `'PAGOS MES'!C${pagosTotalRow}`, totalPagosB],
        [19, '(-) PRÉSTAMOS',            null,                           pagosPrestamos],
        [20, '(-) TARJETAS',             null,                           pagosTarjetas],
        [21, '(-) PAGOS PERSONALES',
          `'OTROS PAGOS PERSONALES'!C${pagosGPTotalRow}+'OTROS PAGOS PERSONALES'!C${pagosOtrosTotalRow}`,
          n(pagosGP + pagosOtros)],
      ];
      egresosIzq.forEach(([row, lbl, formula, val]) => {
        wsRes.getCell(row, 1).value = lbl;
        if (formula) formulaVal(wsRes.getCell(row, 2), formula, val);
        else numVal(wsRes.getCell(row, 2), val);
      });

      wsRes.getCell(23, 1).value = 'TOTAL EGRESOS';
      formulaVal(wsRes.getCell(23, 2), 'B13+B14+B15+B16+B17+B18+B19+B20+B21', egrMes);
      colorRow(wsRes, 23, 1, 2, COLOR.RED_BG, COLOR.RED_FG);
      wsRes.getCell(23, 2).numFmt = NUM_FMT;

      wsRes.getCell(25, 1).value = '(UTILIDAD BRUTA) INGRESOS - EGRESOS';
      formulaVal(wsRes.getCell(25, 2), 'B8-B23', n(ingMes - egrMes));
      colorRow(wsRes, 25, 1, 2, COLOR.YELL_BG, COLOR.YELL_FG);
      wsRes.getCell(25, 2).numFmt = NUM_FMT;

      // Egresos derecha (CONSOLIDADO)
      const egresosDer = [
        [13, '(-) GASTOS EN EFECTIVO',                      `'GASTOS'!D${gastTotalRow}`,        totalGastos],
        [14, '(-) PAGOS CON BANCOS (PROVEEDORES, SUELDOS)', `'PAGOS MES'!C${pagosTotalRow}`,     totalPagosB],
        [15, '(-) TARJETAS, PRESTAMOS, AHORRO',             `'OTROS PAGOS PERSONALES'!C${pagosPTotalRow}`, pagosPT],
        [16, '(-) GASTOS PERSONALES',
          `'OTROS PAGOS PERSONALES'!C${pagosGPTotalRow}+'OTROS PAGOS PERSONALES'!C${pagosOtrosTotalRow}`,
          n(pagosGP + pagosOtros)],
        [17, '(-) CRÉDITOS EMPLEADOS', null, 0],
      ];
      egresosDer.forEach(([row, lbl, formula, val]) => {
        wsRes.getCell(row, 5).value = lbl;
        if (formula) formulaVal(wsRes.getCell(row, 6), formula, val);
        else numVal(wsRes.getCell(row, 6), val);
      });

      wsRes.getCell(21, 5).value = 'TOTAL';
      formulaVal(wsRes.getCell(21, 6), 'F13+F14+F15+F16+F17', egrCons);
      colorRow(wsRes, 21, 5, 6, COLOR.RED_BG, COLOR.RED_FG);
      wsRes.getCell(21, 6).numFmt = NUM_FMT;

      // Activos / CxC / CxP
      wsRes.getCell(23, 5).value = 'ACTIVOS'; bold(wsRes.getCell(23, 5));
      wsRes.getCell(24, 5).value = '(+) CUENTAS POR COBRAR';
      numVal(wsRes.getCell(24, 6), cxcPend);
      wsRes.getCell(25, 5).value = '(-) CUENTAS POR PAGAR';
      numVal(wsRes.getCell(25, 6), 0);

      wsRes.getCell(26, 5).value = 'TOTAL';
      formulaVal(wsRes.getCell(26, 6), 'F24-F25', cxcPend);
      colorRow(wsRes, 26, 5, 6, COLOR.GREEN_BG, COLOR.GREEN_FG);
      wsRes.getCell(26, 6).numFmt = NUM_FMT;

      // Saldo banco
      wsRes.getCell(28, 5).value = 'SALDO BANCO CALCULADO'; bold(wsRes.getCell(28, 5));
      numVal(wsRes.getCell(28, 6), n(saldoCalculado));

      wsRes.getCell(29, 5).value = 'SALDO BANCO REAL'; bold(wsRes.getCell(29, 5));
      if (saldoReal !== null) {
        numVal(wsRes.getCell(29, 6), saldoReal);
      } else {
        wsRes.getCell(29, 6).value = '—';
      }

      if (diferencia !== null) {
        wsRes.getCell(30, 5).value = 'DIFERENCIA'; bold(wsRes.getCell(30, 5));
        formulaVal(wsRes.getCell(30, 6), 'F29-F28', diferencia);
        const cuadra = Math.abs(diferencia) < 0.01;
        colorRow(wsRes, 30, 5, 6,
          cuadra ? COLOR.GREEN_BG : (diferencia < 0 ? COLOR.RED_BG : 'FFFDE8A0'),
          cuadra ? COLOR.GREEN_FG : (diferencia < 0 ? COLOR.RED_FG : COLOR.YELL_FG)
        );
        wsRes.getCell(30, 6).numFmt = NUM_FMT;
      }

      boxBorder(wsRes, 2, 25, 1, 2);
      boxBorder(wsRes, 2, diferencia !== null ? 30 : 29, 5, 6);

      // ── Download ────────────────────────────────────────────────────────────
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Talonario_${MESES[mes - 1]}_${año}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (e) {
      alert('Error al generar Excel: ' + e.message);
      console.error(e);
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
