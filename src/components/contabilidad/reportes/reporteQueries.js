import { supabase } from '../../../supabase';

export async function getAsientosPorPeriodo(fechaDesde, fechaHasta) {
  const { data, error } = await supabase
    .from('libro_diario')
    .select('id')
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta)
    .neq('estado', 'eliminado');
  if (error) throw error;
  return (data || []).map(a => a.id);
}

export async function getAsientosHasta(fechaHasta) {
  const { data, error } = await supabase
    .from('libro_diario')
    .select('id')
    .lte('fecha', fechaHasta)
    .neq('estado', 'eliminado');
  if (error) throw error;
  return (data || []).map(a => a.id);
}

export async function getDetallesPorAsientos(asientoIds) {
  if (!asientoIds.length) return [];
  const { data, error } = await supabase
    .from('libro_diario_detalle')
    .select('cuenta_id, debe, haber, asiento_id')
    .in('asiento_id', asientoIds);
  if (error) throw error;
  return data || [];
}

export async function getDetallesConFechaPorAsientos(asientoIds) {
  if (!asientoIds.length) return [];
  const { data, error } = await supabase
    .from('libro_diario_detalle')
    .select(`id, cuenta_id, debe, haber, descripcion, orden, asiento:libro_diario(fecha, descripcion, origen)`)
    .in('asiento_id', asientoIds)
    .order('asiento_id')
    .order('orden');
  if (error) throw error;
  return data || [];
}

export async function getCuentasContables() {
  const { data, error } = await supabase
    .from('cuentas_contables')
    .select('id, codigo, nombre, tipo, nivel, naturaleza')
    .eq('activa', true)
    .order('codigo');
  if (error) throw error;
  return data || [];
}

export function agruparPorCuenta(detalles) {
  const mapa = {};
  detalles.forEach(d => {
    if (!mapa[d.cuenta_id]) mapa[d.cuenta_id] = { debe: 0, haber: 0 };
    mapa[d.cuenta_id].debe  += parseFloat(d.debe  || 0);
    mapa[d.cuenta_id].haber += parseFloat(d.haber || 0);
  });
  return mapa;
}

export function calcularSaldo(debe, haber, naturaleza) {
  return naturaleza === 'deudora' ? debe - haber : haber - debe;
}
