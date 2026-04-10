import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
import { crearNotificacion, registrarAuditoria } from './App';
import * as XLSX from 'xlsx';

const isMobile = () => window.innerWidth < 700;

// ── Normalizar texto: quita tildes y pasa a minúsculas ─────────
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ── Input de gramos — SIN onFocus que causa el bug de scroll ───
function GramosInput({ value, onCommit, disabled, mobile }) {
  const [local, setLocal] = useState(String(value ?? 0));
  useEffect(() => { setLocal(String(value ?? 0)); }, [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      disabled={disabled}
      style={{
        width: '100%', padding: mobile ? '6px 4px' : '4px',
        border: disabled ? '1.5px solid #e0e0e0' : '1.5px solid #e3f2fd',
        borderRadius: '6px', fontSize: mobile ? '14px' : '12px',
        fontWeight: '700', textAlign: mobile ? 'center' : 'right',
        color: disabled ? '#aaa' : '#1565c0',
        background: disabled ? '#f0f0f0' : '#f3f8ff', boxSizing: 'border-box'
      }}
    />
  );
}

// ── Input de nota — SIN onFocus que causa el bug ───────────────
function NoteInput({ value, onCommit, disabled, placeholder, style }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      disabled={disabled}
      placeholder={disabled ? '' : placeholder}
      style={style}
    />
  );
}

// ── Input de especificación — CORREGIDO sin onFocus preventDefault ──
function EspecInput({ value, onCommit, disabled, placeholder, style }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      disabled={disabled}
      placeholder={disabled ? '' : placeholder}
      style={style}
    />
  );
}

// ── Input numérico general — CORREGIDO sin onFocus preventDefault ──
function NumInput({ value, onChange, disabled, style, step, placeholder }) {
  const [local, setLocal] = useState(String(value ?? ''));
  useEffect(() => { setLocal(String(value ?? '')); }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step || 'any'}
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      disabled={disabled}
      style={style}
    />
  );
}

// ── Input de texto general — CORREGIDO sin onFocus preventDefault ──
function TextInput({ value, onChange, disabled, style, placeholder }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onChange(e.target.value)}
      disabled={disabled}
      style={style}
    />
  );
}

function Formulacion({ producto, onVolver, onVolverMenu, onAbrirMaterias, userRol, currentUser }) {
  const [ingredientesMP, setIngredientesMP] = useState([]);
  const [ingredientesAD, setIngredientesAD] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [mobile, setMobile] = useState(isMobile());
  const [config, setConfig] = useState({
    fecha: new Date().toISOString().split('T')[0],
    num_paradas: 1, merma: 0.07, margen: 0.15, mod_cif_kg: 0.487,
    empaque_nombre: '', empaque_precio_kg: 0, empaque_cantidad: 1, empaque_unidad: 'Madejas',
    hilo_nombre: '', hilo_precio_kg: 0, hilo_kg: 0, fundas: []
  });
  const [buscador, setBuscador] = useState({ abierto: false, tipo: '', indice: null, texto: '' });
  const [guardando, setGuardando] = useState(false);
  const [autoGuardando, setAutoGuardando] = useState(false);
  const [msgExito, setMsgExito] = useState('');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [guardandoHistorial, setGuardandoHistorial] = useState(false);
  const [seccionActiva, setSeccionActiva] = useState('formula');
  const [modalNota, setModalNota] = useState(false);
  const [textoNota, setTextoNota] = useState('');
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragSec, setDragSec] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [comparadorAbierto, setComparadorAbierto] = useState(false);
  const [fechasDisponibles, setFechasDisponibles] = useState([]);
  const [fechaComparar, setFechaComparar] = useState('');
  const [formulaAnterior, setFormulaAnterior] = useState(null);
  const [cargandoCompar, setCargandoCompar] = useState(false);
  const [cifItems, setCifItems] = useState([]);
  const [produccionKg, setProduccionKg] = useState(13600);

  const autoSaveTimer = useRef(null);
  const ingMPRef = useRef(ingredientesMP);
  const ingADRef = useRef(ingredientesAD);
  const configRef = useRef(config);
  const modoRef = useRef(modoEdicion);
  const mpRef = useRef([]);

  const esFormulador = userRol?.rol === 'formulador';

  useEffect(() => { ingMPRef.current = ingredientesMP; }, [ingredientesMP]);
  useEffect(() => { ingADRef.current = ingredientesAD; }, [ingredientesAD]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { modoRef.current = modoEdicion; }, [modoEdicion]);
  useEffect(() => { mpRef.current = materiasPrimas; }, [materiasPrimas]);

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
    // Suscripción realtime — cuando cambia materias_primas en otra pestaña,
    // recarga automáticamente sin necesidad de F5
    const channel = supabase
      .channel('materias-primas-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'materias_primas'
      }, () => {
        // Recargar solo las materias primas, sin tocar la fórmula actual
        supabase.from('materias_primas').select('*').order('nombre').then(({ data }) => {
          if (data) {
            setMateriasPrimas(data);
            mpRef.current = data;
          }
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [producto]);



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

  function programarAutoGuardado() {
    if (!modoRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (modoRef.current) guardarSilencioso();
    }, 10000);
  }

  function obtenerPrecioLive(fila, mpList) {
    if (fila.materia_prima_id) {
      const mp = (mpList || mpRef.current).find(m => m.id === fila.materia_prima_id);
      if (mp) {
        if (mp.categoria?.toUpperCase().includes('AGUA')) return getPrecioAgua();
        return parseFloat(mp.precio_kg) || 0;
      }
    }
    const n = norm(fila.ingrediente_nombre);
    const mpList2 = mpList || mpRef.current;
    const mp = mpList2.find(m =>
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

  function calcularPrecioConRefs() {
    const cfg = configRef.current;
    const mpList = mpRef.current;
    const all = [...ingMPRef.current, ...ingADRef.current];
    const totalKg = all.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0) / 1000;
    const costoMP = all.reduce((s, f) => s + (parseFloat(f.gramos) / 1000) * obtenerPrecioLive(f, mpList), 0);
    const costoMPkg = totalKg > 0 ? costoMP / totalKg : 0;
    const merma = parseFloat(cfg.merma) || 0.07;
    const margen = parseFloat(cfg.margen) || 0.15;
    const modCif = parseFloat(cfg.mod_cif_kg) || 0;
    const costoConMerma = (1 - merma) > 0 ? costoMPkg / (1 - merma) : 0;
    const empPrecio = parseFloat(cfg.empaque_precio_kg) || 0;
    const empCantidad = parseFloat(cfg.empaque_cantidad) || 0;
    const costoEmpKg = totalKg > 0 ? (empPrecio * empCantidad) / totalKg : 0;
    const hiloPrecio = parseFloat(cfg.hilo_precio_kg) || 0;
    const hiloKg = parseFloat(cfg.hilo_kg) || 0;
    const costoHiloKg = totalKg > 0 ? (hiloPrecio * hiloKg) / totalKg : 0;
    const costoTotalKg = costoConMerma + modCif + costoEmpKg + costoHiloKg;
    return { precioVentaKg: costoTotalKg * (1 + margen), costoTotalKg };
  }

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
          seccion: 'MP', orden: i,
          ingrediente_nombre: f.ingrediente_nombre,
          materia_prima_id: f.materia_prima_id || null,
          gramos: parseFloat(f.gramos) || 0,
          kilos: (parseFloat(f.gramos) || 0) / 1000,
          nota_cambio: f.nota_cambio || '',
          especificacion: f.especificacion || ''
        })),
        ...adActuales.map((f, i) => ({
          producto_nombre: producto.nombre, producto_id: producto.id,
          seccion: 'AD', orden: i,
          ingrediente_nombre: f.ingrediente_nombre,
          materia_prima_id: f.materia_prima_id || null,
          gramos: parseFloat(f.gramos) || 0,
          kilos: (parseFloat(f.gramos) || 0) / 1000,
          nota_cambio: f.nota_cambio || '',
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
        producto_nombre: producto.nombre, producto_id: producto.id,
        fecha: cfg.fecha, num_paradas: cfg.num_paradas,
        merma: cfg.merma, margen: cfg.margen, mod_cif_kg: cfg.mod_cif_kg,
        empaque_nombre: cfg.empaque_nombre, empaque_precio_kg: cfg.empaque_precio_kg,
        empaque_cantidad: cfg.empaque_cantidad, empaque_unidad: cfg.empaque_unidad,
        hilo_nombre: cfg.hilo_nombre, hilo_precio_kg: cfg.hilo_precio_kg,
        hilo_kg: cfg.hilo_kg, fundas: cfg.fundas || [],
        precio_venta_kg: pvk, costo_total_kg: ctk
      }], { onConflict: 'producto_nombre' });
      setAutoGuardando(false);
    } catch (e) { setAutoGuardando(false); }
  }

  async function cargarDatos() {
    const { data: mp } = await supabase.from('materias_primas').select('*').order('nombre');
    const mpList = mp || [];
    setMateriasPrimas(mpList);
    const { data: form } = await supabase.from('formulaciones').select('*')
      .eq('producto_nombre', producto.nombre).order('orden');
    if (form && form.length > 0) {
      const enriquecido = form.map(f => ({
        ...f,
        especificacion: f.especificacion || '',
        precio_kg: obtenerPrecioLive(f, mpList),
        costo: (parseFloat(f.gramos) / 1000) * obtenerPrecioLive(f, mpList)
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
      .eq('producto_nombre', producto.nombre).order('fecha', { ascending: false });
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
      .eq('producto_nombre', producto.nombre).eq('fecha', fechaComparar)
      .order('seccion').order('id');
    if (data && data.length > 0) setFormulaAnterior({ fecha: fechaComparar, filas: data });
    else alert(`No hay fórmula guardada para ${fechaComparar}`);
    setCargandoCompar(false);
  }

  function filaVacia(seccion, orden) {
    return {
      seccion, orden, ingrediente_nombre: '',
      materia_prima_id: null, gramos: 0, kilos: 0,
      precio_kg: 0, costo: 0, nota_cambio: '', especificacion: ''
    };
  }

  // ── Cálculos ──────────────────────────────────────────────
  const totMP = {
    gramos: ingredientesMP.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0),
    costo: ingredientesMP.reduce((s, i) => s + (parseFloat(i.gramos) / 1000) * obtenerPrecioLive(i, materiasPrimas), 0)
  };
  const totAD = {
    gramos: ingredientesAD.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0),
    costo: ingredientesAD.reduce((s, i) => s + (parseFloat(i.gramos) / 1000) * obtenerPrecioLive(i, materiasPrimas), 0)
  };
  const totalCrudoG = totMP.gramos + totAD.gramos;
  const totalCrudoKg = totalCrudoG / 1000;
  const totalCostoMP = totMP.costo + totAD.costo;
  const costoMPkg = totalCrudoKg > 0 ? totalCostoMP / totalCrudoKg : 0;
  const merma = parseFloat(config.merma) || 0;
  const margen = parseFloat(config.margen) || 0;
  const modCif = parseFloat(config.mod_cif_kg) || 0;
  const costoConMerma = (1 - merma) > 0 ? costoMPkg / (1 - merma) : 0;
  const empPrecio = parseFloat(config.empaque_precio_kg) || 0;
  const empCantidad = parseFloat(config.empaque_cantidad) || 0;
  const costoEmpaqueKg = totalCrudoKg > 0 ? (empPrecio * empCantidad) / totalCrudoKg : 0;
  const hiloPrecio = parseFloat(config.hilo_precio_kg) || 0;
  const hiloKg = parseFloat(config.hilo_kg) || 0;
  const costoAmarreKg = totalCrudoKg > 0 ? (hiloPrecio * hiloKg) / totalCrudoKg : 0;
  const costoTotalKg = costoConMerma + modCif + costoEmpaqueKg + costoAmarreKg;
  const precioVentaKg = costoTotalKg * (1 + margen);
  function precioFunda(f) {
    return (costoTotalKg * (parseFloat(f.kg_por_funda) || 1) +
      (parseFloat(f.precio_funda) || 0) + (parseFloat(f.precio_etiqueta) || 0)) * (1 + margen);
  }

  // ── Drag & Drop ───────────────────────────────────────────
  function handleDragStart(sec, idx) { setDragIdx(idx); setDragSec(sec); }
  function handleDragOver(e, sec, idx) { e.preventDefault(); if (sec === dragSec) setDragOverIdx(idx); }
  function handleDrop(sec, idx) {
    if (dragSec !== sec || dragIdx === null || dragIdx === idx) {
      setDragIdx(null); setDragSec(null); setDragOverIdx(null); return;
    }
    const lista = sec === 'MP' ? [...ingredientesMP] : [...ingredientesAD];
    const [item] = lista.splice(dragIdx, 1);
    lista.splice(idx, 0, item);
    const reordenado = lista.map((f, i) => ({ ...f, orden: i }));
    if (sec === 'MP') setIngredientesMP(reordenado); else setIngredientesAD(reordenado);
    setDragIdx(null); setDragSec(null); setDragOverIdx(null);
    programarAutoGuardado();
  }

  // ── Acciones ─────────────────────────────────────────────
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

  function seleccionarMP(mp) {
    if (!modoEdicion && (buscador.tipo === 'MP' || buscador.tipo === 'AD')) {
      setBuscador({ abierto: false, tipo: '', indice: null, texto: '' }); return;
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
      setConfig(prev => ({ ...prev, empaque_nombre: mp.nombre_producto || mp.nombre, empaque_precio_kg: parseFloat(mp.precio_kg) || 0 }));
    } else if (tipo === 'hilo') {
      setConfig(prev => ({ ...prev, hilo_nombre: mp.nombre_producto || mp.nombre, hilo_precio_kg: parseFloat(mp.precio_kg) || 0 }));
    } else if (tipo === 'funda') {
      const f = [...(config.fundas || [])];
      f[indice] = { ...f[indice], nombre_funda: mp.nombre_producto || mp.nombre, precio_funda: parseFloat(mp.precio_kg) || 0 };
      setConfig(prev => ({ ...prev, fundas: f }));
    } else if (tipo === 'etiqueta') {
      const f = [...(config.fundas || [])];
      f[indice] = { ...f[indice], nombre_etiqueta: mp.nombre_producto || mp.nombre, precio_etiqueta: parseFloat(mp.precio_kg) || 0 };
      setConfig(prev => ({ ...prev, fundas: f }));
    }
    setBuscador({ abierto: false, tipo: '', indice: null, texto: '' });
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

  function agregarFunda() {
    if (!modoEdicion) return;
    setConfig(prev => ({
      ...prev,
      fundas: [...(prev.fundas || []), { nombre_funda: '', precio_funda: 0, kg_por_funda: 1, nombre_etiqueta: '', precio_etiqueta: 0 }]
    }));
  }

  function eliminarFunda(idx) {
    if (!modoEdicion) return;
    setConfig(prev => ({ ...prev, fundas: prev.fundas.filter((_, i) => i !== idx) }));
  }

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
      const fecha = config.fecha || new Date().toISOString().split('T')[0];

      // Verificar si ya existen datos para este producto y fecha
      const { data: existentes } = await supabase
        .from('historial_general')
        .select('id, ingrediente_nombre, gramos')
        .eq('producto_nombre', producto.nombre)
        .eq('fecha', fecha);

      const hayExistentes = existentes && existentes.length > 0;

      // Preparar filas nuevas
      const filasNuevas = [
        ...ingredientesMP.map(f => ({
          fecha, producto_nombre: producto.nombre,
          ingrediente_nombre: f.ingrediente_nombre,
          materia_prima_id: f.materia_prima_id || null,
          gramos: parseFloat(f.gramos) || 0,
          kilos: (parseFloat(f.gramos) || 0) / 1000,
          nota_cambio: f.nota_cambio || '',
          seccion: 'MATERIAS PRIMAS'
        })),
        ...ingredientesAD.map(f => ({
          fecha, producto_nombre: producto.nombre,
          ingrediente_nombre: f.ingrediente_nombre,
          materia_prima_id: f.materia_prima_id || null,
          gramos: parseFloat(f.gramos) || 0,
          kilos: (parseFloat(f.gramos) || 0) / 1000,
          nota_cambio: f.nota_cambio || '',
          seccion: 'CONDIMENTOS Y ADITIVOS'
        }))
      ].filter(f => f.ingrediente_nombre);

      if (filasNuevas.length === 0) {
        setGuardandoHistorial(false);
        return;
      }

      if (hayExistentes) {
        // Detectar cuáles son realmente nuevos (diferente ingrediente O diferente gramos)
        const soloNuevos = filasNuevas.filter(nueva =>
          !existentes.some(ex =>
            ex.ingrediente_nombre === nueva.ingrediente_nombre &&
            parseFloat(ex.gramos) === parseFloat(nueva.gramos)
          )
        );

        const msg = soloNuevos.length > 0
          ? `Ya hay ${existentes.length} ingrediente(s) guardados para "${producto.nombre}" en ${fecha}.\n\n` +
            `Se detectaron ${soloNuevos.length} cambio(s).\n\n` +
            `¿Qué deseas hacer?\n\n` +
            `• OK = Reemplazar todo (borra los anteriores y guarda los actuales)\n` +
            `• Cancelar = Agregar solo los ${soloNuevos.length} ingrediente(s) nuevos/modificados`
          : `Ya hay ${existentes.length} ingrediente(s) guardados para "${producto.nombre}" en ${fecha}.\n\n` +
            `No se detectaron cambios nuevos.\n\n` +
            `• OK = Reemplazar todo de todas formas\n` +
            `• Cancelar = No guardar nada`;

        const reemplazar = window.confirm(msg);

        if (reemplazar) {
          // Reemplazar todo: borrar los de esa fecha y producto, insertar todos
          await supabase.from('historial_general')
            .delete()
            .eq('producto_nombre', producto.nombre)
            .eq('fecha', fecha);
          await supabase.from('historial_general').insert(filasNuevas);
          setMsgExito(`✅ Historial reemplazado (${fecha}) — ${filasNuevas.length} ingredientes`);
        } else {
          // Agregar solo los nuevos/modificados
          if (soloNuevos.length > 0) {
            await supabase.from('historial_general').insert(soloNuevos);
            setMsgExito(`✅ Se agregaron ${soloNuevos.length} ingrediente(s) nuevo(s) al historial`);
          } else {
            setMsgExito('ℹ️ No hay datos nuevos para agregar');
          }
        }
      } else {
        // No hay duplicados — guardar directo
        await supabase.from('historial_general').insert(filasNuevas);
        setMsgExito(`✅ Guardado en historial (${fecha}) — ${filasNuevas.length} ingredientes`);
      }

      setGuardandoHistorial(false);
      await cargarFechasHistorial();
      setTimeout(() => setMsgExito(''), 5000);
}

  async function enviarNota() {
    if (!textoNota.trim()) return;
    setEnviandoNota(true);
    try {
      await crearNotificacion({
        tipo: 'nota_formulador', origen: 'formulacion',
        usuario_nombre: userRol?.nombre || 'Formulador',
        user_id: currentUser?.id, producto_nombre: producto.nombre,
        mensaje: textoNota.trim()
      });
      setModalNota(false); setTextoNota('');
      setMsgExito('✅ Nota enviada al administrador');
      setTimeout(() => setMsgExito(''), 4000);
    } catch (e) { alert('Error al enviar nota'); }
    setEnviandoNota(false);
  }

      // ── DESCARGAR EXCEL ────────────────────────────────────────
    function descargarExcel() {
      const nombreConEspec = (ing) => {
        const spec = ing.especificacion?.trim();
        return ing.ingrediente_nombre + (spec ? ` (${spec})` : '');
      };

      const filaVaciaXL = () => ({
        'SECCIÓN': '', 'DETALLE': '', 'GRAMOS': '', 'KILOS': '',
        '% TOTAL': '', '$/KG': '', 'COSTO $': '', 'NOTA': ''
      });

      const separador = (titulo) => ({
        'SECCIÓN': `── ${titulo} ──`, 'DETALLE': '', 'GRAMOS': '', 'KILOS': '',
        '% TOTAL': '', '$/KG': '', 'COSTO $': '', 'NOTA': ''
      });

      // ── Ingredientes MP ──
      const datosMP = ingredientesMP.filter(i => i.ingrediente_nombre).map(ing => {
        const g = parseFloat(ing.gramos) || 0;
        const p = obtenerPrecioLive(ing, materiasPrimas);
        return {
          'SECCIÓN': 'MATERIAS PRIMAS',
          'DETALLE': nombreConEspec(ing),
          'GRAMOS': Math.round(g),
          'KILOS': parseFloat((g / 1000).toFixed(3)),
          '% TOTAL': totalCrudoG > 0 ? parseFloat(((g / totalCrudoG) * 100).toFixed(2)) : 0,
          '$/KG': parseFloat(p.toFixed(4)),
          'COSTO $': parseFloat(((g / 1000) * p).toFixed(4)),
          'NOTA': ing.nota_cambio || ''
        };
      });

      const subtotalMP = {
        'SECCIÓN': '', 'DETALLE': 'SUB-TOTAL MATERIAS PRIMAS',
        'GRAMOS': Math.round(totMP.gramos),
        'KILOS': parseFloat((totMP.gramos / 1000).toFixed(3)),
        '% TOTAL': totalCrudoG > 0 ? parseFloat(((totMP.gramos / totalCrudoG) * 100).toFixed(2)) : 0,
        '$/KG': '', 'COSTO $': parseFloat(totMP.costo.toFixed(4)), 'NOTA': ''
      };

      // ── Ingredientes AD ──
      const datosAD = ingredientesAD.filter(i => i.ingrediente_nombre).map(ing => {
        const g = parseFloat(ing.gramos) || 0;
        const p = obtenerPrecioLive(ing, materiasPrimas);
        return {
          'SECCIÓN': 'CONDIMENTOS Y ADITIVOS',
          'DETALLE': nombreConEspec(ing),
          'GRAMOS': Math.round(g),
          'KILOS': parseFloat((g / 1000).toFixed(3)),
          '% TOTAL': totalCrudoG > 0 ? parseFloat(((g / totalCrudoG) * 100).toFixed(2)) : 0,
          '$/KG': parseFloat(p.toFixed(4)),
          'COSTO $': parseFloat(((g / 1000) * p).toFixed(4)),
          'NOTA': ing.nota_cambio || ''
        };
      });

      const subtotalAD = {
        'SECCIÓN': '', 'DETALLE': 'SUB-TOTAL CONDIMENTOS Y ADITIVOS',
        'GRAMOS': Math.round(totAD.gramos),
        'KILOS': parseFloat((totAD.gramos / 1000).toFixed(3)),
        '% TOTAL': totalCrudoG > 0 ? parseFloat(((totAD.gramos / totalCrudoG) * 100).toFixed(2)) : 0,
        '$/KG': '', 'COSTO $': parseFloat(totAD.costo.toFixed(4)), 'NOTA': ''
      };

      const totalCrudo = {
        'SECCIÓN': '', 'DETALLE': 'TOTAL CRUDO',
        'GRAMOS': Math.round(totalCrudoG),
        'KILOS': parseFloat(totalCrudoKg.toFixed(3)),
        '% TOTAL': 100, '$/KG': '',
        'COSTO $': parseFloat(totalCostoMP.toFixed(4)), 'NOTA': ''
      };

      // ── Bloque costos ──
      const bloqueVacio = filaVaciaXL();
      const costos = [
        bloqueVacio,
        separador('COSTOS Y AJUSTES'),
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'Fecha', 'GRAMOS': '', 'KILOS': '', '% TOTAL': config.fecha || '', '$/KG': '', 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'N° de Paradas', 'GRAMOS': '', 'KILOS': '', '% TOTAL': config.num_paradas || 1, '$/KG': '', 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'Merma %', 'GRAMOS': '', 'KILOS': '', '% TOTAL': ((merma || 0) * 100).toFixed(0) + '%', '$/KG': '', 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'Margen ganancia %', 'GRAMOS': '', 'KILOS': '', '% TOTAL': ((margen || 0) * 100).toFixed(0) + '%', '$/KG': '', 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'MOD+CIF $/kg', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': modCif.toFixed(4), 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'Costo MP/kg', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': costoMPkg.toFixed(4), 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'Con merma', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': costoConMerma.toFixed(4), 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'Empaque/kg', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': costoEmpaqueKg.toFixed(4), 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'Amarre/kg', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': costoAmarreKg.toFixed(4), 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'COSTO TOTAL/KG', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': costoTotalKg.toFixed(4), 'COSTO $': '', 'NOTA': '' },
        { 'SECCIÓN': 'COSTOS', 'DETALLE': 'PRECIO VENTA/KG', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': precioVentaKg.toFixed(4), 'COSTO $': '', 'NOTA': '' },
      ];

      // ── Bloque empaque/tripa ──
      const empaque = [];
      if (config.empaque_nombre) {
        empaque.push(bloqueVacio);
        empaque.push(separador('EMPAQUE / TRIPA'));
        empaque.push({ 'SECCIÓN': 'EMPAQUE', 'DETALLE': config.empaque_nombre, 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': parseFloat(config.empaque_precio_kg || 0).toFixed(2), 'COSTO $': (empPrecio * empCantidad).toFixed(4), 'NOTA': '' });
        empaque.push({ 'SECCIÓN': 'EMPAQUE', 'DETALLE': 'Cantidad usada', 'GRAMOS': '', 'KILOS': '', '% TOTAL': (config.empaque_cantidad || 0) + ' ' + (config.empaque_unidad || ''), '$/KG': '', 'COSTO $': '', 'NOTA': '' });
        empaque.push({ 'SECCIÓN': 'EMPAQUE', 'DETALLE': 'Costo empaque/kg', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': costoEmpaqueKg.toFixed(4), 'COSTO $': '', 'NOTA': '' });
      }

      // ── Bloque amarre/hilo ──
      const amarre = [];
      if (config.hilo_nombre) {
        amarre.push(bloqueVacio);
        amarre.push(separador('AMARRE / HILO'));
        amarre.push({ 'SECCIÓN': 'AMARRE', 'DETALLE': config.hilo_nombre, 'GRAMOS': '', 'KILOS': config.hilo_kg || 0, '% TOTAL': '', '$/KG': parseFloat(config.hilo_precio_kg || 0).toFixed(2), 'COSTO $': (hiloPrecio * hiloKg).toFixed(4), 'NOTA': '' });
        amarre.push({ 'SECCIÓN': 'AMARRE', 'DETALLE': 'Costo amarre/kg', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': costoAmarreKg.toFixed(4), 'COSTO $': '', 'NOTA': '' });
      }

      // ── Bloque fundas ──
      const fundas = [];
      if (config.fundas && config.fundas.length > 0) {
        fundas.push(bloqueVacio);
        fundas.push(separador('EMPAQUES DE DISTRIBUCIÓN'));
        config.fundas.forEach((f, idx) => {
          const precioF = (costoTotalKg * (parseFloat(f.kg_por_funda) || 1) +
            (parseFloat(f.precio_funda) || 0) + (parseFloat(f.precio_etiqueta) || 0)) * (1 + margen);
          const nFundas = f.kg_por_funda > 0 ? Math.ceil(totalCrudoKg / f.kg_por_funda) : '-';
          fundas.push({ 'SECCIÓN': `FUNDA ${idx + 1}`, 'DETALLE': f.nombre_funda || 'Sin nombre', 'GRAMOS': '', 'KILOS': parseFloat(f.kg_por_funda || 1), '% TOTAL': '', '$/KG': parseFloat(f.precio_funda || 0).toFixed(4), 'COSTO $': precioF.toFixed(4), 'NOTA': `N° fundas: ${nFundas}` });
          if (f.nombre_etiqueta) {
            fundas.push({ 'SECCIÓN': `FUNDA ${idx + 1}`, 'DETALLE': `Etiqueta: ${f.nombre_etiqueta}`, 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': parseFloat(f.precio_etiqueta || 0).toFixed(4), 'COSTO $': '', 'NOTA': '' });
          }
          fundas.push({ 'SECCIÓN': `FUNDA ${idx + 1}`, 'DETALLE': 'PRECIO SUGERIDO/FUNDA', 'GRAMOS': '', 'KILOS': '', '% TOTAL': '', '$/KG': '', 'COSTO $': precioF.toFixed(4), 'NOTA': '' });
        });
      }

      const datos = [
        ...datosMP, subtotalMP,
        bloqueVacio,
        ...datosAD, subtotalAD,
        bloqueVacio,
        totalCrudo,
        ...costos,
        ...empaque,
        ...amarre,
        ...fundas
      ];

      const ws = XLSX.utils.json_to_sheet(datos);

      // Ajustar ancho de columnas
      ws['!cols'] = [
        { wch: 22 }, { wch: 35 }, { wch: 10 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 25 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, producto.nombre.substring(0, 31));
      XLSX.writeFile(wb, `${producto.nombre}_formula_${config.fecha || new Date().toISOString().split('T')[0]}.xlsx`);
    }


  // ── IMPRIMIR mejorado ─────────────────────────────────────
        function imprimir() {
        const ventana = window.open('', '_blank');
        const nombreConEspec = (ing) => {
          const spec = ing.especificacion?.trim();
          return ing.ingrediente_nombre + (spec ? ` (${spec})` : '');
        };

        // Anchos fijos compartidos por TODAS las tablas — esto alinea las columnas
        const COLGROUP = `<colgroup>
          <col style="width:45%"/>
          <col style="width:27.5%"/>
          <col style="width:27.5%"/>
        </colgroup>`;

        const fila = (ing) => {
          const g = parseFloat(ing.gramos) || 0;
          return `<tr>
            <td>${nombreConEspec(ing)}</td>
            <td class="r">${Math.round(g)}</td>
            <td class="r">${(g / 1000).toFixed(3)}</td>
          </tr>`;
        };

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${producto.nombre}</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:Arial,sans-serif;font-size:11px;padding:18px;color:#000}
          .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
          .meta{font-size:11px;color:#333;text-align:right;line-height:1.6}
          .titulo{text-align:center;font-size:14px;font-weight:bold;color:#000;margin-bottom:14px}

          table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:0}
          .sep{height:2px;}

          /* Cabecera de sección: solo línea inferior, sin fondo */
          .sec th{
            padding:6px 8px;font-size:10px;font-weight:800;color:#000;
            text-align:left;border-bottom:2.5px solid #000;
            border-right:1px solid #888;text-transform:uppercase;
            letter-spacing:0.8px;background:none;
          }
          .sec th:last-child{border-right:none;}
          .sec th.r{text-align:right;}

          /* Filas normales */
          td{padding:5px 8px;font-size:11px;border-right:1px solid #bbb;border-bottom:1px solid #ececec;}
          td:last-child{border-right:none;}
          td.r{text-align:right;}
          tr:nth-child(even) td{background:#f9f9f9;}

          /* SUB-TOTAL: negrita, líneas arriba/abajo, sin fondo */
          .sub td{
            font-weight:800;color:#000;
            border-top:2px solid #000;border-bottom:2px solid #000;
            border-right:1px solid #888;background:none!important;padding:6px 8px;
          }
          .sub td:last-child{border-right:none;}

          /* TOTAL CRUDO: negrita, triple línea, sin fondo oscuro */
          .ttl td{
            font-weight:800;color:#000;
            border-top:3px solid #000;border-bottom:3px solid #000;
            border-right:1px solid #888;background:none!important;
            padding:9px 8px;font-size:13px;
          }
          .ttl td:last-child{border-right:none;}
  
          @media print{body{padding:8px}}
        </style></head><body>
        <div class="header">
          <div>
            <img src="/LOGO_CANDELARIA_1.png" alt="Candelaria"
              style="height:55px;width:auto;background:white;padding:4px 8px;border-radius:6px"/>
          </div>
          <div class="meta">
            Fecha: <b>${config.fecha || new Date().toLocaleDateString()}</b><br>
            N° de Paradas: <b>${config.num_paradas || 1}</b>
          </div>
        </div>
        <div class="titulo">${producto.nombre}</div>

        <table>
          ${COLGROUP}
          <thead>
            <tr class="sec">
              <th>MATERIAS PRIMAS</th>
              <th class="r">GRAMOS</th>
              <th class="r">KILOS</th>
            </tr>
          </thead>
          <tbody>
            ${ingredientesMP.filter(i => i.ingrediente_nombre).map(i => fila(i)).join('')}
            <tr class="sub">
              <td>SUB-TOTAL</td>
              <td class="r">${Math.round(totMP.gramos)}</td>
              <td class="r">${(totMP.gramos / 1000).toFixed(3)}</td>
            </tr>
          </tbody>
        </table>

        <div class="sep"></div>

        <table>
          ${COLGROUP}
          <thead>
            <tr class="sec">
              <th>CONDIMENTOS Y ADITIVOS</th>
              <th class="r">GRAMOS</th>
              <th class="r">KILOS</th>
            </tr>
          </thead>
          <tbody>
            ${ingredientesAD.filter(i => i.ingrediente_nombre).map(i => fila(i)).join('')}
            <tr class="sub">
              <td>SUB-TOTAL</td>
              <td class="r">${Math.round(totAD.gramos)}</td>
              <td class="r">${(totAD.gramos / 1000).toFixed(3)}</td>
            </tr>
          </tbody>
        </table>

        <div class="sep"></div>

        <table>
          ${COLGROUP}
          <tbody>
            <tr class="ttl">
              <td>TOTAL CRUDO</td>
              <td class="r">${Math.round(totalCrudoG)}</td>
              <td class="r">${totalCrudoKg.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>

        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`;

        ventana.document.write(html);
        ventana.document.close();
      }


  // ── Búsqueda con normalización (tildes + mayúsculas) ──────
  const mpFiltradas = materiasPrimas.filter(m => {
    const txt = norm(buscador.texto);
    const coincide = !txt ||
      norm(m.nombre)?.includes(txt) ||
      norm(m.nombre_producto)?.includes(txt) ||
      norm(m.id)?.includes(txt);
    if (['empaque', 'funda', 'hilo'].includes(buscador.tipo)) return coincide && (m.categoria?.toUpperCase().includes('EMPAQUE') || !buscador.texto);
    if (buscador.tipo === 'etiqueta') return coincide && (m.categoria?.toUpperCase().includes('ETIQUETA') || m.categoria?.toUpperCase().includes('EMPAQUE') || !buscador.texto);
    return coincide;
  });

  // ══════════════════════════════════════════════
  // VISTA FORMULADOR
  // ══════════════════════════════════════════════
  if (esFormulador) {
    const thS = { padding: '8px 12px', fontSize: '11px', color: '#888', fontWeight: '700', textAlign: 'left', borderBottom: '1px solid #ddd', textTransform: 'uppercase', letterSpacing: '0.8px' };
    const thR = { ...thS, textAlign: 'right' };
    const RowF = ({ ing }) => {
      const g = parseFloat(ing.gramos) || 0;
      const nombre = ing.ingrediente_nombre + (ing.especificacion?.trim() ? ` (${ing.especificacion.trim()})` : '');
      return (
        <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
          <td style={{ padding: '7px 12px', fontSize: '13px' }}>{nombre}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '700', color: '#333' }}>{Math.round(g)}</td>
          <td style={{ padding: '7px 12px', textAlign: 'right', color: '#555' }}>{(g / 1000).toFixed(3)}</td>
        </tr>
      );
    };
    return (
      <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
        <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)', padding: mobile ? '10px 12px' : '12px 20px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={onVolverMenu} style={{ background: 'rgba(255,200,0,0.25)', border: '1px solid rgba(255,200,0,0.4)', color: '#ffd700', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>🏠 Menú</button>
              <button onClick={onVolver} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', padding: '7px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px' }}>← Volver</button>
              <div>
                <div style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '13px' : '16px' }}>🧪 {producto.nombre}</div>
                <div style={{ color: '#aaa', fontSize: '10px' }}>🔒 Solo lectura — Formulador</div>
              </div>
            </div>
            <button onClick={() => setModalNota(true)} style={{ background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', padding: mobile ? '8px 12px' : '8px 16px', cursor: 'pointer', fontSize: mobile ? '12px' : '13px', fontWeight: 'bold' }}>
              ✉️ {mobile ? 'Nota' : 'Enviar nota al Ingeniero'}
            </button>
          </div>
        </div>
        {msgExito && <div style={{ background: '#d4edda', color: '#155724', padding: '10px 16px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>{msgExito}</div>}
        <div style={{ padding: mobile ? '10px' : '16px 20px' }}>
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#1a5276', padding: '8px 14px' }}><span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>🥩 MATERIAS PRIMAS</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thS}>INGREDIENTE</th><th style={thR}>GRAMOS</th><th style={thR}>KILOS</th></tr></thead>
              <tbody>
                {ingredientesMP.filter(i => i.ingrediente_nombre).map((ing, i) => <RowF key={i} ing={ing} />)}
                <tr style={{ background: '#e8f5fb', borderTop: '2px solid #aed6f1' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1a5276' }}>SUB-TOTAL</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>{Math.round(totMP.gramos)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>{(totMP.gramos / 1000).toFixed(3)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#6c3483', padding: '8px 14px' }}><span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>🧂 CONDIMENTOS Y ADITIVOS</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thS}>INGREDIENTE</th><th style={thR}>GRAMOS</th><th style={thR}>KILOS</th></tr></thead>
              <tbody>
                {ingredientesAD.filter(i => i.ingrediente_nombre).map((ing, i) => <RowF key={i} ing={ing} />)}
                <tr style={{ background: '#f5eef8', borderTop: '2px solid #d2b4de' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#6c3483' }}>SUB-TOTAL</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#6c3483' }}>{Math.round(totAD.gramos)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#6c3483' }}>{(totAD.gramos / 1000).toFixed(3)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ background: '#1a3a5c', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>TOTAL CRUDO</span>
            <div style={{ display: 'flex', gap: 28 }}>
              <div style={{ textAlign: 'center' }}><div style={{ color: '#aaa', fontSize: '9px', fontWeight: 700 }}>GRAMOS</div><div style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{Math.round(totalCrudoG)}</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ color: '#aaa', fontSize: '9px', fontWeight: 700 }}>KILOS</div><div style={{ color: '#f39c12', fontWeight: 'bold', fontSize: '16px' }}>{totalCrudoKg.toFixed(3)}</div></div>
            </div>
          </div>
        </div>
        {modalNota && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000 }}>
            <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '12px', width: mobile ? '100%' : '480px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, color: '#1a1a2e', fontSize: '15px' }}>✉️ Enviar nota al Ingeniero</h3>
                <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#aaa' }}>✕</button>
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Producto: <strong>{producto.nombre}</strong></div>
              <textarea value={textoNota} onChange={e => setTextoNota(e.target.value)} placeholder="Escribe tu nota aquí..." rows={4}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e67e22', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Arial' }} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={enviarNota} disabled={enviandoNota || !textoNota.trim()} style={{ padding: '10px 20px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {enviandoNota ? 'Enviando...' : '✉️ Enviar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // VISTA LIMPIA (admin / no edición)
  // ══════════════════════════════════════════════
  const VistaLimpia = () => {
    const thS = { padding: mobile ? '7px 8px' : '7px 10px', fontSize: '10px', color: '#888', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', borderBottom: '1px solid #ddd', textAlign: 'left', whiteSpace: 'nowrap' };
    const thR = { ...thS, textAlign: 'right' };
    const Row = ({ ing, i }) => {
      const g = parseFloat(ing.gramos) || 0;
      const p = obtenerPrecioLive(ing, materiasPrimas);
      const costo = (g / 1000) * p;
      const pct = totalCrudoG > 0 ? ((g / totalCrudoG) * 100).toFixed(2) : '0.00';
      const esAgua = materiasPrimas.find(m => m.id === ing.materia_prima_id)?.categoria?.toUpperCase().includes('AGUA');
      const nombreMostrar = ing.ingrediente_nombre + (ing.especificacion?.trim() ? ` (${ing.especificacion.trim()})` : '');
      return (
        <tr style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
          <td style={{ padding: mobile ? '7px 8px' : '6px 10px', fontSize: mobile ? '13px' : '12px' }}>{nombreMostrar}</td>
          <td style={{ padding: mobile ? '7px 8px' : '6px 10px', textAlign: 'right', fontSize: '12px', color: '#333' }}>{Math.round(g)}</td>
          <td style={{ padding: mobile ? '7px 8px' : '6px 10px', textAlign: 'right', fontSize: '12px', color: '#555' }}>{(g / 1000).toFixed(3)}</td>
          {!mobile && <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', color: '#888' }}>{pct}%</td>}
          {!mobile && <td style={{ padding: '6px 10px', fontSize: '12px', color: '#777' }}>{ing.nota_cambio || ''}</td>}
          <td style={{ padding: mobile ? '7px 8px' : '6px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: esAgua ? '#3498db' : (p > 0 ? '#27ae60' : '#e74c3c') }}>
            {esAgua ? <span title="Precio desde CIF">💧${p.toFixed(4)}</span> : `$${p.toFixed(2)}`}
          </td>
          <td style={{ padding: mobile ? '7px 8px' : '6px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: '#c0392b' }}>${costo.toFixed(4)}</td>
        </tr>
      );
    };
    const Info = ({ label, valor, color }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: mobile ? '9px 0' : '7px 0', borderBottom: '1px solid #f5f5f5', fontSize: mobile ? '13px' : '12px' }}>
        <span style={{ color: '#666' }}>{label}</span>
        <span style={{ fontWeight: 'bold', color: color || '#1a1a2e' }}>{valor}</span>
      </div>
    );
    return (
      <div style={{ padding: mobile ? '10px' : '16px 20px' }}>
        <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ background: '#1a5276', padding: '8px 14px' }}><span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '12px' : '13px' }}>🥩 MATERIAS PRIMAS</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: mobile ? 400 : 600 }}>
              <thead><tr><th style={thS}>Ingrediente</th><th style={thR}>Gramos</th><th style={thR}>Kilos</th>{!mobile && <th style={thR}>%</th>}{!mobile && <th style={thS}>Nota</th>}<th style={thR}>$/KG</th><th style={thR}>Costo</th></tr></thead>
              <tbody>
                {ingredientesMP.filter(i => i.ingrediente_nombre).map((ing, i) => <Row key={i} ing={ing} i={i} />)}
                <tr style={{ background: '#e8f5fb', borderTop: '2px solid #aed6f1' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#1a5276' }}>SUB-TOTAL</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>{Math.round(totMP.gramos)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>{(totMP.gramos / 1000).toFixed(3)}</td>
                  {!mobile && <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>{totalCrudoG > 0 ? ((totMP.gramos / totalCrudoG) * 100).toFixed(2) : '0.00'}%</td>}
                  {!mobile && <td></td>}
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>—</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#c0392b' }}>${totMP.costo.toFixed(4)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ background: '#6c3483', padding: '8px 14px' }}><span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '12px' : '13px' }}>🧂 CONDIMENTOS Y ADITIVOS</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: mobile ? 400 : 600 }}>
              <thead><tr><th style={thS}>Ingrediente</th><th style={thR}>Gramos</th><th style={thR}>Kilos</th>{!mobile && <th style={thR}>%</th>}{!mobile && <th style={thS}>Nota</th>}<th style={thR}>$/KG</th><th style={thR}>Costo</th></tr></thead>
              <tbody>
                {ingredientesAD.filter(i => i.ingrediente_nombre).map((ing, i) => <Row key={i} ing={ing} i={i} />)}
                <tr style={{ background: '#f5eef8', borderTop: '2px solid #d2b4de' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#6c3483' }}>SUB-TOTAL</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#6c3483' }}>{Math.round(totAD.gramos)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#6c3483' }}>{(totAD.gramos / 1000).toFixed(3)}</td>
                  {!mobile && <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#6c3483' }}>{totalCrudoG > 0 ? ((totAD.gramos / totalCrudoG) * 100).toFixed(2) : '0.00'}%</td>}
                  {!mobile && <td></td>}
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#6c3483' }}>—</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#c0392b' }}>${totAD.costo.toFixed(4)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: '#1a3a5c', borderRadius: '10px', padding: mobile ? '12px 14px' : '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '13px' : '14px' }}>TOTAL CRUDO</span>
          <div style={{ display: 'flex', gap: mobile ? 16 : 28 }}>
            <div style={{ textAlign: 'center' }}><div style={{ color: '#aaa', fontSize: '9px', fontWeight: 700 }}>GRAMOS</div><div style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '14px' : '15px' }}>{Math.round(totalCrudoG)}</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ color: '#aaa', fontSize: '9px', fontWeight: 700 }}>KILOS</div><div style={{ color: '#f39c12', fontWeight: 'bold', fontSize: mobile ? '14px' : '15px' }}>{totalCrudoKg.toFixed(3)}</div></div>
          </div>
        </div>
        <div style={{ display: mobile ? 'flex' : 'grid', flexDirection: mobile ? 'column' : undefined, gridTemplateColumns: mobile ? undefined : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#2c3e50', padding: '8px 14px' }}><span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '12px' : '13px' }}>📊 Costos y Ajustes</span></div>
            <div style={{ padding: mobile ? '12px 14px' : '10px 16px' }}>
              <Info label="Merma" valor={((parseFloat(config.merma) || 0) * 100).toFixed(0) + '%'} />
              <Info label="Margen ganancia" valor={((parseFloat(config.margen) || 0) * 100).toFixed(0) + '%'} />
              <Info label="MOD+CIF/kg" valor={'$' + (parseFloat(config.mod_cif_kg) || 0).toFixed(4)} color="#3498db" />
              <Info label="Costo MP/kg" valor={'$' + costoMPkg.toFixed(4)} />
              <Info label="Con merma" valor={'$' + costoConMerma.toFixed(4)} color="#e74c3c" />
              <Info label="Empaque/kg" valor={'$' + costoEmpaqueKg.toFixed(4)} color="#8e44ad" />
              <Info label="Amarre/kg" valor={'$' + costoAmarreKg.toFixed(4)} color="#e67e22" />
              <div style={{ marginTop: '10px', background: '#f8f9fa', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: mobile ? '13px' : '12px' }}>COSTO TOTAL/KG</span>
                <span style={{ fontWeight: 'bold', color: '#e74c3c', fontSize: mobile ? '15px' : '14px' }}>${costoTotalKg.toFixed(4)}</span>
              </div>
              <div style={{ background: '#27ae60', borderRadius: '8px', padding: '11px 14px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold', color: 'white', fontSize: mobile ? '13px' : '12px' }}>💰 PRECIO VENTA/KG</span>
                <span style={{ fontWeight: 'bold', color: 'white', fontSize: mobile ? '17px' : '16px' }}>${precioVentaKg.toFixed(4)}</span>
              </div>
            </div>
          </div>
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#7d6608', padding: '8px 14px' }}><span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '12px' : '13px' }}>📦 Empaque y Amarre</span></div>
            <div style={{ padding: mobile ? '12px 14px' : '10px 16px' }}>
              {config.empaque_nombre
                ? <><Info label="Tripa/Empaque" valor={config.empaque_nombre} color="#8e44ad" /><Info label="Cantidad" valor={(config.empaque_cantidad || 0) + ' ' + (config.empaque_unidad || '')} /><Info label="Precio/kg" valor={'$' + parseFloat(config.empaque_precio_kg || 0).toFixed(2) + '/kg'} /><Info label="Costo empaque/kg" valor={'$' + costoEmpaqueKg.toFixed(4)} color="#8e44ad" /></>
                : <div style={{ color: '#aaa', fontSize: '13px', padding: '10px 0' }}>Sin empaque configurado</div>}
              {config.hilo_nombre && <>
                <div style={{ height: '1px', background: '#f0f0f0', margin: '10px 0' }} />
                <Info label="Amarre/Hilo" valor={config.hilo_nombre} color="#e67e22" />
                <Info label="Kg hilo" valor={(parseFloat(config.hilo_kg) || 0).toFixed(3) + ' kg'} />
                <Info label="Costo amarre/kg" valor={'$' + costoAmarreKg.toFixed(4)} color="#e67e22" />
              </>}
            </div>
          </div>
        </div>
        {config.fundas && config.fundas.length > 0 && (
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#17a589', padding: '8px 14px' }}><span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '12px' : '13px' }}>🛍️ Empaques de Distribución</span></div>
            <div style={{ padding: mobile ? '10px 12px' : '10px 14px', display: mobile ? 'flex' : 'grid', flexDirection: mobile ? 'column' : undefined, gridTemplateColumns: mobile ? undefined : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {config.fundas.map((funda, idx) => (
                <div key={idx} style={{ border: '1.5px solid #17a589', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ background: '#e8f8f4', padding: '8px 12px', fontWeight: 'bold', color: '#17a589', fontSize: '12px' }}>Funda {idx + 1}: {funda.nombre_funda || '—'}</div>
                  <div style={{ padding: '8px 12px' }}>
                    <Info label="Kg por funda" valor={(parseFloat(funda.kg_por_funda) || 1).toFixed(1) + ' kg'} />
                    <Info label="Etiqueta" valor={funda.nombre_etiqueta || '—'} />
                    <Info label="N° fundas" valor={funda.kg_por_funda > 0 ? Math.ceil(totalCrudoKg / (parseFloat(funda.kg_por_funda) || 1)) + '' : '-'} />
                    <div style={{ background: '#17a589', borderRadius: '7px', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ color: 'white', fontSize: mobile ? '13px' : '12px', fontWeight: 'bold' }}>💰 Precio sugerido</span>
                      <span style={{ color: 'white', fontSize: mobile ? '15px' : '14px', fontWeight: 'bold' }}>${precioFunda(funda).toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Columnas tabla edición ─────────────────────────────────
  const COLS = [
    { label: 'INGREDIENTE', w: '24%', align: 'left' },
    { label: 'ESPECIFICACIÓN', w: '14%', align: 'left' },
    { label: 'GRAMOS', w: '10%', align: 'right' },
    { label: 'KILOS', w: '7%', align: 'right' },
    { label: '%', w: '6%', align: 'right' },
    { label: 'NOTA', w: '12%', align: 'left' },
    { label: '$/KG', w: '9%', align: 'right' },
    { label: 'COSTO', w: '9%', align: 'right' },
    { label: '', w: '5%', align: 'center' },
    { label: '⠿', w: '4%', align: 'center' }
  ];
  const sTh = { padding: '9px 8px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: 'white' };
  const sTd = { padding: '6px 5px', fontSize: '12px', borderBottom: '1px solid #f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const sIn = { width: '100%', padding: '5px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '12px', boxSizing: 'border-box' };

  const SeccionIngredientes = ({ lista, seccion, colorH }) => {
    const totG = lista.reduce((s, i) => s + (parseFloat(i.gramos) || 0), 0);
    const totC = lista.reduce((s, i) => s + (parseFloat(i.gramos) / 1000) * obtenerPrecioLive(i, materiasPrimas), 0);
    const label = seccion === 'MP' ? '🥩 MATERIAS PRIMAS' : '🧂 CONDIMENTOS Y ADITIVOS';
    return (
      <div style={{ background: 'white', borderRadius: '12px', marginBottom: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: colorH, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '13px' : '14px' }}>{label}</span>
          {modoEdicion && <button onClick={() => agregarFila(seccion)} style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: '7px', padding: mobile ? '7px 14px' : '5px 12px', cursor: 'pointer', fontSize: mobile ? '13px' : '12px', fontWeight: 'bold' }}>+ Agregar fila</button>}
        </div>
        {mobile ? (
          <div style={{ padding: '10px' }}>
            {lista.map((ing, i) => {
              const p = obtenerPrecioLive(ing, materiasPrimas);
              const c = (parseFloat(ing.gramos) / 1000) * p;
              const pct = totalCrudoG > 0 ? ((parseFloat(ing.gramos) / totalCrudoG) * 100).toFixed(1) : '0.0';
              const vinculado = !!ing.materia_prima_id;
              const esAgua = materiasPrimas.find(m => m.id === ing.materia_prima_id)?.categoria?.toUpperCase().includes('AGUA');
              return (
                <div key={i} style={{ background: 'white', borderRadius: '12px', marginBottom: '10px', border: `1.5px solid ${vinculado ? '#c8e6c9' : '#fce4ec'}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  draggable={modoEdicion}
                  onDragStart={() => handleDragStart(seccion, i)}
                  onDragOver={e => handleDragOver(e, seccion, i)}
                  onDrop={() => handleDrop(seccion, i)}>
                  <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div onClick={() => modoEdicion && setBuscador({ abierto: true, tipo: seccion, indice: i, texto: '' })}
                        style={{ flex: 1, padding: '9px 12px', background: vinculado ? '#e8f5e9' : '#fff8e1', border: `1px solid ${vinculado ? '#a5d6a7' : '#ffe082'}`, borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: ing.ingrediente_nombre ? (vinculado ? '#2e7d32' : '#e65100') : '#aaa', cursor: modoEdicion ? 'pointer' : 'default', minHeight: '38px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {vinculado && <span style={{ color: '#43a047', fontSize: 11 }}>✓</span>}
                        {ing.ingrediente_nombre || (modoEdicion ? '🔍 Buscar ingrediente...' : '—')}
                      </div>
                      {modoEdicion && <button onClick={() => eliminarFila(seccion, i)} style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '8px', padding: '9px 11px', cursor: 'pointer', fontSize: '15px', flexShrink: 0 }}>🗑️</button>}
                    </div>
                    {modoEdicion && (
                      <EspecInput
                        value={ing.especificacion || ''}
                        onCommit={v => actualizarIng(seccion, i, 'especificacion', v)}
                        placeholder="Especificación (opcional)..."
                        style={{ marginTop: '6px', width: '100%', padding: '7px 8px', border: ing.especificacion?.trim() ? '1.5px solid #3498db' : '1px dashed #ddd', borderRadius: '6px', fontSize: '12px', color: '#1a5276', background: ing.especificacion?.trim() ? '#e8f4fd' : '#fafafa', boxSizing: 'border-box' }}
                      />
                    )}
                    {!modoEdicion && ing.especificacion?.trim() && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#1a5276' }}>({ing.especificacion.trim()})</div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
                    <div style={{ padding: '8px 10px', borderRight: '1px solid #f5f5f5' }}>
                      <div style={{ fontSize: '10px', color: '#999', marginBottom: 3, fontWeight: 600 }}>GRAMOS</div>
                      <GramosInput value={ing.gramos} onCommit={v => actualizarIng(seccion, i, 'gramos', v)} disabled={!modoEdicion} mobile={true} />
                    </div>
                    <div style={{ padding: '8px 10px', borderRight: '1px solid #f5f5f5', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#999', marginBottom: 3, fontWeight: 600 }}>$/KG</div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: esAgua ? '#3498db' : (p > 0 ? '#2e7d32' : '#b71c1c') }}>
                        {esAgua ? '💧' : ''} ${p.toFixed(2)}{p === 0 && <span style={{ fontSize: 10, marginLeft: 2 }}>⚠️</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: '#aaa' }}>{pct}%</div>
                    </div>
                    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#999', marginBottom: 3, fontWeight: 600 }}>COSTO</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#c62828' }}>${c.toFixed(3)}</div>
                      <div style={{ fontSize: '10px', color: '#aaa' }}>{(parseFloat(ing.gramos) / 1000).toFixed(3)} kg</div>
                    </div>
                  </div>
                  <div style={{ padding: '6px 10px 8px' }}>
                    <NoteInput value={ing.nota_cambio || ''} onCommit={v => actualizarIng(seccion, i, 'nota_cambio', v)} disabled={!modoEdicion} placeholder="Nota de cambio..."
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '12px', color: '#555', boxSizing: 'border-box', background: modoEdicion ? '#fafafa' : '#f0f0f0' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: seccion === 'MP' ? '#e8f5e9' : '#f3e5f5', borderRadius: '10px', padding: '10px', marginTop: '4px' }}>
              <div><div style={{ fontSize: '10px', color: '#666', fontWeight: 700 }}>SUBTOTAL</div><div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a2e' }}>{totG.toLocaleString()} g</div></div>
              <div><div style={{ fontSize: '10px', color: '#666', fontWeight: 700 }}>KILOS</div><div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a2e' }}>{(totG / 1000).toFixed(3)}</div></div>
              <div><div style={{ fontSize: '10px', color: '#666', fontWeight: 700 }}>COSTO</div><div style={{ fontSize: '14px', fontWeight: '800', color: '#c62828' }}>${totC.toFixed(3)}</div></div>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
              <colgroup>{COLS.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
              <thead>
                <tr style={{ background: seccion === 'MP' ? '#2c3e50' : '#6c3483' }}>
                  {COLS.map(c => <th key={c.label} style={{ ...sTh, textAlign: c.align }}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((ing, i) => {
                  const p = obtenerPrecioLive(ing, materiasPrimas);
                  const c2 = (parseFloat(ing.gramos) / 1000) * p;
                  const esAgua = materiasPrimas.find(m => m.id === ing.materia_prima_id)?.categoria?.toUpperCase().includes('AGUA');
                  const isDragOver = dragOverIdx === i && dragSec === seccion;
                  return (
                    <tr key={i}
                      draggable={modoEdicion}
                      onDragStart={() => handleDragStart(seccion, i)}
                      onDragOver={e => handleDragOver(e, seccion, i)}
                      onDrop={() => handleDrop(seccion, i)}
                      style={{ background: isDragOver ? '#e8f4fd' : (i % 2 === 0 ? '#fafafa' : 'white'), borderBottom: isDragOver ? '2px solid #3498db' : '1px solid #f0f0f0' }}>
                      <td style={sTd}>
                        <div onClick={() => modoEdicion && setBuscador({ abierto: true, tipo: seccion, indice: i, texto: '' })}
                          style={{ padding: '4px 7px', background: ing.materia_prima_id ? '#e8f8f0' : '#eaf4fb', border: ing.materia_prima_id ? '1px solid #27ae60' : '1px solid #aed6f1', borderRadius: '5px', cursor: modoEdicion ? 'pointer' : 'default', fontSize: '11px', color: ing.ingrediente_nombre ? (ing.materia_prima_id ? '#1e8449' : '#1a5276') : '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ing.ingrediente_nombre || '—'}{ing.materia_prima_id && <span style={{ fontSize: '9px', marginLeft: '4px', color: '#27ae60' }}>✓</span>}
                        </div>
                      </td>
                      {/* ESPECIFICACIÓN — usa EspecInput sin preventDefault en onFocus */}
                      <td style={sTd}>
                        {modoEdicion ? (
                          <EspecInput
                            value={ing.especificacion || ''}
                            onCommit={v => actualizarIng(seccion, i, 'especificacion', v)}
                            placeholder="opcional..."
                            style={{ ...sIn, border: ing.especificacion?.trim() ? '1.5px solid #3498db' : '1px dashed #ddd', background: ing.especificacion?.trim() ? '#e8f4fd' : '#fafafa', color: '#1a5276' }}
                          />
                        ) : (
                          ing.especificacion?.trim()
                            ? <span style={{ fontSize: '11px', color: '#1a5276', fontWeight: '500' }}>({ing.especificacion.trim()})</span>
                            : <span style={{ color: '#ddd', fontSize: '10px' }}>—</span>
                        )}
                      </td>
                      <td style={{ ...sTd, textAlign: 'right' }}>
                        <GramosInput value={ing.gramos} onCommit={v => actualizarIng(seccion, i, 'gramos', v)} disabled={!modoEdicion} mobile={false} />
                      </td>
                      <td style={{ ...sTd, textAlign: 'right', color: '#666' }}>{(parseFloat(ing.gramos) / 1000).toFixed(3)}</td>
                      <td style={{ ...sTd, textAlign: 'right', color: '#666' }}>{totalCrudoG > 0 ? ((parseFloat(ing.gramos) / totalCrudoG) * 100).toFixed(2) : '0.00'}%</td>
                      <td style={sTd}>
                        <NoteInput value={ing.nota_cambio || ''} onCommit={v => actualizarIng(seccion, i, 'nota_cambio', v)} disabled={!modoEdicion} placeholder={modoEdicion ? "Nota..." : ""} style={{ ...sIn, background: modoEdicion ? 'white' : '#f0f0f0' }} />
                      </td>
                      <td style={{ ...sTd, textAlign: 'right', fontWeight: 'bold', color: esAgua ? '#3498db' : (p > 0 ? '#27ae60' : '#e74c3c') }}>
                        {esAgua ? '💧' : ''}${p.toFixed(2)}{p === 0 && <span style={{ fontSize: '9px' }}> ⚠️</span>}
                      </td>
                      <td style={{ ...sTd, textAlign: 'right', fontWeight: 'bold', color: '#c0392b' }}>${c2.toFixed(4)}</td>
                      <td style={{ ...sTd, textAlign: 'center' }}>
                        {modoEdicion && <button onClick={() => eliminarFila(seccion, i)} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 7px', cursor: 'pointer', fontSize: '11px' }}>🗑️</button>}
                      </td>
                      <td style={{ ...sTd, textAlign: 'center', cursor: modoEdicion ? 'grab' : 'default', color: '#bbb', fontSize: '16px' }}>
                        {modoEdicion ? '⠿' : ''}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: seccion === 'MP' ? '#d5f5e3' : '#e8daef', fontWeight: 'bold' }}>
                  <td style={{ ...sTd, paddingLeft: '10px' }}>SUB-TOTAL</td>
                  <td style={sTd}></td>
                  <td style={{ ...sTd, textAlign: 'right' }}>{totG.toLocaleString()}</td>
                  <td style={{ ...sTd, textAlign: 'right' }}>{(totG / 1000).toFixed(3)}</td>
                  <td style={{ ...sTd, textAlign: 'right' }}>{totalCrudoG > 0 ? ((totG / totalCrudoG) * 100).toFixed(2) : '0.00'}%</td>
                  <td colSpan={2} style={{ ...sTd, textAlign: 'right' }}>Sub-total</td>
                  <td style={{ ...sTd, textAlign: 'right', color: '#c0392b' }}>${totC.toFixed(4)}</td>
                  <td></td><td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const BtnBuscar = ({ valor, tipo, indice, color = '#2980b9' }) => (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <div style={{ flex: 1, padding: mobile ? '11px 12px' : '7px 10px', background: valor ? '#e8f8f0' : '#fff9e6', border: valor ? '1.5px solid #27ae60' : '1.5px solid #f39c12', borderRadius: '8px', fontSize: mobile ? '13px' : '12px', color: valor ? '#1e8449' : '#888', cursor: modoEdicion ? 'pointer' : 'default', minHeight: mobile ? 44 : 0 }}
        onClick={() => modoEdicion && setBuscador({ abierto: true, tipo, indice: indice ?? null, texto: '' })}>
        {valor || (modoEdicion ? '🔍 Buscar...' : '—')}
      </div>
      {valor && modoEdicion && <button onClick={() => setBuscador({ abierto: true, tipo, indice: indice ?? null, texto: '' })} style={{ padding: mobile ? '11px 14px' : '5px 10px', background: color, color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: mobile ? '14px' : '11px' }}>✏️</button>}
    </div>
  );

  const PanelCostos = () => (
    <div style={{ display: mobile ? 'flex' : 'grid', flexDirection: mobile ? 'column' : undefined, gridTemplateColumns: mobile ? undefined : '1fr 1fr', gap: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 12px', color: '#1a1a2e', borderBottom: '2px solid #3498db', paddingBottom: '6px', fontSize: '13px' }}>⚙️ Ajustes</h4>
          {[['Merma %', 'merma'], ['Margen ganancia %', 'margen'], ['MOD + CIF $/kg', 'mod_cif_kg']].map(([label, key]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ fontSize: '13px', color: '#555' }}>{label}</label>
              <NumInput
                value={config[key] || ''}
                onChange={v => { if (!modoEdicion) return; setConfig(prev => ({ ...prev, [key]: v })); programarAutoGuardado(); }}
                disabled={!modoEdicion}
                step="0.001"
                style={{ width: mobile ? 110 : 100, padding: mobile ? '9px' : '6px', borderRadius: '7px', border: '1.5px solid #ddd', fontSize: '14px', textAlign: 'right', background: modoEdicion ? 'white' : '#f0f0f0' }}
              />
            </div>
          ))}
        </div>
        {/* EMPAQUE — usa TextInput en lugar de input directo */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 12px', color: '#1a1a2e', borderBottom: '2px solid #8e44ad', paddingBottom: '6px', fontSize: '13px' }}>📦 Empaque / Tripa</h4>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Empaque seleccionado</label>
            <BtnBuscar valor={config.empaque_nombre} tipo="empaque" color="#8e44ad" />
            {config.empaque_precio_kg > 0 && <div style={{ fontSize: '11px', color: '#27ae60', marginTop: '4px' }}>💰 ${parseFloat(config.empaque_precio_kg).toFixed(2)}/kg</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', color: '#555' }}>Cantidad usada</label>
            <NumInput
              value={config.empaque_cantidad || ''}
              onChange={v => { if (!modoEdicion) return; setConfig(prev => ({ ...prev, empaque_cantidad: v })); programarAutoGuardado(); }}
              disabled={!modoEdicion}
              style={{ width: mobile ? 120 : 110, padding: mobile ? '9px' : '6px', borderRadius: '7px', border: '1.5px solid #ddd', fontSize: '13px', textAlign: 'right', background: modoEdicion ? 'white' : '#f0f0f0' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', color: '#555' }}>Unidad</label>
            {/* CORREGIDO: TextInput sin preventDefault */}
            <TextInput
              value={config.empaque_unidad || ''}
              onChange={v => { if (!modoEdicion) return; setConfig(prev => ({ ...prev, empaque_unidad: v })); programarAutoGuardado(); }}
              disabled={!modoEdicion}
              placeholder="Madejas"
              style={{ width: mobile ? 120 : 110, padding: mobile ? '9px' : '6px', borderRadius: '7px', border: '1.5px solid #ddd', fontSize: '13px', textAlign: 'right', background: modoEdicion ? 'white' : '#f0f0f0' }}
            />
          </div>
          <div style={{ fontSize: '11px', color: '#666', background: '#f8f9fa', borderRadius: '8px', padding: '8px', marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Costo total empaque:</span><span style={{ fontWeight: 'bold' }}>${(empPrecio * empCantidad).toFixed(4)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Costo empaque/kg:</span><span style={{ fontWeight: 'bold', color: '#8e44ad' }}>${costoEmpaqueKg.toFixed(4)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rendimiento:</span><span style={{ fontWeight: 'bold' }}>{empCantidad > 0 ? (totalCrudoKg / empCantidad).toFixed(3) : '-'} kg/unidad</span></div>
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 12px', color: '#1a1a2e', borderBottom: '2px solid #e67e22', paddingBottom: '6px', fontSize: '13px' }}>🧵 Amarre / Hilo</h4>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Amarre seleccionado</label>
            <BtnBuscar valor={config.hilo_nombre} tipo="hilo" color="#e67e22" />
            {config.hilo_precio_kg > 0 && <div style={{ fontSize: '11px', color: '#27ae60', marginTop: '4px' }}>💰 ${parseFloat(config.hilo_precio_kg).toFixed(2)}/kg</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#555' }}>Kg hilo usados</label>
            <NumInput
              value={config.hilo_kg || ''}
              onChange={v => { if (!modoEdicion) return; setConfig(prev => ({ ...prev, hilo_kg: v })); programarAutoGuardado(); }}
              disabled={!modoEdicion}
              step="0.001"
              style={{ width: mobile ? 120 : 110, padding: mobile ? '9px' : '6px', borderRadius: '7px', border: '1.5px solid #ddd', fontSize: '13px', textAlign: 'right', background: modoEdicion ? 'white' : '#f0f0f0' }}
            />
          </div>
          <div style={{ fontSize: '11px', color: '#666', background: '#f8f9fa', borderRadius: '8px', padding: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Costo amarre/kg:</span><span style={{ fontWeight: 'bold', color: '#e67e22' }}>${costoAmarreKg.toFixed(4)}</span></div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h4 style={{ margin: '0 0 12px', color: '#1a1a2e', borderBottom: '2px solid #27ae60', paddingBottom: '6px', fontSize: '13px' }}>📊 Resumen de Costos</h4>
          {[['Costo MP/kg', `$${costoMPkg.toFixed(4)}`, '#555'], ['Con merma', `$${costoConMerma.toFixed(4)}`, '#e74c3c'], ['MOD + CIF/kg', `$${modCif.toFixed(4)}`, '#3498db'], ['Empaque/kg', `$${costoEmpaqueKg.toFixed(4)}`, '#8e44ad'], ['Amarre/kg', `$${costoAmarreKg.toFixed(4)}`, '#e67e22']].map(([l, v, col]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ color: '#666' }}>{l}</span>
              <span style={{ fontWeight: 'bold', color: col }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: '2px solid #2c3e50', paddingTop: '10px', marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: mobile ? '14px' : '13px' }}>COSTO TOTAL/KG</span>
              <span style={{ fontWeight: 'bold', color: '#e74c3c', fontSize: mobile ? '16px' : '14px' }}>${costoTotalKg.toFixed(4)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#27ae60', borderRadius: '10px', padding: '12px 14px' }}>
              <span style={{ fontWeight: 'bold', color: 'white', fontSize: mobile ? '14px' : '13px' }}>💰 PRECIO VENTA/KG</span>
              <span style={{ fontWeight: 'bold', color: 'white', fontSize: mobile ? '18px' : '16px' }}>${precioVentaKg.toFixed(4)}</span>
            </div>
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '2px solid #17a589', paddingBottom: '6px' }}>
            <h4 style={{ margin: 0, color: '#1a1a2e', fontSize: '13px' }}>🛍️ Empaques de Distribución</h4>
            {modoEdicion && <button onClick={agregarFunda} style={{ background: '#17a589', color: 'white', border: 'none', borderRadius: '7px', padding: mobile ? '8px 14px' : '5px 12px', cursor: 'pointer', fontSize: mobile ? '13px' : '11px', fontWeight: 'bold' }}>+ Agregar</button>}
          </div>
          {(!config.fundas || config.fundas.length === 0) && <div style={{ textAlign: 'center', color: '#aaa', fontSize: '13px', padding: '24px' }}>Sin fundas de distribución</div>}
          {(config.fundas || []).map((funda, idx) => (
            <div key={idx} style={{ background: '#f8fffe', border: '1.5px solid #17a589', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', color: '#17a589', fontSize: '13px' }}>Funda {idx + 1}</span>
                {modoEdicion && <button onClick={() => eliminarFunda(idx)} style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px' }}>🗑️</button>}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Funda / Envase</label>
                <BtnBuscar valor={funda.nombre_funda} tipo="funda" indice={idx} color="#17a589" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', color: '#555' }}>Kg por funda</label>
                <NumInput
                  value={funda.kg_por_funda || 1}
                  onChange={v => { if (!modoEdicion) return; const f = [...(config.fundas || [])]; f[idx] = { ...f[idx], kg_por_funda: parseFloat(v) || 1 }; setConfig(p => ({ ...p, fundas: f })); programarAutoGuardado(); }}
                  disabled={!modoEdicion}
                  step="0.1"
                  style={{ width: mobile ? 110 : 90, padding: mobile ? '9px' : '5px', borderRadius: '7px', border: '1.5px solid #ddd', fontSize: '14px', textAlign: 'right', background: modoEdicion ? 'white' : '#f0f0f0' }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Etiqueta</label>
                <BtnBuscar valor={funda.nombre_etiqueta} tipo="etiqueta" indice={idx} color="#7f8c8d" />
              </div>
              <div style={{ background: '#17a589', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>💰 Precio sugerido</span>
                <span style={{ color: 'white', fontSize: mobile ? '16px' : '14px', fontWeight: 'bold' }}>${precioFunda(funda).toFixed(4)}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '5px', textAlign: 'right' }}>N° fundas: {funda.kg_por_funda > 0 ? Math.ceil(totalCrudoKg / funda.kg_por_funda) : '-'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Comparador ────────────────────────────────────────────
  const PanelComparador = () => {
    const filasAnt = formulaAnterior?.filas || [];
    const antMP = filasAnt.filter(f => f.seccion === 'MATERIAS PRIMAS');
    const antAD = filasAnt.filter(f => f.seccion === 'CONDIMENTOS Y ADITIVOS');
    const totalGAnt = filasAnt.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0);
    function colorDiff(act, ant) { if (!ant) return '#1a1a2e'; const d = act - ant; return d > 0 ? '#27ae60' : d < 0 ? '#e74c3c' : '#555'; }
    function flechaDiff(act, ant) { if (!ant) return ''; const d = act - ant; return d > 0 ? ` ▲${d.toFixed(1)}` : d < 0 ? ` ▼${Math.abs(d).toFixed(1)}` : ' ═'; }
    const TablaCompar = ({ listaAct, listaAnt, titulo, colorH }) => (
      <div style={{ marginBottom: 16 }}>
        <div style={{ background: colorH, color: 'white', padding: '8px 14px', fontWeight: 'bold', fontSize: '13px', borderRadius: '8px 8px 0 0' }}>{titulo}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead><tr style={{ background: '#f0f2f5' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', color: '#555', fontWeight: 'bold', fontSize: '11px', width: '35%' }}>INGREDIENTE</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', color: '#1a5276', fontWeight: 'bold', fontSize: '11px' }}>ACTUAL (g)</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', color: '#6c3483', fontWeight: 'bold', fontSize: '11px' }}>ANTERIOR (g)</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', color: '#555', fontWeight: 'bold', fontSize: '11px' }}>DIFERENCIA</th>
          </tr></thead>
          <tbody>
            {listaAct.map((ing, i) => {
              const ant = listaAnt.find(a => norm(a.ingrediente_nombre) === norm(ing.ingrediente_nombre));
              const gAct = parseFloat(ing.gramos) || 0;
              const gAnt = ant ? parseFloat(ant.gramos) || 0 : null;
              return (
                <tr key={i} style={{ background: !ant ? '#e8f5e9' : (i % 2 === 0 ? '#fafafa' : 'white'), borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>
                    {ing.ingrediente_nombre}{ing.especificacion?.trim() ? ` (${ing.especificacion.trim()})` : ''}
                    {!ant && <span style={{ marginLeft: 6, fontSize: '10px', background: '#27ae60', color: 'white', padding: '1px 6px', borderRadius: 8 }}>NUEVO</span>}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a5276' }}>{gAct.toLocaleString()}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6c3483' }}>{gAnt !== null ? gAnt.toLocaleString() : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: colorDiff(gAct, gAnt) }}>{gAnt !== null ? flechaDiff(gAct, gAnt) : '—'}</td>
                </tr>
              );
            })}
            {listaAnt.filter(a => !listaAct.find(act => norm(act.ingrediente_nombre) === norm(a.ingrediente_nombre))).map((ant, i) => (
              <tr key={'del' + i} style={{ background: '#fde8e8', borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '7px 10px', color: '#e74c3c' }}>{ant.ingrediente_nombre}<span style={{ marginLeft: 6, fontSize: '10px', background: '#e74c3c', color: 'white', padding: '1px 6px', borderRadius: 8 }}>ELIMINADO</span></td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#aaa' }}>—</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e74c3c' }}>{parseFloat(ant.gramos || 0).toLocaleString()}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e74c3c' }}>▼ {parseFloat(ant.gramos || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.12)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '2px solid #3498db', paddingBottom: 10 }}>
          <div><h3 style={{ margin: 0, color: '#1a1a2e', fontSize: '15px' }}>🔍 Comparador de Fórmulas</h3><div style={{ fontSize: '12px', color: '#888', marginTop: 3 }}>{producto.nombre}</div></div>
          <button onClick={() => { setComparadorAbierto(false); setFormulaAnterior(null); }} style={{ background: '#e74c3c', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>✕ Cerrar</button>
        </div>
        <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 4 }}>Fecha a comparar:</label>
            {fechasDisponibles.length > 0 ? (
              <select value={fechaComparar} onChange={e => setFechaComparar(e.target.value)} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #3498db', fontSize: '14px', fontWeight: 'bold' }}>
                {fechasDisponibles.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            ) : <div style={{ color: '#e74c3c', fontSize: '13px', padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>Sin historial guardado</div>}
          </div>
          {fechasDisponibles.length > 0 && (
            <button onClick={cargarFormulaAnterior} disabled={cargandoCompar} style={{ padding: '9px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', marginTop: 20 }}>
              {cargandoCompar ? '⏳...' : '🔍 Comparar'}
            </button>
          )}
        </div>
        {formulaAnterior && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#e8f4fd', borderRadius: 10, padding: '10px', textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#555', fontWeight: 700 }}>ACTUAL</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a5276' }}>{totalCrudoG.toLocaleString()} g</div></div>
              <div style={{ background: '#f3e5f5', borderRadius: 10, padding: '10px', textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#555', fontWeight: 700 }}>ANTERIOR</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6c3483' }}>{totalGAnt.toLocaleString()} g</div></div>
              <div style={{ background: totalCrudoG > totalGAnt ? '#e8f5e9' : '#fde8e8', borderRadius: 10, padding: '10px', textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#555', fontWeight: 700 }}>DIFERENCIA</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: totalCrudoG > totalGAnt ? '#27ae60' : '#e74c3c' }}>{totalCrudoG > totalGAnt ? '+' : ''}{(totalCrudoG - totalGAnt).toLocaleString()} g</div></div>
            </div>
            <TablaCompar listaAct={ingredientesMP} listaAnt={antMP} titulo="🥩 MATERIAS PRIMAS" colorH="#1a5276" />
            <TablaCompar listaAct={ingredientesAD} listaAnt={antAD} titulo="🧂 CONDIMENTOS Y ADITIVOS" colorH="#6c3483" />
          </>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ══════════════════════════════════════════════
  const btnBase = { border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', minHeight: mobile ? 40 : 0 };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      {/* HEADER */}
      <div style={{ background: modoEdicion ? 'linear-gradient(135deg,#1a3a1a,#1e5c1e)' : 'linear-gradient(135deg,#1a1a2e,#16213e)', padding: mobile ? '10px 12px' : '12px 20px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', transition: 'background 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mobile ? 8 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 8 }}>
            <button onClick={onVolverMenu} style={{ ...btnBase, background: 'rgba(255,200,0,0.25)', color: '#ffd700', padding: mobile ? '8px 10px' : '7px 12px', border: '1px solid rgba(255,200,0,0.4)', fontSize: '12px' }}>🏠 Menú</button>
            <button onClick={onVolver} style={{ ...btnBase, background: 'rgba(255,255,255,0.15)', color: 'white', padding: mobile ? '8px 12px' : '7px 14px', border: '1px solid rgba(255,255,255,0.25)' }}>← Volver</button>
            {/* BOTÓN MATERIAS PRIMAS — punto 3 */}
            {onAbrirMaterias && (
              <button
                onClick={onAbrirMaterias}
                title="Abrir Materias Primas"
                style={{ ...btnBase, background: 'rgba(255,255,255,0.15)', color: 'white', padding: mobile ? '8px 10px' : '7px 12px', border: '1px solid rgba(255,255,255,0.25)', fontSize: '12px' }}>
                📦 {mobile ? '' : 'Materias'}
              </button>
            )}
            <div>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '14px' : '17px', lineHeight: 1.2 }}>
                🧪 {producto.nombre}
                {modoEdicion && <span style={{ marginLeft: 8, fontSize: '11px', background: '#f39c12', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>EDITANDO</span>}
              </div>
              <div style={{ color: '#aaa', fontSize: '10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                {modoEdicion ? '✏️ Editando' : '🔒 Fijada — presiona Editar'}
                {autoGuardando && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', color: '#aef' }}>💾 guardando...</span>}
              </div>
            </div>
          </div>
          {!mobile && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="date" value={config.fecha || ''} onChange={e => setConfig({ ...config, fecha: e.target.value })} style={{ padding: '6px', borderRadius: '7px', border: 'none', fontSize: '12px' }} />
              <button onClick={imprimir} style={{ ...btnBase, padding: '8px 14px', background: '#2980b9', color: 'white' }}>🖨️ Imprimir</button>
              {/* BOTÓN DESCARGAR EXCEL — punto 3 */}
              <button onClick={descargarExcel} style={{ ...btnBase, padding: '8px 14px', background: '#27ae60', color: 'white' }}>📥 Excel</button>
              <button onClick={() => setComparadorAbierto(!comparadorAbierto)} style={{ ...btnBase, padding: '8px 14px', background: comparadorAbierto ? '#f39c12' : '#95a5a6', color: 'white' }}>🔍 Comparar</button>
              {userRol?.rol === 'produccion' && (
                <button onClick={() => setModalNota(true)} style={{ ...btnBase, padding: '8px 14px', background: '#e67e22', color: 'white' }}>✉️ Nota</button>
              )}
              {modoEdicion ? (
                <>
                  <button onClick={async () => { await guardar(); setModoEdicion(false); }} disabled={guardando} style={{ ...btnBase, padding: '8px 18px', background: '#27ae60', color: 'white' }}>{guardando ? 'Guardando...' : '🔒 Fijar cambios'}</button>
                  <button onClick={guardarHistorial} disabled={guardandoHistorial} style={{ ...btnBase, padding: '8px 14px', background: '#e67e22', color: 'white' }}>{guardandoHistorial ? '...' : '📋 Guardar Historial'}</button>
                </>
              ) : (
                <button onClick={() => setModoEdicion(true)} style={{ ...btnBase, padding: '8px 18px', background: '#8e44ad', color: 'white' }}>✏️ Editar</button>
              )}
            </div>
          )}
        </div>
        {mobile && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={config.fecha || ''} onChange={e => setConfig({ ...config, fecha: e.target.value })} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontSize: '13px', minHeight: 40 }} />
            <button onClick={imprimir} style={{ ...btnBase, padding: '8px 10px', background: '#2980b9', color: 'white' }}>🖨️</button>
            <button onClick={descargarExcel} style={{ ...btnBase, padding: '8px 10px', background: '#27ae60', color: 'white' }}>📥</button>
            <button onClick={() => setComparadorAbierto(!comparadorAbierto)} style={{ ...btnBase, padding: '8px 10px', background: comparadorAbierto ? '#f39c12' : '#95a5a6', color: 'white' }}>🔍</button>
            {userRol?.rol === 'produccion' && <button onClick={() => setModalNota(true)} style={{ ...btnBase, padding: '8px 10px', background: '#e67e22', color: 'white' }}>✉️</button>}
            {modoEdicion ? (
              <>
                <button onClick={async () => { await guardar(); setModoEdicion(false); }} disabled={guardando} style={{ ...btnBase, padding: '8px 10px', background: '#27ae60', color: 'white' }}>🔒</button>
                <button onClick={guardarHistorial} disabled={guardandoHistorial} style={{ ...btnBase, padding: '8px 10px', background: '#e67e22', color: 'white' }}>📋</button>
              </>
            ) : (
              <button onClick={() => setModoEdicion(true)} style={{ ...btnBase, padding: '8px 14px', background: '#8e44ad', color: 'white' }}>✏️</button>
            )}
          </div>
        )}
      </div>

      {msgExito && <div style={{ background: '#d4edda', color: '#155724', padding: '10px 16px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>{msgExito}</div>}

      <div style={{ padding: mobile ? '10px' : '16px 20px' }}>
        {modoEdicion && (
          <div style={{ background: 'white', borderRadius: '12px', padding: mobile ? '10px' : '12px 16px', marginBottom: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', gap: mobile ? 6 : 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', whiteSpace: 'nowrap' }}>Nº PARADAS</label>
              <NumInput
                value={config.num_paradas || 1}
                onChange={v => { if (!modoEdicion) return; setConfig({ ...config, num_paradas: parseInt(v) || 1 }); programarAutoGuardado(); }}
                disabled={!modoEdicion}
                style={{ width: mobile ? 55 : 60, padding: mobile ? '7px' : '5px', borderRadius: '7px', border: '1.5px solid #ddd', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', background: modoEdicion ? 'white' : '#f0f0f0' }}
              />
            </div>
            {[['TOTAL CRUDO', `${totalCrudoG.toLocaleString()} g`, '#f8f9fa', '#2c3e50'], ['COSTO BATCH', `$${totalCostoMP.toFixed(2)}`, '#f8f9fa', '#c0392b'], ['COSTO/KG MP', `$${costoMPkg.toFixed(4)}`, '#f8f9fa', '#c0392b'], ['PRECIO VENTA/KG', `$${precioVentaKg.toFixed(4)}`, '#27ae60', 'white']].map(([l, v, bg, col]) => (
              <div key={l} style={{ textAlign: 'center', background: bg, padding: mobile ? '6px 10px' : '8px 14px', borderRadius: '8px', flex: mobile ? '1 1 auto' : undefined }}>
                <div style={{ fontSize: '9px', color: bg === '#27ae60' ? '#a9dfbf' : '#888', fontWeight: 700, letterSpacing: '0.5px' }}>{l}</div>
                <div style={{ fontSize: mobile ? '13px' : '15px', fontWeight: 'bold', color: col, whiteSpace: 'nowrap' }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {modoEdicion && mobile && (
          <div style={{ display: 'flex', background: 'white', borderRadius: '10px', padding: '4px', marginBottom: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', gap: 4 }}>
            {[['formula', '🧪 Fórmula'], ['costos', '📊 Costos'], ['empaques', '🛍️ Empaques'], ['comparar', '🔍 Comparar']].map(([key, label]) => (
              <button key={key} onClick={() => { setSeccionActiva(key); if (key === 'comparar') setComparadorAbierto(true); }}
                style={{ flex: 1, padding: '8px 2px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', background: seccionActiva === key ? '#1a1a2e' : 'transparent', color: seccionActiva === key ? 'white' : '#666', transition: 'all 0.2s' }}>{label}</button>
            ))}
          </div>
        )}

        {(comparadorAbierto || (mobile && seccionActiva === 'comparar')) && <PanelComparador />}

        {(!mobile || seccionActiva === 'formula') && (
          <>
            {!modoEdicion && <VistaLimpia />}
            {modoEdicion && (
              <>
                <SeccionIngredientes lista={ingredientesMP} seccion="MP" colorH="#1a5276" />
                <SeccionIngredientes lista={ingredientesAD} seccion="AD" colorH="#6c3483" />
                <div style={{ background: '#1a5276', borderRadius: '12px', padding: mobile ? '12px 14px' : '12px 20px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '13px' : '15px' }}>TOTAL CRUDO</span>
                  <div style={{ display: 'flex', gap: mobile ? 14 : 24 }}>
                    {[['GRAMOS', totalCrudoG.toLocaleString()], ['KILOS', totalCrudoKg.toFixed(3)], ['COSTO', `$${totalCostoMP.toFixed(3)}`]].map(([l, v]) => (
                      <div key={l} style={{ textAlign: 'center' }}>
                        <div style={{ color: '#aaa', fontSize: '9px', fontWeight: 700 }}>{l}</div>
                        <div style={{ color: l === 'COSTO' ? '#f39c12' : 'white', fontWeight: 'bold', fontSize: mobile ? '14px' : '15px' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {modoEdicion && (!mobile || seccionActiva === 'costos' || seccionActiva === 'empaques') && <PanelCostos />}
      </div>

      {/* MODAL BUSCADOR — búsqueda con tildes ignoradas */}
      {buscador.abierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '12px', width: mobile ? '100%' : '520px', maxHeight: mobile ? '85vh' : '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 30px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#1a5276', padding: '14px 16px', borderRadius: mobile ? '16px 16px 0 0' : '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '15px' : '14px' }}>
                🔍 {['empaque', 'funda', 'hilo'].includes(buscador.tipo) ? 'Buscar Empaque' : buscador.tipo === 'etiqueta' ? 'Buscar Etiqueta' : 'Buscar Materia Prima'}
              </span>
              <button onClick={() => setBuscador({ abierto: false, tipo: '', indice: null, texto: '' })} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer', borderRadius: '6px', padding: '4px 10px' }}>✕</button>
            </div>
            <div style={{ padding: '12px' }}>
              <input autoFocus placeholder="Buscar... (ej: oregano = orégano)" value={buscador.texto} onChange={e => setBuscador({ ...buscador, texto: e.target.value })}
                style={{ width: '100%', padding: mobile ? '12px' : '9px', borderRadius: '9px', border: '1.5px solid #ddd', fontSize: mobile ? '16px' : '13px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 12px 12px' }}>
              {mpFiltradas.slice(0, 40).map(mp => (
                <div key={mp.id} onClick={() => seleccionarMP(mp)}
                  style={{ padding: mobile ? '12px 14px' : '9px 12px', borderRadius: '9px', cursor: 'pointer', marginBottom: '4px', border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: mobile ? 56 : 0 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eaf4fb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: mobile ? '14px' : '12px', color: '#1a5276' }}>{mp.nombre_producto || mp.nombre}</div>
                    <div style={{ fontSize: mobile ? '11px' : '10px', color: '#888' }}>{mp.id} — {mp.categoria}</div>
                  </div>
                  <div style={{ fontWeight: 'bold', color: mp.categoria?.toUpperCase().includes('AGUA') ? '#3498db' : '#27ae60', fontSize: mobile ? '15px' : '13px' }}>
                    {mp.categoria?.toUpperCase().includes('AGUA') ? '💧' : ''}${mp.categoria?.toUpperCase().includes('AGUA') ? getPrecioAgua().toFixed(4) : parseFloat(mp.precio_kg || 0).toFixed(2)}/kg
                  </div>
                </div>
              ))}
              {mpFiltradas.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>No se encontraron resultados</div>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOTA */}
      {modalNota && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '12px', width: mobile ? '100%' : '480px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#1a1a2e', fontSize: '15px' }}>✉️ Enviar nota al Administrador</h3>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Producto: <strong>{producto.nombre}</strong></div>
            <textarea value={textoNota} onChange={e => setTextoNota(e.target.value)} placeholder="Escribe tu nota aquí..." rows={4}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e67e22', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Arial' }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={enviarNota} disabled={enviandoNota || !textoNota.trim()} style={{ padding: '10px 20px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                {enviandoNota ? 'Enviando...' : '✉️ Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Formulacion;
