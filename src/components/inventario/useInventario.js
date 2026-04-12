// ============================================
// useInventario.js
// Hook con todo el estado y lógica
// ============================================
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { crearNotificacion, registrarAuditoria } from '../../utils/helpers';

export function useInventario({ userRol, currentUser }) {

  // ── Estado ────────────────────────────────────────────────
  const [inventario,     setInventario]     = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [msgExito,       setMsgExito]       = useState('');
  const [buscar,         setBuscar]         = useState('');
  const [catFiltro,      setCatFiltro]      = useState('TODAS');
  const [estadoFiltro,   setEstadoFiltro]   = useState('TODOS');
  const [categorias,     setCategorias]     = useState([]);
  const [tab,            setTab]            = useState('stock');
  const [mermas,         setMermas]         = useState([]);
  const [movimientos,    setMovimientos]    = useState([]);
  const mobile = window.innerWidth < 700;

  // ── Modales ───────────────────────────────────────────────
  const [modalNota,    setModalNota]    = useState(false);
  const [textoNota,    setTextoNota]    = useState('');
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [modalEntrada, setModalEntrada] = useState(null);
  const [modalMerma,   setModalMerma]   = useState(false);
  const [modalMinimo,  setModalMinimo]  = useState(null);
  const [modalCamara,  setModalCamara]  = useState(false);

  // ── IA / Cámara ───────────────────────────────────────────
  const [resultadosIA,  setResultadosIA]  = useState([]);
  const [analizandoIA,  setAnalizandoIA]  = useState(false);
  const [imagenBase64,  setImagenBase64]  = useState(null);

  // ── Formularios ───────────────────────────────────────────
  const [entradaKg,    setEntradaKg]    = useState('');
  const [entradaPrecio,setEntradaPrecio]= useState('');
  const [entradaNota,  setEntradaNota]  = useState('');
  const [mermaForm,    setMermaForm]    = useState({ mp_id:'', nombre:'', kg:'', motivo:'' });
  const [minimoKg,     setMinimoKg]     = useState('');
  const [guardando,    setGuardando]    = useState(false);

  const fileRef    = useRef();
  const fileRefPDF = useRef();
  
  // ── Helpers ───────────────────────────────────────────────
  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 4000);
  }

  const esAdmin     = userRol?.rol === 'admin';
  const esBodeguero = userRol?.rol === 'bodeguero';
  const puedeEditar = esAdmin || esBodeguero;

  // ── Estado stock ──────────────────────────────────────────
  function getEstadoStock(stock, minimo) {
    if (minimo === 0)            return 'SIN_MIN';
    if (stock === 0)             return 'CRITICO';
    if (stock <= minimo * 0.5)   return 'CRITICO';
    if (stock <= minimo)         return 'BAJO';
    return 'OK';
  }

  function badgeStock(estado) {
    if (estado === 'OK')      return { bg:'#d4edda', color:'#155724', txt:'OK'      };
    if (estado === 'BAJO')    return { bg:'#fff3cd', color:'#856404', txt:'BAJO'    };
    if (estado === 'CRITICO') return { bg:'#f8d7da', color:'#721c24', txt:'CRÍTICO' };
    return                           { bg:'#f0f0f0', color:'#888',    txt:'SIN MÍN' };
  }

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => { cargarTodo(); }, []);

  async function cargarTodo() {
    setLoading(true);
    const { data: mps }       = await supabase.from('materias_primas').select('*')
      .order('categoria').order('nombre');
    const { data: inv }       = await supabase.from('inventario_mp').select('*');
    const { data: mermasData }= await supabase.from('mermas').select('*')
      .order('created_at', { ascending:false }).limit(50);
    const { data: movData }   = await supabase.from('inventario_movimientos').select('*')
      .order('created_at', { ascending:false }).limit(100);

    const mpList  = mps || [];
    const invList = inv || [];

    const mpsSinInventario = mpList.filter(mp => !invList.find(i => i.materia_prima_id === mp.id));
    if (mpsSinInventario.length > 0) {
      const nuevos = mpsSinInventario.map(mp => ({
        materia_prima_id: mp.id,
        nombre:           mp.nombre_producto || mp.nombre,
        stock_kg:         0,
        stock_minimo_kg:  0
      }));
      await supabase.from('inventario_mp').insert(nuevos);
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

  function combinarDatos(mps, inv) {
    const combinado = mps.map(mp => {
      const reg = inv.find(i => i.materia_prima_id === mp.id);
      return {
        ...mp,
        inv_id:         reg?.id,
        stock_kg:       parseFloat(reg?.stock_kg       || 0),
        stock_minimo_kg:parseFloat(reg?.stock_minimo_kg|| 0),
        estado_stock:   getEstadoStock(
          parseFloat(reg?.stock_kg        || 0),
          parseFloat(reg?.stock_minimo_kg || 0)
        )
      };
    });
    setInventario(combinado);
    setMateriasPrimas(mps);
  }

  // ── Alerta stock ──────────────────────────────────────────
  async function verificarAlertaStock(inv, stockActual) {
    const minimo = inv.stock_minimo_kg;
    if (minimo === 0) return;
    if (stockActual <= minimo) {
      const nivel = stockActual <= minimo * 0.5 ? 'CRÍTICO' : 'BAJO';
      await crearNotificacion({
        tipo:'stock_bajo', origen:'inventario',
        usuario_nombre:'Sistema', user_id:null,
        producto_nombre: inv.nombre_producto || inv.nombre,
        mensaje:`⚠️ Stock ${nivel}: ${inv.nombre_producto || inv.nombre} — ${stockActual.toFixed(1)}kg (mínimo: ${minimo}kg)`
      });
    }
  }

  // ── Nota al admin ─────────────────────────────────────────
  async function enviarNota() {
    if (!textoNota.trim()) return;
    setEnviandoNota(true);
    try {
      await crearNotificacion({
        tipo:'nota_produccion', origen:'inventario',
        usuario_nombre: userRol?.nombre || 'Bodeguero',
        user_id: currentUser?.id,
        producto_nombre: null,
        mensaje: textoNota.trim()
      });
      setModalNota(false); setTextoNota('');
      mostrarExito('✅ Nota enviada al administrador');
    } catch(e) { alert('Error al enviar nota'); }
    setEnviandoNota(false);
  }

  // ── Entrada manual ────────────────────────────────────────
  async function guardarEntrada() {
    if (!modalEntrada || !entradaKg || parseFloat(entradaKg) <= 0) return;
    setGuardando(true);
    const { inv } = modalEntrada;
    const kg      = parseFloat(entradaKg);
    const precio  = parseFloat(entradaPrecio) || 0;

    // Verificar duplicado
    if (precio > 0) {
      const hace7dias = new Date(Date.now() - 7*24*60*60*1000)
        .toISOString().split('T')[0];
      const { data: movRecientes } = await supabase
        .from('inventario_movimientos').select('id, fecha, kg, precio_kg_nuevo')
        .eq('materia_prima_id', inv.id).eq('tipo','entrada')
        .gte('fecha', hace7dias)
        .order('fecha', { ascending:false }).limit(5);

      const duplicado = movRecientes?.find(m =>
        parseFloat(m.precio_kg_nuevo) === precio
      );
      if (duplicado) {
        const continuar = window.confirm(
          `⚠️ Ya existe una entrada de "${inv.nombre_producto || inv.nombre}" ` +
          `con precio $${precio.toFixed(2)}/kg registrada el ${duplicado.fecha} ` +
          `(+${parseFloat(duplicado.kg).toFixed(1)}kg).\n\n` +
          `• OK = Guardar de todas formas\n• Cancelar = No guardar`
        );
        if (!continuar) { setGuardando(false); return; }
      }
    }

    const nuevoStock = inv.stock_kg + kg;
    await supabase.from('inventario_mp')
      .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
      .eq('id', inv.inv_id);

    await supabase.from('inventario_movimientos').insert([{
      materia_prima_id:  inv.id,
      nombre_mp:         inv.nombre_producto || inv.nombre,
      tipo:              'entrada',
      kg,
      precio_kg_nuevo:   precio || null,
      precio_kg_anterior:parseFloat(inv.precio_kg) || null,
      motivo:            entradaNota || 'Entrada manual',
      usuario_nombre:    userRol?.nombre || 'Bodeguero',
      user_id:           currentUser?.id,
      via:               'manual',
      fecha:             new Date().toISOString().split('T')[0]
    }]);

    if (precio > 0 && precio !== parseFloat(inv.precio_kg)) {
      await supabase.from('materias_primas')
        .update({ precio_kg: precio }).eq('id', inv.id);
      await crearNotificacion({
        tipo:'cambio_precio', origen:'inventario',
        usuario_nombre: userRol?.nombre || 'Bodeguero',
        user_id: currentUser?.id,
        producto_nombre: inv.nombre_producto || inv.nombre,
        mensaje:`Entrada de inventario: "${inv.nombre_producto || inv.nombre}" +${kg}kg · precio actualizado $${parseFloat(inv.precio_kg).toFixed(2)} → $${precio.toFixed(2)}/kg`
      });
    } else {
      await registrarAuditoria({
        tipo:'entrada_inventario',
        usuario_nombre: userRol?.nombre || 'Bodeguero',
        user_id: currentUser?.id,
        producto_nombre: inv.nombre_producto || inv.nombre,
        campo_modificado:'stock_kg',
        valor_antes:  inv.stock_kg.toString(),
        valor_despues:nuevoStock.toString(),
        mensaje:`Entrada manual: +${kg}kg · ${entradaNota || ''}`
      });
    }

    await verificarAlertaStock(inv, nuevoStock);
    setModalEntrada(null);
    setEntradaKg(''); setEntradaPrecio(''); setEntradaNota('');
    setGuardando(false);
    mostrarExito(`✅ +${kg}kg agregados a ${inv.nombre_producto || inv.nombre}`);
    await cargarTodo();
  }

  // ── Stock inicial ─────────────────────────────────────────
  async function guardarStockInicial(inv, nuevoValor) {
    const kg = parseFloat(nuevoValor);
    if (isNaN(kg) || kg < 0) return;
    await supabase.from('inventario_mp')
      .update({ stock_kg: kg, updated_at: new Date().toISOString() })
      .eq('id', inv.inv_id);
    await registrarAuditoria({
      tipo:'ajuste_inventario',
      usuario_nombre: userRol?.nombre || 'Admin',
      user_id: currentUser?.id,
      producto_nombre: inv.nombre_producto || inv.nombre,
      campo_modificado:'stock_kg',
      valor_antes:  inv.stock_kg.toString(),
      valor_despues:kg.toString(),
      mensaje:'Ajuste de stock inicial'
    });
    await cargarTodo();
    mostrarExito('✅ Stock actualizado');
  }

  // ── Stock mínimo ──────────────────────────────────────────
  async function guardarMinimo() {
    if (!modalMinimo) return;
    const kg = parseFloat(minimoKg) || 0;
    await supabase.from('inventario_mp')
      .update({ stock_minimo_kg: kg }).eq('id', modalMinimo.inv_id);
    setModalMinimo(null); setMinimoKg('');
    mostrarExito('✅ Stock mínimo actualizado');
    await cargarTodo();
  }

  // ── Merma ─────────────────────────────────────────────────
  async function guardarMerma() {
    if (!mermaForm.mp_id || !mermaForm.kg || !mermaForm.motivo)
      return alert('Completa todos los campos');
    setGuardando(true);
    const mp  = inventario.find(m => m.id === mermaForm.mp_id);
    if (!mp) return;
    const kg          = parseFloat(mermaForm.kg);
    const nuevoStock  = Math.max(0, mp.stock_kg - kg);
    const costoPerdido= kg * (parseFloat(mp.precio_kg) || 0);

    await supabase.from('inventario_mp')
      .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
      .eq('id', mp.inv_id);

    await supabase.from('mermas').insert([{
      fecha:             new Date().toISOString().split('T')[0],
      materia_prima_id:  mp.id,
      nombre_mp:         mp.nombre_producto || mp.nombre,
      kg_perdidos:       kg,
      costo_perdido:     costoPerdido,
      motivo:            mermaForm.motivo,
      usuario_nombre:    userRol?.nombre || 'Bodeguero',
      user_id:           currentUser?.id
    }]);

    await supabase.from('inventario_movimientos').insert([{
      materia_prima_id: mp.id,
      nombre_mp:        mp.nombre_producto || mp.nombre,
      tipo:             'perdida',
      kg:               -kg,
      motivo:           mermaForm.motivo,
      usuario_nombre:   userRol?.nombre || 'Bodeguero',
      user_id:          currentUser?.id,
      via:              'manual',
      fecha:            new Date().toISOString().split('T')[0]
    }]);

    await crearNotificacion({
      tipo:'perdida', origen:'inventario',
      usuario_nombre: userRol?.nombre || 'Bodeguero',
      user_id: currentUser?.id,
      producto_nombre: mp.nombre_producto || mp.nombre,
      mensaje:`Pérdida registrada: "${mp.nombre_producto || mp.nombre}" -${kg}kg · Motivo: ${mermaForm.motivo} · Costo: $${costoPerdido.toFixed(2)}`
    });

    setModalMerma(false);
    setMermaForm({ mp_id:'', nombre:'', kg:'', motivo:'' });
    setGuardando(false);
    mostrarExito(`🗑️ Pérdida de ${kg}kg registrada`);
    await cargarTodo();
  }

  // ── Cámara / IA ───────────────────────────────────────────
  function abrirCamara() { fileRef.current.click(); }

  function buscarMPSimilar(nombre, mps) {
    const norm = s => (s||'').toLowerCase().trim()
      .replace(/[áà]/g,'a').replace(/[éè]/g,'e')
      .replace(/[íì]/g,'i').replace(/[óò]/g,'o')
      .replace(/[úù]/g,'u').replace(/ñ/g,'n')
      .replace(/\s+/g,' ').replace(/[\/\-\.]/g,'')
      .replace(/[()]/g,'').trim();
    const n = norm(nombre);
    return mps.find(m =>
      norm(m.nombre_producto) === n || norm(m.nombre) === n ||
      (norm(m.nombre_producto).length > 4 && (
        n.includes(norm(m.nombre_producto)) ||
        norm(m.nombre_producto).includes(n)
      )) ||
      (norm(m.nombre).length > 4 && (
        n.includes(norm(m.nombre)) ||
        norm(m.nombre).includes(n)
      ))
    ) || null;
  }

      // ── Conversión de unidades a KG ───────────────────────────
  function convertirAKg(cantidad, unidad) {
    if (!cantidad || !unidad) return { kg: cantidad || 0, necesitaConversion: false };
    const u = unidad.toLowerCase().trim();
    const c = parseFloat(cantidad) || 0;

    if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u))
      return { kg: c, necesitaConversion: false, factor: 1 };
    if (['g', 'gr', 'gramo', 'gramos', 'gram'].includes(u))
      return { kg: c / 1000, necesitaConversion: true, factor: 1/1000,
              label: `${c} gr = ${(c/1000).toFixed(4)} kg` };
    if (['lb', 'lbs', 'libra', 'libras', 'pound', 'pounds'].includes(u))
      return { kg: c / 2.20462, necesitaConversion: true, factor: 1/2.20462,
              label: `${c} lb = ${(c/2.20462).toFixed(3)} kg` };
    if (['oz', 'onza', 'onzas', 'ounce'].includes(u))
      return { kg: c / 35.274, necesitaConversion: true, factor: 1/35.274,
              label: `${c} oz = ${(c/35.274).toFixed(4)} kg` };
    if (['t', 'ton', 'tonelada', 'toneladas'].includes(u))
      return { kg: c * 1000, necesitaConversion: true, factor: 1000,
              label: `${c} t = ${(c*1000).toFixed(2)} kg` };

    // Unidad no convertible (litros, metros, unidades, etc.)
    return { kg: c, necesitaConversion: false, esOtraUnidad: true };
  }

  // ── Opciones de unidad para selector ─────────────────────
  function getOpcionesUnidad(unidadOriginal, cantidadOriginal) {
    const c = parseFloat(cantidadOriginal) || 0;
    const u = (unidadOriginal || '').toLowerCase().trim();
    const opciones = [];

    // Siempre ofrece KG como opción principal
    if (['lb','lbs','libra','libras'].includes(u))
      opciones.push({ val:'kg', label:`KG = ${(c/2.20462).toFixed(3)} kg`, recomendado:true  });
    else if (['g','gr','gramo','gramos'].includes(u))
      opciones.push({ val:'kg', label:`KG = ${(c/1000).toFixed(4)} kg`,   recomendado:true  });
    else if (['oz','onza','onzas'].includes(u))
      opciones.push({ val:'kg', label:`KG = ${(c/35.274).toFixed(4)} kg`, recomendado:true  });
    else if (['t','ton','tonelada','toneladas'].includes(u))
      opciones.push({ val:'kg', label:`KG = ${(c*1000).toFixed(2)} kg`,   recomendado:true  });
    else
      opciones.push({ val:'kg', label:`KG = ${c} kg`, recomendado:true });

    // Opción: dejar en unidad original
    if (!['kg','kilo','kilos'].includes(u))
      opciones.push({ val:unidadOriginal, label:`${unidadOriginal?.toUpperCase()} = ${c} ${unidadOriginal}`, recomendado:false });

    // Opción GR si viene en libras
    if (['lb','lbs','libra','libras'].includes(u))
      opciones.push({ val:'gr', label:`GR = ${(c/2.20462*1000).toFixed(1)} gr`, recomendado:false });

    return opciones;
  }


async function procesarImagen(e) {
  const file = e.target.files[0];
  if (!file) return;
  setAnalizandoIA(true); setModalCamara(true); setResultadosIA([]);

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const img = new Image();
      img.src = ev.target.result;
      await new Promise(r => img.onload = r);
      const canvas = document.createElement('canvas');
      const MAX    = 1200;
      const ratio  = Math.min(MAX/img.width, MAX/img.height, 1);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const comprimida = canvas.toDataURL('image/jpeg', 0.7);
      const base64     = comprimida.split(',')[1];
      setImagenBase64(comprimida);

      const response = await fetch('/api/analyze-image', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType:'image/jpeg' })
      });
      const data    = await response.json();
      const texto   = data.content?.[0]?.text || '{"productos":[]}';
      const parsed  = JSON.parse(texto);
      const productosIA = parsed.productos || [];

      const resultados = productosIA.map(p => {
        const match           = buscarMPSimilar(p.nombre, materiasPrimas);
        const unidadOriginal  = p.unidad_original || 'kg';
        const cantidadOrig    = p.cantidad || 0;
        const conversion      = convertirAKg(cantidadOrig, unidadOriginal);
        const opcionesUnidad  = getOpcionesUnidad(unidadOriginal, cantidadOrig);
        const unidadSeleccionada = conversion.necesitaConversion ? 'kg' : unidadOriginal;

        return {
          ...p,
          match,
          accion:              match ? 'mismo' : 'nuevo',
          nombre_editado:      p.nombre,
          precio_editado:      p.precio_unitario,
          cantidad_original:   cantidadOrig,
          unidad_original:     unidadOriginal,
          unidad_seleccionada: unidadSeleccionada,
          cantidad_editada:    conversion.necesitaConversion
                                 ? conversion.kg.toFixed(3)
                                 : cantidadOrig,
          conversion,
          opciones_unidad:     opcionesUnidad,
          incluir:             true,
          vincular_a:          ''
        };
      });
      setResultadosIA(resultados);
    } catch(err) {
      alert('Error al analizar imagen: ' + err.message);
      setModalCamara(false);
    }
    setAnalizandoIA(false);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

async function procesarPDF(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf') {
    alert('Solo se aceptan archivos PDF');
    return;
  }
  setAnalizandoIA(true); setModalCamara(true); setResultadosIA([]);
  setImagenBase64(null);

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const base64 = ev.target.result.split(',')[1];

      const response = await fetch('/api/analyze-image', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ pdfBase64: base64, esPDF: true })
      });
      const data    = await response.json();
      const texto   = data.content?.[0]?.text || '{"productos":[]}';
      const parsed  = JSON.parse(texto);
      const productosIA = parsed.productos || [];

      const resultados = productosIA.map(p => {
        const match           = buscarMPSimilar(p.nombre, materiasPrimas);
        const unidadOriginal  = p.unidad_original || 'kg';
        const cantidadOrig    = p.cantidad || 0;
        const conversion      = convertirAKg(cantidadOrig, unidadOriginal);
        const opcionesUnidad  = getOpcionesUnidad(unidadOriginal, cantidadOrig);
        const unidadSeleccionada = conversion.necesitaConversion ? 'kg' : unidadOriginal;

        return {
          ...p,
          match,
          accion:              match ? 'mismo' : 'nuevo',
          nombre_editado:      p.nombre,
          precio_editado:      p.precio_unitario,
          cantidad_original:   cantidadOrig,
          unidad_original:     unidadOriginal,
          unidad_seleccionada: unidadSeleccionada,
          cantidad_editada:    conversion.necesitaConversion
                                 ? conversion.kg.toFixed(3)
                                 : cantidadOrig,
          conversion,
          opciones_unidad:     opcionesUnidad,
          incluir:             true,
          vincular_a:          ''
        };
      });
      setResultadosIA(resultados);
    } catch(err) {
      alert('Error al analizar PDF: ' + err.message);
      setModalCamara(false);
    }
    setAnalizandoIA(false);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

  function actualizarNombreIA(i, nuevoNombre) {
    const nuevo = [...resultadosIA];
    const match = buscarMPSimilar(nuevoNombre, materiasPrimas);
    nuevo[i]    = {
      ...nuevo[i], nombre_editado: nuevoNombre,
      match, accion: match ? 'mismo' : 'nuevo', vincular_a:''
    };
    setResultadosIA(nuevo);
  }

  function getPrecioSistema(r) {
    if (r.match) return parseFloat(r.match.precio_kg) || 0;
    if (r.vincular_a) {
      const mp = materiasPrimas.find(m => m.id === r.vincular_a);
      return mp ? parseFloat(mp.precio_kg) || 0 : 0;
    }
    return 0;
  }

  async function confirmarResultadosIA() {
    setGuardando(true);
    const resIncluidos = resultadosIA.filter(r => r.incluir);

    for (const r of resIncluidos) {
      const precioSistema = getPrecioSistema(r);
      const precio = (r.precio_editado !== '' && r.precio_editado !== null && r.precio_editado !== undefined)
        ? parseFloat(r.precio_editado) || 0
        : precioSistema;
      const kg = parseFloat(r.cantidad_editada) || 0;

      if (precio === 0) {
        await crearNotificacion({
          tipo:'precio_cero', origen:'inventario_camara',
          usuario_nombre: userRol?.nombre || 'Bodeguero',
          user_id: currentUser?.id,
          producto_nombre: r.nombre_editado,
          mensaje:`⚠️ "${r.nombre_editado}" fue registrado sin precio ($0). Revisa en Materias Primas.`
        });
      }

      if (r.accion === 'mismo' && r.match) {
        const invItem = inventario.find(i => i.id === r.match.id);
        if (invItem && kg > 0) {
          const nuevoStock = invItem.stock_kg + kg;
          await supabase.from('inventario_mp')
            .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
            .eq('id', invItem.inv_id);
          await supabase.from('inventario_movimientos').insert([{
            materia_prima_id:  r.match.id,
            nombre_mp:         invItem.nombre_producto || invItem.nombre,
            tipo:              'entrada', kg,
            precio_kg_nuevo:   precio || null,
            precio_kg_anterior:parseFloat(r.match.precio_kg) || null,
            motivo:            'Entrada por escaneo IA',
            usuario_nombre:    userRol?.nombre || 'Bodeguero',
            user_id:           currentUser?.id,
            via:               'camara',
            fecha:             new Date().toISOString().split('T')[0]
          }]);
        }
        if (precio > 0 && precio !== parseFloat(r.match.precio_kg))
          await supabase.from('materias_primas').update({ precio_kg: precio }).eq('id', r.match.id);

        await crearNotificacion({
          tipo:'entrada_inventario', origen:'inventario_camara',
          usuario_nombre: userRol?.nombre || 'Bodeguero',
          user_id: currentUser?.id,
          producto_nombre: r.match.nombre_producto || r.match.nombre,
          mensaje:`Escaneo IA: "${r.match.nombre_producto || r.match.nombre}" +${kg}kg${precio > 0 ? ` · precio $${precio.toFixed(2)}/kg` : ''}`
        });

      } else if (r.accion === 'renombrar' && r.match) {
        const nombreViejo = r.match.nombre_producto;
        await supabase.from('materias_primas')
          .update({ nombre_producto: r.nombre_editado }).eq('id', r.match.id);
        await supabase.from('formulaciones')
          .update({ ingrediente_nombre: r.nombre_editado }).eq('ingrediente_nombre', nombreViejo);
        await supabase.from('inventario_mp')
          .update({ nombre: r.nombre_editado }).eq('materia_prima_id', r.match.id);
        if (kg > 0) {
          const invItem = inventario.find(i => i.id === r.match.id);
          if (invItem) await supabase.from('inventario_mp')
            .update({ stock_kg: invItem.stock_kg + kg }).eq('id', invItem.inv_id);
        }
        await crearNotificacion({
          tipo:'cambio_nombre', origen:'inventario_camara',
          usuario_nombre: userRol?.nombre || 'Bodeguero',
          user_id: currentUser?.id,
          producto_nombre: r.nombre_editado,
          mensaje:`Renombrado vía escaneo: "${nombreViejo}" → "${r.nombre_editado}"${kg > 0 ? ` · +${kg}kg` : ''}`
        });

      } else if (r.accion === 'nuevo') {
        if (r.vincular_a) {
          const mpExistente = materiasPrimas.find(m => m.id === r.vincular_a);
          if (mpExistente) {
            const invItem = inventario.find(i => i.id === mpExistente.id);
            if (invItem && kg > 0) {
              await supabase.from('inventario_mp')
                .update({ stock_kg: invItem.stock_kg + kg, updated_at: new Date().toISOString() })
                .eq('id', invItem.inv_id);
              await supabase.from('inventario_movimientos').insert([{
                materia_prima_id: mpExistente.id,
                nombre_mp:        mpExistente.nombre_producto || mpExistente.nombre,
                tipo:             'entrada', kg,
                precio_kg_nuevo:  precio || null,
                motivo:           'Entrada por escaneo IA (vinculado)',
                usuario_nombre:   userRol?.nombre || 'Bodeguero',
                user_id:          currentUser?.id,
                via:              'camara',
                fecha:            new Date().toISOString().split('T')[0]
              }]);
            }
            if (precio > 0 && precio !== parseFloat(mpExistente.precio_kg))
              await supabase.from('materias_primas').update({ precio_kg: precio }).eq('id', mpExistente.id);
            await crearNotificacion({
              tipo:'entrada_inventario', origen:'inventario_camara',
              usuario_nombre: userRol?.nombre || 'Bodeguero',
              user_id: currentUser?.id,
              producto_nombre: mpExistente.nombre_producto || mpExistente.nombre,
              mensaje:`Escaneo IA vinculado: "${r.nombre_editado}" → "${mpExistente.nombre_producto || mpExistente.nombre}" +${kg}kg`
            });
          }
        } else {
          const nuevaMP = {
            id:             'MP' + Date.now().toString().slice(-6),
            categoria:      'SIN CATEGORÍA',
            nombre:         r.nombre_editado,
            nombre_producto:r.nombre_editado,
            precio_kg:      precio || 0,
            precio_lb:      precio > 0 ? precio/2.20462 : 0,
            precio_gr:      precio > 0 ? precio/1000    : 0,
            estado:         'ACTIVO',
            tipo:           'MATERIAS PRIMAS'
          };
          await supabase.from('materias_primas').insert([nuevaMP]);
          await supabase.from('inventario_mp').insert([{
            materia_prima_id: nuevaMP.id,
            nombre:           r.nombre_editado,
            stock_kg:         kg || 0,
            stock_minimo_kg:  0
          }]);
          await crearNotificacion({
            tipo:'nueva_mp', origen:'inventario_camara',
            usuario_nombre: userRol?.nombre || 'Bodeguero',
            user_id: currentUser?.id,
            producto_nombre: r.nombre_editado,
            mensaje:`Nueva MP creada vía escaneo: "${r.nombre_editado}"${precio > 0 ? ` · $${precio.toFixed(2)}/kg` : ' · sin precio'}${kg > 0 ? ` · ${kg}kg` : ''}`
          });
        }
      }
    }

    setModalCamara(false); setResultadosIA([]); setImagenBase64(null);
    setGuardando(false);
    mostrarExito(`✅ Entrada confirmada — ${resIncluidos.length} producto(s) procesados`);
    await cargarTodo();
  }

  // ── Filtrado ──────────────────────────────────────────────
  const inventarioFiltrado = inventario.filter(m => {
    const b   = buscar.toLowerCase();
    const ok  = !buscar ||
      (m.nombre_producto || m.nombre)?.toLowerCase().includes(b) ||
      m.id?.toLowerCase().includes(b);
    const cat = catFiltro    === 'TODAS'  || m.categoria    === catFiltro;
    const est = estadoFiltro === 'TODOS'  ||
      (estadoFiltro === 'CRITICO' && m.estado_stock === 'CRITICO') ||
      (estadoFiltro === 'BAJO'    && m.estado_stock === 'BAJO')    ||
      (estadoFiltro === 'OK'      && m.estado_stock === 'OK');
    return ok && cat && est;
  });

  // ── Totales ───────────────────────────────────────────────
  const totalStock = inventario.reduce((s, m) => s + m.stock_kg, 0);
  const alertas    = inventario.filter(m =>
    m.estado_stock === 'CRITICO' || m.estado_stock === 'BAJO').length;
  const criticos   = inventario.filter(m => m.estado_stock === 'CRITICO').length;

  // ── Retorno ───────────────────────────────────────────────
  return {
    // Estado
    inventario, materiasPrimas, loading, msgExito,
    buscar, setBuscar, catFiltro, setCatFiltro,
    estadoFiltro, setEstadoFiltro, categorias,
    tab, setTab, mermas, movimientos, mobile,
    // Modales
    modalNota,    setModalNota,
    textoNota,    setTextoNota,    enviandoNota,
    modalEntrada, setModalEntrada,
    modalMerma,   setModalMerma,
    modalMinimo,  setModalMinimo,
    modalCamara,  setModalCamara,
    // IA
    resultadosIA, setResultadosIA,
    analizandoIA, imagenBase64,
    // Formularios
    entradaKg,    setEntradaKg,
    entradaPrecio,setEntradaPrecio,
    entradaNota,  setEntradaNota,
    mermaForm,    setMermaForm,
    minimoKg,     setMinimoKg,
    guardando,
    // Refs
    fileRef,
    fileRefPDF,
    // Helpers
    puedeEditar, esAdmin, esBodeguero,
    badgeStock, getPrecioSistema,
    totalStock, alertas, criticos,
    inventarioFiltrado,
    // Funciones
    cargarTodo, enviarNota,
    guardarEntrada, guardarStockInicial,
    guardarMinimo, guardarMerma,
    abrirCamara, procesarImagen, procesarPDF,
    actualizarNombreIA, confirmarResultadosIA,
  };
}