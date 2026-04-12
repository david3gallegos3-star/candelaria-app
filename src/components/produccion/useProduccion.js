// ============================================
// useProduccion.js
// Hook con todo el estado y lógica
// VERSIÓN MULTI-PRODUCTO
// ============================================
import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { crearNotificacion, registrarAuditoria } from '../../utils/helpers';

export function useProduccion({ userRol, currentUser }) {

  // ── Estado ────────────────────────────────────────────────
  const [productos,        setProductos]        = useState([]);
  const [produccionDiaria, setProduccionDiaria] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [guardando,        setGuardando]        = useState(false);
  const [msgExito,         setMsgExito]         = useState('');
  const [tab,              setTab]              = useState('registrar');
  const mobile = window.innerWidth < 700;

  // ── Multi-producto ────────────────────────────────────────
  // productosDelDia: [{ producto, formulacion, configProd, paradas, inventario }]
  const [productosDelDia,  setProductosDelDia]  = useState([]);
  const [productoSelIdx,   setProductoSelIdx]   = useState(null); // índice del que se muestra en detalle
  const [buscarProd,       setBuscarProd]       = useState('');
  const [prodSelAdd,       setProdSelAdd]       = useState('');  // id del select para agregar

  // ── Fecha ─────────────────────────────────────────────────
  const [fecha,        setFecha]        = useState(new Date().toISOString().split('T')[0]);

  // ── Inventario compartido ─────────────────────────────────
  const [inventario,   setInventario]   = useState([]);

  // ── Modales ───────────────────────────────────────────────
  const [modalNota,     setModalNota]     = useState(false);
  const [textoNota,     setTextoNota]     = useState('');
  const [modalRevertir, setModalRevertir] = useState(null);

  // ── Helpers ───────────────────────────────────────────────
  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 5000);
  }

  const esAdmin = userRol?.rol === 'admin';

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => { cargarTodo(); }, []);

  async function cargarTodo() {
    setLoading(true);
    const { data: prods } = await supabase
      .from('productos').select('*')
      .eq('estado', 'ACTIVO').order('nombre');
    const { data: prod } = await supabase
      .from('produccion_diaria').select('*')
      .eq('revertida', false)
      .order('created_at', { ascending: false }).limit(100);
    const { data: inv } = await supabase
      .from('inventario_mp')
      .select('*, materias_primas(id, nombre, nombre_producto, precio_kg)');
    setProductos(prods    || []);
    setProduccionDiaria(prod || []);
    setInventario(inv     || []);
    setLoading(false);
  }

  // ── Agregar producto al día ───────────────────────────────
  async function agregarProducto(productoId) {
    if (!productoId) return;
    const prod = productos.find(p => String(p.id) === String(productoId));
    if (!prod) return;

    // No agregar duplicado
    const yaExiste = productosDelDia.find(p => p.producto.id === productoId);
    if (yaExiste) {
      mostrarExito('Ese producto ya está en la lista');
      return;
    }

    const { data: form } = await supabase
      .from('formulaciones').select('*')
      .eq('producto_nombre', prod.nombre).order('orden');
    const { data: config } = await supabase
      .from('config_productos').select('*')
      .eq('producto_nombre', prod.nombre)
      .maybeSingle();

    const nuevo = {
      producto:    prod,
      formulacion: form   || [],
      configProd:  config || null,
      paradas:     1,
    };

    const nuevaLista = [...productosDelDia, nuevo];
    setProductosDelDia(nuevaLista);
    setProductoSelIdx(nuevaLista.length - 1); // auto-seleccionar el recién agregado
    setProdSelAdd('');
  }

  // ── Actualizar paradas de un producto ─────────────────────
  function actualizarParadas(idx, valor) {
    const n = [...productosDelDia];
    n[idx] = { ...n[idx], paradas: parseInt(valor) || 1 };
    setProductosDelDia(n);
    setProductoSelIdx(idx); // al tocar paradas → foco en ese producto
  }

  // ── Eliminar producto del día ─────────────────────────────
  function eliminarProductoDia(idx) {
    const n = productosDelDia.filter((_, i) => i !== idx);
    setProductosDelDia(n);
    if (productoSelIdx === idx) {
      setProductoSelIdx(n.length > 0 ? 0 : null);
    } else if (productoSelIdx > idx) {
      setProductoSelIdx(productoSelIdx - 1);
    }
  }

  // ── Limpiar todo ──────────────────────────────────────────
  function limpiarTodo() {
    if (productosDelDia.length === 0) return;
    if (!window.confirm('¿Limpiar todos los productos del día?')) return;
    setProductosDelDia([]);
    setProductoSelIdx(null);
  }

  // ── Calcular resumen de UN producto ───────────────────────
  function calcularResumenProducto(item) {
    if (!item) return null;
    const { formulacion, configProd, paradas } = item;
    if (!formulacion.length) return null;

    const merma  = parseFloat(configProd?.merma  || 0);
    const margen = parseFloat(configProd?.margen || 0);
    let kgTotalCrudo = 0;
    let costoTotal   = 0;

    const ingredientes = formulacion.map(f => {
      const gramos          = parseFloat(f.gramos || 0);
      const kgIngrediente   = (gramos / 1000) * paradas;
      const invItem2 = inventario.find(i => i.materia_prima_id === f.materia_prima_id);
      const precioKg = parseFloat(
        invItem2?.materias_primas?.precio_kg ||
        f.precio_kg || 0
      );
      const costoIngrediente = kgIngrediente * precioKg;
      kgTotalCrudo += kgIngrediente;
      costoTotal   += costoIngrediente;

      const invItem    = inventario.find(i => i.materia_prima_id === f.materia_prima_id);
      const stockDisp  = parseFloat(invItem?.stock_kg || 0);
      const suficiente = stockDisp >= kgIngrediente;
      const falta      = suficiente ? 0 : kgIngrediente - stockDisp;

      return {
        ...f,
        kg_necesarios:     kgIngrediente,
        stock_disponible:  stockDisp,
        suficiente,
        falta,
        costo_ingrediente: costoIngrediente,
        inv_id:            invItem?.id
      };
    });

    const mermaKg      = kgTotalCrudo * merma;
    const kgProducidos = kgTotalCrudo - mermaKg;
    const alertas      = ingredientes.filter(i => !i.suficiente);

    return {
      ingredientes,
      kgTotalCrudo,
      mermaKg,
      mermaPorc:   merma,
      kgProducidos,
      costoTotal,
      margen,
      paradas,
      alertas
    };
  }

  // ── Calcular totales del día ───────────────────────────────
  function calcularTotalesDia() {
    let kgFinales  = 0;
    let costoTotal = 0;
    productosDelDia.forEach(item => {
      const r = calcularResumenProducto(item);
      if (r) {
        kgFinales  += r.kgProducidos;
        costoTotal += r.costoTotal;
      }
    });
    return { kgFinales, costoTotal };
  }

  // ── Estado de alertas por producto ────────────────────────
  function getEstadoProducto(item) {
    const r = calcularResumenProducto(item);
    if (!r) return 'sin_formula';
    if (r.alertas.length === 0) return 'ok';
    if (r.alertas.length === 1) return 'warn';
    return 'danger';
  }

  // ── Guardar producción del día (todos los productos) ──────
  async function guardarProduccion() {
    if (productosDelDia.length === 0) return;
    setGuardando(true);

    for (const item of productosDelDia) {
      const resumen = calcularResumenProducto(item);
      if (!resumen) continue;

      const ingredientesUsados = resumen.ingredientes.map(i => ({
        materia_prima_id:   i.materia_prima_id,
        ingrediente_nombre: i.ingrediente_nombre,
        kg_usados:          i.kg_necesarios,
        precio_kg:          parseFloat(i.precio_kg || 0),
        costo:              i.costo_ingrediente
      }));

      await supabase.from('produccion_diaria').insert([{
        fecha,
        turno:            'mañana', // sin turno — siempre mañana por defecto
        producto_nombre:  item.producto.nombre,
        producto_id:      item.producto.id,
        num_paradas:      resumen.paradas,
        kg_total_crudo:   resumen.kgTotalCrudo,
        porcentaje_merma: resumen.mermaPorc,
        kg_producidos:    resumen.kgProducidos,
        costo_total:      resumen.costoTotal,
        ingredientes_usados: ingredientesUsados,
        usuario_nombre:   userRol?.nombre || 'Producción',
        user_id:          currentUser?.id,
        nota:             null,
        revertida:        false
      }]);

      // Descontar del inventario
      for (const ing of resumen.ingredientes) {
        if (ing.inv_id && ing.kg_necesarios > 0) {
          const nuevoStock = Math.max(0, ing.stock_disponible - ing.kg_necesarios);
          await supabase.from('inventario_mp')
            .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
            .eq('id', ing.inv_id);

          await supabase.from('inventario_movimientos').insert([{
            materia_prima_id: ing.materia_prima_id,
            nombre_mp:        ing.ingrediente_nombre,
            tipo:             'salida',
            kg:               -ing.kg_necesarios,
            motivo:           `Producción: ${item.producto.nombre} × ${resumen.paradas} paradas`,
            usuario_nombre:   userRol?.nombre || 'Producción',
            user_id:          currentUser?.id,
            via:              'produccion',
            fecha
          }]);
        }
      }

      await crearNotificacion({
        tipo:            'produccion',
        origen:          'produccion',
        usuario_nombre:  userRol?.nombre || 'Producción',
        user_id:         currentUser?.id,
        producto_nombre: item.producto.nombre,
        mensaje: `Producción: "${item.producto.nombre}" × ${resumen.paradas} paradas — ${resumen.kgProducidos.toFixed(1)} kg finales · $${resumen.costoTotal.toFixed(2)}`
      });

      if (resumen.alertas.length > 0) {
        await crearNotificacion({
          tipo:            'stock_bajo',
          origen:          'produccion',
          usuario_nombre:  'Sistema',
          user_id:         null,
          producto_nombre: item.producto.nombre,
          mensaje: `Stock insuficiente en producción de "${item.producto.nombre}": ${resumen.alertas.map(a => a.ingrediente_nombre).join(', ')}`
        });
      }
    }

    await actualizarProduccionMes();

    // Limpiar lista del día
    setProductosDelDia([]);
    setProductoSelIdx(null);
    setGuardando(false);
    mostrarExito(`Producción registrada — ${productosDelDia.length} producto(s)`);
    await cargarTodo();
    setTab('historial');
  }

  // ── Actualizar kg/mes en MOD+CIF ──────────────────────────
  async function actualizarProduccionMes() {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const fechaInicio = inicioMes.toISOString().split('T')[0];
    const fechaFin    = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('produccion_diaria')
      .select('kg_producidos').eq('revertida', false)
      .gte('fecha', fechaInicio).lte('fecha', fechaFin);
    const totalMes = (data || []).reduce((s, r) =>
      s + parseFloat(r.kg_producidos || 0), 0);
    await supabase.from('cif_items')
      .update({ valor_mes: totalMes })
      .eq('detalle', 'Producción (kg/mes)');
  }

  // ── Revertir producción ───────────────────────────────────
  async function revertirProduccion(prod) {
    setGuardando(true);
    const ingredientes = prod.ingredientes_usados || [];
    for (const ing of ingredientes) {
      const invItem = inventario.find(i => i.materia_prima_id === ing.materia_prima_id);
      if (invItem) {
        await supabase.from('inventario_mp')
          .update({
            stock_kg:   invItem.stock_kg + ing.kg_usados,
            updated_at: new Date().toISOString()
          }).eq('id', invItem.id);
        await supabase.from('inventario_movimientos').insert([{
          materia_prima_id: ing.materia_prima_id,
          nombre_mp:        ing.ingrediente_nombre,
          tipo:             'ajuste',
          kg:               ing.kg_usados,
          motivo:           `Reversión producción: ${prod.producto_nombre}`,
          usuario_nombre:   userRol?.nombre || 'Admin',
          user_id:          currentUser?.id,
          via:              'reversion',
          fecha:            new Date().toISOString().split('T')[0]
        }]);
      }
    }
    await supabase.from('produccion_diaria').update({
      revertida:   true,
      editado:     true,
      editado_por: userRol?.nombre,
      editado_at:  new Date().toISOString()
    }).eq('id', prod.id);
    await registrarAuditoria({
      tipo:            'reversion_produccion',
      usuario_nombre:  userRol?.nombre,
      user_id:         currentUser?.id,
      producto_nombre: prod.producto_nombre,
      mensaje: `Reversión: "${prod.producto_nombre}" × ${prod.num_paradas} paradas del ${prod.fecha} — devueltos ${parseFloat(prod.kg_producidos).toFixed(1)} kg`
    });
    await actualizarProduccionMes();
    setModalRevertir(null);
    setGuardando(false);
    mostrarExito('Producción revertida — stock devuelto al inventario');
    await cargarTodo();
  }

  // ── Nota al admin ─────────────────────────────────────────
  async function enviarNota() {
    if (!textoNota.trim()) return;
    await crearNotificacion({
      tipo:            'nota_produccion',
      origen:          'produccion',
      usuario_nombre:  userRol?.nombre || 'Producción',
      user_id:         currentUser?.id,
      producto_nombre: null,
      mensaje:         textoNota.trim()
    });
    setModalNota(false);
    setTextoNota('');
    mostrarExito('Nota enviada al administrador');
  }

  // ── Filtrado búsqueda ─────────────────────────────────────
  const prodsFiltrados = productos.filter(p =>
    !buscarProd ||
    p.nombre.toLowerCase().includes(buscarProd.toLowerCase())
  );

  // ── Historial agrupado ────────────────────────────────────
  const historialAgrupado = produccionDiaria.reduce((acc, p) => {
    if (!acc[p.fecha]) acc[p.fecha] = [];
    acc[p.fecha].push(p);
    return acc;
  }, {});

  // ── Stats ─────────────────────────────────────────────────
  const hoy      = new Date().toISOString().split('T')[0];
  const prodHoy  = produccionDiaria.filter(p => p.fecha === hoy);
  const kgHoy    = prodHoy.reduce((s, p) => s + parseFloat(p.kg_producidos  || 0), 0);
  const costoHoy = prodHoy.reduce((s, p) => s + parseFloat(p.costo_total    || 0), 0);
  const inicioMes      = new Date(); inicioMes.setDate(1);
  const fechaInicioMes = inicioMes.toISOString().split('T')[0];
  const prodMes        = produccionDiaria.filter(p => p.fecha >= fechaInicioMes);
  const kgMes          = prodMes.reduce((s, p) => s + parseFloat(p.kg_producidos || 0), 0);
  const costoMes       = prodMes.reduce((s, p) => s + parseFloat(p.costo_total   || 0), 0);

  // ── Retorno ───────────────────────────────────────────────
  return {
    // Estado
    productos, produccionDiaria, loading, guardando, msgExito,
    tab, setTab, mobile, esAdmin,
    // Multi-producto
    productosDelDia,
    productoSelIdx, setProductoSelIdx,
    buscarProd,     setBuscarProd,
    prodSelAdd,     setProdSelAdd,
    fecha,          setFecha,
    inventario,
    // Modales
    modalNota,    setModalNota,
    textoNota,    setTextoNota,
    modalRevertir,setModalRevertir,
    // Calculados
    prodsFiltrados,
    historialAgrupado,
    kgHoy, costoHoy, kgMes, costoMes,
    // Funciones
    agregarProducto,
    actualizarParadas,
    eliminarProductoDia,
    limpiarTodo,
    calcularResumenProducto,
    calcularTotalesDia,
    getEstadoProducto,
    guardarProduccion,
    revertirProduccion,
    enviarNota,
  };
}
