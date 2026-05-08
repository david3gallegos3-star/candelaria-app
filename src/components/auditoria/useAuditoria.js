// ============================================
// useAuditoria.js
// Hook con todo el estado y lógica
// ============================================
import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

const TIPOS = [
  'cambio_precio', 'cambio_nombre', 'entrada_inventario',
  'ajuste_inventario', 'produccion', 'reversion_produccion',
  'perdida', 'nota_formulador', 'nota_produccion',
  'nueva_mp', 'stock_bajo', 'precio_cero',
];

export function useAuditoria({ userRol }) {

  // ── Estado ────────────────────────────────────────────────
  const [registros,    setRegistros]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [cargando,     setCargando]     = useState(false);
  const [msgExito,     setMsgExito]     = useState('');
  const mobile = window.innerWidth < 700;

  // ── Filtros ───────────────────────────────────────────────
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');
  const [tipoFiltro,   setTipoFiltro]   = useState('TODOS');
  const [usuarioFiltro,setUsuarioFiltro]= useState('');
  const [productoFiltro,setProductoFiltro] = useState('');
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);

  // ── Paginación ────────────────────────────────────────────
  const [pagina,       setPagina]       = useState(1);
  const POR_PAGINA = 50;

  // ── Helpers ───────────────────────────────────────────────
  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 4000);
  }

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => { buscar(); }, []);
  useRealtime(['auditoria'], buscar);

  async function buscar() {
    setCargando(true);
    let q = supabase
      .from('auditoria')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (fechaDesde)       q = q.gte('created_at', fechaDesde + 'T00:00:00');
    if (fechaHasta)       q = q.lte('created_at', fechaHasta + 'T23:59:59');
    if (tipoFiltro !== 'TODOS') q = q.eq('tipo', tipoFiltro);
    if (usuarioFiltro)    q = q.ilike('usuario_nombre', `%${usuarioFiltro}%`);
    if (productoFiltro)   q = q.ilike('producto_nombre', `%${productoFiltro}%`);
    if (soloNoLeidas)     q = q.eq('leida', false);

    const { data, error } = await q;
    if (!error) setRegistros(data || []);
    setCargando(false);
    setLoading(false);
    setPagina(1);
  }

  function limpiarFiltros() {
    setFechaDesde('');
    setFechaHasta('');
    setTipoFiltro('TODOS');
    setUsuarioFiltro('');
    setProductoFiltro('');
    setSoloNoLeidas(false);
  }

  // ── Stats ─────────────────────────────────────────────────
  const hoy = new Date().toISOString().split('T')[0];
  const registrosHoy   = registros.filter(r =>
    r.created_at?.startsWith(hoy)
  ).length;
  const cambiosPrecios = registros.filter(r =>
    r.tipo === 'cambio_precio'
  ).length;
  const producciones   = registros.filter(r =>
    r.tipo === 'produccion'
  ).length;
  const noLeidas       = registros.filter(r => !r.leida).length;

  // ── Usuarios únicos para filtro ───────────────────────────
  const usuariosUnicos = [...new Set(
    registros.map(r => r.usuario_nombre).filter(Boolean)
  )].sort();

  // ── Paginación ────────────────────────────────────────────
  const totalPaginas   = Math.ceil(registros.length / POR_PAGINA);
  const registrosPagina = registros.slice(
    (pagina - 1) * POR_PAGINA,
    pagina * POR_PAGINA
  );

  // ── Color y label por tipo ────────────────────────────────
  function colorTipo(tipo) {
    const mapa = {
      cambio_precio:       '#e74c3c',
      cambio_nombre:       '#e67e22',
      entrada_inventario:  '#27ae60',
      ajuste_inventario:   '#3498db',
      produccion:          '#2ecc71',
      reversion_produccion:'#c0392b',
      perdida:             '#c0392b',
      nota_formulador:     '#8e44ad',
      nota_produccion:     '#8e44ad',
      nueva_mp:            '#27ae60',
      stock_bajo:          '#f39c12',
      precio_cero:         '#e74c3c',
    };
    return mapa[tipo] || '#95a5a6';
  }

  function iconTipo(tipo) {
    const mapa = {
      cambio_precio:       '💰',
      cambio_nombre:       '✏️',
      entrada_inventario:  '📦',
      ajuste_inventario:   '⚙️',
      produccion:          '🏭',
      reversion_produccion:'↩️',
      perdida:             '🗑️',
      nota_formulador:     '🧪',
      nota_produccion:     '🏭',
      nueva_mp:            '🆕',
      stock_bajo:          '⚠️',
      precio_cero:         '🚨',
    };
    return mapa[tipo] || '📋';
  }

  function labelTipo(tipo) {
    const mapa = {
      cambio_precio:       'Cambio precio',
      cambio_nombre:       'Cambio nombre',
      entrada_inventario:  'Entrada inventario',
      ajuste_inventario:   'Ajuste inventario',
      produccion:          'Producción',
      reversion_produccion:'Reversión producción',
      perdida:             'Pérdida/merma',
      nota_formulador:     'Nota formulador',
      nota_produccion:     'Nota producción',
      nueva_mp:            'Nueva MP',
      stock_bajo:          'Stock bajo',
      precio_cero:         'Precio en $0',
    };
    return mapa[tipo] || tipo;
  }

  // ── Exportar Excel ────────────────────────────────────────
  async function exportarExcel() {
    const XLSX = await import('xlsx');
    const datos = registros.map(r => ({
      'Fecha':            new Date(r.created_at).toLocaleString('es-EC'),
      'Tipo':             labelTipo(r.tipo),
      'Usuario':          r.usuario_nombre || '',
      'Producto':         r.producto_nombre || '',
      'Campo':            r.campo_modificado || '',
      'Valor antes':      r.valor_antes || '',
      'Valor después':    r.valor_despues || '',
      'Mensaje':          r.mensaje || '',
      'Leída':            r.leida ? 'Sí' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    ws['!cols'] = [
      {wch:20},{wch:22},{wch:16},{wch:22},
      {wch:18},{wch:18},{wch:18},{wch:40},{wch:8}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoría');
    XLSX.writeFile(wb, `auditoria_${hoy}.xlsx`);
    mostrarExito(`✅ Excel exportado — ${registros.length} registros`);
  }

  // ── Retorno ───────────────────────────────────────────────
  return {
    // Estado
    registros, loading, cargando, msgExito, mobile,
    // Filtros
    fechaDesde,    setFechaDesde,
    fechaHasta,    setFechaHasta,
    tipoFiltro,    setTipoFiltro,
    usuarioFiltro, setUsuarioFiltro,
    productoFiltro,setProductoFiltro,
    soloNoLeidas,  setSoloNoLeidas,
    usuariosUnicos, TIPOS,
    // Paginación
    pagina, setPagina,
    totalPaginas, registrosPagina, POR_PAGINA,
    // Stats
    registrosHoy, cambiosPrecios, producciones, noLeidas,
    // Funciones
    buscar, limpiarFiltros, exportarExcel,
    // Helpers
    colorTipo, iconTipo, labelTipo,
  };
}