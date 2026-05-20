import React, { useState } from 'react';
import { supabase } from '../supabase';
import { supabaseBackup } from '../supabaseBackup';
import * as XLSX from 'xlsx';
import { buildDynamicSheet, computePasos } from '../utils/excelDinamico';

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
  const [resumen, setResumen] = useState(null);
  const [verResumen, setVerResumen] = useState(false);

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
        { data: deshueseConfigs },
      ] = await Promise.all([
        supabase.from('productos').select('*').eq('eliminado', false).order('categoria,nombre'),
        supabase.from('formulaciones').select('*').order('orden'),
        supabase.from('config_productos').select('*'),
        supabase.from('materias_primas').select('*'),
        supabase.from('cif_items').select('*'),
        supabase.from('costos_mod_cif').select('*').single(),
        supabase.from('vista_horneado_config').select('*'),
        supabase.from('deshuese_config').select('*'),
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
        const isDynamic = vhRow?.config && (
          (Array.isArray(vhRow.config.bloques) && vhRow.config.bloques.length > 0) ||
          (Array.isArray(vhRow.config.bloques_hijo) && vhRow.config.bloques_hijo.length > 0) ||
          vhRow.config.tipo === 'hijo'
        );

        let datos, colWidths;
        if (isDynamic) {
          let cfgHijo = vhRow.config;
          if (vhRow.config?.tipo === 'hijo') {
            // Buscar el padre en deshuese_config para obtener el costo live de la bifurcación
            const dCfg = (deshueseConfigs || []).find(d =>
              (d.corte_hijo || '').toLowerCase().trim() === nombreLow
            );
            if (dCfg) {
              const padreLow = (dCfg.corte_padre || '').toLowerCase().trim();
              const padreVh  = (vhConfigs || []).find(v =>
                (v.producto_nombre || '').toLowerCase().trim() === padreLow
              );
              const bifPaso = (padreVh?.config?.pasos_flujo || []).find(p => p.tipo === 'bifurcacion');
              if (bifPaso) {
                cfgHijo = {
                  ...vhRow.config,
                  costo_mad_padre: parseFloat(bifPaso.costoKg || vhRow.config.costo_mad_padre || 0),
                  kg_para_hijo:    parseFloat(bifPaso.kgHijo  || vhRow.config.kg_para_hijo    || 1),
                };
              }
            }
          }
          [datos, colWidths] = buildDynamicSheet(prod, cfgHijo, mpList);
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

      const hoy = new Date();
      const dd = String(hoy.getDate()).padStart(2, '0');
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const yyyy = hoy.getFullYear();
      const fecha = `${dd}-${mm}-${yyyy}`;
      XLSX.writeFile(wb, `Respaldo Fórmulas ${fecha}.xlsx`);
      setProgreso({ actual: '', porcentaje: 100 });
      setEstado('exito');
      setMensaje(`✓ Excel descargado — ${prodList.length} productos`);
    } catch (e) {
      setEstado('error');
      setMensaje('Error: ' + e.message);
    }
  }

  async function cargarResumen() {
    setVerResumen(true);
    setResumen(null);
    const { data } = await supabaseBackup
      .from('backup_datos')
      .select('tabla, registros, updated_at')
      .order('tabla');
    setResumen(data || []);
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
          <button onClick={descargarExcel} disabled={cargando} style={btnStyle('#f39c12', 'rgba(243,156,18,0.5)', cargando)}>
            <div style={{ color: '#fbbf24', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
              📥 Descargar Excel
            </div>
            <div style={{ color: '#888', fontSize: '12px' }}>
              Todas las fórmulas — una hoja por producto
            </div>
          </button>

          <button onClick={hacerBackup} disabled={cargando} style={btnStyle('#27ae60', 'rgba(39,174,96,0.5)', cargando)}>
            <div style={{ color: '#4ade80', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
              💾 Hacer Backup
            </div>
            <div style={{ color: '#888', fontSize: '12px' }}>
              Copia todos los datos al proyecto de respaldo
            </div>
          </button>

          <button onClick={cargarResumen} disabled={cargando} style={btnStyle('#8e44ad', 'rgba(142,68,173,0.5)', cargando)}>
            <div style={{ color: '#c084fc', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
              📋 Ver contenido del Backup
            </div>
            <div style={{ color: '#888', fontSize: '12px' }}>
              Tablas guardadas, registros y fecha del último backup
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
        </div>

        {verResumen && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(142,68,173,0.4)',
            borderRadius: '12px', padding: '16px', marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ color: '#c084fc', fontWeight: 'bold', fontSize: '14px' }}>
                📦 Contenido del Backup
              </div>
              <button onClick={() => setVerResumen(false)} style={{
                background: 'none', border: 'none', color: '#888',
                cursor: 'pointer', fontSize: '16px', lineHeight: 1,
              }}>✕</button>
            </div>

            {resumen === null ? (
              <div style={{ textAlign: 'center', color: '#888', fontSize: '13px', padding: '12px' }}>
                ⏳ Cargando...
              </div>
            ) : resumen.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#f87171', fontSize: '13px', padding: '12px' }}>
                No hay backup guardado todavía
              </div>
            ) : (
              <>
                {/* Fecha del backup */}
                {resumen[0]?.updated_at && (
                  <div style={{ color: '#7fb3d3', fontSize: '11px', marginBottom: '10px', textAlign: 'center' }}>
                    Último backup: {new Date(resumen[0].updated_at).toLocaleString('es-EC', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                )}

                {/* Resumen destacado: productos y fórmulas */}
                {(() => {
                  const rProds = resumen.find(r => r.tabla === 'productos');
                  const rForms = resumen.find(r => r.tabla === 'formulaciones');
                  return (
                    <div style={{
                      display: 'flex', gap: '8px', marginBottom: '12px',
                    }}>
                      <div style={{
                        flex: 1, background: 'rgba(74,222,128,0.08)',
                        border: '1px solid rgba(74,222,128,0.3)',
                        borderRadius: '10px', padding: '10px', textAlign: 'center',
                      }}>
                        <div style={{ color: '#4ade80', fontSize: '22px', fontWeight: 'bold' }}>
                          {rProds?.registros ?? '—'}
                        </div>
                        <div style={{ color: '#888', fontSize: '11px' }}>Productos</div>
                      </div>
                      <div style={{
                        flex: 1, background: 'rgba(251,191,36,0.08)',
                        border: '1px solid rgba(251,191,36,0.3)',
                        borderRadius: '10px', padding: '10px', textAlign: 'center',
                      }}>
                        <div style={{ color: '#fbbf24', fontSize: '22px', fontWeight: 'bold' }}>
                          {rForms?.registros ?? '—'}
                        </div>
                        <div style={{ color: '#888', fontSize: '11px' }}>Fórmulas guardadas</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Lista de todas las tablas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {resumen.map(r => (
                    <div key={r.tabla} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '8px',
                    }}>
                      <span style={{ color: '#ccc', fontSize: '12px' }}>{r.tabla}</span>
                      <span style={{
                        color: r.registros > 0 ? '#4ade80' : '#888',
                        fontSize: '12px', fontWeight: 'bold',
                        background: r.registros > 0 ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
                        padding: '2px 8px', borderRadius: '6px',
                      }}>
                        {r.registros} reg.
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div style={{
                  marginTop: '10px', paddingTop: '10px',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', justifyContent: 'space-between',
                  color: '#7fb3d3', fontSize: '12px',
                }}>
                  <span>Total tablas</span>
                  <span style={{ fontWeight: 'bold' }}>{resumen.length} / {TABLAS_BACKUP.length}</span>
                </div>
              </>
            )}
          </div>
        )}

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
    const n = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    let mp = mpList.find(m => m.id === fila.materia_prima_id);
    if (!mp) {
      const nombre = n(fila.ingrediente_nombre);
      mp = mpList.find(m =>
        n(m.nombre_producto) === nombre || n(m.nombre) === nombre ||
        (n(m.nombre_producto) && nombre.includes(n(m.nombre_producto)) && n(m.nombre_producto).length > 4) ||
        (nombre.length > 4 && n(m.nombre).includes(nombre))
      );
    }
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
    const kgProducido = totalKg * (1 - merma);
    fundas.forEach((f, i) => {
      const kgFunda    = parseFloat(f.kg_por_funda)    || 1;
      const costoFunda = parseFloat(f.precio_funda)    || 0;
      const costoEtiq  = parseFloat(f.precio_etiqueta) || 0;
      const precioSug  = (1 - margen) > 0
        ? (costoTotalKg * kgFunda + costoFunda + costoEtiq) / (1 - margen) : 0;
      const nFundas    = kgFunda > 0 ? Math.ceil(kgProducido / kgFunda) : '—';
      const etiqNombre = f.nombre_etiqueta || '';
      rows.push(C(`FUNDA ${i + 1}`, f.nombre_funda || f.nombre || '—',
        '', kgFunda, '', '', precioSug,
        `N° fundas: ${nFundas}${etiqNombre ? ' — Etiqueta: ' + etiqNombre : ''}`));
      if (costoFunda > 0)
        rows.push(C(`FUNDA ${i + 1}`, 'Precio funda/unidad', '', '', '', costoFunda, '', ''));
      if (costoEtiq > 0)
        rows.push(C(`FUNDA ${i + 1}`, 'Precio etiqueta/unidad', '', '', '', costoEtiq, '', ''));
    });
  }

  const colWidths = [{ wch: 22 }, { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 25 }];
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
