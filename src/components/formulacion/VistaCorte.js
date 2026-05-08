// VistaCorte.js — CORTES: Costos 1 kg | Pruebas | Producción | Historial
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';
import { BloquesDinamicosEditor, calcBloques } from './BloquesDinamicos';
import { useRealtime } from '../../hooks/useRealtime';

export default function VistaCorte({ producto, mobile, onAbrirInyeccion }) {
  const [tabActivo,       setTabActivo]       = useState('costos');
  const [cargando,        setCargando]        = useState(true);

  // Data
  const [mpVinculada,     setMpVinculada]     = useState(null);
  const [lotesStock,      setLotesStock]      = useState([]);
  const [historialInj,    setHistorialInj]    = useState([]);
  const [mpsEmpaque,      setMpsEmpaque]      = useState([]);
  const [mpsEtiqueta,     setMpsEtiqueta]     = useState([]);

  // Padre/Hijo
  const [tipo,            setTipo]            = useState(null); // 'padre' | 'hijo' | 'independiente'
  const [deshueseConfig,  setDeshueseConfig]  = useState(null);
  const [padreInfo,       setPadreInfo]       = useState(null);
  const [padreCfg,        setPadreCfg]        = useState(null); // config guardada del producto padre

  // Precios subproductos
  const [precioResSegunda, setPrecioResSegunda] = useState(0);
  const [precioPuntas,     setPrecioPuntas]     = useState(0);

  // Config persistida
  const [versiones,     setVersiones]     = useState([]);
  const [guardando,     setGuardando]     = useState(false);
  const [modoEdicion,   setModoEdicion]   = useState(false);
  const [configExiste,  setConfigExiste]  = useState(false);
  const [modalVer,      setModalVer]      = useState(false);
  const [verDetalle,    setVerDetalle]    = useState(null);
  const [autoGuardando, setAutoGuardando] = useState(false);

  // Config inputs — padre
  const [pctInj,     setPctInj]     = useState('');
  const [pctMad,     setPctMad]     = useState('');
  const [horasMad,   setHorasMad]   = useState('72');
  const [minutosMad, setMinutosMad] = useState('0');
  const [kgSalBase,  setKgSalBase]  = useState('2');
  const [mpCarneId,  setMpCarneId]  = useState(''); // solo para hijo (panel padre)
  const [mpsCarneOpts, setMpsCarneOpts] = useState([]); // solo para hijo (panel padre)

  // Config inputs — hijo
  const [costoMadPadre,  setCostoMadPadre]  = useState('');
  const [kgEntrada,      setKgEntrada]      = useState('100');
  const [pctResSegunda,  setPctResSegunda]  = useState('');
  const [pctPuntas,      setPctPuntas]      = useState('');
  const [pctDesecho,     setPctDesecho]     = useState('');

  // Pruebas — múltiples filas
  const [pruebaFilas,       setPruebaFilas]       = useState([{ id: '1', kg: '', emp_id: '', eti_id: '' }]);
  const [pruebasModoEdit,   setPruebasModoEdit]   = useState(false);

  // Formulaciones salmuera
  const [formulaciones,         setFormulaciones]         = useState([]);
  const [formulaSalmueraNombre, setFormulaSalmueraNombre] = useState('');
  const [formulaSalmueraIngs,   setFormulaSalmueraIngs]   = useState([]);
  const [pctSalmueraFormula,    setPctSalmueraFormula]    = useState(null);
  const [mpsFormula,            setMpsFormula]            = useState([]);
  // Rub (fórmula)
  const [rubFormulas,        setRubFormulas]        = useState([]);
  const [formulaRubNombre,   setFormulaRubNombre]   = useState('');
  const [kgRubBase,          setKgRubBase]          = useState('1');
  const [costoRubFormula,    setCostoRubFormula]    = useState(0);
  // Adicional (Mostaza u otro MP)
  const [mpAdicionalId,      setMpAdicionalId]      = useState('');
  const [gramosAdicional,    setGramosAdicional]    = useState('');
  const [kgSalidaMad,       setKgSalidaMad]       = useState('');
  const [kgParaHijo,        setKgParaHijo]        = useState('');
  const [margenPadre,       setMargenPadre]       = useState('15');
  const [margenHijo,        setMargenHijo]        = useState('15');

  // ── Flujo dinámico de bloques ──────────────────────────────
  const [bloques,              setBloques]              = useState(null); // null = flujo clásico padre
  const [bloqueExpandido,      setBloqueExpandido]      = useState(null);
  const [bloquesHijo,          setBloquesHijo]          = useState(null); // null = deshuese clásico
  const [bloqueExpandidoHijo,  setBloqueExpandidoHijo]  = useState(null);

  // Compat legacy (no se usan en UI pero se mantienen por si hay config guardada antigua)
  const [pctRub,             setPctRub]             = useState('');
  const [costoRubKg,         setCostoRubKg]         = useState('');

  // Cierre Sierra
  const [cierreFecha,          setCierreFecha]          = useState(new Date().toISOString().split('T')[0]);
  const [cierreKgHueso,        setCierreKgHueso]        = useState('');
  const [cierreKgAserrin,      setCierreKgAserrin]      = useState('');
  const [cierrePrecioAserrin,  setCierrePrecioAserrin]  = useState('');
  const [cierreKgCarnudo,      setCierreKgCarnudo]      = useState('');
  const [cierrePrecioCarnudo,  setCierrePrecioCarnudo]  = useState('');
  const [cierreNotas,          setCierreNotas]          = useState('');
  const [historicoCierres,     setHistoricoCierres]     = useState([]);
  const [guardandoCierre,      setGuardandoCierre]      = useState(false);
  const [errorCierre,          setErrorCierre]          = useState('');
  const [kgCortesDia,          setKgCortesDia]          = useState(0);

  // Producción — datos enriquecidos para tab
  const [lotsDetail,    setLotsDetail]    = useState({});
  const [companionSplit, setCompanionSplit] = useState({ hijoLotes: [], padreLotes: [] });

  useEffect(() => { setConfigExiste(false); cargarTodo(); }, [producto.nombre, producto.mp_vinculado_id]);
  useRealtime(['formulaciones', 'config_productos', 'deshuese_config', 'materias_primas', 'stock_lotes_inyectados', 'lotes_maduracion', 'produccion_inyeccion_cortes', 'vista_horneado_config', 'cierre_sierra_diario'], cargarTodo);

  useEffect(() => {
    if (!formulaSalmueraNombre || mpsFormula.length === 0) {
      setFormulaSalmueraIngs([]);
      setPctSalmueraFormula(null);
      return;
    }
    (async () => {
      const [{ data: rows }, { data: cfgSal }] = await Promise.all([
        supabase.from('formulaciones').select('ingrediente_nombre,gramos,materia_prima_id')
          .eq('producto_nombre', formulaSalmueraNombre),
        supabase.from('config_productos').select('porcentaje_salmuera')
          .eq('producto_nombre', formulaSalmueraNombre).maybeSingle(),
      ]);
      const ings = (rows || []).map(r => {
        const mp = mpsFormula.find(m => m.id === r.materia_prima_id)
          || mpsFormula.find(m => (m.nombre_producto||m.nombre||'').toLowerCase() === (r.ingrediente_nombre||'').toLowerCase());
        return {
          nombre: r.ingrediente_nombre,
          gramos: parseFloat(r.gramos) || 0,
          precioKg: parseFloat(mp?.precio_kg || 0),
          costo: (parseFloat(r.gramos) / 1000) * parseFloat(mp?.precio_kg || 0),
        };
      });
      setFormulaSalmueraIngs(ings);
      const pctSal = cfgSal?.porcentaje_salmuera != null ? parseFloat(cfgSal.porcentaje_salmuera) : null;
      setPctSalmueraFormula(pctSal);
      if (pctSal != null) setPctInj(String(pctSal));
    })();
  }, [formulaSalmueraNombre, mpsFormula]);

  useEffect(() => {
    if (!formulaRubNombre || mpsFormula.length === 0) { setCostoRubFormula(0); return; }
    (async () => {
      const { data: rows } = await supabase.from('formulaciones')
        .select('gramos,materia_prima_id').eq('producto_nombre', formulaRubNombre);
      setCostoRubFormula((rows||[]).reduce((s, r) => {
        const mp = mpsFormula.find(m => m.id === r.materia_prima_id);
        return s + (parseFloat(r.gramos) / 1000) * parseFloat(mp?.precio_kg || 0);
      }, 0));
    })();
  }, [formulaRubNombre, mpsFormula]);

  // Sync automático del padre: visibilitychange + polling cada 20s + realtime
  useEffect(() => {
    if (tipo !== 'hijo' || !deshueseConfig?.corte_padre) return;

    // 1. Realtime (funciona si la tabla tiene Realtime habilitado en Supabase)
    const padreNombreLow = (deshueseConfig.corte_padre || '').toLowerCase().trim();
    const channel = supabase
      .channel(`padre-config-${producto.nombre}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vista_horneado_config' },
        payload => {
          const rowNombre = (payload.new?.producto_nombre || '').toLowerCase().trim();
          if (rowNombre === padreNombreLow && payload.new?.config) setPadreCfg(payload.new.config);
        })
      .subscribe();

    // 2. Al volver a la pestaña/ventana — recarga inmediata
    const onFocus = () => { if (!document.hidden) recargarConfigPadre(); };
    document.addEventListener('visibilitychange', onFocus);

    // 3. Polling cada 20s como respaldo
    const interval = setInterval(() => recargarConfigPadre(), 20000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(interval);
    };
  }, [tipo, deshueseConfig, producto.nombre]);

  async function cargarTodo() {
    setCargando(true);
    try {
      // 1. Detectar padre/hijo — eq exacto (ilike con espacios rompe PostgREST URL), sin filtro activo
      const [{ data: asPadre }, { data: asHijo }] = await Promise.all([
        supabase.from('deshuese_config').select('*').eq('corte_padre', producto.nombre).limit(3),
        supabase.from('deshuese_config').select('*').eq('corte_hijo',  producto.nombre).limit(3),
      ]);
      const esPadre = (asPadre || []).length > 0;
      const esHijo  = (asHijo  || []).length > 0;
      const tipoDetectado = esPadre ? 'padre' : esHijo ? 'hijo' : 'independiente';
      setTipo(tipoDetectado);
      const cfgEntry = esPadre ? (asPadre || [])[0] : (asHijo || [])[0];
      setDeshueseConfig(cfgEntry || null);

      // 2. MP vinculada
      if (producto.mp_vinculado_id) {
        const { data: mp } = await supabase.from('materias_primas').select('*').eq('id', producto.mp_vinculado_id).single();
        setMpVinculada(mp || null);
      } else {
        const { data: mps } = await supabase.from('materias_primas').select('*').ilike('nombre_producto', `%${producto.nombre}%`).limit(1);
        setMpVinculada((mps || [])[0] || null);
      }

      // 3. Lotes stock
      const { data: lotes } = await supabase
        .from('stock_lotes_inyectados').select('*')
        .ilike('corte_nombre', `%${producto.nombre}%`)
        .order('fecha_entrada', { ascending: false }).limit(30);
      let allLotes = lotes || [];

      // Fallback hijo: si no encontró nada y es hijo, buscar via parent_lote_id del padre
      if (allLotes.length === 0 && !esPadre && cfgEntry?.corte_padre) {
        const { data: padreLotesQ } = await supabase
          .from('stock_lotes_inyectados').select('lote_id')
          .ilike('corte_nombre', `%${cfgEntry.corte_padre}%`)
          .eq('tipo_corte', 'padre').order('fecha_entrada', { ascending: false }).limit(20);
        if ((padreLotesQ || []).length > 0) {
          const { data: hijoFallback } = await supabase
            .from('stock_lotes_inyectados').select('*')
            .in('parent_lote_id', padreLotesQ.map(l => l.lote_id))
            .order('fecha_entrada', { ascending: false });
          allLotes = hijoFallback || [];
        }
      }
      setLotesStock(allLotes);

      // Enriquecer con datos de maduración + lotes compañero (padre↔hijo)
      {
        const madIds = [...new Set(allLotes.map(l => l.lote_maduracion_id).filter(Boolean))];
        const padreLoteIds = allLotes.filter(l => l.tipo_corte === 'padre').map(l => l.lote_id).filter(Boolean);
        const hijoMadIds  = allLotes.filter(l => l.tipo_corte === 'hijo').map(l => l.lote_maduracion_id).filter(Boolean);
        const [{ data: madRows }, { data: hijoRows }, { data: padreRows }] = await Promise.all([
          madIds.length > 0
            ? supabase.from('lotes_maduracion')
                .select('id, bloques_resultado, produccion_inyeccion(kg_carne_total, porcentaje_inyeccion, produccion_inyeccion_cortes(corte_nombre, kg_carne_cruda, kg_salmuera_asignada))')
                .in('id', madIds)
            : Promise.resolve({ data: [] }),
          padreLoteIds.length > 0
            ? supabase.from('stock_lotes_inyectados').select('*').in('parent_lote_id', padreLoteIds)
            : Promise.resolve({ data: [] }),
          hijoMadIds.length > 0
            ? supabase.from('stock_lotes_inyectados').select('*').in('lote_maduracion_id', hijoMadIds).eq('tipo_corte', 'padre')
            : Promise.resolve({ data: [] }),
        ]);
        const madMap = {};
        (madRows || []).forEach(m => { madMap[m.id] = m; });
        setLotsDetail(madMap);
        setCompanionSplit({ hijoLotes: hijoRows || [], padreLotes: padreRows || [] });
      }

      // 4. Historial inyección
      let qInj = supabase
        .from('produccion_inyeccion_cortes')
        .select('*, produccion_inyeccion(fecha, formula_salmuera, estado, porcentaje_inyeccion)')
        .order('created_at', { ascending: false }).limit(20);
      qInj = producto.mp_vinculado_id
        ? qInj.eq('materia_prima_id', producto.mp_vinculado_id)
        : qInj.eq('corte_nombre', producto.nombre);
      const { data: injData } = await qInj;
      setHistorialInj(injData || []);

      // 5. Si es hijo → buscar costo_mad_kg del padre
      let encontroPadreReal = false;
      if (esHijo && cfgEntry?.corte_padre) {
        const { data: padreL } = await supabase
          .from('stock_lotes_inyectados').select('costo_mad_kg, lote_id, fecha_entrada')
          .ilike('corte_nombre', `%${cfgEntry.corte_padre}%`)
          .gt('costo_mad_kg', 0)
          .order('fecha_entrada', { ascending: false }).limit(1);
        if ((padreL || []).length > 0) {
          encontroPadreReal = true;
          setPadreInfo(padreL[0]);
          setCostoMadPadre(parseFloat(padreL[0].costo_mad_kg).toFixed(4));
        }
      }

      // 6. Precios Res Segunda + Puntas (queries separadas para evitar .or() con espacios)
      const [{ data: mpSegunda }, { data: mpPuntas }] = await Promise.all([
        supabase.from('materias_primas').select('nombre,nombre_producto,precio_kg').ilike('nombre_producto', '%segunda%').eq('eliminado', false).limit(3),
        supabase.from('materias_primas').select('nombre,nombre_producto,precio_kg').ilike('nombre_producto', '%puntas%').eq('eliminado', false).limit(3),
      ]);
      const resS = (mpSegunda || [])[0];
      const punt = (mpPuntas  || [])[0];
      if (resS) setPrecioResSegunda(parseFloat(resS.precio_kg || 0));
      if (punt) setPrecioPuntas(parseFloat(punt.precio_kg || 0));

      // 7. Empaque / Etiqueta
      const { data: mpsAll } = await supabase.from('materias_primas')
        .select('id, nombre, nombre_producto, precio_kg, categoria')
        .or('categoria.ilike.%empaque%,categoria.ilike.%etiqueta%,categoria.ilike.%funda%')
        .eq('eliminado', false);
      if (mpsAll) {
        setMpsEmpaque((mpsAll || []).filter(m => {
          const cat = (m.categoria || '').toUpperCase();
          return cat.includes('EMPAQUE') || cat.includes('ENVASE') || cat.includes('FUNDA');
        }));
        setMpsEtiqueta((mpsAll || []).filter(m => (m.categoria || '').toUpperCase().includes('ETIQUETA')));
      }

      // 8. Config guardada
      const { data: cfg } = await supabase
        .from('vista_horneado_config').select('*')
        .eq('producto_nombre', producto.nombre).maybeSingle();
      if (cfg) {
        setConfigExiste(true);
        setVersiones(cfg.versiones || []);
        const c = cfg.config || {};
        if (c.pct_inj)        setPctInj(String(c.pct_inj));
        if (c.pct_mad)        setPctMad(String(c.pct_mad));
        if (c.pct_res_segunda) setPctResSegunda(String(c.pct_res_segunda));
        if (c.pct_puntas)     setPctPuntas(String(c.pct_puntas));
        if (c.pct_desecho)    setPctDesecho(String(c.pct_desecho));
        // costo_mad_padre: solo usar si no encontramos info real del padre
        if (c.costo_mad_padre && !encontroPadreReal) setCostoMadPadre(String(c.costo_mad_padre));
        if (c.formula_salmuera) setFormulaSalmueraNombre(c.formula_salmuera);
        if (c.pct_rub)          setPctRub(String(c.pct_rub));
        if (c.costo_rub_kg)     setCostoRubKg(String(c.costo_rub_kg));
        if (c.horas_mad   !== undefined) setHorasMad(String(c.horas_mad));
        if (c.minutos_mad !== undefined) setMinutosMad(String(c.minutos_mad));
        if (c.kg_sal_base !== undefined) setKgSalBase(String(c.kg_sal_base));
        if (c.formula_rub)              setFormulaRubNombre(c.formula_rub);
        if (c.kg_rub_base !== undefined) setKgRubBase(String(c.kg_rub_base));
        if (c.mp_adicional_id)          setMpAdicionalId(c.mp_adicional_id);
        if (c.gramos_adicional !== undefined) setGramosAdicional(String(c.gramos_adicional));
        if (c.mp_carne_id) setMpCarneId(c.mp_carne_id);
        if (c.kg_salida_mad) setKgSalidaMad(String(c.kg_salida_mad));
        if (c.kg_para_hijo)  setKgParaHijo(String(c.kg_para_hijo));
        if (c.margen_padre !== undefined) setMargenPadre(String(c.margen_padre));
        if (c.margen_hijo  !== undefined) setMargenHijo(String(c.margen_hijo));
        if (c.bloques && Array.isArray(c.bloques)) setBloques(c.bloques);
        if (c.bloques_hijo && Array.isArray(c.bloques_hijo)) setBloquesHijo(c.bloques_hijo);
      }

      // Formulaciones SALMUERAS + todas las MPs + config del padre (si es hijo)
      const [{ data: prodsSal }, { data: prodsRub }, { data: allMps }] = await Promise.all([
        supabase.from('productos').select('nombre,categoria')
          .or('categoria.ilike.%salmuera%,nombre.ilike.%salmuera%')
          .eq('estado', 'ACTIVO').order('nombre'),
        supabase.from('productos').select('nombre')
          .or('nombre.ilike.%rub%,categoria.ilike.%rub%,categoria.ilike.%especia%')
          .eq('estado', 'ACTIVO').order('nombre'),
        supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg,categoria').eq('eliminado', false),
        Promise.resolve({ data: null }), // placeholder — padre se carga abajo por separado
      ]);
      setFormulaciones((prodsSal||[]).map(p => p.nombre));
      setRubFormulas((prodsRub||[]).map(p => p.nombre));

      // Buscar config del padre (hijo): match exacto case-insensitive por nombre canónico
      if (!esPadre && cfgEntry?.corte_padre) {
        const { data: padreActivo } = await supabase.from('productos')
          .select('id').eq('nombre', cfgEntry.corte_padre).eq('estado', 'ACTIVO').limit(1);
        if ((padreActivo || []).length === 0) {
          setPadreCfg(null);
        } else {
          const { data: padreRows } = await supabase.from('vista_horneado_config')
            .select('config,producto_nombre')
            .ilike('producto_nombre', cfgEntry.corte_padre)
            .limit(5);
          const padreNombreLow = (cfgEntry.corte_padre || '').toLowerCase().trim();
          const match = (padreRows || []).find(r =>
            (r.producto_nombre || '').toLowerCase().trim() === padreNombreLow && r.config
          );
          setPadreCfg(match?.config || null);
        }
      }
      setMpsFormula(allMps || []);
      // MPs de carne: categorías típicas de carne bovina
      const carneOpts = (allMps||[]).filter(m => {
        const cat = (m.categoria||'').toUpperCase();
        return cat.includes('CARNE') || cat.includes('RES') || cat.includes('CORTE') || cat.includes('BOVINO');
      });
      setMpsCarneOpts(carneOpts.length > 0 ? carneOpts : (allMps||[]).filter(m => !(m.categoria||'').toUpperCase().includes('EMPAQUE') && !(m.categoria||'').toUpperCase().includes('ETIQUETA') && !(m.categoria||'').toUpperCase().includes('SALMUERA')));

      // Cierres sierra
      const { data: cierres } = await supabase
        .from('cierre_sierra_diario').select('*').order('fecha', { ascending: false }).limit(30);
      setHistoricoCierres(cierres || []);
    } catch (e) {
      console.error('VistaCorte cargarTodo:', e);
    }
    setCargando(false);
  }

  async function guardarConfig() {
    setGuardando(true);
    const newConfig = {
      pct_inj:         parseFloat(pctInj)         || 0,
      pct_mad:         parseFloat(pctMad)          || 0,
      pct_res_segunda: parseFloat(pctResSegunda)   || 0,
      pct_puntas:      parseFloat(pctPuntas)        || 0,
      pct_desecho:     parseFloat(pctDesecho)       || 0,
      costo_mad_padre: parseFloat(costoMadPadre)   || 0,
      formula_salmuera:  formulaSalmueraNombre        || '',
      horas_mad:         parseFloat(horasMad)        || 0,
      minutos_mad:       parseFloat(minutosMad)      || 0,
      kg_sal_base:       parseFloat(kgSalBase)       || 1,
      formula_rub:       formulaRubNombre            || '',
      kg_rub_base:       parseFloat(kgRubBase)       || 1,
      mp_adicional_id:   mpAdicionalId               || '',
      gramos_adicional:  parseFloat(gramosAdicional) || 0,
      mp_carne_id:       mpCarneId                   || '',
      kg_salida_mad:     parseFloat(kgSalidaMad)    || 0,
      kg_para_hijo:      parseFloat(kgParaHijo)     || 0,
      margen_padre:      parseFloat(margenPadre)   || 15,
      margen_hijo:       parseFloat(margenHijo)    || 15,
      c_mad_real: (() => {
        const pctInjN   = parseFloat(pctInj) || 0;
        const kgIni     = parseFloat(kgSalBase) || 2;
        const kgRubN    = parseFloat(kgRubBase) || 1;
        const costoRubK = kgRubN > 0 ? costoRubFormula / kgRubN : 0;
        const mpAdic    = mpAdicionalId ? mpsFormula.find(m => String(m.id) === mpAdicionalId) : null;
        const costoAdic = (parseFloat(gramosAdicional) / 1000) * parseFloat(mpAdic?.precio_kg || 0);
        const carne     = parseFloat(mpVinculada?.precio_kg || 0);
        const CI        = carne + (pctInjN / 100) * precioKgSalmuera + costoRubK + costoAdic;
        const kgSal     = parseFloat(kgSalidaMad) || 0;
        return kgSal > 0 ? (CI * kgIni) / kgSal : 0;
      })(),
      ...(bloques !== null ? (() => {
        const mpAdic = mpAdicionalId ? mpsFormula.find(m => String(m.id) === mpAdicionalId) : null;
        const res = calcBloques({
          bloques,
          kgIni:            parseFloat(kgSalBase) || 2,
          precioCarne:      parseFloat(mpVinculada?.precio_kg || 0),
          precioKgSalmuera,
          costoRubFormula,
          kgRubBase:        parseFloat(kgRubBase) || 1,
          mpAdic,
        });
        return { bloques, pasos_flujo: res.pasos, c_mad_real: res.costoKgFinal };
      })() : {}),
      ...(bloquesHijo !== null ? { bloques_hijo: bloquesHijo } : {}),
      tipo,
      _categoria:      'CORTES',
      _updated:        new Date().toISOString(),
    };
    try {
      const payload = { producto_nombre: producto.nombre, config: newConfig, versiones };
      console.log('[guardarConfig] upsert payload:', payload);
      const { data: saved, error } = await supabase.from('vista_horneado_config')
        .upsert(payload, { onConflict: 'producto_nombre' })
        .select();
      console.log('[guardarConfig] result:', { saved, error });
      if (error) throw error;
      if (!saved || saved.length === 0) throw new Error('El servidor no confirmó el guardado (RLS o constraint)');
      setConfigExiste(true);
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    }
    setGuardando(false);
  }

  // ── Inicializar flujo dinámico desde config clásica ───────
  function initBloques() {
    const newId = () => Math.random().toString(36).slice(2, 9);
    setBloques([
      {
        id: newId(), tipo: 'inyeccion', activo: true,
        formula_salmuera: formulaSalmueraNombre || '',
        pct_inj:    parseFloat(pctInj)     || 20,
        kg_sal_base: parseFloat(kgSalBase) || 2,
      },
      {
        id: newId(), tipo: 'maduracion', activo: true,
        horas_mad:    parseFloat(horasMad)    || 72,
        minutos_mad:  parseFloat(minutosMad)  || 0,
        pct_mad:      parseFloat(pctMad)      || 0,
        kg_salida_mad: parseFloat(kgSalidaMad) || 0,
      },
      {
        id: newId(), tipo: 'rub', activo: !!(formulaRubNombre),
        formula_rub: formulaRubNombre || '',
        kg_rub_base: parseFloat(kgRubBase) || 1,
      },
      {
        id: newId(), tipo: 'adicional', activo: !!(mpAdicionalId),
        mp_adicional_id:  mpAdicionalId || '',
        gramos_adicional: parseFloat(gramosAdicional) || 0,
      },
      {
        id: newId(), tipo: 'bifurcacion', activo: !!(deshueseConfig),
        kg_para_hijo: parseFloat(kgParaHijo) || 0,
        margen_padre: parseFloat(margenPadre) || 15,
        margen_hijo:  parseFloat(margenHijo)  || 15,
        deshuese_hijo: {
          pct_res_segunda: parseFloat(pctResSegunda) || 0,
          pct_puntas:      parseFloat(pctPuntas)     || 0,
          pct_desecho:     parseFloat(pctDesecho)    || 0,
        },
      },
    ]);
    setBloqueExpandido(null);
  }

  async function fijarCambios() {
    await guardarConfig();
    setModoEdicion(false);
  }

  async function recargarConfigPadre() {
    if (!deshueseConfig?.corte_padre) return;
    const { data: padreActivo } = await supabase.from('productos')
      .select('id').eq('nombre', deshueseConfig.corte_padre).eq('estado', 'ACTIVO').limit(1);
    if ((padreActivo || []).length === 0) { setPadreCfg(null); return; }
    const { data: padreRows } = await supabase.from('vista_horneado_config')
      .select('config,producto_nombre')
      .ilike('producto_nombre', deshueseConfig.corte_padre)
      .limit(5);
    const padreNombreLow = (deshueseConfig.corte_padre || '').toLowerCase().trim();
    const match = (padreRows || []).find(r =>
      (r.producto_nombre || '').toLowerCase().trim() === padreNombreLow && r.config
    );
    setPadreCfg(match?.config || null);
  }

  function initBloquesHijo() {
    const newId = () => Math.random().toString(36).slice(2, 9);
    const bloques = [];
    if (parseFloat(pctResSegunda) > 0) bloques.push({ id: newId(), tipo: 'merma', activo: true, merma_tipo: 2, pct_merma: parseFloat(pctResSegunda) || 10, precio_merma_kg: precioResSegunda || 0, nombre_merma: 'Res Segunda', mp_merma_id: '' });
    if (parseFloat(pctPuntas) > 0)     bloques.push({ id: newId(), tipo: 'merma', activo: true, merma_tipo: 2, pct_merma: parseFloat(pctPuntas)     || 20, precio_merma_kg: precioPuntas    || 0, nombre_merma: 'Puntas',     mp_merma_id: '' });
    if (parseFloat(pctDesecho) > 0)    bloques.push({ id: newId(), tipo: 'merma', activo: true, merma_tipo: 1, pct_merma: parseFloat(pctDesecho)    || 10, precio_merma_kg: 0,                   nombre_merma: 'Desecho',    mp_merma_id: '' });
    if (bloques.length === 0) bloques.push({ id: newId(), tipo: 'merma', activo: true, merma_tipo: 1, pct_merma: 10, precio_merma_kg: 0, nombre_merma: '', mp_merma_id: '' });
    setBloquesHijo(bloques);
  }

  async function guardarHistorial() {
    setAutoGuardando(true);
    const totalGrF   = formulaSalmueraIngs.reduce((s,i) => s + i.gramos, 0);
    const totalCostF = formulaSalmueraIngs.reduce((s,i) => s + i.costo,  0);
    const pkgSal     = totalGrF > 0 ? totalCostF / (totalGrF / 1000) : 0;
    const snap = {
      tipo: 'formula',
      fecha: new Date().toISOString().split('T')[0],
      tipo_corte: tipo,
      pct_inj:         parseFloat(pctInj)         || 0,
      pct_mad:         parseFloat(pctMad)          || 0,
      formula_salmuera: formulaSalmueraNombre       || '',
      pct_rub:         parseFloat(pctRub)          || 0,
      costo_rub_kg:    parseFloat(costoRubKg)      || 0,
      horas_mad:       parseFloat(horasMad)        || 0,
      minutos_mad:     parseFloat(minutosMad)      || 0,
      mp_carne_id:     mpCarneId                   || '',
      precio_kg_salmuera: pkgSal,
      pct_res_segunda: parseFloat(pctResSegunda)   || 0,
      pct_puntas:      parseFloat(pctPuntas)        || 0,
      pct_desecho:     parseFloat(pctDesecho)       || 0,
    };
    const nuevasVer = [snap, ...versiones].slice(0, 20);
    try {
      const { error } = await supabase.from('vista_horneado_config')
        .upsert(
          { producto_nombre: producto.nombre, versiones: nuevasVer },
          { onConflict: 'producto_nombre' }
        );
      if (error) throw error;
      setVersiones(nuevasVer);
    } catch (e) {
      alert('Error al guardar historial: ' + e.message);
    }
    setAutoGuardando(false);
  }

  function restaurarVersion(v) {
    if (v.tipo === 'prueba') {
      const filas = (v.fundas || (v.gramos_funda ? [{ kg: v.gramos_funda, emp_id: v.emp_id || '', eti_id: v.eti_id || '' }] : []))
        .map((f, j) => ({ id: String(Date.now() + j), kg: String(f.kg), emp_id: f.emp_id || '', eti_id: f.eti_id || '' }));
      setPruebaFilas(filas.length > 0 ? filas : [{ id: '1', kg: '', emp_id: '', eti_id: '' }]);
      setModalVer(false);
      return;
    }
    if (v.pct_inj          !== undefined) setPctInj(String(v.pct_inj));
    if (v.pct_mad          !== undefined) setPctMad(String(v.pct_mad));
    if (v.formula_salmuera)               setFormulaSalmueraNombre(v.formula_salmuera);
    if (v.pct_rub          !== undefined) setPctRub(String(v.pct_rub));
    if (v.costo_rub_kg     !== undefined) setCostoRubKg(String(v.costo_rub_kg));
    if (v.pct_res_segunda  !== undefined) setPctResSegunda(String(v.pct_res_segunda));
    if (v.pct_puntas       !== undefined) setPctPuntas(String(v.pct_puntas));
    if (v.pct_desecho      !== undefined) setPctDesecho(String(v.pct_desecho));
    if (v.horas_mad        !== undefined) setHorasMad(String(v.horas_mad));
    if (v.minutos_mad      !== undefined) setMinutosMad(String(v.minutos_mad));
    if (v.mp_carne_id)                    setMpCarneId(v.mp_carne_id);
    setModalVer(false);
    setModoEdicion(true);
  }

  async function eliminarVersionCorte(idxEnFormula) {
    if (!window.confirm('¿Eliminar esta versión?')) return;
    const versionesFormula = versiones.filter(v => v.tipo === 'formula');
    const vToDelete = versionesFormula[idxEnFormula];
    const nuevas = versiones.filter(v => v !== vToDelete);
    try {
      const { error } = await supabase.from('vista_horneado_config')
        .upsert({ producto_nombre: producto.nombre, versiones: nuevas }, { onConflict: 'producto_nombre' });
      if (error) throw error;
      setVersiones(nuevas);
      setVerDetalle(null);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function guardarVersionPrueba() {
    const cBase = getCFinal();
    const fundas = pruebaFilas
      .filter(f => parseFloat(f.kg) > 0)
      .map(f => {
        const empMp = mpsEmpaque.find(m => String(m.id) === f.emp_id);
        const etiMp = mpsEtiqueta.find(m => String(m.id) === f.eti_id);
        const cEmp = parseFloat(empMp?.precio_kg || 0);
        const cEti = parseFloat(etiMp?.precio_kg || 0);
        const kg   = parseFloat(f.kg);
        return { kg, emp_id: f.emp_id || null, emp_nombre: empMp ? (empMp.nombre_producto || empMp.nombre) : null, eti_id: f.eti_id || null, eti_nombre: etiMp ? (etiMp.nombre_producto || etiMp.nombre) : null, c_carne: kg * cBase, c_emp: cEmp, c_eti: cEti, c_total: kg * cBase + cEmp + cEti };
      });
    if (fundas.length === 0) return;
    const nuevaVer = {
      tipo: 'prueba',
      fundas,
      c_base: cBase,
      fecha: new Date().toISOString().split('T')[0],
      // campos legacy para mostrar en versiones antiguas
      gramos_funda: fundas[0].kg,
      c_total: fundas[0].c_total,
    };
    const nuevasVersiones = [nuevaVer, ...versiones].slice(0, 10);
    const { data: existing } = await supabase
      .from('vista_horneado_config').select('id')
      .eq('producto_nombre', producto.nombre).maybeSingle();
    if (existing) {
      await supabase.from('vista_horneado_config').update({ versiones: nuevasVersiones }).eq('id', existing.id);
    } else {
      await supabase.from('vista_horneado_config')
        .insert({ producto_nombre: producto.nombre, producto_id: producto.id, config: {}, versiones: nuevasVersiones });
    }
    setVersiones(nuevasVersiones);
  }

  function computeCLimpio() {
    const cMadP  = padreCfg?.c_mad_real > 0 ? padreCfg.c_mad_real : (parseFloat(costoMadPadre) || 0);
    const kgEnt  = padreCfg?.kg_para_hijo > 0 ? padreCfg.kg_para_hijo : (parseFloat(kgEntrada) || 0);
    const costoEntrada = kgEnt * cMadP;

    // Flujo dinámico hijo
    if (bloquesHijo !== null && Array.isArray(bloquesHijo)) {
      const mpAdic = mpAdicionalId ? mpsFormula.find(m => String(m.id) === mpAdicionalId) : null;
      const totalGrH   = formulaSalmueraIngs.reduce((s,i) => s + i.gramos, 0);
      const totalCosH  = formulaSalmueraIngs.reduce((s,i) => s + i.costo,  0);
      const pKgSalH    = totalGrH > 0 ? totalCosH / (totalGrH / 1000) : 0;
      const res = calcBloques({
        bloques: bloquesHijo,
        kgIni: kgEnt,
        precioCarne: cMadP,
        precioKgSalmuera: pKgSalH,
        costoRubFormula,
        kgRubBase: parseFloat(kgRubBase) || 1,
        mpAdic,
      });
      return {
        cMadP, kgEnt, kgHijo: res.kg, costoEntrada,
        kgResS: 0, kgPun: 0, kgDes: 0,
        valorResS: 0, valorPun: 0,
        cLimpio: res.costoKgFinal,
        pasosHijo: res.pasos,
        costoNeto: res.costoAcum,
      };
    }

    // Flujo clásico (deshuese)
    const pctRS  = parseFloat(pctResSegunda) || 0;
    const pctPu  = parseFloat(pctPuntas)     || 0;
    const pctDe  = parseFloat(pctDesecho)    || 0;
    const kgResS = kgEnt * pctRS / 100;
    const kgPun  = kgEnt * pctPu / 100;
    const kgDes  = kgEnt * pctDe / 100;
    const kgHijo = kgEnt - kgResS - kgPun - kgDes;
    const valorResS    = kgResS * precioResSegunda;
    const valorPun     = kgPun  * precioPuntas;
    const cLimpio      = kgHijo > 0 ? (costoEntrada - valorResS - valorPun) / kgHijo : 0;
    return { cMadP, kgEnt, kgResS, kgPun, kgDes, kgHijo, costoEntrada, valorResS, valorPun, cLimpio, pasosHijo: null, costoNeto: costoEntrada - valorResS - valorPun };
  }

  function getCFinal() {
    if (tipo === 'hijo') return computeCLimpio().cLimpio;
    const lotesConCosto = lotesStock.filter(l => parseFloat(l.costo_mad_kg || 0) > 0);
    return lotesConCosto.length > 0 ? parseFloat(lotesConCosto[0].costo_mad_kg) : 0;
  }

  async function guardarCierre() {
    const hoy = cierreFecha || new Date().toISOString().split('T')[0];
    const kgH = parseFloat(cierreKgHueso)       || 0;
    const kgA = parseFloat(cierreKgAserrin)     || 0;
    const pA  = parseFloat(cierrePrecioAserrin) || 0;
    const kgC = parseFloat(cierreKgCarnudo)     || 0;
    const pC  = parseFloat(cierrePrecioCarnudo) || 0;
    const { data: lotesHoy } = await supabase
      .from('stock_lotes_inyectados').select('kg_inicial').eq('fecha_entrada', hoy);
    const kgDia = (lotesHoy||[]).reduce((s,l) => s + parseFloat(l.kg_inicial||0), 0);
    setKgCortesDia(kgDia);
    const valorSub = (kgA * pA) + (kgC * pC);
    const fi = kgDia > 0 ? valorSub / kgDia : 0;
    setGuardandoCierre(true);
    setErrorCierre('');
    try {
      await supabase.from('cierre_sierra_diario').insert({
        fecha: hoy, kg_hueso: kgH,
        kg_aserrin: kgA, precio_aserrin_kg: pA,
        kg_carnudo: kgC, precio_carnudo_kg: pC,
        valor_subproductos: valorSub, kg_cortes_producidos: kgDia,
        factor_impacto_kg: fi, notas: cierreNotas || null, usuario_nombre: '',
      });
      const { data: cierres } = await supabase
        .from('cierre_sierra_diario').select('*').order('fecha', { ascending: false }).limit(30);
      setHistoricoCierres(cierres || []);
      setCierreKgHueso(''); setCierreKgAserrin(''); setCierrePrecioAserrin('');
      setCierreKgCarnudo(''); setCierrePrecioCarnudo(''); setCierreNotas('');
    } catch (e) { setErrorCierre('Error: ' + e.message); }
    setGuardandoCierre(false);
  }

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>⏳ Cargando...</div>
  );

  // ── Funciones de descarga Excel ──────────────────────────────
  function descargarExcelCostos() {
    const pctInjN  = parseFloat(pctInj) || 0;
    const kgIni    = parseFloat(kgSalBase) || 2;
    const kgSal1   = pctInjN / 100;
    const kgSalmueraNec = kgIni * kgSal1;
    const kgEntradaMad  = kgIni + kgSalmueraNec;
    const kgSalidaN     = parseFloat(kgSalidaMad) || 0;
    const mermaMadKg    = kgSalidaN > 0 ? kgEntradaMad - kgSalidaN : 0;
    const pctMermaMad   = kgEntradaMad > 0 && kgSalidaN > 0 ? (mermaMadKg / kgEntradaMad * 100) : 0;
    const kgHijoN       = parseFloat(kgParaHijo) || 0;
    const kgPadreN      = Math.max(0, kgSalidaN - kgHijoN);
    const costoKg       = cMadReal > 0 ? cMadReal : 0;
    const mgPadreN      = parseFloat(margenPadre) || 0;
    const pvpPadre      = mgPadreN < 100 && costoKg > 0 ? costoKg / (1 - mgPadreN / 100) : 0;
    const totalKgF      = formulaSalmueraIngs.reduce((s,i) => s + i.gramos, 0) / 1000;
    const costoTotF     = formulaSalmueraIngs.reduce((s,i) => s + i.costo, 0);
    const precioKgSal   = totalKgF > 0 ? costoTotF / totalKgF : 0;

    const rows = [
      ['COSTOS 1 KG —', producto.nombre],
      [],
      ['═══ FASE 1 — MATERIA PRIMA ═══'],
      ['Materia Prima', mpVinculada ? (mpVinculada.nombre_producto || mpVinculada.nombre) : '—'],
      ['Precio/kg', precioCarne, '$/kg'],
      ['kg iniciales', kgIni, 'kg'],
      ['Costo carne', kgIni * precioCarne, '$'],
      [],
      ['═══ FASE 2 — INYECCIÓN ═══'],
      ['Salmuera', formulaSalmueraNombre || '—'],
      ['% Inyección', pctInjN, '%'],
      ['kg salmuera necesarios', kgSalmueraNec.toFixed(3), 'kg'],
      ['Precio salmuera/kg', precioKgSal.toFixed(4), '$/kg'],
      ...(formulaSalmueraIngs.length > 0 ? [
        [],
        ['  Ingredientes Salmuera', 'Gramos', 'Costo'],
        ...formulaSalmueraIngs.map(i => [`  ${i.nombre}`, i.gramos + 'g', '$' + i.costo.toFixed(4)]),
      ] : []),
      ...(formulaRubNombre ? [[], ['Rub/Especias', formulaRubNombre]] : []),
      ...(mpAdicionalId ? [['Adicional', mpsFormula.find(m => String(m.id) === mpAdicionalId)?.nombre_producto || mpAdicionalId, gramosAdicional + 'g/kg']] : []),
      [],
      ['═══ FASE 3 — MADURACIÓN ═══'],
      ['Tiempo', `${horasMad}h ${minutosMad}m`, `= ${(parseFloat(horasMad||0)+parseFloat(minutosMad||0)/60).toFixed(1)}h`],
      ['Peso entrada (calculado)', kgEntradaMad.toFixed(3), 'kg'],
      ['Peso salida (real)', kgSalidaN > 0 ? kgSalidaN.toFixed(3) : '—', 'kg'],
      ['Merma', kgSalidaN > 0 ? mermaMadKg.toFixed(3) : '—', 'kg'],
      ['% Merma', kgSalidaN > 0 ? pctMermaMad.toFixed(1) + '%' : '—'],
      ['C_mad (costo/kg post-mad)', costoKg > 0 ? costoKg.toFixed(4) : '—', '$/kg'],
      [],
      ['═══ DISTRIBUCIÓN ═══'],
      ['kg totales post-maduración', kgSalidaN.toFixed(3), 'kg'],
      ['kg para Padre (' + producto.nombre + ')', kgPadreN.toFixed(3), 'kg'],
      ['kg para Hijo', kgHijoN.toFixed(3), 'kg'],
      ['Costo/kg', costoKg.toFixed(4), '$/kg'],
      ['Costo Padre', (kgPadreN * costoKg).toFixed(4), '$'],
      ['Costo Hijo', (kgHijoN * costoKg).toFixed(4), '$'],
      [],
      ['═══ PRECIO DE VENTA — PADRE ═══'],
      ['Costo/kg', costoKg.toFixed(4), '$/kg'],
      ['Margen', mgPadreN + '%'],
      ['PRECIO VENTA/KG', pvpPadre.toFixed(4), '$/kg'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Costos 1kg');
    XLSX.writeFile(wb, `${producto.nombre}_Costos1kg.xlsx`);
  }

  function descargarExcelPruebas() {
    const rows = [
      ['PRUEBAS —', producto.nombre],
      ['Costo base/kg', cFinalActual.toFixed(4), '$/kg'],
      [],
      ...pruebaFilasCalc.filter(f => f.kg > 0).flatMap(f => [
        ['Funda ' + (f.kg*1000).toFixed(0) + 'g', 'Carne: $' + f.carne.toFixed(4), 'Total: $' + f.total.toFixed(4)],
      ]),
      [],
      ['═══ HISTORIAL DE PRUEBAS ═══'],
      ['Fecha', 'Fundas', 'Costo base/kg'],
      ...versionesPruebas.map(v => [v.fecha, v.fundas ? v.fundas.map(f => (f.kg*1000).toFixed(0)+'g').join(', ') : ((v.gramos_funda||0)*1000).toFixed(0)+'g', v.c_base ? '$'+parseFloat(v.c_base).toFixed(4) : '—']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pruebas');
    XLSX.writeFile(wb, `${producto.nombre}_Pruebas.xlsx`);
  }

  function descargarExcelProduccion() {
    const rows = [
      ['PRODUCCIÓN —', producto.nombre],
      [],
      ['STOCK — LOTES INYECTADOS'],
      ['Lote ID', 'Fecha entrada', 'kg entrada', 'kg salida mad', 'Costo mad/kg', 'Estado'],
      ...lotesStock.map(l => [
        l.lote_id || '—',
        l.fecha_entrada || '—',
        parseFloat(l.kg_inicial || 0).toFixed(3),
        parseFloat(l.kg_salida_maduracion || 0).toFixed(3),
        l.costo_mad_kg ? '$' + parseFloat(l.costo_mad_kg).toFixed(4) : '—',
        l.estado || '—',
      ]),
      [],
      ['HISTORIAL — INYECCIONES'],
      ['Fecha', 'Salmuera', '% Inyección', 'Estado'],
      ...historialInj.map(h => [
        h.produccion_inyeccion?.fecha || '—',
        h.produccion_inyeccion?.formula_salmuera || '—',
        h.produccion_inyeccion?.porcentaje_inyeccion || '—',
        h.produccion_inyeccion?.estado || '—',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Producción');
    XLSX.writeFile(wb, `${producto.nombre}_Produccion.xlsx`);
  }

  const cFinalActual   = getCFinal();
  const versionesPruebas = versiones.filter(v => v.tipo === 'prueba');
  // Calcular costos por fila de prueba
  const pruebaFilasCalc = pruebaFilas.map(f => {
    const kg     = parseFloat(f.kg) || 0;
    const empMp  = mpsEmpaque.find(m => String(m.id) === f.emp_id);
    const etiMp  = mpsEtiqueta.find(m => String(m.id) === f.eti_id);
    const cEmp   = parseFloat(empMp?.precio_kg || 0);
    const cEti   = parseFloat(etiMp?.precio_kg || 0);
    const carne  = kg * cFinalActual;
    const total  = carne + cEmp + cEti;
    return { ...f, kg, empMp, etiMp, cEmp, cEti, carne, total };
  });

  // MP carne seleccionada para panel del padre en hijo
  const mpCarneSelec = mpCarneId ? mpsCarneOpts.find(m => String(m.id) === mpCarneId) || null : null;

  const precioCarne = parseFloat(mpVinculada?.precio_kg || 0);

  // Costos salmuera desde fórmula seleccionada
  const totalGrFormula    = formulaSalmueraIngs.reduce((s,i) => s + i.gramos, 0);
  const costoTotalFormula = formulaSalmueraIngs.reduce((s,i) => s + i.costo,  0);
  const totalKgFormula    = totalGrFormula / 1000;
  const precioKgSalmuera  = totalKgFormula > 0 ? costoTotalFormula / totalKgFormula : 0;

  // ── render ──
  const tabs = [
    ['costos',    '📐 Costos 1 kg'],
    ['pruebas',   '🧪 Pruebas'],
    ['produccion','📦 Producción'],
    ['historial', '📋 Historial'],
    ['cierre',    '🪚 Cierre Sierra'],
  ];

  return (
    <div style={{ padding: mobile ? '10px' : '0' }}>

      {/* ── Header: botones contextuales por tab ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        {/* Izquierda: badge + estado (solo en costos) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tipo === 'padre' && <span style={{ background: '#1a3a5c', color: 'white', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>👑 Corte Padre</span>}
          {tipo === 'hijo'  && <span style={{ background: '#6c3483', color: 'white', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>🔀 Corte Hijo</span>}
          {tipo === 'independiente' && <span style={{ background: '#e67e22', color: 'white', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>🥩 Corte</span>}
          {tabActivo === 'costos' && (
            <span style={{ fontSize: 11, color: modoEdicion ? '#f39c12' : configExiste ? '#888' : '#e74c3c', fontWeight: 600 }}>
              {modoEdicion ? '✏️ Modo edición' : configExiste ? '🔒 Fijado — presiona Editar' : '⚠ Sin datos — presiona Editar para guardar'}
            </span>
          )}
        </div>

        {/* Derecha: botones según tab */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>

          {/* ── TAB COSTOS 1KG ── */}
          {tabActivo === 'costos' && (<>
            <button onClick={descargarExcelCostos}
              style={{ background: '#1a6b3c', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
              📥 Excel
            </button>
            <button onClick={() => setModalVer(true)}
              style={{ background: '#8e44ad', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
              🔄 Versiones {versiones.filter(v => v.tipo === 'formula').length > 0 && `(${versiones.filter(v => v.tipo === 'formula').length})`}
            </button>
            {!modoEdicion ? (
              <button onClick={() => setModoEdicion(true)}
                style={{ background: '#f39c12', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                ✏️ Editar
              </button>
            ) : (<>
              <button onClick={fijarCambios} disabled={guardando}
                style={{ background: guardando ? '#aaa' : '#27ae60', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: guardando ? 'default' : 'pointer' }}>
                {guardando ? 'Fijando...' : '🔒 Fijar cambios'}
              </button>
              <button onClick={guardarHistorial} disabled={autoGuardando}
                style={{ background: autoGuardando ? '#aaa' : '#e67e22', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: autoGuardando ? 'default' : 'pointer' }}>
                {autoGuardando ? 'Guardando...' : '📋 Guardar Historial'}
              </button>
            </>)}
          </>)}

          {/* ── TAB PRUEBAS ── */}
          {tabActivo === 'pruebas' && (<>
            <button onClick={descargarExcelPruebas}
              style={{ background: '#1a6b3c', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
              📥 Excel
            </button>
            <button onClick={() => setModalVer(true)}
              style={{ background: '#8e44ad', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
              🔄 Versiones {versiones.filter(v => v.tipo === 'prueba').length > 0 && `(${versiones.filter(v => v.tipo === 'prueba').length})`}
            </button>
            {!pruebasModoEdit ? (
              <button onClick={() => setPruebasModoEdit(true)}
                style={{ background: '#f39c12', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                ✏️ Editar
              </button>
            ) : (<>
              <button onClick={() => setPruebasModoEdit(false)}
                style={{ background: '#95a5a6', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={async () => { await guardarVersionPrueba(); setPruebasModoEdit(false); }}
                style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                💾 Guardar versión
              </button>
            </>)}
          </>)}

          {/* ── TAB PRODUCCIÓN ── */}
          {tabActivo === 'produccion' && (
            <button onClick={descargarExcelProduccion}
              style={{ background: '#1a6b3c', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
              📥 Excel
            </button>
          )}
          {/* Historial y Cierre Sierra: sin botones de acción */}

        </div>
      </div>

      {/* ── Producto: MP entrada → producto salida ── */}
      <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: mpVinculada ? '2px solid #eafaf1' : '2px solid #fef9e7' }}>
        <div style={{ fontSize: 10, color: '#27ae60', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          🔗 {tipo === 'hijo' ? 'MATERIA PRIMA ENTRADA — PRODUCTO QUE SE OBTIENE' : 'MATERIA PRIMA VINCULADA — PRODUCTO QUE PRODUCE ESTA FÓRMULA'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {mpVinculada ? (
            <div>
              <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 15 }}>{mpVinculada.nombre_producto || mpVinculada.nombre}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Categoría: {mpVinculada.categoria || 'CORTES'} &nbsp;·&nbsp; ID: {mpVinculada.id}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic' }}>Sin MP vinculada</div>
          )}
          {(deshueseConfig || !deshueseConfig) && mpVinculada && (
            <>
              <span style={{ fontSize: 20, color: '#ccc' }}>→</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: tipo === 'padre' ? '#1a3a5c' : tipo === 'hijo' ? '#6c3483' : '#e67e22' }}>
                  {tipo === 'padre' ? '👑' : tipo === 'hijo' ? '🔀' : '🥩'} {producto.nombre}
                </div>
                {deshueseConfig && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {tipo === 'padre' ? `genera → ${deshueseConfig.corte_hijo}` : `derivado de ${deshueseConfig.corte_padre}`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'white', borderRadius: 10, padding: 4, marginBottom: 14, gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTabActivo(key)} style={{
            flex: 1, padding: '9px 4px', border: 'none', borderRadius: 7, cursor: 'pointer',
            fontSize: mobile ? 11 : 13, fontWeight: 'bold',
            background: tabActivo === key ? '#6c3483' : 'transparent',
            color:      tabActivo === key ? 'white'   : '#666',
            transition: 'all 0.2s',
          }}>{label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          TAB COSTOS 1 KG
      ══════════════════════════════════════════ */}
      {tabActivo === 'costos' && (
        <div>

          {/* ── DINÁMICO — padre/independiente ── */}
          {bloques !== null && (tipo === 'padre' || tipo === 'independiente') && (
            <BloquesDinamicosEditor
              bloques={bloques}              setBloques={setBloques}
              bloqueExpandido={bloqueExpandido} setBloqueExpandido={setBloqueExpandido}
              modoEdicion={modoEdicion}
              producto={producto}
              precioCarne={precioCarne}
              precioKgSalmuera={precioKgSalmuera}
              costoRubFormula={costoRubFormula}
              kgRubBase={kgRubBase}
              mpAdic={mpAdicionalId ? mpsFormula.find(m => String(m.id) === mpAdicionalId) : null}
              deshueseConfig={deshueseConfig}
              formulaciones={formulaciones}
              rubFormulas={rubFormulas}
              mpsFormula={mpsFormula}
              kgSalBase={kgSalBase}
              setFormulaSalmueraNombre={setFormulaSalmueraNombre}
              setPctInj={setPctInj}
              setKgSalBase={setKgSalBase}
              setHorasMad={setHorasMad}
              setMinutosMad={setMinutosMad}
              setPctMad={setPctMad}
              setKgSalidaMad={setKgSalidaMad}
              setFormulaRubNombre={setFormulaRubNombre}
              setKgRubBase={setKgRubBase}
              setMpAdicionalId={setMpAdicionalId}
              setGramosAdicional={setGramosAdicional}
              setKgParaHijo={setKgParaHijo}
              setMargenPadre={setMargenPadre}
              setMargenHijo={setMargenHijo}
              margenPadre={margenPadre}
              margenHijo={margenHijo}
              pctSalmueraFormula={pctSalmueraFormula}
            />
          )}

          {/* ── CLÁSICO — padre/independiente ── */}
          {bloques === null && (tipo === 'padre' || tipo === 'independiente') && (() => {
            const pctInjN = parseFloat(pctInj) || 0;
            const pctMadN = parseFloat(pctMad) || 0;
            const lotesConCMad = lotesStock.filter(l => parseFloat(l.costo_mad_kg || 0) > 0);
            const ultimoCMad   = lotesConCMad[0] ? parseFloat(lotesConCMad[0].costo_mad_kg) : 0;

            // Rub: costo por kg de carne
            const kgRubBaseN   = parseFloat(kgRubBase) || 1;
            const costoRubKgN  = kgRubBaseN > 0 ? costoRubFormula / kgRubBaseN : 0;
            // Adicional (mostaza/otro): costo por kg de carne
            const mpAdic       = mpAdicionalId ? mpsFormula.find(m => String(m.id) === mpAdicionalId) : null;
            const gramosAdicN  = parseFloat(gramosAdicional) || 0;
            const costoAdicKgN = (gramosAdicN / 1000) * parseFloat(mpAdic?.precio_kg || 0);

            // CB = CI / PT
            const kgSal1   = pctInjN / 100;
            const PT       = 1 + kgSal1;
            const costoSal = kgSal1 * precioKgSalmuera;
            const costoRub = costoRubKgN;
            const CI       = precioCarne + costoSal + costoRub + costoAdicKgN;
            const CB       = PT > 0 ? CI / PT : 0;

            // Maduración
            const kgLost  = PT * pctMadN / 100;
            const kgMad1  = PT - kgLost;
            const cMadSim = kgMad1 > 0 ? CI / kgMad1 : 0;

            // Cálculos con kgIniciales
            const kgIniciales  = parseFloat(kgSalBase) || 2;
            const kgSalmueraNec = kgIniciales * kgSal1;            // kg salmuera = kg carne × (pctInj/100)
            const kgEntradaMad  = kgIniciales + kgSalmueraNec;     // peso total que entra a maduración
            const kgSalidaN     = parseFloat(kgSalidaMad) || 0;
            const mermaMadKg    = kgSalidaN > 0 ? kgEntradaMad - kgSalidaN : 0;
            const pctMermaMad   = kgEntradaMad > 0 && kgSalidaN > 0 ? (mermaMadKg / kgEntradaMad * 100) : 0;
            const cMadReal      = kgSalidaN > 0 ? (CI * kgIniciales) / kgSalidaN : 0;

            return (
              <>
                {/* ── Fase 1: Materia Prima ── */}
                <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                  <div style={{ background: 'linear-gradient(135deg,#7d3c00,#e67e22)', padding: '10px 16px' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🥩 Fase 1 — Materia Prima</span>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ background: '#fef9e7', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#e67e22', fontWeight: 700, marginBottom: 2 }}>Carne vinculada</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{mpVinculada ? (mpVinculada.nombre_producto || mpVinculada.nombre) : '—'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#888' }}>Precio actual</div>
                        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#27ae60' }}>${precioCarne.toFixed(4)}/kg</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontSize: 12, color: '#e67e22', fontWeight: 700, whiteSpace: 'nowrap' }}>kg iniciales de carne:</label>
                      <input type="number" min="0.1" step="0.1"
                        value={kgSalBase} onChange={e => setKgSalBase(e.target.value)}
                        disabled={!modoEdicion}
                        style={{ width: 90, padding: '8px 10px', borderRadius: 8, border: '2px solid #e67e22', fontSize: 16, fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                      <span style={{ fontSize: 12, color: '#888' }}>kg</span>
                      {precioCarne > 0 && (
                        <span style={{ fontSize: 13, color: '#27ae60', fontWeight: 700, marginLeft: 8 }}>
                          = ${(kgIniciales * precioCarne).toFixed(4)} en carne
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Fase 2: Inyección de Salmuera ── */}
                <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                  <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', padding: '10px 16px' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>💉 Fase 2 — Inyección de Salmuera</span>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    {/* Salmuera selector */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label style={{ fontSize: 11, color: '#2980b9', fontWeight: 600 }}>💉 Salmuera de inyección</label>
                        {precioKgSalmuera > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#2980b9' }}>${precioKgSalmuera.toFixed(4)}/kg</span>
                        )}
                      </div>
                      <select value={formulaSalmueraNombre} onChange={e => setFormulaSalmueraNombre(e.target.value)}
                        disabled={!modoEdicion}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #2980b9', fontSize: 13, background: modoEdicion ? 'white' : '#f8f9fa', boxSizing: 'border-box', marginBottom: 6 }}>
                        <option value="">— seleccionar salmuera —</option>
                        {formulaciones.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      {totalKgFormula > 0 && (
                        <div style={{ fontSize: 10, color: '#7fb3d3' }}>
                          Batch ${costoTotalFormula.toFixed(4)} ÷ {totalKgFormula.toFixed(3)} kg = ${precioKgSalmuera.toFixed(4)}/kg
                        </div>
                      )}
                    </div>

                    {/* % Inyección + kg salmuera necesarios */}
                    {pctInjN > 0 && (
                      <div style={{ background: '#f0f8ff', borderRadius: 8, padding: '10px 14px', marginBottom: 12, border: '2px solid #aed6f1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div>
                            <span style={{ fontSize: 22, fontWeight: 900, color: '#2980b9' }}>{pctInjN}%</span>
                            <span style={{ fontSize: 11, color: '#7fb3d3', marginLeft: 8 }}>inyección</span>
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 11, color: '#7fb3d3' }}>
                            de "{formulaSalmueraNombre}"
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#1a3a5c', fontWeight: 600 }}>
                          Para <strong>{kgIniciales} kg</strong> de carne →&nbsp;
                          necesitas <strong>{kgSalmueraNec.toFixed(3)} kg</strong> de salmuera
                          {precioKgSalmuera > 0 && (
                            <span style={{ color: '#2980b9', marginLeft: 6 }}>
                              (${(kgSalmueraNec * precioKgSalmuera).toFixed(4)})
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {!pctInjN && (
                      <div style={{ background: '#f0f8ff', borderRadius: 8, padding: '10px 14px', marginBottom: 12, border: '2px solid #aed6f1', fontSize: 11, color: '#7fb3d3' }}>
                        — selecciona una salmuera para ver el % de inyección —
                      </div>
                    )}

                    {/* Rub / Especias */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label style={{ fontSize: 11, color: '#8e44ad', fontWeight: 600 }}>🌶️ Rub / Especias (costra)</label>
                        {costoRubKgN > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#8e44ad' }}>${costoRubKgN.toFixed(4)}/kg</span>}
                      </div>
                      <select value={formulaRubNombre} onChange={e => setFormulaRubNombre(e.target.value)}
                        disabled={!modoEdicion}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #8e44ad', fontSize: 13, background: modoEdicion ? 'white' : '#f8f9fa', boxSizing: 'border-box', marginBottom: 6 }}>
                        <option value="">— sin rub —</option>
                        {rubFormulas.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      {formulaRubNombre && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>Fórmula para</span>
                          <input type="number" min="0.1" step="0.1"
                            value={kgRubBase} onChange={e => setKgRubBase(e.target.value)}
                            disabled={!modoEdicion}
                            style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1.5px solid #c39bd3', fontSize: 13, fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                          <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>kg de carne</span>
                        </div>
                      )}
                      {costoRubFormula > 0 && (
                        <div style={{ fontSize: 10, color: '#c39bd3', marginTop: 4 }}>
                          Fórmula ${costoRubFormula.toFixed(4)} total · ${costoRubKgN.toFixed(4)}/kg carne
                        </div>
                      )}
                    </div>

                    {/* Adicional (Mostaza u otro MP) */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label style={{ fontSize: 11, color: '#f39c12', fontWeight: 600 }}>🟡 Adicional por kg de carne</label>
                        {costoAdicKgN > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#f39c12' }}>${costoAdicKgN.toFixed(4)}/kg</span>}
                      </div>
                      <select value={mpAdicionalId} onChange={e => setMpAdicionalId(e.target.value)}
                        disabled={!modoEdicion}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #f39c12', fontSize: 13, background: modoEdicion ? 'white' : '#f8f9fa', boxSizing: 'border-box', marginBottom: 6 }}>
                        <option value="">— sin adicional —</option>
                        {mpsFormula.filter(m => {
                          const cat = (m.categoria||'').toUpperCase();
                          return !cat.includes('EMPAQUE') && !cat.includes('ETIQUETA') && !cat.includes('SALMUERA') && !cat.includes('FUNDA');
                        }).map(m => <option key={m.id} value={String(m.id)}>{m.nombre_producto||m.nombre} — ${parseFloat(m.precio_kg||0).toFixed(4)}/kg</option>)}
                      </select>
                      {mpAdicionalId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>Gramos por kg de carne</span>
                          <input type="number" min="0" step="1"
                            value={gramosAdicional} onChange={e => setGramosAdicional(e.target.value)}
                            disabled={!modoEdicion}
                            style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1.5px solid #f39c12', fontSize: 13, fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                          <span style={{ fontSize: 11, color: '#f39c12', fontWeight: 700 }}>
                            = {((parseFloat(gramosAdicional)||0)/1000).toFixed(3)} kg
                          </span>
                        </div>
                      )}
                      {costoAdicKgN > 0 && (
                        <div style={{ fontSize: 10, color: '#f5cba7', marginTop: 4 }}>
                          {gramosAdicional}g × ${parseFloat(mpAdic?.precio_kg||0).toFixed(4)}/kg = ${costoAdicKgN.toFixed(4)}
                        </div>
                      )}
                    </div>

                    {/* Resumen costo inyección */}
                    {pctInjN > 0 && precioCarne > 0 && (
                      <div style={{ background: '#f0f8ff', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 }}>
                          Costo por kg de carne (post-inyección):
                        </div>
                        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.9 }}>
                          <div>CI = ${precioCarne.toFixed(4)} (carne) + ${costoSal.toFixed(4)} (sal){costoRub > 0 && ` + $${costoRub.toFixed(4)} (rub)`}{costoAdicKgN > 0 && ` + $${costoAdicKgN.toFixed(4)} (adic.)`} = <strong>${CI.toFixed(4)}</strong></div>
                          <div>PT = 1 + {kgSal1.toFixed(3)} kg salmuera = <strong>{PT.toFixed(3)} kg</strong></div>
                          <div style={{ borderTop: '1px solid #dde3ea', paddingTop: 6, marginTop: 4 }}>
                            CB = CI ÷ PT = <strong style={{ fontSize: 15, color: '#1a3a5c' }}>${CB.toFixed(4)}/kg</strong>
                            <span style={{ color: '#27ae60', marginLeft: 8, fontSize: 11 }}>↓ el agua baja el costo</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Fase 3: Maduración ── */}
                <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                  <div style={{ background: 'linear-gradient(135deg,#1a6b3c,#27ae60)', padding: '10px 16px' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🧊 Fase 3 — Maduración</span>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    {/* Tiempo */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 11, color: '#8e44ad', fontWeight: 600, display: 'block', marginBottom: 6 }}>⏱ Tiempo de maduración</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: '#8e44ad', display: 'block', marginBottom: 3 }}>Horas</label>
                          <input type="number" min="0" step="1"
                            value={horasMad} onChange={e => setHorasMad(e.target.value)}
                            disabled={!modoEdicion}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #8e44ad', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, color: '#8e44ad', display: 'block', marginBottom: 3 }}>Minutos</label>
                          <input type="number" min="0" max="59" step="1"
                            value={minutosMad} onChange={e => setMinutosMad(e.target.value)}
                            disabled={!modoEdicion}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #8e44ad', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                        </div>
                        <div style={{ fontSize: 13, color: '#8e44ad', fontWeight: 700, paddingTop: 18, whiteSpace: 'nowrap' }}>
                          = {(parseFloat(horasMad||0) + parseFloat(minutosMad||0)/60).toFixed(1)}h
                        </div>
                      </div>
                    </div>

                    {/* Peso entrada (calculado) */}
                    <div style={{ background: '#f0fff4', borderRadius: 8, padding: '10px 14px', marginBottom: 12, border: '1.5px solid #a9dfbf' }}>
                      <div style={{ fontSize: 11, color: '#1a6b3c', fontWeight: 700, marginBottom: 4 }}>📥 Peso entrada a maduración (calculado)</div>
                      <div style={{ fontSize: 13, color: '#555' }}>
                        {kgIniciales} kg carne + {kgSalmueraNec.toFixed(3)} kg salmuera =&nbsp;
                        <strong style={{ fontSize: 16, color: '#1a6b3c' }}>{kgEntradaMad.toFixed(3)} kg</strong>
                      </div>
                    </div>

                    {/* Peso salida (manual) */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, color: '#e74c3c', fontWeight: 600, display: 'block', marginBottom: 4 }}>📤 Peso salida después de maduración (kg)</label>
                      <input type="number" min="0" step="0.001"
                        placeholder={`ej: ${(kgEntradaMad * 0.97).toFixed(2)}`}
                        value={kgSalidaMad} onChange={e => setKgSalidaMad(e.target.value)}
                        disabled={!modoEdicion}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e74c3c', fontSize: 16, fontWeight: 'bold', boxSizing: 'border-box', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                    </div>

                    {/* Merma calculada */}
                    {kgSalidaN > 0 && (
                      <div style={{ background: '#fdf2f8', borderRadius: 10, padding: '12px 14px', marginBottom: 12, border: '1.5px solid #e8b4c8' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#922b21', marginBottom: 8 }}>Merma de maduración:</div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                          {[
                            { label: `${kgEntradaMad.toFixed(3)} kg`, sub: 'Entrada', color: '#2980b9' },
                            '→',
                            { label: `−${mermaMadKg.toFixed(3)} kg`, sub: `${pctMermaMad.toFixed(1)}% merma`, color: '#e74c3c' },
                            '→',
                            { label: `${kgSalidaN.toFixed(3)} kg`, sub: 'Salida real', color: '#27ae60' },
                          ].map((n, i) => n === '→'
                            ? <span key={i} style={{ color: '#bbb' }}>→</span>
                            : <div key={i} style={{ textAlign: 'center', background: 'white', borderRadius: 8, padding: '6px 10px', border: `1.5px solid ${n.color}40` }}>
                                <div style={{ fontWeight: 700, color: n.color, fontSize: 12 }}>{n.label}</div>
                                <div style={{ fontSize: 9, color: '#888' }}>{n.sub}</div>
                              </div>
                          )}
                        </div>
                        {CI > 0 && (
                          <div style={{ fontSize: 12, color: '#555', borderTop: '1px solid #f0c8d8', paddingTop: 8 }}>
                            C_mad = ${(CI * kgIniciales).toFixed(4)} costo total ÷ {kgSalidaN.toFixed(3)} kg salida =&nbsp;
                            <strong style={{ color: '#922b21', fontSize: 14 }}>${cMadReal.toFixed(4)}/kg</strong>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Distribución post-maduración: Padre vs Hijo */}
                    {kgSalidaN > 0 && (
                      <div style={{ background: 'white', borderRadius: 10, padding: '14px 16px', marginBottom: 12, border: '2px solid #1a3a5c' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#1a3a5c', marginBottom: 10 }}>
                          ✂️ Distribución de los {kgSalidaN.toFixed(3)} kg post-maduración
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: 11, color: '#8e44ad', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                            kg que van al Hijo (deshuese → {deshueseConfig?.corte_hijo || 'producto hijo'})
                          </label>
                          <input type="number" min="0" step="0.001" max={kgSalidaN}
                            placeholder={`máx ${kgSalidaN.toFixed(3)}`}
                            value={kgParaHijo} onChange={e => setKgParaHijo(e.target.value)}
                            disabled={!modoEdicion}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #8e44ad', fontSize: 16, fontWeight: 'bold', boxSizing: 'border-box', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                        </div>
                        {(() => {
                          const kgHijoN    = parseFloat(kgParaHijo) || 0;
                          const kgPadreN   = Math.max(0, kgSalidaN - kgHijoN);
                          const costoKg    = cMadReal > 0 ? cMadReal : (ultimoCMad > 0 ? ultimoCMad : 0);
                          const costoTotal = kgSalidaN * costoKg;
                          const costoHijo  = kgHijoN  * costoKg;
                          const costoPadre = kgPadreN  * costoKg;
                          const showCosto  = costoKg > 0;
                          return (
                            <>
                              {/* Tarjetas resumen */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: showCosto && kgPadreN > 0 ? 12 : 0 }}>
                                <div style={{ background: '#eaf4fd', borderRadius: 8, padding: '10px 12px', border: '1.5px solid #2980b9' }}>
                                  <div style={{ fontSize: 10, color: '#1a3a5c', fontWeight: 700, marginBottom: 4 }}>🥩 Queda como Padre</div>
                                  <div style={{ fontSize: 20, fontWeight: 900, color: '#1a3a5c' }}>{kgPadreN.toFixed(3)} kg</div>
                                  {showCosto && (
                                    <div style={{ fontSize: 11, color: '#2980b9', marginTop: 4 }}>
                                      {kgPadreN.toFixed(3)} × ${costoKg.toFixed(4)} = <strong>${costoPadre.toFixed(4)}</strong>
                                    </div>
                                  )}
                                </div>
                                <div style={{ background: '#f3e8fd', borderRadius: 8, padding: '10px 12px', border: '1.5px solid #8e44ad' }}>
                                  <div style={{ fontSize: 10, color: '#6c3483', fontWeight: 700, marginBottom: 4 }}>✂️ Va al Hijo (deshuese)</div>
                                  <div style={{ fontSize: 20, fontWeight: 900, color: '#6c3483' }}>
                                    {kgHijoN > 0 ? `${kgHijoN.toFixed(3)} kg` : '— kg'}
                                  </div>
                                  {showCosto && kgHijoN > 0 && (
                                    <div style={{ fontSize: 11, color: '#8e44ad', marginTop: 4 }}>
                                      {kgHijoN.toFixed(3)} × ${costoKg.toFixed(4)} = <strong>${costoHijo.toFixed(4)}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Desglose de costos del Padre */}
                              {showCosto && kgPadreN > 0 && (
                                <div style={{ background: '#f0f4f8', borderRadius: 10, padding: '14px 16px', marginTop: 4 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', marginBottom: 10 }}>
                                    Cálculo de costo — {producto.nombre} (Padre):
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'white', borderRadius: 7, border: '1px solid #d5e8f5' }}>
                                      <span style={{ color: '#555' }}>Costo total batch ({kgSalidaN.toFixed(3)} kg × ${costoKg.toFixed(4)}/kg)</span>
                                      <strong>${costoTotal.toFixed(4)}</strong>
                                    </div>
                                    {kgHijoN > 0 && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#f3e8fd', borderRadius: 7, border: '1px solid #c39bd3' }}>
                                        <span style={{ color: '#6c3483' }}>− Costo asignado al Hijo ({kgHijoN.toFixed(3)} kg × ${costoKg.toFixed(4)})</span>
                                        <strong style={{ color: '#6c3483' }}>−${costoHijo.toFixed(4)}</strong>
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#eaf4fd', borderRadius: 7, border: '1px solid #aed6f1' }}>
                                      <span style={{ color: '#1a3a5c', fontWeight: 600 }}>Costo del Padre ({kgPadreN.toFixed(3)} kg de {producto.nombre})</span>
                                      <strong style={{ color: '#1a3a5c' }}>${costoPadre.toFixed(4)}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'white', borderRadius: 7, border: '1px solid #d5e8f5', fontSize: 11, color: '#888' }}>
                                      <span>÷ {kgPadreN.toFixed(3)} kg de {producto.nombre}</span>
                                      <span>= ${costoKg.toFixed(4)}/kg</span>
                                    </div>
                                  </div>
                                  {/* Costo final + Margen */}
                                  <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', borderRadius: 10, padding: '14px 16px', marginTop: 12 }}>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Costo — {producto.nombre}</div>
                                    <div style={{ fontSize: 32, fontWeight: 900, color: '#f9e79f' }}>${costoKg.toFixed(4)}/kg</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                                      {kgPadreN.toFixed(3)} kg · ${costoPadre.toFixed(4)} costo total
                                    </div>
                                  </div>
                                  {/* Margen de ganancia */}
                                  {(() => {
                                    const mgN  = parseFloat(margenPadre) || 0;
                                    const pvp  = mgN < 100 ? costoKg / (1 - mgN / 100) : 0;
                                    return (
                                      <div style={{ background: '#1c1c2e', borderRadius: 10, padding: '14px 16px', marginTop: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                          <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>Margen de ganancia</span>
                                          <input type="number" min="0" max="99" step="1"
                                            value={margenPadre} onChange={e => setMargenPadre(e.target.value)}
                                            disabled={!modoEdicion}
                                            style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1.5px solid #f39c12', fontSize: 15, fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? '#2c2c3e' : '#111', color: '#f9e79f' }} />
                                          <span style={{ fontSize: 12, color: '#aaa' }}>%</span>
                                        </div>
                                        {pvp > 0 && (
                                          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                                            Precio = ${costoKg.toFixed(4)} ÷ (1 − {mgN}%) = ${costoKg.toFixed(4)} ÷ {(1 - mgN/100).toFixed(2)}
                                          </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: '#f39c12', textTransform: 'uppercase', letterSpacing: 1 }}>PRECIO DE VENTA/KG</span>
                                          <span style={{ fontSize: 28, fontWeight: 900, color: '#f39c12' }}>{pvp > 0 ? `$${pvp.toFixed(4)}` : '—'}</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* C_mad real del último lote */}
                    <div style={{ background: ultimoCMad > 0 ? 'linear-gradient(135deg,#1a6b3c,#27ae60)' : '#f8f9fa', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: ultimoCMad > 0 ? 'rgba(255,255,255,0.7)' : '#888', marginBottom: 4 }}>
                        costo_mad_kg — referencia para Pruebas y para el Hijo
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 'bold', color: ultimoCMad > 0 ? '#f9e79f' : '#ccc' }}>
                        {ultimoCMad > 0 ? `$${ultimoCMad.toFixed(4)}/kg` : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: ultimoCMad > 0 ? 'rgba(255,255,255,0.6)' : '#aaa', marginTop: 4 }}>
                        {ultimoCMad > 0 ? `Último lote real · ${lotesConCMad[0]?.fecha_entrada}` : 'Confirma el pesaje en Producción › Maduración'}
                      </div>
                    </div>
                  </div>
                </div>

              </>
            );
          })()}

          {/* Botón activar flujo dinámico (solo en modo clásico + edición) */}
          {bloques === null && modoEdicion && (tipo === 'padre' || tipo === 'independiente') && (
            <div style={{ textAlign: 'center', padding: '14px 16px', marginBottom: 12 }}>
              <button onClick={initBloques}
                style={{ background: 'linear-gradient(135deg,#1a1a2e,#2c3e50)', color: '#f9e79f', border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
                🧩 Activar flujo dinámico
              </button>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Reorganiza las fases libremente y agrega bloques de merma personalizados</div>
            </div>
          )}

          {/* ── HIJO ── */}
          {tipo === 'hijo' && (() => {
            const { cMadP, kgEnt, kgResS, kgPun, kgDes, kgHijo, costoEntrada, valorResS, valorPun, cLimpio } = computeCLimpio();
            // Datos del padre para mostrar
            const padreMpCarne = padreCfg?.mp_carne_id
              ? mpsCarneOpts.find(m => String(m.id) === String(padreCfg.mp_carne_id)) || null
              : null;
            const padreHorasTotal = padreCfg
              ? (parseFloat(padreCfg.horas_mad||0) + parseFloat(padreCfg.minutos_mad||0)/60).toFixed(1)
              : null;
            // ── Flujo del padre desde pasos_flujo guardados ──
            // pasos_flujo se serializa en guardarConfig cuando el padre tiene bloques.
            // Si el padre cambia y guarda, padreCfg se refresca via polling/realtime
            // y el hijo muestra automáticamente el flujo actualizado.
            const pasosFlujo = padreCfg?.pasos_flujo;
            let flujoPadreBif = null;
            if (Array.isArray(pasosFlujo) && pasosFlujo.length > 0) {
              const bifPaso = pasosFlujo.find(p => p.tipo === 'bifurcacion');
              flujoPadreBif = {
                pasos:   pasosFlujo.filter(p => p.tipo !== 'bifurcacion'),
                bifPaso: bifPaso || null,
              };
            }

            return (
              <>
                {/* ── FLUJO DINÁMICO del padre → llegada al hijo ── */}
                {flujoPadreBif && (
                  <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#2c3e50)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f9e79f', textTransform: 'uppercase', letterSpacing: 1 }}>
                        🧩 Flujo del padre → llegada al hijo
                      </span>
                      <button onClick={recargarConfigPadre}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 10, padding: '3px 8px', cursor: 'pointer' }}>
                        🔄 Actualizar
                      </button>
                    </div>
                    {/* Pasos del padre — directo desde pasos_flujo guardados */}
                    {flujoPadreBif.pasos.map((p, i) => {
                      const costoKg = p.kg > 0 ? p.costoAcum / p.kg : 0;
                      const COLORES = { inyeccion: '#2980b9', maduracion: '#27ae60', rub: '#8e44ad', adicional: '#f39c12', merma: '#e74c3c' };
                      const color = COLORES[p.tipo] || '#aaa';
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', marginBottom: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 6, fontSize: 11, borderLeft: `3px solid ${color}` }}>
                          <span style={{ color: 'rgba(255,255,255,0.85)' }}>{p.label}</span>
                          <span style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{p.kg.toFixed(3)} kg · ${costoKg.toFixed(4)}/kg</span>
                        </div>
                      );
                    })}
                    {/* Bifurcación */}
                    {flujoPadreBif.bifPaso && (
                      <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(108,52,131,0.4)', borderRadius: 8, border: '1.5px solid #9b59b6' }}>
                        <div style={{ fontSize: 10, color: '#d7bde2', fontWeight: 700, marginBottom: 6 }}>🔀 BIFURCACIÓN</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>👑 Padre</div>
                            <div style={{ fontWeight: 700, color: '#aed6f1', fontSize: 13 }}>{flujoPadreBif.bifPaso.kgPadre.toFixed(3)} kg</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>${flujoPadreBif.bifPaso.costoKg.toFixed(4)}/kg</div>
                          </div>
                          <div style={{ background: 'rgba(108,52,131,0.4)', borderRadius: 6, padding: '8px 10px', textAlign: 'center', border: '1.5px solid #9b59b6' }}>
                            <div style={{ fontSize: 10, color: '#d7bde2', marginBottom: 2 }}>🔀 Hijo (tú)</div>
                            <div style={{ fontWeight: 900, color: '#f9e79f', fontSize: 16 }}>{flujoPadreBif.bifPaso.kgHijo.toFixed(3)} kg</div>
                            <div style={{ fontSize: 11, color: '#a9dfbf' }}>${flujoPadreBif.bifPaso.costoKg.toFixed(4)}/kg</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                          Costo de entrada al deshuese: <strong style={{ color: '#f9e79f' }}>${(flujoPadreBif.bifPaso.kgHijo * flujoPadreBif.bifPaso.costoKg).toFixed(4)}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Info del Padre — solo si NO hay bloques dinámicos */}
                <div style={{ background: '#eaf4fd', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '2px solid #2980b9', display: flujoPadreBif ? 'none' : 'block' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    👑 Configuración del Padre — {deshueseConfig?.corte_padre || '—'}
                  </div>
                  {!padreCfg ? (
                    <div style={{ fontSize: 12, color: '#e67e22', background: '#fef9e7', borderRadius: 8, padding: '10px 12px' }}>
                      <div>⚠ El padre aún no tiene config guardada. Abre <strong>"{deshueseConfig?.corte_padre}"</strong>, completa los campos y presiona <strong>Fijar Cambios</strong>.</div>
                      <button onClick={recargarConfigPadre} style={{ marginTop: 8, background: '#e67e22', color: 'white', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        🔄 Recargar config del padre
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Fase 1: Materia Prima */}
                      <div style={{ background: '#fff8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 8, border: '1px solid #f0c080' }}>
                        <div style={{ fontSize: 10, color: '#7d3c00', fontWeight: 700, marginBottom: 4 }}>🥩 Fase 1 — Materia Prima</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1a2e' }}>
                              {mpVinculada ? (mpVinculada.nombre_producto || mpVinculada.nombre) : '—'}
                            </div>
                            <div style={{ fontSize: 11, color: '#27ae60' }}>${precioCarne.toFixed(4)}/kg</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#888' }}>kg iniciales</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#e67e22' }}>
                              {padreCfg.kg_sal_base || padreCfg.kg_iniciales || 2} kg
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Fase 2: Inyección */}
                      <div style={{ background: '#f0f8ff', borderRadius: 8, padding: '8px 12px', marginBottom: 8, border: '1px solid #aed6f1' }}>
                        <div style={{ fontSize: 10, color: '#1a3a5c', fontWeight: 700, marginBottom: 4 }}>💉 Fase 2 — Inyección</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#2980b9' }}>{padreCfg.formula_salmuera || '—'}</div>
                          {padreCfg.pct_inj > 0 && (
                            <div style={{ fontSize: 15, fontWeight: 900, color: '#2980b9' }}>{padreCfg.pct_inj}%</div>
                          )}
                        </div>
                        {padreCfg.pct_inj > 0 && (padreCfg.kg_sal_base || 2) > 0 && (
                          <div style={{ fontSize: 11, color: '#555' }}>
                            {(padreCfg.kg_sal_base||2)} kg carne × {padreCfg.pct_inj}% =&nbsp;
                            <strong>{((padreCfg.kg_sal_base||2) * padreCfg.pct_inj / 100).toFixed(3)} kg salmuera</strong>
                          </div>
                        )}
                        {padreCfg.formula_rub && (
                          <div style={{ background: '#f5eef8', borderRadius: 6, padding: '6px 10px', marginTop: 6, border: '1px solid #d7bde2' }}>
                            <div style={{ fontSize: 10, color: '#6c3483', fontWeight: 700, marginBottom: 2 }}>🌶️ Rub / Especias (costra)</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#6c3483' }}>{padreCfg.formula_rub}</div>
                            {padreCfg.kg_rub_base > 0 && (
                              <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>
                                Fórmula para {padreCfg.kg_rub_base} kg de carne
                              </div>
                            )}
                          </div>
                        )}
                        {padreCfg.mp_adicional_id && (() => {
                          const mpAdPadre = mpsFormula.find(m => String(m.id) === String(padreCfg.mp_adicional_id));
                          return (
                            <div style={{ background: '#fef9e7', borderRadius: 6, padding: '6px 10px', marginTop: 6, border: '1px solid #f9e79f' }}>
                              <div style={{ fontSize: 10, color: '#d68910', fontWeight: 700, marginBottom: 2 }}>🟡 Adicional por kg de carne</div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: '#d68910' }}>
                                {mpAdPadre ? (mpAdPadre.nombre_producto || mpAdPadre.nombre) : '?'}
                                {mpAdPadre?.precio_kg > 0 && <span style={{ fontSize: 10, fontWeight: 400, color: '#888', marginLeft: 6 }}>${parseFloat(mpAdPadre.precio_kg).toFixed(4)}/kg</span>}
                              </div>
                              {padreCfg.gramos_adicional > 0 && (
                                <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>
                                  {padreCfg.gramos_adicional}g/kg de carne
                                  {mpAdPadre?.precio_kg > 0 && ` = $${(padreCfg.gramos_adicional / 1000 * parseFloat(mpAdPadre.precio_kg)).toFixed(4)}/kg`}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {/* Fase 3: Maduración */}
                      <div style={{ background: '#f0fff4', borderRadius: 8, padding: '8px 12px', border: '1px solid #a9dfbf' }}>
                        <div style={{ fontSize: 10, color: '#1a6b3c', fontWeight: 700, marginBottom: 4 }}>🧊 Fase 3 — Maduración</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#8e44ad' }}>
                            {padreCfg.horas_mad !== undefined ? `${padreCfg.horas_mad}h ${padreCfg.minutos_mad||0}m` : '—'}
                          </div>
                          <div style={{ fontSize: 11, color: '#888' }}>{padreHorasTotal} h total</div>
                        </div>
                        {padreCfg.kg_salida_mad > 0 && (padreCfg.kg_sal_base || 2) > 0 && padreCfg.pct_inj > 0 && (() => {
                          const kgIniP = parseFloat(padreCfg.kg_sal_base || 2);
                          const kgEntP = kgIniP * (1 + padreCfg.pct_inj / 100);
                          const kgSalP = parseFloat(padreCfg.kg_salida_mad);
                          const mermaP = ((kgEntP - kgSalP) / kgEntP * 100).toFixed(1);
                          return (
                            <div style={{ fontSize: 11, color: '#555' }}>
                              {kgEntP.toFixed(3)} kg entrada → {kgSalP.toFixed(3)} kg salida&nbsp;
                              <strong style={{ color: '#e74c3c' }}>({mermaP}% merma)</strong>
                            </div>
                          );
                        })()}
                      </div>
                      {/* Kg asignados al Hijo desde el Padre */}
                      {padreCfg.kg_para_hijo > 0 && (() => {
                        const costoTotP = padreCfg.c_mad_real > 0
                          ? parseFloat(padreCfg.c_mad_real)
                          : (padreInfo ? parseFloat(padreInfo.costo_mad_kg) : parseFloat(mpVinculada?.precio_kg || 0));
                        return (
                          <div style={{ background: '#f3e8fd', borderRadius: 8, padding: '10px 12px', marginTop: 8, border: '2px solid #8e44ad' }}>
                            <div style={{ fontSize: 10, color: '#6c3483', fontWeight: 700, marginBottom: 4 }}>
                              ✂️ kg recibidos del Padre para deshuese
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#6c3483' }}>
                              {parseFloat(padreCfg.kg_para_hijo).toFixed(3)} kg
                            </div>
                            {costoTotP > 0 && (
                              <div style={{ fontSize: 11, color: '#8e44ad', marginTop: 2 }}>
                                @ ${costoTotP.toFixed(4)}/kg = <strong>${(parseFloat(padreCfg.kg_para_hijo) * costoTotP).toFixed(4)}</strong> costo entrada
                              </div>
                            )}
                            <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                              Este es tu punto de partida para el deshuese ↓
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>

                {/* Entrada al deshuese — desde el Padre (dinámico o clásico) */}
                {(flujoPadreBif?.bifPaso?.kgHijo > 0 || padreCfg?.kg_para_hijo > 0) ? (() => {
                  const kgHijoEntra = flujoPadreBif?.bifPaso
                    ? flujoPadreBif.bifPaso.kgHijo
                    : parseFloat(padreCfg?.kg_para_hijo || 0);
                  const costoKgEntra = flujoPadreBif?.bifPaso
                    ? flujoPadreBif.bifPaso.costoKg
                    : (padreCfg?.c_mad_real > 0
                        ? parseFloat(padreCfg.c_mad_real)
                        : (padreInfo ? parseFloat(padreInfo.costo_mad_kg) : parseFloat(mpVinculada?.precio_kg || 0)));
                  return (
                    <div style={{ background: '#eaf4fd', borderRadius: 10, padding: '12px 16px', marginBottom: 12, border: `2px solid ${flujoPadreBif ? '#9b59b6' : '#2980b9'}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 }}>
                        📥 Entrada al deshuese — desde {deshueseConfig?.corte_padre || 'Padre'}
                        {flujoPadreBif && <span style={{ marginLeft: 8, background: '#9b59b620', color: '#6c3483', fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>🧩 flujo dinámico</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>kg que llegan del Padre</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#1a3a5c' }}>{kgHijoEntra.toFixed(3)} kg</div>
                        </div>
                        <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Costo/kg entrada</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#27ae60' }}>${costoKgEntra.toFixed(4)}</div>
                          <div style={{ fontSize: 10, color: '#aaa' }}>= ${(kgHijoEntra * costoKgEntra).toFixed(4)} total</div>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div style={{ background: '#fef9e7', borderRadius: 10, padding: '12px 16px', marginBottom: 12, border: '1.5px solid #f39c12' }}>
                    <div style={{ fontSize: 12, color: '#b7770d', fontWeight: 700, marginBottom: 4 }}>
                      ⚠ El Padre aún no ha asignado los kg para este Hijo
                    </div>
                    <div style={{ fontSize: 11, color: '#7d6608' }}>
                      Abre <strong>"{deshueseConfig?.corte_padre || 'el producto Padre'}"</strong>, ve a la <strong>Fase 3 — Maduración</strong>, ingresa el peso salida y cuántos kg van al Hijo, luego presiona <strong>Fijar Cambios</strong>.
                    </div>
                  </div>
                )}

                {/* Flujo dinámico hijo / Deshuese clásico */}
                {bloquesHijo !== null ? (
                  <BloquesDinamicosEditor
                    bloques={bloquesHijo}
                    setBloques={setBloquesHijo}
                    bloqueExpandido={bloqueExpandidoHijo}
                    setBloqueExpandido={setBloqueExpandidoHijo}
                    modoEdicion={modoEdicion}
                    producto={producto}
                    precioCarne={cMadP}
                    precioKgSalmuera={precioKgSalmuera}
                    costoRubFormula={costoRubFormula}
                    kgRubBase={kgRubBase}
                    mpAdic={mpAdicionalId ? mpsFormula.find(m => String(m.id) === mpAdicionalId) : null}
                    deshueseConfig={null}
                    formulaciones={formulaciones}
                    rubFormulas={rubFormulas}
                    mpsFormula={mpsFormula}
                    kgSalBase={String(kgEnt)}
                    pctSalmueraFormula={null}
                    setFormulaSalmueraNombre={setFormulaSalmueraNombre}
                    setPctInj={setPctInj}
                    setKgSalBase={() => {}}
                    setHorasMad={setHorasMad}
                    setMinutosMad={setMinutosMad}
                    setPctMad={setPctMad}
                    setKgSalidaMad={setKgSalidaMad}
                    setFormulaRubNombre={setFormulaRubNombre}
                    setKgRubBase={setKgRubBase}
                    setMpAdicionalId={setMpAdicionalId}
                    setGramosAdicional={setGramosAdicional}
                    setKgParaHijo={() => {}}
                    setMargenPadre={setMargenHijo}
                    setMargenHijo={setMargenHijo}
                    margenPadre={margenHijo}
                    margenHijo={margenHijo}
                    tiposDisponibles={['inyeccion', 'maduracion', 'rub', 'adicional', 'merma']}
                    labelInicial="Entrada desde padre"
                    iconoInicial="🔀"
                    colorInicial="#6c3483"
                  />
                ) : (
                  <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                    <div style={{ background: 'linear-gradient(135deg,#8e44ad,#6c3483)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🔪 Deshuese — Distribución</span>
                      {modoEdicion && (
                        <button onClick={initBloquesHijo}
                          style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 7, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>
                          🧩 Flujo dinámico
                        </button>
                      )}
                    </div>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
                        {[
                          ['Res Segunda', pctResSegunda, setPctResSegunda, '#27ae60', precioResSegunda],
                          ['Puntas',      pctPuntas,     setPctPuntas,     '#e67e22', precioPuntas],
                          ['Desecho',     pctDesecho,    setPctDesecho,    '#e74c3c', 0],
                        ].map(([label, val, setter, color, precio]) => {
                          const pctNum = parseFloat(val) || 0;
                          const gramsVal = (val !== '' && pctNum > 0 && kgEnt > 0) ? +(pctNum * kgEnt * 10).toFixed(1) : '';
                          return (
                            <div key={label}>
                              <label style={{ fontSize: 10, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                                {label} <span style={{ color: '#aaa' }}>(g)</span>
                              </label>
                              <input type="number" min="0" step="0.1" placeholder="0" value={gramsVal}
                                onChange={e => { const g = e.target.value === '' ? '' : parseFloat(e.target.value); if (g === '') { setter(''); return; } setter(kgEnt > 0 ? String(+(g / (kgEnt * 10)).toFixed(4)) : '0'); }}
                                disabled={!modoEdicion}
                                style={{ width: '100%', padding: '8px', borderRadius: 8, border: `2px solid ${color}`, fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box', textAlign: 'right', background: modoEdicion ? 'white' : '#f8f9fa' }} />
                              <div style={{ fontSize: 9, color: '#888', marginTop: 2, fontWeight: 600 }}>= {pctNum > 0 ? pctNum.toFixed(3) : '0'}%</div>
                              {precio > 0 && <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>Precio: ${precio.toFixed(4)}/kg</div>}
                            </div>
                          );
                        })}
                      </div>
                      {kgEnt > 0 && (
                        <div style={{ background: '#f9f5ff', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c3483', marginBottom: 10 }}>Distribución de {kgEnt.toFixed(3)} kg entrada:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[
                              { label: 'Res Segunda', kg: kgResS, color: '#27ae60', precio: precioResSegunda },
                              { label: 'Puntas',      kg: kgPun,  color: '#e67e22', precio: precioPuntas },
                              { label: 'Desecho',     kg: kgDes,  color: '#e74c3c', precio: 0 },
                            ].map(({ label, kg, color, precio }) => (
                              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', borderRadius: 8, padding: '7px 10px', border: `1px solid ${color}30` }}>
                                <div style={{ fontSize: 12, color: '#555', minWidth: 90 }}>{label}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color, minWidth: 70, textAlign: 'right' }}>{kg.toFixed(3)} kg</div>
                                {precio > 0 ? <div style={{ fontSize: 11, color: '#27ae60', textAlign: 'right', minWidth: 130 }}>× ${precio.toFixed(4)}/kg = <strong>${(kg * precio).toFixed(4)}</strong> crédito</div>
                                            : <div style={{ fontSize: 11, color: '#aaa', textAlign: 'right', minWidth: 130 }}>sin valor</div>}
                              </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f3e8fd', borderRadius: 8, padding: '9px 10px', border: '2px solid #8e44ad' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#6c3483' }}>🥩 {producto.nombre}</div>
                              <div style={{ fontSize: 15, fontWeight: 900, color: '#6c3483' }}>{kgHijo.toFixed(3)} kg</div>
                              <div style={{ fontSize: 11, color: '#8e44ad', textAlign: 'right', minWidth: 130 }}>{((kgResS + kgPun + kgDes) / kgEnt * 100).toFixed(1)}% merma deshuese</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {cLimpio > 0 && (() => {
                        const mgN = parseFloat(margenHijo) || 0;
                        const pvp = mgN > 0 && mgN < 100 ? cLimpio / (1 - mgN / 100) : 0;
                        return (
                          <div style={{ background: 'linear-gradient(135deg,#4a235a,#6c3483)', borderRadius: 10, padding: '14px 16px', marginTop: 10 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Costo final — {producto.nombre}</div>
                            <div style={{ fontSize: 30, fontWeight: 900, color: '#f9e79f' }}>${cLimpio.toFixed(4)}/kg</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{kgHijo.toFixed(3)} kg finales · ${(costoEntrada - valorResS - valorPun).toFixed(4)} costo neto</div>
                            <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1 }}>Margen de ganancia</span>
                              <input type="number" min="0" max="99" step="1" value={margenHijo} onChange={e => setMargenHijo(e.target.value)} disabled={!modoEdicion}
                                style={{ width: 60, padding: '5px 8px', borderRadius: 6, border: '1.5px solid rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)', color: 'white' }} />
                              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>%</span>
                            </div>
                            {pvp > 0 && <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Precio de venta → <strong style={{ color: '#a9dfbf', fontSize: 16 }}>${pvp.toFixed(4)}/kg</strong></div>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

              </>
            );
          })()}

          {onAbrirInyeccion && (
            <button onClick={onAbrirInyeccion} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              💉 Ir a Producción — Inyección
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB PRUEBAS
      ══════════════════════════════════════════ */}
      {tabActivo === 'pruebas' && (
        <div>
          {/* Header */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: '#1a5276', fontSize: 15 }}>Simulador — Costo por Funda</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>Costo base: {cFinalActual > 0 ? <strong style={{ color: '#27ae60' }}>${cFinalActual.toFixed(4)}/kg</strong> : <span style={{ color: '#e74c3c' }}>sin datos — configura Costos 1 kg</span>}</span>
              {(() => {
                const mg = tipo === 'padre' ? parseFloat(margenPadre) : tipo === 'hijo' ? parseFloat(margenHijo) : 0;
                return mg > 0 ? <span>· Margen: <strong style={{ color: '#8e44ad' }}>{mg}%</strong></span> : null;
              })()}
            </div>
          </div>

          {/* Cabeceras columnas */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr 32px', gap: 8, marginBottom: 6, paddingLeft: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Peso (kg)</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Empaque / Funda</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Etiqueta</div>
            <div />
          </div>

          {/* Filas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {pruebaFilasCalc.map((f, idx) => {
              const mgConf = tipo === 'padre' ? parseFloat(margenPadre) || 0 : tipo === 'hijo' ? parseFloat(margenHijo) || 0 : 0;
              const pvp = mgConf > 0 && mgConf < 100 && f.total > 0 ? f.total / (1 - mgConf / 100) : 0;
              return (
                <div key={f.id} style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e8e8e8' }}>
                  {/* Fila de inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr 32px', gap: 8, padding: '10px 12px', alignItems: 'center' }}>
                    <input type="number" min="0" step="0.001" placeholder="ej: 0.400"
                      value={f.kg === 0 ? '' : f.kg}
                      disabled={!pruebasModoEdit}
                      onChange={e => setPruebaFilas(prev => prev.map(r => r.id === f.id ? { ...r, kg: e.target.value } : r))}
                      style={{ padding: '7px 10px', borderRadius: 7, border: '2px solid #27ae60', fontSize: 14, fontWeight: 'bold', textAlign: 'center', background: pruebasModoEdit ? 'white' : '#f8f9fa', boxSizing: 'border-box' }} />
                    <select value={f.emp_id}
                      disabled={!pruebasModoEdit}
                      onChange={e => setPruebaFilas(prev => prev.map(r => r.id === f.id ? { ...r, emp_id: e.target.value } : r))}
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #2980b9', fontSize: 12, background: pruebasModoEdit ? 'white' : '#f8f9fa', boxSizing: 'border-box' }}>
                      <option value="">— sin empaque —</option>
                      {mpsEmpaque.map(m => <option key={m.id} value={String(m.id)}>{m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/u</option>)}
                    </select>
                    <select value={f.eti_id}
                      disabled={!pruebasModoEdit}
                      onChange={e => setPruebaFilas(prev => prev.map(r => r.id === f.id ? { ...r, eti_id: e.target.value } : r))}
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1.5px solid #8e44ad', fontSize: 12, background: pruebasModoEdit ? 'white' : '#f8f9fa', boxSizing: 'border-box' }}>
                      <option value="">— sin etiqueta —</option>
                      {mpsEtiqueta.map(m => <option key={m.id} value={String(m.id)}>{m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/u</option>)}
                    </select>
                    {pruebasModoEdit && pruebaFilas.length > 1 && (
                      <button onClick={() => setPruebaFilas(prev => prev.filter(r => r.id !== f.id))}
                        style={{ background: '#fdf2f2', border: 'none', borderRadius: 6, color: '#e74c3c', fontSize: 14, cursor: 'pointer', padding: '4px 8px' }}>×</button>
                    )}
                  </div>
                  {/* Resultado */}
                  {f.kg > 0 && cFinalActual > 0 && (
                    <div style={{ background: 'linear-gradient(135deg,#4a235a,#6c3483)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
                        <span style={{ fontWeight: 700, color: '#f9e79f', fontSize: 13 }}>{(f.kg * 1000).toFixed(0)}g</span>
                        <span style={{ marginLeft: 8 }}>🥩 ${f.carne.toFixed(4)}{f.cEmp > 0 ? ` · 📦 $${f.cEmp.toFixed(4)}` : ''}{f.cEti > 0 ? ` · 🏷️ $${f.cEti.toFixed(4)}` : ''}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Total funda</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: '#f9e79f' }}>${f.total.toFixed(4)}</div>
                        </div>
                        {pvp > 0 && (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>PVP ({mgConf}%)</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#a9dfbf' }}>${pvp.toFixed(4)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Agregar funda */}
          {pruebasModoEdit && (
            <button onClick={() => setPruebaFilas(prev => [...prev, { id: String(Date.now()), kg: '', emp_id: '', eti_id: '' }])}
              style={{ width: '100%', padding: '10px', background: 'white', border: '2px dashed #8e44ad', borderRadius: 10, color: '#8e44ad', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }}>
              + Agregar funda
            </button>
          )}

          {/* Versiones guardadas */}
          {versionesPruebas.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>📚 Versiones guardadas</div>
              {versionesPruebas.map((v, i) => (
                <div key={i} onClick={() => {
                  const filasRestored = (v.fundas || [{ kg: v.gramos_funda, emp_id: v.emp_id || '', eti_id: v.eti_id || '' }])
                    .map((f, j) => ({ id: String(Date.now() + j), kg: String(f.kg), emp_id: f.emp_id || '', eti_id: f.eti_id || '' }));
                  setPruebaFilas(filasRestored.length > 0 ? filasRestored : [{ id: '1', kg: '', emp_id: '', eti_id: '' }]);
                }} style={{ background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 8, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#333', fontSize: 12 }}>
                      {v.fundas ? `${v.fundas.length} funda${v.fundas.length > 1 ? 's' : ''}` : `${(v.gramos_funda * 1000).toFixed(0)}g`}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {v.fecha} · base ${v.c_base?.toFixed(4) || '—'}/kg
                      {v.fundas ? ` · ${v.fundas.map(f => (f.kg*1000).toFixed(0)+'g').join(', ')}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#aaa' }}>cargar →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB PRODUCCIÓN
      ══════════════════════════════════════════ */}
      {tabActivo === 'produccion' && (
        <div>
          {lotesStock.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', background: 'white', borderRadius: 12 }}>
              {tipo === 'hijo'
                ? 'Sin lotes registrados. El lote del hijo se crea al completar la separación en Producción › Maduración.'
                : 'Sin lotes madurados registrados'}
            </div>
          ) : (
            <div>
              {lotesStock.slice(0, 1).map((l, idx) => {
                const esPadre = l.tipo_corte === 'padre';
                const esHijo  = l.tipo_corte === 'hijo';
                const madInfo = lotsDetail[l.lote_maduracion_id];
                const picortes = madInfo?.produccion_inyeccion?.produccion_inyeccion_cortes || [];
                const miCorte  = picortes.find(pc => (pc.corte_nombre||'').toLowerCase() === producto.nombre.toLowerCase()) || picortes[0];
                const kgCarne  = madInfo?.produccion_inyeccion?.kg_carne_total || parseFloat(miCorte?.kg_carne_cruda || 0) || 0;
                const kgSalAbs = parseFloat(miCorte?.kg_salmuera_asignada || 0);
                const pctInjN  = kgCarne > 0 && kgSalAbs > 0
                  ? Math.round(kgSalAbs / kgCarne * 100)
                  : parseFloat(madInfo?.produccion_inyeccion?.porcentaje_inyeccion || 0);
                const kgPostInj = kgCarne + kgSalAbs;
                const hijoL    = companionSplit.hijoLotes.find(h => h.parent_lote_id === l.lote_id);
                const padreL   = companionSplit.padreLotes.find(p => p.lote_maduracion_id === l.lote_maduracion_id);
                const kgPreBif = (() => {
                  const bifStep = (madInfo?.bloques_resultado?.pasos || []).find(p => p.tipo === 'bifurcacion');
                  return bifStep ? parseFloat(bifStep.kgEntrada || 0) : 0;
                })();
                const kgPostMad = esPadre && hijoL
                  ? parseFloat(l.kg_inicial||0) + parseFloat(hijoL.kg_inyectado||0)
                  : esHijo && padreL
                    ? parseFloat(padreL.kg_inicial||0) + parseFloat(l.kg_inyectado||0)
                    : esHijo && kgPreBif > 0
                      ? kgPreBif
                      : parseFloat(l.kg_inyectado||0);
                const kgDisp = parseFloat(l.kg_disponible || l.kg_inicial || 0);
                const cMad   = parseFloat(l.costo_mad_kg || 0);
                const hdrBg  = esPadre
                  ? 'linear-gradient(135deg,#1a3a5c,#2980b9)'
                  : esHijo
                    ? 'linear-gradient(135deg,#6c3483,#9b59b6)'
                    : 'linear-gradient(135deg,#1a6b3c,#27ae60)';
                return (
                  <div key={l.id || idx} style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 12 }}>
                    <div style={{ background: hdrBg, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>
                        📦 {esPadre ? 'Padre' : esHijo ? 'Hijo' : 'Lote'} — {l.lote_id}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{l.fecha_entrada}</span>
                    </div>
                    <div style={{ padding: '14px 16px' }}>

                      {/* Proceso */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Proceso</div>

                      {/* Carne original */}
                      {kgCarne > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap', fontSize: 12 }}>
                          <span style={{ background: '#e8f4fd', borderRadius: 6, padding: '3px 8px', color: '#1a5276', fontWeight: 700 }}>
                            🥩 Carne: {kgCarne.toFixed(3)} kg
                          </span>
                          {pctInjN > 0 && <>
                            <span style={{ color: '#bbb' }}>+</span>
                            <span style={{ background: '#eafaf1', borderRadius: 6, padding: '3px 8px', color: '#1a6b3c', fontWeight: 700 }}>
                              💉 {pctInjN}% salmuera
                            </span>
                            <span style={{ color: '#bbb' }}>→ {kgPostInj.toFixed(3)} kg</span>
                          </>}
                        </div>
                      )}

                      {/* Post-maduración y merma (solo si hay datos y no es independiente sin datos) */}
                      {(esPadre || esHijo) && kgPostMad > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12 }}>
                          <span style={{ color: '#888' }}>↓ Maduración →</span>
                          <span style={{ fontWeight: 700, color: '#555' }}>{kgPostMad.toFixed(3)} kg</span>
                          {kgPostInj > 0 && kgPostMad < kgPostInj && (
                            <span style={{ color: '#e74c3c', fontSize: 11 }}>
                              (merma {((kgPostInj - kgPostMad) / kgPostInj * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Separación — vista padre */}
                      {esPadre && (
                        <div style={{ background: '#f4f7ff', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 8 }}>Separación</div>
                          <div style={{ display: 'grid', gridTemplateColumns: hijoL ? '1fr 1fr' : '1fr', gap: 8 }}>
                            <div style={{ background: '#ddeeff', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#1a3a5c', marginBottom: 4 }}>👑 {l.corte_nombre}</div>
                              <div style={{ fontWeight: 900, color: '#1a3a5c', fontSize: 17 }}>{parseFloat(l.kg_inicial||0).toFixed(3)} kg</div>
                              <div style={{ fontSize: 11, color: '#2980b9', marginTop: 2 }}>${cMad.toFixed(4)}/kg</div>
                            </div>
                            {hijoL && (() => {
                              const hijoKgNeto = parseFloat(hijoL.kg_inicial||0);
                              const hijoKgInj  = parseFloat(hijoL.kg_inyectado||0);
                              const hijoSp     = Math.max(0, hijoKgInj - hijoKgNeto);
                              const todoSp     = hijoKgNeto === 0 && hijoKgInj > 0;
                              return (
                                <div style={{ background: todoSp ? '#fdf2e9' : '#f0e6ff', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                                  <div style={{ fontSize: 10, color: todoSp ? '#e67e22' : '#6c3483', marginBottom: 4 }}>🔀 {hijoL.corte_nombre}</div>
                                  <div style={{ fontWeight: 900, color: todoSp ? '#e67e22' : '#6c3483', fontSize: 17 }}>{hijoKgNeto.toFixed(3)} kg</div>
                                  {todoSp
                                    ? <div style={{ fontSize: 10, color: '#e67e22', marginTop: 2 }}>todo → subproductos ({hijoSp.toFixed(3)} kg)</div>
                                    : <>
                                        <div style={{ fontSize: 11, color: '#9b59b6', marginTop: 2 }}>${parseFloat(hijoL.costo_mad_kg||0).toFixed(4)}/kg</div>
                                        {hijoSp > 0 && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>+ {hijoSp.toFixed(3)} kg subprod.</div>}
                                      </>
                                  }
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Desglose paso a paso — padre */}
                      {esPadre && (() => {
                        const bloquesRes = madInfo?.bloques_resultado;
                        if (!bloquesRes?.pasos) return null;
                        const bifIdx = bloquesRes.pasos.findIndex(p => p.tipo === 'bifurcacion');
                        const padrePasos = bifIdx >= 0
                          ? bloquesRes.pasos.slice(0, bifIdx + 1)
                          : bloquesRes.pasos;
                        if (padrePasos.length === 0) return null;
                        return (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                              Flujo de costo — paso a paso
                            </div>
                            {padrePasos.map((p, i) => {
                              const prevCostoAcum = i === 0 ? null : (padrePasos[i - 1]?.costoAcum ?? null);
                              const costoKg = (p.tipo === 'bifurcacion')
                                ? (p.costoKg ?? 0)
                                : (p.kgSalida > 0 ? p.costoAcum / p.kgSalida : 0);
                              const COLORS = { inyeccion: '#2980b9', maduracion: '#27ae60', rub: '#8e44ad', adicional: '#f39c12', merma: '#e74c3c', bifurcacion: '#6c3483' };
                              const color = COLORS[p.tipo] || '#555';
                              const LABELS = { inyeccion: 'Inyección', maduracion: 'Maduración', rub: 'Rub/Especias', adicional: 'Adicional', bifurcacion: 'Bifurcación' };
                              const label = p.tipo === 'merma' ? (p.nombre_merma || 'Merma') : (LABELS[p.tipo] || p.tipo);
                              const delta = prevCostoAcum !== null ? p.costoAcum - prevCostoAcum : null;
                              const kgDisplay = p.tipo === 'bifurcacion' ? p.kgPadre : p.kgSalida;
                              return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', marginBottom: 3, background: '#fafafa', borderRadius: 6, fontSize: 11, borderLeft: `3px solid ${color}` }}>
                                  <div>
                                    <span style={{ fontWeight: 600, color }}>{label}</span>
                                    {p.tipo === 'inyeccion' && p.kgSalmuera > 0 && (
                                      <span style={{ color: '#888', marginLeft: 6 }}>+{parseFloat(p.kgSalmuera).toFixed(3)} kg salmuera</span>
                                    )}
                                    {p.tipo === 'merma' && p.kgMermaReal > 0 && (
                                      <span style={{ color: '#888', marginLeft: 6 }}>−{parseFloat(p.kgMermaReal).toFixed(3)} kg</span>
                                    )}
                                    {p.tipo === 'bifurcacion' && (
                                      <span style={{ color: '#888', marginLeft: 6 }}>hijo → {parseFloat(p.kgHijo||0).toFixed(3)} kg</span>
                                    )}
                                    {delta !== null && delta < -0.00005 && (
                                      <span style={{ color: '#27ae60', marginLeft: 6 }}>· −${Math.abs(delta).toFixed(4)} crédito</span>
                                    )}
                                    {delta !== null && delta > 0.00005 && (
                                      <span style={{ color, marginLeft: 6 }}>· +${delta.toFixed(4)}</span>
                                    )}
                                  </div>
                                  <div style={{ textAlign: 'right', fontWeight: 700, color: '#444', whiteSpace: 'nowrap' }}>
                                    {parseFloat(kgDisplay || 0).toFixed(3)} kg
                                    <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>${costoKg.toFixed(4)}/kg</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Separación — vista hijo */}
                      {esHijo && (
                        <div style={{ background: '#faf0ff', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                          {padreL && (
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                              Separado del lote <strong>{padreL.lote_id}</strong> ({padreL.corte_nombre})
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, textAlign: 'center' }}>
                            <div style={{ background: '#ede0ff', borderRadius: 6, padding: '8px 6px' }}>
                              <div style={{ fontSize: 10, color: '#6c3483', marginBottom: 2 }}>Total hijo</div>
                              <div style={{ fontWeight: 700, color: '#6c3483' }}>{parseFloat(l.kg_inyectado||0).toFixed(3)} kg</div>
                            </div>
                            <div style={{ background: '#fff3e0', borderRadius: 6, padding: '8px 6px' }}>
                              <div style={{ fontSize: 10, color: '#e67e22', marginBottom: 2 }}>Subprod.</div>
                              <div style={{ fontWeight: 700, color: '#e67e22' }}>
                                {Math.max(0, parseFloat(l.kg_inyectado||0) - parseFloat(l.kg_inicial||0)).toFixed(3)} kg
                              </div>
                            </div>
                            <div style={{ background: '#e8f8f0', borderRadius: 6, padding: '8px 6px' }}>
                              <div style={{ fontSize: 10, color: '#1a6b3c', marginBottom: 2 }}>Neto</div>
                              <div style={{ fontWeight: 700, color: '#1a6b3c' }}>{parseFloat(l.kg_inicial||0).toFixed(3)} kg</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#555' }}>
                            Costo: <strong>${cMad.toFixed(4)}/kg</strong>
                          </div>
                        </div>
                      )}

                      {/* Desglose paso a paso (flujo dinámico) */}
                      {(() => {
                        const bloquesRes = madInfo?.bloques_resultado;
                        if (!bloquesRes?.pasos) return null;
                        const bifIdx = bloquesRes.pasos.findIndex(p => p.tipo === 'bifurcacion');
                        const hijoSteps = bifIdx >= 0 ? bloquesRes.pasos.slice(bifIdx + 1) : [];
                        if (hijoSteps.length === 0) return null;
                        return (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                              Flujo de costo — paso a paso
                            </div>
                            {hijoSteps.map((p, i) => {
                              const prevCosto = i === 0
                                ? (bloquesRes.pasos[bifIdx]?.costoHijo ?? bloquesRes.pasos[bifIdx]?.costoAcum ?? 0)
                                : (hijoSteps[i - 1]?.costoAcum ?? 0);
                              const costoKg = p.kgSalida > 0 ? p.costoAcum / p.kgSalida : 0;
                              const delta = p.costoAcum - prevCosto; // negativo = crédito, positivo = costo añadido
                              const COLORS = { merma: '#e74c3c', rub: '#8e44ad', adicional: '#f39c12' };
                              const color = COLORS[p.tipo] || '#555';
                              const label = p.tipo === 'merma'
                                ? (p.nombre_merma || 'Merma')
                                : p.tipo === 'rub' ? 'Rub/Especias'
                                : p.tipo === 'adicional' ? 'Adicional'
                                : p.tipo;
                              return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', marginBottom: 3, background: '#fafafa', borderRadius: 6, fontSize: 11, borderLeft: `3px solid ${color}` }}>
                                  <div>
                                    <span style={{ fontWeight: 600, color }}>{label}</span>
                                    {p.tipo === 'merma' && p.kgMermaReal > 0 && (
                                      <span style={{ color: '#888', marginLeft: 6 }}>−{parseFloat(p.kgMermaReal).toFixed(3)} kg</span>
                                    )}
                                    {delta < -0.00005 && (
                                      <span style={{ color: '#27ae60', marginLeft: 6 }}>· −${Math.abs(delta).toFixed(4)} crédito</span>
                                    )}
                                    {delta > 0.00005 && (
                                      <span style={{ color, marginLeft: 6 }}>· +${delta.toFixed(4)}</span>
                                    )}
                                  </div>
                                  <div style={{ textAlign: 'right', fontWeight: 700, color: '#444', whiteSpace: 'nowrap' }}>
                                    {parseFloat(p.kgSalida || 0).toFixed(3)} kg
                                    <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>${costoKg.toFixed(4)}/kg</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Stock disponible */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                        <div style={{ background: '#f0fff4', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>KG disponible</div>
                          <div style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 14 }}>{kgDisp.toFixed(3)} kg</div>
                        </div>
                        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Costo/kg</div>
                          <div style={{ fontWeight: 'bold', color: '#1a6b3c', fontSize: 14 }}>{cMad > 0 ? `$${cMad.toFixed(4)}` : '—'}</div>
                        </div>
                      </div>
                      {l.formula_salmuera && (
                        <div style={{ fontSize: 11, color: '#888', background: '#f8f9fa', borderRadius: 8, padding: '7px 10px', marginTop: 8 }}>
                          Fórmula salmuera: <strong>{l.formula_salmuera}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB CIERRE SIERRA
      ══════════════════════════════════════════ */}
      {tabActivo === 'cierre' && (() => {
        const kgA = parseFloat(cierreKgAserrin)     || 0;
        const pA  = parseFloat(cierrePrecioAserrin) || 0;
        const kgC = parseFloat(cierreKgCarnudo)     || 0;
        const pC  = parseFloat(cierrePrecioCarnudo) || 0;
        const valorSubSim  = (kgA * pA) + (kgC * pC);
        const fiSim        = kgCortesDia > 0 ? valorSubSim / kgCortesDia : 0;
        return (
          <div>
            {/* Formulario cierre */}
            <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 14 }}>
              <div style={{ background: 'linear-gradient(135deg,#5d4037,#8d6e63)', padding: '10px 16px' }}>
                <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🪚 Cierre Sierra Diario</span>
              </div>
              <div style={{ padding: '14px 16px' }}>

                {/* Fecha */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Fecha</label>
                  <input type="date" value={cierreFecha} onChange={e => setCierreFecha(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #8d6e63', fontSize: 14, boxSizing: 'border-box' }} />
                </div>

                {/* Hueso */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Kg Hueso (sin valor comercial)</label>
                  <input type="number" min="0" step="0.001" placeholder="ej: 12.5"
                    value={cierreKgHueso} onChange={e => setCierreKgHueso(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #bdbdbd', fontSize: 14, boxSizing: 'border-box' }} />
                </div>

                {/* Aserrín */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Kg Aserrín</label>
                    <input type="number" min="0" step="0.001" placeholder="ej: 5.0"
                      value={cierreKgAserrin} onChange={e => setCierreKgAserrin(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e67e22', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#e67e22', fontWeight: 600, display: 'block', marginBottom: 4 }}>Precio Aserrín ($/kg)</label>
                    <input type="number" min="0" step="0.01" placeholder="ej: 0.30"
                      value={cierrePrecioAserrin} onChange={e => setCierrePrecioAserrin(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e67e22', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Carnudo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Kg Carnudo</label>
                    <input type="number" min="0" step="0.001" placeholder="ej: 3.0"
                      value={cierreKgCarnudo} onChange={e => setCierreKgCarnudo(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #27ae60', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#27ae60', fontWeight: 600, display: 'block', marginBottom: 4 }}>Precio Carnudo ($/kg)</label>
                    <input type="number" min="0" step="0.01" placeholder="ej: 3.50"
                      value={cierrePrecioCarnudo} onChange={e => setCierrePrecioCarnudo(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #27ae60', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Notas */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
                  <input type="text" placeholder="observaciones del día"
                    value={cierreNotas} onChange={e => setCierreNotas(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </div>

                {/* Resumen pre-guardar */}
                {(kgA > 0 || kgC > 0) && (
                  <div style={{ background: '#fdf3e7', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#8d6e63', marginBottom: 8 }}>Resumen del día ({cierreFecha}):</div>
                    <div style={{ fontSize: 12, color: '#555', lineHeight: 2 }}>
                      {kgA > 0 && pA > 0 && <div>🪵 Aserrín: {kgA} kg × ${pA} = <strong>${(kgA * pA).toFixed(4)}</strong></div>}
                      {kgC > 0 && pC > 0 && <div>🥩 Carnudo: {kgC} kg × ${pC} = <strong>${(kgC * pC).toFixed(4)}</strong></div>}
                      <div style={{ borderTop: '1px solid #e0c9b0', paddingTop: 6, marginTop: 4 }}>
                        Valor subproductos: <strong>${valorSubSim.toFixed(4)}</strong>
                      </div>
                      {kgCortesDia > 0 && (
                        <div>
                          Kg cortes del día: <strong>{kgCortesDia.toFixed(3)} kg</strong><br />
                          <strong style={{ color: '#8d6e63', fontSize: 14 }}>FI = ${fiSim.toFixed(4)}/kg</strong>
                          <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>(crédito por kg de corte)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {errorCierre && <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 10 }}>{errorCierre}</div>}

                <button onClick={guardarCierre} disabled={guardandoCierre}
                  style={{ width: '100%', padding: '12px', background: guardandoCierre ? '#aaa' : '#8d6e63', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: guardandoCierre ? 'default' : 'pointer' }}>
                  {guardandoCierre ? '⏳ Guardando...' : '💾 Guardar cierre del día'}
                </button>
              </div>
            </div>

            {/* Historial cierres */}
            {historicoCierres.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>📋 Historial de Cierres</div>
                {historicoCierres.map((c, i) => (
                  <details key={c.id || i} style={{ background: 'white', borderRadius: 10, marginBottom: 6, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <summary style={{ padding: '10px 14px', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
                      <div>
                        <span style={{ fontWeight: 700, color: '#5d4037', marginRight: 10 }}>{c.fecha}</span>
                        {c.kg_cortes_producidos > 0 && <span style={{ fontSize: 11, color: '#888' }}>{parseFloat(c.kg_cortes_producidos).toFixed(1)} kg cortes</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {c.factor_impacto_kg > 0 && <span style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 13 }}>FI ${parseFloat(c.factor_impacto_kg).toFixed(4)}</span>}
                        <span style={{ fontWeight: 'bold', color: '#555', fontSize: 12 }}>${parseFloat(c.valor_subproductos || 0).toFixed(4)}</span>
                        <span style={{ color: '#bbb' }}>▼</span>
                      </div>
                    </summary>
                    <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', background: '#fafafa', fontSize: 12, color: '#555', lineHeight: 2.2 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '2px 16px' }}>
                        {c.kg_hueso > 0 && <div>🦴 Hueso: <strong>{parseFloat(c.kg_hueso).toFixed(3)} kg</strong></div>}
                        {c.kg_aserrin > 0 && <div>🪵 Aserrín: <strong>{parseFloat(c.kg_aserrin).toFixed(3)} kg</strong> @ ${parseFloat(c.precio_aserrin_kg||0).toFixed(4)}</div>}
                        {c.kg_carnudo > 0 && <div>🥩 Carnudo: <strong>{parseFloat(c.kg_carnudo).toFixed(3)} kg</strong> @ ${parseFloat(c.precio_carnudo_kg||0).toFixed(4)}</div>}
                        {c.kg_cortes_producidos > 0 && <div>📦 Kg cortes: <strong>{parseFloat(c.kg_cortes_producidos).toFixed(3)}</strong></div>}
                        <div>💰 Subproductos: <strong>${parseFloat(c.valor_subproductos||0).toFixed(4)}</strong></div>
                        {c.factor_impacto_kg > 0 && <div style={{ color: '#27ae60' }}>⚖️ FI: <strong>${parseFloat(c.factor_impacto_kg).toFixed(4)}/kg</strong></div>}
                      </div>
                      {c.notas && <div style={{ marginTop: 6, color: '#888', fontStyle: 'italic' }}>"{c.notas}"</div>}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          TAB HISTORIAL
      ══════════════════════════════════════════ */}
      {tabActivo === 'historial' && (
        <div>
          {lotesStock.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', background: 'white', borderRadius: 12 }}>
              Sin historial de producción
            </div>
          ) : (
            lotesStock.map((l, i) => {
              const kgInj  = parseFloat(l.kg_inyectado  || 0);
              const kgMad  = parseFloat(l.kg_inicial     || 0);
              const kgDisp = parseFloat(l.kg_disponible  || l.kg_inicial || 0);
              const mermaP = kgInj > 0 ? ((kgInj - kgMad) / kgInj * 100).toFixed(1) : null;
              const cIny   = parseFloat(l.costo_iny_kg  || 0);
              const cMad   = parseFloat(l.costo_mad_kg  || 0);
              const cTotal = parseFloat(l.costo_total   || 0);
              return (
                <details key={l.id || i} style={{ background: 'white', borderRadius: 10, marginBottom: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <summary style={{ padding: '12px 16px', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: '#1a1a2e', marginRight: 10 }}>{l.lote_id}</span>
                      <span style={{ fontSize: 11, color: '#888' }}>{l.fecha_entrada}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {cMad > 0 && <span style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 13 }}>${cMad.toFixed(4)}/kg</span>}
                      <span style={{ fontWeight: 'bold', color: '#555' }}>{kgDisp.toFixed(2)} kg</span>
                      <span style={{ color: '#bbb' }}>▼</span>
                    </div>
                  </summary>
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px 20px', fontSize: 12, lineHeight: 2.2, color: '#555' }}>
                      <div>💉 KG Inyectado: <strong>{kgInj > 0 ? `${kgInj.toFixed(3)} kg` : '—'}</strong></div>
                      <div>🧊 KG Madurado: <strong>{kgMad.toFixed(3)} kg</strong></div>
                      {mermaP !== null && <div>📉 Merma: <strong style={{ color: '#e74c3c' }}>{mermaP}%</strong></div>}
                      <div>📦 KG disponible: <strong>{kgDisp.toFixed(3)} kg</strong></div>
                      {cTotal > 0 && <div>💰 Costo total: <strong>${cTotal.toFixed(4)}</strong></div>}
                      {cIny > 0 && <div>📊 C_iny/kg: <strong style={{ color: '#2980b9' }}>${cIny.toFixed(4)}</strong></div>}
                      {cMad > 0 && <div>📊 C_mad/kg: <strong style={{ color: '#27ae60' }}>${cMad.toFixed(4)}</strong></div>}
                      {l.formula_salmuera && <div>🧂 Fórmula: <strong>{l.formula_salmuera}</strong></div>}
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      )}

      {/* ══ Modal Versiones ══ */}
      {modalVer && (() => {
        const esPruebas = tabActivo === 'pruebas';
        const versionesFormula = esPruebas
          ? versiones.filter(v => v.tipo === 'prueba')
          : versiones.filter(v => v.tipo === 'formula');
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e' }}>🔄 Versiones guardadas</div>
                <button onClick={() => { setModalVer(false); setVerDetalle(null); }} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
              </div>
              {versionesFormula.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>Sin versiones — usa "Guardar Historial" en modo edición para guardar una</div>
              ) : (
                versionesFormula.map((v, i) => {
                  const expandido = verDetalle === i;
                  return (
                    <div key={i} style={{ background: '#f8f9fa', borderRadius: 12, marginBottom: 10, overflow: 'hidden', border: expandido ? '2px solid #8e44ad' : '1px solid #e0e0e0' }}>
                      <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>Versión {versionesFormula.length - i} — {v.fecha}</div>
                          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                            {v.tipo === 'prueba'
                              ? (() => {
                                  const fundas = v.fundas || (v.gramos_funda ? [{ kg: v.gramos_funda }] : []);
                                  return fundas.length > 0
                                    ? `${fundas.length} funda${fundas.length > 1 ? 's' : ''}: ${fundas.map(f => (parseFloat(f.kg)*1000).toFixed(0)+'g').join(', ')} · base $${parseFloat(v.c_base||0).toFixed(4)}/kg`
                                    : '—';
                                })()
                              : v.tipo_corte === 'padre' || v.tipo_corte === 'independiente'
                                ? `Inj ${v.pct_inj || 0}% · Mad ${v.pct_mad || 0}% · Sal: ${v.formula_salmuera || '—'}`
                                : `Res 2a ${v.pct_res_segunda || 0}% · Puntas ${v.pct_puntas || 0}% · Desecho ${v.pct_desecho || 0}%`
                            }
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setVerDetalle(expandido ? null : i)}
                            style={{ background: expandido ? '#f0e6ff' : 'white', color: '#8e44ad', border: '1.5px solid #8e44ad', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                            {expandido ? '▲ Ocultar' : '▼ Ver'}
                          </button>
                          <button onClick={() => restaurarVersion(v)}
                            style={{ background: '#8e44ad', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                            Restaurar
                          </button>
                          <button onClick={() => eliminarVersionCorte(i)}
                            style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                            🗑
                          </button>
                        </div>
                      </div>
                      {expandido && (
                        <div style={{ borderTop: '1px solid #e0e0e0', padding: '12px 16px', background: 'white', fontSize: 12, color: '#555' }}>
                          {v.tipo === 'prueba' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(v.fundas || (v.gramos_funda ? [{ kg: v.gramos_funda, emp_nombre: v.emp_nombre, eti_nombre: v.eti_nombre, c_total: v.c_total }] : [])).map((f, fi) => (
                                <div key={fi} style={{ background: '#f9f5ff', borderRadius: 7, padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700, color: '#6c3483' }}>{(parseFloat(f.kg)*1000).toFixed(0)}g</span>
                                  <span style={{ color: '#888' }}>{f.emp_nombre || '—'} · {f.eti_nombre || '—'}</span>
                                  <span style={{ fontWeight: 700 }}>${parseFloat(f.c_total||0).toFixed(4)}/funda</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', lineHeight: 2 }}>
                              {v.pct_inj   > 0 && <div>💉 Inyección: <strong>{v.pct_inj}%</strong></div>}
                              {v.pct_mad   > 0 && <div>🧊 Merma mad: <strong>{v.pct_mad}%</strong></div>}
                              {v.formula_salmuera && <div>🧂 Fórmula sal: <strong>{v.formula_salmuera}</strong></div>}
                              {v.precio_kg_salmuera > 0 && <div>💧 $/kg sal: <strong>${v.precio_kg_salmuera.toFixed(4)}</strong></div>}
                              {v.pct_rub   > 0 && <div>🌶️ Rub: <strong>{v.pct_rub}%</strong></div>}
                              {v.costo_rub_kg > 0 && <div>💰 $/kg rub: <strong>${v.costo_rub_kg}</strong></div>}
                              {(v.pct_res_segunda||0) > 0 && <div>🟢 Res 2a: <strong>{v.pct_res_segunda}%</strong></div>}
                              {(v.pct_puntas||0) > 0 && <div>🟡 Puntas: <strong>{v.pct_puntas}%</strong></div>}
                              {(v.pct_desecho||0) > 0 && <div>🔴 Desecho: <strong>{v.pct_desecho}%</strong></div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
