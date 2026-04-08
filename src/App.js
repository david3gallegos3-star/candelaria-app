import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import GeminiChat from './GeminiChat';
import Formulacion from './Formulacion';
import ModCif from './ModCif';
import ResumenPrecios from './ResumenPrecios';
import HistorialMP from './HistorialMP';
import './App.css';

const EMOJIS_CAT     = {};
const EMOJIS_OPCIONES = ['🥓','🌭','🍖','🍔','🥩','🫙','🔀','🧀','🧆','🍗','🥚','🫕','🥘','🍱','🥫','🏷️','📦','⭐','🆕'];

function App() {
  const [pantalla, setPantalla]             = useState('login');
  const [pantallaAnterior, setPantallaAnterior] = useState('menu');

  function navegarA(destino) {
    setPantallaAnterior(pantalla);
    setPantalla(destino);
  }
  const [productoActivo, setProductoActivo] = useState(null);
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [user, setUser]                     = useState(null);
  const [loading, setLoading]               = useState(false);
  const [productos, setProductos]           = useState([]);
  const [materias, setMaterias]             = useState([]);
  const [categoriasConfig, setCategoriasConfig] = useState({});
  const [msgExito, setMsgExito]             = useState('');
  const [modalGestionar, setModalGestionar] = useState(false);
  const [modalNuevo, setModalNuevo]         = useState(false);
  const [nuevoNombre, setNuevoNombre]       = useState('');
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [editando, setEditando]             = useState(null);
  const [importando, setImportando]         = useState(false);
  const [progreso, setProgreso]             = useState('');
  const [buscar, setBuscar]                 = useState('');
  const [catFiltro, setCatFiltro]           = useState('TODAS');
  const [estadoFiltro, setEstadoFiltro]     = useState('TODOS');
  // Historial General
  const [historial, setHistorial]           = useState([]);
  const [histFechaDes, setHistFechaDes]     = useState('');
  const [histFechaHas, setHistFechaHas]     = useState('');
  const [histProducto, setHistProducto]     = useState('');
  const [histSeccion, setHistSeccion]       = useState('TODAS');
  const [histCargando, setHistCargando]     = useState(false);
  const [histSeleccionados, setHistSeleccionados] = useState(new Set());
  const [histEditandoId, setHistEditandoId] = useState(null);
  const [histEditData, setHistEditData]     = useState({});
  // Materias primas
  const [modalAgregar, setModalAgregar]     = useState(false);
  const [modalEditar, setModalEditar]       = useState(null);
  const [categoriasMp, setCategoriasMp]     = useState([]);
  const [modalGestionarMp, setModalGestionarMp] = useState(false);
  const [nuevaCatMpNombre, setNuevaCatMpNombre] = useState('');
  const [editandoCatMp, setEditandoCatMp]   = useState(null);
  // Categorías productos
  const [tabGestionar, setTabGestionar]     = useState('productos');
  const [modalNuevaCat, setModalNuevaCat]   = useState(false);
  const [nuevaCatNombre, setNuevaCatNombre] = useState('');
  const [nuevaCatEmoji, setNuevaCatEmoji]   = useState('📦');
  const [editandoCat, setEditandoCat]       = useState(null);
  const [confirmElimCat, setConfirmElimCat] = useState(null);
  const [form, setForm] = useState({
    id:'', categoria:'', nombre:'', nombre_producto:'',
    proveedor:'', precio_kg:'', precio_lb:'', precio_gr:'',
    notas:'', estado:'ACTIVO', tipo:'MATERIAS PRIMAS'
  });
  const fileRefProductos = useRef();
  const fileRefMP        = useRef();
  const fileRefHistorial = useRef();

  function subirHistorialExcel() { fileRefHistorial.current.click(); }

  async function importarHistorialExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const nombreHoja = wb.SheetNames.find(s => s.toUpperCase().includes('HISTORIAL')) || wb.SheetNames[0];
      const ws = wb.Sheets[nombreHoja];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
      // Detectar encabezado
      let headerRow = 0;
      for (let i=0; i<Math.min(rows.length,15); i++) {
        const r = rows[i];
        if (r && r.some(c=>String(c||'').toUpperCase().includes('PRODUCTO') || String(c||'').toUpperCase().includes('INGREDIENTE'))) { headerRow=i; break; }
      }
      const headers = (rows[headerRow]||[]).map(h=>String(h||'').toUpperCase().trim());
      const ci = (name) => headers.findIndex(h=>h.includes(name));
      const idxFecha=ci('FECHA'), idxProd=ci('PRODUCT'), idxIng=ci('INGRED'), idxGramos=ci('GRAM'), idxNota=ci('NOTA'), idxSeccion=ci('SECCI');
      const registros = [];
      for (let i=headerRow+1; i<rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const prod = idxProd>=0 ? String(r[idxProd]||'').trim() : '';
        const ing  = idxIng>=0  ? String(r[idxIng]||'').trim()  : '';
        if (!prod && !ing) continue;
        const gramos = idxGramos>=0 ? parseFloat(r[idxGramos])||0 : 0;
        const seccion = idxSeccion>=0 ? String(r[idxSeccion]||'MATERIAS PRIMAS').trim() : 'MATERIAS PRIMAS';
        registros.push({
          fecha: idxFecha>=0 ? String(r[idxFecha]||new Date().toISOString().split('T')[0]).trim() : new Date().toISOString().split('T')[0],
          producto_nombre: prod, ingrediente_nombre: ing,
          gramos, kilos: gramos/1000,
          nota_cambio: idxNota>=0 ? String(r[idxNota]||'').trim() : '',
          seccion: seccion.toUpperCase().includes('CONDIMENTO') || seccion.toUpperCase().includes('ADITIVO') ? 'CONDIMENTOS Y ADITIVOS' : 'MATERIAS PRIMAS'
        });
      }
      if (registros.length > 0) {
        for (let i=0; i<registros.length; i+=50) await supabase.from('historial_general').insert(registros.slice(i,i+50));
        mostrarExito(`✅ ${registros.length} registros importados al historial general`);
      } else {
        alert('No se encontraron registros válidos');
      }
    } catch(err) { alert('Error: ' + err.message); }
    e.target.value = '';
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) { cargarTodo(); setPantalla('menu'); }
    });
  }, []);

  async function cargarTodo() {
    await Promise.all([cargarCategorias(), cargarCategoriasMpDB(), cargarMaterias()]);
  }

  async function cargarCategorias() {
    const { data: cats }  = await supabase.from('categorias_productos').select('*').order('orden');
    const { data: prods } = await supabase.from('productos').select('*').order('nombre');
    const config = {};
    (cats || []).forEach(cat => { config[cat.nombre] = []; EMOJIS_CAT[cat.nombre] = cat.emoji || '📋'; });
    (prods || []).forEach(prod => {
      if (config[prod.categoria]) config[prod.categoria].push(prod.nombre);
      else if (prod.categoria) config[prod.categoria] = [prod.nombre];
    });
    setCategoriasConfig(config);
    setProductos(prods || []);
    if (cats && cats.length > 0 && !nuevaCategoria) setNuevaCategoria(cats[0].nombre);
  }

  async function cargarProductos() { await cargarCategorias(); }

  async function cargarCategoriasMpDB() {
    const { data } = await supabase.from('categorias_mp').select('*').order('orden');
    if (data && data.length > 0) {
      setCategoriasMp(data.map(c => c.nombre));
      setForm(prev => ({ ...prev, categoria: data[0].nombre }));
    }
  }

  async function cargarMaterias() {
    const { data } = await supabase.from('materias_primas').select('*').order('categoria').order('id');
    setMaterias(data || []);
  }

  async function login() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { alert('Error: ' + error.message); setLoading(false); return; }
    await cargarTodo();
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    setPantalla('menu');
    setLoading(false);
  }

  async function logout() { await supabase.auth.signOut(); setUser(null); setPantalla('login'); }

  function mostrarExito(msg) { setMsgExito(msg); setTimeout(() => setMsgExito(''), 5000); }

  // ══════════════════════════════════════════════
  // HISTORIAL GENERAL
  // ══════════════════════════════════════════════
  async function cargarHistorial() {
    setHistCargando(true);
    let q = supabase.from('historial_general').select('*').order('created_at', { ascending: false });
    if (histFechaDes) q = q.gte('fecha', histFechaDes);
    if (histFechaHas) q = q.lte('fecha', histFechaHas);
    if (histProducto) q = q.ilike('producto_nombre', `%${histProducto}%`);
    if (histSeccion !== 'TODAS') q = q.eq('seccion', histSeccion);
    const { data } = await q.limit(1000);
    setHistorial(data || []);
    setHistSeleccionados(new Set());
    setHistCargando(false);
  }

  function toggleHistSel(id) {
    setHistSeleccionados(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  }

  function toggleHistTodos() {
    if (histSeleccionados.size === historial.length) setHistSeleccionados(new Set());
    else setHistSeleccionados(new Set(historial.map(h => h.id)));
  }

  async function eliminarHistSeleccionados() {
    if (histSeleccionados.size === 0) return;
    if (!window.confirm(`¿Eliminar ${histSeleccionados.size} registros?`)) return;
    await supabase.from('historial_general').delete().in('id', [...histSeleccionados]);
    mostrarExito(`🗑️ ${histSeleccionados.size} registros eliminados`);
    await cargarHistorial();
  }

  async function guardarHistEdicion() {
    await supabase.from('historial_general').update({
      fecha: histEditData.fecha, producto_nombre: histEditData.producto_nombre,
      ingrediente_nombre: histEditData.ingrediente_nombre,
      gramos: parseFloat(histEditData.gramos)||0,
      kilos: (parseFloat(histEditData.gramos)||0)/1000,
      nota_cambio: histEditData.nota_cambio,
      seccion: histEditData.seccion
    }).eq('id', histEditandoId);
    setHistEditandoId(null);
    mostrarExito('✅ Registro actualizado');
    await cargarHistorial();
  }

  async function descargarHistExcel() {
    const XLSX = await import('xlsx');
    const datos = historial.map(h => ({
      'Fecha': h.fecha, 'Producto': h.producto_nombre,
      'Ingrediente': h.ingrediente_nombre,
      'Gramos': parseFloat(h.gramos||0),
      'Kilos': parseFloat(h.kilos||0).toFixed(3),
      'Nota de Cambio': h.nota_cambio,
      'Sección': h.seccion
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    XLSX.writeFile(wb, `historial_general_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  // ══════════════════════════════════════════════
  // INFORME WORD (PDF imprimible con gráfico)
  // ══════════════════════════════════════════════
  function generarInforme() {
    if (historial.length === 0) return alert('No hay registros para generar el informe. Usa los filtros y busca primero.');
    // Agrupar por producto para el gráfico
    const porProducto = {};
    historial.forEach(h => {
      if (!porProducto[h.producto_nombre]) porProducto[h.producto_nombre] = 0;
      porProducto[h.producto_nombre] += parseFloat(h.gramos) || 0;
    });
    const prodLabels = Object.keys(porProducto);
    const prodData   = Object.values(porProducto);
    const colores    = prodLabels.map((_,i) => `hsl(${(i*47)%360},65%,50%)`);

    const ventana = window.open('', '_blank');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Informe Historial Candelaria</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"><\/script>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #222; }
      h1 { color: #1a1a2e; font-size: 20px; margin-bottom: 4px; }
      .sub { color: #666; font-size: 13px; margin-bottom: 20px; }
      .grafico { width: 100%; max-width: 700px; margin: 20px auto; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 20px; }
      th { background: #1a1a2e; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 6px 10px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) { background: #f9f9f9; }
      .badge-mp { background: #dbeafe; color: #1e40af; padding: 2px 7px; border-radius: 8px; font-size: 10px; font-weight: bold; }
      .badge-ad { background: #f3e8ff; color: #7c3aed; padding: 2px 7px; border-radius: 8px; font-size: 10px; font-weight: bold; }
      @media print { button { display: none !important; } }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
      <div>
        <h1>🏭 Embutidos y Jamones Candelaria</h1>
        <div class="sub">Informe de Historial General · Generado: ${new Date().toLocaleString()} · ${historial.length} registros</div>
      </div>
      <button onclick="window.print()" style="padding:10px 20px;background:#1a1a2e;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">🖨️ Imprimir / PDF</button>
    </div>
    <div class="grafico"><canvas id="chart"></canvas></div>
    <table>
      <thead><tr><th>FECHA</th><th>PRODUCTO</th><th>INGREDIENTE / MATERIA PRIMA</th><th>GRAMOS</th><th>KILOS</th><th>NOTA DE CAMBIO</th><th>SECCIÓN</th></tr></thead>
      <tbody>
        ${historial.map(h => `<tr>
          <td>${h.fecha||''}</td>
          <td><strong>${h.producto_nombre||''}</strong></td>
          <td>${h.ingrediente_nombre||''}</td>
          <td style="text-align:right">${parseFloat(h.gramos||0).toLocaleString()}</td>
          <td style="text-align:right">${parseFloat(h.kilos||0).toFixed(3)}</td>
          <td style="color:#888">${h.nota_cambio||''}</td>
          <td><span class="${h.seccion==='MATERIAS PRIMAS'?'badge-mp':'badge-ad'}">${h.seccion||''}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <script>
      const ctx = document.getElementById('chart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(prodLabels)},
          datasets: [{ label: 'Total gramos registrados', data: ${JSON.stringify(prodData)}, backgroundColor: ${JSON.stringify(colores)}, borderRadius: 6 }]
        },
        options: { responsive:true, plugins:{ legend:{display:false}, title:{display:true,text:'Gramos totales por producto',font:{size:14}} }, scales:{ y:{beginAtZero:true} } }
      });
    <\/script>
    </body></html>`;
    ventana.document.write(html);
    ventana.document.close();
  }

  // ══════════════════════════════════════════════
  // CATEGORÍAS PRODUCTOS
  // ══════════════════════════════════════════════
  async function crearCategoria() {
    const nombre = nuevaCatNombre.trim().toUpperCase();
    if (!nombre) return alert('Escribe un nombre para la categoría');
    if (categoriasConfig[nombre]) return alert('Ya existe una categoría con ese nombre');
    const orden = Object.keys(categoriasConfig).length;
    const { error } = await supabase.from('categorias_productos').insert([{ nombre, emoji: nuevaCatEmoji, orden }]);
    if (error) return alert('Error: ' + error.message);
    EMOJIS_CAT[nombre] = nuevaCatEmoji;
    setModalNuevaCat(false); setNuevaCatNombre(''); setNuevaCatEmoji('📦');
    await cargarCategorias();
    mostrarExito(`✅ Categoría "${nombre}" creada`);
  }

  async function guardarEdicionCategoria() {
    if (!editandoCat) return;
    const nombreViejo = editandoCat.nombre;
    const nombreNuevo = editandoCat.nuevoNombre.trim().toUpperCase();
    if (!nombreNuevo) return alert('El nombre no puede estar vacío');
    if (nombreNuevo !== nombreViejo && categoriasConfig[nombreNuevo]) return alert('Ya existe una categoría con ese nombre');
    await supabase.from('categorias_productos').update({ nombre: nombreNuevo, emoji: editandoCat.emoji }).eq('nombre', nombreViejo);
    if (nombreNuevo !== nombreViejo) await supabase.from('productos').update({ categoria: nombreNuevo }).eq('categoria', nombreViejo);
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
    if (moverA && prods.length > 0) {
      await supabase.from('productos').update({ categoria: moverA }).eq('categoria', nombre);
    } else if (!moverA && prods.length > 0) {
      for (const p of prods) {
        await supabase.from('formulaciones').delete().eq('producto_nombre', p);
        await supabase.from('config_productos').delete().eq('producto_nombre', p);
      }
      const prodIds = productos.filter(p => p.categoria === nombre).map(p => p.id);
      if (prodIds.length > 0) await supabase.from('productos').delete().in('id', prodIds);
    }
    await supabase.from('categorias_productos').delete().eq('nombre', nombre);
    delete EMOJIS_CAT[nombre];
    setConfirmElimCat(null);
    await cargarCategorias();
    mostrarExito(`🗑️ Categoría "${nombre}" eliminada`);
  }

  // ══════════════════════════════════════════════
  // CATEGORÍAS MP
  // ══════════════════════════════════════════════
  async function crearCategoriaMp() {
    const nombre = nuevaCatMpNombre.trim().toUpperCase();
    if (!nombre) return alert('Escribe un nombre');
    if (categoriasMp.includes(nombre)) return alert('Ya existe esa categoría');
    const { error } = await supabase.from('categorias_mp').insert([{ nombre, orden: categoriasMp.length }]);
    if (error) return alert('Error: ' + error.message);
    setNuevaCatMpNombre('');
    await cargarCategoriasMpDB();
    mostrarExito(`✅ Categoría MP "${nombre}" creada`);
  }

  async function guardarEdicionCatMp() {
    if (!editandoCatMp) return;
    const nuevoNombreCat = editandoCatMp.valor.trim().toUpperCase();
    if (!nuevoNombreCat) return alert('El nombre no puede estar vacío');
    const viejoNombre = categoriasMp[editandoCatMp.idx];
    if (nuevoNombreCat !== viejoNombre && categoriasMp.includes(nuevoNombreCat)) return alert('Ya existe esa categoría');
    await supabase.from('categorias_mp').update({ nombre: nuevoNombreCat }).eq('nombre', viejoNombre);
    if (nuevoNombreCat !== viejoNombre) await supabase.from('materias_primas').update({ categoria: nuevoNombreCat }).eq('categoria', viejoNombre);
    setEditandoCatMp(null);
    await cargarCategoriasMpDB(); await cargarMaterias();
    mostrarExito(`✅ Categoría renombrada a "${nuevoNombreCat}"`);
  }

  async function eliminarCategoriaMp(idx) {
    const nombre = categoriasMp[idx];
    if (materias.some(m => m.categoria === nombre)) return alert(`La categoría "${nombre}" tiene materias primas asignadas.`);
    if (!window.confirm(`¿Eliminar la categoría "${nombre}"?`)) return;
    await supabase.from('categorias_mp').delete().eq('nombre', nombre);
    await cargarCategoriasMpDB();
    mostrarExito(`🗑️ Categoría "${nombre}" eliminada`);
  }

  async function moverCategoriaMp(idx, dir) {
    const nuevas = [...categoriasMp];
    const dest = idx + dir;
    if (dest < 0 || dest >= nuevas.length) return;
    [nuevas[idx], nuevas[dest]] = [nuevas[dest], nuevas[idx]];
    await supabase.from('categorias_mp').update({ orden: dest }).eq('nombre', nuevas[dest]);
    await supabase.from('categorias_mp').update({ orden: idx }).eq('nombre', nuevas[idx]);
    await cargarCategoriasMpDB();
  }

  // ══════════════════════════════════════════════
  // PRODUCTOS
  // ══════════════════════════════════════════════
  async function crearProducto() {
    if (!nuevoNombre.trim()) return alert('Escribe el nombre del producto');
    const catSel = nuevaCategoria || Object.keys(categoriasConfig)[0];
    const { data, error } = await supabase.from('productos')
      .insert([{ nombre: nuevoNombre.trim(), categoria: catSel, estado: 'ACTIVO' }]).select().single();
    if (error) return alert('Error: ' + error.message);
    setModalNuevo(false); setNuevoNombre('');
    await cargarCategorias();
    mostrarExito('✅ Producto creado');
    setProductoActivo(data); setPantallaAnterior(pantalla); setPantalla('formulacion');
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
    await supabase.from('productos').update({ nombre: editando.nuevoNombre }).eq('nombre', editando.nombre);
    await supabase.from('formulaciones').update({ producto_nombre: editando.nuevoNombre }).eq('producto_nombre', editando.nombre);
    await supabase.from('config_productos').update({ producto_nombre: editando.nuevoNombre }).eq('producto_nombre', editando.nombre);
    setEditando(null);
    await cargarCategorias();
    mostrarExito('✅ Nombre actualizado');
  }

  async function moverCategoria(nombre, catActual, nuevaCat) {
    await supabase.from('productos').update({ categoria: nuevaCat }).eq('nombre', nombre);
    await cargarCategorias();
    mostrarExito('✅ Categoría actualizada');
  }

  function abrirProducto(prod) {
    if (typeof prod === 'string') {
      const p = productos.find(x => x.nombre === prod);
      if (p) { setProductoActivo(p); setPantallaAnterior(pantalla); setPantalla('formulacion'); }
      else {
        const cat = Object.keys(categoriasConfig)[0] || 'OTROS';
        supabase.from('productos').insert([{ nombre: prod, categoria: cat, estado: 'ACTIVO' }])
          .select().single().then(({ data }) => { if (data) { cargarCategorias(); setProductoActivo(data); setPantalla('formulacion'); } });
      }
    } else {
      setProductoActivo(prod); setPantalla('formulacion');
    }
  }

  // ══════════════════════════════════════════════
  // MATERIAS PRIMAS
  // ══════════════════════════════════════════════
  function calcularPrecios(precio_kg) {
    const kg = parseFloat(precio_kg) || 0;
    return { precio_lb: kg > 0 ? (kg/2.20462).toFixed(4) : '', precio_gr: kg > 0 ? (kg/1000).toFixed(6) : '' };
  }

  async function guardarNuevoMP() {
    if (!form.id || !form.nombre) return alert('ID y Nombre son obligatorios');
    const precios = calcularPrecios(form.precio_kg);
    const { error } = await supabase.from('materias_primas').insert([{
      id: form.id, categoria: form.categoria, nombre: form.nombre,
      nombre_producto: form.nombre_producto || form.nombre,
      proveedor: form.proveedor, precio_kg: parseFloat(form.precio_kg)||0,
      precio_lb: parseFloat(precios.precio_lb)||0, precio_gr: parseFloat(precios.precio_gr)||0,
      notas: form.notas, estado: form.estado, tipo: form.tipo
    }]);
    if (error) return alert('Error: ' + error.message);
    setModalAgregar(false);
    setForm({ id:'', categoria: categoriasMp[0]||'', nombre:'', nombre_producto:'', proveedor:'', precio_kg:'', precio_lb:'', precio_gr:'', notas:'', estado:'ACTIVO', tipo:'MATERIAS PRIMAS' });
    await cargarMaterias();
    mostrarExito('✅ Materia prima agregada');
  }

  async function guardarEdicionMP() {
    const viejoNombreProducto = materias.find(m => m.id === modalEditar.id)?.nombre_producto;
    const nuevoNombreProducto = modalEditar.nombre_producto || modalEditar.nombre;
    const precios = calcularPrecios(modalEditar.precio_kg);
    const { error } = await supabase.from('materias_primas').update({
      categoria: modalEditar.categoria, nombre: modalEditar.nombre,
      nombre_producto: nuevoNombreProducto, proveedor: modalEditar.proveedor,
      precio_kg: parseFloat(modalEditar.precio_kg)||0,
      precio_lb: parseFloat(precios.precio_lb)||0, precio_gr: parseFloat(precios.precio_gr)||0,
      notas: modalEditar.notas, estado: modalEditar.estado
    }).eq('id', modalEditar.id);
    if (error) return alert('Error: ' + error.message);
    // Actualizar nombre en fórmulas si cambió
    if (viejoNombreProducto && nuevoNombreProducto !== viejoNombreProducto) {
      await supabase.from('formulaciones').update({ ingrediente_nombre: nuevoNombreProducto }).eq('ingrediente_nombre', viejoNombreProducto);
    }
    // Guardar en historial de materias primas
    await supabase.from('historial_materias_primas').insert([{
      fecha: new Date().toISOString().split('T')[0],
      mp_id: modalEditar.id, categoria: modalEditar.categoria,
      nombre: modalEditar.nombre, proveedor: modalEditar.proveedor,
      precio_kg: parseFloat(modalEditar.precio_kg)||0,
      precio_gr: parseFloat(precios.precio_gr)||0,
      notas: modalEditar.notas
    }]);
    setModalEditar(null);
    await cargarMaterias();
    mostrarExito('✅ Materia prima actualizada — guardada en historial MP');
  }

  async function eliminarMP(id) {
    if (!window.confirm('¿Eliminar esta materia prima?')) return;
    await supabase.from('materias_primas').delete().eq('id', id);
    await cargarMaterias();
    mostrarExito('🗑️ Eliminado correctamente');
  }

  async function importarProductosExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportando(true); setProgreso('Leyendo Excel...');
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellFormula: false, cellNF: false });
      const { data: mpList } = await supabase.from('materias_primas').select('*');
      const mps = mpList || [];
      const norm = s => (s||'').toLowerCase().trim().replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i').replace(/[óò]/g,'o').replace(/[úù]/g,'u').replace(/ñ/g,'n').replace(/\s+/g,' ').replace(/[\/\-\.]/g,'').replace(/[()]/g,'').trim();
      function buscarMP(n2) {
        const n = norm(n2);
        let mp = mps.find(m => norm(m.nombre_producto) === n); if (mp) return mp;
        mp = mps.find(m => norm(m.nombre) === n); if (mp) return mp;
        mp = mps.find(m => norm(m.nombre_producto) && n.includes(norm(m.nombre_producto)) && norm(m.nombre_producto).length > 4); if (mp) return mp;
        mp = mps.find(m => norm(m.nombre) && n.includes(norm(m.nombre)) && norm(m.nombre).length > 4); if (mp) return mp;
        return null;
      }
      const hojasExcluir = ['BASE_DATOS','RESUMEN','MENÚ_PRINCIPAL','Historial_General','MATERIAS_PRIMAS','COSTOS_MOD_CIF','HISTORIAL_COSTOS','_ListasAux_','1','Hoja1','Hoja2','Hoja3'];
      const hojasProductos = wb.SheetNames.filter(s => !hojasExcluir.includes(s));
      let importados = 0;
      for (const hoja of hojasProductos) {
        const ws = wb.Sheets[hoja];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
        const nombreProducto = rows[3]?.[0] ? String(rows[3][0]).trim() : hoja.replace(/_/g,' ');
        if (!nombreProducto) continue;
        setProgreso(`Importando: ${nombreProducto}...`);
        const { data: prodExistente } = await supabase.from('productos').select('id').eq('nombre', nombreProducto).single();
        let prodId;
        if (prodExistente) { prodId = prodExistente.id; }
        else {
          const catProd = Object.keys(categoriasConfig).find(c => (categoriasConfig[c]||[]).includes(nombreProducto)) || Object.keys(categoriasConfig)[0] || 'OTROS';
          const { data: nuevoProd } = await supabase.from('productos').insert([{ nombre: nombreProducto, categoria: catProd, estado: 'ACTIVO' }]).select().single();
          prodId = nuevoProd?.id;
        }
        if (!prodId) continue;
        await supabase.from('formulaciones').delete().eq('producto_nombre', nombreProducto);
        const ingredientes = [];
        let seccion = 'MP'; let orden = 0;
        for (let i = 10; i < Math.min(rows.length, 100); i++) {
          const r = rows[i];
          if (!r) continue;
          const col0 = r[0] ? String(r[0]).trim() : '';
          if (!col0) continue;
          if (col0.toUpperCase().includes('CONDIMENTO') || col0.toUpperCase().includes('ADITIVO')) { seccion='AD'; continue; }
          if (col0.toUpperCase().includes('TOTAL CRUDO') || col0.toUpperCase().includes('RESUMEN')) break;
          if (['SUB-TOTAL','MATERIAS PRIMAS','CONCEPTO','GRAMOS','KILOS'].includes(col0.toUpperCase()) || col0.toUpperCase().includes('N° DE PARADAS')) continue;
          const gramosRaw = r[1];
          const gramos = gramosRaw != null ? parseFloat(String(gramosRaw).replace(/[^0-9.-]/g,'')) : 0;
          if (!gramos || gramos <= 0 || gramos > 100000) continue;
          const mpEncontrada = buscarMP(col0);
          ingredientes.push({ producto_id: prodId, producto_nombre: nombreProducto, seccion, ingrediente_nombre: col0, materia_prima_id: mpEncontrada ? mpEncontrada.id : null, gramos, kilos: gramos/1000, nota_cambio: r[4] ? String(r[4]).trim() : '', orden: orden++ });
        }
        if (ingredientes.length > 0) await supabase.from('formulaciones').insert(ingredientes);
        importados++;
      }
      await cargarCategorias();
      setProgreso('');
      mostrarExito(`✅ ${importados} productos importados`);
    } catch (err) { alert('Error: ' + err.message); setProgreso(''); }
    setImportando(false); e.target.value = '';
  }

  async function subirExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets['MATERIAS_PRIMAS'];
    if (!ws) return alert('No se encontró la hoja MATERIAS_PRIMAS');
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    let insertados = 0;
    for (let i = 6; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || !r[2] || String(r[0]).length > 10) continue;
      if (['ID','CATEGORIA'].includes(String(r[0]))) continue;
      const kg = parseFloat(r[6])||0;
      const registro = { id: String(r[0]).trim(), categoria: String(r[1]||'').trim(), nombre: String(r[2]||'').trim(), nombre_producto: String(r[3]||r[2]||'').trim(), proveedor: String(r[4]||'').trim(), precio_kg: kg, precio_lb: kg>0?kg/2.20462:0, precio_gr: kg>0?kg/1000:0, notas: String(r[9]||'').trim(), estado: String(r[10]||'ACTIVO').trim(), tipo: String(r[11]||'MATERIAS PRIMAS').trim() };
      if (registro.nombre) { await supabase.from('materias_primas').upsert([registro]); insertados++; }
    }
    await cargarMaterias();
    mostrarExito(`✅ ${insertados} materias primas importadas`);
    e.target.value = '';
  }

  const materiasFiltradas = materias.filter(m => {
    const b = buscar.toLowerCase();
    const coincideBuscar = !buscar || m.nombre?.toLowerCase().includes(b) || m.id?.toLowerCase().includes(b) || m.proveedor?.toLowerCase().includes(b);
    const coincideCat    = catFiltro === 'TODAS' || m.categoria === catFiltro;
    const coincideEstado = estadoFiltro === 'TODOS' || m.estado === estadoFiltro;
    return coincideBuscar && coincideCat && coincideEstado;
  });

  const camposForm = (data, setData) => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
      {[['ID','id','text'],['Categoría','categoria','select'],['Nombre Ingrediente','nombre','text'],
        ['Nombre en Producto','nombre_producto','text'],['Proveedor','proveedor','text'],
        ['$ / KG','precio_kg','number'],['$ / LB (auto)','precio_lb','readonly'],['$ / GR (auto)','precio_gr','readonly'],
        ['Estado','estado','select2'],['Tipo','tipo','text'],['Notas','notas','text']
      ].map(([label, key, tipo]) => (
        <div key={key} style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
          <label style={{ fontSize:'12px', fontWeight:'bold', color: tipo==='readonly'?'#27ae60':'#555' }}>{label}</label>
          {tipo === 'select' ? (
            <select value={data[key]} onChange={e => setData({...data,[key]:e.target.value})} style={{ padding:'7px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'13px' }}>
              {categoriasMp.map(c => <option key={c}>{c}</option>)}
            </select>
          ) : tipo === 'select2' ? (
            <select value={data[key]} onChange={e => setData({...data,[key]:e.target.value})} style={{ padding:'7px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'13px' }}>
              <option>ACTIVO</option><option>INACTIVO</option>
            </select>
          ) : tipo === 'readonly' ? (
            <input readOnly value={key==='precio_lb'?(parseFloat(data.precio_kg)>0?(parseFloat(data.precio_kg)/2.20462).toFixed(4):'—'):(parseFloat(data.precio_kg)>0?(parseFloat(data.precio_kg)/1000).toFixed(6):'—')}
              style={{ padding:'7px', borderRadius:'6px', border:'1px solid #c8e6c9', fontSize:'13px', background:'#f1f8f1', color:'#27ae60', fontWeight:'bold' }}/>
          ) : tipo === 'number' && key === 'precio_kg' ? (
            <input type="number" value={data[key]} onChange={e => setData({...data,[key]:e.target.value})} style={{ padding:'7px', borderRadius:'6px', border:'1.5px solid #3498db', fontSize:'13px', fontWeight:'bold' }}/>
          ) : (
            <input type="text" value={data[key]} onChange={e => setData({...data,[key]:e.target.value})} style={{ padding:'7px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'13px' }}/>
          )}
        </div>
      ))}
    </div>
  );

  // ══════════════════════════════════════════════
  // RENDERS ESPECIALES
  // ══════════════════════════════════════════════
  if (pantalla === 'login') return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'linear-gradient(135deg,#1a1a2e,#16213e)' }}>
      <div style={{ background:'white', padding:'40px', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', width:'380px' }}>
        <div style={{ textAlign:'center', marginBottom:'24px' }}>
          <img src="/LOGO_CANDELARIA_1.png" alt="Candelaria" style={{ width:'220px', maxWidth:'85%', marginBottom:'8px', background:'white', padding:'10px 16px', borderRadius:'10px' }}/>
          <p style={{ color:'#888', margin:0, fontSize:'14px' }}>Sistema de Fórmulas y Costos</p>
        </div>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={{ width:'100%', padding:'12px', margin:'6px 0', borderRadius:'8px', border:'1px solid #ddd', boxSizing:'border-box', fontSize:'14px' }}/>
        <input placeholder="Contraseña" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyPress={e=>e.key==='Enter'&&login()} style={{ width:'100%', padding:'12px', margin:'6px 0', borderRadius:'8px', border:'1px solid #ddd', boxSizing:'border-box', fontSize:'14px' }}/>
        <button onClick={login} disabled={loading} style={{ width:'100%', padding:'13px', background:'#27ae60', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'15px', marginTop:'12px', fontWeight:'bold' }}>
          {loading ? 'Entrando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  );

  if (pantalla === 'modcif') return <ModCif onVolver={()=>setPantalla(pantallaAnterior)} onVolverMenu={()=>setPantalla('menu')} mostrarExito={mostrarExito}/>;
  if (pantalla === 'resumen') return <ResumenPrecios onVolver={()=>setPantalla(pantallaAnterior)} onVolverMenu={()=>setPantalla('menu')} onAbrirProducto={abrirProducto}/>;
  if (pantalla === 'historialmp') return <HistorialMP onVolver={()=>setPantalla(pantallaAnterior)} onVolverMenu={()=>setPantalla('menu')} mostrarExito={mostrarExito}/>;
  if (pantalla === 'formulacion' && productoActivo) return (
    <><Formulacion producto={productoActivo} onVolver={()=>{ setPantalla(pantallaAnterior); setProductoActivo(null); cargarProductos(); }} onVolverMenu={()=>{ setPantalla('menu'); setProductoActivo(null); cargarProductos(); }}/><GeminiChat /></>
  );

  // ══════════════════════════════════════════════
  // RENDER HISTORIAL GENERAL
  // ══════════════════════════════════════════════
  if (pantalla === 'historial') return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial' }}>
      <div style={{ background:'linear-gradient(135deg,#1a1a2e,#16213e)', padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={()=>setPantalla('menu')} style={{ background:'rgba(255,200,0,0.25)', border:'1px solid rgba(255,200,0,0.4)', color:'#ffd700', padding:'8px 12px', borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:'bold' }}>🏠 Menú</button>
          <button onClick={()=>setPantalla(pantallaAnterior)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white', padding:'8px 14px', borderRadius:'8px', cursor:'pointer', fontSize:'13px' }}>← Volver</button>
          <div>
            <div style={{ color:'white', fontWeight:'bold', fontSize:'18px' }}>📋 Historial General</div>
            <div style={{ color:'#aaa', fontSize:'12px' }}>{historial.length} registros</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={subirHistorialExcel} style={{ padding:'8px 16px', background:'#8e44ad', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'13px' }}>📤 Subir Excel</button>
          <input ref={fileRefHistorial} type="file" accept=".xlsx,.xlsm,.xls" style={{ display:'none' }} onChange={importarHistorialExcel}/>
          <button onClick={generarInforme} style={{ padding:'8px 16px', background:'#9b59b6', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'13px' }}>📄 Informe</button>
          <button onClick={descargarHistExcel} style={{ padding:'8px 16px', background:'#27ae60', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'13px' }}>📥 Descargar Excel</button>
        </div>
      </div>
      <div style={{ padding:'20px 24px' }}>
        {msgExito && <div style={{ background:'#d4edda', color:'#155724', padding:'12px 20px', borderRadius:'8px', marginBottom:16, fontWeight:'bold' }}>{msgExito}</div>}
        {/* FILTROS */}
        <div style={{ background:'white', padding:14, borderRadius:10, marginBottom:14, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Desde</label>
            <input type="date" value={histFechaDes} onChange={e=>setHistFechaDes(e.target.value)} style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Hasta</label>
            <input type="date" value={histFechaHas} onChange={e=>setHistFechaHas(e.target.value)} style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1, minWidth:150 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Producto</label>
            <input placeholder="Buscar producto..." value={histProducto} onChange={e=>setHistProducto(e.target.value)} style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Sección</label>
            <select value={histSeccion} onChange={e=>setHistSeccion(e.target.value)} style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}>
              <option value="TODAS">Todas</option>
              <option value="MATERIAS PRIMAS">Materias Primas</option>
              <option value="CONDIMENTOS Y ADITIVOS">Condimentos y Aditivos</option>
            </select>
          </div>
          <button onClick={cargarHistorial} disabled={histCargando} style={{ padding:'9px 20px', background:'#2980b9', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold', fontSize:'13px' }}>{histCargando?'Buscando...':'🔍 Buscar'}</button>
          <button onClick={()=>{ setHistFechaDes('');setHistFechaHas('');setHistProducto('');setHistSeccion('TODAS');setHistorial([]); }} style={{ padding:'9px 16px', background:'#95a5a6', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:'13px' }}>✕ Limpiar</button>
        </div>

        {/* ACCIONES SELECCIÓN */}
        {histSeleccionados.size > 0 && (
          <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'10px 16px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:'bold', color:'#856404' }}>{histSeleccionados.size} registro(s) seleccionado(s)</span>
            <button onClick={eliminarHistSeleccionados} style={{ padding:'7px 18px', background:'#e74c3c', color:'white', border:'none', borderRadius:7, cursor:'pointer', fontWeight:'bold', fontSize:'13px' }}>🗑️ Eliminar seleccionados</button>
          </div>
        )}

        {/* TABLA */}
        <div style={{ background:'white', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#1a1a2e', color:'white' }}>
                  <th style={{ padding:'10px 8px', width:40 }}>
                    <input type="checkbox" checked={histSeleccionados.size===historial.length&&historial.length>0} onChange={toggleHistTodos} style={{ cursor:'pointer' }}/>
                  </th>
                  {['FECHA','PRODUCTO','INGREDIENTE / MATERIA PRIMA','GRAMOS','KILOS','NOTA DE CAMBIO','SECCIÓN','ACCIONES'].map(h=>(
                    <th key={h} style={{ padding:'10px 8px', textAlign:'left', whiteSpace:'nowrap', fontSize:'11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => (
                  histEditandoId === h.id ? (
                    <tr key={h.id} style={{ background:'#e8f4fd' }}>
                      <td style={{ padding:6 }}><input type="checkbox" checked={histSeleccionados.has(h.id)} onChange={()=>toggleHistSel(h.id)}/></td>
                      <td style={{ padding:6 }}><input type="date" value={histEditData.fecha||''} onChange={e=>setHistEditData(p=>({...p,fecha:e.target.value}))} style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:120 }}/></td>
                      <td style={{ padding:6 }}><input value={histEditData.producto_nombre||''} onChange={e=>setHistEditData(p=>({...p,producto_nombre:e.target.value}))} style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:130 }}/></td>
                      <td style={{ padding:6 }}><input value={histEditData.ingrediente_nombre||''} onChange={e=>setHistEditData(p=>({...p,ingrediente_nombre:e.target.value}))} style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:150 }}/></td>
                      <td style={{ padding:6 }}><input type="number" value={histEditData.gramos||''} onChange={e=>setHistEditData(p=>({...p,gramos:e.target.value}))} style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:80 }}/></td>
                      <td style={{ padding:6, color:'#aaa', fontSize:11 }}>auto</td>
                      <td style={{ padding:6 }}><input value={histEditData.nota_cambio||''} onChange={e=>setHistEditData(p=>({...p,nota_cambio:e.target.value}))} style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:110 }}/></td>
                      <td style={{ padding:6 }}>
                        <select value={histEditData.seccion||'MATERIAS PRIMAS'} onChange={e=>setHistEditData(p=>({...p,seccion:e.target.value}))} style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'11px' }}>
                          <option value="MATERIAS PRIMAS">Materias Primas</option>
                          <option value="CONDIMENTOS Y ADITIVOS">Condimentos y Aditivos</option>
                        </select>
                      </td>
                      <td style={{ padding:6 }}>
                        <button onClick={guardarHistEdicion} style={{ padding:'4px 10px', background:'#27ae60', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px', marginRight:4 }}>✓</button>
                        <button onClick={()=>setHistEditandoId(null)} style={{ padding:'4px 10px', background:'#95a5a6', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px' }}>✕</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={h.id} style={{ background:i%2===0?'#fafafa':'white', borderBottom:'1px solid #f0f0f0' }}>
                      <td style={{ padding:'8px' }}><input type="checkbox" checked={histSeleccionados.has(h.id)} onChange={()=>toggleHistSel(h.id)} style={{ cursor:'pointer' }}/></td>
                      <td style={{ padding:'8px', whiteSpace:'nowrap', color:'#555' }}>{h.fecha}</td>
                      <td style={{ padding:'8px', fontWeight:'bold', color:'#1a1a2e' }}>{h.producto_nombre}</td>
                      <td style={{ padding:'8px' }}>{h.ingrediente_nombre}</td>
                      <td style={{ padding:'8px', textAlign:'right', fontWeight:'bold' }}>{parseFloat(h.gramos||0).toLocaleString()}</td>
                      <td style={{ padding:'8px', textAlign:'right', color:'#555' }}>{parseFloat(h.kilos||0).toFixed(3)}</td>
                      <td style={{ padding:'8px', color:'#888', fontSize:'11px' }}>{h.nota_cambio}</td>
                      <td style={{ padding:'8px' }}>
                        <span style={{ background:h.seccion==='MATERIAS PRIMAS'?'#e8f4fd':'#f3e5f5', color:h.seccion==='MATERIAS PRIMAS'?'#1a5276':'#6c3483', padding:'2px 8px', borderRadius:10, fontSize:'10px', fontWeight:'bold' }}>{h.seccion}</span>
                      </td>
                      <td style={{ padding:'8px', whiteSpace:'nowrap' }}>
                        <button onClick={()=>{ setHistEditandoId(h.id); setHistEditData({...h}); }} style={{ padding:'4px 9px', background:'#3498db', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px', marginRight:4 }}>✏️</button>
                        <button onClick={async()=>{ if(!window.confirm('¿Eliminar?'))return; await supabase.from('historial_general').delete().eq('id',h.id); mostrarExito('🗑️ Eliminado'); cargarHistorial(); }} style={{ padding:'4px 9px', background:'#e74c3c', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px' }}>🗑️</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
            {historial.length===0&&<div style={{ textAlign:'center', padding:50, color:'#aaa' }}><div style={{ fontSize:36, marginBottom:12 }}>📋</div><div>Usa los filtros y presiona Buscar</div></div>}
          </div>
        </div>
      </div>
      <GeminiChat/>
    </div>
  );

  // ══════════════════════════════════════════════
  // RENDER MATERIAS PRIMAS
  // ══════════════════════════════════════════════
  if (pantalla === 'materias') return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial' }}>
      <div style={{ background:'linear-gradient(135deg,#1a1a2e,#16213e)', padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={()=>setPantalla('menu')} style={{ background:'rgba(255,200,0,0.25)', border:'1px solid rgba(255,200,0,0.4)', color:'#ffd700', padding:'8px 12px', borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:'bold' }}>🏠 Menú</button>
          <button onClick={()=>setPantalla(pantallaAnterior)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white', padding:'8px 14px', borderRadius:'8px', cursor:'pointer', fontSize:'13px' }}>← Volver</button>
          <div>
            <div style={{ color:'white', fontWeight:'bold', fontSize:'18px' }}>📦 Materias Primas</div>
            <div style={{ color:'#aaa', fontSize:'12px' }}>Gestión de ingredientes · {categoriasMp.length} categorías</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>navegarA('historialmp')} style={{ padding:'8px 14px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'white', borderRadius:'8px', cursor:'pointer', fontSize:'13px' }}>📋 Historial MP</button>
          <button onClick={()=>setModalGestionarMp(true)} style={{ padding:'8px 14px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'white', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>🗂️ Categorías</button>
        </div>
      </div>
      <div style={{ padding:'20px 24px' }}>
        {msgExito && <div style={{ background:'#d4edda', color:'#155724', padding:'12px 20px', borderRadius:'8px', marginBottom:16, fontWeight:'bold' }}>{msgExito}</div>}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <h2 style={{ margin:0, color:'#1a1a2e', fontSize:'20px' }}>📦 Materias Primas</h2>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={()=>fileRefMP.current.click()} style={{ padding:'9px 18px', background:'#8e44ad', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>📤 Subir Excel</button>
            <input ref={fileRefMP} type="file" accept=".xlsx,.xlsm" style={{ display:'none' }} onChange={subirExcel}/>
            <button onClick={()=>setModalAgregar(true)} style={{ padding:'9px 18px', background:'#27ae60', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>➕ Agregar</button>
          </div>
        </div>
        <div style={{ background:'white', padding:14, borderRadius:10, marginBottom:14, display:'flex', gap:12, flexWrap:'wrap', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
          <input placeholder="🔍 Buscar..." value={buscar} onChange={e=>setBuscar(e.target.value)} style={{ flex:1, minWidth:200, padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}/>
          <select value={catFiltro} onChange={e=>setCatFiltro(e.target.value)} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px', minWidth:200 }}>
            <option value="TODAS">Todas las categorías</option>
            {categoriasMp.map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={estadoFiltro} onChange={e=>setEstadoFiltro(e.target.value)} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}>
            <option value="TODOS">Todos los estados</option>
            <option>ACTIVO</option><option>INACTIVO</option>
          </select>
          <span style={{ padding:'8px 12px', background:'#f0f2f5', borderRadius:8, fontSize:'13px', color:'#666' }}>{materiasFiltradas.length} registros</span>
        </div>
        <div style={{ background:'white', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead><tr style={{ background:'#1a1a2e', color:'white' }}>
                {['ID','CATEGORÍA','NOMBRE','NOMBRE EN PRODUCTO','PROVEEDOR','$/KG','$/LB','$/GR','ESTADO','NOTAS','ACCIONES'].map(h=>(
                  <th key={h} style={{ padding:'12px 10px', textAlign:'left', whiteSpace:'nowrap', fontSize:'12px' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {materiasFiltradas.map((m,i)=>(
                  <tr key={m.id+i} style={{ background:i%2===0?'#fafafa':'white', borderBottom:'1px solid #f0f0f0' }}>
                    <td style={{ padding:'10px', fontWeight:'bold', color:'#2c3e50' }}>{m.id}</td>
                    <td style={{ padding:'10px' }}><span style={{ background:'#e8f4fd', color:'#1a5276', padding:'3px 8px', borderRadius:12, fontSize:'11px', fontWeight:'bold' }}>{m.categoria}</span></td>
                    <td style={{ padding:'10px' }}>{m.nombre}</td>
                    <td style={{ padding:'10px', color:'#555' }}>{m.nombre_producto}</td>
                    <td style={{ padding:'10px', color:'#555' }}>{m.proveedor}</td>
                    <td style={{ padding:'10px', textAlign:'right', fontWeight:'bold', color:'#27ae60' }}>${parseFloat(m.precio_kg||0).toFixed(2)}</td>
                    <td style={{ padding:'10px', textAlign:'right', color:'#555' }}>${parseFloat(m.precio_lb||0).toFixed(4)}</td>
                    <td style={{ padding:'10px', textAlign:'right', color:'#555' }}>${parseFloat(m.precio_gr||0).toFixed(6)}</td>
                    <td style={{ padding:'10px' }}><span style={{ background:m.estado==='ACTIVO'?'#d4edda':'#f8d7da', color:m.estado==='ACTIVO'?'#155724':'#721c24', padding:'3px 10px', borderRadius:12, fontSize:'11px', fontWeight:'bold' }}>{m.estado}</span></td>
                    <td style={{ padding:'10px', color:'#888', fontSize:'12px' }}>{m.notas}</td>
                    <td style={{ padding:'10px', whiteSpace:'nowrap' }}>
                      <button onClick={()=>setModalEditar({...m})} style={{ padding:'5px 10px', background:'#3498db', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px', marginRight:6 }}>✏️</button>
                      <button onClick={()=>eliminarMP(m.id)} style={{ padding:'5px 10px', background:'#e74c3c', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px' }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {materiasFiltradas.length===0&&<div style={{ textAlign:'center', padding:40, color:'#888' }}>No se encontraron registros</div>}
          </div>
        </div>
      </div>
      {/* Modales agregar/editar MP */}
      {modalAgregar&&(<div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}><div style={{ background:'white', padding:28, borderRadius:12, width:600, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}><h3 style={{ margin:'0 0 8px', color:'#1a1a2e' }}>➕ Agregar Materia Prima</h3><div style={{ background:'#e8f4fd', color:'#1a5276', padding:'8px 12px', borderRadius:6, fontSize:'12px', marginBottom:16 }}>💡 $/LB y $/GR se calculan automáticamente al ingresar $/KG</div>{camposForm(form, setForm)}<div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}><button onClick={()=>setModalAgregar(false)} style={{ padding:'10px 20px', background:'#95a5a6', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>Cancelar</button><button onClick={guardarNuevoMP} style={{ padding:'10px 20px', background:'#27ae60', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold' }}>Guardar</button></div></div></div>)}
      {modalEditar&&(<div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}><div style={{ background:'white', padding:28, borderRadius:12, width:600, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}><h3 style={{ margin:'0 0 8px', color:'#1a1a2e' }}>✏️ Editar: {modalEditar.nombre}</h3><div style={{ background:'#e8f4fd', color:'#1a5276', padding:'8px 12px', borderRadius:6, fontSize:'12px', marginBottom:16 }}>💡 $/LB y $/GR se recalculan automáticamente. Si cambias "Nombre en Producto" se actualiza en todas las fórmulas.</div>{camposForm(modalEditar, setModalEditar)}<div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}><button onClick={()=>setModalEditar(null)} style={{ padding:'10px 20px', background:'#95a5a6', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>Cancelar</button><button onClick={guardarEdicionMP} style={{ padding:'10px 20px', background:'#3498db', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold' }}>✅ Actualizar</button></div></div></div>)}
      {/* Modal categorías MP */}
      {modalGestionarMp&&(<div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}><div style={{ background:'white', borderRadius:14, width:500, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}><div style={{ background:'#1a1a2e', padding:'16px 20px', borderRadius:'14px 14px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}><div><div style={{ color:'white', fontWeight:'bold', fontSize:'16px' }}>🗂️ Categorías de Materias Primas</div><div style={{ color:'#aaa', fontSize:'11px', marginTop:2 }}>{categoriasMp.length} categorías</div></div><button onClick={()=>{setModalGestionarMp(false);setEditandoCatMp(null);setNuevaCatMpNombre('');}} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', fontSize:'18px', cursor:'pointer', borderRadius:6, padding:'4px 10px' }}>✕</button></div><div style={{ padding:'14px 16px', borderBottom:'1px solid #f0f0f0', background:'#f8f9fa' }}><div style={{ display:'flex', gap:8 }}><input value={nuevaCatMpNombre} onChange={e=>setNuevaCatMpNombre(e.target.value.toUpperCase())} onKeyPress={e=>e.key==='Enter'&&crearCategoriaMp()} placeholder="Nombre nueva categoría..." style={{ flex:1, padding:'9px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:'13px', fontWeight:'bold' }}/><button onClick={crearCategoriaMp} style={{ padding:'9px 18px', background:'#27ae60', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:'13px', fontWeight:'bold', whiteSpace:'nowrap' }}>➕ Agregar</button></div></div><div style={{ overflowY:'auto', padding:'12px 16px', flex:1 }}>{categoriasMp.map((cat,idx)=>{const enUso=materias.filter(m=>m.categoria===cat).length;return(<div key={cat} style={{ background:'white', border:'1.5px solid #e9ecef', borderRadius:10, padding:'10px 12px', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>{editandoCatMp?.idx===idx?(<><input value={editandoCatMp.valor} onChange={e=>setEditandoCatMp({...editandoCatMp,valor:e.target.value.toUpperCase()})} onKeyPress={e=>e.key==='Enter'&&guardarEdicionCatMp()} style={{ flex:1, padding:'7px 10px', borderRadius:7, border:'1.5px solid #3498db', fontSize:'13px', fontWeight:'bold' }} autoFocus/><button onClick={guardarEdicionCatMp} style={{ padding:'6px 14px', background:'#27ae60', color:'white', border:'none', borderRadius:7, cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>✓</button><button onClick={()=>setEditandoCatMp(null)} style={{ padding:'6px 12px', background:'#95a5a6', color:'white', border:'none', borderRadius:7, cursor:'pointer', fontSize:'13px' }}>✕</button></>):(<><div style={{ display:'flex', flexDirection:'column', gap:2 }}><button onClick={()=>moverCategoriaMp(idx,-1)} disabled={idx===0} style={{ background:'none', border:'none', cursor:idx===0?'default':'pointer', color:idx===0?'#ddd':'#888', fontSize:'12px', padding:'1px 4px', lineHeight:1 }}>▲</button><button onClick={()=>moverCategoriaMp(idx,1)} disabled={idx===categoriasMp.length-1} style={{ background:'none', border:'none', cursor:idx===categoriasMp.length-1?'default':'pointer', color:idx===categoriasMp.length-1?'#ddd':'#888', fontSize:'12px', padding:'1px 4px', lineHeight:1 }}>▼</button></div><div style={{ flex:1 }}><div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e' }}>{cat}</div><div style={{ fontSize:'11px', color:enUso>0?'#27ae60':'#aaa' }}>{enUso>0?`${enUso} materia${enUso!==1?'s':''} asignada${enUso!==1?'s':''}`:'Sin asignaciones'}</div></div>{enUso>0&&<span style={{ background:'#e8f5e9', color:'#2e7d32', padding:'2px 8px', borderRadius:10, fontSize:'11px', fontWeight:'bold' }}>{enUso}</span>}<button onClick={()=>setEditandoCatMp({idx,valor:cat})} style={{ padding:'5px 10px', background:'#3498db', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px' }}>✏️</button><button onClick={()=>eliminarCategoriaMp(idx)} style={{ padding:'5px 10px', background:enUso>0?'#bdc3c7':'#e74c3c', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px' }}>🗑️</button></>)}</div>);})}</div><div style={{ padding:'10px 16px', borderTop:'1px solid #f0f0f0', background:'#f8f9fa', borderRadius:'0 0 14px 14px' }}><div style={{ fontSize:'11px', color:'#888', textAlign:'center' }}>💡 Las categorías con materias asignadas no se pueden eliminar directamente.</div></div></div></div>)}
      <GeminiChat/>
    </div>
  );

  // ══════════════════════════════════════════════
  // RENDER MENÚ PRINCIPAL
  // ══════════════════════════════════════════════
  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial, sans-serif' }}>
      <div style={{ background:'linear-gradient(135deg,#1a1a2e,#16213e)', padding:'12px 16px', boxShadow:'0 2px 10px rgba(0,0,0,0.3)' }}>
        {/* Fila 1: logo + salir */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <img src="/LOGO_CANDELARIA_1.png" alt="Candelaria" style={{ height:'42px', width:'auto', background:'white', padding:'4px 10px', borderRadius:'8px' }}/>
          </div>
          <button onClick={logout} style={{ padding:'7px 12px', background:'#e74c3c', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:'bold' }}>Salir</button>
        </div>
        {/* Fila 2: botones navegación — scroll horizontal en móvil */}
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
          {[
            ['💰 Precios',  ()=>navegarA('resumen'),                         '#27ae60', 'none'],
            ['⚙️ MOD+CIF',  ()=>navegarA('modcif'),                          'rgba(255,255,255,0.15)', '1px solid rgba(255,255,255,0.3)'],
            ['📦 Materias', ()=>navegarA('materias'),                         'rgba(255,255,255,0.15)', '1px solid rgba(255,255,255,0.3)'],
            ['📋 Historial',()=>{ navegarA('historial'); cargarHistorial(); }, 'rgba(255,255,255,0.15)', '1px solid rgba(255,255,255,0.3)'],
          ].map(([label, fn, bg, border]) => (
            <button key={label} onClick={fn}
              style={{ padding:'7px 12px', background:bg, color:'white', border:border, borderRadius:'7px', cursor:'pointer', fontSize:'12px', fontWeight:'bold', whiteSpace:'nowrap', flexShrink:0 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 16px' }}>
        {msgExito && <div style={{ background:'#d4edda', color:'#155724', padding:'10px 16px', borderRadius:'8px', marginBottom:12, fontWeight:'bold', fontSize:'13px' }}>{msgExito}</div>}
        {importando && <div style={{ background:'#cce5ff', color:'#004085', padding:'10px 16px', borderRadius:'8px', marginBottom:12, fontWeight:'bold', fontSize:'13px' }}>⏳ {progreso}</div>}

        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          <button onClick={()=>fileRefProductos.current.click()} disabled={importando}
            style={{ padding:'9px 14px', background:'#8e44ad', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>
            📤 Importar Excel
          </button>
          <input ref={fileRefProductos} type="file" accept=".xlsx,.xlsm" style={{ display:'none' }} onChange={importarProductosExcel}/>
          <button onClick={()=>setModalNuevo(true)}
            style={{ padding:'9px 14px', background:'#27ae60', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>
            ➕ Nuevo producto
          </button>
          <button onClick={()=>{ setModalGestionar(true); setTabGestionar('productos'); }}
            style={{ padding:'9px 14px', background:'#2980b9', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>
            ⚙️ Gestionar
          </button>
          <div style={{ marginLeft:'auto', background:'white', padding:'9px 14px', borderRadius:8, fontSize:'13px', color:'#555', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
            <strong>{productos.length}</strong> prods · <strong>{Object.keys(categoriasConfig).length}</strong> cats
          </div>
        </div>

        {Object.entries(categoriasConfig).map(([categoria, nombresProductos]) => (
          nombresProductos.length === 0 ? null :
          <div key={categoria} style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <span style={{ fontSize:'22px' }}>{EMOJIS_CAT[categoria]||'📋'}</span>
              <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'18px' }}>{categoria}</h3>
              <span style={{ background:'#e8f4fd', color:'#1a5276', padding:'3px 10px', borderRadius:12, fontSize:'12px', fontWeight:'bold' }}>{nombresProductos.length}</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 }}>
              {nombresProductos.map(nombre => {
                const existe = productos.find(p => p.nombre === nombre);
                return (
                  <button key={nombre} onClick={()=>abrirProducto(nombre)}
                    style={{ padding:'16px 14px', background:existe?'white':'#fff9e6', border:existe?'2px solid #e8f4fd':'2px dashed #f39c12', borderRadius:12, cursor:'pointer', textAlign:'left', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', transition:'all 0.2s' }}
                    onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)';}}
                    onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)';}}>
                    <div style={{ fontSize:'20px', marginBottom:6 }}>{EMOJIS_CAT[categoria]||'📋'}</div>
                    <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'13px', lineHeight:'1.3' }}>{nombre}</div>
                    <div style={{ fontSize:'11px', color:existe?'#27ae60':'#f39c12', marginTop:6, fontWeight:'bold' }}>{existe?'✅ Con fórmula':'⚠️ Sin datos aún'}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL NUEVO PRODUCTO */}
      {modalNuevo&&(<div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}><div style={{ background:'white', padding:28, borderRadius:12, width:420, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}><h3 style={{ margin:'0 0 20px', color:'#1a1a2e' }}>➕ Nuevo Producto</h3><label style={{ fontSize:'13px', fontWeight:'bold', color:'#555' }}>Nombre del producto</label><input value={nuevoNombre} onChange={e=>setNuevoNombre(e.target.value)} placeholder="Ej: Salchicha Cocktail" style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd', fontSize:'14px', marginTop:6, marginBottom:14, boxSizing:'border-box' }}/><label style={{ fontSize:'13px', fontWeight:'bold', color:'#555' }}>Categoría</label><select value={nuevaCategoria} onChange={e=>setNuevaCategoria(e.target.value)} style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd', fontSize:'14px', marginTop:6, boxSizing:'border-box' }}>{Object.keys(categoriasConfig).map(c=><option key={c}>{c}</option>)}</select><div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}><button onClick={()=>setModalNuevo(false)} style={{ padding:'10px 20px', background:'#95a5a6', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>Cancelar</button><button onClick={crearProducto} style={{ padding:'10px 20px', background:'#27ae60', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold' }}>Crear y abrir</button></div></div></div>)}

      {/* MODAL GESTIONAR */}
      {modalGestionar&&(<div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}><div style={{ background:'white', borderRadius:14, width:680, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}><div style={{ background:'#1a1a2e', padding:'16px 20px', borderRadius:'14px 14px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}><h3 style={{ margin:0, color:'white', fontSize:'16px' }}>⚙️ Gestionar</h3><button onClick={()=>setModalGestionar(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', fontSize:'18px', cursor:'pointer', color:'white', borderRadius:6, padding:'4px 10px' }}>✕</button></div><div style={{ display:'flex', borderBottom:'2px solid #f0f0f0', padding:'0 20px' }}>{[['productos','📦 Productos'],['categorias','🗂️ Categorías']].map(([key,label])=>(<button key={key} onClick={()=>setTabGestionar(key)} style={{ padding:'12px 20px', border:'none', borderBottom:tabGestionar===key?'3px solid #2980b9':'3px solid transparent', background:'transparent', cursor:'pointer', fontSize:'14px', fontWeight:tabGestionar===key?'bold':'normal', color:tabGestionar===key?'#2980b9':'#888', marginBottom:'-2px' }}>{label}</button>))}</div><div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>{tabGestionar==='productos'&&(<div>{Object.entries(categoriasConfig).map(([categoria,nombresProductos])=>(<div key={categoria} style={{ marginBottom:20 }}><div style={{ background:'#1a1a2e', color:'white', padding:'8px 14px', borderRadius:8, fontWeight:'bold', fontSize:'14px', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}><span>{EMOJIS_CAT[categoria]||'📋'}</span>{categoria}<span style={{ marginLeft:'auto', background:'rgba(255,255,255,0.15)', padding:'2px 10px', borderRadius:10, fontSize:'12px' }}>{nombresProductos.length}</span></div>{nombresProductos.length===0&&<div style={{ padding:'10px 14px', color:'#aaa', fontSize:'13px', fontStyle:'italic' }}>Sin productos</div>}{nombresProductos.map(nombre=>(<div key={nombre} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'#f8f9fa', borderRadius:8, marginBottom:6 }}>{editando?.nombre===nombre?(<><input value={editando.nuevoNombre} onChange={e=>setEditando({...editando,nuevoNombre:e.target.value})} style={{ flex:1, padding:6, borderRadius:6, border:'1px solid #3498db', fontSize:'13px' }}/><button onClick={guardarEdicionProducto} style={{ padding:'5px 12px', background:'#27ae60', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px' }}>✓</button><button onClick={()=>setEditando(null)} style={{ padding:'5px 12px', background:'#95a5a6', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px' }}>✕</button></>):(<><span style={{ flex:1, fontSize:'13px', fontWeight:'bold', color:'#2c3e50' }}>{nombre}</span><select onChange={e=>moverCategoria(nombre,categoria,e.target.value)} value={categoria} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px' }}>{Object.keys(categoriasConfig).map(c=><option key={c} value={c}>{EMOJIS_CAT[c]||'📋'} {c}</option>)}</select><button onClick={()=>setEditando({nombre,nuevoNombre:nombre})} style={{ padding:'5px 10px', background:'#3498db', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px' }}>✏️</button><button onClick={()=>eliminarProducto(nombre)} style={{ padding:'5px 10px', background:'#e74c3c', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px' }}>🗑️</button></>)}</div>))}</div>))}</div>)}{tabGestionar==='categorias'&&(<div><button onClick={()=>setModalNuevaCat(true)} style={{ width:'100%', padding:12, background:'#27ae60', color:'white', border:'none', borderRadius:10, cursor:'pointer', fontSize:'14px', fontWeight:'bold', marginBottom:16 }}>➕ Nueva categoría</button>{Object.entries(categoriasConfig).map(([categoria,prods])=>(<div key={categoria} style={{ background:'#f8f9fa', border:'1.5px solid #e9ecef', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>{editandoCat?.nombre===categoria?(<div><div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}><select value={editandoCat.emoji} onChange={e=>setEditandoCat({...editandoCat,emoji:e.target.value})} style={{ padding:7, borderRadius:7, border:'1px solid #ddd', fontSize:'18px', background:'white' }}>{EMOJIS_OPCIONES.map(em=><option key={em} value={em}>{em}</option>)}</select><input value={editandoCat.nuevoNombre} onChange={e=>setEditandoCat({...editandoCat,nuevoNombre:e.target.value})} style={{ flex:1, padding:'8px 12px', borderRadius:7, border:'1.5px solid #3498db', fontSize:'14px', fontWeight:'bold', textTransform:'uppercase' }}/></div><div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}><button onClick={()=>setEditandoCat(null)} style={{ padding:'7px 16px', background:'#95a5a6', color:'white', border:'none', borderRadius:7, cursor:'pointer', fontSize:'13px' }}>Cancelar</button><button onClick={guardarEdicionCategoria} style={{ padding:'7px 16px', background:'#27ae60', color:'white', border:'none', borderRadius:7, cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>✓ Guardar</button></div></div>):(<div style={{ display:'flex', alignItems:'center', gap:10 }}><span style={{ fontSize:'22px' }}>{EMOJIS_CAT[categoria]||'📋'}</span><div style={{ flex:1 }}><div style={{ fontWeight:'bold', fontSize:'14px', color:'#1a1a2e' }}>{categoria}</div><div style={{ fontSize:'12px', color:'#888' }}>{prods.length} producto{prods.length!==1?'s':''}</div></div><button onClick={()=>setEditandoCat({nombre:categoria,nuevoNombre:categoria,emoji:EMOJIS_CAT[categoria]||'📦'})} style={{ padding:'6px 12px', background:'#3498db', color:'white', border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px' }}>✏️ Editar</button><button onClick={()=>eliminarCategoria(categoria)} style={{ padding:'6px 12px', background:'#e74c3c', color:'white', border:'none', borderRadius:7, cursor:'pointer', fontSize:'12px' }}>🗑️</button></div>)}</div>))}</div>)}</div></div></div>)}

      {/* MODAL NUEVA CATEGORÍA */}
      {modalNuevaCat&&(<div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}><div style={{ background:'white', padding:28, borderRadius:14, width:400, boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}><h3 style={{ margin:'0 0 20px', color:'#1a1a2e' }}>🗂️ Nueva Categoría</h3><label style={{ fontSize:'13px', fontWeight:'bold', color:'#555', display:'block', marginBottom:6 }}>Emoji</label><div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>{EMOJIS_OPCIONES.map(em=>(<button key={em} onClick={()=>setNuevaCatEmoji(em)} style={{ fontSize:'22px', padding:6, borderRadius:8, border:nuevaCatEmoji===em?'2.5px solid #27ae60':'2px solid #eee', background:nuevaCatEmoji===em?'#e8f5e9':'white', cursor:'pointer' }}>{em}</button>))}</div><label style={{ fontSize:'13px', fontWeight:'bold', color:'#555', display:'block', marginBottom:6 }}>Nombre</label><input value={nuevaCatNombre} onChange={e=>setNuevaCatNombre(e.target.value.toUpperCase())} placeholder="Ej: AHUMADOS" style={{ width:'100%', padding:11, borderRadius:8, border:'1.5px solid #ddd', fontSize:'15px', fontWeight:'bold', boxSizing:'border-box' }}/><div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}><button onClick={()=>{setModalNuevaCat(false);setNuevaCatNombre('');setNuevaCatEmoji('📦');}} style={{ padding:'10px 20px', background:'#95a5a6', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>Cancelar</button><button onClick={crearCategoria} style={{ padding:'10px 20px', background:'#27ae60', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold' }}>{nuevaCatEmoji} Crear</button></div></div></div>)}

      {/* MODAL CONFIRMAR ELIMINAR CATEGORÍA */}
      {confirmElimCat&&(<div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}><div style={{ background:'white', padding:28, borderRadius:14, width:440, boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}><div style={{ fontSize:36, textAlign:'center', marginBottom:12 }}>⚠️</div><h3 style={{ margin:'0 0 10px', color:'#c0392b', textAlign:'center' }}>Categoría con productos</h3><p style={{ color:'#555', fontSize:'14px', textAlign:'center', marginBottom:20 }}>La categoría <strong>"{confirmElimCat}"</strong> tiene {(categoriasConfig[confirmElimCat]||[]).length} producto(s).<br/>¿Qué deseas hacer?</p><label style={{ fontSize:'13px', fontWeight:'bold', color:'#555', display:'block', marginBottom:6 }}>Mover productos a:</label><select id="catDestino" style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd', fontSize:'14px', marginBottom:20 }}>{Object.keys(categoriasConfig).filter(c=>c!==confirmElimCat).map(c=>(<option key={c} value={c}>{EMOJIS_CAT[c]||'📋'} {c}</option>))}</select><div style={{ display:'flex', gap:10, flexDirection:'column' }}><button onClick={()=>{const sel=document.getElementById('catDestino').value;confirmarElimCategoria(sel);}} style={{ padding:11, background:'#e67e22', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold', fontSize:'14px' }}>Mover y eliminar categoría</button><button onClick={()=>confirmarElimCategoria(null)} style={{ padding:11, background:'#e74c3c', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold', fontSize:'14px' }}>Eliminar categoría y productos</button><button onClick={()=>setConfirmElimCat(null)} style={{ padding:11, background:'#95a5a6', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:'14px' }}>Cancelar</button></div></div></div>)}

      <GeminiChat/>
    </div>
  );
}

export default App;
