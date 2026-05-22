// Utilidad compartida para generar hoja Excel de productos de flujo dinámico
// Usada por: ModoBackup.js, VistaCorte.js
import * as XLSX from 'xlsx';

export function buildDynamicSheet(prod, config, mpList) {
  const n4 = v => (v !== '' && v !== undefined && v !== null) ? +parseFloat(v).toFixed(4) : '';
  const n2 = v => (v !== '' && v !== undefined && v !== null) ? +parseFloat(v).toFixed(2) : '';

  const R = (sec, det, kgEnt, kgSal, delta, pct, pkg, costo, nota) => ({
    'SECCIÓN':    sec   || '',
    'DETALLE':    det   || '',
    'KG ENTRADA': n4(kgEnt),
    'KG SALIDA':  n4(kgSal),
    'DELTA KG':   n4(delta),
    '%':          n2(pct),
    '$/KG':       n4(pkg),
    'COSTO $':    n4(costo),
    'NOTA':       nota  || '',
  });
  const E   = () => R('','','','','','','','','');
  const SEP = t  => R(`── ${t} ──`,'','','','','','','','');

  const esHijo = config.tipo === 'hijo';
  const bloques = (esHijo
    ? (config.bloques_hijo || config.bloques || [])
    : (config.bloques || [])
  ).filter(b => b.activo !== false);

  const kgIni = esHijo
    ? parseFloat(config.kg_para_hijo || config.kg_sal_base || 1)
    : parseFloat(config.kg_sal_base || 1);
  const mpCarne = (!esHijo && config.mp_carne_id)
    ? mpList.find(m => m.id === config.mp_carne_id) : null;
  const precioCarne = esHijo
    ? parseFloat(config.costo_mad_padre || 0)
    : parseFloat(mpCarne?.precio_kg || 0);

  const tipoLabel = config.tipo === 'padre' ? 'Corte Padre'
    : config.tipo === 'hijo' ? 'Corte Hijo' : '';

  const rows = [
    R('PRODUCTO', prod.nombre, '','','','','','',
      `Categoría: ${prod.categoria || ''}${tipoLabel ? ' — ' + tipoLabel : ''}`),
    E(),
  ];

  // ── Entrada ──
  if (esHijo) {
    rows.push(SEP('ENTRADA AL DESHUESE — desde corte Padre'));
    rows.push(R('Entrada al deshuese', 'Carne recibida del padre',
      kgIni, kgIni, 0, 0, precioCarne, kgIni * precioCarne,
      `Costo entrada: $${precioCarne.toFixed(4)}/kg`));
  } else {
    rows.push(SEP('CARNE INICIAL'));
    rows.push(R('Carne inicial', mpCarne?.nombre_producto || mpCarne?.nombre || 'Carne',
      kgIni, kgIni, 0, 0, precioCarne, kgIni * precioCarne, ''));
  }
  rows.push(E());

  // ── Configuración de cada bloque ──
  if (bloques.length > 0) {
    rows.push(SEP('BLOQUES DEL FLUJO'));
    for (const b of bloques) {
      if (b.tipo === 'inyeccion') {
        rows.push(R('💉 Inyección', 'Fórmula salmuera','','','','','','', b.formula_salmuera || '—'));
        rows.push(R('💉 Inyección', '% inyección','','','', b.pct_inj || 0,'','',''));
        if (b.pct_peso_inj != null)
          rows.push(R('💉 Inyección', '% retención','','','', b.pct_peso_inj,'','','% ganancia real sobre peso inicial'));
      } else if (b.tipo === 'maduracion') {
        const mm = b.minutos_mad > 0 ? ` ${b.minutos_mad}m` : '';
        rows.push(R('🧊 Maduración', `Tiempo: ${b.horas_mad || 0}h${mm}`,'','','', b.pct_mad || 0,'','',''));
        if (b.kg_salida_mad)
          rows.push(R('🧊 Maduración', 'kg salida maduración','', b.kg_salida_mad,'','','','',''));
      } else if (b.tipo === 'merma') {
        const tm = b.merma_tipo === 1 ? 'Tipo 1 — Desecho'
          : b.merma_tipo === 2 ? 'Tipo 2 — Subproducto c/crédito' : 'Tipo 3';
        rows.push(R(`✂️ ${b.nombre_merma || 'Merma'}`, tm,'','','', b.pct_merma || 0,'','',''));
        if (b.merma_tipo >= 2 && b.precio_merma_kg)
          rows.push(R(`✂️ ${b.nombre_merma || 'Merma'}`, 'Precio recuperable/kg','','','','', b.precio_merma_kg,'',''));
      } else if (b.tipo === 'horneado') {
        rows.push(R('🔥 Merma Horneado', '% merma horneado','','','', b.pct_merma_horneado || 0,'','',''));
      } else if (b.tipo === 'bifurcacion') {
        rows.push(R('🔀 Bifurcación', 'kg para Hijo','', b.kg_para_hijo || '','','','','',''));
        rows.push(R('🔀 Bifurcación', 'Margen Padre','','','', b.margen_padre || 15,'','','%'));
        rows.push(R('🔀 Bifurcación', 'Margen Hijo','','','', b.margen_hijo || 15,'','','%'));
      } else if (b.tipo === 'rub') {
        rows.push(R('🧂 Rub', 'Fórmula rub','','','','','','', b.formula_rub || '—'));
      } else if (b.tipo === 'adicional') {
        const mpAdic = b.mp_adicional_id ? mpList.find(m => m.id === b.mp_adicional_id) : null;
        rows.push(R('🍋 Adicional', mpAdic?.nombre_producto || '—',
          (b.gramos_adicional || 0) / 1000,'','','', parseFloat(mpAdic?.precio_kg || 0),'',
          `${b.gramos_adicional || 0} g`));
      }
    }
    rows.push(E());
  }

  // ── Flujo de costo paso a paso ──
  let pasos = config.pasos_flujo || [];
  if (pasos.length === 0 && bloques.length > 0)
    pasos = computePasos(bloques, kgIni, precioCarne);

  if (pasos.length > 0) {
    rows.push(SEP('FLUJO DE COSTO — PASO A PASO'));
    rows.push(R(
      esHijo ? 'Entrada al deshuese' : 'Carne inicial',
      esHijo ? 'Recibida del padre' : (mpCarne?.nombre_producto || 'Carne'),
      kgIni, kgIni, 0, 0, precioCarne, kgIni * precioCarne, ''));

    let prevKg = kgIni;
    for (const p of pasos) {
      const kg = parseFloat(p.kg || 0);
      const costoAcum = parseFloat(p.costoAcum || 0);
      const costoKg = kg > 0 ? costoAcum / kg : 0;
      const label = p.label || p.tipo;

      if (p.tipo === 'inyeccion') {
        const kgSal = parseFloat(p.kgSal || 0);
        rows.push(R(label, 'Después de inyección',
          prevKg, kg, kgSal, prevKg > 0 ? kgSal / prevKg * 100 : 0,
          costoKg, costoAcum,
          `+${kgSal.toFixed(3)} kg salmuera · +$${parseFloat(p.cSal || 0).toFixed(4)}`));
      } else if (p.tipo === 'maduracion') {
        const mermaKg = parseFloat(p.mermaKg || 0);
        const pctReal = parseFloat(p.pctReal || 0);
        rows.push(R(label, 'Salida maduración',
          prevKg, kg, -mermaKg, -pctReal, costoKg, costoAcum,
          `merma: ${pctReal.toFixed(1)}%`));
      } else if (p.tipo === 'merma') {
        const kgMerma = parseFloat(p.kgMerma || 0);
        const credito = parseFloat(p.credito || 0);
        const pctM = prevKg > 0 ? kgMerma / prevKg * 100 : 0;
        rows.push(R(label, `Merma Tipo ${p.merma_tipo || 1}`,
          prevKg, kg, -kgMerma, -pctM, costoKg, costoAcum,
          credito > 0 ? `crédito: -$${credito.toFixed(4)}` : ''));
      } else if (p.tipo === 'horneado') {
        const mermaKg = parseFloat(p.mermaKg || 0);
        const pctReal = parseFloat(p.pctReal || 0);
        rows.push(R(label, 'Merma horneado',
          prevKg, kg, -mermaKg, -pctReal, costoKg, costoAcum, ''));
      } else if (p.tipo === 'bifurcacion') {
        const kgPadre = parseFloat(p.kgPadre || 0);
        const kgHijo  = parseFloat(p.kgHijo  || 0);
        rows.push(R(label, 'Bifurcación Padre/Hijo',
          prevKg, kgPadre, -kgHijo, prevKg > 0 ? kgHijo / prevKg * 100 : 0,
          parseFloat(p.costoKg || 0), costoAcum,
          `Hijo: ${kgHijo.toFixed(3)} kg · Padre: ${kgPadre.toFixed(3)} kg`));
      } else if (p.tipo === 'rub') {
        rows.push(R(label, 'Rub/Especias',
          prevKg, kg, 0, 0, costoKg, costoAcum,
          `+$${parseFloat(p.cRub || 0).toFixed(4)}`));
      } else if (p.tipo === 'adicional') {
        rows.push(R(label, 'Ingrediente adicional',
          prevKg, kg, 0, 0, costoKg, costoAcum,
          `+$${parseFloat(p.cAdic || 0).toFixed(4)}`));
      } else {
        rows.push(R(label, '', prevKg, kg, kg - prevKg, 0, costoKg, costoAcum, ''));
      }
      prevKg = kg;
    }
    rows.push(E());
  }

  // ── Resumen final ──
  const kgFin = pasos.length > 0 ? parseFloat(pasos[pasos.length - 1].kg || 0) : kgIni;
  const lastCostoAcum = pasos.length > 0 ? parseFloat(pasos[pasos.length - 1].costoAcum || 0) : kgIni * precioCarne;
  const derivedCMadReal = kgFin > 0 ? lastCostoAcum / kgFin : 0;
  const cMadReal = parseFloat(config.c_mad_real || 0) || derivedCMadReal;
  const margen   = parseFloat(esHijo ? config.margen_hijo : config.margen_padre) || 15;
  const pvp      = margen > 0 && margen < 100 ? cMadReal / (1 - margen / 100) : 0;

  rows.push(SEP('RESUMEN FINAL'));
  rows.push(R('COSTO FINAL/KG', `${kgFin.toFixed(3)} kg finales`,'', kgFin,'','', cMadReal, kgFin * cMadReal,''));
  rows.push(R('Margen ganancia','','','','', margen,'','','%'));
  rows.push(R('PRECIO VENTA/KG','','','','','', pvp,'',''));

  const colWidths = [
    { wch: 26 }, { wch: 32 }, { wch: 11 }, { wch: 11 },
    { wch: 11 }, { wch: 8  }, { wch: 12 }, { wch: 12 }, { wch: 38 },
  ];
  return [rows, colWidths];
}

export function computePasos(bloques, kgIni, precioCarne) {
  let kg = kgIni;
  let costoAcum = precioCarne * kgIni;
  const pasos = [];
  let mermaGrupoBase = null;

  for (const b of bloques) {
    if (!b.activo) continue;
    if (b.tipo !== 'merma') mermaGrupoBase = null;

    if (b.tipo === 'inyeccion') {
      const pctInj = parseFloat(b.pct_inj || 0) / 100;
      const kgSal  = kg * pctInj;
      kg += kgSal;
      pasos.push({ tipo: 'inyeccion', label: '💉 Inyección', kg, costoAcum, kgSal, cSal: 0 });
    } else if (b.tipo === 'maduracion') {
      const kgSal = parseFloat(b.kg_salida_mad || 0);
      if (kgSal > 0) {
        const mermaKg = kg - kgSal;
        const pctReal = kg > 0 ? mermaKg / kg * 100 : 0;
        kg = kgSal;
        pasos.push({ tipo: 'maduracion', label: '🧊 Maduración', kg, costoAcum, mermaKg, pctReal });
      }
    } else if (b.tipo === 'merma') {
      if (mermaGrupoBase === null) mermaGrupoBase = kg;
      const pctM    = parseFloat(b.pct_merma || 0) / 100;
      const kgMerma = mermaGrupoBase * pctM;
      const credito = kgMerma * parseFloat(b.precio_merma_kg || 0);
      kg -= kgMerma;
      costoAcum -= credito;
      const lbl = b.nombre_merma ? `✂️ ${b.nombre_merma}` : '✂️ Merma';
      pasos.push({ tipo: 'merma', label: lbl, kg, costoAcum, kgMerma, credito, merma_tipo: b.merma_tipo || 1 });
    } else if (b.tipo === 'horneado') {
      const pctM    = parseFloat(b.pct_merma_horneado || 0) / 100;
      const mermaKg = kg * pctM;
      kg -= mermaKg;
      pasos.push({ tipo: 'horneado', label: '🔥 Merma Horneado', kg, costoAcum, mermaKg, pctReal: b.pct_merma_horneado || 0 });
    } else if (b.tipo === 'bifurcacion') {
      const kgHijo  = parseFloat(b.kg_para_hijo || 0);
      const kgPadre = Math.max(0, kg - kgHijo);
      const costoKg = kg > 0 ? costoAcum / kg : 0;
      pasos.push({ tipo: 'bifurcacion', label: '🔀 Bifurcación', kg, costoAcum,
        kgPadre, kgHijo, costoKg, costoPadre: kgPadre * costoKg });
      kg = kgPadre;
      costoAcum = kgPadre * costoKg;
    } else if (b.tipo === 'rub') {
      pasos.push({ tipo: 'rub', label: '🧂 Rub', kg, costoAcum, cRub: 0 });
    } else if (b.tipo === 'adicional') {
      pasos.push({ tipo: 'adicional', label: '🍋 Adicional', kg, costoAcum, cAdic: 0 });
    }
  }
  return pasos;
}

export function descargarExcelProducto(producto, config, mpList) {
  const [datos, colWidths] = buildDynamicSheet(producto, config, mpList);
  const ws = XLSX.utils.json_to_sheet(datos);
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  const sheetName = producto.nombre.replace(/[:\\\/\?\*\[\]]/g, '-').substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}-${hoy.getFullYear()}`;
  XLSX.writeFile(wb, `${producto.nombre} ${fecha}.xlsx`);
}
