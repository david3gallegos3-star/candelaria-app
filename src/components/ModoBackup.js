import React, { useState } from 'react';
import { supabase } from '../supabase';
import { supabaseBackup } from '../supabaseBackup';
import * as XLSX from 'xlsx';

const TABLAS_BACKUP = [
  'productos',
  'categorias_productos',
  'materias_primas',
  'formulaciones',
  'config_productos',
  'historial_general',
  'cif_items',
  'costos_mod_cif',
  'inventario_mp',
  'inventario_movimientos',
  'inventario_produccion',
  'mermas',
  'produccion_diaria',
  'cierres_produccion',
  'deshuese_config',
  'deshuese_registros',
  'despacho_cortes',
  'vista_horneado_config',
];

export default function ModoBackup({ onVolver }) {
  const [estado, setEstado] = useState('idle');
  const [progreso, setProgreso] = useState({ actual: '', porcentaje: 0 });
  const [mensaje, setMensaje] = useState('');

  async function hacerBackup() {
    if (!window.confirm(
      '💾 ¿Hacer Backup ahora?\n\nSe copiarán todos los datos de Fórmulas, Producción e Inventario al proyecto de respaldo.\n\nLos datos anteriores del respaldo serán reemplazados.'
    )) return;

    setEstado('cargando');
    setMensaje('');
    try {
      for (let i = 0; i < TABLAS_BACKUP.length; i++) {
        const tabla = TABLAS_BACKUP[i];
        setProgreso({ actual: tabla, porcentaje: Math.round((i / TABLAS_BACKUP.length) * 100) });

        const { data, error } = await supabase.from(tabla).select('*');
        if (error) throw new Error(`Error leyendo ${tabla}: ${error.message}`);

        const { error: errB } = await supabaseBackup.from('backup_datos').upsert({
          tabla,
          datos: data || [],
          registros: (data || []).length,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tabla' });
        if (errB) throw new Error(`Error guardando ${tabla}: ${errB.message}`);
      }
      setProgreso({ actual: '', porcentaje: 100 });
      setEstado('exito');
      setMensaje(`✓ Backup completado — ${TABLAS_BACKUP.length} tablas respaldadas`);
    } catch (e) {
      setEstado('error');
      setMensaje('Error: ' + e.message);
    }
  }

  async function restaurar() {
    if (!window.confirm(
      '⚠️ RESTAURAR desde Backup\n\nEsto REEMPLAZARÁ los datos actuales de Fórmulas, Producción e Inventario con los del último backup.\n\nEsta acción NO se puede deshacer.'
    )) return;
    if (!window.confirm('¿Confirmas? Se sobreescribirán todos los datos con el último backup guardado.')) return;

    setEstado('cargando');
    setMensaje('');
    try {
      setProgreso({ actual: 'Leyendo respaldo...', porcentaje: 5 });
      const { data: backups, error: errB } = await supabaseBackup.from('backup_datos').select('*');
      if (errB) throw new Error('Error leyendo respaldo: ' + errB.message);
      if (!backups || backups.length === 0) throw new Error('No hay backup disponible. Haz un backup primero.');

      for (let i = 0; i < TABLAS_BACKUP.length; i++) {
        const tabla = TABLAS_BACKUP[i];
        setProgreso({ actual: tabla, porcentaje: Math.round(5 + (i / TABLAS_BACKUP.length) * 95) });

        const fila = backups.find(b => b.tabla === tabla);
        if (!fila || !fila.datos || fila.datos.length === 0) continue;

        const { error: errU } = await supabase.from(tabla).upsert(fila.datos);
        if (errU) console.warn(`Advertencia restaurando ${tabla}: ${errU.message}`);
      }
      setProgreso({ actual: '', porcentaje: 100 });
      setEstado('exito');
      setMensaje('✓ Datos restaurados correctamente desde el último backup');
    } catch (e) {
      setEstado('error');
      setMensaje('Error: ' + e.message);
    }
  }

  async function descargarExcel() {
    setEstado('cargando');
    setMensaje('');
    try {
      setProgreso({ actual: 'Cargando datos...', porcentaje: 10 });

      const [
        { data: productos },
        { data: formulaciones },
        { data: configs },
        { data: mps },
        { data: cifItems },
        { data: cifCfg },
        { data: vhConfigs },
      ] = await Promise.all([
        supabase.from('productos').select('*').eq('eliminado', false).order('categoria,nombre'),
        supabase.from('formulaciones').select('*').order('orden'),
        supabase.from('config_productos').select('*'),
        supabase.from('materias_primas').select('*'),
        supabase.from('cif_items').select('*'),
        supabase.from('costos_mod_cif').select('*').single(),
        supabase.from('vista_horneado_config').select('*'),
      ]);

      const mpList = mps || [];
      const produccionKg = cifCfg?.produccion_kg || 13600;
      const agua = (cifItems || []).find(c => c.detalle?.toLowerCase().includes('agua'));
      const precioAgua = agua ? (parseFloat(agua.valor_mes) || 0) / produccionKg : 0;

      function getPrecioKg(fila) {
        const mp = mpList.find(m => m.id === fila.materia_prima_id);
        if (mp) {
          if (mp.categoria?.toUpperCase().includes('AGUA')) return precioAgua;
          return parseFloat(mp.precio_kg) || 0;
        }
        return 0;
      }

      const wb = XLSX.utils.book_new();
      setProgreso({ actual: 'Generando hojas...', porcentaje: 35 });

      const prodList = productos || [];
      for (let pi = 0; pi < prodList.length; pi++) {
        const prod = prodList[pi];
        setProgreso({
          actual: prod.nombre,
          porcentaje: Math.round(35 + (pi / prodList.length) * 60),
        });

        const nombreLow = (prod.nombre || '').toLowerCase().trim();
        const vhRow = (vhConfigs || []).find(v =>
          (v.producto_nombre || '').toLowerCase().trim() === nombreLow
        );
        const isDynamic = vhRow?.config && Array.isArray(vhRow.config.bloques) && vhRow.config.bloques.length > 0;

        let datos, colWidths;
        if (isDynamic) {
          [datos, colWidths] = buildDynamicSheet(prod, vhRow.config, mpList);
        } else {
          const ings = (formulaciones || []).filter(
            f => f.producto_id === prod.id || f.producto_nombre === prod.nombre
          );
          const cfg = (configs || []).find(
            c => c.producto_id === prod.id || c.producto_nombre === prod.nombre
          ) || {};
          [datos, colWidths] = buildStandardSheet(prod, ings, cfg, mpList, precioAgua);
        }

        const ws = XLSX.utils.json_to_sheet(datos);
        ws['!cols'] = colWidths;
        const sheetName = prod.nombre.replace(/[:\\\/\?\*\[\]]/g, '-').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      const fecha = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Formulas_Candelaria_${fecha}.xlsx`);
      setProgreso({ actual: '', porcentaje: 100 });
      setEstado('exito');
      setMensaje(`✓ Excel descargado — ${prodList.length} productos`);
    } catch (e) {
      setEstado('error');
      setMensaje('Error: ' + e.message);
    }
  }

  const cargando = estado === 'cargando';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0d1b2a,#1a2a3a)',
      fontFamily: 'Arial,sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔐</div>
          <div style={{ color: 'white', fontSize: '22px', fontWeight: 'bold', marginBottom: '6px' }}>
            Modo Backup
          </div>
          <div style={{ color: '#7fb3d3', fontSize: '13px' }}>
            Solo administradores — Fórmulas, Producción e Inventario
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
          <button onClick={hacerBackup} disabled={cargando} style={btnStyle('#27ae60', 'rgba(39,174,96,0.5)', cargando)}>
            <div style={{ color: '#4ade80', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
              💾 Hacer Backup
            </div>
            <div style={{ color: '#888', fontSize: '12px' }}>
              Copia todos los datos al proyecto de respaldo
            </div>
          </button>

          <button onClick={restaurar} disabled={cargando} style={btnStyle('#2980b9', 'rgba(41,128,185,0.5)', cargando)}>
            <div style={{ color: '#60a5fa', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
              🔄 Restaurar desde Backup
            </div>
            <div style={{ color: '#888', fontSize: '12px' }}>
              Reemplaza datos actuales con el último backup
            </div>
          </button>

          <button onClick={descargarExcel} disabled={cargando} style={btnStyle('#f39c12', 'rgba(243,156,18,0.5)', cargando)}>
            <div style={{ color: '#fbbf24', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
              📥 Descargar Excel
            </div>
            <div style={{ color: '#888', fontSize: '12px' }}>
              Todas las fórmulas — una hoja por producto
            </div>
          </button>
        </div>

        {cargando && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#7fb3d3', fontSize: '12px', marginBottom: '6px', textAlign: 'center' }}>
              ⏳ {progreso.actual}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '6px' }}>
              <div style={{
                background: '#4ade80', height: '6px', borderRadius: '8px',
                width: `${progreso.porcentaje}%`, transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {mensaje && (
          <div style={{
            textAlign: 'center', marginBottom: '16px', fontSize: '13px',
            color: mensaje.startsWith('✓') ? '#4ade80' : '#f87171',
          }}>
            {mensaje}
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <button onClick={onVolver} disabled={cargando} style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', borderRadius: '10px',
            padding: '10px 28px', cursor: cargando ? 'default' : 'pointer',
            fontSize: '13px', fontWeight: 'bold',
          }}>
            ← Volver al menú
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Hoja estándar (embutidos, salchichas, etc.) ───────────────────────────────
function buildStandardSheet(prod, ings, cfg, mpList, precioAgua) {
  const ingMP = ings.filter(f => f.seccion === 'MP');
  const ingAD = ings.filter(f => f.seccion === 'AD');

  function getPrecio(fila) {
    const mp = mpList.find(m => m.id === fila.materia_prima_id);
    if (mp) {
      if (mp.categoria?.toUpperCase().includes('AGUA')) return precioAgua;
      return parseFloat(mp.precio_kg) || 0;
    }
    return 0;
  }

  const totalCrudoG = ings.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0);
  const totalKg = totalCrudoG / 1000;
  const merma = parseFloat(cfg.merma) || 0.07;
  const margen = parseFloat(cfg.margen) || 0.15;
  const modCif = parseFloat(cfg.mod_cif_kg) || 0;
  const empPrecio = parseFloat(cfg.empaque_precio_kg) || 0;
  const empCantidad = parseFloat(cfg.empaque_cantidad) || 0;
  const costoEmpKg = totalKg > 0 ? (empPrecio * empCantidad) / totalKg : 0;
  const hiloPrecio = parseFloat(cfg.hilo_precio_kg) || 0;
  const hiloKg = parseFloat(cfg.hilo_kg) || 0;
  const costoHiloKg = totalKg > 0 ? (hiloPrecio * hiloKg) / totalKg : 0;
  const totalCostoMP = ings.reduce((s, f) => s + (parseFloat(f.gramos) / 1000) * getPrecio(f), 0);
  const costoMPkg = totalKg > 0 ? totalCostoMP / totalKg : 0;
  const costoConMerma = (1 - merma) > 0 ? costoMPkg / (1 - merma) : 0;
  const costoTotalKg = costoConMerma + modCif + costoEmpKg + costoHiloKg;
  const precioVentaKg = margen < 1 ? costoTotalKg / (1 - margen) : 0;

  const totMP = {
    gramos: ingMP.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0),
    costo: ingMP.reduce((s, f) => s + (parseFloat(f.gramos) / 1000) * getPrecio(f), 0),
  };
  const totAD = {
    gramos: ingAD.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0),
    costo: ingAD.reduce((s, f) => s + (parseFloat(f.gramos) / 1000) * getPrecio(f), 0),
  };

  const C = (sec, det, g, k, pct, pkg, costo, nota) => ({
    'SECCIÓN': sec, 'DETALLE': det,
    'GRAMOS': g !== '' ? Math.round(g) : '',
    'KILOS': k !== '' ? parseFloat(parseFloat(k).toFixed(3)) : '',
    '% TOTAL': pct !== '' ? parseFloat(parseFloat(pct).toFixed(2)) : '',
    '$/KG': pkg !== '' ? parseFloat(parseFloat(pkg).toFixed(4)) : '',
    'COSTO $': costo !== '' ? parseFloat(parseFloat(costo).toFixed(4)) : '',
    'NOTA': nota || '',
  });
  const E = () => C('', '', '', '', '', '', '', '');
  const SEP = (t) => C(`── ${t} ──`, '', '', '', '', '', '', '');

  const mapIng = (ing, sec) => {
    const g = parseFloat(ing.gramos) || 0;
    const p = getPrecio(ing);
    const spec = ing.especificacion?.trim();
    return C(sec, ing.ingrediente_nombre + (spec ? ` (${spec})` : ''), g, g / 1000,
      totalCrudoG > 0 ? (g / totalCrudoG) * 100 : 0, p, (g / 1000) * p, ing.nota_cambio || '');
  };

  const rows = [
    C('PRODUCTO', prod.nombre, '', '', '', '', '', `Categoría: ${prod.categoria || ''}`),
    C('', `Fecha fórmula: ${cfg.fecha || '—'}`, '', '', '', '', '', ''),
    E(),
    SEP('MATERIAS PRIMAS'),
    ...ingMP.filter(i => i.ingrediente_nombre).map(i => mapIng(i, 'MATERIAS PRIMAS')),
    C('', 'SUB-TOTAL MATERIAS PRIMAS', totMP.gramos, totMP.gramos / 1000,
      totalCrudoG > 0 ? (totMP.gramos / totalCrudoG) * 100 : 0, '', totMP.costo, ''),
    E(),
    SEP('CONDIMENTOS Y ADITIVOS'),
    ...ingAD.filter(i => i.ingrediente_nombre).map(i => mapIng(i, 'CONDIMENTOS Y ADITIVOS')),
    C('', 'SUB-TOTAL CONDIMENTOS', totAD.gramos, totAD.gramos / 1000,
      totalCrudoG > 0 ? (totAD.gramos / totalCrudoG) * 100 : 0, '', totAD.costo, ''),
    E(),
    C('TOTAL CRUDO', '', totalCrudoG, totalKg, 100, '', totalCostoMP, ''),
    E(),
    SEP('COSTOS Y AJUSTES'),
    C('COSTOS', 'Merma %',            '', '', (merma * 100).toFixed(1) + '%', '', '', ''),
    C('COSTOS', 'Margen ganancia %',  '', '', (margen * 100).toFixed(1) + '%', '', '', ''),
    C('COSTOS', 'MOD+CIF $/kg',       '', '', '', modCif, '', ''),
    C('COSTOS', 'Costo MP/kg',        '', '', '', costoMPkg, '', ''),
    C('COSTOS', 'Con merma',          '', '', '', costoConMerma, '', ''),
    C('COSTOS', 'Empaques/kg',        '', '', '', costoEmpKg, '', ''),
    C('COSTOS', 'Amarre/kg',          '', '', '', costoHiloKg, '', ''),
    C('COSTOS', 'COSTO TOTAL/KG',     '', '', '', costoTotalKg, '', ''),
    C('COSTOS', 'PRECIO VENTA/KG',    '', '', '', precioVentaKg, '', ''),
    E(),
    SEP('EMPAQUE Y AMARRE'),
    C('EMPAQUE', 'Tripa/Empaque',     '', '', '', '', '', cfg.empaque_nombre || '—'),
    C('EMPAQUE', 'Cantidad',          '', parseFloat(empCantidad) || '', '', '', '', cfg.empaque_unidad || ''),
    C('EMPAQUE', 'Precio/kg',         '', '', '', empPrecio || '', '', ''),
    C('EMPAQUE', 'Costo empaques/kg', '', '', '', costoEmpKg, '', ''),
    C('AMARRE',  'Amarre/Hilo',       '', '', '', '', '', cfg.hilo_nombre || '—'),
    C('AMARRE',  'Kg hilo',           '', parseFloat(hiloKg) || '', '', '', '', ''),
    C('AMARRE',  'Costo amarre/kg',   '', '', '', costoHiloKg, '', ''),
  ];

  const fundas = Array.isArray(cfg.fundas) ? cfg.fundas : [];
  if (fundas.length > 0) {
    rows.push(E());
    rows.push(SEP('EMPAQUES DE DISTRIBUCIÓN'));
    fundas.forEach((f, i) => {
      const kgF = parseFloat(f.kg_funda || f.kg || 1);
      const precioSug = (1 - margen) > 0 ? (costoTotalKg * kgF) / (1 - margen) : 0;
      rows.push(C(`FUNDA ${i + 1}`, f.nombre || f.nombre_funda || '—', '', kgF, '', precioSug, '', f.etiqueta || ''));
    });
  }

  const colWidths = [{ wch: 22 }, { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 25 }];
  return [rows, colWidths];
}

// ── Hoja flujo dinámico (Cortes, Inmersión, Marinados, Ahumados-Horneados) ────
function buildDynamicSheet(prod, config, mpList) {
  const D = (sec, det, kg, pkgDet, costoTotal, info) => ({
    'SECCIÓN': sec || '',
    'DETALLE': det || '',
    'KG': kg !== undefined && kg !== '' ? parseFloat(parseFloat(kg).toFixed(4)) : '',
    '$/KG — DETALLE': pkgDet || '',
    'COSTO TOTAL $': costoTotal !== undefined && costoTotal !== '' ? parseFloat(parseFloat(costoTotal).toFixed(4)) : '',
    'INFO': info || '',
  });
  const E = () => D('', '', '', '', '', '');
  const SEP = (t) => D(`── ${t} ──`, '', '', '', '', '');

  const tipoLabel = config.tipo === 'padre' ? 'Corte Padre' : config.tipo === 'hijo' ? 'Corte Hijo' : '';
  const rows = [
    D('PRODUCTO', prod.nombre, '', '', '', `Categoría: ${prod.categoria || ''}${tipoLabel ? ' — ' + tipoLabel : ''}`),
    E(),
  ];

  // ── Carne inicial / Entrada al deshuese ──
  const esHijo = config.tipo === 'hijo';
  const mpCarne = config.mp_carne_id ? mpList.find(m => m.id === config.mp_carne_id) : null;
  const precioCarne = esHijo
    ? parseFloat(config.costo_mad_padre || 0)
    : parseFloat(mpCarne?.precio_kg || 0);
  const kgIni = parseFloat(config.kg_sal_base || 1);

  if (esHijo) {
    rows.push(SEP('ENTRADA AL DESHUESE — desde corte Padre'));
    rows.push(D('Entrada al deshuese', 'Carne recibida del corte padre',
      kgIni, `$${precioCarne.toFixed(4)}/kg`, kgIni * precioCarne,
      `Costo entrada: $${precioCarne.toFixed(4)}/kg`));
  } else {
    rows.push(SEP('CARNE INICIAL'));
    rows.push(D('Carne inicial',
      mpCarne?.nombre_producto || mpCarne?.nombre || 'Carne',
      kgIni, `$${precioCarne.toFixed(4)}/kg`,
      kgIni * precioCarne, ''));
  }
  rows.push(E());

  // ── Bloques del flujo dinámico ──
  const bloques = (config.bloques || []).filter(b => b.activo !== false);
  if (bloques.length > 0) {
    rows.push(SEP('FLUJO DINÁMICO — BLOQUES'));
    for (const b of bloques) {
      if (b.tipo === 'inyeccion') {
        rows.push(D('💉 Inyección de Salmuera', 'Fórmula salmuera', '', b.formula_salmuera || '—', '', ''));
        rows.push(D('💉 Inyección de Salmuera', '% Inyección', '', `${b.pct_inj || 0}%`, '', ''));
        if (b.pct_agrega_peso) rows.push(D('💉 Inyección de Salmuera', '% que agrega peso', '', `${b.pct_agrega_peso}%`, '', '% de la salmuera que entra a la carne'));
      } else if (b.tipo === 'maduracion') {
        rows.push(D('🧊 Maduración', 'Tiempo', '', `${b.horas_mad || 0}h ${b.minutos_mad > 0 ? b.minutos_mad + 'm' : ''}`.trim(), '', ''));
        if (b.kg_salida_mad) rows.push(D('🧊 Maduración', 'kg salida maduración', b.kg_salida_mad, '', '', ''));
        if (b.pct_mad) rows.push(D('🧊 Maduración', 'Merma %', '', `${b.pct_mad}%`, '', ''));
      } else if (b.tipo === 'merma') {
        const tipoLabel = b.merma_tipo === 1 ? 'Tipo 1 — Desecho' : b.merma_tipo === 2 ? 'Tipo 2 — Subproducto con crédito' : 'Tipo 3';
        rows.push(D(`✂️ Merma — ${b.nombre_merma || 'Merma'}`, 'Tipo de merma', '', tipoLabel, '', ''));
        rows.push(D(`✂️ Merma — ${b.nombre_merma || 'Merma'}`, '% merma', '', `${b.pct_merma || 0}%`, '', ''));
        if (b.merma_tipo >= 2 && b.precio_merma_kg) {
          rows.push(D(`✂️ Merma — ${b.nombre_merma || 'Merma'}`, 'Precio recuperable', '', `$${parseFloat(b.precio_merma_kg).toFixed(4)}/kg`, '', ''));
        }
      } else if (b.tipo === 'horneado') {
        rows.push(D('🔥 Merma Horneado', '% merma horneado', '', `${b.pct_merma_horneado || 0}%`, '', ''));
      } else if (b.tipo === 'bifurcacion') {
        rows.push(D('🔀 Bifurcación Padre/Hijo', 'kg para Hijo', config.kg_para_hijo || '', '', '', ''));
      } else if (b.tipo === 'rub') {
        rows.push(D('🧂 Rub/Especias', 'Fórmula rub', b.kg_rub_base || '', b.formula_rub || '—', '', ''));
      } else if (b.tipo === 'adicional') {
        const mpAdic = b.mp_adicional_id ? mpList.find(m => m.id === b.mp_adicional_id) : null;
        rows.push(D('🍋 Ingrediente adicional', mpAdic?.nombre_producto || '—', (b.gramos_adicional || 0) / 1000, '', '', `${b.gramos_adicional || 0} g`));
      }
    }
    rows.push(E());
  }

  // ── Flujo de costo paso a paso ──
  const pasos = config.pasos_flujo || [];
  if (pasos.length > 0) {
    rows.push(SEP('FLUJO DE COSTO — PASO A PASO'));
    rows.push(D('Carne inicial',
      mpCarne?.nombre_producto || 'Carne',
      kgIni, `$${precioCarne.toFixed(4)}/kg`,
      kgIni * precioCarne, ''));

    for (const p of pasos) {
      const kg = parseFloat(p.kg || 0);
      const costoAcum = parseFloat(p.costoAcum || 0);
      const costoKg = kg > 0 ? costoAcum / kg : 0;
      let info = '';
      if (p.tipo === 'inyeccion')   info = `+${parseFloat(p.kgSal || 0).toFixed(3)} kg salmuera · +$${parseFloat(p.cSal || 0).toFixed(4)}`;
      else if (p.tipo === 'maduracion') info = `-${parseFloat(p.mermaKg || 0).toFixed(3)} kg merma (${parseFloat(p.pctReal || 0).toFixed(1)}%)`;
      else if (p.tipo === 'merma')  info = `-${parseFloat(p.kgMerma || 0).toFixed(3)} kg · crédito $${parseFloat(p.credito || 0).toFixed(4)}`;
      else if (p.tipo === 'bifurcacion') info = `Padre ${parseFloat(p.kgPadre || 0).toFixed(3)} kg / Hijo ${parseFloat(p.kgHijo || 0).toFixed(3)} kg`;
      else if (p.tipo === 'horneado') info = `-${parseFloat(p.mermaKg || 0).toFixed(3)} kg merma (${parseFloat(p.pctReal || 0).toFixed(1)}%)`;
      else if (p.tipo === 'rub')    info = `+$${parseFloat(p.cRub || 0).toFixed(4)} costo rub`;
      else if (p.tipo === 'adicional') info = `+$${parseFloat(p.cAdic || 0).toFixed(4)} costo adicional`;

      rows.push(D(p.label || p.tipo, info, kg, `$${costoKg.toFixed(4)}/kg`, costoAcum, ''));
    }
    rows.push(E());
  }

  // ── Resumen final ──
  const cMadReal = parseFloat(config.c_mad_real || 0);
  const margen = parseFloat(esHijo ? config.margen_hijo : config.margen_padre) || 15;
  const precioVenta = margen > 0 && margen < 100 ? cMadReal / (1 - margen / 100) : 0;
  const kgFinales = pasos.length > 0 ? parseFloat(pasos[pasos.length - 1].kg || 0) : kgIni;

  rows.push(SEP('RESUMEN FINAL'));
  rows.push(D('COSTO FINAL/KG', `${kgFinales.toFixed(3)} kg finales`, kgFinales, `$${cMadReal.toFixed(4)}/kg`, kgFinales * cMadReal, ''));
  rows.push(D('Margen ganancia', '', '', `${margen}%`, '', ''));
  rows.push(D('PRECIO VENTA/KG', '', '', `$${precioVenta.toFixed(4)}/kg`, '', ''));

  const colWidths = [{ wch: 30 }, { wch: 35 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 40 }];
  return [rows, colWidths];
}

function btnStyle(color, border, disabled) {
  return {
    background: `rgba(${hexToRgb(color)},0.12)`,
    border: `1.5px solid ${border}`,
    borderRadius: '14px', padding: '20px 24px',
    cursor: disabled ? 'default' : 'pointer',
    textAlign: 'left', opacity: disabled ? 0.6 : 1,
    transition: 'all 0.2s',
  };
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
