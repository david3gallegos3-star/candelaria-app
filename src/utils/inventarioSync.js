import { supabase } from '../supabase';

export async function ajustarInventarioPorEdicion(itemOriginal, itemNuevo, contexto) {
  const delta = parseFloat(itemNuevo.cantidad_kg) - parseFloat(itemOriginal.cantidad_kg || 0);
  if (delta === 0) return;

  const { data: inv } = await supabase
    .from('inventario_mp')
    .select('id, stock_kg')
    .eq('materia_prima_id', itemNuevo.materia_prima_id)
    .maybeSingle();

  if (!inv) return;

  const nuevoStock = parseFloat(inv.stock_kg || 0) + delta;
  await supabase.from('inventario_mp')
    .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
    .eq('id', inv.id);

  await supabase.from('inventario_movimientos').insert({
    materia_prima_id: itemNuevo.materia_prima_id,
    nombre_mp: itemNuevo.mp_nombre,
    tipo: 'ajuste_edicion',
    kg: delta,
    motivo: `Ajuste por edición de compra — ${contexto.proveedor_nombre}`,
    usuario_nombre: contexto.usuario_nombre,
    user_id: contexto.user_id,
    fecha: new Date().toISOString().split('T')[0],
  });
}
