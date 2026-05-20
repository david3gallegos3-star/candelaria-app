import { supabase } from '../supabase';

async function getCuentasModulos() {
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
  const cuentaDebe = factura.metodo_pago === 'credito' ? cuentas.cxc_id : cuentas.caja_general_id;
  const descripcionCab = `Venta - ${factura.numero} - ${factura.cliente_nombre}`;

  let lineas;

  if (tipo === 'interno') {
    lineas = [
      { cuenta_id: cuentaDebe, descripcion: descripcionCab, debe: factura.total, haber: 0, orden: 0 },
      { cuenta_id: cuentas.ventas_internas_id, descripcion: descripcionCab, debe: 0, haber: factura.total, orden: 1 },
    ];
  } else {
    lineas = [
      { cuenta_id: cuentaDebe, descripcion: descripcionCab, debe: factura.total, haber: 0, orden: 0 },
      { cuenta_id: cuentas.ventas_gravadas_id, descripcion: descripcionCab, debe: 0, haber: factura.subtotal, orden: 1 },
      { cuenta_id: cuentas.iva_ventas_id, descripcion: descripcionCab, debe: 0, haber: factura.iva, orden: 2 },
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
  const descripcionCab = `Compra MP - ${compra.proveedor_nombre}`;
  const cuentaHaber = compra.forma_pago === 'credito' ? cuentas.cxp_id : cuentas.banco_id;

  const lineas = [
    { cuenta_id: cuentas.inventario_mp_id, descripcion: descripcionCab, debe: compra.subtotal, haber: 0, orden: 0 },
  ];

  if (compra.iva > 0) {
    lineas.push({ cuenta_id: cuentas.iva_compras_id, descripcion: descripcionCab, debe: compra.iva, haber: 0, orden: 1 });
  }

  lineas.push({ cuenta_id: cuentaHaber, descripcion: descripcionCab, debe: 0, haber: compra.total, orden: lineas.length });

  return insertarAsiento({
    fecha,
    descripcion: descripcionCab,
    tipo: 'tributario',
    origen: 'compras',
    origen_id: compra.id,
    lineas,
  });
}

export async function generarAsientoNomina(nomina) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  const fecha = new Date().toISOString().split('T')[0];
  const diferencia = nomina.total_sueldos - nomina.total_pagar;

  const descA = `Nómina - ${nomina.periodo} - Pago sueldos`;
  const lineasA = [
    { cuenta_id: cuentas.sueldos_id, descripcion: descA, debe: nomina.total_sueldos, haber: 0, orden: 0 },
    { cuenta_id: cuentas.banco_id, descripcion: descA, debe: 0, haber: nomina.total_pagar, orden: 1 },
  ];
  if (diferencia > 0.01) {
    lineasA.push({ cuenta_id: cuentas.sueldos_pagar_id, descripcion: descA, debe: 0, haber: diferencia, orden: 2 });
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
    { cuenta_id: cuentas.iess_patronal_id, descripcion: descB, debe: nomina.total_iess_patronal, haber: 0, orden: 0 },
    { cuenta_id: cuentas.iess_pagar_id, descripcion: descB, debe: 0, haber: nomina.total_iess_patronal, orden: 1 },
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

export async function generarAsientoCierre(cierre, caja_chica_id) {
  const { cuentas, error: errCfg } = await getCuentasModulos();
  if (errCfg) return { data: null, error: errCfg };

  if (!cierre.total_ingresos && !cierre.total_gastos) {
    return { data: null, error: 'Cierre sin movimientos' };
  }

  const fecha = cierre.fecha;
  const descripcionCab = `Cierre Caja ${cierre.fecha}`;
  const lineas = [];

  if (cierre.total_ingresos > 0) {
    lineas.push({ cuenta_id: caja_chica_id, descripcion: descripcionCab, debe: cierre.total_ingresos, haber: 0, orden: 0 });
    lineas.push({ cuenta_id: cuentas.caja_general_id, descripcion: descripcionCab, debe: 0, haber: cierre.total_ingresos, orden: 1 });
  }

  if (cierre.total_gastos > 0) {
    lineas.push({ cuenta_id: cuentas.gasto_caja_id, descripcion: descripcionCab, debe: cierre.total_gastos, haber: 0, orden: lineas.length });
    lineas.push({ cuenta_id: caja_chica_id, descripcion: descripcionCab, debe: 0, haber: cierre.total_gastos, orden: lineas.length });
  }

  return insertarAsiento({
    fecha,
    descripcion: descripcionCab,
    tipo: 'interno',
    origen: 'caja_chica',
    origen_id: cierre.id,
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
    { cuenta_id: cuentas.caja_general_id, descripcion: descripcionCab, debe: config.caja, haber: 0, orden: 1 },
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
