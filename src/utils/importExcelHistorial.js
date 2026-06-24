import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

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

  const anioTexto = partes[2];
  let [a, b, anio] = partes.map(p => parseInt(p, 10));
  if (isNaN(a) || isNaN(b) || isNaN(anio)) return null;
  if (anio < 100) anio += 2000;

  // Si el primer numero no puede ser mes (>12), es DD/MM forzosamente.
  // Si el año tiene 2 digitos (no 4), en este archivo siempre es M/D/AA (MDY),
  // sin importar formatoPreferido -- algunas hojas (ej. COMPRAS-PERSONAL) mezclan
  // filas DD/MM/AAAA (año largo) con alguna fila suelta M/D/AA (año corto).
  let dia, mes;
  if (a > 12) {
    dia = a; mes = b;
  } else if (anioTexto.length !== 4) {
    mes = a; dia = b;
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

export function parseTablaSimple(wb, nombreHoja, cfg) {
  const { filaInicio, colNombre, colFecha, colDetalle, colValor, formatoFecha, extra } = cfg;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: false, defval: '' });
  const resultado = [];

  for (let i = filaInicio; i < rows.length; i++) {
    const row = rows[i];
    if (!filaValida(row, colNombre)) continue;

    const fecha = parsearFecha(row[colFecha], formatoFecha);
    if (!fecha) {
      throw new Error(`Hoja ${nombreHoja}, fila ${i + 1}: la fecha "${row[colFecha]}" no es valida.`);
    }
    const valor = limpiarMonto(row[colValor]);
    if (valor <= 0) {
      throw new Error(`Hoja ${nombreHoja}, fila ${i + 1}: el monto "${row[colValor]}" no es un numero valido.`);
    }

    const fila = { nombre: row[colNombre], fecha, valor };
    if (colDetalle !== undefined) fila.detalle = row[colDetalle];
    if (extra) {
      for (const [col, campo] of Object.entries(extra)) fila[campo] = row[col] || '';
    }
    resultado.push(fila);
  }
  return resultado;
}

export function parseCobrosEfectivo(wb) {
  return parseTablaSimple(wb, 'COBROS EFECTIVO', {
    filaInicio: 2, colNombre: 1, colFecha: 4, colValor: 3, formatoFecha: 'DMY', extra: { 5: 'numero' },
  });
}

export function parseCobrosCheques(wb) {
  return parseTablaSimple(wb, 'COBROS CHEQUES', {
    filaInicio: 2, colNombre: 1, colFecha: 4, colValor: 3, formatoFecha: 'DMY', extra: { 5: 'numero' },
  });
}

function parseUnBloque(rows, filaInicio, cfg, nombreHoja) {
  const { colNombre, colCliente, colFecha, colValor, colNumero, formatoFecha } = cfg;
  const resultado = [];
  for (let i = filaInicio; i < rows.length; i++) {
    const row = rows[i];
    if (!filaValida(row, colNombre)) continue;
    const fecha = parsearFecha(row[colFecha], formatoFecha);
    if (!fecha) {
      throw new Error(`Hoja ${nombreHoja}, fila ${i + 1}: la fecha "${row[colFecha]}" no es valida.`);
    }
    const valor = limpiarMonto(row[colValor]);
    if (valor <= 0) {
      throw new Error(`Hoja ${nombreHoja}, fila ${i + 1}: el monto "${row[colValor]}" no es un numero valido.`);
    }
    resultado.push({
      nombre: row[colNombre],
      cliente: row[colCliente],
      fecha,
      valor,
      numero: row[colNumero] || '',
    });
  }
  return resultado;
}

export function parseTablaDoble(wb, nombreHoja, cfg) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: false, defval: '' });
  return {
    bloqueA: parseUnBloque(rows, cfg.filaInicio, cfg.bloqueA, nombreHoja),
    bloqueB: parseUnBloque(rows, cfg.filaInicio, cfg.bloqueB, nombreHoja),
  };
}

export function parseCobrosTransferencia(wb) {
  const { bloqueA, bloqueB } = parseTablaDoble(wb, 'COBROS TRANSF DEPO', {
    filaInicio: 2,
    bloqueA: { colNombre: 0, colCliente: 1, colFecha: 4, colValor: 3, colNumero: 5, formatoFecha: 'DMY' },
    bloqueB: { colNombre: 8, colCliente: 9, colFecha: 12, colValor: 11, colNumero: 13, formatoFecha: 'DMY' },
  });
  return {
    transferencia: bloqueA.map(({ cliente, fecha, valor, numero }) => ({ cliente, fecha, valor, numero })),
    deposito: bloqueB.map(({ nombre, cliente, fecha, valor, numero }) => ({ cliente, fecha, valor, numero, formaPago: nombre })),
  };
}

export function parseCompras(wb) {
  // El espacio final en 'COMPRAS ' es literal e intencional: es el nombre real
  // de la hoja en el Excel de la contadora. No quitarlo — sin él wb.Sheets[...]
  // da undefined y sheet_to_json devuelve [] en silencio (sin lanzar error).
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['COMPRAS '], { header: 1, raw: false, defval: '' });
  const conFactura = [];
  const sinFactura = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (filaValida(row, 0)) {
      const fecha = parsearFecha(row[0], 'DMY');
      if (!fecha) throw new Error(`Hoja COMPRAS (con factura), fila ${i + 1}: la fecha "${row[0]}" no es valida.`);
      const valor = limpiarMonto(row[4]);
      if (valor <= 0) throw new Error(`Hoja COMPRAS (con factura), fila ${i + 1}: el monto "${row[4]}" no es un numero valido.`);
      conFactura.push({ fecha, ruc: row[1], proveedor: row[2], numero: row[3] || '', valor });
    }
    if (filaValida(row, 8)) {
      const fecha = parsearFecha(row[8], 'MDY');
      if (!fecha) throw new Error(`Hoja COMPRAS (sin factura), fila ${i + 1}: la fecha "${row[8]}" no es valida.`);
      const valor = limpiarMonto(row[10]);
      if (valor <= 0) throw new Error(`Hoja COMPRAS (sin factura), fila ${i + 1}: el monto "${row[10]}" no es un numero valido.`);
      sinFactura.push({ fecha, proveedor: row[9], valor });
    }
  }
  return { conFactura, sinFactura };
}

export function parseOtrosPagosPersonales(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['OTROS PAGOS PERSONALES'], { header: 1, raw: false, defval: '' });

  const prestamoTarjeta = [];
  const gastosPersonales = [];
  const otrosGastos = [];

  // OJO: las columnas izquierda (0-2) y derecha (6-8) se procesan de forma
  // INDEPENDIENTE en cada fila. El encabezado "PAGOS GASTOS PERSONALES" que
  // reinicia la sub-tabla izquierda puede caer en la misma fila que un dato
  // real de la columna derecha (pasa en el Excel real, fila 12) -- por eso
  // NO se usa `continue` para saltar toda la fila, cada bloque se evalua aparte.
  let seccionIzquierda = 'prestamoTarjeta'; // cambia a 'gastosPersonales' cuando aparece ese encabezado
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const col0 = String(row[0] || '').toUpperCase();
    const col6 = String(row[6] || '').toUpperCase();

    if (col0.includes('PAGOS GASTOS PERSONALES')) {
      seccionIzquierda = 'gastosPersonales';
    } else if (!col0.includes('PAGOS PRESTAMO Y TARJETA') && col0 !== 'NOMBRE' && filaValida(row, 0)) {
      const fecha = parsearFecha(row[1], 'MDY');
      if (!fecha) throw new Error(`Hoja OTROS PAGOS PERSONALES, fila ${i + 1} (columna izquierda): la fecha "${row[1]}" no es valida.`);
      const valor = limpiarMonto(row[2]);
      if (valor <= 0) throw new Error(`Hoja OTROS PAGOS PERSONALES, fila ${i + 1} (columna izquierda): el monto "${row[2]}" no es un numero valido.`);
      const fila = { nombre: row[0], fecha, valor };
      (seccionIzquierda === 'prestamoTarjeta' ? prestamoTarjeta : gastosPersonales).push(fila);
    }

    if (!col6.includes('PAGOS OTROS GASTOS PERSONALES') && col6 !== 'NOMBRE' && filaValida(row, 6)) {
      const fecha = parsearFecha(row[7], 'MDY');
      if (!fecha) throw new Error(`Hoja OTROS PAGOS PERSONALES, fila ${i + 1} (columna derecha): la fecha "${row[7]}" no es valida.`);
      const valor = limpiarMonto(row[8]);
      if (valor <= 0) throw new Error(`Hoja OTROS PAGOS PERSONALES, fila ${i + 1} (columna derecha): el monto "${row[8]}" no es un numero valido.`);
      otrosGastos.push({ nombre: row[6], fecha, valor });
    }
  }
  return { prestamoTarjeta, gastosPersonales, otrosGastos };
}

export function parseComprasPersonal(wb) {
  // colNombre y colFecha apuntan a la misma columna (la fecha es el único
  // valor disponible para validar que la fila no está vacía en esta hoja).
  // Se usa `extra` (agregado en la Task 3) para capturar ruc/proveedor/numero
  // directamente en la misma pasada, sin releer la hoja por separado.
  return parseTablaSimple(wb, 'COMPRAS -PERSONAL', {
    filaInicio: 2, colNombre: 0, colFecha: 0, colValor: 4, formatoFecha: 'DMY',
    extra: { 1: 'ruc', 2: 'proveedor', 3: 'numero' },
  }).map(({ nombre, ...resto }) => resto);
}

function nombreHojaPagos(mes) {
  return `PAGOS ${MESES_ES[mes - 1]}`;
}

function parsePagosDelMes(wb, nombreHoja) {
  return parseTablaSimple(wb, nombreHoja, {
    filaInicio: 1, colNombre: 0, colFecha: 1, colValor: 2, formatoFecha: 'MDY',
  });
}

export function parseTodasLasHojas(wb) {
  const { mes, año } = detectarMesAnio(wb);
  const hojaPagos = nombreHojaPagos(mes);

  const hojasRequeridas = ['RESUMEN', 'GASTOS', 'COBROS EFECTIVO', 'COBROS TRANSF DEPO',
    'COBROS CHEQUES', hojaPagos, 'OTROS PAGOS PERSONALES', 'COMPRAS ', 'COMPRAS -PERSONAL'];
  const faltantes = hojasRequeridas.filter(h => !wb.SheetNames.includes(h));
  if (faltantes.length > 0) {
    throw new Error(`Faltan estas hojas en el archivo: ${faltantes.join(', ')}`);
  }

  return {
    mes, año,
    gastos: parseTablaSimple(wb, 'GASTOS', { filaInicio: 2, colNombre: 0, colFecha: 1, colDetalle: 2, colValor: 3, formatoFecha: 'MDY' }),
    cobrosEfectivo: parseCobrosEfectivo(wb),
    cobrosCheques: parseCobrosCheques(wb),
    cobrosTransferencia: parseCobrosTransferencia(wb),
    pagosDelMes: parsePagosDelMes(wb, hojaPagos),
    otrosPagosPersonales: parseOtrosPagosPersonales(wb),
    comprasEmpresa: parseCompras(wb),
    comprasPersonal: parseComprasPersonal(wb),
  };
}

export async function verificarMesNoImportado(mes, año) {
  const fechaDesde = `${año}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(año, mes, 0).getDate();
  const fechaHasta = `${año}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  const checks = [
    { tabla: 'caja_chica', label: 'Gastos (Caja Chica)', query: q => q.gte('fecha', fechaDesde).lte('fecha', fechaHasta) },
    { tabla: 'cobros', label: 'Cobros', query: q => q.gte('fecha', fechaDesde).lte('fecha', fechaHasta) },
    { tabla: 'talonario_pagos_banco', label: 'Pagos del Mes', query: q => q.eq('mes', mes).eq('año', año) },
    { tabla: 'talonario_pagos_personales', label: 'Pagos Personales', query: q => q.eq('mes', mes).eq('año', año) },
    { tabla: 'compras', label: 'Compras', query: q => q.gte('fecha', fechaDesde).lte('fecha', fechaHasta) },
  ];

  for (const check of checks) {
    const { data, error } = await check.query(supabase.from(check.tabla).select('id').limit(1));
    if (error) throw new Error(`Error verificando ${check.label}: ${error.message}`);
    if (data && data.length > 0) {
      throw new Error(`Ya existe información cargada para ${mes}/${año} en "${check.label}" — bórrala primero si quieres reimportar.`);
    }
  }
}

export async function resolverProveedorId(nombre, ruc, idsCreados) {
  let query = supabase.from('proveedores').select('id').is('deleted_at', null);
  query = ruc ? query.eq('ruc', ruc) : query.ilike('nombre', nombre);
  const { data: existente, error: errSel } = await query.maybeSingle();
  if (errSel) throw new Error(`Error buscando proveedor "${nombre}": ${errSel.message}`);
  if (existente) return existente.id;

  const { data: nuevo, error: errIns } = await supabase
    .from('proveedores').insert({ nombre, ruc: ruc || null, activo: true }).select('id').single();
  if (errIns) throw new Error(`Error creando proveedor "${nombre}": ${errIns.message}`);
  idsCreados.proveedores.push(nuevo.id);
  return nuevo.id;
}

export async function resolverClienteId(nombre, idsCreados) {
  const { data: existente, error: errSel } = await supabase
    .from('clientes').select('id').ilike('nombre', nombre).not('eliminado', 'eq', true).maybeSingle();
  if (errSel) throw new Error(`Error buscando cliente "${nombre}": ${errSel.message}`);
  if (existente) return existente.id;

  const { data: nuevo, error: errIns } = await supabase
    .from('clientes').insert({ nombre }).select('id').single();
  if (errIns) throw new Error(`Error creando cliente "${nombre}": ${errIns.message}`);
  idsCreados.clientes.push(nuevo.id);
  return nuevo.id;
}
