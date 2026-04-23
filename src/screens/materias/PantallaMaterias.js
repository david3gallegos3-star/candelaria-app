// ============================================
// PANTALLA MATERIAS PRIMAS — orquestador
// Une: MateriasTabla + MateriasModalAgregar + CategoriasMpModal
// Usado por: App.js
// ============================================

import React, { useState, useRef, useEffect } from 'react';
import { supabase }          from '../../supabase';
import GeminiChat            from '../../GeminiChat';
import MateriasTabla         from './MateriasTabla';
import MateriasModalAgregar  from './MateriasModalAgregar';
import CategoriasMpModal     from './CategoriasMpModal';

function PantallaMaterias({
  materias, categoriasMp, userRol, user,
  cargarMaterias, cargarCategoriasMpDB,
  generarSiguienteId, guardarHistorialPrecios,
  navegarA, onVolver, onVolverMenu, mostrarExito
}) {

  // ── Seed: asegurar "Retazos Cortes" existe ────────────
  useEffect(() => {
    async function seedRetazos() {
      const { data: cats } = await supabase.from('categorias_mp').select('nombre');
      if (!(cats || []).some(c => c.nombre === 'Retazos')) {
        await supabase.from('categorias_mp').insert({ nombre: 'Retazos', orden: 99 });
        await cargarCategoriasMpDB();
      }
      const { data: mp } = await supabase.from('materias_primas')
        .select('id').in('nombre', ['Retazos Cortes', 'Aserrín Cortes']).limit(1);
      if (!mp || mp.length === 0) {
        const { error: eIns } = await supabase.from('materias_primas').insert({
          id:              'RET001',
          nombre:          'Aserrín Cortes',
          nombre_producto: 'Aserrín Cortes',
          categoria:       'Retazos',
          precio_kg:       0,
          precio_lb:       0,
          precio_gr:       0,
          proveedor:       '',
          notas:           'Precio de venta de aserrín de cortes — editable, no eliminar',
          estado:          'ACTIVO',
          eliminado:       false,
          tipo:            'MATERIAS PRIMAS',
        });
        if (eIns) console.error('Seed Aserrín Cortes:', eIns.message);
        await cargarMaterias();
      }
    }
    seedRetazos();
  }, []);

  // ── Estados filtros ───────────────────────────────────
  const [buscar,       setBuscar]       = useState('');
  const [catFiltro,    setCatFiltro]    = useState('TODAS');
  const [estadoFiltro, setEstadoFiltro] = useState('TODOS');

  // ── Estados modales ───────────────────────────────────
  const [modalAgregar,     setModalAgregar]     = useState(false);
  const [modalEditar,      setModalEditar]      = useState(null);
  const [modalGestionarMp, setModalGestionarMp] = useState(false);

  // ── Estado categorías ─────────────────────────────────
  const [nuevaCatMpNombre, setNuevaCatMpNombre] = useState('');
  const [editandoCatMp,    setEditandoCatMp]    = useState(null);

  // ── Estado form agregar ───────────────────────────────
  const [form, setForm] = useState({
    id:'', categoria:'', nombre:'', nombre_producto:'',
    proveedor:'', precio_kg:'', notas:'',
    estado:'ACTIVO', tipo:'MATERIAS PRIMAS'
  });

  const fileRefMP = useRef();

  // ── Filtrado ──────────────────────────────────────────
  function norm(s) {
    return (s||'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  const materiasFiltradas = materias.filter(m => {
    const b = norm(buscar);
    const coincideBuscar = !buscar ||
      norm(m.nombre).includes(b) ||
      norm(m.id).includes(b) ||
      norm(m.proveedor).includes(b) ||
      norm(m.nombre_producto).includes(b);
    const coincideCat    = catFiltro    === 'TODAS' || m.categoria === catFiltro;
    const coincideEstado = estadoFiltro === 'TODOS' || m.estado    === estadoFiltro;
    return coincideBuscar && coincideCat && coincideEstado;
  });

  // ── Calcular precios ──────────────────────────────────
  function calcularPrecios(precio_kg) {
    const kg = parseFloat(precio_kg) || 0;
    return {
      precio_lb: kg > 0 ? (kg / 2.20462).toFixed(4) : '',
      precio_gr: kg > 0 ? (kg / 1000).toFixed(6)    : ''
    };
  }

  // ── Guardar nueva MP ──────────────────────────────────
  async function guardarNuevoMP() {
    if (!form.id || !form.nombre)
      return alert('ID y Nombre son obligatorios');
    const precios = calcularPrecios(form.precio_kg);
    const { error } = await supabase.from('materias_primas').insert([{
      id:              form.id,
      categoria:       form.categoria,
      nombre:          form.nombre,
      nombre_producto: form.nombre_producto || form.nombre,
      proveedor:       form.proveedor,
      precio_kg:       parseFloat(form.precio_kg) || 0,
      precio_lb:       parseFloat(precios.precio_lb) || 0,
      precio_gr:       parseFloat(precios.precio_gr) || 0,
      notas:           form.notas,
      estado:          form.estado,
      tipo:            form.tipo
    }]);
    if (error) return alert('Error: ' + error.message);
    setModalAgregar(false);
    setForm({
      id:'', categoria: categoriasMp[0]||'',
      nombre:'', nombre_producto:'', proveedor:'',
      precio_kg:'', notas:'', estado:'ACTIVO',
      tipo:'MATERIAS PRIMAS'
    });
    await cargarMaterias();
    mostrarExito('✅ Materia prima agregada');
  }

  // ── Guardar edición MP ────────────────────────────────
  async function guardarEdicionMP() {
    const mpAnterior         = materias.find(m => m.id === modalEditar.id);
    const viejoNombreProducto = mpAnterior?.nombre_producto;
    const nuevoNombreProducto = modalEditar.nombre_producto || modalEditar.nombre;
    const precios = calcularPrecios(modalEditar.precio_kg);

    const { error } = await supabase.from('materias_primas').update({
      categoria:       modalEditar.categoria,
      nombre:          modalEditar.nombre,
      nombre_producto: nuevoNombreProducto,
      proveedor:       modalEditar.proveedor,
      precio_kg:       parseFloat(modalEditar.precio_kg) || 0,
      precio_lb:       parseFloat(precios.precio_lb) || 0,
      precio_gr:       parseFloat(precios.precio_gr) || 0,
      notas:           modalEditar.notas,
      estado:          modalEditar.estado,
      tipo:            modalEditar.tipo || 'MATERIAS PRIMAS'
    }).eq('id', modalEditar.id);
    if (error) return alert('Error: ' + error.message);

    // Si cambió nombre → actualiza fórmulas
    if (viejoNombreProducto && nuevoNombreProducto !== viejoNombreProducto)
      await supabase.from('formulaciones')
        .update({ ingrediente_nombre: nuevoNombreProducto })
        .eq('ingrediente_nombre', viejoNombreProducto);

    // Notificación si cambió precio
    if (mpAnterior &&
      parseFloat(mpAnterior.precio_kg) !== parseFloat(modalEditar.precio_kg)) {
      await supabase.from('notificaciones').insert([{
        tipo:           'cambio_precio',
        origen:         'materias_primas',
        usuario_nombre: userRol?.nombre || 'Admin',
        user_id:        user?.id || null,
        mensaje:        `Precio de "${nuevoNombreProducto}" cambió: $${parseFloat(mpAnterior.precio_kg).toFixed(2)} → $${parseFloat(modalEditar.precio_kg).toFixed(2)}/kg`,
        leida:          false,
        expires_at:     new Date(Date.now() + 24*60*60*1000).toISOString()
      }]);
    }

    // Guardar en historial MP
    await supabase.from('historial_materias_primas').insert([{
      fecha:     new Date().toISOString().split('T')[0],
      mp_id:     modalEditar.id,
      categoria: modalEditar.categoria,
      nombre:    modalEditar.nombre,
      proveedor: modalEditar.proveedor,
      precio_kg: parseFloat(modalEditar.precio_kg) || 0,
      precio_gr: parseFloat(precios.precio_gr) || 0,
      notas:     modalEditar.notas
    }]);

    setModalEditar(null);
    await cargarMaterias();
    mostrarExito('✅ Materia prima actualizada');
  }

  // ── Eliminar MP ───────────────────────────────────────
    async function eliminarMP(id) {
      const mp = materias.find(m => m.id === id);
      if (mp?.nombre === 'Retazos Cortes') {
        alert('⛔ Esta materia prima es del sistema y no puede eliminarse.');
        return;
      }
      if (!window.confirm('¿Eliminar esta materia prima?')) return;
      await supabase.from('materias_primas').update({
        eliminado:     true,
        eliminado_at:  new Date().toISOString(),
        eliminado_por: userRol?.nombre || 'Admin',
        estado:        'INACTIVO'
      }).eq('id', id);
      await cargarMaterias();
      mostrarExito('🗑️ Eliminada — recupérala en Historial MP → Eliminadas');
    }

  // ── Subir Excel ───────────────────────────────────────
  async function subirExcel(e) {
    const file = e.target.files[0]; if (!file) return;
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const wb   = XLSX.read(data);
    const ws   = wb.Sheets['MATERIAS_PRIMAS'];
    if (!ws) return alert('No se encontró la hoja MATERIAS_PRIMAS');
    const rows = XLSX.utils.sheet_to_json(ws, { header:1 });
    let insertados = 0;
    for (let i = 6; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || !r[2] || String(r[0]).length > 10) continue;
      if (['ID','CATEGORIA'].includes(String(r[0]))) continue;
      const kg = parseFloat(r[6]) || 0;
      const registro = {
        id:              String(r[0]).trim(),
        categoria:       String(r[1]||'').trim(),
        nombre:          String(r[2]||'').trim(),
        nombre_producto: String(r[3]||r[2]||'').trim(),
        proveedor:       String(r[4]||'').trim(),
        precio_kg:       kg,
        precio_lb:       kg > 0 ? kg / 2.20462 : 0,
        precio_gr:       kg > 0 ? kg / 1000    : 0,
        notas:           String(r[9]||'').trim(),
        estado:          String(r[10]||'ACTIVO').trim(),
        tipo:            String(r[11]||'MATERIAS PRIMAS').trim()
      };
      if (registro.nombre) {
        await supabase.from('materias_primas').upsert([registro]);
        insertados++;
      }
    }
    await cargarMaterias();
    mostrarExito(`✅ ${insertados} materias primas importadas`);
    e.target.value = '';
  }

  // ── Categorías MP ─────────────────────────────────────
  async function crearCategoriaMp() {
    const nombre = nuevaCatMpNombre.trim().toUpperCase();
    if (!nombre) return alert('Escribe un nombre');
    if (categoriasMp.includes(nombre)) return alert('Ya existe');
    const { error } = await supabase.from('categorias_mp')
      .insert([{ nombre, orden: categoriasMp.length }]);
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
    if (nuevoNombreCat !== viejoNombre && categoriasMp.includes(nuevoNombreCat))
      return alert('Ya existe');
    await supabase.from('categorias_mp')
      .update({ nombre: nuevoNombreCat }).eq('nombre', viejoNombre);
    if (nuevoNombreCat !== viejoNombre)
      await supabase.from('materias_primas')
        .update({ categoria: nuevoNombreCat }).eq('categoria', viejoNombre);
    setEditandoCatMp(null);
    await cargarCategoriasMpDB();
    await cargarMaterias();
    mostrarExito(`✅ Categoría renombrada a "${nuevoNombreCat}"`);
  }

  async function eliminarCategoriaMp(idx) {
    const nombre = categoriasMp[idx];
    if (materias.some(m => m.categoria === nombre))
      return alert(`La categoría "${nombre}" tiene materias primas asignadas.`);
    if (!window.confirm(`¿Eliminar la categoría "${nombre}"?`)) return;
    await supabase.from('categorias_mp').delete().eq('nombre', nombre);
    await cargarCategoriasMpDB();
    mostrarExito(`🗑️ Categoría "${nombre}" eliminada`);
  }

  async function moverCategoriaMp(idx, dir) {
    const nuevas = [...categoriasMp];
    const dest   = idx + dir;
    if (dest < 0 || dest >= nuevas.length) return;
    [nuevas[idx], nuevas[dest]] = [nuevas[dest], nuevas[idx]];
    await supabase.from('categorias_mp')
      .update({ orden: dest }).eq('nombre', nuevas[dest]);
    await supabase.from('categorias_mp')
      .update({ orden: idx  }).eq('nombre', nuevas[idx]);
    await cargarCategoriasMpDB();
  }

  // ── RENDER ────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial' }}>

      {/* Header */}
      <div style={{
        background:'linear-gradient(135deg,#1a1a2e,#16213e)',
        padding:'14px 24px',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={onVolverMenu} style={{
            background:'rgba(255,200,0,0.25)',
            border:'1px solid rgba(255,200,0,0.4)',
            color:'#ffd700', padding:'8px 12px', borderRadius:'8px',
            cursor:'pointer', fontSize:'12px', fontWeight:'bold'
          }}>🏠 Menú</button>
          <button onClick={onVolver} style={{
            background:'rgba(255,255,255,0.2)', border:'none',
            color:'white', padding:'8px 14px',
            borderRadius:'8px', cursor:'pointer', fontSize:'13px'
          }}>← Volver</button>
          <div>
            <div style={{ color:'white', fontWeight:'bold', fontSize:'18px' }}>
              📦 Materias Primas
            </div>
            <div style={{ color:'#aaa', fontSize:'12px' }}>
              Gestión de ingredientes · {categoriasMp.length} categorías
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => navegarA('historialmp')} style={{
            padding:'8px 14px',
            background:'rgba(255,255,255,0.15)',
            border:'1px solid rgba(255,255,255,0.3)',
            color:'white', borderRadius:'8px',
            cursor:'pointer', fontSize:'13px'
          }}>📋 Historial MP</button>
          <button onClick={() => setModalGestionarMp(true)} style={{
            padding:'8px 14px',
            background:'rgba(255,255,255,0.15)',
            border:'1px solid rgba(255,255,255,0.3)',
            color:'white', borderRadius:'8px',
            cursor:'pointer', fontSize:'13px', fontWeight:'bold'
          }}>🗂️ Categorías</button>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding:'20px 24px' }}>

        {/* Botones acción */}
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:16,
          flexWrap:'wrap', gap:10
        }}>
          <h2 style={{ margin:0, color:'#1a1a2e', fontSize:'20px' }}>
            📦 Materias Primas
          </h2>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={guardarHistorialPrecios} style={{
              padding:'9px 18px', background:'#e67e22', color:'white',
              border:'none', borderRadius:'8px', cursor:'pointer',
              fontSize:'13px', fontWeight:'bold'
            }}>📋 Guardar Historial MP</button>
            <button onClick={() => fileRefMP.current.click()} style={{
              padding:'9px 18px', background:'#8e44ad', color:'white',
              border:'none', borderRadius:'8px', cursor:'pointer',
              fontSize:'13px', fontWeight:'bold'
            }}>📤 Subir Excel</button>
            <input ref={fileRefMP} type="file"
              accept=".xlsx,.xlsm" style={{ display:'none' }}
              onChange={subirExcel}
            />
            <button onClick={() => {
              const idSugerido = generarSiguienteId(categoriasMp[0]||'');
              setForm({
                id: idSugerido,
                categoria: categoriasMp[0]||'',
                nombre:'', nombre_producto:'', proveedor:'',
                precio_kg:'', notas:'', estado:'ACTIVO',
                tipo:'MATERIAS PRIMAS'
              });
              setModalAgregar(true);
            }} style={{
              padding:'9px 18px', background:'#27ae60', color:'white',
              border:'none', borderRadius:'8px', cursor:'pointer',
              fontSize:'13px', fontWeight:'bold'
            }}>➕ Agregar</button>
          </div>
        </div>

        {/* Tabla con filtros */}
        <MateriasTabla
          materiasFiltradas={materiasFiltradas}
          buscar={buscar}           setBuscar={setBuscar}
          catFiltro={catFiltro}     setCatFiltro={setCatFiltro}
          estadoFiltro={estadoFiltro} setEstadoFiltro={setEstadoFiltro}
          categoriasMp={categoriasMp}
          onEditar={m => setModalEditar({ ...m, tipo: m.tipo||'MATERIAS PRIMAS' })}
          onEliminar={eliminarMP}
        />
      </div>

      {/* Modal agregar / editar */}
      <MateriasModalAgregar
        modalAgregar={modalAgregar} setModalAgregar={setModalAgregar}
        form={form}                 setForm={setForm}
        guardarNuevoMP={guardarNuevoMP}
        modalEditar={modalEditar}   setModalEditar={setModalEditar}
        guardarEdicionMP={guardarEdicionMP}
        categoriasMp={categoriasMp}
        generarSiguienteId={generarSiguienteId}
      />

      {/* Modal categorías */}
      <CategoriasMpModal
        modalGestionarMp={modalGestionarMp}
        setModalGestionarMp={setModalGestionarMp}
        categoriasMp={categoriasMp}
        materias={materias}
        nuevaCatMpNombre={nuevaCatMpNombre}
        setNuevaCatMpNombre={setNuevaCatMpNombre}
        editandoCatMp={editandoCatMp}
        setEditandoCatMp={setEditandoCatMp}
        crearCategoriaMp={crearCategoriaMp}
        guardarEdicionCatMp={guardarEdicionCatMp}
        eliminarCategoriaMp={eliminarCategoriaMp}
        moverCategoriaMp={moverCategoriaMp}
      />

      <GeminiChat />
    </div>
  );
}

export default PantallaMaterias;