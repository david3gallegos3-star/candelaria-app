import * as XLSX from 'xlsx';

const MESES_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

export function detectarMesAnio(wb) {
  if (!wb.SheetNames.includes('RESUMEN')) {
    throw new Error('No encontré la hoja RESUMEN en el archivo.');
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['RESUMEN'], { header: 1, raw: false, defval: '' });
  const celda = String(rows[0]?.[0] || '').toUpperCase().trim();
  const match = celda.match(/^([A-ZÑ]+)\s+DEL\s+(\d{4})$/);
  if (!match) {
    throw new Error(`No pude leer el mes/año de la hoja RESUMEN — la celda A1 dice "${celda}", esperaba el formato "<MES> DEL <AÑO>".`);
  }
  const mes = MESES_ES.indexOf(match[1]) + 1;
  if (mes === 0) {
    throw new Error(`No reconozco el mes "${match[1]}" en la celda A1 de RESUMEN.`);
  }
  return { mes, año: parseInt(match[2], 10) };
}

export function limpiarMonto(valor) {
  if (!valor) return 0;
  const limpio = String(valor).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(limpio);
  return isNaN(num) ? 0 : num;
}

export function parsearFecha(valor, formatoPreferido) {
  if (!valor) return null;
  const texto = String(valor).replace(/^'/, '').trim();
  const partes = texto.split('/');
  if (partes.length !== 3) return null;

  let [a, b, anio] = partes.map(p => parseInt(p, 10));
  if (isNaN(a) || isNaN(b) || isNaN(anio)) return null;
  if (anio < 100) anio += 2000;

  // Si el primer numero no puede ser mes (>12), es DD/MM forzosamente.
  let dia, mes;
  if (a > 12) {
    dia = a; mes = b;
  } else if (formatoPreferido === 'DMY') {
    dia = a; mes = b;
  } else {
    mes = a; dia = b;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (new Date(anio, mes - 1, dia).getDate() !== dia) return null;

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function filaValida(row, colClave) {
  const valor = row[colClave];
  if (!valor || String(valor).trim() === '') return false;
  if (String(valor).toUpperCase().includes('TOTAL')) return false;
  return true;
}
