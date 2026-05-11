// src/utils/revertirLote.js
import { supabase } from '../supabase';
import { registrarAuditoria } from './helpers';

/**
 * Revierte completamente un lote de producción:
 * - Devuelve kg al inventario (carne + salmuera + rub + adicional + mermas)
 * - Elimina stock_lotes_inyectados, lotes_maduracion, produccion_inyeccion
 * - Registra en auditoría
 * Usa flag estado='revirtiendo' para recuperación ante crashes.
 */
// loteMadId opcional: id entero de lotes_maduracion para evitar filtro por lote_id (con slashes)
export async function revertirLote(loteId, currentUser, loteMadId = null) {
  // 1. Obtener datos del lote (usar id entero si disponible, evita problemas con slashes en lote_id)
  let lote;
  if (loteMadId) {
    const { data } = await supabase.from('lotes_maduracion')
      .select('id, produccion_id, fecha_entrada, lote_id')
      .eq('id', loteMadId).maybeSingle();
    lote = data;
  } else {
    const { data } = await supabase.from('lotes_maduracion')
      .select('id, produccion_id, fecha_entrada, lote_id')
      .eq('lote_id', loteId).maybeSingle();
    lote = data;
  }
  if (!lote) return;

  const produccionId = lote.produccion_id;

  // 3. Obtener produccion_inyeccion para saber la formula_salmuera
  const { data: produccion } = await supabase.from('produccion_inyeccion')
    .select('id, formula_salmuera')
    .eq('id', produccionId).maybeSingle();

  // 4. Obtener materia_prima_id de la carne desde produccion_inyeccion_cortes
  const { data: cortes } = await supabase.from('produccion_inyeccion_cortes')
    .select('materia_prima_id, kg_carne_cruda, corte_nombre')
    .eq('produccion_id', produccionId);

  const carneEntry = (cortes || [])[0];
  const carneMpId  = carneEntry?.materia_prima_id;
  const kgCarne    = parseFloat(carneEntry?.kg_carne_cruda || 0);
  const nombreProducto = carneEntry?.corte_nombre || loteId;

  // 5. Revertir todos los movimientos del wizard (motivo contiene loteId)
  const { data: wizardMovs } = await supabase.from('inventario_movimientos')
    .select('id, materia_prima_id, tipo, kg')
    .ilike('motivo', `%Lote ${loteId}%`);

  for (const mov of (wizardMovs || [])) {
    const { data: inv } = await supabase.from('inventario_mp')
      .select('id, stock_kg').eq('materia_prima_id', mov.materia_prima_id).maybeSingle();
    if (inv) {
      const delta = mov.tipo === 'salida' ? mov.kg : -mov.kg; // invertir
      await supabase.from('inventario_mp')
        .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) + delta) })
        .eq('id', inv.id);
    }
  }

  // 6. Revertir movimiento de carne (motivo: "Producción — {nombre}")
  if (carneMpId && kgCarne > 0) {
    const { data: carneInv } = await supabase.from('inventario_mp')
      .select('id, stock_kg').eq('materia_prima_id', carneMpId).maybeSingle();
    if (carneInv) {
      await supabase.from('inventario_mp')
        .update({ stock_kg: (carneInv.stock_kg || 0) + kgCarne })
        .eq('id', carneInv.id);
    }
    // Eliminar movimiento de carne (fecha_entrada + materia_prima_id)
    await supabase.from('inventario_movimientos')
      .delete()
      .eq('materia_prima_id', carneMpId)
      .eq('tipo', 'salida')
      .eq('fecha', lote.fecha_entrada);
  }

  // 7. Eliminar movimientos del wizard
  await supabase.from('inventario_movimientos')
    .delete().ilike('motivo', `%Lote ${loteId}%`);

  // 8. Eliminar stock_lotes_inyectados
  await supabase.from('stock_lotes_inyectados')
    .delete().eq('lote_id', lote.lote_id || loteId);

  // 9. Eliminar lotes_maduracion (usar id entero)
  await supabase.from('lotes_maduracion')
    .delete().eq('id', lote.id);

  // 10. Eliminar produccion_inyeccion_cortes y produccion_inyeccion
  if (produccionId) {
    await supabase.from('produccion_inyeccion_cortes')
      .delete().eq('produccion_id', produccionId);
    await supabase.from('produccion_inyeccion')
      .delete().eq('id', produccionId);
  }

  // 11. Registrar en auditoría
  await registrarAuditoria({
    tipo:            'lote_revertido',
    usuario_nombre:  currentUser?.email || 'sistema',
    user_id:         currentUser?.id    || null,
    producto_nombre: nombreProducto,
    campo_modificado: 'lote',
    valor_antes:     `${kgCarne.toFixed(3)} kg — Lote ${loteId}`,
    valor_despues:   'revertido',
    mensaje:         `Lote ${loteId} revertido por ${currentUser?.email || 'sistema'}`,
  });
}

/**
 * Revierte solo los pasos de momento2 de un lote (crash post-pesaje).
 * Mantiene carne y salmuera de momento1.
 * Resetea el lote a estado='madurando' para reintentar desde pesaje.
 */
export async function revertirMomento2(loteId, formulaSalmuera) {
  if (!loteId) return;

  // 1. Obtener datos del lote (usando id entero para el UPDATE posterior)
  const { data: lote } = await supabase.from('lotes_maduracion')
    .select('id, bloques_resultado').eq('lote_id', loteId).maybeSingle();
  if (!lote) return;

  // 2. Obtener todos los movimientos del lote
  const { data: allMovs } = await supabase.from('inventario_movimientos')
    .select('id, materia_prima_id, tipo, kg, motivo')
    .ilike('motivo', `%Lote ${loteId}%`);

  // 3. Filtrar solo momento2 (excluir movimientos de salmuera momento1)
  const salLower = (formulaSalmuera || '').toLowerCase();
  const momento2Movs = (allMovs || []).filter(m =>
    !salLower || !m.motivo.toLowerCase().includes(salLower)
  );

  // 4. Revertir movimientos de momento2 en inventario_mp
  for (const mov of momento2Movs) {
    const { data: inv } = await supabase.from('inventario_mp')
      .select('id, stock_kg').eq('materia_prima_id', mov.materia_prima_id).maybeSingle();
    if (inv) {
      const delta = mov.tipo === 'salida' ? mov.kg : -mov.kg;
      await supabase.from('inventario_mp')
        .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) + delta) })
        .eq('id', inv.id);
    }
  }

  // 5. Eliminar movimientos de momento2
  for (const mov of momento2Movs) {
    await supabase.from('inventario_movimientos').delete().eq('id', mov.id);
  }

  // 6. Resetear lote a activo con bloques_resultado de momento1
  const pasosM1 = (lote.bloques_resultado?.pasos || []).filter(p =>
    ['merma', 'inyeccion'].includes(p.tipo)
  );
  const { error } = await supabase.from('lotes_maduracion').update({
    estado: 'madurando',
    bloques_resultado: { momento1: true, pasos: pasosM1 },
  }).eq('id', lote.id);
  if (error) console.error('revertirMomento2 UPDATE error:', error);
}
