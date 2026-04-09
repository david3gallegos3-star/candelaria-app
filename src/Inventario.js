import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { crearNotificacion, registrarAuditoria } from './App';

function Inventario({ onVolver, onVolverMenu, userRol, currentUser }) {
  const [inventario, setInventario] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msgExito, setMsgExito] = useState('');
  const [buscar, setBuscar] = useState('');
  const [catFiltro, setCatFiltro] = useState('TODAS');
  const [estadoFiltro, setEstadoFiltro] = useState('TODOS');
  const [categorias, setCategorias] = useState([]);
  const [tab, setTab] = useState('stock');
  const [mermas, setMermas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const mobile = window.innerWidth < 700;
  const [modalNota, setModalNota] = useState(false);
    const [textoNota, setTextoNota] = useState('');
    const [enviandoNota, setEnviandoNota] = useState(false);

  // Modales
  const [modalEntrada, setModalEntrada] = useState(null); // { inv, tipo: 'manual' | 'camara' }
  const [modalMerma, setModalMerma] = useState(false);
  const [modalMinimo, setModalMinimo] = useState(null);
  const [modalCamara, setModalCamara] = useState(false);
  const [resultadosIA, setResultadosIA] = useState([]);
  const [analizandoIA, setAnalizandoIA] = useState(false);
  const [imagenBase64, setImagenBase64] = useState(null);
  

  // Forms
  const [entradaKg, setEntradaKg] = useState('');
  const [entradaPrecio, setEntradaPrecio] = useState('');
  const [entradaNota, setEntradaNota] = useState('');
  const [mermaForm, setMermaForm] = useState({ mp_id: '', nombre: '', kg: '', motivo: '' });
  const [minimoKg, setMinimoKg] = useState('');
  const [guardando, setGuardando] = useState(false);

  const fileRef = useRef();

  useEffect(() => { cargarTodo(); }, []);

  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 4000);
  }

  async function cargarTodo() {
    setLoading(true);
    const { data: mps } = await supabase.from('materias_primas').select('*').order('categoria').order('nombre');
    const { data: inv } = await supabase.from('inventario_mp').select('*');
    const { data: mermasData } = await supabase.from('mermas').select('*').order('created_at', { ascending: false }).limit(50);
    const { data: movData } = await supabase.from('inventario_movimientos').select('*').order('created_at', { ascending: false }).limit(100);

    const mpList = mps || [];
    const invList = inv || [];

    // Sincronizar — crear registro en inventario_mp para cada MP que no tenga
    const mpsSinInventario = mpList.filter(mp => !invList.find(i => i.materia_prima_id === mp.id));
    if (mpsSinInventario.length > 0) {
      const nuevos = mpsSinInventario.map(mp => ({
        materia_prima_id: mp.id,
        nombre: mp.nombre_producto || mp.nombre,
        stock_kg: 0,
        stock_minimo_kg: 0
      }));
      await supabase.from('inventario_mp').insert(nuevos);
      // Recargar
      const { data: invActualizado } = await supabase.from('inventario_mp').select('*');
      combinarDatos(mpList, invActualizado || []);
    } else {
      combinarDatos(mpList, invList);
    }

    setMermas(mermasData || []);
    setMovimientos(movData || []);
    const cats = [...new Set(mpList.map(m => m.categoria).filter(Boolean))];
    setCategorias(cats);
    setLoading(false);
  }
    async function enviarNota() {
  if (!textoNota.trim()) return;
  setEnviandoNota(true);
  try {
    await crearNotificacion({
      tipo: 'nota_produccion',
      origen: 'inventario',
      usuario_nombre: userRol?.nombre || 'Bodeguero',
      user_id: currentUser?.id,
      producto_nombre: null,
      mensaje: textoNota.trim()
    });
    setModalNota(false);
    setTextoNota('');
    mostrarExito('✅ Nota enviada al administrador');
  } catch (e) { alert('Error al enviar nota'); }
  setEnviandoNota(false);
    }

  function combinarDatos(mps, inv) {
    const combinado = mps.map(mp => {
      const reg = inv.find(i => i.materia_prima_id === mp.id);
      return {
        ...mp,
        inv_id: reg?.id,
        stock_kg: parseFloat(reg?.stock_kg || 0),
        stock_minimo_kg: parseFloat(reg?.stock_minimo_kg || 0),
        estado_stock: getEstadoStock(parseFloat(reg?.stock_kg || 0), parseFloat(reg?.stock_minimo_kg || 0))
      };
    });
    setInventario(combinado);
    setMateriasPrimas(mps);
  }

  function getEstadoStock(stock, minimo) {
    if (minimo === 0) return 'SIN_MIN';
    if (stock === 0) return 'CRITICO';
    if (stock <= minimo * 0.5) return 'CRITICO';
    if (stock <= minimo) return 'BAJO';
    return 'OK';
  }

  // ── Entrada manual ─────────────────────────────────────
  async function guardarEntrada() {
    if (!modalEntrada || !entradaKg || parseFloat(entradaKg) <= 0) return;
    setGuardando(true);
    const { inv } = modalEntrada;
    const kg = parseFloat(entradaKg);
    const precio = parseFloat(entradaPrecio) || 0;
    const nuevoStock = inv.stock_kg + kg;

    await supabase.from('inventario_mp').update({
      stock_kg: nuevoStock,
      updated_at: new Date().toISOString()
    }).eq('id', inv.inv_id);

    await supabase.from('inventario_movimientos').insert([{
      materia_prima_id: inv.id,
      nombre_mp: inv.nombre_producto || inv.nombre,
      tipo: 'entrada',
      kg,
      precio_kg_nuevo: precio || null,
      precio_kg_anterior: parseFloat(inv.precio_kg) || null,
      motivo: entradaNota || 'Entrada manual',
      usuario_nombre: userRol?.nombre || 'Bodeguero',
      user_id: currentUser?.id,
      via: 'manual',
      fecha: new Date().toISOString().split('T')[0]
    }]);

    // Actualizar precio si se especificó
    if (precio > 0 && precio !== parseFloat(inv.precio_kg)) {
      await supabase.from('materias_primas').update({ precio_kg: precio }).eq('id', inv.id);
      await crearNotificacion({
        tipo: 'cambio_precio',
        origen: 'inventario',
        usuario_nombre: userRol?.nombre || 'Bodeguero',
        user_id: currentUser?.id,
        producto_nombre: inv.nombre_producto || inv.nombre,
        mensaje: `Entrada de inventario: "${inv.nombre_producto || inv.nombre}" +${kg}kg · precio actualizado $${parseFloat(inv.precio_kg).toFixed(2)} → $${precio.toFixed(2)}/kg`
      });
    } else {
      await registrarAuditoria({
        tipo: 'entrada_inventario',
        usuario_nombre: userRol?.nombre || 'Bodeguero',
        user_id: currentUser?.id,
        producto_nombre: inv.nombre_producto || inv.nombre,
        campo_modificado: 'stock_kg',
        valor_antes: inv.stock_kg.toString(),
        valor_despues: nuevoStock.toString(),
        mensaje: `Entrada manual: +${kg}kg · ${entradaNota || ''}`
      });
    }

    // Verificar si está bajo mínimo
    await verificarAlertaStock(inv, nuevoStock);

    setModalEntrada(null);
    setEntradaKg(''); setEntradaPrecio(''); setEntradaNota('');
    setGuardando(false);
    mostrarExito(`✅ +${kg}kg agregados a ${inv.nombre_producto || inv.nombre}`);
    await cargarTodo();
  }

  // ── Ajuste de stock inicial ────────────────────────────
  async function guardarStockInicial(inv, nuevoValor) {
    const kg = parseFloat(nuevoValor);
    if (isNaN(kg) || kg < 0) return;

    await supabase.from('inventario_mp').update({
      stock_kg: kg,
      updated_at: new Date().toISOString()
    }).eq('id', inv.inv_id);

    await registrarAuditoria({
      tipo: 'ajuste_inventario',
      usuario_nombre: userRol?.nombre || 'Admin',
      user_id: currentUser?.id,
      producto_nombre: inv.nombre_producto || inv.nombre,
      campo_modificado: 'stock_kg',
      valor_antes: inv.stock_kg.toString(),
      valor_despues: kg.toString(),
      mensaje: 'Ajuste de stock inicial'
    });

    await cargarTodo();
    mostrarExito(`✅ Stock actualizado`);
  }

  // ── Stock mínimo ───────────────────────────────────────
  async function guardarMinimo() {
    if (!modalMinimo) return;
    const kg = parseFloat(minimoKg) || 0;
    await supabase.from('inventario_mp').update({ stock_minimo_kg: kg }).eq('id', modalMinimo.inv_id);
    setModalMinimo(null); setMinimoKg('');
    mostrarExito('✅ Stock mínimo actualizado');
    await cargarTodo();
  }

  // ── Alerta stock bajo ──────────────────────────────────
  async function verificarAlertaStock(inv, stockActual) {
    const minimo = inv.stock_minimo_kg;
    if (minimo === 0) return;
    if (stockActual <= minimo) {
      const nivel = stockActual <= minimo * 0.5 ? 'CRÍTICO' : 'BAJO';
      await crearNotificacion({
        tipo: 'stock_bajo',
        origen: 'inventario',
        usuario_nombre: 'Sistema',
        user_id: null,
        producto_nombre: inv.nombre_producto || inv.nombre,
        mensaje: `⚠️ Stock ${nivel}: ${inv.nombre_producto || inv.nombre} — ${stockActual.toFixed(1)}kg (mínimo: ${minimo}kg)`
      });
    }
  }

  // ── Merma / pérdida ────────────────────────────────────
  async function guardarMerma() {
    if (!mermaForm.mp_id || !mermaForm.kg || !mermaForm.motivo) {
      return alert('Completa todos los campos');
    }
    setGuardando(true);
    const mp = inventario.find(m => m.id === mermaForm.mp_id);
    if (!mp) return;
    const kg = parseFloat(mermaForm.kg);
    const nuevoStock = Math.max(0, mp.stock_kg - kg);
    const costoPerdido = kg * (parseFloat(mp.precio_kg) || 0);

    await supabase.from('inventario_mp').update({
      stock_kg: nuevoStock,
      updated_at: new Date().toISOString()
    }).eq('id', mp.inv_id);

    await supabase.from('mermas').insert([{
      fecha: new Date().toISOString().split('T')[0],
      materia_prima_id: mp.id,
      nombre_mp: mp.nombre_producto || mp.nombre,
      kg_perdidos: kg,
      costo_perdido: costoPerdido,
      motivo: mermaForm.motivo,
      usuario_nombre: userRol?.nombre || 'Bodeguero',
      user_id: currentUser?.id
    }]);

    await supabase.from('inventario_movimientos').insert([{
      materia_prima_id: mp.id,
      nombre_mp: mp.nombre_producto || mp.nombre,
      tipo: 'perdida',
      kg: -kg,
      motivo: mermaForm.motivo,
      usuario_nombre: userRol?.nombre || 'Bodeguero',
      user_id: currentUser?.id,
      via: 'manual',
      fecha: new Date().toISOString().split('T')[0]
    }]);

    await crearNotificacion({
      tipo: 'perdida',
      origen: 'inventario',
      usuario_nombre: userRol?.nombre || 'Bodeguero',
      user_id: currentUser?.id,
      producto_nombre: mp.nombre_producto || mp.nombre,
      mensaje: `Pérdida registrada: "${mp.nombre_producto || mp.nombre}" -${kg}kg · Motivo: ${mermaForm.motivo} · Costo: $${costoPerdido.toFixed(2)}`
    });

    setModalMerma(false);
    setMermaForm({ mp_id: '', nombre: '', kg: '', motivo: '' });
    setGuardando(false);
    mostrarExito(`🗑️ Pérdida de ${kg}kg registrada`);
    await cargarTodo();
  }

  // ── Cámara IA ──────────────────────────────────────────
  function abrirCamara() { fileRef.current.click(); }

  async function procesarImagen(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAnalizandoIA(true);
    setModalCamara(true);
    setResultadosIA([]);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1];
      setImagenBase64(ev.target.result);
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 }
                },
                {
                  type: 'text',
                  text: `Analiza esta imagen de una factura o lista de precios de materias primas para una empresa de embutidos.
Extrae TODOS los productos que encuentres con su precio por kg.
Responde SOLO en JSON válido, sin texto adicional, sin markdown, sin backticks.
Formato exacto:
{"productos": [{"nombre": "nombre del producto", "precio_kg": 4.50, "cantidad_kg": 120, "confianza": "alta|media|baja"}]}
Si no puedes leer bien un valor, pon null. Si no hay precio/cantidad, pon null.`
                }
              ]
            }]
          })
        });
        const data = await response.json();
        const texto = data.content?.[0]?.text || '{"productos":[]}';
        const parsed = JSON.parse(texto);
        const productosIA = parsed.productos || [];

        // Comparar con materias primas existentes
        const resultados = productosIA.map(p => {
          const match = buscarMPSimilar(p.nombre, materiasPrimas);
          return {
            ...p,
            match,
            accion: match ? 'mismo' : 'nuevo', // 'mismo' | 'nuevo' | 'renombrar'
            nombre_editado: p.nombre,
            precio_editado: p.precio_kg,
            cantidad_editada: p.cantidad_kg,
            incluir: true
          };
        });
        setResultadosIA(resultados);
      } catch (err) {
        alert('Error al analizar imagen: ' + err.message);
        setModalCamara(false);
      }
      setAnalizandoIA(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function buscarMPSimilar(nombre, mps) {
    const norm = s => (s || '').toLowerCase().trim()
      .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
      .replace(/[óò]/g, 'o').replace(/[úù]/g, 'u').replace(/ñ/g, 'n')
      .replace(/\s+/g, ' ').replace(/[\/\-\.]/g, '').replace(/[()]/g, '').trim();
    const n = norm(nombre);
    return mps.find(m =>
      norm(m.nombre_producto) === n || norm(m.nombre) === n ||
      (norm(m.nombre_producto).length > 4 && (n.includes(norm(m.nombre_producto)) || norm(m.nombre_producto).includes(n))) ||
      (norm(m.nombre).length > 4 && (n.includes(norm(m.nombre)) || norm(m.nombre).includes(n)))
    ) || null;
  }

  async function confirmarResultadosIA() {
    setGuardando(true);
    const resIncluidos = resultadosIA.filter(r => r.incluir);
    for (const r of resIncluidos) {
      const precio = parseFloat(r.precio_editado) || 0;
      const kg = parseFloat(r.cantidad_editada) || 0;

      if (r.accion === 'mismo' && r.match) {
        // Actualizar stock y precio
        const invItem = inventario.find(i => i.id === r.match.id);
        if (invItem && kg > 0) {
          const nuevoStock = invItem.stock_kg + kg;
          await supabase.from('inventario_mp').update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() }).eq('id', invItem.inv_id);
          await supabase.from('inventario_movimientos').insert([{
            materia_prima_id: r.match.id, nombre_mp: invItem.nombre_producto || invItem.nombre,
            tipo: 'entrada', kg, precio_kg_nuevo: precio || null,
            precio_kg_anterior: parseFloat(r.match.precio_kg) || null,
            motivo: 'Entrada por escaneo IA', usuario_nombre: userRol?.nombre || 'Bodeguero',
            user_id: currentUser?.id, via: 'camara', fecha: new Date().toISOString().split('T')[0]
          }]);
        }
        if (precio > 0 && precio !== parseFloat(r.match.precio_kg)) {
          await supabase.from('materias_primas').update({ precio_kg: precio }).eq('id', r.match.id);
        }
        await crearNotificacion({
          tipo: 'entrada_inventario', origen: 'inventario_camara',
          usuario_nombre: userRol?.nombre || 'Bodeguero', user_id: currentUser?.id,
          producto_nombre: r.match.nombre_producto || r.match.nombre,
          mensaje: `Escaneo IA: "${r.match.nombre_producto || r.match.nombre}" +${kg}kg${precio > 0 ? ` · precio $${precio.toFixed(2)}/kg` : ''}`
        });
      } else if (r.accion === 'renombrar' && r.match) {
        // Renombrar MP existente + actualizar stock
        const nombreViejo = r.match.nombre_producto;
        await supabase.from('materias_primas').update({ nombre_producto: r.nombre_editado }).eq('id', r.match.id);
        await supabase.from('formulaciones').update({ ingrediente_nombre: r.nombre_editado }).eq('ingrediente_nombre', nombreViejo);
        await supabase.from('inventario_mp').update({ nombre: r.nombre_editado }).eq('materia_prima_id', r.match.id);
        if (kg > 0) {
          const invItem = inventario.find(i => i.id === r.match.id);
          if (invItem) {
            await supabase.from('inventario_mp').update({ stock_kg: invItem.stock_kg + kg }).eq('id', invItem.inv_id);
          }
        }
        await crearNotificacion({
          tipo: 'cambio_nombre', origen: 'inventario_camara',
          usuario_nombre: userRol?.nombre || 'Bodeguero', user_id: currentUser?.id,
          producto_nombre: r.nombre_editado,
          mensaje: `Renombrado vía escaneo: "${nombreViejo}" → "${r.nombre_editado}"${kg > 0 ? ` · +${kg}kg` : ''}`
        });
      } else if (r.accion === 'nuevo') {
        // Crear nueva MP + registro de inventario
        const nuevaMP = {
          id: 'MP' + Date.now().toString().slice(-6),
          categoria: 'SIN CATEGORÍA',
          nombre: r.nombre_editado,
          nombre_producto: r.nombre_editado,
          precio_kg: precio || 0,
          precio_lb: precio > 0 ? precio / 2.20462 : 0,
          precio_gr: precio > 0 ? precio / 1000 : 0,
          estado: 'ACTIVO',
          tipo: 'MATERIAS PRIMAS'
        };
        await supabase.from('materias_primas').insert([nuevaMP]);
        await supabase.from('inventario_mp').insert([{
          materia_prima_id: nuevaMP.id,
          nombre: r.nombre_editado,
          stock_kg: kg || 0,
          stock_minimo_kg: 0
        }]);
        await crearNotificacion({
          tipo: 'nueva_mp', origen: 'inventario_camara',
          usuario_nombre: userRol?.nombre || 'Bodeguero', user_id: currentUser?.id,
          producto_nombre: r.nombre_editado,
          mensaje: `Nueva MP creada vía escaneo: "${r.nombre_editado}"${precio > 0 ? ` · $${precio.toFixed(2)}/kg` : ''}${kg > 0 ? ` · ${kg}kg` : ''}`
        });
      }
    }
    setModalCamara(false);
    setResultadosIA([]);
    setImagenBase64(null);
    setGuardando(false);
    mostrarExito(`✅ Entrada confirmada — ${resIncluidos.length} producto(s) procesados`);
    await cargarTodo();
  }

  // ── Filtros ────────────────────────────────────────────
  const inventarioFiltrado = inventario.filter(m => {
    const b = buscar.toLowerCase();
    const ok = !buscar || (m.nombre_producto || m.nombre)?.toLowerCase().includes(b) || m.id?.toLowerCase().includes(b);
    const cat = catFiltro === 'TODAS' || m.categoria === catFiltro;
    const est = estadoFiltro === 'TODOS' ||
      (estadoFiltro === 'CRITICO' && m.estado_stock === 'CRITICO') ||
      (estadoFiltro === 'BAJO' && m.estado_stock === 'BAJO') ||
      (estadoFiltro === 'OK' && m.estado_stock === 'OK');
    return ok && cat && est;
  });

  const totalStock = inventario.reduce((s, m) => s + m.stock_kg, 0);
  const alertas = inventario.filter(m => m.estado_stock === 'CRITICO' || m.estado_stock === 'BAJO').length;
  const criticos = inventario.filter(m => m.estado_stock === 'CRITICO').length;

  const badgeStock = (estado) => {
    if (estado === 'OK') return { bg: '#d4edda', color: '#155724', txt: 'OK' };
    if (estado === 'BAJO') return { bg: '#fff3cd', color: '#856404', txt: 'BAJO' };
    if (estado === 'CRITICO') return { bg: '#f8d7da', color: '#721c24', txt: 'CRÍTICO' };
    return { bg: '#f0f0f0', color: '#888', txt: 'SIN MÍN' };
  };

  const esAdmin = userRol?.rol === 'admin';
  const esBodeguero = userRol?.rol === 'bodeguero';
  const puedeEditar = esAdmin || esBodeguero;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)', padding: mobile ? '10px 12px' : '14px 24px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mobile ? 8 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onVolverMenu} style={{ background: 'rgba(255,200,0,0.25)', border: '1px solid rgba(255,200,0,0.4)', color: '#ffd700', padding: '7px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>🏠 Menú</button>
            <div>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '14px' : '18px' }}>📦 Inventario de Materias Primas</div>
              <div style={{ color: '#aaa', fontSize: '11px' }}>{inventario.length} materias primas · {alertas} alertas</div>
            </div>
          </div>
          {puedeEditar && (
            <div style={{ display: 'flex', gap: 8 }}>
             <button onClick={() => setModalNota(true)}
               style={{ background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', padding: mobile ? '8px 10px' : '8px 16px', cursor: 'pointer', fontSize: mobile ? '12px' : '13px', fontWeight: 'bold' }}>
                  ✉️ {mobile ? '' : 'Enviar nota'}
                  </button>
                     <button onClick={() => setModalMerma(true)}
                       style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: '8px', padding: mobile ? '8px 10px' : '8px 16px', cursor: 'pointer', fontSize: mobile ? '12px' : '13px', fontWeight: 'bold' }}>
                         🗑️ {mobile ? '' : 'Registrar pérdida'}
                           </button>
                           <button onClick={abrirCamara}
                             style={{ background: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', padding: mobile ? '8px 10px' : '8px 16px', cursor: 'pointer', fontSize: mobile ? '12px' : '13px', fontWeight: 'bold' }}>
                                    📷 {mobile ? '' : 'Escanear factura'}
                                  </button>
                            </div>
              )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={procesarImagen} />

      {msgExito && <div style={{ background: '#d4edda', color: '#155724', padding: '10px 20px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>{msgExito}</div>}

      <div style={{ padding: mobile ? '10px' : '16px 24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
          {[
            { label: 'MATERIAS PRIMAS', val: inventario.length, color: '#1a5276', bg: '#e8f4fd' },
            { label: 'EN STOCK', val: `${totalStock.toFixed(1)} kg`, color: '#155724', bg: '#d4edda' },
            { label: 'ALERTAS STOCK', val: alertas, color: '#856404', bg: '#fff3cd' },
            { label: 'CRÍTICOS', val: criticos, color: '#721c24', bg: '#f8d7da' }
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10px', color: s.color, fontWeight: '700', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: mobile ? '18px' : '22px', fontWeight: '700', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'white', borderRadius: '10px', padding: '4px', marginBottom: '12px', gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {[['stock', '📦 Stock actual'], ['movimientos', '📋 Movimientos'], ['mermas', '🗑️ Pérdidas']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ flex: 1, padding: mobile ? '8px 4px' : '9px 12px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: mobile ? '11px' : '13px', fontWeight: 'bold', background: tab === key ? '#1a1a2e' : 'transparent', color: tab === key ? 'white' : '#666', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* TAB: Stock actual */}
        {tab === 'stock' && (
          <>
            {/* Filtros */}
            <div style={{ background: 'white', padding: '12px 14px', borderRadius: '10px', marginBottom: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <input placeholder="🔍 Buscar MP..." value={buscar} onChange={e => setBuscar(e.target.value)}
                style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }} />
              <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px', minWidth: 160 }}>
                <option value="TODAS">Todas las categorías</option>
                {categorias.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px' }}>
                <option value="TODOS">Todos los estados</option>
                <option value="CRITICO">Crítico</option>
                <option value="BAJO">Bajo</option>
                <option value="OK">OK</option>
              </select>
              <span style={{ padding: '8px 12px', background: '#f0f2f5', borderRadius: '8px', fontSize: '13px', color: '#666' }}>
                {inventarioFiltrado.length} registros
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>⏳ Cargando inventario...</div>
            ) : mobile ? (
              // Vista móvil — tarjetas
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {inventarioFiltrado.map((mp, i) => {
                  const badge = badgeStock(mp.estado_stock);
                  return (
                    <div key={mp.id} style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', border: `1.5px solid ${mp.estado_stock === 'CRITICO' ? '#f5c6c6' : mp.estado_stock === 'BAJO' ? '#ffeeba' : '#e0e0e0'}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a1a2e' }}>{mp.nombre_producto || mp.nombre}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{mp.id} · {mp.categoria}</div>
                        </div>
                        <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>{badge.txt}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 12px', gap: '8px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#888', fontWeight: '700' }}>STOCK</div>
                          <StockInput mp={mp} onSave={guardarStockInicial} disabled={!puedeEditar} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#888', fontWeight: '700' }}>MÍNIMO</div>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#555' }}>{mp.stock_minimo_kg} kg</div>
                          {puedeEditar && <button onClick={() => { setModalMinimo(mp); setMinimoKg(mp.stock_minimo_kg); }} style={{ fontSize: '10px', color: '#3498db', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✏️ editar</button>}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', color: '#888', fontWeight: '700' }}>$/KG</div>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#27ae60' }}>${parseFloat(mp.precio_kg || 0).toFixed(2)}</div>
                        </div>
                      </div>
                      {puedeEditar && (
                        <div style={{ padding: '6px 12px 10px', display: 'flex', gap: '6px' }}>
                          <button onClick={() => { setModalEntrada({ inv: mp }); setEntradaKg(''); setEntradaPrecio(''); setEntradaNota(''); }}
                            style={{ flex: 1, background: '#27ae60', color: 'white', border: 'none', borderRadius: '7px', padding: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                            + Entrada
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Vista desktop — tabla
              <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#1a1a2e', color: 'white' }}>
                        {['ID', 'CATEGORÍA', 'MATERIA PRIMA', 'STOCK (kg)', 'MÍNIMO (kg)', '$/KG', 'ESTADO', 'ACCIONES'].map(h => (
                          <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inventarioFiltrado.map((mp, i) => {
                        const badge = badgeStock(mp.estado_stock);
                        return (
                          <tr key={mp.id} style={{ background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '9px 10px', color: '#555', fontWeight: 'bold', fontSize: '11px' }}>{mp.id}</td>
                            <td style={{ padding: '9px 10px' }}><span style={{ background: '#e8f4fd', color: '#1a5276', padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }}>{mp.categoria}</span></td>
                            <td style={{ padding: '9px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>{mp.nombre_producto || mp.nombre}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                              <StockInput mp={mp} onSave={guardarStockInicial} disabled={!puedeEditar} />
                            </td>
                            <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                <span style={{ fontWeight: 'bold', color: '#555' }}>{mp.stock_minimo_kg}</span>
                                {puedeEditar && <button onClick={() => { setModalMinimo(mp); setMinimoKg(mp.stock_minimo_kg); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#3498db' }}>✏️</button>}
                              </div>
                            </td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', color: '#27ae60', fontWeight: 'bold' }}>${parseFloat(mp.precio_kg || 0).toFixed(2)}</td>
                            <td style={{ padding: '9px 10px' }}><span style={{ background: badge.bg, color: badge.color, padding: '3px 9px', borderRadius: '10px', fontSize: '10px', fontWeight: '700' }}>{badge.txt}</span></td>
                            <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                              {puedeEditar && (
                                <button onClick={() => { setModalEntrada({ inv: mp }); setEntradaKg(''); setEntradaPrecio(''); setEntradaNota(''); }}
                                  style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                                  + Entrada
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {inventarioFiltrado.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>No se encontraron registros</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB: Movimientos */}
        {tab === 'movimientos' && (
          <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#1a1a2e', color: 'white' }}>
                    {['FECHA', 'MATERIA PRIMA', 'TIPO', 'KG', 'MOTIVO', 'USUARIO', 'VÍA'].map(h => (
                      <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m, i) => (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 10px', color: '#555', whiteSpace: 'nowrap' }}>{m.fecha}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>{m.nombre_mp}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: m.tipo === 'entrada' ? '#d4edda' : m.tipo === 'perdida' ? '#f8d7da' : '#e8f4fd', color: m.tipo === 'entrada' ? '#155724' : m.tipo === 'perdida' ? '#721c24' : '#1a5276', padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }}>
                          {m.tipo.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold', color: m.kg > 0 ? '#27ae60' : '#e74c3c' }}>
                        {m.kg > 0 ? '+' : ''}{parseFloat(m.kg).toFixed(2)} kg
                      </td>
                      <td style={{ padding: '8px 10px', color: '#888', fontSize: '11px' }}>{m.motivo}</td>
                      <td style={{ padding: '8px 10px', color: '#555' }}>{m.usuario_nombre}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: m.via === 'camara' ? '#f3e5f5' : '#f0f0f0', color: m.via === 'camara' ? '#6c3483' : '#888', padding: '2px 7px', borderRadius: '6px', fontSize: '10px' }}>
                          {m.via === 'camara' ? '📷 IA' : '✏️ Manual'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {movimientos.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>Sin movimientos registrados</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: Mermas */}
        {tab === 'mermas' && (
          <div>
            <div style={{ background: '#f8d7da', border: '1px solid #f5c6c6', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 'bold', color: '#721c24', fontSize: '13px' }}>Total pérdidas registradas</div>
                <div style={{ color: '#721c24', fontSize: '12px' }}>
                  {mermas.reduce((s, m) => s + parseFloat(m.kg_perdidos || 0), 0).toFixed(2)} kg perdidos · ${mermas.reduce((s, m) => s + parseFloat(m.costo_perdido || 0), 0).toFixed(2)} en pérdidas
                </div>
              </div>
              {puedeEditar && <button onClick={() => setModalMerma(true)} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>+ Registrar pérdida</button>}
            </div>
            <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#c0392b', color: 'white' }}>
                      {['FECHA', 'MATERIA PRIMA', 'KG PERDIDOS', 'COSTO PERDIDO', 'MOTIVO', 'REGISTRADO POR'].map(h => (
                        <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontSize: '11px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mermas.map((m, i) => (
                      <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff5f5' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 10px', color: '#555' }}>{m.fecha}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>{m.nombre_mp}</td>
                        <td style={{ padding: '8px 10px', color: '#e74c3c', fontWeight: 'bold' }}>-{parseFloat(m.kg_perdidos).toFixed(2)} kg</td>
                        <td style={{ padding: '8px 10px', color: '#e74c3c', fontWeight: 'bold' }}>-${parseFloat(m.costo_perdido || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px 10px', color: '#888' }}>{m.motivo}</td>
                        <td style={{ padding: '8px 10px', color: '#555' }}>{m.usuario_nombre}</td>
                      </tr>
                    ))}
                    {mermas.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>Sin pérdidas registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Entrada manual */}
      {modalEntrada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '14px', width: mobile ? '100%' : '460px', padding: '20px', boxShadow: '0 -4px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1a1a2e', fontSize: '15px' }}>+ Entrada de inventario</h3>
              <button onClick={() => setModalEntrada(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>
            <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
              <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px' }}>{modalEntrada.inv.nombre_producto || modalEntrada.inv.nombre}</div>
              <div style={{ fontSize: '12px', color: '#555' }}>Stock actual: <strong>{modalEntrada.inv.stock_kg} kg</strong></div>
            </div>
            {[
              ['Kg a ingresar *', entradaKg, setEntradaKg, 'number', 'Ej: 120'],
              ['Precio/kg (opcional — actualiza el precio)', entradaPrecio, setEntradaPrecio, 'number', `Actual: $${parseFloat(modalEntrada.inv.precio_kg || 0).toFixed(2)}`],
              ['Nota (opcional)', entradaNota, setEntradaNota, 'text', 'Ej: Factura proveedor X']
            ].map(([label, val, setter, type, placeholder]) => (
              <div key={label} style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>{label}</label>
                <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder={placeholder}
                  onFocus={e => e.preventDefault()}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
            ))}
            {entradaKg && parseFloat(entradaKg) > 0 && (
              <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#155724', marginBottom: '14px' }}>
                Stock quedará en: <strong>{(modalEntrada.inv.stock_kg + parseFloat(entradaKg)).toFixed(2)} kg</strong>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEntrada(null)} style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarEntrada} disabled={guardando || !entradaKg || parseFloat(entradaKg) <= 0}
                style={{ padding: '10px 22px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : '✅ Confirmar entrada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Stock mínimo */}
      {modalMinimo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: '14px', width: '380px', padding: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 14px', color: '#1a1a2e' }}>⚠️ Stock mínimo</h3>
            <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
              <strong>{modalMinimo.nombre_producto || modalMinimo.nombre}</strong><br />
              <span style={{ fontSize: '12px', color: '#888' }}>Cuando el stock baje de este nivel se enviará alerta al admin</span>
            </div>
            <input type="number" value={minimoKg} onChange={e => setMinimoKg(e.target.value)} onFocus={e => e.preventDefault()}
              placeholder="Kg mínimos..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #f39c12', fontSize: '15px', fontWeight: 'bold', boxSizing: 'border-box', marginBottom: '14px' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalMinimo(null)} style={{ padding: '9px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarMinimo} style={{ padding: '9px 20px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>✅ Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Registrar pérdida */}
      {modalMerma && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '14px', width: mobile ? '100%' : '460px', padding: '20px', boxShadow: '0 -4px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#c0392b', fontSize: '15px' }}>🗑️ Registrar pérdida / merma</h3>
              <button onClick={() => setModalMerma(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Materia Prima *</label>
              <select value={mermaForm.mp_id} onChange={e => setMermaForm({ ...mermaForm, mp_id: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px' }}>
                <option value="">Selecciona...</option>
                {inventario.filter(m => m.stock_kg > 0).map(m => (
                  <option key={m.id} value={m.id}>{m.nombre_producto || m.nombre} ({m.stock_kg.toFixed(1)} kg en stock)</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Kg perdidos *</label>
              <input type="number" value={mermaForm.kg} onChange={e => setMermaForm({ ...mermaForm, kg: e.target.value })}
                onFocus={e => e.preventDefault()} placeholder="Ej: 12" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e74c3c', fontSize: '14px', fontWeight: 'bold', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Motivo *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {['Producto en mal estado', 'Derrame accidental', 'Corte de luz / refrigeración', 'Vencimiento', 'Otro'].map(m => (
                  <button key={m} onClick={() => setMermaForm({ ...mermaForm, motivo: m })}
                    style={{ padding: '5px 10px', border: mermaForm.motivo === m ? '2px solid #e74c3c' : '1px solid #ddd', borderRadius: '6px', background: mermaForm.motivo === m ? '#fde8e8' : 'white', cursor: 'pointer', fontSize: '12px', color: mermaForm.motivo === m ? '#c0392b' : '#555' }}>
                    {m}
                  </button>
                ))}
              </div>
              <input value={mermaForm.motivo} onChange={e => setMermaForm({ ...mermaForm, motivo: e.target.value })}
                placeholder="O escribe el motivo..." style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
            {mermaForm.mp_id && mermaForm.kg && (
              <div style={{ background: '#fde8e8', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#721c24', marginBottom: '14px' }}>
                Costo perdido estimado: <strong>${(parseFloat(mermaForm.kg) * parseFloat(inventario.find(m => m.id === mermaForm.mp_id)?.precio_kg || 0)).toFixed(2)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalMerma(false)} style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarMerma} disabled={guardando}
                style={{ padding: '10px 22px', background: '#c0392b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : '🗑️ Registrar pérdida'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cámara IA */}
      {modalCamara && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000, overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '14px', width: mobile ? '100%' : '600px', maxHeight: mobile ? '92vh' : '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ background: '#8e44ad', padding: '14px 18px', borderRadius: mobile ? '16px 16px 0 0' : '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>📷 Escaneo IA — {analizandoIA ? 'Analizando...' : `${resultadosIA.length} productos detectados`}</div>
              <button onClick={() => { setModalCamara(false); setResultadosIA([]); setImagenBase64(null); }}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '16px', cursor: 'pointer', borderRadius: '6px', padding: '4px 10px' }}>✕</button>
            </div>

            {analizandoIA ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '16px' }}>
                <div style={{ fontSize: '48px' }}>🤖</div>
                <div style={{ fontWeight: 'bold', color: '#8e44ad', fontSize: '16px' }}>Analizando imagen con IA...</div>
                <div style={{ color: '#888', fontSize: '13px', textAlign: 'center' }}>Claude Vision está leyendo los productos y precios de la factura</div>
                {imagenBase64 && <img src={imagenBase64} alt="preview" style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '8px', objectFit: 'cover', opacity: 0.6 }} />}
              </div>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, padding: '14px' }}>
                {resultadosIA.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>😔</div>
                    No se detectaron productos. Intenta con una imagen más clara.
                  </div>
                )}
                {resultadosIA.map((r, i) => (
                  <div key={i} style={{ border: `2px solid ${r.accion === 'mismo' ? '#27ae60' : r.accion === 'nuevo' ? '#e74c3c' : '#f39c12'}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '10px', background: r.accion === 'mismo' ? '#f9fff9' : r.accion === 'nuevo' ? '#fff8f8' : '#fffbf0', opacity: r.incluir ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ background: r.accion === 'mismo' ? '#d4edda' : r.accion === 'nuevo' ? '#f8d7da' : '#fff3cd', color: r.accion === 'mismo' ? '#155724' : r.accion === 'nuevo' ? '#721c24' : '#856404', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700' }}>
                          {r.accion === 'mismo' ? '✓ ENCONTRADO' : r.accion === 'nuevo' ? '⚠ NUEVO' : '✏️ RENOMBRAR'}
                        </span>
                        <span style={{ fontSize: '11px', color: '#aaa' }}>Confianza: {r.confianza}</span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px', color: '#555' }}>
                        <input type="checkbox" checked={r.incluir} onChange={e => {
                          const nuevo = [...resultadosIA];
                          nuevo[i] = { ...nuevo[i], incluir: e.target.checked };
                          setResultadosIA(nuevo);
                        }} />
                        Incluir
                      </label>
                    </div>

                    {r.match && r.accion !== 'nuevo' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center', background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px', fontSize: '12px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: '#888', fontWeight: '700' }}>EN LA FACTURA:</div>
                          <div style={{ fontWeight: '500', color: '#856404' }}>{r.nombre}</div>
                        </div>
                        <div style={{ fontSize: '18px', color: '#aaa' }}>≈</div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#888', fontWeight: '700' }}>EN TU SISTEMA:</div>
                          <div style={{ fontWeight: '500', color: '#1a5276' }}>{r.match.nombre_producto || r.match.nombre}</div>
                        </div>
                      </div>
                    )}

                    {/* Opciones si nombre diferente */}
                    {r.match && r.nombre.toLowerCase() !== (r.match.nombre_producto || r.match.nombre).toLowerCase() && (
                      <div style={{ marginBottom: '8px' }}>
                        {[
                          { val: 'mismo', label: `Sí, es el mismo — agregar a "${r.match.nombre_producto || r.match.nombre}"` },
                          { val: 'nuevo', label: 'No, es diferente — crear como nueva materia prima' },
                          { val: 'renombrar', label: `Renombrar a "${r.nombre}" en todo el sistema` }
                        ].map(op => (
                          <label key={op.val} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', background: r.accion === op.val ? '#f8f9fa' : 'white', border: `1.5px solid ${r.accion === op.val ? '#3498db' : '#eee'}`, borderRadius: '7px', padding: '7px 10px', marginBottom: '5px', fontSize: '12px' }}>
                            <input type="radio" name={`accion-${i}`} value={op.val} checked={r.accion === op.val}
                              onChange={() => {
                                const nuevo = [...resultadosIA];
                                nuevo[i] = { ...nuevo[i], accion: op.val };
                                setResultadosIA(nuevo);
                              }} style={{ marginTop: '2px', flexShrink: 0 }} />
                            <span>{op.label}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#888', fontWeight: '700', marginBottom: '3px' }}>KG A INGRESAR</div>
                        <input type="number" value={r.cantidad_editada || ''} placeholder="0"
                          onChange={e => {
                            const nuevo = [...resultadosIA];
                            nuevo[i] = { ...nuevo[i], cantidad_editada: e.target.value };
                            setResultadosIA(nuevo);
                          }}
                          onFocus={e => e.preventDefault()}
                          style={{ width: '100%', padding: '7px', border: '1.5px solid #27ae60', borderRadius: '7px', fontSize: '14px', fontWeight: '500', textAlign: 'center', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#888', fontWeight: '700', marginBottom: '3px' }}>PRECIO/KG</div>
                        <input type="number" value={r.precio_editado || ''} placeholder="0.00"
                          onChange={e => {
                            const nuevo = [...resultadosIA];
                            nuevo[i] = { ...nuevo[i], precio_editado: e.target.value };
                            setResultadosIA(nuevo);
                          }}
                          onFocus={e => e.preventDefault()}
                          style={{ width: '100%', padding: '7px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '14px', textAlign: 'center', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!analizandoIA && resultadosIA.length > 0 && (
              <div style={{ padding: '12px 14px', borderTop: '1px solid #eee', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setModalCamara(false); setResultadosIA([]); setImagenBase64(null); }}
                  style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  Cancelar
                </button>
                <button onClick={confirmarResultadosIA} disabled={guardando}
                  style={{ padding: '10px 24px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                  {guardando ? 'Guardando...' : `✅ Confirmar entrada (${resultadosIA.filter(r => r.incluir).length} productos)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
        {modalNota && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '12px', width: mobile ? '100%' : '480px', padding: '20px', boxShadow: '0 -4px 30px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#1a1a2e', fontSize: '15px' }}>✉️ Enviar nota al Administrador</h3>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Módulo: <strong>Inventario</strong></div>
            <textarea value={textoNota} onChange={e => setTextoNota(e.target.value)}
              placeholder="Ej: Llegó nueva mercadería sin registrar, falta revisar la pechuga..."
              rows={4}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e67e22', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Arial' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
              <button onClick={enviarNota} disabled={enviandoNota || !textoNota.trim()}
                style={{ padding: '10px 20px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {enviandoNota ? 'Enviando...' : '✉️ Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

// ── Componente StockInput — editable inline ────────────────
function StockInput({ mp, onSave, disabled }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(mp.stock_kg.toString());

  useEffect(() => { setValor(mp.stock_kg.toString()); }, [mp.stock_kg]);

  if (disabled || !editando) {
    return (
      <div onClick={() => !disabled && setEditando(true)}
        style={{ fontWeight: 'bold', fontSize: '14px', color: mp.stock_kg === 0 ? '#e74c3c' : '#1a1a2e', cursor: disabled ? 'default' : 'pointer', padding: '2px 6px', borderRadius: '5px', background: !disabled ? '#f8f9fa' : 'transparent', display: 'inline-block', minWidth: '60px', textAlign: 'center' }}
        title={disabled ? '' : 'Click para editar stock inicial'}>
        {mp.stock_kg.toFixed(1)} kg
        {!disabled && <span style={{ fontSize: '9px', color: '#aaa', marginLeft: '3px' }}>✏️</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
      <input
        type="number"
        value={valor}
        onChange={e => setValor(e.target.value)}
        onFocus={e => e.preventDefault()}
        autoFocus
        style={{ width: '70px', padding: '4px 6px', border: '2px solid #27ae60', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(mp, valor); setEditando(false); }
          if (e.key === 'Escape') setEditando(false);
        }}
        onBlur={() => { onSave(mp, valor); setEditando(false); }}
      />
    </div>
  );
}

export default Inventario;