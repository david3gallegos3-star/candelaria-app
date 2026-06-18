import { supabase } from '../supabase';

export function mesAnterior(año, mes) {
  return mes === 1 ? { año: año - 1, mes: 12 } : { año, mes: mes - 1 };
}

export function clasificarMes({ año, mes, asientoInicial }) {
  if (!asientoInicial?.completado) return 'pendiente';

  const [añoIni, mesIni] = asientoInicial.fecha.split('-').map(Number);

  if (año < añoIni || (año === añoIni && mes < mesIni)) return 'pendiente';
  if (año === añoIni && mes === mesIni) return 'inicial';
  return 'rebase';
}

export function calcularDiferencia(saldoReal, saldoCalculado) {
  const dif = parseFloat(saldoReal || 0) - saldoCalculado;
  const cuadra = Math.abs(dif) < 0.01;
  const color = cuadra ? '#27ae60' : dif < 0 ? '#e74c3c' : '#e67e22';
  return { dif, cuadra, color };
}

export async function calcularNetoBancoMes(año, mes) {
  const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
  const ultimoDia  = new Date(año, mes, 0).getDate();
  const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

  const [
    { data: cobros },
    { data: pagosB },
    { data: otrosI },
    { data: factsP },
    { data: ventasBanco },
    { data: comprasBanco },
    { data: cajasMes },
  ] = await Promise.all([
    supabase.from('cobros')
      .select('monto,comision,forma_pago')
      .in('forma_pago', ['transferencia','deposito','cheque','tarjeta_credito'])
      .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    supabase.from('talonario_pagos_banco')
      .select('monto')
      .eq('mes', mes).eq('año', año),
    supabase.from('talonario_otros_ingresos')
      .select('monto,forma_pago')
      .eq('mes', mes).eq('año', año)
      .neq('forma_pago', '01'),
    supabase.from('talonario_facturas_personales')
      .select('monto')
      .eq('mes', mes).eq('año', año)
      .eq('forma_pago', '20'),
    supabase.from('facturas')
      .select('total,forma_pago')
      .in('forma_pago', ['transferencia','cheque','tarjeta_credito'])
      .neq('estado', 'anulada')
      .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59'),
    supabase.from('compras')
      .select('total,comision,forma_pago')
      .in('forma_pago', ['transferencia','cheque','deposito'])
      .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    supabase.from('caja_chica')
      .select('id')
      .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
  ]);

  const cajaIds = (cajasMes || []).map(c => c.id);
  const { data: entregas } = cajaIds.length > 0
    ? await supabase.from('caja_entregas').select('cantidad').in('caja_id', cajaIds)
    : { data: [] };

  const entradasCobros   = (cobros||[]).reduce((s,c) => s + parseFloat(c.monto||0), 0);
  const comisiones       = (cobros||[]).reduce((s,c) => s + parseFloat(c.comision||0), 0);
  const entradasOtrosI   = (otrosI||[]).reduce((s,o) => s + parseFloat(o.monto||0), 0);
  const salidasPagosB    = (pagosB||[]).reduce((s,p) => s + parseFloat(p.monto||0), 0);
  const salidasFactsP    = (factsP||[]).reduce((s,f) => s + parseFloat(f.monto||0), 0);
  const entradasVentas   = (ventasBanco||[]).reduce((s,f) => s + parseFloat(f.total||0), 0);
  const salidasCompras   = (comprasBanco||[]).reduce((s,c) => s + parseFloat(c.total||0) + parseFloat(c.comision||0), 0);
  const entradasEntregas = (entregas||[]).reduce((s,e) => s + parseFloat(e.cantidad||0), 0);

  const totalEntradas = entradasCobros + entradasOtrosI + entradasVentas + entradasEntregas;
  const totalSalidas  = comisiones + salidasPagosB + salidasFactsP + salidasCompras;

  return { totalEntradas, totalSalidas, neto: totalEntradas - totalSalidas };
}

export async function calcularSaldoCalculado(año, mes, netoMes) {
  const { data: config } = await supabase
    .from('config_contabilidad').select('valor').eq('clave','asiento_inicial').single();
  const asientoInicial = config?.valor || {};

  const caso = clasificarMes({ año, mes, asientoInicial });

  if (caso === 'pendiente') {
    return { saldoCalculado: netoMes, pendienteInicial: true };
  }

  if (caso === 'inicial') {
    return { saldoCalculado: parseFloat(asientoInicial.banco || 0) + netoMes, pendienteInicial: false };
  }

  // caso === 'rebase': base = saldo real del mes anterior, o saldo calculado del mes anterior
  const { año: añoP, mes: mesP } = mesAnterior(año, mes);
  const { data: configPrev } = await supabase
    .from('config_contabilidad').select('valor').eq('clave', `saldo_banco_${añoP}_${mesP}`).maybeSingle();
  const saldoRealPrev = configPrev?.valor?.saldo;

  let base;
  if (saldoRealPrev !== undefined && saldoRealPrev !== null && saldoRealPrev !== '') {
    base = parseFloat(saldoRealPrev);
  } else {
    const { neto: netoPrev } = await calcularNetoBancoMes(añoP, mesP);
    base = (await calcularSaldoCalculado(añoP, mesP, netoPrev)).saldoCalculado;
  }

  return { saldoCalculado: base + netoMes, pendienteInicial: false };
}
