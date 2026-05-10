// ============================================
// TabMaduracion.js
// Stock en maduración + pesaje final
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { crearNotificacion } from '../../utils/helpers';
import WizardProduccionDinamica from './WizardProduccionDinamica';
import { useRealtime } from '../../hooks/useRealtime';

function isHornCat(hc) {
  const cat = (hc.config?._categoria || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
  return cat.includes('AHUMADOS') || cat.includes('HORNEADOS') || cat.includes('MARINAD') || cat.includes('INMERSION');
}

function diasParaSalida(fechaSalida) {
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const sal  = new Date(fechaSalida + 'T00:00:00');
  return Math.round((sal - hoy) / 86400000);
}

function esInmersionLote(lote, cfgs) {
  const formulaSal = (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
  if (!formulaSal) return false;
  const cfg = cfgs.find(hc => (hc.config?.formula_salmuera || '').toLowerCase() === formulaSal);
  return (cfg?.config?._categoria || '').replace(/[ÓÒ]/g, 'O').toUpperCase().includes('INMERSION');
}

function tieneMaduracionActiva(lote, cfgs) {
  const formulaSal = (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
  if (!formulaSal) return false;
  const cfg = cfgs.find(hc => (hc.config?.formula_salmuera || '').toLowerCase() === formulaSal);
  const bloques = cfg?.config?.bloques || [];
  return bloques.some(b => b.tipo === 'maduracion' && b.activo !== false);
}

function esCortesPadreLote(lote, cfgs) {
  const formulaSal = (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
  if (!formulaSal) return false;
  const cfg = cfgs.find(hc =>
    formulaSal === (hc.config?.formula_salmuera || '').toLowerCase()
  ) || cfgs.find(hc =>
    formulaSal && (hc.config?.formula_salmuera || '') &&
    formulaSal.includes((hc.config?.formula_salmuera || '').toLowerCase())
  );
  const cat = (cfg?.config?._categoria || '').replace(/[ÓÒ]/g, 'O').toUpperCase();
  return cat.includes('CORTES') && cfg?.config?.tipo === 'padre';
}

export default function TabMaduracion({ mobile, currentUser }) {
  const [lotes,          setLotes]          = useState([]);
  const [historial,      setHistorial]      = useState([]);
  const [cargando,       setCargando]       = useState(true);
  const [vistaHist,      setVistaHist]      = useState(false);
  const [expandidos,     setExpandidos]     = useState({});    // {loteId: bool}
  const [modalPesaje,    setModalPesaje]    = useState(null);
  const [pesajes,        setPesajes]        = useState({});
  const [guardando,      setGuardando]      = useState(false);
  const [error,          setError]          = useState('');
  const [exito,          setExito]          = useState('');

  const [horneadoCfgs,   setHorneadoCfgs]   = useState([]); // configs de vista_horneado_config

  // ── Modal Sub-productos post-pesaje ──
  const [wizardRetomar,  setWizardRetomar]  = useState(null); // params para re-lanzar wizard
  const [modalSpPost,    setModalSpPost]    = useState(null); // {subproductos, loteId, totalKgMad, pendingFlow, deshueseData}
  const [spPostKgs,      setSpPostKgs]      = useState({});   // {fase: kg}
  const [guardSpPost,    setGuardSpPost]    = useState(false);
  const [spPostMps,      setSpPostMps]      = useState({});   // mp_id → {nombre, precio_kg}
  const [spRealesData,   setSpRealesData]   = useState({});
  const [spWizardKgs,   setSpWizardKgs]   = useState({});

  // ── Modal Deshuese (dinámico desde deshuese_config) ──
  const [modalDeshuese,  setModalDeshuese]  = useState(null);
  const [dshData,        setDshData]        = useState({});
  const [guardDeshuese,  setGuardDeshuese]  = useState(false);
  const [errorDeshuese,  setErrorDeshuese]  = useState('');
  const [mpDeshuese,     setMpDeshuese]     = useState({ resS: null, puntas: null });
  const [deshueseMap,    setDeshueseMap]    = useState({}); // { corte_padre: corte_hijo }

  // ── Wizard separación CORTES Padre/Hijo ──
  const [modalCortesWizard, setModalCortesWizard] = useState(null);
  // { loteId, lotesMadId, kgMad, costoTotal, corteNombrePadre, corteNombreHijo, mpPadreId, formulaSalmuera }
  const [cortesWizardPaso,  setCortesWizardPaso]  = useState(1);
  const [cortesKgPadre,     setCortesKgPadre]     = useState('');
  const [cortesSpItems,     setCortesSpItems]      = useState([]);
  const [guardandoCortes,   setGuardandoCortes]   = useState(false);
  const [errorCortes,       setErrorCortes]       = useState('');
  const [mpsParaCortes,     setMpsParaCortes]     = useState([]);
  const [hijoCfgDeshuese,   setHijoCfgDeshuese]   = useState(null);

  // ── Wizard dinámico CORTES ──
  const [wizardDinamico, setWizardDinamico] = useState(null);

  function setDsh(corte, field, val) {
    setDshData(prev => ({ ...prev, [corte]: { ...prev[corte], [field]: val } }));
  }

  // ── Modal editar cortes ──
  const [modalEditar,    setModalEditar]    = useState(null);  // lote
  const [editKgs,        setEditKgs]        = useState({});    // {idx: kg}
  const [guardandoEdit,  setGuardandoEdit]  = useState(false);
  const [errorEdit,      setErrorEdit]      = useState('');

  function esCatBano(cat) {
    const c = (cat || '').replace(/[ÓÒÔ]/g,'O').toUpperCase();
    return c.includes('INMERSION') || c.includes('MARINAD') || c.includes('AHUMAD');
  }

  function abrirWizardMomento1(corteNombre, kgIni) {
    const cfg = horneadoCfgs.find(hc => {
      const cat = (hc.config?._categoria || '').replace(/[ÓÒ]/g,'O').toUpperCase();
      const esValido = cat.includes('CORTES') || cat.includes('INMERSION') || cat.includes('MARINAD');
      return esValido && hc.producto_nombre?.toLowerCase() === corteNombre.toLowerCase();
    });
    if (!cfg?.config?.bloques) return false;
    setWizardDinamico({
      modo:        'momento1',
      bloques:     cfg.config.bloques,
      bloquesHijo: cfg.config.bloques_hijo || [],
      cfg:         cfg.config,
      lote:        null,
      kgInicial:   kgIni,
      precioCarne: 0,
      esBano:      esCatBano(cfg.config?._categoria),
    });
    return true;
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: activos }, { data: completados }] = await Promise.all([
      supabase.from('lotes_maduracion')
        .select(`*, lotes_maduracion_cortes(*),
          produccion_inyeccion ( formula_salmuera, porcentaje_inyeccion, kg_carne_total, kg_salmuera_requerida,
            produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_carne_limpia, kg_salmuera_asignada, costo_carne, costo_salmuera_asignado, costo_final_kg )
          )`)
        .neq('estado', 'completado')
        .order('fecha_entrada', { ascending: true }),
      supabase.from('lotes_maduracion')
        .select(`*, lotes_maduracion_cortes(*),
          produccion_inyeccion ( formula_salmuera, porcentaje_inyeccion, kg_carne_total, kg_salmuera_requerida,
            produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_carne_limpia, kg_salmuera_asignada, costo_carne, costo_salmuera_asignado, costo_final_kg )
          )`)
        .eq('estado', 'completado')
        .order('fecha_entrada', { ascending: false })
        .limit(30),
    ]);
    setLotes(activos   || []);
    setHistorial(completados || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['lotes_maduracion', 'stock_lotes_inyectados', 'produccion_inyeccion', 'vista_horneado_config', 'deshuese_config', 'materias_primas', 'inventario_mp', 'inventario_movimientos'], cargar);

  useEffect(() => {
    // Precios subproductos deshuese
    supabase.from('materias_primas')
      .select('id, nombre, precio_kg')
      .in('id', ['C031', 'RET002'])
      .then(({ data }) => {
        setMpDeshuese({
          resS:   (data || []).find(m => m.id === 'C031')   || null,
          puntas: (data || []).find(m => m.id === 'RET002') || null,
        });
      });
    // Configs de productos horneados (para wizard)
    supabase.from('vista_horneado_config').select('producto_nombre,config')
      .then(({ data }) => setHorneadoCfgs(data || []));
    // Mapa deshuese dinámico desde DB
    supabase.from('deshuese_config')
      .select('corte_padre, corte_hijo')
      .eq('activo', true)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.corte_padre] = r.corte_hijo; });
        setDeshueseMap(map);
      });
  }, []);

  function toggleExpandido(id) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function forzarListo(lote) {
    const d = new Date();
    const fechaLocal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    await supabase.from('lotes_maduracion')
      .update({ fecha_salida: fechaLocal })
      .eq('id', lote.id);
    await cargar();
  }

  function abrirEditar(lote) {
    const picortes = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    const init = {};
    picortes.forEach((p, i) => { init[i] = String(p.kg_carne_cruda || ''); });
    setEditKgs(init);
    setErrorEdit('');
    setModalEditar(lote);
  }

  async function guardarEdicion() {
    const picortes = modalEditar.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    for (let i = 0; i < picortes.length; i++) {
      if (!editKgs[i] || parseFloat(editKgs[i]) <= 0) {
        setErrorEdit(`Ingresa kg válidos para "${picortes[i].corte_nombre}"`);
        return;
      }
    }
    setGuardandoEdit(true);
    setErrorEdit('');
    try {
      const totalCarne = picortes.reduce((s, _, i) => s + parseFloat(editKgs[i] || 0), 0);
      const kgSalTotal = parseFloat(modalEditar.produccion_inyeccion?.kg_salmuera_requerida || 0);
      // Recalcular salmuera proporcional y actualizar cada corte
      for (let i = 0; i < picortes.length; i++) {
        const p        = picortes[i];
        const kgCarne  = parseFloat(editKgs[i]);
        const kgSal    = totalCarne > 0 ? kgSalTotal * (kgCarne / totalCarne) : 0;
        await supabase.from('produccion_inyeccion_cortes').update({
          kg_carne_cruda:       kgCarne,
          kg_salmuera_asignada: kgSal,
          kg_carne_limpia:      kgCarne,
        }).eq('id', p.id);
      }
      // Actualizar total en produccion_inyeccion
      await supabase.from('produccion_inyeccion').update({
        kg_carne_total: totalCarne,
      }).eq('id', modalEditar.produccion_id);

      setModalEditar(null);
      setExito('✅ Cortes actualizados correctamente');
      setTimeout(() => setExito(''), 5000);
      await cargar();
    } catch (e) {
      setErrorEdit('Error: ' + e.message);
    }
    setGuardandoEdit(false);
  }

  function abrirPesaje(lote) {
    const picortes = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    const init = {};
    picortes.forEach(p => { init[p.corte_nombre] = ''; });
    setPesajes(init);
    setError('');
    setModalPesaje(lote);
  }

  function abrirWizardRetomar(lote) {
    const formulaSal = (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
    const cfg = horneadoCfgs.find(hc =>
      (hc.config?.formula_salmuera || '').toLowerCase() === formulaSal
    );
    if (!cfg) return;
    const picortes = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    const primerCorte = picortes[0];
    const kgInicial = parseFloat(lote.kg_inicial || lote.produccion_inyeccion?.kg_carne_total || 0);
    const precioCarne = primerCorte
      ? parseFloat(primerCorte.precio_kg_carne || (primerCorte.costo_carne / (primerCorte.kg_carne_cruda || 1)) || 0)
      : 0;
    const esInm = esInmersionLote(lote, horneadoCfgs);
    setWizardRetomar({
      bloques:          cfg.config?.bloques || [],
      bloquesHijo:      cfg.config?.bloques_hijo || [],
      cfg:              cfg.config || {},
      kgInicial,
      precioCarne,
      esBano:           esInm,
      prodNombre:       primerCorte?.corte_nombre || cfg.producto_nombre || '',
      savedLoteId:      lote.lote_id,
      savedFechaSalida: lote.fecha_salida,
    });
  }

  async function confirmarPesaje() {
    const picortes = modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    for (const p of picortes) {
      if (!pesajes[p.corte_nombre] || parseFloat(pesajes[p.corte_nombre]) <= 0) {
        setError(`Ingresa el peso actual de "${p.corte_nombre}"`);
        return;
      }
    }
    setGuardando(true);
    setError('');

    const formulaSalActual = (modalPesaje.produccion_inyeccion?.formula_salmuera || '').toLowerCase();

    // Fetch fresco — evita config cacheado en horneadoCfgs (guardado después del mount)
    const { data: cfgFreshRows } = await supabase
      .from('vista_horneado_config').select('producto_nombre,config').limit(50);

    const cfgCortesEntry = (cfgFreshRows || []).find(hc => {
      if (!hc.config || !formulaSalActual) return false;
      const topLevel  = (hc.config.formula_salmuera || '').toLowerCase();
      const inyBlock  = (hc.config.bloques || []).find(b => b.tipo === 'inyeccion');
      const inyFormula = (inyBlock?.formula_salmuera || '').toLowerCase();
      return topLevel === formulaSalActual || inyFormula === formulaSalActual;
    });
    const esCortesPadre = cfgCortesEntry &&
      (cfgCortesEntry.config?._categoria || '').replace(/[ÓÒ]/g, 'O').toUpperCase().includes('CORTES') &&
      cfgCortesEntry.config?.tipo === 'padre';

    const esBanoCat = esCatBano(cfgCortesEntry?.config?._categoria);
    const bloquesEsBano = cfgCortesEntry?.config?.bloques || [];
    const madIdxEsBano  = bloquesEsBano.findIndex(b => b.tipo === 'maduracion');
    const postMadEsBano = madIdxEsBano >= 0
      ? bloquesEsBano.slice(madIdxEsBano + 1)
      : bloquesEsBano.filter(b => !['inyeccion','rub','adicional','maduracion'].includes(b.tipo));
    const esEsBanoConHorneado = esBanoCat && postMadEsBano.some(b => b.activo && b.tipo === 'horneado');

    try {
      const deshueseEntries = [];
      const hoy = new Date().toISOString().split('T')[0];

      let cortesWizardMpPadreId = null;
      let cortesWizardKgMad     = 0;
      let cortesWizardCosto     = 0;
      let cortesWizardNombre    = '';

      let banoWizardMpId    = null;
      let banoWizardKgMad   = 0;
      let banoWizardCosto   = 0;
      let banoWizardNombre  = '';

      const esInmPesaje = esInmersionLote(modalPesaje, horneadoCfgs);

      for (const p of picortes) {
        const kgMad      = parseFloat(pesajes[p.corte_nombre]);
        const kgCarneReal = parseFloat(p.kg_carne_limpia || p.kg_carne_cruda || 0);
        // Si el wizard momento1 ya calculó el costo con crédito de merma, usarlo
        const inyPasoM1  = (modalPesaje.bloques_resultado?.pasos || []).find(paso => paso.tipo === 'inyeccion');
        const kgInj = inyPasoM1
          ? parseFloat(inyPasoM1.kgSalida || 0)
          : esInmPesaje ? kgCarneReal : kgCarneReal + parseFloat(p.kg_salmuera_asignada || 0);
        const costoTotal = inyPasoM1
          ? parseFloat(inyPasoM1.costoAcum || 0)
          : parseFloat(p.costo_carne || 0) + parseFloat(p.costo_salmuera_asignado || 0);
        const costoInyKg = kgInj > 0 ? costoTotal / kgInj : 0;
        const costoMadKg = kgMad > 0 ? costoTotal / kgMad : 0;

        // Buscar o crear MP en Inyectados
        const { data: mpExist } = await supabase
          .from('materias_primas').select('id')
          .eq('nombre', p.corte_nombre).eq('categoria', 'Inyectados').maybeSingle();

        let mpId;
        if (mpExist) {
          mpId = mpExist.id;
        } else {
          const { data: existIds } = await supabase.from('materias_primas')
            .select('id').eq('categoria', 'Inyectados');
          const nums = (existIds || [])
            .map(m => parseInt((m.id || '').replace(/\D/g, '') || '0'))
            .filter(n => !isNaN(n));
          const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
          const newId = 'INY' + String(nextNum).padStart(3, '0');
          const { data: nuevaMp, error: errMp } = await supabase.from('materias_primas').insert({
            id: newId,
            nombre: p.corte_nombre, nombre_producto: p.corte_nombre,
            categoria: 'Inyectados', precio_kg: 0,
            tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
          }).select('id').single();
          if (errMp) throw new Error('Error creando MP: ' + errMp.message);
          mpId = nuevaMp?.id;
        }

        if (mpId) {
          if (esEsBanoConHorneado) {
            // ── BANO CON HORNEADO: diferir stock al wizard momento2 ──
            banoWizardMpId   = mpId;
            banoWizardKgMad  = kgMad;
            banoWizardCosto  = costoTotal;
            banoWizardNombre = p.corte_nombre;
          } else if (!esCortesPadre) {
            // ── FLUJO NORMAL: actualizar inventario y stock ──
            const { data: inv } = await supabase.from('inventario_mp')
              .select('id, stock_kg').eq('materia_prima_id', mpId).maybeSingle();
            if (inv) {
              await supabase.from('inventario_mp')
                .update({ stock_kg: (inv.stock_kg || 0) + kgMad }).eq('id', inv.id);
            } else {
              await supabase.from('inventario_mp').insert({
                materia_prima_id: mpId, stock_kg: kgMad, nombre: p.corte_nombre,
              });
            }
            await supabase.from('inventario_movimientos').insert({
              materia_prima_id: mpId, nombre_mp: p.corte_nombre,
              tipo: 'entrada', kg: kgMad,
              motivo: `Pesaje maduración — Lote ${modalPesaje.lote_id}`,
              usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
            });
            const { data: stockEntry } = await supabase.from('stock_lotes_inyectados').insert({
              lote_id:            modalPesaje.lote_id,
              lote_maduracion_id: modalPesaje.id,
              corte_nombre:       p.corte_nombre,
              materia_prima_id:   mpId,
              kg_inicial:         kgMad,
              kg_disponible:      kgMad,
              fecha_entrada:      hoy,
              kg_inyectado:       kgInj,
              costo_total:        costoTotal,
              costo_iny_kg:       costoInyKg,
              costo_mad_kg:       costoMadKg,
            }).select('id').single();

            if (deshueseMap[p.corte_nombre] && stockEntry) {
              deshueseEntries.push({
                corteNombre: p.corte_nombre,
                nombreHijo:  deshueseMap[p.corte_nombre],
                stockId:     stockEntry.id,
                kgMad, cMadKg: costoMadKg, costoTotal,
                loteId: modalPesaje.lote_id,
              });
            }
          } else {
            // ── CORTES PADRE: guardar mpId para el wizard ──
            cortesWizardMpPadreId = mpId;
            cortesWizardKgMad     = kgMad;
            cortesWizardCosto     = costoTotal;
            cortesWizardNombre    = p.corte_nombre;
          }
        }
      }

      // Marcar lote completado
      await supabase.from('lotes_maduracion')
        .update({ estado: 'completado' }).eq('id', modalPesaje.id);

      const loteIdGuardado = modalPesaje.lote_id;
      setModalPesaje(null);
      await cargar();

      // ── Si el producto tiene bloques dinámicos → Wizard dinámico Momento 2 ──
      const { data: lotesMadActual } = await supabase
        .from('lotes_maduracion').select('bloques_resultado').eq('id', modalPesaje.id).maybeSingle();
      const brMomento1 = lotesMadActual?.bloques_resultado || null;
      const cfgDinCheck = cortesWizardNombre
        ? ((cfgFreshRows || []).find(hc =>
            (hc.producto_nombre || '').toLowerCase() === cortesWizardNombre.toLowerCase()
          ) || cfgCortesEntry)
        : cfgCortesEntry;
      if (esCortesPadre && cfgDinCheck?.config?.bloques?.length > 0) {
        const padreNombreBusqueda = cfgDinCheck?.producto_nombre || cortesWizardNombre;
        const { data: deshCfgDin } = await supabase
          .from('deshuese_config').select('corte_hijo')
          .ilike('corte_padre', padreNombreBusqueda).maybeSingle();

        // Bloques hijo: primero padre.bloques_hijo, luego config propia del hijo
        let bloquesHijoWizard = cfgDinCheck?.config?.bloques_hijo || [];
        const corteHijoNombre = deshCfgDin?.corte_hijo || '';
        if (bloquesHijoWizard.length === 0 && corteHijoNombre) {
          const hijoRow = (cfgFreshRows || []).find(hc =>
            (hc.producto_nombre || '').toLowerCase() === corteHijoNombre.toLowerCase()
          );
          // Productos hijo guardan sus mermas en bloques_hijo; productos padre en bloques
          const bloquesFromHijo = hijoRow?.config?.bloques_hijo?.length > 0
            ? hijoRow.config.bloques_hijo
            : (hijoRow?.config?.bloques || []);
          if (bloquesFromHijo.length > 0) {
            bloquesHijoWizard = bloquesFromHijo;
          }
        }

        setWizardDinamico({
          modo:        'momento2',
          bloques:     cfgDinCheck?.config?.bloques || [],
          bloquesHijo: bloquesHijoWizard,
          cfg:         cfgDinCheck?.config || {},
          lote: {
            loteId:           loteIdGuardado,
            lotesMadId:       modalPesaje.id,
            corteNombrePadre: cortesWizardNombre,
            corteNombreHijo:  corteHijoNombre,
            mpPadreId:        cortesWizardMpPadreId,
            formulaSalmuera:  formulaSalActual,
            bloquesResultado: brMomento1,
          },
          kgInicial:   cortesWizardKgMad,
          precioCarne: cortesWizardKgMad > 0 ? cortesWizardCosto / cortesWizardKgMad : 0,
          mpsFormula:  mpsParaCortes,
          esBano:      esCatBano(cfgDinCheck?.config?._categoria),
        });
        setGuardando(false);
        return;
      }

      // ── Si es BANO con horneado → Wizard dinámico Momento 2 ──
      if (esEsBanoConHorneado && banoWizardMpId) {
        setWizardDinamico({
          modo:        'momento2',
          bloques:     cfgCortesEntry.config.bloques,
          bloquesHijo: [],
          cfg:         cfgCortesEntry.config,
          lote: {
            loteId:           loteIdGuardado,
            lotesMadId:       modalPesaje.id,
            corteNombrePadre: banoWizardNombre,
            corteNombreHijo:  '',
            mpPadreId:        banoWizardMpId,
            formulaSalmuera:  formulaSalActual,
            bloquesResultado: brMomento1,
          },
          kgInicial:   banoWizardKgMad,
          precioCarne: banoWizardKgMad > 0 ? banoWizardCosto / banoWizardKgMad : 0,
          mpsFormula:  [],
          esBano:      true,
        });
        setGuardando(false);
        return;
      }

      // ── Si es CORTES Padre, abrir wizard de separación ──
      if (esCortesPadre && cortesWizardMpPadreId) {
        const { data: deshCfg } = await supabase
          .from('deshuese_config').select('corte_hijo')
          .ilike('corte_padre', cortesWizardNombre).maybeSingle();
        const [{ data: allMps }, { data: hijoCfgRow }] = await Promise.all([
          supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg,categoria').eq('eliminado', false),
          deshCfg?.corte_hijo
            ? supabase.from('vista_horneado_config').select('config').eq('producto_nombre', deshCfg.corte_hijo).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        setMpsParaCortes(allMps || []);
        setHijoCfgDeshuese(hijoCfgRow?.config || null);
        setModalCortesWizard({
          loteId:           loteIdGuardado,
          lotesMadId:       modalPesaje.id,
          kgMad:            cortesWizardKgMad,
          costoTotal:       cortesWizardCosto,
          corteNombrePadre: cortesWizardNombre,
          corteNombreHijo:  deshCfg?.corte_hijo || '',
          mpPadreId:        cortesWizardMpPadreId,
          formulaSalmuera:  formulaSalActual,
        });
        setCortesWizardPaso(1);
        setCortesKgPadre('');
        setCortesSpItems([]);
        setErrorCortes('');
        setGuardando(false);
        return;
      }

      // Detectar config del producto horneado — genérico para cualquier AHUMADOS-HORNEADOS
      const formulaSal     = (modalPesaje.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
      const cfgHornEntry   = horneadoCfgs.find(hc =>
        isHornCat(hc) && formulaSal && formulaSal === (hc.config?.formula_salmuera || '').toLowerCase()
      ) || horneadoCfgs.find(hc =>
        isHornCat(hc) && formulaSal && (hc.config?.formula_salmuera || '').toLowerCase() &&
        formulaSal.includes((hc.config?.formula_salmuera || '').toLowerCase())
      );
      // Solo sub-productos de MADURACION aquí — los demás van en el wizard de horneado
      const spActivosConf = [];
      const madRaw = ((cfgHornEntry?.config || {}).subproductos || {}).maduracion;
      if (madRaw) {
        const isNew = 'perdida' in madRaw || 'nueva_mp' in madRaw || 'mp_existente' in madRaw;
        const tiposData = isNew ? madRaw : { [madRaw.tipo || 'perdida']: { ...madRaw } };
        ['perdida', 'nueva_mp', 'mp_existente'].forEach(tipo => {
          const sp = tiposData[tipo];
          if (sp?.activo) spActivosConf.push({ fase: 'maduracion', tipo, sp });
        });
      }

      // Si hay sub-productos configurados → mostrar modal SP antes del siguiente paso
      if (spActivosConf.length > 0) {
        const mpIds = spActivosConf.filter(x => x.tipo === 'mp_existente' && x.sp.mp_id).map(x => x.sp.mp_id);
        let mpMap = {};
        if (mpIds.length > 0) {
          const { data: mpData } = await supabase.from('materias_primas')
            .select('id,nombre,nombre_producto,precio_kg').in('id', mpIds);
          (mpData || []).forEach(m => { mpMap[m.id] = m; });
        }
        setSpPostMps(mpMap);
        const totalKgMad = picortes.reduce((s, p) => s + parseFloat(pesajes[p.corte_nombre] || 0), 0);
        setSpPostKgs({});
        setModalSpPost({
          subproductos: spActivosConf,
          loteId: loteIdGuardado,
          totalKgMad,
          pendingFlow: deshueseEntries.length > 0 ? 'deshuese' : 'exito',
          deshueseData: deshueseEntries.length > 0 ? deshueseEntries : null,
        });
      } else if (deshueseEntries.length > 0) {
        const initData = {};
        deshueseEntries.forEach(e => {
          initData[e.corteNombre] = { kgEntrada: '', kgResS: '', kgPuntas: '', kgDesecho: '' };
        });
        setDshData(initData);
        setErrorDeshuese('');
        setModalDeshuese(deshueseEntries);
      } else {
        setExito(`✅ Lote ${loteIdGuardado} pasó a Stock de Congelación`);
        setTimeout(() => setExito(''), 6000);
      }
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  // ── Completar lote INMERSIÓN (sin modal de pesaje — peso final = kg_carne_cruda) ──
  async function completarInmersion(lote) {
    setGuardando(true);
    setError('');
    try {
      const picortes = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
      const deshueseEntries = [];
      const hoy = new Date().toISOString().split('T')[0];

      for (const p of picortes) {
        const kgMad      = parseFloat(p.kg_carne_cruda || 0);  // peso final = carne (salmuera no suma)
        const kgInj      = kgMad;                               // kg inyectado = kgCarne
        const costoTotal = parseFloat(p.costo_carne || 0) + parseFloat(p.costo_salmuera_asignado || 0);
        const costoInyKg = kgInj > 0 ? costoTotal / kgInj : 0;
        const costoMadKg = kgMad > 0 ? costoTotal / kgMad : 0;

        const { data: mpExist } = await supabase
          .from('materias_primas').select('id')
          .eq('nombre', p.corte_nombre).eq('categoria', 'Inyectados').maybeSingle();

        let mpId;
        if (mpExist) {
          mpId = mpExist.id;
        } else {
          const { data: existIds } = await supabase.from('materias_primas')
            .select('id').eq('categoria', 'Inyectados');
          const nums = (existIds || [])
            .map(m => parseInt((m.id || '').replace(/\D/g, '') || '0'))
            .filter(n => !isNaN(n));
          const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
          const newId = 'INY' + String(nextNum).padStart(3, '0');
          const { data: nuevaMp, error: errMp } = await supabase.from('materias_primas').insert({
            id: newId, nombre: p.corte_nombre, nombre_producto: p.corte_nombre,
            categoria: 'Inyectados', precio_kg: 0,
            tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
          }).select('id').single();
          if (errMp) throw new Error('Error creando MP: ' + errMp.message);
          mpId = nuevaMp?.id;
        }

        if (mpId) {
          const { data: inv } = await supabase.from('inventario_mp')
            .select('id, stock_kg').eq('materia_prima_id', mpId).maybeSingle();
          if (inv) {
            await supabase.from('inventario_mp')
              .update({ stock_kg: (inv.stock_kg || 0) + kgMad }).eq('id', inv.id);
          } else {
            await supabase.from('inventario_mp').insert({
              materia_prima_id: mpId, stock_kg: kgMad, nombre: p.corte_nombre,
            });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: mpId, nombre_mp: p.corte_nombre,
            tipo: 'entrada', kg: kgMad,
            motivo: `Inmersión completada — Lote ${lote.lote_id}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });

          const { data: stockEntry } = await supabase.from('stock_lotes_inyectados').insert({
            lote_id:            lote.lote_id,
            lote_maduracion_id: lote.id,
            corte_nombre:       p.corte_nombre,
            materia_prima_id:   mpId,
            kg_inicial:         kgMad,
            kg_disponible:      kgMad,
            fecha_entrada:      hoy,
            kg_inyectado:       kgInj,
            costo_total:        costoTotal,
            costo_iny_kg:       costoInyKg,
            costo_mad_kg:       costoMadKg,
          }).select('id').single();

          if (deshueseMap[p.corte_nombre] && stockEntry) {
            deshueseEntries.push({
              corteNombre: p.corte_nombre,
              nombreHijo:  deshueseMap[p.corte_nombre],
              stockId:     stockEntry.id,
              kgMad, cMadKg: costoMadKg, costoTotal,
              loteId: lote.lote_id,
            });
          }
        }
      }

      await supabase.from('lotes_maduracion').update({ estado: 'completado' }).eq('id', lote.id);

      const loteIdGuardado = lote.lote_id;
      await cargar();

      const formulaSal   = (lote.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
      const cfgHornEntry = horneadoCfgs.find(hc =>
        isHornCat(hc) && formulaSal && formulaSal === (hc.config?.formula_salmuera || '').toLowerCase()
      ) || horneadoCfgs.find(hc =>
        isHornCat(hc) && formulaSal && (hc.config?.formula_salmuera || '').toLowerCase() &&
        formulaSal.includes((hc.config?.formula_salmuera || '').toLowerCase())
      );
      const spActivosConf = [];
      const madRaw = ((cfgHornEntry?.config || {}).subproductos || {}).maduracion;
      if (madRaw) {
        const isNew = 'perdida' in madRaw || 'nueva_mp' in madRaw || 'mp_existente' in madRaw;
        const tiposData = isNew ? madRaw : { [madRaw.tipo || 'perdida']: { ...madRaw } };
        ['perdida', 'nueva_mp', 'mp_existente'].forEach(tipo => {
          const sp = tiposData[tipo];
          if (sp?.activo) spActivosConf.push({ fase: 'maduracion', tipo, sp });
        });
      }

      if (spActivosConf.length > 0) {
        const mpIds = spActivosConf.filter(x => x.tipo === 'mp_existente' && x.sp.mp_id).map(x => x.sp.mp_id);
        let mpMap = {};
        if (mpIds.length > 0) {
          const { data: mpData } = await supabase.from('materias_primas')
            .select('id,nombre,nombre_producto,precio_kg').in('id', mpIds);
          (mpData || []).forEach(m => { mpMap[m.id] = m; });
        }
        setSpPostMps(mpMap);
        const totalKgMad = picortes.reduce((s, p) => s + parseFloat(p.kg_carne_cruda || 0), 0);
        setSpPostKgs({});
        setModalSpPost({
          subproductos: spActivosConf, loteId: loteIdGuardado, totalKgMad,
          pendingFlow: deshueseEntries.length > 0 ? 'deshuese' : 'exito',
          deshueseData: deshueseEntries.length > 0 ? deshueseEntries : null,
        });
      } else if (deshueseEntries.length > 0) {
        const initData = {};
        deshueseEntries.forEach(e => {
          initData[e.corteNombre] = { kgEntrada: '', kgResS: '', kgPuntas: '', kgDesecho: '' };
        });
        setDshData(initData);
        setErrorDeshuese('');
        setModalDeshuese(deshueseEntries);
      } else {
        setExito(`✅ Lote ${loteIdGuardado} (inmersión) pasó a Stock`);
        setTimeout(() => setExito(''), 6000);
      }
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  // ── Separación Padre/Hijo para lotes CORTES ──
  async function confirmarSeparacionCortes() {
    if (!modalCortesWizard) return;
    const { loteId, lotesMadId, kgMad, costoTotal, corteNombrePadre, corteNombreHijo, mpPadreId, formulaSalmuera } = modalCortesWizard;

    const kgPadre = parseFloat(cortesKgPadre) || 0;
    if (kgPadre <= 0 || kgPadre >= kgMad) {
      setErrorCortes('El peso Padre debe ser mayor que 0 y menor que el total madurado');
      return;
    }
    const kgHijoTotal = parseFloat((kgMad - kgPadre).toFixed(3));

    let creditoHijo = 0, kgSpTotal = 0;
    for (const sp of cortesSpItems) {
      const kg = parseFloat(sp.kg) || 0;
      kgSpTotal += kg;
      if (sp.tipo !== 'perdida') creditoHijo += kg * (parseFloat(sp.precio) || 0);
    }
    const kgFinalHijo = Math.max(0, parseFloat((kgHijoTotal - kgSpTotal).toFixed(3)));

    const fracHijo        = kgMad > 0 ? kgHijoTotal / kgMad : 0;
    const costoBaseHijo   = costoTotal * fracHijo;
    const costoFinalHijo  = Math.max(0, costoBaseHijo - creditoHijo);
    const costoFinalPadre = costoTotal - costoBaseHijo;
    const cFinalPadre     = kgPadre     > 0 ? costoFinalPadre / kgPadre     : 0;
    const cFinalHijo      = kgFinalHijo > 0 ? costoFinalHijo  / kgFinalHijo : 0;

    setGuardandoCortes(true);
    setErrorCortes('');
    try {
      const hoy        = new Date().toISOString().split('T')[0];
      const loteIdHijo = loteId + '-H';

      // ── PADRE ──
      const { data: invPadre } = await supabase.from('inventario_mp')
        .select('id, stock_kg').eq('materia_prima_id', mpPadreId).maybeSingle();
      if (invPadre) {
        await supabase.from('inventario_mp').update({ stock_kg: (invPadre.stock_kg || 0) + kgPadre }).eq('id', invPadre.id);
      } else {
        await supabase.from('inventario_mp').insert({ materia_prima_id: mpPadreId, stock_kg: kgPadre, nombre: corteNombrePadre });
      }
      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: mpPadreId, nombre_mp: corteNombrePadre,
        tipo: 'entrada', kg: kgPadre,
        motivo: `Separación Padre — Lote ${loteId}`,
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
      });
      await supabase.from('stock_lotes_inyectados').insert({
        lote_id: loteId, lote_maduracion_id: lotesMadId,
        corte_nombre: corteNombrePadre, materia_prima_id: mpPadreId,
        kg_inicial: kgPadre, kg_disponible: kgPadre, fecha_entrada: hoy,
        kg_inyectado: kgPadre,
        costo_total: costoFinalPadre, costo_iny_kg: cFinalPadre, costo_mad_kg: cFinalPadre,
        tipo_corte: 'padre', formula_salmuera: formulaSalmuera,
      });

      // ── HIJO ── (siempre crear entry aunque kgFinalHijo sea 0)
      if (corteNombreHijo && kgHijoTotal > 0) {
        const { data: mpHijoEx } = await supabase.from('materias_primas')
          .select('id').ilike('nombre', corteNombreHijo).ilike('categoria', 'inyectados').eq('eliminado', false).maybeSingle();
        let mpHijoId = mpHijoEx?.id;
        if (!mpHijoId) {
          const { data: existIds } = await supabase.from('materias_primas').select('id').eq('categoria', 'Inyectados');
          const nums  = (existIds || []).map(m => parseInt((m.id || '').replace(/\D/g,'') || '0')).filter(n => !isNaN(n));
          const nextN = nums.length > 0 ? Math.max(...nums) + 1 : 1;
          const { data: nuevaMp } = await supabase.from('materias_primas').insert({
            id: 'INY' + String(nextN).padStart(3,'0'),
            nombre: corteNombreHijo, nombre_producto: corteNombreHijo,
            categoria: 'Inyectados', precio_kg: 0,
            tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
          }).select('id').single();
          mpHijoId = nuevaMp?.id;
        }
        if (mpHijoId) {
          // Solo actualizar inventario si hay kg neto
          if (kgFinalHijo > 0) {
            const { data: invH } = await supabase.from('inventario_mp')
              .select('id, stock_kg').eq('materia_prima_id', mpHijoId).maybeSingle();
            if (invH) {
              await supabase.from('inventario_mp').update({ stock_kg: (invH.stock_kg || 0) + kgFinalHijo }).eq('id', invH.id);
            } else {
              await supabase.from('inventario_mp').insert({ materia_prima_id: mpHijoId, stock_kg: kgFinalHijo, nombre: corteNombreHijo });
            }
            await supabase.from('inventario_movimientos').insert({
              materia_prima_id: mpHijoId, nombre_mp: corteNombreHijo,
              tipo: 'entrada', kg: kgFinalHijo,
              motivo: `Separación Hijo — Lote ${loteId}`,
              usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
            });
          }
          // Siempre crear el registro de stock para trazabilidad del lote
          await supabase.from('stock_lotes_inyectados').insert({
            lote_id: loteIdHijo, lote_maduracion_id: lotesMadId,
            corte_nombre: corteNombreHijo, materia_prima_id: mpHijoId,
            kg_inicial: kgFinalHijo, kg_disponible: kgFinalHijo, fecha_entrada: hoy,
            kg_inyectado: kgHijoTotal,
            costo_total: costoFinalHijo, costo_iny_kg: cFinalHijo, costo_mad_kg: cFinalHijo,
            tipo_corte: 'hijo', parent_lote_id: loteId, formula_salmuera: formulaSalmuera,
          });

          for (const sp of cortesSpItems) {
            const kg = parseFloat(sp.kg) || 0;
            if (kg <= 0 || sp.tipo === 'perdida' || !sp.mp_id) continue;
            const { data: invSp } = await supabase.from('inventario_mp')
              .select('id, stock_kg').eq('materia_prima_id', sp.mp_id).maybeSingle();
            if (invSp) {
              await supabase.from('inventario_mp').update({ stock_kg: (invSp.stock_kg || 0) + kg }).eq('id', invSp.id);
            } else {
              await supabase.from('inventario_mp').insert({ materia_prima_id: sp.mp_id, stock_kg: kg, nombre: sp.nombre });
            }
            await supabase.from('inventario_movimientos').insert({
              materia_prima_id: sp.mp_id, nombre_mp: sp.nombre,
              tipo: 'entrada', kg,
              motivo: `Sub-producto Hijo Lote ${loteIdHijo}`,
              usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
            });
          }
        }
      }

      setModalCortesWizard(null);
      setCortesKgPadre('');
      setCortesSpItems([]);
      setExito(`✅ Separación completa — ${kgPadre.toFixed(3)} kg ${corteNombrePadre} + ${kgFinalHijo.toFixed(3)} kg ${corteNombreHijo}`);
      setTimeout(() => setExito(''), 8000);
      await cargar();
    } catch (e) {
      setErrorCortes('Error: ' + e.message);
    }
    setGuardandoCortes(false);
  }

  // ── Confirmar sub-productos post-pesaje ───────────────────
  async function confirmarSpPost() {
    setGuardSpPost(true);
    const hoy = new Date().toISOString().split('T')[0];
    try {
      for (const { fase, tipo, sp, noInventario } of modalSpPost.subproductos) {
        const key = `${fase}_${tipo}`;
        const kgReal = parseFloat(spPostKgs[key] || 0);
        if (kgReal <= 0) continue;

        // Fase inyeccion: el inventario ya fue manejado en TabInyeccion, solo registramos los kg
        if (noInventario) continue;

        let mpTargetId   = null;
        let mpNombreTarget = sp.nombre || fase;

        if (tipo === 'mp_existente' && sp.mp_id) {
          mpTargetId     = sp.mp_id;
          mpNombreTarget = spPostMps[sp.mp_id]?.nombre_producto || spPostMps[sp.mp_id]?.nombre || sp.mp_id;
        } else if (tipo === 'nueva_mp' && sp.nombre) {
          const { data: mpEx } = await supabase.from('materias_primas')
            .select('id').ilike('nombre', sp.nombre).maybeSingle();
          if (mpEx) {
            mpTargetId = mpEx.id;
          } else {
            const { data: nueva } = await supabase.from('materias_primas').insert({
              nombre: sp.nombre, nombre_producto: sp.nombre,
              categoria: 'SUB-PRODUCTOS',
              precio_kg: parseFloat(sp.precio_kg || 0),
              tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
            }).select('id').single();
            mpTargetId = nueva?.id;
          }
          mpNombreTarget = sp.nombre;
        }

        if (mpTargetId) {
          const { data: inv } = await supabase.from('inventario_mp')
            .select('id,stock_kg').eq('materia_prima_id', mpTargetId).maybeSingle();
          if (inv) {
            await supabase.from('inventario_mp')
              .update({ stock_kg: (inv.stock_kg || 0) + kgReal }).eq('id', inv.id);
          } else {
            await supabase.from('inventario_mp')
              .insert({ materia_prima_id: mpTargetId, stock_kg: kgReal, nombre: mpNombreTarget });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: mpTargetId, nombre_mp: mpNombreTarget,
            tipo: 'entrada', kg: kgReal,
            motivo: `Sub-producto ${mpNombreTarget} (${fase}/${tipo}) — Lote ${modalSpPost.loteId}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });
        }
      }

      setSpRealesData({ ...spPostKgs });

      const pending = { ...modalSpPost };
      setModalSpPost(null);

      if (pending.pendingFlow === 'deshuese' && pending.deshueseData) {
        const initData = {};
        pending.deshueseData.forEach(e => {
          initData[e.corteNombre] = { kgEntrada: '', kgResS: '', kgPuntas: '', kgDesecho: '' };
        });
        setDshData(initData); setErrorDeshuese('');
        setModalDeshuese(pending.deshueseData);
      } else {
        setExito(`✅ Lote ${pending.loteId} pasó a Stock de Congelación`);
        setTimeout(() => setExito(''), 6000);
      }
    } catch (e) {
      alert('Error al registrar sub-productos: ' + e.message);
    }
    setGuardSpPost(false);
  }
  async function confirmarDeshuese() {
    const entries = modalDeshuese || [];
    const precioResS   = parseFloat(mpDeshuese.resS?.precio_kg  || 0);
    const precioPuntas = parseFloat(mpDeshuese.puntas?.precio_kg || 0);
    const hoy          = new Date().toISOString().split('T')[0];

    // Validar todos los entries
    for (const entry of entries) {
      const d        = dshData[entry.corteNombre] || {};
      const kgEnt    = parseFloat(d.kgEntrada || 0);
      const kgResS   = parseFloat(d.kgResS    || 0);
      const kgPuntas = parseFloat(d.kgPuntas  || 0);
      const kgDesecho= parseFloat(d.kgDesecho || 0);
      const kgHijo   = kgEnt - kgResS - kgPuntas - kgDesecho;
      if (kgEnt <= 0) { setErrorDeshuese(`Ingresa kg para ${entry.nombreHijo} (${entry.corteNombre})`); return; }
      if (kgEnt > entry.kgMad) { setErrorDeshuese(`${entry.corteNombre}: máximo ${entry.kgMad.toFixed(3)} kg`); return; }
      if (kgHijo <= 0) { setErrorDeshuese(`${entry.corteNombre}: los subproductos superan los kg de entrada`); return; }
    }

    setGuardDeshuese(true);
    setErrorDeshuese('');

    try {
      const resumenExito = [];

      for (const entry of entries) {
        const d         = dshData[entry.corteNombre] || {};
        const kgEntrada = parseFloat(d.kgEntrada || 0);
        const kgResS    = parseFloat(d.kgResS    || 0);
        const kgPuntas  = parseFloat(d.kgPuntas  || 0);
        const kgDesecho = parseFloat(d.kgDesecho || 0);
        const kgHijo    = kgEntrada - kgResS - kgPuntas - kgDesecho;
        const valorResS    = kgResS   * precioResS;
        const valorPuntas  = kgPuntas * precioPuntas;
        const costoEntrada = kgEntrada * entry.cMadKg;
        const cLimpio      = (costoEntrada - valorResS - valorPuntas) / kgHijo;

        // ── 1. Buscar o crear MP hijo en Inyectados ──
        const { data: mpHijoExist } = await supabase.from('materias_primas')
          .select('id').eq('nombre', entry.nombreHijo).eq('categoria', 'Inyectados').maybeSingle();
        let mpHijoId;
        if (mpHijoExist) {
          mpHijoId = mpHijoExist.id;
        } else {
          const { data: existIds } = await supabase.from('materias_primas').select('id').eq('categoria', 'Inyectados');
          const nums = (existIds || []).map(m => parseInt((m.id || '').replace(/\D/g, '') || '0')).filter(n => !isNaN(n));
          const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
          const { data: nueva } = await supabase.from('materias_primas').insert({
            id: 'INY' + String(nextNum).padStart(3, '0'),
            nombre: entry.nombreHijo, nombre_producto: entry.nombreHijo,
            categoria: 'Inyectados', precio_kg: 0,
            tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
          }).select('id').single();
          mpHijoId = nueva?.id;
        }

        // ── 2. Sumar hijo a inventario_mp ──
        const { data: invHijo } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', mpHijoId).maybeSingle();
        if (invHijo) {
          await supabase.from('inventario_mp').update({ stock_kg: (invHijo.stock_kg || 0) + kgHijo }).eq('id', invHijo.id);
        } else {
          await supabase.from('inventario_mp').insert({ materia_prima_id: mpHijoId, stock_kg: kgHijo, nombre: entry.nombreHijo });
        }
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id: mpHijoId, nombre_mp: entry.nombreHijo, tipo: 'entrada', kg: kgHijo,
          motivo: `Deshuese Lote ${entry.loteId} — ${kgEntrada.toFixed(3)} kg ${entry.corteNombre} → ${kgHijo.toFixed(3)} kg ${entry.nombreHijo}`,
          usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
        });

        // ── 3. Registrar hijo en stock_lotes_inyectados ──
        await supabase.from('stock_lotes_inyectados').insert({
          lote_id:          entry.loteId,
          corte_nombre:     entry.nombreHijo,
          materia_prima_id: mpHijoId,
          kg_inicial:       kgHijo,
          kg_disponible:    kgHijo,
          fecha_entrada:    hoy,
          kg_inyectado:     kgEntrada,
          costo_total:      costoEntrada - valorResS - valorPuntas,
          costo_iny_kg:     entry.cMadKg,
          costo_mad_kg:     cLimpio,
        });

        // ── 4. Reducir kg_disponible del padre en stock_lotes_inyectados ──
        const { data: padreStock } = await supabase.from('stock_lotes_inyectados')
          .select('kg_disponible').eq('id', entry.stockId).single();
        await supabase.from('stock_lotes_inyectados')
          .update({ kg_disponible: Math.max(0, (padreStock?.kg_disponible || 0) - kgEntrada) })
          .eq('id', entry.stockId);

        // ── 5. Res Segunda (C031) ──
        if (kgResS > 0) {
          const { data: invRes } = await supabase.from('inventario_mp')
            .select('id, stock_kg').eq('materia_prima_id', 'C031').maybeSingle();
          if (invRes) {
            await supabase.from('inventario_mp').update({ stock_kg: (invRes.stock_kg || 0) + kgResS }).eq('id', invRes.id);
          } else {
            await supabase.from('inventario_mp').insert({ materia_prima_id: 'C031', stock_kg: kgResS, nombre: 'Res Segunda' });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: 'C031', nombre_mp: 'Res Segunda', tipo: 'entrada', kg: kgResS,
            motivo: `Deshuese ${entry.corteNombre} — Lote ${entry.loteId}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });
        }

        // ── 6. Puntas Cortes Especiales (RET002) ──
        if (kgPuntas > 0) {
          const { data: invPun } = await supabase.from('inventario_mp')
            .select('id, stock_kg').eq('materia_prima_id', 'RET002').maybeSingle();
          if (invPun) {
            await supabase.from('inventario_mp').update({ stock_kg: (invPun.stock_kg || 0) + kgPuntas }).eq('id', invPun.id);
          } else {
            await supabase.from('inventario_mp').insert({ materia_prima_id: 'RET002', stock_kg: kgPuntas, nombre: 'Puntas de cortes especiales' });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: 'RET002', nombre_mp: 'Puntas de cortes especiales', tipo: 'entrada', kg: kgPuntas,
            motivo: `Deshuese ${entry.corteNombre} — Lote ${entry.loteId}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });
        }

        // ── 7. Guardar deshuese_registros ──
        await supabase.from('deshuese_registros').insert({
          fecha:                hoy,
          lote_id:              entry.loteId,
          stock_lotes_id_ny:    entry.stockId,
          kg_entrada:           kgEntrada,
          kg_res_segunda:       kgResS,
          kg_puntas_especiales: kgPuntas,
          kg_desecho:           kgDesecho,
          kg_lomo_limpio:       kgHijo,
          costo_entrada_kg:     entry.cMadKg,
          valor_res_segunda:    valorResS,
          valor_puntas:         valorPuntas,
          c_limpio_kg:          cLimpio,
        });

        resumenExito.push(`${entry.nombreHijo}: ${kgHijo.toFixed(3)} kg · $${cLimpio.toFixed(4)}/kg`);
      }

      const loteId = entries[0]?.loteId || '';
      setModalDeshuese(null);
      setExito(`✅ Lote ${loteId} — Deshuese registrado: ${resumenExito.join(' | ')}`);
      setTimeout(() => setExito(''), 10000);
    } catch (e) {
      setErrorDeshuese('Error: ' + e.message);
    }
    setGuardDeshuese(false);
  }

  const inputStyle = {
    padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #ddd', fontSize: '13px',
    width: '100%', boxSizing: 'border-box', outline: 'none'
  };

  const lotesActivos  = lotes;
  const lotesListos   = lotes.filter(l => diasParaSalida(l.fecha_salida) <= 0);

  return (
    <div>
      {exito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '12px 16px', borderRadius: 10,
          marginBottom: 14, fontWeight: 'bold', fontSize: '13px'
        }}>{exito}</div>
      )}

      {/* ── Alerta lotes listos ── */}
      {lotesListos.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg,#e74c3c,#c0392b)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: 28 }}>🚨</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>
              {lotesListos.length} lote{lotesListos.length > 1 ? 's' : ''} listo{lotesListos.length > 1 ? 's' : ''} para pesaje de maduración
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
              {lotesListos.map(l => l.lote_id).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs vista ── */}
      <div style={{
        display: 'flex', gap: 4, background: 'white',
        borderRadius: 10, padding: 4, marginBottom: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content'
      }}>
        {[
          { k: false, label: `🧊 En maduración (${lotesActivos.length})` },
          { k: true,  label: '📋 Historial' },
        ].map(v => (
          <button key={String(v.k)} onClick={() => setVistaHist(v.k)} style={{
            padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 'bold',
            background: vistaHist === v.k ? '#1a1a2e' : 'transparent',
            color:      vistaHist === v.k ? 'white'   : '#666',
          }}>{v.label}</button>
        ))}
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando lotes...</div>
      ) : !vistaHist ? (
        /* ── Lista activos ── */
        <>
        {lotesActivos.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40,
            background: 'white', borderRadius: 12, color: '#aaa'
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧊</div>
            <div style={{ fontWeight: 'bold' }}>No hay lotes en maduración</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Los lotes aparecen al registrar una inyección</div>
          </div>
        ) : (
          lotesActivos.map(lote => {
            const dias      = diasParaSalida(lote.fecha_salida);
            const listo     = dias <= 0;
            const picortes  = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
            const esInm        = esInmersionLote(lote, horneadoCfgs);
            const tieneMadActiva = tieneMaduracionActiva(lote, horneadoCfgs);
            const totalCarne = picortes.reduce((s, p) => s + (esInm
              ? parseFloat(p.kg_carne_limpia || p.kg_carne_cruda || 0)
              : parseFloat(p.kg_carne_cruda || 0)), 0);
            const totalSal   = picortes.reduce((s, p) => s + parseFloat(p.kg_salmuera_asignada || 0), 0);
            const totalInj   = esInm ? totalCarne : totalCarne + totalSal;
            const expandido  = !!expandidos[lote.id];

            return (
              <div key={lote.id} style={{
                background: 'white', borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                padding: mobile ? 14 : 18, marginBottom: 12,
                borderLeft: `5px solid ${listo ? '#e74c3c' : '#2980b9'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    {/* Header lote */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e' }}>
                        🧊 Lote {lote.lote_id}
                      </span>
                      {listo ? (
                        <span style={{ background: '#e74c3c', color: 'white', borderRadius: 12, padding: '3px 12px', fontSize: 11, fontWeight: 'bold' }}>
                          🚨 LISTO PARA PESAJE
                        </span>
                      ) : (
                        <span style={{ background: '#eaf4fd', color: '#2980b9', borderRadius: 12, padding: '3px 12px', fontSize: 11, fontWeight: 'bold' }}>
                          ⏳ {dias} día{dias !== 1 ? 's' : ''} restante{dias !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Fechas + totales en una línea */}
                    <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>📅 <b>{lote.fecha_entrada}</b> → <b>{lote.fecha_salida}</b></span>
                      <span>🥩 <b>{totalCarne.toFixed(3)} kg</b> carne</span>
                      <span>🧂 <b>{totalSal.toFixed(3)} kg</b> salmuera</span>
                      <span style={{ color: '#1a3a5c', fontWeight: 'bold' }}>⚖️ {totalInj.toFixed(3)} kg total</span>
                      {lote.produccion_inyeccion?.formula_salmuera && (
                        <span style={{ color: '#888' }}>{lote.produccion_inyeccion.formula_salmuera}</span>
                      )}
                      {/* Toggle tabla */}
                      <button onClick={() => toggleExpandido(lote.id)} style={{
                        background: 'none', border: '1px solid #ddd', borderRadius: 6,
                        padding: '2px 10px', fontSize: 11, cursor: 'pointer', color: '#555'
                      }}>
                        {expandido ? '▲ Ocultar detalle' : '▼ Ver detalle'}
                      </button>
                    </div>

                    {/* Tabla colapsable */}
                    {expandido && picortes.length > 0 && (
                      <div style={{ background: '#f0f4f8', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px',
                          gap: 6, padding: '6px 12px',
                          background: '#1a1a2e', fontSize: 10, fontWeight: 'bold', color: '#aaa'
                        }}>
                          <div>CORTE</div>
                          <div style={{ textAlign: 'right' }}>CARNE (kg)</div>
                          <div style={{ textAlign: 'right' }}>SALMUERA (kg)</div>
                          <div style={{ textAlign: 'right' }}>TOTAL INYECT.</div>
                        </div>
                        {picortes.map((p, idx) => {
                          const kgCarne = esInm
                            ? parseFloat(p.kg_carne_limpia || p.kg_carne_cruda || 0)
                            : parseFloat(p.kg_carne_cruda || 0);
                          const kgSal   = parseFloat(p.kg_salmuera_asignada || 0);
                          const kgInj   = esInm ? kgCarne : kgCarne + kgSal;
                          const pctSal  = kgCarne > 0 ? ((kgSal / kgCarne) * 100).toFixed(1) : '0.0';
                          return (
                            <div key={idx} style={{
                              display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px',
                              gap: 6, padding: '9px 12px',
                              borderTop: '1px solid #e0e7ef', alignItems: 'center',
                              background: idx % 2 === 0 ? 'white' : '#f8fafc'
                            }}>
                              <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e' }}>🥩 {p.corte_nombre}</div>
                              <div style={{ textAlign: 'right', fontSize: 13, color: '#333' }}>{kgCarne.toFixed(3)}</div>
                              <div style={{ textAlign: 'right', fontSize: 13, color: '#2980b9' }}>
                                {kgSal.toFixed(3)}
                                <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>({pctSal}%)</span>
                              </div>
                              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 'bold', color: '#1a3a5c' }}>
                                {kgInj.toFixed(3)} kg
                              </div>
                            </div>
                          );
                        })}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px',
                          gap: 6, padding: '8px 12px',
                          background: '#1a3a5c', borderTop: '2px solid #2980b9',
                          fontSize: 12, fontWeight: 'bold', color: 'white'
                        }}>
                          <div>TOTAL</div>
                          <div style={{ textAlign: 'right' }}>{totalCarne.toFixed(3)}</div>
                          <div style={{ textAlign: 'right', color: '#7ec8f7' }}>{totalSal.toFixed(3)}</div>
                          <div style={{ textAlign: 'right', color: '#a9dfbf' }}>{totalInj.toFixed(3)} kg</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botones derecha */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => abrirEditar(lote)} style={{
                      background: '#f0f2f5', border: '1px solid #ddd', borderRadius: 8,
                      padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', color: '#333'
                    }}>✏️ Editar kg</button>
                    {!listo && (
                      <button onClick={() => {
                        if (window.confirm('¿Marcar este lote como listo ahora? (modo prueba)')) forzarListo(lote);
                      }} style={{
                        background: '#fff3cd', border: '1px solid #f39c12', borderRadius: 8,
                        padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', color: '#856404'
                      }}>🧪 Prueba</button>
                    )}
                    {/* Retomar wizard si momento1 nunca completó */}
                    {!listo && lote.bloques_resultado === null && (
                      <button onClick={() => abrirWizardRetomar(lote)} style={{
                        background: 'linear-gradient(135deg,#e67e22,#d35400)',
                        color: 'white', border: 'none', borderRadius: 8,
                        padding: '8px 14px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap'
                      }}>▶ Retomar producción</button>
                    )}
                    {listo && (
                      tieneMadActiva ? (
                        <button onClick={() => abrirPesaje(lote)} style={{
                          background: 'linear-gradient(135deg,#e74c3c,#c0392b)',
                          color: 'white', border: 'none', borderRadius: 8,
                          padding: '8px 14px', cursor: 'pointer',
                          fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap'
                        }}>⚖️ Registrar pesaje</button>
                      ) : esInm ? (
                        <button onClick={() => completarInmersion(lote)} disabled={guardando} style={{
                          background: 'linear-gradient(135deg,#27ae60,#1e8449)',
                          color: 'white', border: 'none', borderRadius: 8,
                          padding: '8px 14px', cursor: guardando ? 'not-allowed' : 'pointer',
                          fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap'
                        }}>🫙 Completar inmersión</button>
                      ) : (
                        <button onClick={() => abrirPesaje(lote)} style={{
                          background: 'linear-gradient(135deg,#e74c3c,#c0392b)',
                          color: 'white', border: 'none', borderRadius: 8,
                          padding: '8px 14px', cursor: 'pointer',
                          fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap'
                        }}>⚖️ Registrar pesaje</button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
</>
      ) : (
        /* ── Historial completados ── */
        historial.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            No hay lotes completados aún.
          </div>
        ) : (
          historial.map(lote => {
            const cortes  = lote.lotes_maduracion_cortes || [];
            const kgIn    = cortes.reduce((s, c) => s + (c.kg_inyectado  || 0), 0);
            const kgMad   = cortes.reduce((s, c) => s + (c.kg_madurado   || 0), 0);
            const perdida = kgIn - kgMad;

            return (
              <div key={lote.id} style={{
                background: 'white', borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: mobile ? 12 : 16, marginBottom: 10,
                borderLeft: '5px solid #27ae60'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 14, color: '#1a1a2e', marginBottom: 4 }}>
                      ✅ Lote {lote.lote_id}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>📅 {lote.fecha_entrada} → {lote.fecha_salida}</span>
                      <span>⬇️ Inyectado: <b>{kgIn.toFixed(3)} kg</b></span>
                      {kgMad > 0 && <span>⬆️ Madurado: <b>{kgMad.toFixed(3)} kg</b></span>}
                      {perdida > 0 && (
                        <span style={{ color: '#e74c3c' }}>
                          📉 Pérdida: <b>{perdida.toFixed(3)} kg</b>
                          ({kgIn > 0 ? ((perdida / kgIn) * 100).toFixed(1) : 0}%)
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {cortes.map(c => (
                        <div key={c.id} style={{
                          background: '#e8f5e9', borderRadius: 8,
                          padding: '5px 10px', fontSize: 11
                        }}>
                          <b>{c.corte_nombre}</b>
                          <span style={{ color: '#555', marginLeft: 4 }}>
                            {(c.kg_inyectado||0).toFixed(3)} → {(c.kg_madurado||0).toFixed(3)} kg
                          </span>
                          {c.costo_kg_ajustado > 0 && (
                            <span style={{ color: '#1a5276', marginLeft: 4 }}>
                              · ${c.costo_kg_ajustado.toFixed(4)}/kg
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {lote.bloques_resultado?.pasos?.length > 0 && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ fontSize: 11, color: '#8e44ad', cursor: 'pointer', fontWeight: 600 }}>
                          🧩 Ver pasos del flujo dinámico ({lote.bloques_resultado.pasos.length} pasos)
                        </summary>
                        <div style={{ marginTop: 6, paddingLeft: 8 }}>
                          {lote.bloques_resultado.pasos.map((p, i) => {
                            const costoKg = p.kgSalida > 0 ? p.costoAcum / p.kgSalida : 0;
                            return (
                              <div key={i} style={{ fontSize: 10, color: '#555', padding: '2px 0', borderBottom: '1px solid #f0f0f0' }}>
                                {p.tipo}{p.merma_tipo ? ` T${p.merma_tipo}` : ''}: {p.kgSalida?.toFixed(3)} kg · ${costoKg.toFixed(4)}/kg
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )
      )}

      {/* ══ Modal Editar kg cortes ══ */}
      {modalEditar && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 460,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e', marginBottom: 4 }}>
              ✏️ Editar kg — Lote {modalEditar.lote_id}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
              La salmuera se recalcula automáticamente en proporción a los kg de cada corte.
            </div>

            {(() => {
              const picortes  = modalEditar.produccion_inyeccion?.produccion_inyeccion_cortes || [];
              const totalNuevo = picortes.reduce((s, _, i) => s + parseFloat(editKgs[i] || 0), 0);
              const kgSalTotal = parseFloat(modalEditar.produccion_inyeccion?.kg_salmuera_requerida || 0);
              return (
                <>
                  {picortes.map((p, i) => {
                    const kgCarne = parseFloat(editKgs[i] || 0);
                    const kgSal   = totalNuevo > 0 ? kgSalTotal * (kgCarne / totalNuevo) : 0;
                    return (
                      <div key={i} style={{
                        background: '#f8fafc', borderRadius: 10,
                        padding: '12px 14px', marginBottom: 10
                      }}>
                        <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e', marginBottom: 8 }}>
                          🥩 {p.corte_nombre}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Kg carne *</div>
                            <input
                              type="number" min="0" step="0.001"
                              value={editKgs[i]}
                              onChange={e => setEditKgs(prev => ({ ...prev, [i]: e.target.value }))}
                              style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '8px 10px', borderRadius: 8,
                                border: '1.5px solid #2980b9', fontSize: 14,
                                textAlign: 'right', outline: 'none'
                              }}
                            />
                          </div>
                          <div style={{ textAlign: 'center', color: '#888', fontSize: 12 }}>→</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: '#2980b9', marginBottom: 3 }}>Salmuera (calculada)</div>
                            <div style={{
                              padding: '8px 10px', borderRadius: 8,
                              background: '#eaf4fd', fontSize: 14,
                              textAlign: 'right', color: '#1a3a5c', fontWeight: 'bold'
                            }}>
                              {kgSal.toFixed(3)} kg
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: '#27ae60', marginBottom: 3 }}>Total inyect.</div>
                            <div style={{
                              padding: '8px 10px', borderRadius: 8,
                              background: '#e8f5e9', fontSize: 14,
                              textAlign: 'right', color: '#1a5276', fontWeight: 'bold'
                            }}>
                              {(kgCarne + kgSal).toFixed(3)} kg
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{
                    background: '#1a1a2e', borderRadius: 10, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', color: 'white',
                    fontSize: 13, fontWeight: 'bold', marginBottom: 16
                  }}>
                    <span>TOTAL</span>
                    <span>{(totalNuevo + kgSalTotal).toFixed(3)} kg</span>
                  </div>
                </>
              );
            })()}

            {errorEdit && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: 8, padding: '10px 14px', color: '#e74c3c',
                fontSize: 13, marginBottom: 14
              }}>{errorEdit}</div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEditar(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer', fontSize: 13
              }}>Cancelar</button>
              <button onClick={guardarEdicion} disabled={guardandoEdit} style={{
                background: guardandoEdit ? '#aaa' : 'linear-gradient(135deg,#1a1a2e,#2c3e50)',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '10px 24px', cursor: guardandoEdit ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 'bold'
              }}>
                {guardandoEdit ? 'Guardando...' : '💾 Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ══ Modal Deshuese (NY → Lomo Bife / Rib Eye → Ojo de Bife) ══ */}
      {modalDeshuese && (() => {
        const entries      = modalDeshuese;
        const precioResS   = parseFloat(mpDeshuese.resS?.precio_kg  || 0);
        const precioPuntas = parseFloat(mpDeshuese.puntas?.precio_kg || 0);
        const loteId       = entries[0]?.loteId || '';

        // Calcular resultado por entry para mostrar en UI
        const calcEntry = (entry) => {
          const d         = dshData[entry.corteNombre] || {};
          const kgEntrada = parseFloat(d.kgEntrada || 0);
          const kgResS    = parseFloat(d.kgResS    || 0);
          const kgPuntas  = parseFloat(d.kgPuntas  || 0);
          const kgDesecho = parseFloat(d.kgDesecho || 0);
          const kgHijo    = kgEntrada - kgResS - kgPuntas - kgDesecho;
          const valorResS    = kgResS   * precioResS;
          const valorPuntas  = kgPuntas * precioPuntas;
          const costoEntrada = kgEntrada * entry.cMadKg;
          const cLimpio      = kgHijo > 0 ? (costoEntrada - valorResS - valorPuntas) / kgHijo : 0;
          const kgResto      = entry.kgMad - kgEntrada;
          return { kgEntrada, kgResS, kgPuntas, kgDesecho, kgHijo, valorResS, valorPuntas, costoEntrada, cLimpio, kgResto };
        };

        const todoValido = entries.every(entry => {
          const c = calcEntry(entry);
          return c.kgEntrada > 0 && c.kgHijo > 0 && c.kgEntrada <= entry.kgMad;
        });

        const colorEntry = { 'New York Steak': '#1a5276', 'Rib eye steack': '#6c3483' };

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '94vh', overflowY: 'auto' }}>

              <div style={{ fontWeight: 'bold', fontSize: 17, color: '#1a1a2e', marginBottom: 2 }}>🦴 Deshuese — Lote {loteId}</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
                {entries.map(e => `${e.corteNombre} → ${e.nombreHijo} (${e.kgMad.toFixed(3)} kg disponibles)`).join(' · ')}
              </div>

              {/* Una sección por cada corte padre */}
              {entries.map(entry => {
                const c    = calcEntry(entry);
                const col  = colorEntry[entry.corteNombre] || '#333';
                const d    = dshData[entry.corteNombre] || {};
                return (
                  <div key={entry.corteNombre} style={{ border: `2px solid ${col}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, color: col, fontSize: 14, marginBottom: 10 }}>
                      {entry.corteNombre} → <span style={{ color: '#27ae60' }}>{entry.nombreHijo}</span>
                      <span style={{ fontWeight: 400, fontSize: 11, color: '#888', marginLeft: 8 }}>C_mad ${entry.cMadKg.toFixed(4)}/kg</span>
                    </div>

                    {/* Kg que van al hijo */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 4 }}>
                        Kg de {entry.corteNombre} que van a {entry.nombreHijo} *
                      </label>
                      <input
                        type="number" min="0" max={entry.kgMad} step="0.001"
                        placeholder={`máx ${entry.kgMad.toFixed(3)}`}
                        value={d.kgEntrada || ''}
                        onChange={e => setDsh(entry.corteNombre, 'kgEntrada', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `2px solid ${col}`, fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }}
                      />
                      {c.kgEntrada > 0 && c.kgResto >= 0 && (
                        <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
                          Quedan como {entry.corteNombre} directo a congelación: <b>{c.kgResto.toFixed(3)} kg</b>
                        </div>
                      )}
                    </div>

                    {/* Subproductos */}
                    <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#777', marginBottom: 8 }}>SUBPRODUCTOS</div>
                      {[
                        { label: 'Res Segunda',        id: 'C031',   precio: precioResS,   valor: c.valorResS,   key: 'kgResS',   color: '#e67e22' },
                        { label: 'Puntas Cortes Esp.', id: 'RET002', precio: precioPuntas, valor: c.valorPuntas, key: 'kgPuntas', color: '#8e44ad' },
                        { label: 'Desecho / Hueso blanco', id: null, precio: 0, valor: 0, key: 'kgDesecho', color: '#95a5a6' },
                      ].map(({ label, id, precio, valor, key, color }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ width: 130, fontSize: 11, color, fontWeight: 600 }}>
                            {label}{id && <span style={{ color: '#aaa', fontWeight: 400 }}> · ${precio.toFixed(2)}/kg</span>}
                          </span>
                          <input
                            type="number" min="0" step="0.001" placeholder="0.000"
                            value={d[key] || ''}
                            onChange={e => setDsh(entry.corteNombre, key, e.target.value)}
                            style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: `1.5px solid ${color}`, fontSize: 12, fontWeight: 'bold', textAlign: 'right' }}
                          />
                          <span style={{ fontSize: 10, color: '#888' }}>kg</span>
                          {id && parseFloat(d[key]) > 0 && (
                            <span style={{ fontSize: 10, color: '#27ae60', fontWeight: 700 }}>−${valor.toFixed(4)} crédito · sube stock</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Resultado */}
                    {c.kgEntrada > 0 && (
                      <div style={{ background: c.kgHijo > 0 ? '#f0fff4' : '#ffeaea', borderRadius: 8, padding: '8px 12px', border: `1px solid ${c.kgHijo > 0 ? '#a9dfbf' : '#e74c3c'}`, fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: c.kgHijo > 0 ? '#1a5276' : '#e74c3c' }}>
                          {entry.nombreHijo}: {c.kgHijo > 0 ? `${c.kgHijo.toFixed(3)} kg` : '⚠ revisar'}
                        </span>
                        {c.kgHijo > 0 && (
                          <span style={{ color: '#2980b9', marginLeft: 10 }}>C_limpio: ${c.cLimpio.toFixed(4)}/kg</span>
                        )}
                        {(c.valorResS + c.valorPuntas) > 0 && (
                          <span style={{ color: '#27ae60', marginLeft: 10 }}>crédito: −${(c.valorResS + c.valorPuntas).toFixed(4)}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {errorDeshuese && (
                <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', color: '#e74c3c', fontSize: 13, marginBottom: 14 }}>{errorDeshuese}</div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => {
                  setModalDeshuese(null);
                  setExito(`✅ Lote ${loteId} pasó a Stock de Congelación (sin deshuese)`);
                  setTimeout(() => setExito(''), 6000);
                }} style={{ background: '#f0f2f5', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13 }}>
                  Omitir
                </button>
                <button onClick={confirmarDeshuese} disabled={!todoValido || guardDeshuese} style={{
                  background: !todoValido || guardDeshuese ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)',
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '10px 24px', cursor: !todoValido || guardDeshuese ? 'default' : 'pointer',
                  fontSize: 13, fontWeight: 'bold'
                }}>
                  {guardDeshuese ? 'Guardando...' : '🦴 Registrar Deshuese'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Modal Sub-productos post-pesaje ══ */}
      {modalSpPost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Sub-productos — uno por tarjeta */}
            {modalSpPost.subproductos.map(({ fase, tipo, sp, noInventario }) => {
              const key      = `${fase}_${tipo}`;
              const mpInfo   = tipo === 'mp_existente' ? spPostMps[sp.mp_id] : null;
              const nombre   = tipo === 'nueva_mp' ? sp.nombre : (mpInfo?.nombre_producto || mpInfo?.nombre || sp.mp_id || fase);
              const precio   = tipo === 'nueva_mp' ? parseFloat(sp.precio_kg || 0) : parseFloat(mpInfo?.precio_kg || 0);
              const kgReal   = parseFloat(spPostKgs[key] || 0);
              const valorRec = kgReal * precio;
              const tipoLabel = tipo === 'perdida'
                ? '❌ Pérdida total'
                : noInventario
                  ? '📝 Solo registro (ya en stock por inyección)'
                  : tipo === 'mp_existente' ? '📦 MP existente → entra a inventario'
                  : '🆕 Nueva MP → entra a inventario';
              const tipoColor = tipo === 'perdida' ? '#e74c3c' : '#2980b9';
              return (
                <div key={key} style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 900, fontSize: 18, color: '#1a1a2e', marginBottom: 2 }}>
                    {nombre}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: tipoColor, fontWeight: 700, background: tipoColor + '18', borderRadius: 6, padding: '2px 10px' }}>
                      {tipoLabel}
                    </span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>Lote {modalSpPost.loteId} · {modalSpPost.totalKgMad.toFixed(3)} kg post-maduración</span>
                  </div>

                  <div style={{ background: tipo === 'perdida' ? '#fff5f5' : '#f0fff8', border: `2px solid ${tipo === 'perdida' ? '#f5b7b1' : '#a9dfbf'}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
                      {tipo === 'perdida'
                        ? <>¿Cuántos kg de merma real de <b>{nombre}</b> hubo en este lote?</>
                        : <>¿Cuántos kg de <b>{nombre}</b> obtuviste en este lote?</>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" min="0" step="0.001"
                        value={spPostKgs[key] ?? ''}
                        onChange={e => setSpPostKgs(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="0.000"
                        style={{ flex: 1, padding: '12px 14px', borderRadius: 8, border: `2px solid ${tipo === 'perdida' ? '#e74c3c' : '#27ae60'}`, fontSize: 18, fontWeight: 'bold', textAlign: 'right' }} />
                      <span style={{ fontSize: 15, color: '#555', fontWeight: 700 }}>kg</span>
                    </div>
                    {tipo === 'perdida' && kgReal > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#e74c3c', fontWeight: 700 }}>
                        ❌ {kgReal.toFixed(3)} kg de merma — sin valor recuperable, sube el costo/kg
                      </div>
                    )}
                    {tipo !== 'perdida' && valorRec > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#27ae60', fontWeight: 700 }}>
                        💰 Valor recuperado: {kgReal.toFixed(3)} kg × ${precio.toFixed(4)}/kg = ${valorRec.toFixed(4)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Botón confirmar */}
            <div style={{ marginTop: 8 }}>
              <button onClick={confirmarSpPost} disabled={guardSpPost}
                style={{ width: '100%', padding: '12px', background: guardSpPost ? '#aaa' : '#27ae60', color: 'white', border: 'none', borderRadius: 8, cursor: guardSpPost ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {guardSpPost ? 'Guardando...' : '💾 Confirmar sub-productos → Siguiente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal Pesaje ══ */}
      {modalPesaje && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: 17, color: '#1a1a2e', marginBottom: 4 }}>
              ⚖️ Pesaje de maduración
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
              Lote {modalPesaje.lote_id} · ingresó {modalPesaje.fecha_entrada}
            </div>

            {/* Tabla de cortes */}
            <div style={{
              background: '#f0f4f8', borderRadius: 10,
              overflow: 'hidden', marginBottom: 16
            }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px',
                gap: 8, padding: '8px 12px',
                background: '#1a1a2e', fontSize: 10, fontWeight: 'bold', color: '#aaa'
              }}>
                <div>CORTE</div>
                <div style={{ textAlign: 'right' }}>KG INYECT.</div>
                <div style={{ textAlign: 'right' }}>KG HOY *</div>
                <div style={{ textAlign: 'right' }}>DIFERENCIA</div>
              </div>

              {(() => { const esInmModal = esInmersionLote(modalPesaje, horneadoCfgs); return (
              (modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || []).map(p => {
                const kgCarneReal = parseFloat(p.kg_carne_limpia || p.kg_carne_cruda || 0);
                const kgSalModal  = parseFloat(p.kg_salmuera_asignada || 0);
                const inyPasoModal = (modalPesaje.bloques_resultado?.pasos || []).find(paso => paso.tipo === 'inyeccion');
                const kgInj  = inyPasoModal
                  ? parseFloat(inyPasoModal.kgSalida || 0)
                  : esInmModal ? kgCarneReal : kgCarneReal + kgSalModal;
                const kgHoy  = parseFloat(pesajes[p.corte_nombre] || 0);
                const diff   = kgHoy > 0 ? kgInj - kgHoy : null;
                return (
                  <div key={p.corte_nombre} style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px',
                    gap: 8, padding: '10px 12px',
                    borderTop: '1px solid #e0e0e0', alignItems: 'center'
                  }}>
                    <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e' }}>
                      🥩 {p.corte_nombre}
                      <div style={{ fontSize: 10, color: '#888', fontWeight: 'normal' }}>
                        {esInmModal
                          ? `${kgCarneReal.toFixed(3)} carne (baño: ${kgSalModal.toFixed(3)} sal)`
                          : `${kgCarneReal.toFixed(3)} carne + ${kgSalModal.toFixed(3)} sal`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: '#2980b9', fontWeight: 'bold' }}>
                      {kgInj.toFixed(3)}
                    </div>
                    <div>
                      <input
                        type="number" min="0" step="0.001"
                        value={pesajes[p.corte_nombre] ?? ''}
                        onChange={e => setPesajes(prev => ({ ...prev, [p.corte_nombre]: e.target.value }))}
                        placeholder="0.000"
                        style={{ ...inputStyle, textAlign: 'right', borderColor: pesajes[p.corte_nombre] ? '#27ae60' : '#ddd' }}
                      />
                    </div>
                    <div style={{
                      textAlign: 'right', fontSize: 12, fontWeight: 'bold',
                      color: diff === null ? '#ccc' : diff > 0 ? '#e74c3c' : '#27ae60'
                    }}>
                      {diff === null ? '—' : `-${diff.toFixed(3)}`}
                    </div>
                  </div>
                );
              }))})()}
            </div>

            {/* Resumen merma */}
            {(modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || []).some(p => parseFloat(pesajes[p.corte_nombre]) > 0) && (
              <div style={{
                background: '#fff3e0', borderRadius: 10,
                padding: '10px 14px', marginBottom: 16, fontSize: 12
              }}>
                <div style={{ fontWeight: 'bold', color: '#e65100', marginBottom: 6 }}>
                  📉 Merma de maduración:
                </div>
                {(modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || []).map(p => {
                  const kgMad = parseFloat(pesajes[p.corte_nombre] || 0);
                  if (!kgMad) return null;
                  const kgCarneR = parseFloat(p.kg_carne_limpia || p.kg_carne_cruda || 0);
                  const inyPasoResumen = (modalPesaje.bloques_resultado?.pasos || []).find(paso => paso.tipo === 'inyeccion');
                  const kgInj = inyPasoResumen
                    ? parseFloat(inyPasoResumen.kgSalida || 0)
                    : esInmersionLote(modalPesaje, horneadoCfgs)
                      ? kgCarneR
                      : kgCarneR + parseFloat(p.kg_salmuera_asignada || 0);
                  const merma  = kgInj - kgMad;
                  const pctM   = kgInj > 0 ? (merma / kgInj * 100).toFixed(1) : '0.0';
                  return (
                    <div key={p.corte_nombre} style={{ color: '#555', marginBottom: 2 }}>
                      <b>{p.corte_nombre}</b>: {kgInj.toFixed(3)} → {kgMad.toFixed(3)} kg{' '}
                      <span style={{ color: merma > 0 ? '#e65100' : '#27ae60', fontWeight: 'bold' }}>
                        ({merma > 0 ? '-' : '+'}{Math.abs(merma).toFixed(3)} kg · {pctM}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: 8, padding: '10px 14px', color: '#e74c3c',
                fontSize: 13, marginBottom: 14
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalPesaje(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer', fontSize: 13
              }}>Cancelar</button>
              <button onClick={confirmarPesaje} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a1a2e,#2c3e50)',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 'bold'
              }}>
                {guardando ? 'Guardando...' : '✅ Confirmar pesaje → Stock Congelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Wizard CORTES — Separación Padre / Hijo ══ */}
      {modalCortesWizard && (() => {
        const { kgMad, costoTotal, corteNombrePadre, corteNombreHijo } = modalCortesWizard;
        const kgPadreN = parseFloat(cortesKgPadre) || 0;
        const kgHijoN  = kgPadreN > 0 ? parseFloat((kgMad - kgPadreN).toFixed(3)) : 0;
        const listoP1  = kgPadreN > 0 && kgPadreN < kgMad;

        let creditoHijo = 0, kgSpTotal = 0;
        cortesSpItems.forEach(sp => {
          const kg = parseFloat(sp.kg) || 0;
          kgSpTotal += kg;
          if (sp.tipo !== 'perdida') creditoHijo += kg * (parseFloat(sp.precio) || 0);
        });
        const kgFinalHijo     = Math.max(0, parseFloat((kgHijoN - kgSpTotal).toFixed(3)));
        const fracHijo        = kgMad > 0 ? kgHijoN / kgMad : 0;
        const costoBaseHijo   = costoTotal * fracHijo;
        const costoFinalHijo  = Math.max(0, costoBaseHijo - creditoHijo);
        const costoFinalPadre = costoTotal - costoBaseHijo;
        const cFinalPadre     = kgPadreN    > 0 ? costoFinalPadre / kgPadreN    : 0;
        const cFinalHijo      = kgFinalHijo > 0 ? costoFinalHijo  / kgFinalHijo : 0;

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', borderRadius: '16px 16px 0 0', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: 'white', fontWeight: 900, fontSize: 15 }}>✂️ Separación Padre / Hijo</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>Total madurado: {kgMad.toFixed(3)} kg · Paso {cortesWizardPaso}/2</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2].map(n => (
                    <div key={n} style={{ width: 28, height: 28, borderRadius: '50%', background: cortesWizardPaso >= n ? 'white' : 'rgba(255,255,255,0.3)', color: cortesWizardPaso >= n ? '#1a3a5c' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>{n}</div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 20 }}>
                {/* ── PASO 1: División kg ── */}
                {cortesWizardPaso === 1 && (
                  <>
                    <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: 14, fontSize: 14 }}>¿Cuántos kg se quedan como {corteNombrePadre}?</div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>👑 KG para {corteNombrePadre} (Padre)</label>
                      <input
                        type="number" min="0.001" max={kgMad - 0.001} step="0.001"
                        placeholder={`0 – ${kgMad.toFixed(3)}`}
                        value={cortesKgPadre}
                        onChange={e => { setCortesKgPadre(e.target.value); setErrorCortes(''); }}
                        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #1a3a5c', fontSize: 16, fontWeight: 'bold', boxSizing: 'border-box' }}
                        autoFocus
                      />
                    </div>

                    {listoP1 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#f0f8ff', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>👑 {corteNombrePadre}</div>
                          <div style={{ fontWeight: 900, color: '#1a3a5c', fontSize: 18 }}>{kgPadreN.toFixed(3)} kg</div>
                          <div style={{ fontSize: 11, color: '#27ae60' }}>${cFinalPadre.toFixed(4)}/kg</div>
                        </div>
                        <div style={{ background: '#f5f0ff', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>🔀 {corteNombreHijo || 'Hijo'}</div>
                          <div style={{ fontWeight: 900, color: '#6c3483', fontSize: 18 }}>{kgHijoN.toFixed(3)} kg</div>
                          <div style={{ fontSize: 11, color: '#27ae60' }}>${(kgMad > 0 ? (costoTotal - costoFinalPadre) / kgHijoN : 0).toFixed(4)}/kg</div>
                        </div>
                      </div>
                    )}

                    {errorCortes && <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '8px 12px', color: '#e74c3c', fontSize: 12, marginBottom: 10 }}>{errorCortes}</div>}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setModalCortesWizard(null)} style={{ flex: 1, padding: '11px', background: '#f0f2f5', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                      <button
                        onClick={() => {
                          if (!listoP1) { setErrorCortes('Ingresa un peso válido'); return; }
                          if (hijoCfgDeshuese && kgHijoN > 0) {
                            const items = [];
                            const mpResS   = mpsParaCortes.find(m => (m.nombre_producto || m.nombre || '').toLowerCase().includes('segunda'));
                            const mpPuntas = mpsParaCortes.find(m => (m.nombre_producto || m.nombre || '').toLowerCase().includes('puntas'));
                            if ((hijoCfgDeshuese.pct_res_segunda || 0) > 0)
                              items.push({ tipo: 'mp_con_valor', nombre: mpResS ? (mpResS.nombre_producto || mpResS.nombre) : 'Res Segunda', kg: String(+(kgHijoN * hijoCfgDeshuese.pct_res_segunda / 100).toFixed(3)), precio: mpResS ? String(mpResS.precio_kg) : '0', mp_id: mpResS?.id || null });
                            if ((hijoCfgDeshuese.pct_puntas || 0) > 0)
                              items.push({ tipo: 'mp_con_valor', nombre: mpPuntas ? (mpPuntas.nombre_producto || mpPuntas.nombre) : 'Puntas', kg: String(+(kgHijoN * hijoCfgDeshuese.pct_puntas / 100).toFixed(3)), precio: mpPuntas ? String(mpPuntas.precio_kg) : '0', mp_id: mpPuntas?.id || null });
                            if ((hijoCfgDeshuese.pct_desecho || 0) > 0)
                              items.push({ tipo: 'perdida', nombre: 'Desecho', kg: String(+(kgHijoN * hijoCfgDeshuese.pct_desecho / 100).toFixed(3)), precio: '0', mp_id: null });
                            if (items.length > 0) setCortesSpItems(items);
                          }
                          setCortesWizardPaso(2); setErrorCortes('');
                        }}
                        disabled={!listoP1}
                        style={{ flex: 2, padding: '11px', background: listoP1 ? 'linear-gradient(135deg,#1a3a5c,#2980b9)' : '#aaa', color: 'white', border: 'none', borderRadius: 10, cursor: listoP1 ? 'pointer' : 'default', fontSize: 13, fontWeight: 'bold' }}>
                        Siguiente → Sub-productos Hijo
                      </button>
                    </div>
                  </>
                )}

                {/* ── PASO 2: Deshuese del Hijo ── */}
                {cortesWizardPaso === 2 && (() => {
                  const mpResS   = mpsParaCortes.find(m => (m.nombre_producto||m.nombre||'').toLowerCase().includes('segunda'));
                  const mpPuntas = mpsParaCortes.find(m => (m.nombre_producto||m.nombre||'').toLowerCase().includes('puntas'));
                  const spResS    = cortesSpItems.find(s => (s.nombre||'').toLowerCase().includes('segunda'));
                  const spPuntas  = cortesSpItems.find(s => (s.nombre||'').toLowerCase().includes('puntas'));
                  const spDesecho = cortesSpItems.find(s => (s.nombre||'').toLowerCase().includes('desecho') || (s.tipo === 'perdida' && !(s.nombre||'').toLowerCase().includes('segunda') && !(s.nombre||'').toLowerCase().includes('puntas')));
                  const gResS    = spResS    ? +(parseFloat(spResS.kg   ||0)*1000).toFixed(1) : 0;
                  const gPuntas  = spPuntas  ? +(parseFloat(spPuntas.kg ||0)*1000).toFixed(1) : 0;
                  const gDesecho = spDesecho ? +(parseFloat(spDesecho.kg||0)*1000).toFixed(1) : 0;
                  const pResS    = parseFloat(mpResS?.precio_kg   || spResS?.precio   || 0);
                  const pPuntas  = parseFloat(mpPuntas?.precio_kg || spPuntas?.precio || 0);
                  const pctResS    = kgHijoN > 0 ? parseFloat(spResS?.kg   ||0)/kgHijoN*100 : 0;
                  const pctPuntas  = kgHijoN > 0 ? parseFloat(spPuntas?.kg ||0)/kgHijoN*100 : 0;
                  const pctDesecho = kgHijoN > 0 ? parseFloat(spDesecho?.kg||0)/kgHijoN*100 : 0;

                  const setGrams = (tipo, grams) => {
                    const kg = String(+(grams/1000).toFixed(3));
                    setCortesSpItems(prev => {
                      const idx = tipo === 'segunda'
                        ? prev.findIndex(s => (s.nombre||'').toLowerCase().includes('segunda'))
                        : tipo === 'puntas'
                          ? prev.findIndex(s => (s.nombre||'').toLowerCase().includes('puntas'))
                          : prev.findIndex(s => (s.nombre||'').toLowerCase().includes('desecho') || (s.tipo === 'perdida' && !(s.nombre||'').toLowerCase().includes('segunda') && !(s.nombre||'').toLowerCase().includes('puntas')));
                      if (idx >= 0) return prev.map((s,i) => i === idx ? {...s, kg} : s);
                      if (tipo === 'segunda') return [...prev, { tipo: 'mp_con_valor', nombre: mpResS ? (mpResS.nombre_producto||mpResS.nombre) : 'Res Segunda', kg, precio: String(pResS), mp_id: mpResS?.id||null }];
                      if (tipo === 'puntas')  return [...prev, { tipo: 'mp_con_valor', nombre: mpPuntas ? (mpPuntas.nombre_producto||mpPuntas.nombre) : 'Puntas', kg, precio: String(pPuntas), mp_id: mpPuntas?.id||null }];
                      return [...prev, { tipo: 'perdida', nombre: 'Desecho', kg, precio: '0', mp_id: null }];
                    });
                  };

                  const iStyle = (color) => ({ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${color}`, fontSize: 14, boxSizing: 'border-box', textAlign: 'right' });
                  return (
                  <>
                    <div style={{ fontWeight: 700, color: '#6c3483', marginBottom: 4, fontSize: 14 }}>🔀 Deshuese — {corteNombreHijo || 'Hijo'}</div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>KG disponibles para el hijo: {kgHijoN.toFixed(3)} kg</div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#1a6b3c', fontWeight: 600, display: 'block', marginBottom: 4 }}>Res Segunda (g)</label>
                        <input type="number" min="0" step="1" placeholder="0"
                          value={gResS > 0 ? gResS : ''}
                          onChange={e => setGrams('segunda', parseFloat(e.target.value)||0)}
                          style={iStyle('#27ae60')} />
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>= {pctResS.toFixed(1)}%</div>
                        <div style={{ fontSize: 10, color: '#888' }}>Precio: ${pResS.toFixed(4)}/kg</div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#e67e22', fontWeight: 600, display: 'block', marginBottom: 4 }}>Puntas (g)</label>
                        <input type="number" min="0" step="1" placeholder="0"
                          value={gPuntas > 0 ? gPuntas : ''}
                          onChange={e => setGrams('puntas', parseFloat(e.target.value)||0)}
                          style={iStyle('#e67e22')} />
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>= {pctPuntas.toFixed(1)}%</div>
                        <div style={{ fontSize: 10, color: '#888' }}>Precio: ${pPuntas.toFixed(4)}/kg</div>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#e74c3c', fontWeight: 600, display: 'block', marginBottom: 4 }}>Desecho (g)</label>
                        <input type="number" min="0" step="1" placeholder="0"
                          value={gDesecho > 0 ? gDesecho : ''}
                          onChange={e => setGrams('desecho', parseFloat(e.target.value)||0)}
                          style={iStyle('#e74c3c')} />
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>= {pctDesecho.toFixed(1)}%</div>
                      </div>
                    </div>

                    {/* Tabla distribución */}
                    <div style={{ background: '#f8f0ff', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6c3483', marginBottom: 8 }}>Distribución de {kgHijoN.toFixed(3)} kg entrada:</div>
                      {[
                        { nombre: spResS?.nombre||'Res Segunda', kg: parseFloat(spResS?.kg||0),    precio: pResS,   esCredito: true },
                        { nombre: spPuntas?.nombre||'Puntas',    kg: parseFloat(spPuntas?.kg||0),  precio: pPuntas, esCredito: true },
                        { nombre: 'Desecho',                     kg: parseFloat(spDesecho?.kg||0), precio: 0,       esCredito: false },
                      ].map(({ nombre, kg, precio, esCredito }) => (
                        <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(108,52,131,0.1)', fontSize: 12 }}>
                          <span style={{ color: '#333', minWidth: 80 }}>{nombre}</span>
                          <span style={{ fontWeight: 700, color: kg > 0 ? '#27ae60' : '#aaa' }}>{kg.toFixed(3)} kg</span>
                          <span style={{ color: esCredito ? '#27ae60' : '#aaa', fontSize: 11 }}>
                            {esCredito ? `× $${precio.toFixed(4)}/kg = $${(kg*precio).toFixed(4)} crédito` : 'sin valor'}
                          </span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, fontSize: 13 }}>
                        <span style={{ fontWeight: 800, color: '#6c3483' }}>🔀 {corteNombreHijo}</span>
                        <span style={{ fontWeight: 900, color: '#6c3483', fontSize: 16 }}>{kgFinalHijo.toFixed(3)} kg</span>
                        <span style={{ fontSize: 11, color: '#e74c3c' }}>
                          {kgHijoN > 0 ? ((kgHijoN-kgFinalHijo)/kgHijoN*100).toFixed(1) : '0.0'}% merma deshuese
                        </span>
                      </div>
                    </div>

                    {/* Resumen */}
                    <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#2c3e50)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 8, fontWeight: 'bold' }}>RESULTADO SEPARACIÓN</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>👑 {corteNombrePadre}</div>
                          <div style={{ color: '#7ec8f7', fontWeight: 900, fontSize: 16 }}>{kgPadreN.toFixed(3)} kg</div>
                          <div style={{ color: '#a9dfbf', fontSize: 11 }}>${cFinalPadre.toFixed(4)}/kg</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>🔀 {corteNombreHijo||'Hijo'}</div>
                          <div style={{ color: '#d7bde2', fontWeight: 900, fontSize: 16 }}>{kgFinalHijo.toFixed(3)} kg</div>
                          <div style={{ color: '#a9dfbf', fontSize: 11 }}>${cFinalHijo.toFixed(4)}/kg</div>
                        </div>
                      </div>
                      {creditoHijo > 0 && (
                        <div style={{ color: '#a9dfbf', fontSize: 11, marginTop: 8, textAlign: 'center' }}>Crédito sub-productos Hijo: −${creditoHijo.toFixed(4)}</div>
                      )}
                    </div>

                    {errorCortes && <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '8px 12px', color: '#e74c3c', fontSize: 12, marginBottom: 10 }}>{errorCortes}</div>}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setCortesWizardPaso(1)} style={{ flex: 1, padding: '11px', background: '#f0f2f5', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}>← Atrás</button>
                      <button onClick={confirmarSeparacionCortes} disabled={guardandoCortes}
                        style={{ flex: 2, padding: '11px', background: guardandoCortes ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)', color: 'white', border: 'none', borderRadius: 10, cursor: guardandoCortes ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                        {guardandoCortes ? '⏳ Guardando...' : '✅ Confirmar Separación'}
                      </button>
                    </div>
                  </>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Wizard retomar producción incompleta ── */}
      {wizardRetomar && (
        <WizardProduccionDinamica
          modo="momento1"
          bloques={wizardRetomar.bloques}
          bloquesHijo={wizardRetomar.bloquesHijo}
          cfg={wizardRetomar.cfg}
          kgInicial={wizardRetomar.kgInicial}
          precioCarne={wizardRetomar.precioCarne}
          currentUser={currentUser}
          mpsFormula={[]}
          esBano={wizardRetomar.esBano}
          savedLoteId={wizardRetomar.savedLoteId}
          savedFechaSalida={wizardRetomar.savedFechaSalida}
          onComplete={() => { setWizardRetomar(null); cargar(); }}
          onCancel={() => setWizardRetomar(null)}
        />
      )}

      {/* ── Wizard dinámico CORTES ── */}
      {wizardDinamico && (
        <WizardProduccionDinamica
          modo={wizardDinamico.modo}
          bloques={wizardDinamico.bloques}
          bloquesHijo={wizardDinamico.bloquesHijo}
          cfg={wizardDinamico.cfg}
          lote={wizardDinamico.lote}
          kgInicial={wizardDinamico.kgInicial}
          precioCarne={wizardDinamico.precioCarne}
          currentUser={currentUser}
          mpsFormula={wizardDinamico.mpsFormula || []}
          esBano={wizardDinamico.esBano || false}
          onComplete={() => { setWizardDinamico(null); cargar(); }}
          onCancel={() => setWizardDinamico(null)}
        />
      )}

    </div>
  );
}
