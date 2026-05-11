// src/utils/prepararEdicionLote.js
import { supabase } from '../supabase';
import { revertirLote } from './revertirLote';

/**
 * Prepara la edición de un lote completado:
 * 1. Recopila todos los datos antes de revertir
 * 2. Revierte el lote (borra inventario, stock, movimientos)
 * 3. Re-crea produccion_inyeccion + cortes + lotes_maduracion
 * 4. Retorna params para abrir el wizard con valores pre-llenados
 *
 * @param {object} lote - fila de lotes_maduracion con produccion_inyeccion y lotes_maduracion_cortes
 * @param {array}  horneadoCfgs - array de vista_horneado_config
 * @returns {object} params para WizardProduccionDinamica
 */
export async function prepararEdicionLote(lote, horneadoCfgs, currentUser = null) {
  // ── 1. Recopilar datos ANTES de revertir ──────────────────
  // Cargar produccion + cortes frescos desde DB (no dependemos del join del historial)
  const { data: produccionFresh, error: errProd0 } = await supabase
    .from('produccion_inyeccion')
    .select('*, produccion_inyeccion_cortes(*)')
    .eq('id', lote.produccion_id)
    .maybeSingle();
  if (errProd0) throw new Error('Error cargando produccion: ' + errProd0.message);
  if (!produccionFresh) throw new Error('Produccion no encontrada para este lote');

  const produccion   = produccionFresh;
  const cortes       = produccionFresh.produccion_inyeccion_cortes || [];
  const primerCorte  = cortes[0];
  const pasosPrev    = lote.bloques_resultado?.pasos || [];
  const formulaSal   = (produccion?.formula_salmuera || '').toLowerCase();

  // Buscar config del producto en horneadoCfgs
  const cfgEntry = (horneadoCfgs || []).find(hc => {
    const topLevel = (hc.config?.formula_salmuera || '').toLowerCase();
    const inyBlock = (hc.config?.bloques || []).find(b => b.tipo === 'inyeccion');
    const inyF     = (inyBlock?.formula_salmuera || '').toLowerCase();
    return topLevel === formulaSal || inyF === formulaSal;
  });

  const kgInicial   = parseFloat(primerCorte?.kg_carne_cruda || lote.kg_inicial || 0);
  const precioCarne = primerCorte && parseFloat(primerCorte.kg_carne_cruda || 0) > 0
    ? parseFloat(primerCorte.costo_carne || 0) / parseFloat(primerCorte.kg_carne_cruda)
    : 0;

  // Buscar stock anterior (para kgMadPrevio y mpPadreId)
  const { data: stockEntries, error: errStock } = await supabase
    .from('stock_lotes_inyectados')
    .select('kg_inicial, tipo_corte, corte_nombre, materia_prima_id')
    .eq('lote_id', lote.lote_id);
  if (errStock) throw new Error('Error leyendo stock: ' + errStock.message);
  const stockPadre  = (stockEntries || []).find(s => s.tipo_corte === 'padre') || (stockEntries || [])[0];
  const kgMadPrevio = parseFloat(stockPadre?.kg_inicial || 0);

  // Separar pasos momento1 (antes de maduracion) y momento2 (después)
  const madIdx         = pasosPrev.findIndex(p => p.tipo === 'maduracion');
  const valoresPrevios = madIdx >= 0
    ? pasosPrev.slice(0, madIdx)
    : pasosPrev.filter(p => ['inyeccion','merma','rub','adicional'].includes(p.tipo));
  const valoresPreviosM2 = madIdx >= 0 ? pasosPrev.slice(madIdx + 1) : [];

  // Pasos hijo para CORTES (guardados en bloques_resultado.hijo o en pasos con tipo bifurcacion)
  const valoresPreviosHijo = lote.bloques_resultado?.hijo?.pasos || [];

  const esBano = ['INMERSION','MARINAD','AHUMAD'].some(k =>
    (cfgEntry?.config?._categoria || '').toUpperCase().includes(k)
  );

  // Sin transacción: si falla entre pasos 3-5, produccion_inyeccion queda huérfana.
  // El operario tendrá que limpiar manualmente o crear un nuevo lote.
  // ── 2. Revertir el lote (borra todo) — usar id entero evita problemas con slashes en lote_id
  await revertirLote(lote.lote_id, currentUser, lote.id);

  // ── 3. Re-crear produccion_inyeccion ──────────────────────
  const hoy = new Date().toISOString().split('T')[0];
  const { data: newProd, error: errProd } = await supabase
    .from('produccion_inyeccion')
    .insert({
      fecha:                hoy, // intencional: la edición registra fecha de hoy
      formula_salmuera:     produccion.formula_salmuera,
      producto_nombre:      produccion.producto_nombre,
      kg_carne_total:       produccion.kg_carne_total,
      kg_salmuera_requerida: produccion.kg_salmuera_requerida,
      porcentaje_inyeccion: produccion.porcentaje_inyeccion,
      estado:               'abierto',
    })
    .select('id')
    .single();
  if (errProd) throw new Error('Error re-creando produccion: ' + errProd.message);

  // ── 4. Re-crear produccion_inyeccion_cortes ───────────────
  for (const c of cortes) {
    const { error: errCorte } = await supabase.from('produccion_inyeccion_cortes').insert({
      produccion_id:           newProd.id,
      corte_nombre:            c.corte_nombre,
      materia_prima_id:        c.materia_prima_id,
      kg_carne_cruda:          c.kg_carne_cruda,
      kg_carne_limpia:         c.kg_carne_limpia,
      kg_salmuera_asignada:    c.kg_salmuera_asignada,
      costo_carne:             c.costo_carne,
      costo_salmuera_asignado: c.costo_salmuera_asignado,
    });
    if (errCorte) throw new Error('Error re-creando corte: ' + errCorte.message);
  }

  // ── 5. Re-crear lotes_maduracion (mismo lote_id) ─────────
  // bloques_resultado non-null evita que crash detection lo borre como "lote mal hecho"
  const { error: errLote } = await supabase.from('lotes_maduracion').insert({
    lote_id:           lote.lote_id,
    produccion_id:     newProd.id,
    fecha_entrada:     lote.fecha_entrada,
    fecha_salida:      lote.fecha_salida,
    estado:            'madurando',
    bloques_resultado: { editando: true, pasos: [] },
  });
  if (errLote) throw new Error('Error re-creando lote: ' + errLote.message);

  // ── 6. Retornar params para el wizard ─────────────────────
  return {
    savedLoteId:         lote.lote_id,
    kgInicial,
    precioCarne,
    bloques:             cfgEntry?.config?.bloques       || [],
    bloquesHijo:         cfgEntry?.config?.bloques_hijo  || [],
    cfg:                 cfgEntry?.config                || {},
    esBano,
    formulaSalmuera:     produccion.formula_salmuera     || '',
    corteNombrePadre:    primerCorte?.corte_nombre       || '',
    mpPadreId:           stockPadre?.materia_prima_id    || null,
    valoresPrevios,
    valoresPreviosM2,
    valoresPreviosHijo,
    kgMadPrevio,
  };
}
