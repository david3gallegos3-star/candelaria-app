import * as XLSX from 'xlsx';
import { limpiarMonto, parsearFecha, filaValida, detectarMesAnio, parseTablaSimple, parseCobrosEfectivo, parseCobrosCheques, parseTablaDoble, parseCobrosTransferencia, parseCompras, parseOtrosPagosPersonales, parseComprasPersonal } from './importExcelHistorial';

describe('limpiarMonto', () => {
  test('limpia simbolo de moneda, comas de miles y espacios', () => {
    expect(limpiarMonto(' $1,234.56 ')).toBe(1234.56);
  });
  test('valor vacio o invalido da 0', () => {
    expect(limpiarMonto('')).toBe(0);
    expect(limpiarMonto(undefined)).toBe(0);
    expect(limpiarMonto('abc')).toBe(0);
  });
  test('numero simple sin simbolos', () => {
    expect(limpiarMonto('66')).toBe(66);
  });
});

describe('parsearFecha', () => {
  test('formato MDY (mes/dia/año corto)', () => {
    expect(parsearFecha('12/3/25', 'MDY')).toBe('2025-12-03');
  });
  test('formato DMY (dia/mes/año largo, con o sin comilla)', () => {
    expect(parsearFecha("'02/12/2025", 'DMY')).toBe('2025-12-02');
    expect(parsearFecha('27/12/2025', 'DMY')).toBe('2025-12-27');
  });
  test('primer numero mayor a 12 fuerza DMY sin importar el formato pedido', () => {
    expect(parsearFecha('27/12/2025', 'MDY')).toBe('2025-12-27');
  });
  test('año de 2 digitos fuerza MDY sin importar el formato pedido (caso real: fila anomala de COMPRAS-PERSONAL)', () => {
    expect(parsearFecha('12/1/25', 'DMY')).toBe('2025-12-01');
  });
  test('fecha vacia o invalida retorna null', () => {
    expect(parsearFecha('', 'MDY')).toBeNull();
    expect(parsearFecha('no-fecha', 'MDY')).toBeNull();
  });
  test('fecha de calendario imposible retorna null en vez de inventar una fecha', () => {
    expect(parsearFecha('31/4/25', 'DMY')).toBeNull();
    expect(parsearFecha('2/30/25', 'MDY')).toBeNull();
  });
});

describe('filaValida', () => {
  test('fila con valor en la columna clave es valida', () => {
    expect(filaValida(['LARCORIER', '12/1/25', 'envio', '12.50'], 0)).toBe(true);
  });
  test('fila vacia en la columna clave no es valida', () => {
    expect(filaValida(['', '', 'TOTAL', '3495.14'], 0)).toBe(false);
  });
  test('fila donde la columna clave dice TOTAL no es valida', () => {
    expect(filaValida(['TOTAL', '', '', '3495.14'], 0)).toBe(false);
  });
});

function wbConResumen(celdaA1) {
  const ws = XLSX.utils.aoa_to_sheet([[celdaA1]]);
  return { SheetNames: ['RESUMEN'], Sheets: { RESUMEN: ws } };
}

describe('detectarMesAnio', () => {
  test('lee mes y año de la celda A1 de RESUMEN', () => {
    expect(detectarMesAnio(wbConResumen('DICIEMBRE DEL 2025'))).toEqual({ mes: 12, año: 2025 });
  });
  test('funciona con cualquier mes del año', () => {
    expect(detectarMesAnio(wbConResumen('MARZO DEL 2026'))).toEqual({ mes: 3, año: 2026 });
  });
  test('lanza error si el formato no calza', () => {
    expect(() => detectarMesAnio(wbConResumen('algo raro'))).toThrow(/No pude leer el mes\/año/);
  });
  test('lanza error si no existe la hoja RESUMEN', () => {
    expect(() => detectarMesAnio({ SheetNames: [], Sheets: {} })).toThrow(/hoja RESUMEN/);
  });
});

function wbHoja(nombreHoja, filas) {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  return { SheetNames: [nombreHoja], Sheets: { [nombreHoja]: ws } };
}

describe('parseTablaSimple', () => {
  test('parsea filas de GASTOS, ignora titulo/encabezado/total', () => {
    const wb = wbHoja('GASTOS', [
      ['GASTOS EN EFECTIVO', '', '', ''],
      ['PROVEDOR', 'FECHA', 'DETALLE', 'VALOR'],
      ['LARCORIER', '12/1/25', 'GASTO ENVIO', ' $12.50 '],
      ['MAESTRO PATRICIO', '12/1/25', 'ARREGLOS', ' $15.00 '],
      ['', '', 'TOTAL', ' $27.50 '],
    ]);
    const filas = parseTablaSimple(wb, 'GASTOS', {
      filaInicio: 2, colNombre: 0, colFecha: 1, colDetalle: 2, colValor: 3, formatoFecha: 'MDY',
    });
    expect(filas).toEqual([
      { nombre: 'LARCORIER', fecha: '2025-12-01', detalle: 'GASTO ENVIO', valor: 12.50 },
      { nombre: 'MAESTRO PATRICIO', fecha: '2025-12-01', detalle: 'ARREGLOS', valor: 15.00 },
    ]);
  });

  test('lanza error si una fila tiene monto invalido', () => {
    const wb = wbHoja('GASTOS', [
      ['GASTOS EN EFECTIVO', '', '', ''],
      ['PROVEDOR', 'FECHA', 'DETALLE', 'VALOR'],
      ['LARCORIER', '12/1/25', 'GASTO ENVIO', 'no-es-numero'],
    ]);
    expect(() => parseTablaSimple(wb, 'GASTOS', {
      filaInicio: 2, colNombre: 0, colFecha: 1, colDetalle: 2, colValor: 3, formatoFecha: 'MDY',
    })).toThrow(/GASTOS.*fila 3/i);
  });

  test('lanza error si una fila tiene fecha invalida', () => {
    const wb = wbHoja('GASTOS', [
      ['GASTOS EN EFECTIVO', '', '', ''],
      ['PROVEDOR', 'FECHA', 'DETALLE', 'VALOR'],
      ['LARCORIER', 'fecha-mala', 'GASTO ENVIO', '12.50'],
    ]);
    expect(() => parseTablaSimple(wb, 'GASTOS', {
      filaInicio: 2, colNombre: 0, colFecha: 1, colDetalle: 2, colValor: 3, formatoFecha: 'MDY',
    })).toThrow(/GASTOS.*fila 3/i);
  });
});

describe('parseCobrosEfectivo', () => {
  test('parsea filas con fecha DMY y columna de cliente', () => {
    const wb = wbHoja('COBROS EFECTIVO', [
      ['', 'COBROS EN EFECTIVO', '', '', '', ''],
      ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero_venta_pedido'],
      ['CONTADO', 'LULU SNACKS', '50', '50', "'01/12/2025", '001-002-000008756'],
    ]);
    expect(parseCobrosEfectivo(wb)).toEqual([
      { nombre: 'LULU SNACKS', fecha: '2025-12-01', valor: 50, numero: '001-002-000008756' },
    ]);
  });
});

describe('parseCobrosCheques', () => {
  test('parsea filas con fecha DMY y columna de cliente', () => {
    const wb = wbHoja('COBROS CHEQUES', [
      ['', 'COBROS EN CHEQUE', '', '', '', ''],
      ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero_venta_pedido'],
      ['CHEQUE', 'SUPER PARRILLADA CAYAMBE', '371.48', '371.48', "'09/12/2025", '001-002-000008730'],
    ]);
    expect(parseCobrosCheques(wb)).toEqual([
      { nombre: 'SUPER PARRILLADA CAYAMBE', fecha: '2025-12-09', valor: 371.48, numero: '001-002-000008730' },
    ]);
  });
});

describe('parseTablaDoble', () => {
  test('lee cada bloque de columnas con su propio fin de tabla, sin que uno corte al otro', () => {
    const wb = wbHoja('COBROS TRANSF DEPO', [
      ['', 'COBROS EN TRANSFERENCIA', '', '', '', '', '', '', 'COBROS EN DEPOSITO Y TARJETA', '', '', '', ''],
      ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero', '', '', 'forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero'],
      ['TRANSFERENCIA', 'LA TABLITA', '52.63', '52.63', "'02/12/2025", '001-1', '', '', 'DEPOSITO', 'PIZZERIA DUCHYS', '594.05', '210', "'08/12/2025", '001-2'],
      ['TRANSFERENCIA', 'ALEJANDRA', '54.5', '54.5', "'02/12/2025", '001-3', '', '', '', '', '', '', '', ''],
      ['', '', 'TOTAL', '107.13', '', '', '', '', 'TOTAL', '', '210', '', '', ''],
    ]);
    const { bloqueA, bloqueB } = parseTablaDoble(wb, 'COBROS TRANSF DEPO', {
      filaInicio: 2,
      bloqueA: { colNombre: 0, colCliente: 1, colFecha: 4, colValor: 3, colNumero: 5, formatoFecha: 'DMY' },
      bloqueB: { colNombre: 8, colCliente: 9, colFecha: 12, colValor: 11, colNumero: 13, formatoFecha: 'DMY' },
    });
    expect(bloqueA).toEqual([
      { nombre: 'TRANSFERENCIA', cliente: 'LA TABLITA', fecha: '2025-12-02', valor: 52.63, numero: '001-1' },
      { nombre: 'TRANSFERENCIA', cliente: 'ALEJANDRA', fecha: '2025-12-02', valor: 54.5, numero: '001-3' },
    ]);
    expect(bloqueB).toEqual([
      { nombre: 'DEPOSITO', cliente: 'PIZZERIA DUCHYS', fecha: '2025-12-08', valor: 210, numero: '001-2' },
    ]);
  });

  test('el TOTAL del bloque corto no descarta un dato valido del bloque largo en la misma fila', () => {
    const wb = wbHoja('COBROS TRANSF DEPO', [
      ['', 'COBROS EN TRANSFERENCIA', '', '', '', '', '', '', 'COBROS EN DEPOSITO Y TARJETA', '', '', '', ''],
      ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero', '', '', 'forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero'],
      ['TRANSFERENCIA', 'CLIENTE UNO', '100', '100', "'01/12/2025", '001', '', '', 'DEPOSITO', 'CLIENTE DOS', '50', '50', "'02/12/2025", '002'],
      // bloqueB ya termino (TOTAL en col8) en esta fila, pero bloqueA SIGUE teniendo un dato valido (col0-5) en la MISMA fila:
      ['TRANSFERENCIA', 'CLIENTE TRES', '75', '75', "'03/12/2025", '003', '', '', 'TOTAL', '', '50', '', '', ''],
      ['', '', 'TOTAL', '175', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const { bloqueA, bloqueB } = parseTablaDoble(wb, 'COBROS TRANSF DEPO', {
      filaInicio: 2,
      bloqueA: { colNombre: 0, colCliente: 1, colFecha: 4, colValor: 3, colNumero: 5, formatoFecha: 'DMY' },
      bloqueB: { colNombre: 8, colCliente: 9, colFecha: 12, colValor: 11, colNumero: 13, formatoFecha: 'DMY' },
    });
    // CLIENTE TRES no debe perderse aunque este en la misma fila donde bloqueB ya puso TOTAL
    expect(bloqueA).toEqual([
      { nombre: 'TRANSFERENCIA', cliente: 'CLIENTE UNO', fecha: '2025-12-01', valor: 100, numero: '001' },
      { nombre: 'TRANSFERENCIA', cliente: 'CLIENTE TRES', fecha: '2025-12-03', valor: 75, numero: '003' },
    ]);
    expect(bloqueB).toEqual([
      { nombre: 'DEPOSITO', cliente: 'CLIENTE DOS', fecha: '2025-12-02', valor: 50, numero: '002' },
    ]);
  });
});

describe('parseCobrosTransferencia', () => {
  test('separa transferencia de deposito/tarjeta', () => {
    const wb = wbHoja('COBROS TRANSF DEPO', [
      ['', 'COBROS EN TRANSFERENCIA', '', '', '', '', '', '', 'COBROS EN DEPOSITO Y TARJETA', '', '', '', ''],
      ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero', '', '', 'forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago', 'numero'],
      ['TRANSFERENCIA', 'LA TABLITA', '52.63', '52.63', "'02/12/2025", '001-1', '', '', 'DEPOSITO', 'PIZZERIA DUCHYS', '594.05', '210', "'08/12/2025", '001-2'],
    ]);
    const { transferencia, deposito } = parseCobrosTransferencia(wb);
    expect(transferencia).toEqual([{ cliente: 'LA TABLITA', fecha: '2025-12-02', valor: 52.63, numero: '001-1' }]);
    expect(deposito).toEqual([{ cliente: 'PIZZERIA DUCHYS', fecha: '2025-12-08', valor: 210, numero: '001-2', formaPago: 'DEPOSITO' }]);
  });
});

describe('parseCompras', () => {
  test('separa con factura de sin factura', () => {
    const wb = wbHoja('COMPRAS ', [
      ['', '', 'COMPRAS CON FACTURA', '', '', '', '', '', 'COMPRAS SIN  FACTURA', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', '', '', '', 'FECHA', 'PROVEEDOR', 'VALOR', ''],
      ['27/12/2025', '1792458935001', 'ADECAMOR CIA LTDA.', '007-005-000337181', '27.00', '', '', '', '12/3/25', 'LECHON', '232.40', ''],
    ]);
    const { conFactura, sinFactura } = parseCompras(wb);
    expect(conFactura).toEqual([{ fecha: '2025-12-27', ruc: '1792458935001', proveedor: 'ADECAMOR CIA LTDA.', numero: '007-005-000337181', valor: 27.00 }]);
    expect(sinFactura).toEqual([{ fecha: '2025-12-03', proveedor: 'LECHON', valor: 232.40 }]);
  });

  test('lanza error si una fila tiene fecha invalida (con factura o sin factura)', () => {
    const wb = wbHoja('COMPRAS ', [
      ['', '', 'COMPRAS CON FACTURA', '', '', '', '', '', 'COMPRAS SIN  FACTURA', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', '', '', '', 'FECHA', 'PROVEEDOR', 'VALOR', ''],
      ['fecha-mala', '1792458935001', 'ADECAMOR CIA LTDA.', '007-005-000337181', '27.00', '', '', '', '12/3/25', 'LECHON', '232.40', ''],
    ]);
    expect(() => parseCompras(wb)).toThrow(/COMPRAS \(con factura\).*fila 3/i);

    const wb2 = wbHoja('COMPRAS ', [
      ['', '', 'COMPRAS CON FACTURA', '', '', '', '', '', 'COMPRAS SIN  FACTURA', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', '', '', '', 'FECHA', 'PROVEEDOR', 'VALOR', ''],
      ['27/12/2025', '1792458935001', 'ADECAMOR CIA LTDA.', '007-005-000337181', '27.00', '', '', '', 'fecha-mala', 'LECHON', '232.40', ''],
    ]);
    expect(() => parseCompras(wb2)).toThrow(/COMPRAS \(sin factura\).*fila 3/i);
  });

  test('lanza error si una fila tiene monto invalido (con factura o sin factura)', () => {
    const wb = wbHoja('COMPRAS ', [
      ['', '', 'COMPRAS CON FACTURA', '', '', '', '', '', 'COMPRAS SIN  FACTURA', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', '', '', '', 'FECHA', 'PROVEEDOR', 'VALOR', ''],
      ['27/12/2025', '1792458935001', 'ADECAMOR CIA LTDA.', '007-005-000337181', 'no-es-numero', '', '', '', '12/3/25', 'LECHON', '232.40', ''],
    ]);
    expect(() => parseCompras(wb)).toThrow(/COMPRAS \(con factura\).*fila 3/i);

    const wb2 = wbHoja('COMPRAS ', [
      ['', '', 'COMPRAS CON FACTURA', '', '', '', '', '', 'COMPRAS SIN  FACTURA', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', '', '', '', 'FECHA', 'PROVEEDOR', 'VALOR', ''],
      ['27/12/2025', '1792458935001', 'ADECAMOR CIA LTDA.', '007-005-000337181', '27.00', '', '', '', '12/3/25', 'LECHON', 'no-es-numero', ''],
    ]);
    expect(() => parseCompras(wb2)).toThrow(/COMPRAS \(sin factura\).*fila 3/i);
  });
});

describe('parseOtrosPagosPersonales', () => {
  test('separa las 3 sub-tablas: prestamo/tarjeta, gastos personales (apilada abajo), otros gastos', () => {
    const wb = wbHoja('OTROS PAGOS PERSONALES', [
      ['PAGOS PRESTAMO Y TARJETA', '', '', '', '', '', 'PAGOS OTROS GASTOS PERSONALES', '', ''],
      ['NOMBRE', 'FECHA', 'VALOR', '', '', '', 'NOMBRE', 'FECHA', 'VALOR'],
      ['TARJETA PACIFICO', '12/3/25', '262.20', '', '', '', 'CHAMORRO KATHERINE', '12/1/25', '6.00'],
      // Caso real critico: el encabezado que reinicia la columna izquierda ("PAGOS GASTOS
      // PERSONALES") cae en la MISMA fila que un dato real de la columna derecha (GRAN AKI) --
      // tal cual pasa en el Excel real (fila 12). No debe perderse ese dato de la derecha.
      ['PAGOS GASTOS PERSONALES', '', '', '', '', '', 'GRAN AKI', '12/11/25', '275.80'],
      ['NOMBRE', 'FECHA', 'VALOR', '', '', '', '', '', ''],
      ['SALUDSA', '12/2/25', '102.66', '', '', '', '', '', ''],
      ['', 'TOTAL', '102.66', '', '', '', '', 'TOTAL', '378.46'],
    ]);
    const { prestamoTarjeta, gastosPersonales, otrosGastos } = parseOtrosPagosPersonales(wb);
    expect(prestamoTarjeta).toEqual([{ nombre: 'TARJETA PACIFICO', fecha: '2025-12-03', valor: 262.20 }]);
    expect(gastosPersonales).toEqual([{ nombre: 'SALUDSA', fecha: '2025-12-02', valor: 102.66 }]);
    expect(otrosGastos).toEqual([
      { nombre: 'CHAMORRO KATHERINE', fecha: '2025-12-01', valor: 6.00 },
      { nombre: 'GRAN AKI', fecha: '2025-12-11', valor: 275.80 },
    ]);
  });

  test('lanza error si una fila tiene fecha invalida (columna izquierda o derecha)', () => {
    const wb = wbHoja('OTROS PAGOS PERSONALES', [
      ['PAGOS PRESTAMO Y TARJETA', '', '', '', '', '', 'PAGOS OTROS GASTOS PERSONALES', '', ''],
      ['NOMBRE', 'FECHA', 'VALOR', '', '', '', 'NOMBRE', 'FECHA', 'VALOR'],
      ['TARJETA PACIFICO', 'fecha-mala', '262.20', '', '', '', 'CHAMORRO KATHERINE', '12/1/25', '6.00'],
    ]);
    expect(() => parseOtrosPagosPersonales(wb)).toThrow(/fila 3.*columna izquierda/i);

    const wb2 = wbHoja('OTROS PAGOS PERSONALES', [
      ['PAGOS PRESTAMO Y TARJETA', '', '', '', '', '', 'PAGOS OTROS GASTOS PERSONALES', '', ''],
      ['NOMBRE', 'FECHA', 'VALOR', '', '', '', 'NOMBRE', 'FECHA', 'VALOR'],
      ['TARJETA PACIFICO', '12/3/25', '262.20', '', '', '', 'CHAMORRO KATHERINE', 'fecha-mala', '6.00'],
    ]);
    expect(() => parseOtrosPagosPersonales(wb2)).toThrow(/fila 3.*columna derecha/i);
  });

  test('lanza error si una fila tiene monto invalido (columna izquierda o derecha)', () => {
    const wb = wbHoja('OTROS PAGOS PERSONALES', [
      ['PAGOS PRESTAMO Y TARJETA', '', '', '', '', '', 'PAGOS OTROS GASTOS PERSONALES', '', ''],
      ['NOMBRE', 'FECHA', 'VALOR', '', '', '', 'NOMBRE', 'FECHA', 'VALOR'],
      ['TARJETA PACIFICO', '12/3/25', 'no-es-numero', '', '', '', 'CHAMORRO KATHERINE', '12/1/25', '6.00'],
    ]);
    expect(() => parseOtrosPagosPersonales(wb)).toThrow(/fila 3.*columna izquierda/i);

    const wb2 = wbHoja('OTROS PAGOS PERSONALES', [
      ['PAGOS PRESTAMO Y TARJETA', '', '', '', '', '', 'PAGOS OTROS GASTOS PERSONALES', '', ''],
      ['NOMBRE', 'FECHA', 'VALOR', '', '', '', 'NOMBRE', 'FECHA', 'VALOR'],
      ['TARJETA PACIFICO', '12/3/25', '262.20', '', '', '', 'CHAMORRO KATHERINE', '12/1/25', 'no-es-numero'],
    ]);
    expect(() => parseOtrosPagosPersonales(wb2)).toThrow(/fila 3.*columna derecha/i);
  });
});

describe('parseComprasPersonal', () => {
  test('parsea filas con RUC, proveedor y numero de factura', () => {
    const wb = wbHoja('COMPRAS -PERSONAL', [
      ['FACTURAS GASTOS  PERSONALES', '', '', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', 'DETALLE'],
      ['01/12/2025', '1792487242001', 'Hotel Otavalo', '003-003-000003252', '$66.00', 'detalle...'],
    ]);
    expect(parseComprasPersonal(wb)).toEqual([
      { fecha: '2025-12-01', ruc: '1792487242001', proveedor: 'Hotel Otavalo', numero: '003-003-000003252', valor: 66.00 },
    ]);
  });

  test('lanza error si una fila tiene fecha invalida', () => {
    const wb = wbHoja('COMPRAS -PERSONAL', [
      ['FACTURAS GASTOS  PERSONALES', '', '', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', 'DETALLE'],
      ['fecha-mala', '1792487242001', 'Hotel Otavalo', '003-003-000003252', '$66.00', 'detalle...'],
    ]);
    expect(() => parseComprasPersonal(wb)).toThrow(/COMPRAS -PERSONAL.*fila 3/i);
  });

  test('lanza error si una fila tiene monto invalido', () => {
    const wb = wbHoja('COMPRAS -PERSONAL', [
      ['FACTURAS GASTOS  PERSONALES', '', '', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', 'DETALLE'],
      ['01/12/2025', '1792487242001', 'Hotel Otavalo', '003-003-000003252', 'no-es-numero', 'detalle...'],
    ]);
    expect(() => parseComprasPersonal(wb)).toThrow(/COMPRAS -PERSONAL.*fila 3/i);
  });

  test('hoja real mezcla una fila con año de 2 digitos (M/D/AA) entre filas con año de 4 digitos (DD/MM/AAAA) -- formatoFecha sigue siendo DMY, la regla de seguridad de parsearFecha resuelve la fila anomala sola', () => {
    const wb = wbHoja('COMPRAS -PERSONAL', [
      ['FACTURAS GASTOS  PERSONALES', '', '', '', '', ''],
      ['FECHA', 'RUC', 'PROVEEDOR', 'NUMERO', 'VALOR', 'DETALLE'],
      ['12/1/25', '1792487242001', 'Hotel Otavalo', '003-003-000003252', '$66.00', 'detalle...'],
      ['24/12/2025', '1790000000001', 'Proveedor Dos', '001-001-000000002', '$10.00', 'detalle...'],
      ['31/12/2025', '1790000000003', 'Proveedor Tres', '001-001-000000003', '$20.00', 'detalle...'],
    ]);
    expect(parseComprasPersonal(wb)).toEqual([
      { fecha: '2025-12-01', ruc: '1792487242001', proveedor: 'Hotel Otavalo', numero: '003-003-000003252', valor: 66.00 },
      { fecha: '2025-12-24', ruc: '1790000000001', proveedor: 'Proveedor Dos', numero: '001-001-000000002', valor: 10.00 },
      { fecha: '2025-12-31', ruc: '1790000000003', proveedor: 'Proveedor Tres', numero: '001-001-000000003', valor: 20.00 },
    ]);
  });
});
