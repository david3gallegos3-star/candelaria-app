import * as XLSX from 'xlsx';
import { limpiarMonto, parsearFecha, filaValida, detectarMesAnio } from './importExcelHistorial';

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
