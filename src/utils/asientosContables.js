import { supabase } from '../supabase';

export async function getCuentasModulos() {
  const { data, error } = await supabase
    .from('config_contabilidad')
    .select('valor')
    .eq('clave', 'cuentas_modulos')
    .single();
  if (error) return { cuentas: null, error };
  return { cuentas: data.valor, error: null };
}

function validarPartidaDoble(lineas) {
  const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
  const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    return `Asiento no cuadra: debe=${totalDebe} haber=${totalHaber}`;
  }
  return null;
}

function cuentaCashOrBank(formaPago, cuentas) {
  if (!formaPago || formaPago === 'efectivo')          return cuentas.caja_chica_id;
  if (formaPago === 'credito' || formaPago === 'credito_nomina') return cuentas.cxc_id;
  return cuentas.banco_id; // transferencia, cheque, deposito
}

async function insertarAsiento({ fecha, descripcion, tipo, origen, origen_id, lineas }) {
  const errorCuadre = validarPartidaDoble(lineas);
  if (errorCuadre) return { data: null, error: errorCuadre };

  const { data: cabecera, error: errCab } = await supabase
    .from('libro_diario')
    .insert({ fecha, descripcion, tipo, origen, origen_id, estado: 'provisional' })
    .select()
    .single();

  if (errCab) return { data: null, error: errCab };

  const lineasConId = lineas.map((l) => ({ ...l, asiento_id: cabecera.id }));

  const { data: detalles, error: errDet } = await supabase
    .from('libro_diario_detalle')
    .insert(lineasConId)
    .select();

  if (errDet) return { data: null, error: errDet };
  return { data: { cabecera, detalles }, error: null };
}

export async function generarAsientoFactura(factura, tipo) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const cuentaDebe = cuentaCashOrBank(factura.metodo_pago, cuentas);
  const descripcionCab = `Venta - ${factura.numero} - ${factura.cliente_nombre}`;
  const labelCobro = factura.metodo_pago === 'efectivo' ? 'Caja Chica'
    : factura.metodo_pago === 'credito' || factura.metodo_pago === 'credito_nomina' ? 'CxC Clientes'
    : 'Banco';

  let lineas;

  if (tipo === 'interno') {
    lineas = [
      { cuenta_id: cuentaDebe, descripcion: `${labelCobro} — ${factura.numero}`, debe: factura.total, haber: 0, orden: 0 },
      { cuenta_id: cuentas.ventas_internas_id, descripcion: `Ventas — ${factura.numero} — ${factura.cliente_nombre}`, debe: 0, haber: factura.total, orden: 1 },
    ];
  } else {
    lineas = [
      { cuenta_id: cuentaDebe, descripcion: `${labelCobro} — ${factura.numero}`, debe: factura.total, haber: 0, orden: 0 },
      { cuenta_id: cuentas.ventas_gravadas_id, descripcion: `Ventas — ${factura.numero} — ${factura.cliente_nombre}`, debe: 0, haber: factura.subtotal, orden: 1 },
      { cuenta_id: cuentas.iva_ventas_id, descripcion: `IVA Ventas — ${factura.numero}`, debe: 0, haber: factura.iva, orden: 2 },
    ];
  }

  return insertarAsiento({
    fecha,
    descripcion: descripcionCab,
    tipo,
    origen: 'facturacion',
    origen_id: factura.id,
    lineas,
  });
}

export async function generarAsientoCompra(compra) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const numFact = compra.numero_factura ? `${compra.numero_factura} — ` : '';
  const descripcionCab = `Compra MP - ${numFact}${compra.proveedor_nombre}`;
  const cuentaHaber = compra.forma_pago === 'credito'
    ? cuentas.cxp_id
    : compra.forma_pago === 'efectivo'
      ? cuentas.caja_chica_id
      : cuentas.banco_id;

  const labelPago = compra.forma_pago === 'efectivo' ? 'Caja Chica'
    : compra.forma_pago === 'credito' ? 'CxP Proveedores'
    : 'Banco';

  const comision = parseFloat(compra.comision || 0);
  const totalBanco = compra.total + comision;

  const lineas = [
    { cuenta_id: cuentas.inventario_mp_id, descripcion: `Inventario MP — ${numFact}${compra.proveedor_nombre}`, debe: compra.subtotal, haber: 0, orden: 0 },
  ];

  if (compra.iva > 0) {
    lineas.push({ cuenta_id: cuentas.iva_compras_id, descripcion: `IVA Compras — ${numFact}${compra.proveedor_nombre}`, debe: compra.iva, haber: 0, orden: 1 });
  }

  if (comision > 0 && compra.forma_pago !== 'efectivo' && compra.forma_pago !== 'credito') {
    lineas.push({ cuenta_id: cuentas.gasto_caja_id, descripcion: `Gasto comisión banco — ${numFact}${compra.proveedor_nombre}`, debe: comision, haber: 0, orden: lineas.length });
  }

  lineas.push({ cuenta_id: cuentaHaber, descripcion: `${labelPago} — ${numFact}${compra.proveedor_nombre}`, debe: 0, haber: comision > 0 && compra.forma_pago !== 'efectivo' && compra.forma_pago !== 'credito' ? totalBanco : compra.total, orden: lineas.length });

  return insertarAsiento({
    fecha,
    descripcion: descripcionCab,
    tipo: 'tributario',
    origen: 'compras',
    origen_id: compra.id,
    lineas,
  });
}

export async function revertirAsientoCompra(compraOriginal, asientoId) {
  const { data: detalles, error: errSel } = await supabase
    .from('libro_diario_detalle')
    .select('cuenta_id, descripcion, debe, haber, orden')
    .eq('asiento_id', asientoId);
  if (errSel) return { data: null, error: errSel };
  if (!detalles || detalles.length === 0) {
    return { data: null, error: `No se encontraron líneas para el asiento ${asientoId}` };
  }

  const lineasInvertidas = detalles.map((l, i) => ({
    cuenta_id: l.cuenta_id,
    descripcion: `Reversión — ${l.descripcion}`,
    debe: l.haber, haber: l.debe,
    orden: i,
  }));

  return insertarAsiento({
    fecha: new Date().toISOString().split('T')[0],
    descripcion: `Reversión por edición — Compra ${compraOriginal.proveedor_nombre}`,
    tipo: 'tributario',
    origen: 'compras',
    origen_id: compraOriginal.id,
    lineas: lineasInvertidas,
  });
}

export async function sincronizarAsientoCompraEditada(compraActualizada, { forzarReversion }) {
  // Anulación (compra puesta en cero): no tiene sentido generar un asiento
  // nuevo sin movimiento real despues de revertir el original.
  const esAnulacion = !compraActualizada.subtotal && !compraActualizada.iva && !compraActualizada.total;

  const { data: asientoExistente, error: errSel } = await supabase
    .from('libro_diario')
    .select('id, estado')
    .eq('origen', 'compras')
    .eq('origen_id', compraActualizada.id)
    .neq('estado', 'eliminado')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errSel) return { data: null, error: errSel };

  if (!asientoExistente) {
    return esAnulacion ? { data: null, error: null } : generarAsientoCompra(compraActualizada);
  }

  if (asientoExistente.estado === 'provisional' && !forzarReversion) {
    const { error: errDel } = await supabase.from('libro_diario').delete().eq('id', asientoExistente.id);
    if (errDel) return { data: null, error: errDel };
    return esAnulacion ? { data: null, error: null } : generarAsientoCompra(compraActualizada);
  }

  const { error: errRev } = await revertirAsientoCompra(compraActualizada, asientoExistente.id);
  if (errRev) return { data: null, error: errRev };
  return esAnulacion ? { data: null, error: null } : generarAsientoCompra(compraActualizada);
}

export async function generarAsientoPagoProveedor(pago) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const numFact = pago.numero_factura ? `${pago.numero_factura} — ` : '';
  const descripcionCab = `Pago proveedor - ${numFact}${pago.proveedor_nombre}`;
  const comision = parseFloat(pago.comision || 0);
  const totalBanco = pago.monto + comision;
  const cuentaGasto = cuentas.gasto_caja_id;

  const lineas = [
    { cuenta_id: cuentas.cxp_id,  descripcion: `CxP Proveedores — ${numFact}${pago.proveedor_nombre}`, debe: pago.monto, haber: 0,           orden: 0 },
    { cuenta_id: cuentas.banco_id, descripcion: `Banco — ${numFact}${pago.proveedor_nombre}`,           debe: 0,         haber: totalBanco,   orden: 1 },
  ];

  if (comision > 0) {
    lineas.push({ cuenta_id: cuentaGasto, descripcion: `Gasto comisión banco — ${pago.proveedor_nombre}`, debe: comision, haber: 0, orden: 2 });
  }

  return insertarAsiento({
    fecha:       pago.fecha_pago,
    descripcion: descripcionCab,
    tipo:        'tributario',
    origen:      'pagos_compras',
    origen_id:   pago.id,
    lineas,
  });
}

export async function generarAsientoDevolucionProveedor(devolucion) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const cuentaDebe  = devolucion.forma_pago === 'efectivo' ? cuentas.caja_chica_id : cuentas.banco_id;
  const labelCuenta = devolucion.forma_pago === 'efectivo' ? 'Caja Chica' : 'Banco';
  const descripcionCab = `Devolución proveedor - ${devolucion.proveedor_nombre}`;

  const lineas = [
    { cuenta_id: cuentaDebe,     descripcion: `${labelCuenta} — devolución ${devolucion.proveedor_nombre}`, debe: devolucion.monto, haber: 0, orden: 0 },
    { cuenta_id: cuentas.cxp_id, descripcion: `CxP Proveedores — devolución ${devolucion.proveedor_nombre}`, debe: 0, haber: devolucion.monto, orden: 1 },
  ];

  return insertarAsiento({
    fecha: devolucion.fecha,
    descripcion: descripcionCab,
    tipo: 'tributario',
    origen: 'devoluciones_proveedor',
    origen_id: devolucion.cuenta_pagar_id,
    lineas,
  });
}

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export async function generarAsientoPagoFijo({ id, monto, codigo, cuenta_debe_key, mes, año, formaPago, origen }) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const cuentaDebe = cuentas[cuenta_debe_key];
  if (!cuentaDebe) return { data: null, error: `Cuenta ${cuenta_debe_key} no configurada` };

  // formaPago aqui es codigo SRI ('01' = Efectivo), no el texto plano que usan
  // otras funciones de este archivo (cuentaCashOrBank, generarAsientoNomina, etc.)
  const cuentaHaber = formaPago === '01' ? cuentas.caja_chica_id : cuentas.banco_id;
  const descripcion = `${codigo} — ${MESES_CORTOS[mes - 1]} ${año}`;

  return insertarAsiento({
    fecha:       new Date().toISOString().split('T')[0],
    descripcion,
    tipo:        'tributario',
    origen:      origen || 'talonario_pagos_banco',
    origen_id:   id,
    lineas: [
      { cuenta_id: cuentaDebe,  descripcion, debe: monto, haber: 0,     orden: 0 },
      { cuenta_id: cuentaHaber, descripcion, debe: 0,     haber: monto, orden: 1 },
    ],
  });
}

export async function generarAsientoNomina(nomina, formaPago = 'transferencia') {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const diferencia = nomina.total_sueldos - nomina.total_pagar;

  const descA = `Nómina - ${nomina.periodo} - Pago sueldos`;
  const labelPagoNom = formaPago === 'efectivo' ? 'Caja Chica' : 'Banco';
  const lineasA = [
    { cuenta_id: cuentas.sueldos_id, descripcion: `Gasto Sueldos — ${nomina.periodo}`, debe: nomina.total_sueldos, haber: 0, orden: 0 },
    { cuenta_id: formaPago === 'efectivo' ? cuentas.caja_chica_id : cuentas.banco_id,
      descripcion: `Pago nómina (${labelPagoNom}) — ${nomina.periodo}`, debe: 0, haber: nomina.total_pagar, orden: 1 },
  ];
  if (diferencia > 0.01) {
    lineasA.push({ cuenta_id: cuentas.sueldos_pagar_id, descripcion: `Descuentos retenidos — ${nomina.periodo}`, debe: 0, haber: diferencia, orden: 2 });
  }

  const { data: dataA, error: errA } = await insertarAsiento({
    fecha,
    descripcion: descA,
    tipo: 'tributario',
    origen: 'nomina',
    origen_id: nomina.id,
    lineas: lineasA,
  });
  if (errA) return { data: null, error: errA };

  const descB = `Nómina - ${nomina.periodo} - IESS Patronal`;
  const lineasB = [
    { cuenta_id: cuentas.iess_patronal_id, descripcion: `Gasto IESS Patronal — ${nomina.periodo}`, debe: nomina.total_iess_patronal, haber: 0, orden: 0 },
    { cuenta_id: cuentas.iess_pagar_id, descripcion: `IESS por Pagar — ${nomina.periodo}`, debe: 0, haber: nomina.total_iess_patronal, orden: 1 },
  ];

  const { data: dataB, error: errB } = await insertarAsiento({
    fecha,
    descripcion: descB,
    tipo: 'tributario',
    origen: 'nomina',
    origen_id: nomina.id,
    lineas: lineasB,
  });
  if (errB) return { data: null, error: errB };

  return { data: [dataA, dataB], error: null };
}

export async function generarAsientoCierre(cierre, cuentas) {
  // Compatibilidad: si se pasa solo el id (versión anterior), obtener cuentas
  if (typeof cuentas === 'string') {
    const cfg = await getCuentasModulos();
    if (cfg.error) return { data: null, error: cfg.error };
    cuentas = cfg.cuentas;
  }

  if (!cierre.total_ingresos && !cierre.total_gastos) {
    return { data: null, error: 'Cierre sin movimientos' };
  }

  const fecha = cierre.fecha;
  const fmt   = v => `$${parseFloat(v||0).toFixed(2)}`;
  const cab   = 'Cierre Caja Chica';
  const lineas = [];

  // Saldo inicial en caja
  if (cierre.total_ingresos > 0) {
    lineas.push({
      cuenta_id:   cuentas.caja_chica_id,
      descripcion: `Inicio Caja Chica: ${fmt(cierre.total_ingresos)}`,
      debe: cierre.total_ingresos, haber: 0, orden: lineas.length,
    });
    lineas.push({
      cuenta_id:   cuentas.ventas_internas_id,
      descripcion: `Cierre Caja Chica: ${fmt(cierre.total_ingresos)}`,
      debe: 0, haber: cierre.total_ingresos, orden: lineas.length,
    });
  }

  // Gastos pagados en efectivo
  if (cierre.total_gastos > 0) {
    lineas.push({
      cuenta_id:   cuentas.gasto_caja_id,
      descripcion: `Gastos efectivo Caja Chica: ${fmt(cierre.total_gastos)}`,
      debe: cierre.total_gastos, haber: 0, orden: lineas.length,
    });
    lineas.push({
      cuenta_id:   cuentas.caja_chica_id,
      descripcion: `Sale de Caja Chica (gastos): ${fmt(cierre.total_gastos)}`,
      debe: 0, haber: cierre.total_gastos, orden: lineas.length,
    });
  }

  // Depósito al banco
  const deposito = parseFloat(cierre.total_deposito || 0);
  if (deposito > 0 && cuentas.banco_id) {
    lineas.push({
      cuenta_id:   cuentas.banco_id,
      descripcion: `Entra a Banco desde Caja Chica: ${fmt(deposito)}`,
      debe: deposito, haber: 0, orden: lineas.length,
    });
    lineas.push({
      cuenta_id:   cuentas.caja_chica_id,
      descripcion: `Sale de Caja Chica a Banco: ${fmt(deposito)}`,
      debe: 0, haber: deposito, orden: lineas.length,
    });
  }

  return insertarAsiento({
    fecha,
    descripcion: cab,
    tipo:       'interno',
    origen:     'caja_chica',
    origen_id:  cierre.id,
    lineas,
  });
}

export async function generarAsientoInicial(config) {
  if (Math.abs(config.banco + config.caja + config.inventario - config.patrimonio) > 0.01) {
    return { data: null, error: 'Asiento no cuadra: banco+caja+inventario ≠ patrimonio' };
  }

  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const descripcionCab = 'Asiento Inicial - Saldos apertura';
  const lineas = [
    { cuenta_id: cuentas.banco_id, descripcion: descripcionCab, debe: config.banco, haber: 0, orden: 0 },
    { cuenta_id: cuentas.caja_chica_id, descripcion: descripcionCab, debe: config.caja, haber: 0, orden: 1 },
    { cuenta_id: cuentas.inventario_mp_id, descripcion: descripcionCab, debe: config.inventario, haber: 0, orden: 2 },
    { cuenta_id: cuentas.capital_id, descripcion: descripcionCab, debe: 0, haber: config.patrimonio, orden: 3 },
  ];

  const resultado = await insertarAsiento({
    fecha: config.fecha,
    descripcion: descripcionCab,
    tipo: 'tributario',
    origen: 'asiento_inicial',
    origen_id: null,
    lineas,
  });

  if (resultado.error) return resultado;

  await supabase
    .from('config_contabilidad')
    .upsert({
      clave: 'asiento_inicial',
      valor: {
        completado: true,
        fecha: config.fecha,
        banco: config.banco,
        caja: config.caja,
        inventario: config.inventario,
        patrimonio: config.patrimonio,
      },
    });

  return resultado;
}

export async function generarAsientoCobro(cobro) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const cuentaDebe = cobro.forma_pago === 'efectivo'
    ? cuentas.caja_chica_id
    : cuentas.banco_id;
  const labelCuenta = cobro.forma_pago === 'efectivo' ? 'Caja Chica' : 'Banco';

  const descripcionCab = `Cobro CxC - ${cobro.forma_pago || 'efectivo'}`;
  const lineas = [
    { cuenta_id: cuentaDebe,     descripcion: labelCuenta,    debe: cobro.monto, haber: 0,           orden: 0 },
    { cuenta_id: cuentas.cxc_id, descripcion: 'CxC Clientes', debe: 0,           haber: cobro.monto, orden: 1 },
  ];

  return insertarAsiento({
    fecha:       cobro.fecha,
    descripcion: descripcionCab,
    tipo:        'interno',
    origen:      'cobros',
    origen_id:   cobro.id,
    lineas,
  });
}

export async function sincronizarAsientos() {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { sincronizados: 0, errores: [errCfg] };

  let sincronizados = 0;
  const errores = [];

  const { data: idsFactConAsiento } = await supabase
    .from('libro_diario')
    .select('origen_id')
    .eq('origen', 'facturacion')
    .not('origen_id', 'is', null);
  const idsFactSet = (idsFactConAsiento || []).map((r) => r.origen_id);

  let queryFact = supabase.from('facturas').select('*');
  if (idsFactSet.length > 0) queryFact = queryFact.not('id', 'in', `(${idsFactSet.join(',')})`);
  const { data: facturasSinAsiento, error: errFact } = await queryFact;

  if (errFact) {
    errores.push(`Error leyendo facturas: ${errFact.message}`);
  } else if (facturasSinAsiento && facturasSinAsiento.length > 0) {
    for (const factura of facturasSinAsiento) {
      const tipo = factura.tipo || 'tributario';
      const { error } = await generarAsientoFactura(factura, tipo);
      if (error) {
        errores.push(`Factura ${factura.id}: ${typeof error === 'string' ? error : error.message}`);
      } else {
        sincronizados++;
      }
    }
  }

  const { data: idsCompConAsiento } = await supabase
    .from('libro_diario')
    .select('origen_id')
    .eq('origen', 'compras')
    .not('origen_id', 'is', null);
  const idsCompSet = (idsCompConAsiento || []).map((r) => r.origen_id);

  let queryComp = supabase.from('compras').select('*');
  if (idsCompSet.length > 0) queryComp = queryComp.not('id', 'in', `(${idsCompSet.join(',')})`);
  const { data: comprasSinAsiento, error: errComp } = await queryComp;

  if (errComp) {
    errores.push(`Error leyendo compras: ${errComp.message}`);
  } else if (comprasSinAsiento && comprasSinAsiento.length > 0) {
    for (const compra of comprasSinAsiento) {
      const { error } = await generarAsientoCompra(compra);
      if (error) {
        errores.push(`Compra ${compra.id}: ${typeof error === 'string' ? error : error.message}`);
      } else {
        sincronizados++;
      }
    }
  }

  return { sincronizados, errores };
}

export async function revertirAsientoFactura(factura) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const cuentaHaber = cuentaCashOrBank(factura.forma_pago, cuentas);
  const labelHaber = factura.forma_pago === 'efectivo' ? 'Caja Chica'
    : factura.forma_pago === 'credito' ? 'CxC Clientes'
    : 'Banco';
  const descripcionCab = `Anulación Factura - ${factura.numero} - ${factura.cliente_nombre}`;

  const lineas = [
    { cuenta_id: cuentas.ventas_gravadas_id, descripcion: `Anulación Ventas — ${factura.numero} — ${factura.cliente_nombre}`, debe: factura.subtotal, haber: 0,             orden: 0 },
    { cuenta_id: cuentas.iva_ventas_id,      descripcion: `Anulación IVA Ventas — ${factura.numero}`,                          debe: factura.iva,      haber: 0,             orden: 1 },
    { cuenta_id: cuentaHaber,                descripcion: `Anulación ${labelHaber} — ${factura.numero}`,                      debe: 0,                haber: factura.total, orden: 2 },
  ];

  return insertarAsiento({
    fecha,
    descripcion: descripcionCab,
    tipo: 'tributario',
    origen: 'facturacion',
    origen_id: factura.id,
    lineas,
  });
}

export async function revertirAsientoNotaVenta(factura) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const cuentaDebe = cuentaCashOrBank(factura.metodo_pago, cuentas);
  const labelDebe = factura.metodo_pago === 'efectivo' ? 'Caja Chica'
    : factura.metodo_pago === 'credito' ? 'CxC Clientes'
    : 'Banco';
  const descripcionCab = `Anulación NV - ${factura.numero} - ${factura.cliente_nombre}`;

  const lineas = [
    { cuenta_id: cuentas.ventas_internas_id, descripcion: `Anulación Ventas — ${factura.numero} — ${factura.cliente_nombre}`, debe: factura.total, haber: 0, orden: 0 },
    { cuenta_id: cuentaDebe,                 descripcion: `Anulación ${labelDebe} — ${factura.numero}`,                      debe: 0, haber: factura.total, orden: 1 },
  ];

  return insertarAsiento({
    fecha,
    descripcion: descripcionCab,
    tipo: 'interno',
    origen: 'facturacion',
    origen_id: factura.id,
    lineas,
  });
}
