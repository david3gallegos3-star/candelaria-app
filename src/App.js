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
import Clientes from './Clientes';
import Auditoria from './Auditoria';
import './App.css';

// Componentes
import LoginScreen    from './components/LoginScreen';
import MenuPrincipal  from './components/MenuPrincipal';
import GestorUsuarios from './components/GestorUsuarios';

// Screens modulares
import PantallaHistorial from './screens/historial/PantallaHistorial';
import PantallaMaterias  from './screens/materias/PantallaMaterias';
import MenuFormulas      from './screens/formulas/MenuFormulas';

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
  const [pantalla,       setPantalla]       = useState('login');
  const [historialNav,   setHistorialNav]   = useState([]);
  const [productoActivo, setProductoActivo] = useState(null);

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
      .from('productos').select('*').order('nombre');
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
    if (!window.confirm(`¿Eliminar "${nombre}" y toda su formulación?`)) return;
    const prod = productos.find(p => p.nombre === nombre);
    if (prod) {
      await supabase.from('formulaciones').delete().eq('producto_nombre', nombre);
      await supabase.from('config_productos').delete().eq('producto_nombre', nombre);
      await supabase.from('productos').delete().eq('id', prod.id);
    }
    await cargarCategorias();
    mostrarExito('🗑️ Producto eliminado');
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

  // ── Importar Excel ────────────────────────────────────
  async function importarProductosExcel(e) {
    const file = e.target.files[0]; if (!file) return;
    setImportando(true); setProgreso('Leyendo Excel...');
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { cellFormula:false, cellNF:false });
      const { data: mpList } = await supabase.from('materias_primas').select('*');
      const mps = mpList || [];
      const normLocal = s => (s||'').toLowerCase().trim()
        .replace(/[áà]/g,'a').replace(/[éè]/g,'e')
        .replace(/[íì]/g,'i').replace(/[óò]/g,'o')
        .replace(/[úù]/g,'u').replace(/ñ/g,'n')
        .replace(/\s+/g,' ').replace(/[\/\-\.]/g,'')
        .replace(/[()]/g,'').trim();
      function buscarMP(n2) {
        const n = normLocal(n2);
        let mp = mps.find(m => normLocal(m.nombre_producto) === n); if (mp) return mp;
            mp = mps.find(m => normLocal(m.nombre) === n);          if (mp) return mp;
            mp = mps.find(m => normLocal(m.nombre_producto) &&
              n.includes(normLocal(m.nombre_producto)) &&
              normLocal(m.nombre_producto).length > 4);             if (mp) return mp;
            mp = mps.find(m => normLocal(m.nombre) &&
              n.includes(normLocal(m.nombre)) &&
              normLocal(m.nombre).length > 4);                      if (mp) return mp;
        return null;
      }
      const hojasExcluir = [
        'BASE_DATOS','RESUMEN','MENÚ_PRINCIPAL','Historial_General',
        'MATERIAS_PRIMAS','COSTOS_MOD_CIF','HISTORIAL_COSTOS',
        '_ListasAux_','1','Hoja1','Hoja2','Hoja3'
      ];
      const hojasProductos = wb.SheetNames.filter(s => !hojasExcluir.includes(s));
      let importados = 0;
      for (const hoja of hojasProductos) {
        const ws   = wb.Sheets[hoja];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
        const nombreProducto = rows[3]?.[0]
          ? String(rows[3][0]).trim()
          : hoja.replace(/_/g,' ');
        if (!nombreProducto) continue;
        setProgreso(`Importando: ${nombreProducto}...`);
        const { data: prodExistente } = await supabase.from('productos')
          .select('id').eq('nombre', nombreProducto).single();
        let prodId;
        if (prodExistente) {
          prodId = prodExistente.id;
        } else {
          const catProd = Object.keys(categoriasConfig)
            .find(c => (categoriasConfig[c]||[]).includes(nombreProducto))
            || Object.keys(categoriasConfig)[0] || 'OTROS';
          const { data: nuevoProd } = await supabase.from('productos')
            .insert([{ nombre: nombreProducto, categoria: catProd, estado:'ACTIVO' }])
            .select().single();
          prodId = nuevoProd?.id;
        }
        if (!prodId) continue;
        await supabase.from('formulaciones').delete().eq('producto_nombre', nombreProducto);
        const ingredientes = [];
        let seccion = 'MP', orden = 0;
        for (let i = 10; i < Math.min(rows.length, 100); i++) {
          const r    = rows[i]; if (!r) continue;
          const col0 = r[0] ? String(r[0]).trim() : ''; if (!col0) continue;
          if (col0.toUpperCase().includes('CONDIMENTO') ||
              col0.toUpperCase().includes('ADITIVO')) { seccion='AD'; continue; }
          if (col0.toUpperCase().includes('TOTAL CRUDO') ||
              col0.toUpperCase().includes('RESUMEN')) break;
          if (['SUB-TOTAL','MATERIAS PRIMAS','CONCEPTO','GRAMOS','KILOS']
              .includes(col0.toUpperCase()) ||
              col0.toUpperCase().includes('N° DE PARADAS')) continue;
          const gramosRaw = r[1];
          const gramos = gramosRaw != null
            ? parseFloat(String(gramosRaw).replace(/[^0-9.-]/g,''))
            : 0;
          if (!gramos || gramos <= 0 || gramos > 100000) continue;
          const mpEncontrada = buscarMP(col0);
          ingredientes.push({
            producto_id:        prodId,
            producto_nombre:    nombreProducto,
            seccion,
            ingrediente_nombre: col0,
            materia_prima_id:   mpEncontrada ? mpEncontrada.id : null,
            gramos,
            kilos:              gramos / 1000,
            nota_cambio:        r[4] ? String(r[4]).trim() : '',
            especificacion:     '',
            orden:              orden++
          });
        }
        if (ingredientes.length > 0)
          await supabase.from('formulaciones').insert(ingredientes);
        importados++;
      }
      await cargarCategorias();
      setProgreso('');
      mostrarExito(`✅ ${importados} productos importados`);
    } catch(err) {
      alert('Error: ' + err.message);
      setProgreso('');
    }
    setImportando(false);
    e.target.value = '';
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

  if (pantalla === 'formulacion' && productoActivo) return (
    <>
      <Formulacion
        producto={productoActivo}
        userRol={userRol}
        currentUser={user}
        onAbrirMaterias={() => navegarA('materias')}
        onVolver={() => {
          volverAtras();
          setProductoActivo(null);
          cargarCategorias();
        }}
        onVolverMenu={() => {
          setPantalla('menuPrincipal');
          setProductoActivo(null);
          cargarCategorias();
        }}
      />
      <GeminiChat />
    </>
  );

  // ── Menú fórmulas (pantalla default) ─────────────────
  return (
    <MenuFormulas
      // auth
      userRol={userRol}
      logout={() => logout(() => setPantalla('login'))}
      // navegación
      navegarA={navegarA}
      onVolverMenu={() => setPantalla('menuPrincipal')}
      // productos
      productos={productos}
      categoriasConfig={categoriasConfig}
      EMOJIS_CAT={EMOJIS_CAT}
      abrirProducto={abrirProducto}
      // modal nuevo
      modalNuevo={modalNuevo}         setModalNuevo={setModalNuevo}
      nuevoNombre={nuevoNombre}       setNuevoNombre={setNuevoNombre}
      nuevaCategoria={nuevaCategoria} setNuevaCategoria={setNuevaCategoria}
      crearProducto={crearProducto}
      // modal gestionar
      modalGestionar={modalGestionar} setModalGestionar={setModalGestionar}
      tabGestionar={tabGestionar}     setTabGestionar={setTabGestionar}
      editando={editando}             setEditando={setEditando}
      guardarEdicionProducto={guardarEdicionProducto}
      eliminarProducto={eliminarProducto}
      moverCategoria={moverCategoria}
      // categorías
      editandoCat={editandoCat}       setEditandoCat={setEditandoCat}
      guardarEdicionCategoria={guardarEdicionCategoria}
      eliminarCategoria={eliminarCategoria}
      modalNuevaCat={modalNuevaCat}   setModalNuevaCat={setModalNuevaCat}
      nuevaCatNombre={nuevaCatNombre} setNuevaCatNombre={setNuevaCatNombre}
      nuevaCatEmoji={nuevaCatEmoji}   setNuevaCatEmoji={setNuevaCatEmoji}
      crearCategoria={crearCategoria}
      confirmElimCat={confirmElimCat} setConfirmElimCat={setConfirmElimCat}
      confirmarElimCategoria={confirmarElimCategoria}
      // campana
      notificaciones={notificaciones}
      notifNoLeidas={notifNoLeidas}
      campanAbierta={campanAbierta}   setCampanaAbierta={setCampanaAbierta}
      cargarNotificaciones={cargarNotificaciones}
      // importar
      importando={importando}
      progreso={progreso}
      importarProductosExcel={importarProductosExcel}
      // misc
      msgExito={msgExito}
    />
  );
}

export default App;