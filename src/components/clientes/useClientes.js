// ============================================
// useClientes.js
// Hook con todo el estado y lógica
// ============================================
import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export function useClientes({ userRol, currentUser }) {

  // ── Estado ────────────────────────────────────────────────
  const [clientes,        setClientes]        = useState([]);
  const [precios,         setPrecios]         = useState([]);
  const [productos,       setProductos]       = useState([]);
  const [configProductos, setConfigProductos] = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [msgExito,        setMsgExito]        = useState('');
  const [tab,             setTab]             = useState('clientes');
  const mobile = window.innerWidth < 700;

  // ── Filtros ───────────────────────────────────────────────
  const [buscar,          setBuscar]          = useState('');
  const [clienteSel,      setClienteSel]      = useState(null);

  // ── Modales ───────────────────────────────────────────────
  const [modalCliente,    setModalCliente]    = useState(false);
  const [modalPrecio,     setModalPrecio]     = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(null);
  const [editandoPrecio,  setEditandoPrecio]  = useState(null);
  const [guardando,       setGuardando]       = useState(false);

  // ── Form cliente ──────────────────────────────────────────
  const formVacio = {
    nombre:'', ruc:'', telefono:'',
    email:'', direccion:'', notas:''
  };
  const [formCliente, setFormCliente] = useState(formVacio);

  // ── Form precio ───────────────────────────────────────────
  const formPrecioVacio = {
    cliente_id:'', cliente_nombre:'',
    producto_nombre:'', precio_venta_kg:'',
    margen_minimo: 0.10
  };
  const [formPrecio, setFormPrecio] = useState(formPrecioVacio);

  // ── Helpers ───────────────────────────────────────────────
  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 4000);
  }

  const esAdmin = userRol?.rol === 'admin';

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => { cargarTodo(); }, []);

  async function cargarTodo() {
    setLoading(true);
    const [
      { data: cli  },
      { data: prec },
      { data: prod },
      { data: cfg  },
    ] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('precios_clientes').select('*').order('cliente_nombre'),
      supabase.from('productos').select('*').eq('estado','ACTIVO').order('nombre'),
      supabase.from('config_productos').select('*'),
    ]);
    setClientes(cli   || []);
    setPrecios(prec   || []);
    setProductos(prod || []);
    setConfigProductos(cfg || []);
    setLoading(false);
  }

  // ── Alertas de margen ─────────────────────────────────────
  function calcularAlertas() {
    const alertas = [];
    for (const precio of precios) {
      const cfg = configProductos.find(c =>
        c.producto_nombre === precio.producto_nombre
      );
      if (!cfg) continue;
      const costoKg      = parseFloat(cfg.costo_total_kg) || 0;
      const precioVenta  = parseFloat(precio.precio_venta_kg) || 0;
      const margenMin    = parseFloat(precio.margen_minimo)   || 0.10;
      if (costoKg === 0 || precioVenta === 0) continue;
      const margenActual = (precioVenta - costoKg) / costoKg;
      if (margenActual < margenMin) {
        const precioSugerido = costoKg * (1 + margenMin);
        alertas.push({
          cliente_nombre:  precio.cliente_nombre,
          producto_nombre: precio.producto_nombre,
          precio_actual:   precioVenta,
          costo_kg:        costoKg,
          margen_actual:   margenActual,
          margen_minimo:   margenMin,
          precio_sugerido: precioSugerido,
          diferencia:      precioSugerido - precioVenta,
        });
      }
    }
    return alertas;
  }

  // ── CRUD Clientes ─────────────────────────────────────────
  async function guardarCliente() {
    if (!formCliente.nombre.trim()) return alert('El nombre es obligatorio');
    setGuardando(true);
    if (editandoCliente) {
      await supabase.from('clientes')
        .update({ ...formCliente })
        .eq('id', editandoCliente.id);
      // Actualizar nombre en precios si cambió
      if (editandoCliente.nombre !== formCliente.nombre) {
        await supabase.from('precios_clientes')
          .update({ cliente_nombre: formCliente.nombre })
          .eq('cliente_id', editandoCliente.id);
      }
      mostrarExito('✅ Cliente actualizado');
    } else {
      await supabase.from('clientes').insert([{ ...formCliente }]);
      mostrarExito('✅ Cliente creado');
    }
    setModalCliente(false);
    setEditandoCliente(null);
    setFormCliente(formVacio);
    setGuardando(false);
    await cargarTodo();
  }

  async function eliminarCliente(id) {
    const cli = clientes.find(c => c.id === id);
    const preciosCliente = precios.filter(p => p.cliente_id === id);
    const msg = preciosCliente.length > 0
      ? `¿Eliminar "${cli?.nombre}" y sus ${preciosCliente.length} precio(s) configurado(s)?`
      : `¿Eliminar el cliente "${cli?.nombre}"?`;
    if (!window.confirm(msg)) return;
    await supabase.from('precios_clientes').delete().eq('cliente_id', id);
    await supabase.from('clientes').delete().eq('id', id);
    mostrarExito('🗑️ Cliente eliminado');
    if (clienteSel?.id === id) setClienteSel(null);
    await cargarTodo();
  }

  async function toggleActivoCliente(cli) {
    await supabase.from('clientes')
      .update({ activo: !cli.activo }).eq('id', cli.id);
    await cargarTodo();
  }

  // ── CRUD Precios ──────────────────────────────────────────
  async function guardarPrecio() {
    if (!formPrecio.cliente_id || !formPrecio.producto_nombre)
      return alert('Selecciona cliente y producto');
    if (!formPrecio.precio_venta_kg || parseFloat(formPrecio.precio_venta_kg) <= 0)
      return alert('Ingresa un precio válido');
    setGuardando(true);

    if (editandoPrecio) {
      await supabase.from('precios_clientes').update({
        precio_venta_kg: parseFloat(formPrecio.precio_venta_kg),
        margen_minimo:   parseFloat(formPrecio.margen_minimo) || 0.10,
        updated_at:      new Date().toISOString()
      }).eq('id', editandoPrecio.id);
      mostrarExito('✅ Precio actualizado');
    } else {
      // Verificar si ya existe
      const existe = precios.find(p =>
        p.cliente_id === formPrecio.cliente_id &&
        p.producto_nombre === formPrecio.producto_nombre
      );
      if (existe) {
        setGuardando(false);
        return alert('Ya existe un precio para este cliente y producto. Edítalo directamente.');
      }
      const cliente = clientes.find(c => c.id === formPrecio.cliente_id);
      await supabase.from('precios_clientes').insert([{
        cliente_id:      formPrecio.cliente_id,
        cliente_nombre:  cliente?.nombre || '',
        producto_nombre: formPrecio.producto_nombre,
        precio_venta_kg: parseFloat(formPrecio.precio_venta_kg),
        margen_minimo:   parseFloat(formPrecio.margen_minimo) || 0.10,
      }]);
      mostrarExito('✅ Precio asignado');
    }

    setModalPrecio(false);
    setEditandoPrecio(null);
    setFormPrecio(formPrecioVacio);
    setGuardando(false);
    await cargarTodo();
  }

  async function eliminarPrecio(id) {
    if (!window.confirm('¿Eliminar este precio?')) return;
    await supabase.from('precios_clientes').delete().eq('id', id);
    mostrarExito('🗑️ Precio eliminado');
    await cargarTodo();
  }

  // ── Abrir modales ─────────────────────────────────────────
  function abrirModalCliente(cli = null) {
    if (cli) {
      setEditandoCliente(cli);
      setFormCliente({
        nombre:    cli.nombre    || '',
        ruc:       cli.ruc       || '',
        telefono:  cli.telefono  || '',
        email:     cli.email     || '',
        direccion: cli.direccion || '',
        notas:     cli.notas     || '',
      });
    } else {
      setEditandoCliente(null);
      setFormCliente(formVacio);
    }
    setModalCliente(true);
  }

  function abrirModalPrecio(precio = null, clientePresel = null) {
    if (precio) {
      setEditandoPrecio(precio);
      setFormPrecio({
        cliente_id:      precio.cliente_id,
        cliente_nombre:  precio.cliente_nombre,
        producto_nombre: precio.producto_nombre,
        precio_venta_kg: precio.precio_venta_kg,
        margen_minimo:   precio.margen_minimo || 0.10,
      });
    } else {
      setEditandoPrecio(null);
      setFormPrecio({
        ...formPrecioVacio,
        cliente_id:     clientePresel?.id     || '',
        cliente_nombre: clientePresel?.nombre || '',
      });
    }
    setModalPrecio(true);
  }

  // ── Filtrado ──────────────────────────────────────────────
  const clientesFiltrados = clientes.filter(c =>
    !buscar ||
    c.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
    c.ruc?.toLowerCase().includes(buscar.toLowerCase()) ||
    c.email?.toLowerCase().includes(buscar.toLowerCase())
  );

  const preciosFiltrados = clienteSel
    ? precios.filter(p => p.cliente_id === clienteSel.id)
    : precios;

  // ── Precio sugerido del sistema ───────────────────────────
  function getPrecioSistema(productoNombre) {
    const cfg = configProductos.find(c => c.producto_nombre === productoNombre);
    return parseFloat(cfg?.precio_venta_kg) || 0;
  }

  function getCostoSistema(productoNombre) {
    const cfg = configProductos.find(c => c.producto_nombre === productoNombre);
    return parseFloat(cfg?.costo_total_kg) || 0;
  }

  // ── Retorno ───────────────────────────────────────────────
  return {
    // Estado
    clientes, precios, productos, configProductos,
    loading, msgExito, tab, setTab, mobile, esAdmin,
    // Filtros
    buscar, setBuscar,
    clienteSel, setClienteSel,
    // Modales
    modalCliente, setModalCliente,
    modalPrecio,  setModalPrecio,
    editandoCliente, editandoPrecio,
    guardando,
    // Forms
    formCliente, setFormCliente,
    formPrecio,  setFormPrecio,
    // Calculados
    clientesFiltrados,
    preciosFiltrados,
    alertas: calcularAlertas(),
    // Funciones
    cargarTodo,
    guardarCliente,   eliminarCliente,   toggleActivoCliente,
    guardarPrecio,    eliminarPrecio,
    abrirModalCliente,abrirModalPrecio,
    getPrecioSistema, getCostoSistema,
  };
}