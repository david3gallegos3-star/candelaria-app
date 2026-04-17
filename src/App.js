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
import Produccion     from './Produccion';
import GeminiChat     from './GeminiChat';
import Clientes    from './Clientes';
import Auditoria   from './Auditoria';
import Facturacion from './Facturacion';
import Compras       from './Compras';
import Conciliacion  from './Conciliacion';
import RRHH          from './RRHH';
import Trazabilidad  from './Trazabilidad';
import Dashboard     from './Dashboard';
import ExpressBodeguero  from './components/express/ExpressBodeguero';
import ExpressProduccion from './components/express/ExpressProduccion';
import './App.css';
import html2canvas from 'html2canvas';

// Componentes
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
  const [formulaContexto,   setFormulaContexto]   = useState(null);
  const [formulaDescargaFn, setFormulaDescargaFn] = useState(null);

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
  const [modalNuevo,     setModalNuevo]     = useState(false);
  const [nuevoNombre,    setNuevoNombre]    = useState('');
  const [nuevaCategoria, setNuevaCategoria] = useState('');
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

  // ── Ruteo por rol ─────────────────────────────────────
  function pantallaPorRol(rol) {
    if (rol === 'bodeguero')  return 'expressBodeguero';
    if (rol === 'produccion') return 'expressProduccion';
    return 'menuPrincipal';
  }

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
    await Promise.all([
      cargarCategorias(),
      cargarCategoriasMpDB(),
      cargarMaterias(),
    ]);
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
    checkSession(async (rol) => {
      await cargarTodo();
      setPantalla(pantallaPorRol(rol?.rol));
    });
  }, []);

  useEffect(() => {
    if (user && userRol?.rol === 'admin') {
      cargarNotificaciones();
      notifTimer.current = setInterval(cargarNotificaciones, 30000);
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

  async function crearProducto() {
    if (!nuevoNombre.trim()) return alert('Escribe el nombre del producto');
    const catSel = nuevaCategoria || Object.keys(categoriasConfig)[0];
    const { data, error } = await supabase.from('productos')
      .insert([{ nombre: nuevoNombre.trim(), categoria: catSel, estado:'ACTIVO' }])
      .select().single();
    if (error) return alert('Error: ' + error.message);
    setModalNuevo(false);
    setNuevoNombre('');
    await cargarCategorias();
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
    }
    await cargarCategorias();
    mostrarExito('🗑️ Eliminado — recupéralo en Gestionar → Eliminados');
  }
  
  async function guardarEdicionProducto() {
    if (!editando?.nuevoNombre?.trim()) return;
    await supabase.from('productos')
      .update({ nombre: editando.nuevoNombre }).eq('nombre', editando.nombre);
    await supabase.from('formulaciones')
      .update({ producto_nombre: editando.nuevoNombre }).eq('producto_nombre', editando.nombre);
    await supabase.from('config_productos')
      .update({ producto_nombre: editando.nuevoNombre }).eq('producto_nombre', editando.nombre);
    setEditando(null);
    await cargarCategorias();
    mostrarExito('✅ Nombre actualizado');
  }

  async function moverCategoria(nombre, catActual, nuevaCat) {
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
    const prods = categoriasConfig[nombre] || [];
    if (prods.length > 0) { setConfirmElimCat(nombre); return; }
    await supabase.from('categorias_productos').delete().eq('nombre', nombre);
    delete EMOJIS_CAT[nombre];
    await cargarCategorias();
    mostrarExito(`🗑️ Categoría "${nombre}" eliminada`);
  }

  async function confirmarElimCategoria(moverA) {
    const nombre = confirmElimCat;
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
      login={() => login(async (rol) => {
        await cargarTodo();
        setPantalla(pantallaPorRol(rol?.rol));
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

if (pantalla === 'expressBodeguero')
  return <ExpressBodeguero
    userRol={userRol}
    currentUser={user}
    onLogout={() => logout(() => setPantalla('login'))}
  />;

if (pantalla === 'expressProduccion')
  return <ExpressProduccion
    userRol={userRol}
    currentUser={user}
    onLogout={() => logout(() => setPantalla('login'))}
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
        onDescargaFn={fn => setFormulaDescargaFn(() => fn)}
        onVolver={() => {
          setFormulaContexto(null);
          setFormulaDescargaFn(null);
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
      <GeminiChat formulaContexto={formulaContexto} onDescargarExcel={formulaDescargaFn} />
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
      nuevoNombre={nuevoNombre}       setNuevoNombre={setNuevoNombre}
      nuevaCategoria={nuevaCategoria} setNuevaCategoria={setNuevaCategoria}
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