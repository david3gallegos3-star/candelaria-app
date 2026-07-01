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

    // Una fila con monto en $0/"$-" (la contadora marca asi "sin cargo este
    // mes") se omite en silencio -- no bloquea el import, no se inserta nada.
    const valor = limpiarMonto(row[colValor]);
    if (valor <= 0) continue;

    const fecha = parsearFecha(row[colFecha], formatoFecha);
    if (!fecha) {
      throw new Error(`Hoja ${nombreHoja}, fila ${i + 1}: la fecha "${row[colFecha]}" no es valida.`);
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
    const valor = limpiarMonto(row[colValor]);
    if (valor <= 0) continue;
    const fecha = parsearFecha(row[colFecha], formatoFecha);
    if (!fecha) {
      throw new Error(`Hoja ${nombreHoja}, fila ${i + 1}: la fecha "${row[colFecha]}" no es valida.`);
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
      const valor = limpiarMonto(row[4]);
      if (valor > 0) {
        const fecha = parsearFecha(row[0], 'DMY');
        if (!fecha) throw new Error(`Hoja COMPRAS (con factura), fila ${i + 1}: la fecha "${row[0]}" no es valida.`);
        conFactura.push({ fecha, ruc: row[1], proveedor: row[2], numero: row[3] || '', valor });
      }
    }
    if (filaValida(row, 8)) {
      const valor = limpiarMonto(row[10]);
      if (valor > 0) {
        const fecha = parsearFecha(row[8], 'MDY');
        if (!fecha) throw new Error(`Hoja COMPRAS (sin factura), fila ${i + 1}: la fecha "${row[8]}" no es valida.`);
        sinFactura.push({ fecha, proveedor: row[9], valor });
      }
    }
  }
  return { conFactura, sinFactura };
}

export function parseOtrosPagosPersonales(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['OTROS PAGOS PERSONALES'], { header: 1, raw: false, defval: '' });

  const prestamos = [];
  const tarjetas = [];
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
      const valor = limpiarMonto(row[2]);
      if (valor > 0) {
        const fecha = parsearFecha(row[1], 'MDY');
        if (!fecha) throw new Error(`Hoja OTROS PAGOS PERSONALES, fila ${i + 1} (columna izquierda): la fecha "${row[1]}" no es valida.`);
        const fila = { nombre: row[0], fecha, valor };
        if (seccionIzquierda === 'gastosPersonales') {
          gastosPersonales.push(fila);
        } else {
          // Dentro de la sub-tabla "Préstamo y Tarjeta": si el nombre contiene
          // la palabra PRESTAMO va a Préstamos, todo lo demás (tarjetas de
          // crédito, ahorro programado, etc.) va a Tarjetas. Verificado contra
          // el Excel real de diciembre 2025: separa exacto igual que la
          // contadora ($1,035.02 Préstamos / $1,272.20 Tarjetas).
          (col0.includes('PRESTAMO') ? prestamos : tarjetas).push(fila);
        }
      }
    }

    if (!col6.includes('PAGOS OTROS GASTOS PERSONALES') && col6 !== 'NOMBRE' && filaValida(row, 6)) {
      const valor = limpiarMonto(row[8]);
      if (valor > 0) {
        const fecha = parsearFecha(row[7], 'MDY');
        if (!fecha) throw new Error(`Hoja OTROS PAGOS PERSONALES, fila ${i + 1} (columna derecha): la fecha "${row[7]}" no es valida.`);
        otrosGastos.push({ nombre: row[6], fecha, valor });
      }
    }
  }
  return { prestamos, tarjetas, gastosPersonales, otrosGastos };
}

export function parseComprasPersonal(wb) {
  // colNombre y colFecha apuntan a la misma columna (la fecha es el único
  // valor disponible para validar que la fila no está vacía en esta hoja).
  // Se usa `extra` para capturar ruc/proveedor/numero directamente en la
  // misma pasada, sin releer la hoja por separado. colDetalle captura el
  // detalle de la factura (columna F), usado en talonario_registro_facturas_dueno.
  return parseTablaSimple(wb, 'COMPRAS -PERSONAL', {
    filaInicio: 2, colNombre: 0, colFecha: 0, colValor: 4, colDetalle: 5, formatoFecha: 'DMY',
    extra: { 1: 'ruc', 2: 'proveedor', 3: 'numero' },
  }).map(({ nombre, ...resto }) => resto);
}

function nombreHojaPagos(mes) {
  return `PAGOS ${MESES_ES[mes - 1]}`;
}

function parseSaldoBancoReal(wb, nombreHoja) {
  // El pie de pagina de esta hoja (DESPUES de la fila TOTAL) tiene una fila
  // "SALDO AL <dia> <MES> <AÑO> CUENTA CORRIENTE" con el saldo bancario real
  // en la columna de fecha (1). Buscar "SALDO" solo despues del TOTAL es
  // necesario porque puede haber un pago real ANTES del TOTAL cuyo nombre
  // tambien contenga la palabra "SALDO" (ej. "GROOT ARTE (SALDO CORTESIAS
  // CLIENTES)" en el Excel real) -- ese NO es el pie de pagina.
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: false, defval: '' });
  const indiceTotal = rows.findIndex(row => String(row[1] || '').toUpperCase().trim() === 'TOTAL');
  if (indiceTotal === -1) return null;
  const filaSaldo = rows.slice(indiceTotal + 1).find(row => String(row[0] || '').toUpperCase().includes('SALDO'));
  if (!filaSaldo) return null;
  return limpiarMonto(filaSaldo[1]);
}

function parsePagosDelMes(wb, nombreHoja) {
  // No se usa parseTablaSimple porque esta hoja tiene un pie de pagina despues
  // de la fila TOTAL (ej. "SALDO AL 31 DICIEMBRE 2025 CUENTA CORRIENTE" con el
  // saldo bancario en la columna de fecha) que no contiene la palabra "TOTAL"
  // en la columna de nombre, asi que filaValida no lo detecta como fin de tabla.
  // El marcador TOTAL real de esta hoja esta en la columna de fecha (indice 1).
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: false, defval: '' });
  const resultado = [];
  const omitidas = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[1] || '').toUpperCase().trim() === 'TOTAL') break;
    const nombre = String(row[0] || '').trim();
    const valor = limpiarMonto(row[2]);
    if (!nombre) {
      if (valor > 0) {
        omitidas.push({ fila: i + 1, nombre: '', monto: valor, fecha: String(row[1] || ''), tipo: String(row[3] || '') });
      }
      continue;
    }
    if (valor <= 0) continue;
    const fecha = parsearFecha(row[1], 'MDY');
    if (!fecha) throw new Error(`Hoja ${nombreHoja}, fila ${i + 1}: la fecha "${row[1]}" no es valida.`);
    resultado.push({ nombre, fecha, valor });
  }
  return { pagos: resultado, omitidas };
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

  const { pagos: pagosDelMes, omitidas: pagosOmitidos } = parsePagosDelMes(wb, hojaPagos);

  return {
    mes, año,
    gastos: parseTablaSimple(wb, 'GASTOS', { filaInicio: 2, colNombre: 0, colFecha: 1, colDetalle: 2, colValor: 3, formatoFecha: 'MDY' }),
    cobrosEfectivo: parseCobrosEfectivo(wb),
    cobrosCheques: parseCobrosCheques(wb),
    cobrosTransferencia: parseCobrosTransferencia(wb),
    pagosDelMes, pagosOmitidos,
    saldoBancoReal: parseSaldoBancoReal(wb, hojaPagos),
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

function chunk(arr, tamano) {
  const partes = [];
  for (let i = 0; i < arr.length; i += tamano) partes.push(arr.slice(i, i + tamano));
  return partes;
}

// Resuelve todos los clientes de una importacion en pocas consultas (en vez de
// una por fila): carga los clientes existentes UNA vez, crea los que falten en
// lotes, y retorna una funcion (nombre) => id para usar al armar cada fila.
async function resolverClientesEnLote(nombres, idsCreados) {
  const { data: existentes, error: errSel } = await supabase
    .from('clientes').select('id, nombre').not('eliminado', 'eq', true);
  if (errSel) throw new Error(`Error buscando clientes existentes: ${errSel.message}`);
  const porNombre = new Map((existentes || []).map(c => [c.nombre.toUpperCase(), c.id]));

  const faltantes = [...new Set(nombres)].filter(n => !porNombre.has(n.toUpperCase()));
  for (const grupo of chunk(faltantes, 200)) {
    const { data: nuevos, error: errIns } = await supabase
      .from('clientes').insert(grupo.map(nombre => ({ nombre, eliminado: false, activo: true }))).select('id, nombre');
    if (errIns) throw new Error(`Error creando clientes nuevos: ${errIns.message}`);
    for (const n of nuevos) {
      idsCreados.clientes.push(n.id);
      porNombre.set(n.nombre.toUpperCase(), n.id);
    }
  }

  return nombre => porNombre.get(nombre.toUpperCase());
}

// Misma idea que resolverClientesEnLote, pero para proveedores: la clave de
// busqueda es el RUC si la fila lo trae (igual que el resolver original
// fila-por-fila), o el nombre en mayusculas si no hay RUC.
async function resolverProveedoresEnLote(filas, idsCreados) {
  const { data: existentes, error: errSel } = await supabase
    .from('proveedores').select('id, nombre, ruc').is('deleted_at', null);
  if (errSel) throw new Error(`Error buscando proveedores existentes: ${errSel.message}`);
  const porClave = new Map();
  for (const p of existentes || []) porClave.set(p.ruc || p.nombre.toUpperCase(), p.id);

  const claveDe = f => f.ruc || f.nombre.toUpperCase();
  const representativos = new Map();
  for (const f of filas) {
    const clave = claveDe(f);
    if (!porClave.has(clave) && !representativos.has(clave)) representativos.set(clave, f);
  }

  for (const grupo of chunk([...representativos.values()], 200)) {
    const { data: nuevos, error: errIns } = await supabase
      .from('proveedores').insert(grupo.map(f => ({ nombre: f.nombre, ruc: f.ruc || null, activo: true })))
      .select('id, nombre, ruc');
    if (errIns) throw new Error(`Error creando proveedores nuevos: ${errIns.message}`);
    for (const n of nuevos) {
      idsCreados.proveedores.push(n.id);
      porClave.set(n.ruc || n.nombre.toUpperCase(), n.id);
    }
  }

  return f => porClave.get(claveDe(f));
}

async function revertirTodo(idsCreados) {
  const erroresRollback = [];
  const intentarBorrar = async (tabla, columna, id) => {
    const { error } = await supabase.from(tabla).delete().eq(columna, id);
    if (error) erroresRollback.push(`${tabla}.${columna}=${id}: ${error.message}`);
  };

  // Borrado redundante por caja_id: ya existe ON DELETE CASCADE confirmado en la
  // BD real, pero no hay migracion SQL versionada que lo garantice a futuro.
  for (const id of idsCreados.cajaChica) await intentarBorrar('caja_gastos', 'caja_id', id);
  for (const id of idsCreados.cajaChica) await intentarBorrar('caja_chica', 'id', id);
  for (const id of idsCreados.cobros) await intentarBorrar('cobros', 'id', id);
  for (const id of idsCreados.pagosBanco) await intentarBorrar('talonario_pagos_banco', 'id', id);
  for (const id of idsCreados.pagosPersonales) await intentarBorrar('talonario_pagos_personales', 'id', id);
  for (const id of idsCreados.compras) await intentarBorrar('compras', 'id', id);
  for (const id of idsCreados.facturasDueno) await intentarBorrar('talonario_registro_facturas_dueno', 'id', id);
  for (const id of idsCreados.proveedores) await intentarBorrar('proveedores', 'id', id);
  for (const id of idsCreados.clientes) await intentarBorrar('clientes', 'id', id);

  if (idsCreados.saldoBanco) {
    const { clave, valorAnterior } = idsCreados.saldoBanco;
    const { error } = valorAnterior === null
      ? await supabase.from('config_contabilidad').delete().eq('clave', clave)
      : await supabase.from('config_contabilidad').upsert({ clave, valor: valorAnterior }, { onConflict: 'clave' });
    if (error) erroresRollback.push(`config_contabilidad.clave=${clave}: ${error.message}`);
  }

  if (erroresRollback.length > 0) {
    throw new Error(`El rollback no se completo del todo, revisa manualmente: ${erroresRollback.join('; ')}`);
  }
}

export async function ejecutarImport(datos) {
  const { mes, año } = datos;
  const idsCreados = { cajaChica: [], cobros: [], pagosBanco: [], pagosPersonales: [], compras: [], facturasDueno: [], proveedores: [], clientes: [], saldoBanco: null };
  const conteos = {};

  try {
    // GASTOS -> caja_chica (1 fila por fecha distinta) + caja_gastos, en lotes
    // en vez de fila por fila (un Excel real puede traer ~190 gastos en ~27
    // fechas distintas -- de ~217 idas y vueltas de red bajamos a ~2).
    const fechasUnicas = [...new Set(datos.gastos.map(g => g.fecha))];
    const cajaIdPorFecha = {};
    for (const grupo of chunk(fechasUnicas, 200)) {
      const { data: cajas, error } = await supabase.from('caja_chica')
        .insert(grupo.map(fecha => ({ fecha }))).select('id, fecha');
      if (error) throw new Error(`Error creando caja_chica: ${error.message}`);
      for (const c of cajas) { idsCreados.cajaChica.push(c.id); cajaIdPorFecha[c.fecha] = c.id; }
    }
    for (const grupo of chunk(datos.gastos, 200)) {
      const { error } = await supabase.from('caja_gastos').insert(grupo.map(g => ({
        caja_id: cajaIdPorFecha[g.fecha], proveedor: g.nombre, detalle: g.detalle,
        valor: g.valor, es_personal: false,
      })));
      if (error) throw new Error(`Error insertando gastos: ${error.message}`);
    }
    conteos.gastos = datos.gastos.length;

    // COBROS EFECTIVO / CHEQUES / TRANSFERENCIA / DEPOSITO -> cobros, en lotes.
    // Los clientes se resuelven todos de una vez (resolverClientesEnLote), no
    // uno por fila -- un Excel real puede traer ~700 cobros.
    const cobrosAInsertar = [
      ...datos.cobrosEfectivo.map(c => ({ ...c, forma_pago: 'efectivo' })),
      ...datos.cobrosCheques.map(c => ({ ...c, forma_pago: 'cheque' })),
      ...datos.cobrosTransferencia.transferencia.map(c => ({ ...c, nombre: c.cliente, forma_pago: 'transferencia' })),
      ...datos.cobrosTransferencia.deposito.map(c => ({ ...c, nombre: c.cliente, forma_pago: c.formaPago === 'DEPOSITO' ? 'deposito' : 'tarjeta_credito' })),
    ];
    const resolverCliente = await resolverClientesEnLote(cobrosAInsertar.map(c => c.nombre), idsCreados);
    for (const grupo of chunk(cobrosAInsertar, 200)) {
      const { data: cobrosNuevos, error } = await supabase.from('cobros').insert(grupo.map(c => ({
        fecha: c.fecha, monto: c.valor, forma_pago: c.forma_pago, cliente_id: resolverCliente(c.nombre),
      }))).select('id');
      if (error) throw new Error(`Error insertando cobros: ${error.message}`);
      for (const c of cobrosNuevos) idsCreados.cobros.push(c.id);
    }
    conteos.cobros = cobrosAInsertar.length;

    // PAGOS DEL MES -> talonario_pagos_banco, en lotes
    for (const grupo of chunk(datos.pagosDelMes, 200)) {
      const { data: pagosNuevos, error } = await supabase.from('talonario_pagos_banco').insert(grupo.map(p => ({
        mes, año, fecha: p.fecha, beneficiario: p.nombre, concepto: p.nombre, monto: p.valor, forma_pago: '20',
      }))).select('id');
      if (error) throw new Error(`Error insertando pagos del mes: ${error.message}`);
      for (const p of pagosNuevos) idsCreados.pagosBanco.push(p.id);
    }
    conteos.pagosDelMes = datos.pagosDelMes.length;
    conteos.pagosOmitidos = datos.pagosOmitidos || [];

    // OTROS PAGOS PERSONALES -> talonario_pagos_personales, en lotes
    const personalesAInsertar = [
      ...datos.otrosPagosPersonales.prestamos.map(p => ({ ...p, categoria: 'prestamos' })),
      ...datos.otrosPagosPersonales.tarjetas.map(p => ({ ...p, categoria: 'tarjetas' })),
      ...datos.otrosPagosPersonales.gastosPersonales.map(p => ({ ...p, categoria: 'gastos_personal' })),
      ...datos.otrosPagosPersonales.otrosGastos.map(p => ({ ...p, categoria: 'otros' })),
    ];
    for (const grupo of chunk(personalesAInsertar, 200)) {
      const { data: pagosNuevos, error } = await supabase.from('talonario_pagos_personales').insert(grupo.map(p => ({
        mes, año, fecha: p.fecha, beneficiario: p.nombre, concepto: p.nombre,
        monto: p.valor, categoria: p.categoria, forma_pago: '20',
      }))).select('id');
      if (error) throw new Error(`Error insertando pagos personales: ${error.message}`);
      for (const p of pagosNuevos) idsCreados.pagosPersonales.push(p.id);
    }
    conteos.pagosPersonales = personalesAInsertar.length;

    // COMPRAS DE EMPRESA (con/sin factura) -> compras, en lotes.
    // estado:'pagada' aunque forma_pago sea 'credito' (combinacion que el flujo manual
    // de la app nunca genera): son compras historicas (6+ meses), David confirmo que ya
    // estan liquidadas y no deben aparecer como deuda pendiente en Cuentas por Pagar.
    const comprasEmpresaAInsertar = [
      ...datos.comprasEmpresa.conFactura.map(c => ({ ...c, tieneFactura: true, esPersonal: false })),
      ...datos.comprasEmpresa.sinFactura.map(c => ({ ...c, tieneFactura: false, esPersonal: false })),
    ];

    const resolverProveedor = await resolverProveedoresEnLote(
      comprasEmpresaAInsertar.map(c => ({ nombre: c.proveedor, ruc: c.ruc })), idsCreados);
    for (const grupo of chunk(comprasEmpresaAInsertar, 200)) {
      const { data: comprasNuevas, error } = await supabase.from('compras').insert(grupo.map(c => ({
        fecha: c.fecha, proveedor_id: resolverProveedor({ nombre: c.proveedor, ruc: c.ruc }), proveedor_nombre: c.proveedor,
        numero_factura: c.numero || null, tiene_factura: c.tieneFactura, subtotal: c.valor, total: c.valor,
        forma_pago: 'credito', es_personal: c.esPersonal, estado: 'pagada',
      }))).select('id');
      if (error) throw new Error(`Error insertando compras: ${error.message}`);
      for (const c of comprasNuevas) idsCreados.compras.push(c.id);
    }
    conteos.comprasEmpresa = comprasEmpresaAInsertar.length;

    // FACTURAS A NOMBRE DEL DUEÑO (hoja COMPRAS -PERSONAL) -> talonario_registro_facturas_dueno.
    // Puro registro -- no toca la tabla compras ni el Resumen.
    for (const grupo of chunk(datos.comprasPersonal, 200)) {
      const { data: facturasNuevas, error } = await supabase.from('talonario_registro_facturas_dueno').insert(grupo.map(c => ({
        mes, año, fecha: c.fecha, ruc: c.ruc || null, proveedor: c.proveedor,
        numero_factura: c.numero || null, valor: c.valor, detalle: c.detalle || null,
      }))).select('id');
      if (error) throw new Error(`Error insertando facturas del dueño: ${error.message}`);
      for (const f of facturasNuevas) idsCreados.facturasDueno.push(f.id);
    }
    conteos.comprasPersonal = datos.comprasPersonal.length;

    // SALDO BANCO REAL -> config_contabilidad (mismo lugar donde el usuario lo
    // ingresa a mano en Movimientos Banco). Se guarda el valor previo (si habia)
    // para poder restaurarlo en el rollback en vez de solo borrar la fila.
    if (datos.saldoBancoReal !== null) {
      const clave = `saldo_banco_${año}_${mes}`;
      const { data: anterior, error: errSel } = await supabase
        .from('config_contabilidad').select('valor').eq('clave', clave).maybeSingle();
      if (errSel) throw new Error(`Error leyendo el saldo banco real previo: ${errSel.message}`);
      idsCreados.saldoBanco = { clave, valorAnterior: anterior ? anterior.valor : null };
      const { error } = await supabase.from('config_contabilidad')
        .upsert({ clave, valor: { saldo: String(datos.saldoBancoReal) } }, { onConflict: 'clave' });
      if (error) throw new Error(`Error guardando el saldo banco real: ${error.message}`);
      conteos.saldoBancoReal = datos.saldoBancoReal;
    }

    return conteos;
  } catch (err) {
    try {
      await revertirTodo(idsCreados);
    } catch (errRollback) {
      throw new Error(`${err.message} -- ADEMAS, ${errRollback.message}`);
    }
    throw err;
  }
}
