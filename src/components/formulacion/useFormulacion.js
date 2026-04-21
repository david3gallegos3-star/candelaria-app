// ============================================
// useFormulacion.js
// Hook con todo el estado y lógica
// ============================================
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { crearNotificacion } from '../../utils/helpers';
import * as XLSX from 'xlsx';
import { norm, isMobile } from './FormulacionInputs';

export function useFormulacion({ producto, userRol, currentUser }) {

  // ── Estado ────────────────────────────────────────────────
  const [ingredientesMP,     setIngredientesMP]     = useState([]);
  const [ingredientesAD,     setIngredientesAD]     = useState([]);
  const [materiasPrimas,     setMateriasPrimas]     = useState([]);
  const [mobile,             setMobile]             = useState(isMobile());
  const [config,             setConfig]             = useState({
    fecha: new Date().toISOString().split('T')[0],
    num_paradas:1, porcentaje_salmuera:20, merma:0.07, margen:0.15, mod_cif_kg:0.487,
    empaque_nombre:'', empaque_precio_kg:0,
    empaque_cantidad:1, empaque_unidad:'Madejas',
    hilo_nombre:'', hilo_precio_kg:0, hilo_kg:0, fundas:[]
  });
  const [buscador,           setBuscador]           = useState({ abierto:false, tipo:'', indice:null, texto:'' });
  const [guardando,          setGuardando]          = useState(false);
  const [autoGuardando,      setAutoGuardando]      = useState(false);
  const [msgExito,           setMsgExito]           = useState('');
  const [modoEdicion,        setModoEdicion]        = useState(false);
  const [guardandoHistorial, setGuardandoHistorial] = useState(false);
  const [seccionActiva,      setSeccionActiva]      = useState('formula');
  const [modalNota,          setModalNota]          = useState(false);
  const [textoNota,          setTextoNota]          = useState('');
  const [enviandoNota,       setEnviandoNota]       = useState(false);
  const [dragIdx,            setDragIdx]            = useState(null);
  const [dragSec,            setDragSec]            = useState(null);
  const [dragOverIdx,        setDragOverIdx]        = useState(null);
  const [comparadorAbierto,  setComparadorAbierto]  = useState(false);
  const [fechasDisponibles,  setFechasDisponibles]  = useState([]);
  const [fechaComparar,      setFechaComparar]      = useState('');
  const [formulaAnterior,    setFormulaAnterior]    = useState(null);
  const [cargandoCompar,     setCargandoCompar]     = useState(false);
  const [cifItems,           setCifItems]           = useState([]);
  const [produccionKg,       setProduccionKg]       = useState(13600);

  // ── Refs ──────────────────────────────────────────────────
  const autoSaveTimer = useRef(null);
  const ingMPRef      = useRef(ingredientesMP);
  const ingADRef      = useRef(ingredientesAD);
  const configRef     = useRef(config);
  const modoRef       = useRef(modoEdicion);
  const mpRef         = useRef([]);

  // ── Sync refs ─────────────────────────────────────────────
  useEffect(() => { ingMPRef.current  = ingredientesMP; }, [ingredientesMP]);
  useEffect(() => { ingADRef.current  = ingredientesAD; }, [ingredientesAD]);
  useEffect(() => { configRef.current = config;         }, [config]);
  useEffect(() => { modoRef.current   = modoEdicion;    }, [modoEdicion]);
  useEffect(() => { mpRef.current     = materiasPrimas; }, [materiasPrimas]);

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    cargarDatos();
    cargarFechasHistorial();
    cargarCIF();
    const onResize = () => setMobile(isMobile());
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [producto]);

  useEffect(() => {
    const channel = supabase
      .channel('materias-primas-changes')
      .on('postgres_changes', {
        event:'*', schema:'public', table:'materias_primas'
      }, () => {
        supabase.from('materias_primas').select('*').order('nombre')
          .then(({ data }) => {
            if (data) { setMateriasPrimas(data); mpRef.current = data; }
          });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [producto]);

  // ── CIF ───────────────────────────────────────────────────
  async function cargarCIF() {
    const { data: cif } = await supabase.from('cif_items').select('*');
    const { data: cfg } = await supabase.from('costos_mod_cif').select('*').single();
    setCifItems(cif || []);
    if (cfg) setProduccionKg(cfg.produccion_kg || 13600);
  }

  function getPrecioAgua() {
    const agua = cifItems.find(c => norm(c.detalle) === 'agua');
    if (!agua || !produccionKg) return 0;
    return (parseFloat(agua.valor_mes) || 0) / produccionKg;
  }

  // ── Auto guardado ─────────────────────────────────────────
  function programarAutoGuardado() {
    if (!modoRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (modoRef.current) guardarSilencioso();
    }, 10000);
  }

  // ── Precio live ───────────────────────────────────────────
  function obtenerPrecioLive(fila, mpList) {
    if (fila.materia_prima_id) {
      const mp = (mpList || mpRef.current).find(m => m.id === fila.materia_prima_id);
      if (mp) {
        if (mp.categoria?.toUpperCase().includes('AGUA')) return getPrecioAgua();
        return parseFloat(mp.precio_kg) || 0;
      }
    }
    const n     = norm(fila.ingrediente_nombre);
    const lista = mpList || mpRef.current;
    const mp    = lista.find(m =>
      norm(m.nombre_producto) === n || norm(m.nombre) === n ||
      (norm(m.nombre_producto) && n.includes(norm(m.nombre_producto)) && norm(m.nombre_producto).length > 4) ||
      (n.length > 4 && norm(m.nombre).includes(n))
    );
    if (mp) {
      if (mp.categoria?.toUpperCase().includes('AGUA')) return getPrecioAgua();
      return parseFloat(mp.precio_kg) || 0;
    }
    return 0;
  }

  // ── Cálculo con refs ──────────────────────────────────────
  function calcularPrecioConRefs() {
    const cfg    = configRef.current;
    const mpList = mpRef.current;
    const all    = [...ingMPRef.current, ...ingADRef.current];
    const totalKg     = all.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0) / 1000;
    const costoMP     = all.reduce((s, f) => s + (parseFloat(f.gramos) / 1000) * obtenerPrecioLive(f, mpList), 0);
    const costoMPkg   = totalKg > 0 ? costoMP / totalKg : 0;
    const merma       = parseFloat(cfg.merma)      || 0.07;
    const margen      = parseFloat(cfg.margen)     || 0.15;
    const modCif      = parseFloat(cfg.mod_cif_kg) || 0;
    const costoConMerma = (1 - merma) > 0 ? costoMPkg / (1 - merma) : 0;
    const empPrecio   = parseFloat(cfg.empaque_precio_kg) || 0;
    const empCantidad = parseFloat(cfg.empaque_cantidad)  || 0;
    const costoEmpKg  = totalKg > 0 ? (empPrecio * empCantidad) / totalKg : 0;
    const hiloPrecio  = parseFloat(cfg.hilo_precio_kg) || 0;
    const hiloKg      = parseFloat(cfg.hilo_kg)        || 0;
    const costoHiloKg = totalKg > 0 ? (hiloPrecio * hiloKg) / totalKg : 0;
    const costoTotalKg = costoConMerma + modCif + costoEmpKg + costoHiloKg;
    return { precioVentaKg: margen < 1 ? costoTotalKg / (1 - margen) : 0, costoTotalKg };
  }

  // ── Guardar silencioso ────────────────────────────────────
  async function guardarSilencioso() {
    const mpActuales = ingMPRef.current.filter(f => f.ingrediente_nombre);
    const adActuales = ingADRef.current.filter(f => f.ingrediente_nombre);
    if (mpActuales.length === 0 && adActuales.length === 0) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    try {
      setAutoGuardando(true);
      const filas = [
        ...mpActuales.map((f, i) => ({
          producto_nombre: producto.nombre, producto_id: producto.id,
          seccion:'MP', orden:i,
          ingrediente_nombre: f.ingrediente_nombre,
          materia_prima_id:   f.materia_prima_id || null,
          gramos:         parseFloat(f.gramos) || 0,
          kilos:         (parseFloat(f.gramos) || 0) / 1000,
          nota_cambio:    f.nota_cambio    || '',
          especificacion: f.especificacion || ''
        })),
        ...adActuales.map((f, i) => ({
          producto_nombre: producto.nombre, producto_id: producto.id,
          seccion:'AD', orden:i,
          ingrediente_nombre: f.ingrediente_nombre,
          materia_prima_id:   f.materia_prima_id || null,
          gramos:         parseFloat(f.gramos) || 0,
          kilos:         (parseFloat(f.gramos) || 0) / 1000,
          nota_cambio:    f.nota_cambio    || '',
          especificacion: f.especificacion || ''
        }))
      ];
      if (filas.length > 0) {
        await supabase.from('formulaciones').delete().eq('producto_nombre', producto.nombre);
        await supabase.from('formulaciones').insert(filas);
      }
      const { precioVentaKg: pvk, costoTotalKg: ctk } = calcularPrecioConRefs();
      const cfg = configRef.current;
      await supabase.from('config_productos').upsert([{
        producto_nombre:  producto.nombre,
        producto_id:      producto.id,
        fecha:            cfg.fecha,
        num_paradas:           cfg.num_paradas,
        porcentaje_salmuera:   cfg.porcentaje_salmuera ?? 20,
        merma:            cfg.merma,
        margen:           cfg.margen,
        mod_cif_kg:       cfg.mod_cif_kg,
        empaque_nombre:   cfg.empaque_nombre,
        empaque_precio_kg:cfg.empaque_precio_kg,
        empaque_cantidad: cfg.empaque_cantidad,
        empaque_unidad:   cfg.empaque_unidad,
        hilo_nombre:      cfg.hilo_nombre,
        hilo_precio_kg:   cfg.hilo_precio_kg,
        hilo_kg:          cfg.hilo_kg,
        fundas:           cfg.fundas || [],
        precio_venta_kg:  pvk,
        costo_total_kg:   ctk
      }], { onConflict:'producto_nombre' });
      setAutoGuardando(false);
    } catch(e) { setAutoGuardando(false); }
  }

  // ── Cargar datos ──────────────────────────────────────────
  async function cargarDatos() {
    const { data: mp } = await supabase.from('materias_primas').select('*').order('nombre');
    const mpList = mp || [];
    setMateriasPrimas(mpList);
    const { data: form } = await supabase.from('formulaciones').select('*')
      .eq('producto_nombre', producto.nombre).order('orden');
    if (form && form.length > 0) {
      const enriquecido = form.map(f => ({
        ...f, especificacion: f.especificacion || '',
        precio_kg: obtenerPrecioLive(f, mpList),
        costo:    (parseFloat(f.gramos) / 1000) * obtenerPrecioLive(f, mpList)
      }));
      setIngredientesMP(enriquecido.filter(f => f.seccion === 'MP'));
      setIngredientesAD(enriquecido.filter(f => f.seccion === 'AD'));
    } else {
      setIngredientesMP([filaVacia('MP', 0)]);
      setIngredientesAD([filaVacia('AD', 0)]);
    }
    const { data: cfg } = await supabase.from('config_productos').select('*')
      .eq('producto_nombre', producto.nombre).single();
    if (cfg) setConfig(prev => ({
      ...prev, ...cfg,
      fundas: cfg.fundas || [],
      mod_cif_kg: cfg.mod_cif_kg || 0.487
    }));
  }

  async function cargarFechasHistorial() {
    const { data } = await supabase.from('historial_general').select('fecha')
      .eq('producto_nombre', producto.nombre)
      .order('fecha', { ascending:false });
    if (data) {
      const fechasUnicas = [...new Set(data.map(d => d.fecha))];
      setFechasDisponibles(fechasUnicas);
      if (fechasUnicas.length > 0) setFechaComparar(fechasUnicas[0]);
    }
  }

  async function cargarFormulaAnterior() {
    if (!fechaComparar) return alert('Selecciona una fecha');
    setCargandoCompar(true);
    const { data } = await supabase.from('historial_general').select('*')
      .eq('producto_nombre', producto.nombre)
      .eq('fecha', fechaComparar)
      .order('seccion').order('id');
    if (data && data.length > 0)
      setFormulaAnterior({ fecha:fechaComparar, filas:data });
    else
      alert(`No hay fórmula guardada para ${fechaComparar}`);
    setCargandoCompar(false);
  }

  function filaVacia(seccion, orden) {
    return {
      seccion, orden, ingrediente_nombre:'',
      materia_prima_id:null, gramos:0, kilos:0,
      precio_kg:0, costo:0, nota_cambio:'', especificacion:''
    };
  }

  // ── Cálculos reactivos ────────────────────────────────────
  const totMP = {
    gramos: ingredientesMP.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0),
    costo:  ingredientesMP.reduce((s, i) =>
      s + (parseFloat(i.gramos) / 1000) * obtenerPrecioLive(i, materiasPrimas), 0)
  };
  const totAD = {
    gramos: ingredientesAD.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0),
    costo:  ingredientesAD.reduce((s, i) =>
      s + (parseFloat(i.gramos) / 1000) * obtenerPrecioLive(i, materiasPrimas), 0)
  };
  const totalCrudoG    = totMP.gramos + totAD.gramos;
  const totalCrudoKg   = totalCrudoG / 1000;
  const totalCostoMP   = totMP.costo  + totAD.costo;
  const costoMPkg      = totalCrudoKg > 0 ? totalCostoMP / totalCrudoKg : 0;
  const merma          = parseFloat(config.merma)      || 0;
  const margen         = parseFloat(config.margen)     || 0;
  const modCif         = parseFloat(config.mod_cif_kg) || 0;
  const costoConMerma  = (1 - merma) > 0 ? costoMPkg / (1 - merma) : 0;
  const empPrecio      = parseFloat(config.empaque_precio_kg) || 0;
  const empCantidad    = parseFloat(config.empaque_cantidad)  || 0;
  const costoEmpaqueKg = totalCrudoKg > 0 ? (empPrecio * empCantidad) / totalCrudoKg : 0;
  const hiloPrecio     = parseFloat(config.hilo_precio_kg) || 0;
  const hiloKg         = parseFloat(config.hilo_kg)        || 0;
  const costoAmarreKg  = totalCrudoKg > 0 ? (hiloPrecio * hiloKg) / totalCrudoKg : 0;
  const costoTotalKg   = costoConMerma + modCif + costoEmpaqueKg + costoAmarreKg;
  const precioVentaKg       = margen < 1 ? costoTotalKg / (1 - margen) : 0;
  const precioVentaSalmuera = margen < 1 ? costoMPkg / (1 - margen) : 0;

  // Sincronizar precio_kg en materias_primas cuando cambia el costo de una salmuera
  useEffect(() => {
    if (producto?.categoria !== 'SALMUERAS') return;
    if (precioVentaSalmuera <= 0) return;
    const timer = setTimeout(async () => {
      await supabase.from('materias_primas')
        .update({ precio_kg: precioVentaSalmuera })
        .eq('nombre_producto', producto.nombre)
        .eq('categoria', 'Salmuera');
    }, 3000);
    return () => clearTimeout(timer);
  }, [precioVentaSalmuera, producto?.nombre, producto?.categoria]);

  function precioFunda(f) {
  const kgFunda     = parseFloat(f.kg_por_funda)    || 1;
  const costoFunda  = parseFloat(f.precio_funda)    || 0;
  const costoEtiq   = parseFloat(f.precio_etiqueta) || 0;
  const costoTotal  = costoTotalKg * kgFunda + costoFunda + costoEtiq;
  return margen < 1 ? costoTotal / (1 - margen) : 0;
  }

  // ── Drag & Drop ───────────────────────────────────────────
  function handleDragStart(sec, idx) { setDragIdx(idx); setDragSec(sec); }
  function handleDragOver(e, sec, idx) {
    e.preventDefault();
    if (sec === dragSec) setDragOverIdx(idx);
  }
  function handleDrop(sec, idx) {
    if (dragSec !== sec || dragIdx === null || dragIdx === idx) {
      setDragIdx(null); setDragSec(null); setDragOverIdx(null); return;
    }
    const lista = sec === 'MP' ? [...ingredientesMP] : [...ingredientesAD];
    const [item] = lista.splice(dragIdx, 1);
    lista.splice(idx, 0, item);
    const reordenado = lista.map((f, i) => ({ ...f, orden:i }));
    sec === 'MP' ? setIngredientesMP(reordenado) : setIngredientesAD(reordenado);
    setDragIdx(null); setDragSec(null); setDragOverIdx(null);
    programarAutoGuardado();
  }

  // ── Acciones ingredientes ─────────────────────────────────
  function actualizarIng(seccion, idx, campo, valor) {
    if (!modoEdicion) return;
    const lista = seccion === 'MP' ? [...ingredientesMP] : [...ingredientesAD];
    lista[idx] = { ...lista[idx], [campo]: valor };
    if (campo === 'gramos') {
      const p = obtenerPrecioLive(lista[idx], materiasPrimas);
      lista[idx].costo = (parseFloat(valor) / 1000) * p;
    }
    seccion === 'MP' ? setIngredientesMP(lista) : setIngredientesAD(lista);
    programarAutoGuardado();
  }

  function agregarFila(sec) {
    if (!modoEdicion) return;
    sec === 'MP'
      ? setIngredientesMP([...ingredientesMP, filaVacia('MP', ingredientesMP.length)])
      : setIngredientesAD([...ingredientesAD, filaVacia('AD', ingredientesAD.length)]);
  }

  function eliminarFila(sec, idx) {
    if (!modoEdicion) return;
    sec === 'MP'
      ? setIngredientesMP(ingredientesMP.filter((_, i) => i !== idx))
      : setIngredientesAD(ingredientesAD.filter((_, i) => i !== idx));
    programarAutoGuardado();
  }

  function seleccionarMP(mp) {
    if (!modoEdicion && (buscador.tipo === 'MP' || buscador.tipo === 'AD')) {
      setBuscador({ abierto:false, tipo:'', indice:null, texto:'' }); return;
    }
    const { tipo, indice } = buscador;
    const esAgua = mp.categoria?.toUpperCase().includes('AGUA');
    const precio = esAgua ? getPrecioAgua() : (parseFloat(mp.precio_kg) || 0);
    if (tipo === 'MP' || tipo === 'AD') {
      const lista = tipo === 'MP' ? [...ingredientesMP] : [...ingredientesAD];
      lista[indice] = {
        ...lista[indice],
        ingrediente_nombre: mp.nombre_producto || mp.nombre,
        materia_prima_id: mp.id, precio_kg: precio,
        costo: (parseFloat(lista[indice].gramos) / 1000) * precio
      };
      tipo === 'MP' ? setIngredientesMP(lista) : setIngredientesAD(lista);
    } else if (tipo === 'empaque') {
      setConfig(prev => ({
        ...prev,
        empaque_nombre:    mp.nombre_producto || mp.nombre,
        empaque_precio_kg: parseFloat(mp.precio_kg) || 0
      }));
    } else if (tipo === 'hilo') {
      setConfig(prev => ({
        ...prev,
        hilo_nombre:    mp.nombre_producto || mp.nombre,
        hilo_precio_kg: parseFloat(mp.precio_kg) || 0
      }));
    } else if (tipo === 'funda') {
      const f = [...(config.fundas || [])];
      f[indice] = { ...f[indice], nombre_funda: mp.nombre_producto || mp.nombre, precio_funda: parseFloat(mp.precio_kg) || 0 };
      setConfig(prev => ({ ...prev, fundas: f }));
    } else if (tipo === 'etiqueta') {
      const f = [...(config.fundas || [])];
      f[indice] = { ...f[indice], nombre_etiqueta: mp.nombre_producto || mp.nombre, precio_etiqueta: parseFloat(mp.precio_kg) || 0 };
      setConfig(prev => ({ ...prev, fundas: f }));
    }
    setBuscador({ abierto:false, tipo:'', indice:null, texto:'' });
    programarAutoGuardado();
  }

  // ── Guardar ───────────────────────────────────────────────
  async function guardar() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setGuardando(true);
    await guardarSilencioso();
    setGuardando(false);
    setModoEdicion(false);
    setMsgExito('✅ Fórmula fijada correctamente');
    setTimeout(() => setMsgExito(''), 4000);
  }

  async function guardarHistorial() {
    setGuardandoHistorial(true);
    const ahora     = new Date();
    const fechaHoy  = ahora.toISOString().split('T')[0];   // '2026-04-15'
    const horaAhora = ahora.toTimeString().slice(0, 5);    // '14:30'
    let fechaGuardar = fechaHoy;

    // ¿Ya hay versiones guardadas hoy?
    const { data: versionesHoy } = await supabase.from('historial_general')
      .select('fecha').eq('producto_nombre', producto.nombre)
      .like('fecha', `${fechaHoy}%`).limit(1);

    if (versionesHoy && versionesHoy.length > 0) {
      const usarHora = window.confirm(
        `⚠️ Ya existe una versión guardada hoy (${fechaHoy}).\n\n` +
        `✅ OK       → Guardar como nueva versión con hora: ${horaAhora}\n` +
        `❌ Cancelar → Ver opción de sobreescribir`
      );
      if (usarHora) {
        fechaGuardar = `${fechaHoy} ${horaAhora}`;
      } else {
        const sobreescribir = window.confirm(
          `¿Sobreescribir todas las versiones del ${fechaHoy}?\n\n` +
          `✅ OK       → Reemplazar con la fórmula actual\n` +
          `❌ Cancelar → No guardar`
        );
        if (!sobreescribir) { setGuardandoHistorial(false); return; }
        await supabase.from('historial_general').delete()
          .eq('producto_nombre', producto.nombre)
          .like('fecha', `${fechaHoy}%`);
        fechaGuardar = fechaHoy;
      }
    }

    const filasNuevas = [
      ...ingredientesMP.map(f => ({
        fecha: fechaGuardar, producto_nombre: producto.nombre,
        ingrediente_nombre: f.ingrediente_nombre,
        materia_prima_id: f.materia_prima_id || null,
        gramos: parseFloat(f.gramos) || 0,
        kilos:  (parseFloat(f.gramos) || 0) / 1000,
        nota_cambio: f.nota_cambio || '',
        seccion:'MATERIAS PRIMAS'
      })),
      ...ingredientesAD.map(f => ({
        fecha: fechaGuardar, producto_nombre: producto.nombre,
        ingrediente_nombre: f.ingrediente_nombre,
        materia_prima_id: f.materia_prima_id || null,
        gramos: parseFloat(f.gramos) || 0,
        kilos:  (parseFloat(f.gramos) || 0) / 1000,
        nota_cambio: f.nota_cambio || '',
        seccion:'CONDIMENTOS Y ADITIVOS'
      }))
    ].filter(f => f.ingrediente_nombre);

    if (filasNuevas.length === 0) { setGuardandoHistorial(false); return; }

    await supabase.from('historial_general').insert(filasNuevas);
    setMsgExito(`✅ Versión guardada (${fechaGuardar}) — ${filasNuevas.length} ingredientes`);
    setGuardandoHistorial(false);
    await cargarFechasHistorial();
    setTimeout(() => setMsgExito(''), 5000);
  }

  async function enviarNota() {
    if (!textoNota.trim()) return;
    setEnviandoNota(true);
    try {
      await crearNotificacion({
        tipo:'nota_formulador', origen:'formulacion',
        usuario_nombre: userRol?.nombre || 'Formulador',
        user_id: currentUser?.id,
        producto_nombre: producto.nombre,
        mensaje: textoNota.trim()
      });
      setModalNota(false); setTextoNota('');
      setMsgExito('✅ Nota enviada al administrador');
      setTimeout(() => setMsgExito(''), 4000);
    } catch(e) { alert('Error al enviar nota'); }
    setEnviandoNota(false);
  }

  // ── Excel ─────────────────────────────────────────────────
  function descargarExcel() {
    const nombreConEspec = (ing) => {
      const spec = ing.especificacion?.trim();
      return ing.ingrediente_nombre + (spec ? ` (${spec})` : '');
    };
    const filaVaciaXL = () => ({
      'SECCIÓN':'','DETALLE':'','GRAMOS':'','KILOS':'',
      '% TOTAL':'','$/KG':'','COSTO $':'','NOTA':''
    });
    const sep = (titulo) => ({
      'SECCIÓN':`── ${titulo} ──`,'DETALLE':'','GRAMOS':'',
      'KILOS':'','% TOTAL':'','$/KG':'','COSTO $':'','NOTA':''
    });
    const mapIng = (ing, seccion) => {
      const g = parseFloat(ing.gramos) || 0;
      const p = obtenerPrecioLive(ing, materiasPrimas);
      return {
        'SECCIÓN': seccion,
        'DETALLE': nombreConEspec(ing),
        'GRAMOS':  Math.round(g),
        'KILOS':   parseFloat((g/1000).toFixed(3)),
        '% TOTAL': totalCrudoG > 0 ? parseFloat(((g/totalCrudoG)*100).toFixed(2)) : 0,
        '$/KG':    parseFloat(p.toFixed(4)),
        'COSTO $': parseFloat(((g/1000)*p).toFixed(4)),
        'NOTA':    ing.nota_cambio || ''
      };
    };
    const datos = [
      ...ingredientesMP.filter(i => i.ingrediente_nombre).map(i => mapIng(i,'MATERIAS PRIMAS')),
      { 'SECCIÓN':'','DETALLE':'SUB-TOTAL MATERIAS PRIMAS','GRAMOS':Math.round(totMP.gramos),'KILOS':parseFloat((totMP.gramos/1000).toFixed(3)),'% TOTAL':totalCrudoG>0?parseFloat(((totMP.gramos/totalCrudoG)*100).toFixed(2)):0,'$/KG':'','COSTO $':parseFloat(totMP.costo.toFixed(4)),'NOTA':'' },
      filaVaciaXL(),
      ...ingredientesAD.filter(i => i.ingrediente_nombre).map(i => mapIng(i,'CONDIMENTOS Y ADITIVOS')),
      { 'SECCIÓN':'','DETALLE':'SUB-TOTAL CONDIMENTOS','GRAMOS':Math.round(totAD.gramos),'KILOS':parseFloat((totAD.gramos/1000).toFixed(3)),'% TOTAL':totalCrudoG>0?parseFloat(((totAD.gramos/totalCrudoG)*100).toFixed(2)):0,'$/KG':'','COSTO $':parseFloat(totAD.costo.toFixed(4)),'NOTA':'' },
      filaVaciaXL(),
      { 'SECCIÓN':'','DETALLE':'TOTAL CRUDO','GRAMOS':Math.round(totalCrudoG),'KILOS':parseFloat(totalCrudoKg.toFixed(3)),'% TOTAL':100,'$/KG':'','COSTO $':parseFloat(totalCostoMP.toFixed(4)),'NOTA':'' },
      filaVaciaXL(), sep('COSTOS Y AJUSTES'),
      { 'SECCIÓN':'COSTOS','DETALLE':'Merma %','% TOTAL':((merma||0)*100).toFixed(0)+'%','GRAMOS':'','KILOS':'','$/KG':'','COSTO $':'','NOTA':'' },
      { 'SECCIÓN':'COSTOS','DETALLE':'Margen %','% TOTAL':((margen||0)*100).toFixed(0)+'%','GRAMOS':'','KILOS':'','$/KG':'','COSTO $':'','NOTA':'' },
      { 'SECCIÓN':'COSTOS','DETALLE':'PRECIO VENTA/KG','$/KG':precioVentaKg.toFixed(4),'GRAMOS':'','KILOS':'','% TOTAL':'','COSTO $':'','NOTA':'' },
    ];
    const ws = XLSX.utils.json_to_sheet(datos);
    ws['!cols'] = [{wch:22},{wch:35},{wch:10},{wch:10},{wch:10},{wch:12},{wch:12},{wch:25}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, producto.nombre.substring(0,31));
    XLSX.writeFile(wb, `${producto.nombre}_${config.fecha||'formula'}.xlsx`);
  }

  // ── Imprimir ──────────────────────────────────────────────
  function imprimir() {
    const ventana = window.open('', '_blank');
    const nombreConEspec = (ing) => {
      const spec = ing.especificacion?.trim();
      return ing.ingrediente_nombre + (spec ? ` (${spec})` : '');
    };
    const COLGROUP = `<colgroup><col style="width:38%"/><col style="width:31%"/><col style="width:31%"/></colgroup>`;
    const fila = (ing) => {
      const g = parseFloat(ing.gramos) || 0;
      return `<tr><td>${nombreConEspec(ing)}</td><td class="r">${Math.round(g)}</td><td class="r">${(g/1000).toFixed(3)}</td></tr>`;
    };
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${producto.nombre}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:13px;padding:18px;color:#000}
      .header{display:flex;justify-content:space-between;margin-bottom:16px}
      .meta{font-size:11px;color:#333;text-align:right;line-height:1.6}
      .titulo{text-align:center;font-size:14px;font-weight:bold;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0}
      .sep{height:2px}
      .sec th{padding:6px 8px;font-size:10px;font-weight:800;text-align:left;border-bottom:2.5px solid #000;border-right:1px solid #888;text-transform:uppercase;letter-spacing:0.8px;background:none}
      .sec th:last-child{border-right:none}
      td{padding:5px 8px;font-size:11px;border-right:1px solid #bbb;border-bottom:1px solid #ececec}
      td:last-child{border-right:none}
      td.r{text-align:left}
      tr:nth-child(even) td{background:#f9f9f9}
      .sub td{font-weight:800;border-top:2px solid #000;border-bottom:2px solid #000;border-right:1px solid #888;background:none!important;padding:6px 8px}
      .sub td:last-child{border-right:none}
      .ttl td{font-weight:800;border-top:3px solid #000;border-bottom:3px solid #000;border-right:1px solid #888;background:none!important;padding:9px 8px;font-size:13px}
      .ttl td:last-child{border-right:none}
      @media print{body{padding:8px}}
    </style></head><body>
    <div class="header">
      <img src="/LOGO_CANDELARIA_1.png" style="height:55px;background:white;padding:4px 8px;border-radius:6px"/>
      <div class="meta">Fecha: <b>${config.fecha||''}</b><br>Paradas: <b>${config.num_paradas||1}</b></div>
    </div>
    <div class="titulo">${producto.nombre}</div>
    <table>${COLGROUP}<thead><tr class="sec"><th>MATERIAS PRIMAS</th><th class="r">GRAMOS</th><th class="r">KILOS</th></tr></thead>
    <tbody>
      ${ingredientesMP.filter(i=>i.ingrediente_nombre).map(i=>fila(i)).join('')}
      <tr class="sub"><td>SUB-TOTAL</td><td class="r">${Math.round(totMP.gramos)}</td><td class="r">${(totMP.gramos/1000).toFixed(3)}</td></tr>
    </tbody></table>
    <div class="sep"></div>
    <table>${COLGROUP}<thead><tr class="sec"><th>CONDIMENTOS Y ADITIVOS</th><th class="r">GRAMOS</th><th class="r">KILOS</th></tr></thead>
    <tbody>
      ${ingredientesAD.filter(i=>i.ingrediente_nombre).map(i=>fila(i)).join('')}
      <tr class="sub"><td>SUB-TOTAL</td><td class="r">${Math.round(totAD.gramos)}</td><td class="r">${(totAD.gramos/1000).toFixed(3)}</td></tr>
    </tbody></table>
    <div class="sep"></div>
    <table>${COLGROUP}<tbody>
      <tr class="ttl"><td>TOTAL CRUDO</td><td class="r">${Math.round(totalCrudoG)}</td><td class="r">${totalCrudoKg.toFixed(3)}</td></tr>
    </tbody></table>
    <div class="no-print" style="text-align:center;margin:16px 0">
      <button onclick="window.print()" style="background:#1a1a2e;color:white;border:none;border-radius:8px;padding:10px 28px;font-size:13pt;cursor:pointer;font-weight:bold">🖨️ Imprimir formulación</button>
    </div>
    </body></html>`;
    ventana.document.write(html);
    ventana.document.close();
  }

  // ── Filtrado buscador ─────────────────────────────────────
  const mpFiltradas = materiasPrimas.filter(m => {
    const txt = norm(buscador.texto);
    const coincide = !txt ||
      norm(m.nombre)?.includes(txt) ||
      norm(m.nombre_producto)?.includes(txt) ||
      norm(m.id)?.includes(txt);
    if (['empaque','funda','hilo'].includes(buscador.tipo))
      return coincide && (m.categoria?.toUpperCase().includes('EMPAQUE') || !buscador.texto);
    if (buscador.tipo === 'etiqueta')
      return coincide && (
        m.categoria?.toUpperCase().includes('ETIQUETA') ||
        m.categoria?.toUpperCase().includes('EMPAQUE') || !buscador.texto
      );
    return coincide;
  });

  // ── Retorno del hook ──────────────────────────────────────
  return {
    // Estado
    ingredientesMP, ingredientesAD, materiasPrimas,
    mobile, config, setConfig,
    buscador, setBuscador,
    guardando, autoGuardando, msgExito,
    modoEdicion, setModoEdicion,
    guardandoHistorial,
    seccionActiva, setSeccionActiva,
    modalNota, setModalNota,
    textoNota, setTextoNota, enviandoNota,
    dragIdx, dragSec, dragOverIdx,
    comparadorAbierto, setComparadorAbierto,
    fechasDisponibles, fechaComparar, setFechaComparar,
    formulaAnterior, setFormulaAnterior,
    cargandoCompar,
    // Cálculos
    totMP, totAD,
    totalCrudoG, totalCrudoKg, totalCostoMP,
    costoMPkg, costoConMerma, costoEmpaqueKg,
    costoAmarreKg, costoTotalKg, precioVentaKg,
    merma, margen, modCif,
    empPrecio, empCantidad, hiloPrecio, hiloKg,
    mpFiltradas,
    // Funciones
    obtenerPrecioLive, precioFunda, getPrecioAgua,
    programarAutoGuardado, guardar, guardarHistorial,
    enviarNota, descargarExcel, imprimir,
    actualizarIng, agregarFila, eliminarFila, seleccionarMP,
    handleDragStart, handleDragOver, handleDrop,
    cargarFormulaAnterior, cargarDatos,
  };
}