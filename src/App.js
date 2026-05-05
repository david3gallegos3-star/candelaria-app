// ============================================
// App.js — Solo lógica y navegación
// Versión modular — abril 2026
// ============================================
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

// Módulos principales
import Formulacion    from './Formulacion';
import ModCif         from './ModCif';
import ResumenPrecios from './ResumenPrecios';
import HistorialMP    from './HistorialMP';
import Inventario     from './Inventario';
import Produccion        from './Produccion';
import GeminiChat     from './GeminiChat';
import Clientes    from './Clientes';
import Auditoria   from './Auditoria';
import Facturacion from './Facturacion';
import Compras       from './Compras';
import Conciliacion  from './Conciliacion';
import RRHH          from './RRHH';
import Trazabilidad  from './Trazabilidad';
import Dashboard     from './Dashboard';
import './App.css';
import html2canvas from 'html2canvas';

// Componentes
import { checkRecordatoriosFactura, crearNotificacion } from './utils/helpers';
import LoginScreen    from './components/LoginScreen';
import MenuPrincipal  from './components/MenuPrincipal';
import GestorUsuarios from './components/GestorUsuarios';

// Screens modulares
import PantallaHistorial from './screens/historial/PantallaHistorial';
import PantallaMaterias  from './screens/materias/PantallaMaterias';
import MenuFormulas      from './screens/formulas/MenuFormulas';
import InventarioProduccion from './screens/produccion/InventarioProduccion';

// Hooks y helpers
import { useAuth }           from './hooks/useAuth';

// ── EMOJIS_CAT global (compartido con MenuFormulas) ──
export const EMOJIS_CAT = {};

function App() {

  // ── Auth ─────────────────────────────────────────────
  const {
    user, userRol, loading,
    email, setEmail,
    password, setPassword,
    notifTimer,
    login, logout,
    checkSession,
  } = useAuth();

  // ── Navegación ────────────────────────────────────────
  const [pantalla,        setPantalla]        = useState('login');
  const [historialNav,    setHistorialNav]    = useState([]);
  const [productoActivo,  setProductoActivo]  = useState(null);
  const [formulaContexto,     setFormulaContexto]     = useState(null);
  const [formulaIngredientes, setFormulaIngredientes] = useState(null);

  function navegarA(destino) {
    setHistorialNav(prev => [...prev, pantalla]);
    setPantalla(destino);
  }

  function volverAtras() {
    if (historialNav.length === 0) { setPantalla('menu'); return; }
    const nuevo    = [...historialNav];
    const anterior = nuevo.pop();
    setHistorialNav(nuevo);
    setPantalla(anterior);
  }

  // ── Estados globales ──────────────────────────────────
  const [msgExito,         setMsgExito]         = useState('');
  const [productos,        setProductos]        = useState([]);
  const [materias,         setMaterias]         = useState([]);
  const [categoriasConfig, setCategoriasConfig] = useState({});
  const [categoriasMp,     setCategoriasMp]     = useState([]);
  const [importando,       setImportando]       = useState(false);
  const [progreso,         setProgreso]         = useState('');

  // ── Notificaciones ────────────────────────────────────
  const [notificaciones, setNotificaciones] = useState([]);
  const [campanAbierta,  setCampanaAbierta] = useState(false);
  const [notifNoLeidas,  setNotifNoLeidas]  = useState(0);

  // ── Usuarios ──────────────────────────────────────────
  const [modalUsuarios,   setModalUsuarios]   = useState(false);
  const [usuariosRoles,   setUsuariosRoles]   = useState([]);
  const [editandoUsuario, setEditandoUsuario] = useState(null);


    // ── Estados importar fórmulas ─────────────────────────
  const [modalImportar,      setModalImportar]      = useState(false);
  const [hojasExcel,         setHojasExcel]         = useState([]);
  const [hojasSeleccionadas, setHojasSeleccionadas] = useState(new Set());
  const [analizando,         setAnalizando]         = useState(false);
  const [resultadosIA,       setResultadosIA]       = useState([]);
  const [excelBuffer,        setExcelBuffer]        = useState(null);
  const [wbGlobal,           setWbGlobal]           = useState(null);
  const [faseImportar,       setFaseImportar]       = useState('seleccionar'); // 'seleccionar' | 'confirmar'

  // ── Estados modales productos/categorías ──────────────
  const [modalNuevo,       setModalNuevo]       = useState(false);
  const [nuevoNombre,      setNuevoNombre]      = useState('');
  const [nuevaCategoria,   setNuevaCategoria]   = useState('');
  const [nuevoMpVinculado, setNuevoMpVinculado] = useState(null);
  const [editando,       setEditando]       = useState(null);
  const [modalGestionar, setModalGestionar] = useState(false);
  const [tabGestionar,   setTabGestionar]   = useState('productos');
  const [modalNuevaCat,  setModalNuevaCat]  = useState(false);
  const [nuevaCatNombre, setNuevaCatNombre] = useState('');
  const [nuevaCatEmoji,  setNuevaCatEmoji]  = useState('📦');
  const [editandoCat,    setEditandoCat]    = useState(null);
  const [confirmElimCat, setConfirmElimCat] = useState(null);

  // ── Refs ──────────────────────────────────────────────
  const fileRefHistorial = useRef();

  // ── Helpers ───────────────────────────────────────────
  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 5000);
  }

  function generarSiguienteId(categoria) {
    const mpsCat = materias.filter(m => m.categoria === categoria);
    if (mpsCat.length === 0) return '';
    const ids = mpsCat.map(m => m.id).filter(Boolean);
    if (ids.length === 0) return '';
    const primerID    = ids[0];
    const prefixMatch = primerID.match(/^([A-Za-z]+)(\d+)$/);
    if (!prefixMatch) return '';
    const prefix    = prefixMatch[1];
    const numDigits = prefixMatch[2].length;
    let maxNum = 0;
    ids.forEach(id => {
      const match = id.match(/^[A-Za-z]+(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });
    return prefix + String(maxNum + 1).padStart(numDigits, '0');
  }

  // ── Carga de datos ────────────────────────────────────
  async function cargarTodo() {
    await asegurarCategoriasBase();
    await Promise.all([
      cargarCategorias(),
      cargarCategoriasMpDB(),
      cargarMaterias(),
    ]);
  }

  async function asegurarCategoriasBase() {
    const { data: cats } = await supabase.from('categorias_productos').select('nombre,orden').order('orden', { ascending: false });
    const existentes = (cats || []).map(c => c.nombre);
    const maxOrden   = (cats?.[0]?.orden ?? 0);

    const nuevas = [
      { nombre: 'SALMUERAS',  emoji: '🧂' },
      { nombre: 'CORTES',     emoji: '🥩' },
      { nombre: 'INMERSIÓN',  emoji: '💧' },
      { nombre: 'MARINADOS',  emoji: '🫙' },
    ].filter(c => !existentes.includes(c.nombre));

    for (let i = 0; i < nuevas.length; i++) {
      await supabase.from('categorias_productos').insert({ ...nuevas[i], orden: maxOrden + i + 1 });
    }

    const { data: mpCats } = await supabase.from('categorias_mp').select('nombre,orden').order('orden', { ascending: false });
    const mpExistentes = (mpCats || []).map(c => c.nombre);
    const maxOrdenMp   = (mpCats?.[0]?.orden ?? 0);
    let ordenMp = maxOrdenMp;
    for (const mpCat of ['Salmuera', 'Inmersión', 'Marinados', 'Inyectados']) {
      if (!mpExistentes.includes(mpCat)) {
        ordenMp++;
        await supabase.from('categorias_mp').insert({ nombre: mpCat, orden: ordenMp });
      }
    }
    if (!mpExistentes.includes('Retazos')) {
      ordenMp++;
      await supabase.from('categorias_mp').insert({ nombre: 'Retazos', orden: ordenMp });
    }
    // Asegurar que exista la MP de retazos (puede estar como nombre viejo o nuevo)
    const { data: mpRetazos } = await supabase.from('materias_primas')
      .select('id').in('nombre', ['Retazos Cortes', 'Aserrín Cortes']).limit(1);
    if (!mpRetazos || mpRetazos.length === 0) {
      await supabase.from('materias_primas').upsert({
        id: 'RET001',
        nombre: 'Aserrín Cortes', nombre_producto: 'Aserrín Cortes',
        categoria: 'Retazos', precio_kg: 0,
        estado: 'ACTIVO', eliminado: false,
      }, { onConflict: 'id', ignoreDuplicates: true });
    }
  }

  async function cargarCategorias() {
    const { data: cats  } = await supabase
      .from('categorias_productos').select('*').order('orden');
    const { data: prods } = await supabase
    .from('productos').select('*')
    .eq('eliminado', false)
    .order('nombre');
    const config = {};
    (cats||[]).forEach(cat => {
      config[cat.nombre] = [];
      EMOJIS_CAT[cat.nombre] = cat.emoji || '📋';
    });
    (prods||[]).forEach(prod => {
      if (config[prod.categoria]) config[prod.categoria].push(prod.nombre);
      else if (prod.categoria)    config[prod.categoria] = [prod.nombre];
    });
    setCategoriasConfig(config);
    setProductos(prods||[]);
    if (cats && cats.length > 0 && !nuevaCategoria)
      setNuevaCategoria(cats[0].nombre);
  }

  async function cargarCategoriasMpDB() {
    const { data } = await supabase
      .from('categorias_mp').select('*').order('orden');
    if (data && data.length > 0)
      setCategoriasMp(data.map(c => c.nombre));
  }

  async function cargarMaterias() {
    const { data } = await supabase
      .from('materias_primas').select('*')
      .eq('eliminado', false)        // ← agrega solo esta línea
      .order('categoria').order('id');
    setMaterias(data||[]);
  }

  async function cargarUsuariosRoles() {
    const { data } = await supabase
      .from('usuarios_roles').select('*').order('created_at');
    setUsuariosRoles(data||[]);
  }

  // ── Notificaciones ────────────────────────────────────
  async function cargarNotificaciones() {
    if (!user) return;
    const ahora = new Date().toISOString();
    const { data } = await supabase.from('notificaciones')
      .select('*').eq('leida', false)
      .gt('expires_at', ahora)
      .order('created_at', { ascending: false });
    setNotificaciones(data||[]);
    setNotifNoLeidas((data||[]).length);
  }

  // ── useEffects ────────────────────────────────────────
  useEffect(() => {
    checkSession(async () => {
      await cargarTodo();
      setPantalla('menuPrincipal');
    });
  }, []);

  useEffect(() => {
    if (user && userRol?.rol === 'admin') {
      cargarNotificaciones();
      checkRecordatoriosFactura();
      notifTimer.current = setInterval(() => {
        cargarNotificaciones();
        checkRecordatoriosFactura();
      }, 30000);
      return () => clearInterval(notifTimer.current);
    }
  }, [user, userRol]);

  // ── Productos ─────────────────────────────────────────
  function abrirProducto(prod) {
    if (typeof prod === 'string') {
      const p = productos.find(x => x.nombre === prod);
      if (p) { setProductoActivo(p); navegarA('formulacion'); }
      else {
        const cat = Object.keys(categoriasConfig)[0] || 'OTROS';
        supabase.from('productos')
          .insert([{ nombre: prod, categoria: cat, estado:'ACTIVO' }])
          .select().single()
          .then(({ data }) => {
            if (data) {
              cargarCategorias();
              setProductoActivo(data);
              navegarA('formulacion');
            }
          });
      }
    } else {
      setProductoActivo(prod);
      navegarA('formulacion');
    }
  }

  const CATS_PROTEGIDAS = ['SALMUERAS', 'CORTES', 'INMERSIÓN', 'MARINADOS'];

  // Mapa categoría producto → { cat: categoría MP, pref: prefijo ID }
  const MP_CAT_MAP = {
    'SALMUERAS': { cat: 'Salmuera',  pref: 'SAL' },
    'INMERSIÓN': { cat: 'Inmersión', pref: 'INM' },
    'MARINADOS': { cat: 'Marinados', pref: 'MAR' },
  };

  async function sincronizarFormulaMP(nombre, precio_kg, categoriaMp, prefijo) {
    const { data: ex } = await supabase.from('materias_primas')
      .select('id').eq('nombre_producto', nombre).eq('categoria', categoriaMp).maybeSingle();
    if (ex) {
      await supabase.from('materias_primas').update({ precio_kg }).eq('id', ex.id);
      return;
    }
    const { data: existentes } = await supabase.from('materias_primas')
      .select('id').eq('categoria', categoriaMp);
    const nums = (existentes || [])
      .map(m => parseInt((m.id || '').replace(/\D/g, '') || '0'))
      .filter(n => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const newId = prefijo + String(nextNum).padStart(3, '0');
    const { error } = await supabase.from('materias_primas').insert({
      id: newId, nombre, nombre_producto: nombre,
      categoria: categoriaMp, precio_kg: parseFloat(precio_kg) || 0,
      precio_lb: 0, precio_gr: 0, estado: 'ACTIVO', eliminado: false,
    });
    if (error) console.error(`Error sync ${categoriaMp} MP:`, error.message);
  }

  async function crearProducto(deshueseConfig = null) {
    if (!nuevoNombre.trim()) return alert('Escribe el nombre del producto');
    const catSel = nuevaCategoria || Object.keys(categoriasConfig)[0];
    const esCorte = catSel === 'Cortes' || catSel === 'CORTES';
    if (esCorte && !nuevoMpVinculado) return alert('Selecciona la materia prima vinculada a este corte');
    // Verificar duplicado
    const { data: existe } = await supabase.from('productos')
      .select('id').eq('nombre', nuevoNombre.trim()).eq('estado', 'ACTIVO').limit(1);
    if ((existe || []).length > 0) return alert(`Ya existe un producto activo llamado "${nuevoNombre.trim()}". Usa un nombre diferente o elimina el existente primero.`);
    const { data, error } = await supabase.from('productos')
      .insert([{
        nombre: nuevoNombre.trim(),
        categoria: catSel,
        estado: 'ACTIVO',
        ...(esCorte && nuevoMpVinculado ? { mp_vinculado_id: nuevoMpVinculado.id } : {}),
      }])
      .select().single();
    if (error) return alert('Error: ' + error.message);

    // Guardar relación de deshuese si fue configurada
    if (esCorte && deshueseConfig && deshueseConfig.dshNombreHijo) {
      const padre = deshueseConfig.dshTipo === 'padre' ? nuevoNombre.trim() : deshueseConfig.dshNombreHijo;
      const hijo  = deshueseConfig.dshTipo === 'padre' ? deshueseConfig.dshNombreHijo : nuevoNombre.trim();
      if (padre && hijo) {
        await supabase.from('deshuese_config').delete().eq('corte_padre', padre);
        await supabase.from('deshuese_config').insert({ corte_padre: padre, corte_hijo: hijo, activo: true });
      }
    }
    if (MP_CAT_MAP[catSel]) await sincronizarFormulaMP(nuevoNombre.trim(), 0, MP_CAT_MAP[catSel].cat, MP_CAT_MAP[catSel].pref);
    await crearNotificacion({
      tipo:            'nuevo_producto',
      origen:          'formulacion',
      usuario_nombre:  userRol?.nombre || 'Usuario',
      user_id:         user?.id || null,
      producto_nombre: nuevoNombre.trim(),
      mensaje:         `➕ Nuevo producto "${nuevoNombre.trim()}" creado en categoría ${catSel}`
    });
    setModalNuevo(false);
    setNuevoNombre('');
    setNuevoMpVinculado(null);
    await cargarCategorias();
    if (MP_CAT_MAP[catSel]) await cargarMaterias();
    mostrarExito('✅ Producto creado');
    setProductoActivo(data);
    navegarA('formulacion');
  }

  async function eliminarProducto(nombre) {
    if (!window.confirm(`¿Eliminar "${nombre}"?`)) return;
    const prod = productos.find(p => p.nombre === nombre);
    if (prod) {
      await supabase.from('productos').update({
        eliminado:     true,
        eliminado_at:  new Date().toISOString(),
        eliminado_por: userRol?.nombre || 'Admin',
        estado:        'INACTIVO'
      }).eq('id', prod.id);
      if (MP_CAT_MAP[prod.categoria]) {
        await supabase.from('materias_primas')
          .update({ eliminado: true })
          .eq('nombre_producto', nombre).eq('categoria', MP_CAT_MAP[prod.categoria].cat);
      }
    }
    await cargarCategorias();
    if (MP_CAT_MAP[prod?.categoria]) await cargarMaterias();
    mostrarExito('🗑️ Eliminado — recupéralo en Gestionar → Eliminados');
  }

  async function guardarEdicionProducto() {
    if (!editando?.nuevoNombre?.trim()) return;
    const prod = productos.find(p => p.nombre === editando.nombre);
    await supabase.from('productos')
      .update({ nombre: editando.nuevoNombre }).eq('nombre', editando.nombre);
    await supabase.from('formulaciones')
      .update({ producto_nombre: editando.nuevoNombre }).eq('producto_nombre', editando.nombre);
    await supabase.from('config_productos')
      .update({ producto_nombre: editando.nuevoNombre }).eq('producto_nombre', editando.nombre);
    if (MP_CAT_MAP[prod?.categoria]) {
      await supabase.from('materias_primas')
        .update({ nombre: editando.nuevoNombre, nombre_producto: editando.nuevoNombre })
        .eq('nombre_producto', editando.nombre).eq('categoria', MP_CAT_MAP[prod.categoria].cat);
    }
    setEditando(null);
    await cargarCategorias();
    if (MP_CAT_MAP[prod?.categoria]) await cargarMaterias();
    mostrarExito('✅ Nombre actualizado');
  }

  async function moverCategoria(nombre, catActual, nuevaCat) {
    if (CATS_PROTEGIDAS.includes(catActual) || CATS_PROTEGIDAS.includes(nuevaCat)) {
      alert('Las categorías SALMUERAS, CORTES, INMERSIÓN y MARINADOS son protegidas — no se pueden mover productos.');
      return;
    }
    await supabase.from('productos')
      .update({ categoria: nuevaCat }).eq('nombre', nombre);
    await cargarCategorias();
    mostrarExito('✅ Categoría actualizada');
  }

  // ── Categorías productos ──────────────────────────────
  async function crearCategoria() {
    const nombre = nuevaCatNombre.trim().toUpperCase();
    if (!nombre) return alert('Escribe un nombre');
    if (categoriasConfig[nombre]) return alert('Ya existe');
    const orden = Object.keys(categoriasConfig).length;
    const { error } = await supabase.from('categorias_productos')
      .insert([{ nombre, emoji: nuevaCatEmoji, orden }]);
    if (error) return alert('Error: ' + error.message);
    await crearNotificacion({
      tipo:           'nueva_categoria',
      origen:         'formulacion',
      usuario_nombre: userRol?.nombre || 'Usuario',
      user_id:        user?.id || null,
      mensaje:        `📂 Nueva categoría "${nombre}" ${nuevaCatEmoji} creada en Formulación`
    });
    EMOJIS_CAT[nombre] = nuevaCatEmoji;
    setModalNuevaCat(false);
    setNuevaCatNombre('');
    setNuevaCatEmoji('📦');
    await cargarCategorias();
    mostrarExito(`✅ Categoría "${nombre}" creada`);
  }

  async function guardarEdicionCategoria() {
    if (!editandoCat) return;
    const nombreViejo = editandoCat.nombre;
    const nombreNuevo = editandoCat.nuevoNombre.trim().toUpperCase();
    if (!nombreNuevo) return alert('El nombre no puede estar vacío');
    if (nombreNuevo !== nombreViejo && categoriasConfig[nombreNuevo])
      return alert('Ya existe');
    await supabase.from('categorias_productos')
      .update({ nombre: nombreNuevo, emoji: editandoCat.emoji })
      .eq('nombre', nombreViejo);
    if (nombreNuevo !== nombreViejo)
      await supabase.from('productos')
        .update({ categoria: nombreNuevo }).eq('categoria', nombreViejo);
    EMOJIS_CAT[nombreNuevo] = editandoCat.emoji;
    if (nombreNuevo !== nombreViejo) delete EMOJIS_CAT[nombreViejo];
    setEditandoCat(null);
    await cargarCategorias();
    mostrarExito(`✅ Categoría actualizada a "${nombreNuevo}"`);
  }

  async function eliminarCategoria(nombre) {
    if (CATS_PROTEGIDAS.includes(nombre)) {
      alert(`La categoría "${nombre}" es protegida y no puede eliminarse.`);
      return;
    }
    const prods = categoriasConfig[nombre] || [];
    if (prods.length > 0) { setConfirmElimCat(nombre); return; }
    await supabase.from('categorias_productos').delete().eq('nombre', nombre);
    delete EMOJIS_CAT[nombre];
    await cargarCategorias();
    mostrarExito(`🗑️ Categoría "${nombre}" eliminada`);
  }

  async function confirmarElimCategoria(moverA) {
    const nombre = confirmElimCat;
    if (CATS_PROTEGIDAS.includes(nombre)) {
      alert(`La categoría "${nombre}" es protegida y no puede eliminarse.`);
      setConfirmElimCat(null);
      return;
    }
    const prods  = categoriasConfig[nombre] || [];
    if (moverA && prods.length > 0)
      await supabase.from('productos')
        .update({ categoria: moverA }).eq('categoria', nombre);
    else if (!moverA && prods.length > 0) {
      for (const p of prods) {
        await supabase.from('formulaciones').delete().eq('producto_nombre', p);
        await supabase.from('config_productos').delete().eq('producto_nombre', p);
      }
      const prodIds = productos
        .filter(p => p.categoria === nombre).map(p => p.id);
      if (prodIds.length > 0)
        await supabase.from('productos').delete().in('id', prodIds);
    }
    await supabase.from('categorias_productos').delete().eq('nombre', nombre);
    delete EMOJIS_CAT[nombre];
    setConfirmElimCat(null);
    await cargarCategorias();
    mostrarExito(`🗑️ Categoría "${nombre}" eliminada`);
  }

  // ── Historial precios MP ──────────────────────────────
  async function guardarHistorialPrecios() {
    if (materias.length === 0) return;
    const fecha = new Date().toISOString().split('T')[0];
    const { data: histExistente } = await supabase
      .from('historial_materias_primas').select('mp_id, nombre, precio_kg');
    const existentes = histExistente || [];
    const nuevos = [], duplicados = [];
    for (const mp of materias.filter(m => m.estado === 'ACTIVO')) {
      const precio  = parseFloat(mp.precio_kg) || 0;
      const nombre  = mp.nombre_producto || mp.nombre;
      const esDuplicadoExacto = existentes.some(h =>
        h.mp_id === mp.id &&
        h.nombre === nombre &&
        parseFloat(h.precio_kg) === precio
      );
      if (esDuplicadoExacto) duplicados.push(mp);
      else nuevos.push({
        fecha, mp_id: mp.id, categoria: mp.categoria||'',
        nombre, proveedor: mp.proveedor||'',
        precio_kg: precio,
        precio_gr: parseFloat(mp.precio_gr)||0,
        notas: mp.notas||''
      });
    }
    if (nuevos.length === 0) {
      mostrarExito('ℹ️ No hay cambios nuevos — todos los precios ya están en el historial');
      return;
    }
    if (duplicados.length > 0) {
      const continuar = window.confirm(
        `📋 Guardar Historial MP — ${fecha}\n\n` +
        `✅ ${nuevos.length} con precios nuevos → SE GUARDARÁN\n` +
        `⏭️ ${duplicados.length} sin cambios → SE SALTARÁN\n\n` +
        `• OK = Guardar solo las ${nuevos.length}\n` +
        `• Cancelar = No guardar nada`
      );
      if (!continuar) return;
    }
    for (let i = 0; i < nuevos.length; i += 50)
      await supabase.from('historial_materias_primas')
        .insert(nuevos.slice(i, i + 50));
    mostrarExito(
      duplicados.length > 0
        ? `✅ ${nuevos.length} precio(s) guardados · ${duplicados.length} omitidos`
        : `✅ ${nuevos.length} precio(s) guardados (${fecha})`
    );
  }

// ── Analizar hojas con IA ─────────────────────────────
async function analizarHojasConIA() {
  if (hojasSeleccionadas.size === 0) {
    alert('Selecciona al menos una hoja');
    return;
  }
  setAnalizando(true);
  setProgreso('Preparando análisis...');

  try {
    const XLSX = await import('xlsx');
    const resultados = [];

    for (const nombreHoja of hojasSeleccionadas) {
      setProgreso(`Analizando: ${nombreHoja}...`);

      // Convertir hoja a imagen usando canvas
      const ws = wbGlobal.Sheets[nombreHoja];

      // Convertir hoja a HTML para renderizar
      const htmlStr = XLSX.utils.sheet_to_html(ws);

      // Crear canvas con la hoja
      const canvas = document.createElement('canvas');
      canvas.width  = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Convertir a imagen via blob URL
      const blob = new Blob([htmlStr], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);

      // Usar iframe para renderizar y capturar
      const imageBase64 = await new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1200px;height:1600px;';
        document.body.appendChild(iframe);
        iframe.onload = () => {
          try {
            html2canvas(iframe.contentDocument.body, {
              width: 1200, height: 1600, scale: 1,
              backgroundColor: 'white'
            }).then(c => {
              document.body.removeChild(iframe);
              URL.revokeObjectURL(url);
              resolve(c.toDataURL('image/png').split(',')[1]);
            }).catch(() => {
              document.body.removeChild(iframe);
              URL.revokeObjectURL(url);
              // Fallback: mandar como texto plano
              const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
              const texto = rows.map(r => r.join('\t')).join('\n');
              resolve(btoa(unescape(encodeURIComponent(texto))));
            });
          } catch(err) {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
            const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
            const texto = rows.map(r => r.join('\t')).join('\n');
            resolve(btoa(unescape(encodeURIComponent(texto))));
          }
        };
        iframe.src = url;
      });

      // Llamar a Claude API
      const response = await fetch('/api/analyze-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mediaType: 'image/png',
          nombreHoja
        })
      });

      const data = await response.json();
      let parsed = null;

      try {
        const texto = data.content?.[0]?.text || '{}';
        parsed = JSON.parse(texto);
      } catch(e) {
        console.error('Error parseando respuesta IA para', nombreHoja, e);
      }

      if (parsed?.nombre_producto) {
        // Verificar si ya existe en la app
        const existe = productos.find(p =>
          p.nombre.toLowerCase().trim() === parsed.nombre_producto.toLowerCase().trim()
        );
        resultados.push({
          ...parsed,
          nombreHoja,
          existe: !!existe,
          accion: existe ? 'actualizar' : 'nuevo',
          categoria: existe ? existe.categoria : '',
        });
      }
    }

    setResultadosIA(resultados);
    setFaseImportar('confirmar');

  } catch(err) {
    alert('Error analizando con IA: ' + err.message);
  }

  setAnalizando(false);
  setProgreso('');
}


// ── Confirmar importación ─────────────────────────────
async function confirmarImportacion() {
  setImportando(true);
  setProgreso('Guardando en base de datos...');
  let importados = 0;

  try {
    const { data: mpList } = await supabase.from('materias_primas').select('*');
    const mps = mpList || [];
    const normLocal = s => (s||'').toLowerCase().trim()
      .replace(/[áà]/g,'a').replace(/[éè]/g,'e')
      .replace(/[íì]/g,'i').replace(/[óò]/g,'o')
      .replace(/[úù]/g,'u').replace(/ñ/g,'n')
      .replace(/\s+/g,' ').replace(/[\/\-\.]/g,'').replace(/[()]/g,'').trim();

    for (const res of resultadosIA) {
      if (res.accion === 'saltar') continue;
      setProgreso(`Guardando: ${res.nombre_producto}...`);

      // Crear o buscar producto
      let prodId;
      const prodExistente = productos.find(p =>
        p.nombre.toLowerCase().trim() === res.nombre_producto.toLowerCase().trim()
      );

      if (prodExistente) {
        prodId = prodExistente.id;
      } else {
        const catSel = res.categoria || Object.keys(categoriasConfig)[0] || 'OTROS';
        const { data: nuevoProd } = await supabase.from('productos')
          .insert([{ nombre: res.nombre_producto, categoria: catSel, estado:'ACTIVO' }])
          .select().single();
        prodId = nuevoProd?.id;
      }

      if (!prodId) continue;

      // Guardar ingredientes
      const ingredientes = [
        ...(res.ingredientes_mp || []).map((ing, i) => ({
          producto_id: prodId,
          producto_nombre: res.nombre_producto,
          seccion: 'MP', orden: i,
          ingrediente_nombre: ing.nombre,
          materia_prima_id: mps.find(m =>
            normLocal(m.nombre_producto) === normLocal(ing.nombre) ||
            normLocal(m.nombre) === normLocal(ing.nombre)
          )?.id || null,
          gramos: parseFloat(ing.gramos) || 0,
          kilos: (parseFloat(ing.gramos) || 0) / 1000,
          nota_cambio: '', especificacion: ''
        })),
        ...(res.ingredientes_ad || []).map((ing, i) => ({
          producto_id: prodId,
          producto_nombre: res.nombre_producto,
          seccion: 'AD', orden: i,
          ingrediente_nombre: ing.nombre,
          materia_prima_id: mps.find(m =>
            normLocal(m.nombre_producto) === normLocal(ing.nombre) ||
            normLocal(m.nombre) === normLocal(ing.nombre)
          )?.id || null,
          gramos: parseFloat(ing.gramos) || 0,
          kilos: (parseFloat(ing.gramos) || 0) / 1000,
          nota_cambio: '', especificacion: ''
        }))
      ].filter(f => f.gramos > 0);

      if (ingredientes.length > 0) {
        await supabase.from('formulaciones').delete().eq('producto_nombre', res.nombre_producto);
        await supabase.from('formulaciones').insert(ingredientes);
      }

      // Guardar config
      await supabase.from('config_productos').upsert([{
        producto_nombre: res.nombre_producto,
        producto_id: prodId,
        merma: parseFloat(res.merma) || 0.07,
        margen: parseFloat(res.margen) || 0.15,
        empaque_nombre: res.empaque_nombre || '',
        empaque_cantidad: parseFloat(res.empaque_cantidad) || 0,
        hilo_kg: parseFloat(res.hilo_kg) || 0,
        fundas: []
      }], { onConflict: 'producto_nombre' });

      importados++;
    }

    await cargarCategorias();
    setModalImportar(false);
    setResultadosIA([]);
    setProgreso('');
    mostrarExito(`✅ ${importados} producto(s) importados correctamente`);

  } catch(err) {
    alert('Error guardando: ' + err.message);
  }

  setImportando(false);
  setProgreso('');
}

  // ── Importar Excel ────────────────────────────────────
 async function importarProductosExcel(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  try {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { cellFormula:false, cellNF:false });

    // Hojas a excluir — no son productos
    const hojasExcluir = [
      'BASE_DATOS','RESUMEN','MENÚ_PRINCIPAL','Historial_General',
      'MATERIAS_PRIMAS','COSTOS_MOD_CIF','HISTORIAL_COSTOS',
      '_ListasAux_','1','Hoja1','Hoja2','Hoja3'
    ];
    const hojasProductos = wb.SheetNames.filter(s =>
      !hojasExcluir.includes(s)
    );

    if (hojasProductos.length === 0) {
      alert('No se encontraron hojas de productos en el Excel');
      return;
    }

    // Guardar buffer y wb para usar después
    setExcelBuffer(buffer);
    setWbGlobal(wb);
    setHojasExcel(hojasProductos);
    setHojasSeleccionadas(new Set()); // ninguna seleccionada por defecto
    setFaseImportar('seleccionar');
    setResultadosIA([]);
    setModalImportar(true);

  } catch(err) {
    alert('Error leyendo Excel: ' + err.message);
  }
}

  // ══════════════════════════════════════════
  //  RENDERS
  // ══════════════════════════════════════════

  if (pantalla === 'login') return (
    <LoginScreen
      email={email}       setEmail={setEmail}
      password={password} setPassword={setPassword}
      loading={loading}
      login={() => login(async () => {
        await cargarTodo();
        setPantalla('menuPrincipal');
      })}
    />
  );

  if (pantalla === 'menuPrincipal') return (
    <>
      <MenuPrincipal
        userRol={userRol}
        navegarA={navegarA}
        logout={() => logout(() => setPantalla('login'))}
        notificaciones={notificaciones}
        notifNoLeidas={notifNoLeidas}
        campanAbierta={campanAbierta}
        setCampanaAbierta={setCampanaAbierta}
        cargarNotificaciones={cargarNotificaciones}
        productos={productos}
        abrirProducto={abrirProducto}
        cargarUsuariosRoles={cargarUsuariosRoles}
        setModalUsuarios={setModalUsuarios}
      />
      <GestorUsuarios
        modalUsuarios={modalUsuarios}
        setModalUsuarios={setModalUsuarios}
        usuariosRoles={usuariosRoles}
        cargarUsuariosRoles={cargarUsuariosRoles}
        editandoUsuario={editandoUsuario}
        setEditandoUsuario={setEditandoUsuario}
        mostrarExito={mostrarExito}
      />
    </>
  );

  if (pantalla === 'modcif')
    return <ModCif
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      mostrarExito={mostrarExito}
    />;

  if (pantalla === 'resumen')
    return <ResumenPrecios
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      onAbrirProducto={abrirProducto}
    />;

  if (pantalla === 'historialmp')
    return <HistorialMP
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      mostrarExito={mostrarExito}
    />;

  if (pantalla === 'produccion')
    return <Produccion
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      userRol={userRol}
      currentUser={user}
    />;

  if (pantalla === 'inventario')
    return <Inventario
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      userRol={userRol}
      currentUser={user}
    />;

  if (pantalla === 'historial')
    return <PantallaHistorial
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      mostrarExito={mostrarExito}
    />;

  if (pantalla === 'materias')
    return <PantallaMaterias
      materias={materias}
      categoriasMp={categoriasMp}
      userRol={userRol}
      user={user}
      cargarMaterias={cargarMaterias}
      cargarCategoriasMpDB={cargarCategoriasMpDB}
      generarSiguienteId={generarSiguienteId}
      guardarHistorialPrecios={guardarHistorialPrecios}
      navegarA={navegarA}
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      mostrarExito={mostrarExito}
    />;
  if (pantalla === 'inventarioproduccion')
    return <InventarioProduccion
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      userRol={userRol}
    />;

  if (pantalla === 'clientes')
    return <Clientes
      onVolver={volverAtras}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      userRol={userRol}
      currentUser={user}
    />;

if (pantalla === 'auditoria')
  return <Auditoria
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
  />;

if (pantalla === 'facturacion')
  return <Facturacion
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
    currentUser={user}
  />;

if (pantalla === 'compras')
  return <Compras
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
    currentUser={user}
  />;

if (pantalla === 'conciliacion')
  return <Conciliacion
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
  />;

if (pantalla === 'rrhh')
  return <RRHH
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
  />;

if (pantalla === 'trazabilidad')
  return <Trazabilidad
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
  />;

if (pantalla === 'dashboard')
  return <Dashboard
    onVolver={volverAtras}
    onVolverMenu={() => setPantalla('menuPrincipal')}
    userRol={userRol}
  />;

  if (pantalla === 'formulacion' && productoActivo) return (
    <>
      <Formulacion
        producto={productoActivo}
        userRol={userRol}
        currentUser={user}
        onAbrirMaterias={() => navegarA('materias')}
        onContextoFormula={setFormulaContexto}
        onIngredientesFormula={setFormulaIngredientes}
        onVolver={() => {
          setFormulaContexto(null);
          volverAtras();
          setProductoActivo(null);
          cargarCategorias();
        }}
        onVolverMenu={() => {
          setFormulaContexto(null);
          setPantalla('menuPrincipal');
          setProductoActivo(null);
          cargarCategorias();
        }}
      />
      <GeminiChat formulaContexto={formulaContexto} formulaIngredientes={formulaIngredientes} />
    </>
  );


// ── Menú fórmulas (pantalla default) ─────────────────
return (
  <>
    <MenuFormulas
      // auth
      userRol={userRol}
      logout={() => logout(() => setPantalla('login'))}
      navegarA={navegarA}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      productos={productos}
      categoriasConfig={categoriasConfig}
      EMOJIS_CAT={EMOJIS_CAT}
      abrirProducto={abrirProducto}
      modalNuevo={modalNuevo}         setModalNuevo={setModalNuevo}
      nuevoNombre={nuevoNombre}           setNuevoNombre={setNuevoNombre}
      nuevaCategoria={nuevaCategoria}     setNuevaCategoria={setNuevaCategoria}
      nuevoMpVinculado={nuevoMpVinculado} setNuevoMpVinculado={setNuevoMpVinculado}
      crearProducto={crearProducto}
      modalGestionar={modalGestionar} setModalGestionar={setModalGestionar} cargarCategorias={cargarCategorias}
      tabGestionar={tabGestionar}     setTabGestionar={setTabGestionar}
      editando={editando}             setEditando={setEditando}
      guardarEdicionProducto={guardarEdicionProducto}
      eliminarProducto={eliminarProducto}
      moverCategoria={moverCategoria}
      editandoCat={editandoCat}       setEditandoCat={setEditandoCat}
      guardarEdicionCategoria={guardarEdicionCategoria}
      eliminarCategoria={eliminarCategoria}
      modalNuevaCat={modalNuevaCat}   setModalNuevaCat={setModalNuevaCat}
      nuevaCatNombre={nuevaCatNombre} setNuevaCatNombre={setNuevaCatNombre}
      nuevaCatEmoji={nuevaCatEmoji}   setNuevaCatEmoji={setNuevaCatEmoji}
      crearCategoria={crearCategoria}
      confirmElimCat={confirmElimCat} setConfirmElimCat={setConfirmElimCat}
      confirmarElimCategoria={confirmarElimCategoria}
      categoriasProtegidas={CATS_PROTEGIDAS}
      notificaciones={notificaciones}
      notifNoLeidas={notifNoLeidas}
      campanAbierta={campanAbierta}   setCampanaAbierta={setCampanaAbierta}
      cargarNotificaciones={cargarNotificaciones}
      importando={importando}
      progreso={progreso}
      importarProductosExcel={importarProductosExcel}
      msgExito={msgExito}
    />

    {/* ── Modal Importar Fórmulas ── */}
    {modalImportar && (
      <div style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
        zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center',
        padding:'16px'
      }}>
        <div style={{
          background:'white', borderRadius:'14px',
          width:'100%', maxWidth:'600px',
          maxHeight:'90vh', overflow:'hidden',
          display:'flex', flexDirection:'column'
        }}>
          {/* Header */}
          <div style={{
            background:'#1a1a2e', padding:'14px 18px',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            borderRadius:'14px 14px 0 0'
          }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize:'14px' }}>
              📤 Importar fórmulas desde Excel
            </span>
            <button onClick={() => setModalImportar(false)} style={{
              background:'rgba(255,255,255,0.2)', border:'none',
              color:'white', fontSize:'16px', cursor:'pointer',
              borderRadius:'6px', padding:'4px 10px'
            }}>✕</button>
          </div>

          <div style={{ overflowY:'auto', flex:1 }}>

            {/* Fase 1 — Seleccionar hojas */}
            {faseImportar === 'seleccionar' && (
              <div style={{ padding:'16px' }}>
                <div style={{
                  fontSize:'13px', color:'#555', marginBottom:'12px'
                }}>
                  Se encontraron <strong>{hojasExcel.length}</strong> hojas de productos.
                  Selecciona las que quieres importar:
                </div>

                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <button onClick={() => setHojasSeleccionadas(new Set(hojasExcel))} style={{
                    padding:'5px 12px', background:'#e8f4fd', color:'#1a5276',
                    border:'1px solid #aed6f1', borderRadius:'7px',
                    cursor:'pointer', fontSize:'12px'
                  }}>Seleccionar todas</button>
                  <button onClick={() => setHojasSeleccionadas(new Set())} style={{
                    padding:'5px 12px', background:'#f8f9fa', color:'#555',
                    border:'1px solid #ddd', borderRadius:'7px',
                    cursor:'pointer', fontSize:'12px'
                  }}>Limpiar</button>
                </div>

                <div style={{
                  border:'1px solid #e0e0e0', borderRadius:'8px', overflow:'hidden'
                }}>
                  {hojasExcel.map((hoja, i) => (
                    <div key={hoja} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'10px 14px',
                      background: hojasSeleccionadas.has(hoja) ? '#e8f8f0' : (i%2===0 ? '#fafafa' : 'white'),
                      borderBottom: i < hojasExcel.length-1 ? '1px solid #f0f0f0' : 'none',
                      cursor:'pointer'
                    }} onClick={() => {
                      const n = new Set(hojasSeleccionadas);
                      n.has(hoja) ? n.delete(hoja) : n.add(hoja);
                      setHojasSeleccionadas(n);
                    }}>
                      <input type="checkbox" readOnly
                        checked={hojasSeleccionadas.has(hoja)}
                        style={{ cursor:'pointer' }}
                      />
                      <span style={{ fontSize:'13px', color:'#1a1a2e' }}>{hoja}</span>
                      {hojasSeleccionadas.has(hoja) && (
                        <span style={{
                          marginLeft:'auto', background:'#27ae60',
                          color:'white', fontSize:'10px',
                          padding:'2px 8px', borderRadius:'10px'
                        }}>seleccionada</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fase 2 — Confirmar resultados IA */}
            {faseImportar === 'confirmar' && (
              <div style={{ padding:'16px' }}>
                {/* Resumen */}
                <div style={{
                  background:'#f8f9fa', borderRadius:'8px',
                  padding:'10px 14px', marginBottom:'14px',
                  fontSize:'13px', display:'flex', gap:16
                }}>
                  <span>Total: <strong>{resultadosIA.length}</strong></span>
                  <span style={{ color:'#27ae60' }}>
                    Nuevos: <strong>{resultadosIA.filter(r => !r.existe).length}</strong>
                  </span>
                  <span style={{ color:'#2980b9' }}>
                    Existentes: <strong>{resultadosIA.filter(r => r.existe).length}</strong>
                  </span>
                </div>

                {/* Nuevos */}
                {resultadosIA.filter(r => !r.existe).length > 0 && (
                  <div style={{ marginBottom:'14px' }}>
                    <div style={{
                      fontSize:'11px', fontWeight:'bold', color:'#555',
                      letterSpacing:'.4px', marginBottom:'8px', textTransform:'uppercase'
                    }}>Productos nuevos — asigna categoría</div>
                    {resultadosIA.filter(r => !r.existe).map((res, i) => (
                      <div key={i} style={{
                        display:'flex', alignItems:'center', gap:10,
                        padding:'8px 0', borderBottom:'1px solid #f5f5f5',
                        fontSize:'13px'
                      }}>
                        <span style={{
                          background:'#EAF3DE', color:'#3B6D11',
                          padding:'2px 8px', borderRadius:'20px', fontSize:'10px'
                        }}>nuevo</span>
                        <span style={{ flex:1, fontWeight:'500' }}>{res.nombre_producto}</span>
                        <select
                          value={res.categoria || ''}
                          onChange={e => {
                            const nuevo = [...resultadosIA];
                            const idx = nuevo.findIndex(r => r.nombreHoja === res.nombreHoja);
                            nuevo[idx] = { ...nuevo[idx], categoria: e.target.value };
                            setResultadosIA(nuevo);
                          }}
                          style={{
                            padding:'5px 10px', border:'0.5px solid #ddd',
                            borderRadius:'7px', fontSize:'12px'
                          }}>
                          <option value=''>— selecciona categoría —</option>
                          {Object.keys(categoriasConfig).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {/* Existentes */}
                {resultadosIA.filter(r => r.existe).length > 0 && (
                  <div>
                    <div style={{
                      display:'flex', justifyContent:'space-between',
                      alignItems:'center', marginBottom:'8px'
                    }}>
                      <div style={{
                        fontSize:'11px', fontWeight:'bold', color:'#555',
                        letterSpacing:'.4px', textTransform:'uppercase'
                      }}>Productos existentes</div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => setResultadosIA(resultadosIA.map(r =>
                          r.existe ? { ...r, accion:'actualizar' } : r
                        ))} style={{
                          padding:'4px 10px', fontSize:'11px',
                          background:'#f0f0f0', border:'1px solid #ddd',
                          borderRadius:'6px', cursor:'pointer'
                        }}>Actualizar todos</button>
                        <button onClick={() => setResultadosIA(resultadosIA.map(r =>
                          r.existe ? { ...r, accion:'saltar' } : r
                        ))} style={{
                          padding:'4px 10px', fontSize:'11px',
                          background:'#f0f0f0', border:'1px solid #ddd',
                          borderRadius:'6px', cursor:'pointer'
                        }}>Saltar todos</button>
                      </div>
                    </div>
                    {resultadosIA.filter(r => r.existe).map((res, i) => (
                      <div key={i} style={{
                        display:'flex', alignItems:'center', gap:10,
                        padding:'8px 0', borderBottom:'1px solid #f5f5f5',
                        fontSize:'13px'
                      }}>
                        <span style={{
                          background:'#E6F1FB', color:'#185FA5',
                          padding:'2px 8px', borderRadius:'20px', fontSize:'10px'
                        }}>existe</span>
                        <span style={{ flex:1, fontWeight:'500' }}>{res.nombre_producto}</span>
                        <div style={{ display:'flex', gap:6 }}>
                          {['actualizar','saltar'].map(op => (
                            <label key={op} style={{
                              display:'flex', alignItems:'center', gap:4,
                              padding:'5px 10px', borderRadius:'7px', cursor:'pointer',
                              fontSize:'12px',
                              border: res.accion === op
                                ? (op==='actualizar' ? '1.5px solid #185FA5' : '1.5px solid #888')
                                : '1px solid #ddd',
                              background: res.accion === op
                                ? (op==='actualizar' ? '#E6F1FB' : '#F1EFE8')
                                : 'white',
                              color: res.accion === op
                                ? (op==='actualizar' ? '#185FA5' : '#5F5E5A')
                                : '#888'
                            }}>
                              <input type="radio" name={`accion-${res.nombreHoja}`}
                                checked={res.accion === op}
                                onChange={() => {
                                  const nuevo = [...resultadosIA];
                                  const idx = nuevo.findIndex(r => r.nombreHoja === res.nombreHoja);
                                  nuevo[idx] = { ...nuevo[idx], accion: op };
                                  setResultadosIA(nuevo);
                                }}
                                style={{ width:'auto', margin:0 }}
                              />
                              {op === 'actualizar' ? 'Actualizar' : 'Saltar'}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:'14px 18px',
            borderTop:'1px solid #eee',
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <button onClick={() => setModalImportar(false)} style={{
              padding:'9px 18px', background:'#f0f0f0',
              border:'1px solid #ddd', borderRadius:'8px',
              cursor:'pointer', fontSize:'13px'
            }}>Cancelar</button>

            {faseImportar === 'seleccionar' && (
              <button
                onClick={analizarHojasConIA}
                disabled={hojasSeleccionadas.size === 0 || analizando}
                style={{
                  padding:'9px 24px',
                  background: hojasSeleccionadas.size === 0 ? '#ccc' : '#8e44ad',
                  color:'white', border:'none', borderRadius:'8px',
                  cursor: hojasSeleccionadas.size === 0 ? 'default' : 'pointer',
                  fontSize:'13px', fontWeight:'bold'
                }}>
                {analizando ? `⏳ ${progreso}` : `🤖 Analizar con IA (${hojasSeleccionadas.size})`}
              </button>
            )}

            {faseImportar === 'confirmar' && (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:'12px', color:'#888' }}>
                  {resultadosIA.filter(r => r.accion !== 'saltar').length} productos a importar
                </span>
                <button
                  onClick={confirmarImportacion}
                  disabled={importando}
                  style={{
                    padding:'9px 24px', background:'#27ae60',
                    color:'white', border:'none', borderRadius:'8px',
                    cursor:'pointer', fontSize:'13px', fontWeight:'bold'
                  }}>
                  {importando ? `⏳ ${progreso}` : '✅ Importar'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </>
);
}

export default App;