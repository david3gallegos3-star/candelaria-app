import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { crearNotificacion, registrarAuditoria } from './App';

function Produccion({ onVolver, onVolverMenu, userRol, currentUser }) {
  const [productos, setProductos] = useState([]);
  const [produccionDiaria, setProduccionDiaria] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msgExito, setMsgExito] = useState('');
  const [tab, setTab] = useState('registrar');
  const mobile = window.innerWidth < 700;

  // Form nueva producción
  const [productoSel, setProductoSel] = useState(null);
  const [buscarProd, setBuscarProd] = useState('');
  const [numParadas, setNumParadas] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [turno, setTurno] = useState('mañana');
  const [nota, setNota] = useState('');
  const [formulacion, setFormulacion] = useState([]);
  const [configProd, setConfigProd] = useState(null);
  const [inventario, setInventario] = useState([]);
  const [alertasStock, setAlertasStock] = useState([]);
  const [modalNota, setModalNota] = useState(false);
  const [textoNota, setTextoNota] = useState('');
  const [modalRevertir, setModalRevertir] = useState(null);

  useEffect(() => { cargarTodo(); }, []);

  function mostrarExito(msg) { setMsgExito(msg); setTimeout(() => setMsgExito(''), 5000); }

  async function cargarTodo() {
    setLoading(true);
    const { data: prods } = await supabase.from('productos').select('*').eq('estado', 'ACTIVO').order('nombre');
    const { data: prod } = await supabase.from('produccion_diaria').select('*').eq('revertida', false).order('created_at', { ascending: false }).limit(100);
    const { data: inv } = await supabase.from('inventario_mp').select('*, materias_primas(id, nombre, nombre_producto, precio_kg)');
    setProductos(prods || []);
    setProduccionDiaria(prod || []);
    setInventario(inv || []);
    setLoading(false);
  }

  async function seleccionarProducto(prod) {
    setProductoSel(prod);
    setBuscarProd(prod.nombre);
    setNumParadas('');
    setAlertasStock([]);

    const { data: form } = await supabase.from('formulaciones').select('*').eq('producto_nombre', prod.nombre).order('orden');
    const { data: config } = await supabase.from('config_productos').select('*').eq('producto_nombre', prod.nombre).single();
    setFormulacion(form || []);
    setConfigProd(config || null);
  }

  // ── Calcular resumen de producción ───────────────────
  function calcularResumen() {
    if (!productoSel || !numParadas || !formulacion.length) return null;
    const paradas = parseFloat(numParadas) || 0;
    if (paradas <= 0) return null;
    const merma = parseFloat(configProd?.merma || 0);
    let kgTotalCrudo = 0;
    let costoTotal = 0;

    const ingredientes = formulacion.map(f => {
      const gramos = parseFloat(f.gramos || 0);
      const kgIngrediente = (gramos / 1000) * paradas;
      const precioKg = parseFloat(f.precio_kg || 0);
      const costoIngrediente = kgIngrediente * precioKg;
      kgTotalCrudo += kgIngrediente;
      costoTotal += costoIngrediente;

      // Buscar stock disponible
      const invItem = inventario.find(i => i.materia_prima_id === f.materia_prima_id);
      const stockDisp = parseFloat(invItem?.stock_kg || 0);
      const suficiente = stockDisp >= kgIngrediente;

      return {
        ...f,
        kg_necesarios: kgIngrediente,
        stock_disponible: stockDisp,
        suficiente,
        costo_ingrediente: costoIngrediente,
        inv_id: invItem?.id
      };
    });

    const kgProducidos = kgTotalCrudo * (1 - merma / 100);
    const alertas = ingredientes.filter(i => !i.suficiente);

    return { ingredientes, kgTotalCrudo, kgProducidos, costoTotal, merma, paradas, alertas };
  }

  const resumen = calcularResumen();

  // ── Guardar producción ───────────────────────────────
  async function guardarProduccion() {
    if (!productoSel || !numParadas || !resumen) return;
    setGuardando(true);

    const ingredientesUsados = resumen.ingredientes.map(i => ({
      materia_prima_id: i.materia_prima_id,
      ingrediente_nombre: i.ingrediente_nombre,
      kg_usados: i.kg_necesarios,
      precio_kg: parseFloat(i.precio_kg || 0),
      costo: i.costo_ingrediente
    }));

    // Guardar en produccion_diaria
    await supabase.from('produccion_diaria').insert([{
      fecha,
      turno,
      producto_nombre: productoSel.nombre,
      producto_id: productoSel.id,
      num_paradas: resumen.paradas,
      kg_total_crudo: resumen.kgTotalCrudo,
      porcentaje_merma: resumen.merma,
      kg_producidos: resumen.kgProducidos,
      costo_total: resumen.costoTotal,
      ingredientes_usados: ingredientesUsados,
      usuario_nombre: userRol?.nombre || 'Producción',
      user_id: currentUser?.id,
      nota: nota || null,
      revertida: false
    }]);

    // Descontar del inventario
    for (const ing of resumen.ingredientes) {
      if (ing.inv_id && ing.kg_necesarios > 0) {
        const nuevoStock = Math.max(0, ing.stock_disponible - ing.kg_necesarios);
        await supabase.from('inventario_mp').update({
          stock_kg: nuevoStock,
          updated_at: new Date().toISOString()
        }).eq('id', ing.inv_id);

        await supabase.from('inventario_movimientos').insert([{
          materia_prima_id: ing.materia_prima_id,
          nombre_mp: ing.ingrediente_nombre,
          tipo: 'salida',
          kg: -ing.kg_necesarios,
          motivo: `Producción: ${productoSel.nombre} × ${resumen.paradas} paradas`,
          usuario_nombre: userRol?.nombre || 'Producción',
          user_id: currentUser?.id,
          via: 'produccion',
          fecha
        }]);
      }
    }

    // Actualizar kg del mes en MOD+CIF
    await actualizarProduccionMes();

    // Notificar al admin
    await crearNotificacion({
      tipo: 'produccion',
      origen: 'produccion',
      usuario_nombre: userRol?.nombre || 'Producción',
      user_id: currentUser?.id,
      producto_nombre: productoSel.nombre,
      mensaje: `Producción registrada: "${productoSel.nombre}" × ${resumen.paradas} paradas — ${resumen.kgProducidos.toFixed(1)} kg producidos · $${resumen.costoTotal.toFixed(2)}`
    });

    if (resumen.alertas.length > 0) {
      await crearNotificacion({
        tipo: 'stock_bajo',
        origen: 'produccion',
        usuario_nombre: 'Sistema',
        user_id: null,
        producto_nombre: productoSel.nombre,
        mensaje: `⚠️ Producción de "${productoSel.nombre}" usó stock insuficiente en: ${resumen.alertas.map(a => a.ingrediente_nombre).join(', ')}`
      });
    }

    // Reset form
    setProductoSel(null);
    setBuscarProd('');
    setNumParadas('');
    setNota('');
    setFormulacion([]);
    setConfigProd(null);

    setGuardando(false);
    mostrarExito(`✅ Producción registrada — ${resumen.kgProducidos.toFixed(1)} kg de ${productoSel.nombre}`);
    await cargarTodo();
    setTab('historial');
  }

  // ── Actualizar kg/mes en MOD+CIF ────────────────────
  async function actualizarProduccionMes() {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    const fechaInicio = inicioMes.toISOString().split('T')[0];
    const fechaFin = new Date().toISOString().split('T')[0];

    const { data } = await supabase.from('produccion_diaria')
      .select('kg_producidos').eq('revertida', false)
      .gte('fecha', fechaInicio).lte('fecha', fechaFin);

    const totalMes = (data || []).reduce((s, r) => s + parseFloat(r.kg_producidos || 0), 0);

    await supabase.from('cif_items').update({ valor_mes: totalMes })
      .eq('detalle', 'Producción (kg/mes)');
  }

  // ── Revertir producción ──────────────────────────────
  async function revertirProduccion(prod) {
    setGuardando(true);
    const ingredientes = prod.ingredientes_usados || [];

    // Devolver stock
    for (const ing of ingredientes) {
      const invItem = inventario.find(i => i.materia_prima_id === ing.materia_prima_id);
      if (invItem) {
        await supabase.from('inventario_mp').update({
          stock_kg: invItem.stock_kg + ing.kg_usados,
          updated_at: new Date().toISOString()
        }).eq('id', invItem.id);

        await supabase.from('inventario_movimientos').insert([{
          materia_prima_id: ing.materia_prima_id,
          nombre_mp: ing.ingrediente_nombre,
          tipo: 'ajuste',
          kg: ing.kg_usados,
          motivo: `Reversión producción: ${prod.producto_nombre}`,
          usuario_nombre: userRol?.nombre || 'Admin',
          user_id: currentUser?.id,
          via: 'reversion',
          fecha: new Date().toISOString().split('T')[0]
        }]);
      }
    }

    // Marcar como revertida
    await supabase.from('produccion_diaria').update({
      revertida: true,
      editado: true,
      editado_por: userRol?.nombre,
      editado_at: new Date().toISOString()
    }).eq('id', prod.id);

    await registrarAuditoria({
      tipo: 'reversion_produccion',
      usuario_nombre: userRol?.nombre,
      user_id: currentUser?.id,
      producto_nombre: prod.producto_nombre,
      mensaje: `Reversión: "${prod.producto_nombre}" × ${prod.num_paradas} paradas del ${prod.fecha} — devueltos ${parseFloat(prod.kg_producidos).toFixed(1)} kg al inventario`
    });

    await actualizarProduccionMes();
    setModalRevertir(null);
    setGuardando(false);
    mostrarExito('↩️ Producción revertida — stock devuelto al inventario');
    await cargarTodo();
  }

  async function enviarNota() {
    if (!textoNota.trim()) return;
    await crearNotificacion({
      tipo: 'nota_produccion', origen: 'produccion',
      usuario_nombre: userRol?.nombre || 'Producción',
      user_id: currentUser?.id, producto_nombre: null,
      mensaje: textoNota.trim()
    });
    setModalNota(false); setTextoNota('');
    mostrarExito('✅ Nota enviada al administrador');
  }

  const prodsFiltrados = productos.filter(p => p.nombre.toLowerCase().includes(buscarProd.toLowerCase()));
  const esAdmin = userRol?.rol === 'admin';

  // ── Agrupar historial por fecha ──────────────────────
  const historialAgrupado = produccionDiaria.reduce((acc, p) => {
    if (!acc[p.fecha]) acc[p.fecha] = [];
    acc[p.fecha].push(p);
    return acc;
  }, {});

  // ── Stats del día ────────────────────────────────────
  const hoy = new Date().toISOString().split('T')[0];
  const prodHoy = produccionDiaria.filter(p => p.fecha === hoy);
  const kgHoy = prodHoy.reduce((s, p) => s + parseFloat(p.kg_producidos || 0), 0);
  const costoHoy = prodHoy.reduce((s, p) => s + parseFloat(p.costo_total || 0), 0);

  const inicioMes = new Date(); inicioMes.setDate(1);
  const fechaInicioMes = inicioMes.toISOString().split('T')[0];
  const prodMes = produccionDiaria.filter(p => p.fecha >= fechaInicioMes);
  const kgMes = prodMes.reduce((s, p) => s + parseFloat(p.kg_producidos || 0), 0);
  const costoMes = prodMes.reduce((s, p) => s + parseFloat(p.costo_total || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)', padding: mobile ? '10px 12px' : '14px 24px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onVolverMenu} style={{ background: 'rgba(255,200,0,0.25)', border: '1px solid rgba(255,200,0,0.4)', color: '#ffd700', padding: '7px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>🏠 Menú</button>
            <div>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '14px' : '18px' }}>🏭 Producción</div>
              <div style={{ color: '#aaa', fontSize: '11px' }}>{kgHoy.toFixed(1)} kg hoy · {kgMes.toFixed(1)} kg este mes</div>
            </div>
          </div>
          <button onClick={() => setModalNota(true)} style={{ background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', padding: mobile ? '8px 10px' : '8px 16px', cursor: 'pointer', fontSize: mobile ? '12px' : '13px', fontWeight: 'bold' }}>
            ✉️ {mobile ? '' : 'Enviar nota'}
          </button>
        </div>
      </div>

      {msgExito && <div style={{ background: '#d4edda', color: '#155724', padding: '10px 20px', fontWeight: 'bold', fontSize: '13px', textAlign: 'center' }}>{msgExito}</div>}

      <div style={{ padding: mobile ? '10px' : '16px 24px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '10px', marginBottom: '14px' }}>
          {[
            { label: 'KG HOY', val: kgHoy.toFixed(1)+' kg', color: '#155724', bg: '#d4edda' },
            { label: 'COSTO HOY', val: '$'+costoHoy.toFixed(2), color: '#1a5276', bg: '#e8f4fd' },
            { label: 'KG ESTE MES', val: kgMes.toFixed(1)+' kg', color: '#856404', bg: '#fff3cd' },
            { label: 'COSTO MES', val: '$'+costoMes.toFixed(2), color: '#6c3483', bg: '#f3e5f5' }
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10px', color: s.color, fontWeight: '700', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: mobile ? '16px' : '20px', fontWeight: '700', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'white', borderRadius: '10px', padding: '4px', marginBottom: '14px', gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {[['registrar','🏭 Registrar producción'],['historial','📋 Historial']].map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: mobile ? '8px 4px' : '9px 12px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: mobile ? '11px' : '13px', fontWeight: 'bold', background: tab === key ? '#1a1a2e' : 'transparent', color: tab === key ? 'white' : '#666' }}>{label}</button>
          ))}
        </div>

        {/* TAB: Registrar */}
        {tab === 'registrar' && (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
            {/* Panel izquierdo — formulario */}
            <div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '12px' }}>
                <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px', marginBottom: '12px' }}>1. Selecciona el producto</div>
                <input placeholder="🔍 Buscar producto..." value={buscarProd} onChange={e => { setBuscarProd(e.target.value); if (!e.target.value) setProductoSel(null); }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }} />
                {buscarProd && !productoSel && (
                  <div style={{ border: '1px solid #eee', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    {prodsFiltrados.length === 0 ? (
                      <div style={{ padding: '12px', color: '#aaa', fontSize: '13px', textAlign: 'center' }}>Sin resultados</div>
                    ) : prodsFiltrados.map(p => (
                      <div key={p.id} onClick={() => seleccionarProducto(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', fontSize: '13px', fontWeight: 'bold', color: '#1a1a2e' }}
                        onMouseEnter={e => e.currentTarget.style.background='#f0f8ff'}
                        onMouseLeave={e => e.currentTarget.style.background='white'}>
                        {p.nombre}
                        <div style={{ fontSize: '11px', color: '#888', fontWeight: 'normal' }}>{p.categoria}</div>
                      </div>
                    ))}
                  </div>
                )}
                {productoSel && (
                  <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '13px' }}>{productoSel.nombre}</div>
                      <div style={{ fontSize: '11px', color: '#555' }}>{formulacion.length} ingredientes · Merma: {configProd?.merma || 0}%</div>
                    </div>
                    <button onClick={() => { setProductoSel(null); setBuscarProd(''); setFormulacion([]); setConfigProd(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '16px' }}>✕</button>
                  </div>
                )}
              </div>

              <div style={{ background: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '12px' }}>
                <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px', marginBottom: '12px' }}>2. Datos de producción</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Fecha</label>
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Turno</label>
                    <select value={turno} onChange={e => setTurno(e.target.value)} style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px' }}>
                      <option value="mañana">🌅 Mañana</option>
                      <option value="tarde">🌇 Tarde</option>
                      <option value="noche">🌙 Noche</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Número de paradas</label>
                  <input type="number" value={numParadas} onChange={e => setNumParadas(e.target.value)} placeholder="Ej: 3" min="1"
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1.5px solid #f39c12', fontSize: '22px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Nota (opcional)</label>
                  <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: lote especial, cliente X..."
                    style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Alertas stock */}
              {resumen && resumen.alertas.length > 0 && (
                <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: '#856404', fontSize: '13px', marginBottom: '6px' }}>⚠️ Stock insuficiente — se registrará de todas formas</div>
                  {resumen.alertas.map((a, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#856404', marginBottom: '2px' }}>
                      • {a.ingrediente_nombre}: necesitas <strong>{a.kg_necesarios.toFixed(2)} kg</strong> · disponible <strong>{a.stock_disponible.toFixed(2)} kg</strong>
                    </div>
                  ))}
                </div>
              )}

              {/* Botón guardar */}
              {resumen && (
                <button onClick={guardarProduccion} disabled={guardando}
                  style={{ width: '100%', padding: '14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
                  {guardando ? 'Guardando...' : `✅ Registrar ${resumen.paradas} paradas — ${resumen.kgProducidos.toFixed(1)} kg`}
                </button>
              )}
            </div>

            {/* Panel derecho — resumen */}
            <div>
              {resumen ? (
                <>
                  {/* Resumen kg */}
                  <div style={{ background: '#1a1a2e', borderRadius: '10px', padding: '16px', marginBottom: '12px', color: 'white' }}>
                    <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '10px', fontWeight: 'bold' }}>RESUMEN DE PRODUCCIÓN</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {[
                        { label: 'Paradas', val: resumen.paradas },
                        { label: 'Kg crudo total', val: resumen.kgTotalCrudo.toFixed(2)+' kg' },
                        { label: 'Merma ('+resumen.merma+'%)', val: '-'+(resumen.kgTotalCrudo * resumen.merma / 100).toFixed(2)+' kg' },
                        { label: 'KG PRODUCIDOS', val: resumen.kgProducidos.toFixed(2)+' kg' },
                      ].map(s => (
                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '3px' }}>{s.label}</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: s.label === 'KG PRODUCIDOS' ? '#2ecc71' : 'white' }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#aaa' }}>Costo total ingredientes</span>
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#f39c12' }}>${resumen.costoTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Tabla ingredientes */}
                  <div style={{ background: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ background: '#1a1a2e', padding: '10px 14px', color: 'white', fontSize: '12px', fontWeight: 'bold' }}>INGREDIENTES NECESARIOS</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#f8f9fa' }}>
                            {['INGREDIENTE','KG NECESARIOS','STOCK DISP.','COSTO','ESTADO'].map(h => (
                              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', color: '#888', fontWeight: '700' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {resumen.ingredientes.map((ing, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: !ing.suficiente ? '#fffbf0' : 'white' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#1a1a2e', fontSize: '11px' }}>{ing.ingrediente_nombre}</td>
                              <td style={{ padding: '8px 10px', color: '#555' }}>{ing.kg_necesarios.toFixed(3)} kg</td>
                              <td style={{ padding: '8px 10px', color: ing.suficiente ? '#27ae60' : '#e74c3c', fontWeight: 'bold' }}>{ing.stock_disponible.toFixed(2)} kg</td>
                              <td style={{ padding: '8px 10px', color: '#27ae60', fontWeight: 'bold' }}>${ing.costo_ingrediente.toFixed(2)}</td>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{ background: ing.suficiente ? '#d4edda' : '#fff3cd', color: ing.suficiente ? '#155724' : '#856404', padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: '700' }}>
                                  {ing.suficiente ? '✓ OK' : '⚠ BAJO'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: 'white', borderRadius: '10px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏭</div>
                  <div style={{ color: '#aaa', fontSize: '14px' }}>Selecciona un producto e ingresa el número de paradas para ver el resumen</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: Historial */}
        {tab === 'historial' && (
          <div>
            {Object.keys(historialAgrupado).sort((a,b) => b.localeCompare(a)).map(fecha => {
              const registros = historialAgrupado[fecha];
              const kgDia = registros.reduce((s, r) => s + parseFloat(r.kg_producidos || 0), 0);
              const costoDia = registros.reduce((s, r) => s + parseFloat(r.costo_total || 0), 0);
              return (
                <div key={fecha} style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px' }}>
                      📅 {new Date(fecha+'T12:00:00').toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      Total: <strong style={{ color: '#27ae60' }}>{kgDia.toFixed(1)} kg</strong> · <strong style={{ color: '#f39c12' }}>${costoDia.toFixed(2)}</strong>
                    </div>
                  </div>
                  {registros.map(r => (
                    <div key={r.id} style={{ background: 'white', borderRadius: '10px', padding: '14px', marginBottom: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px' }}>{r.producto_nombre}</span>
                            <span style={{ background: r.turno === 'mañana' ? '#fff3cd' : r.turno === 'tarde' ? '#fde8e8' : '#e8f4fd', color: r.turno === 'mañana' ? '#856404' : r.turno === 'tarde' ? '#721c24' : '#1a5276', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700' }}>
                              {r.turno === 'mañana' ? '🌅' : r.turno === 'tarde' ? '🌇' : '🌙'} {r.turno}
                            </span>
                            {r.editado && <span style={{ background: '#f3e5f5', color: '#6c3483', padding: '2px 8px', borderRadius: '6px', fontSize: '10px' }}>editado</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#555', flexWrap: 'wrap' }}>
                            <span>🔢 <strong>{r.num_paradas}</strong> paradas</span>
                            <span>⚖️ <strong style={{ color: '#27ae60' }}>{parseFloat(r.kg_producidos || 0).toFixed(1)} kg</strong></span>
                            <span>💰 <strong style={{ color: '#f39c12' }}>${parseFloat(r.costo_total || 0).toFixed(2)}</strong></span>
                            <span>👤 {r.usuario_nombre}</span>
                          </div>
                          {r.nota && <div style={{ marginTop: '6px', fontSize: '12px', color: '#888', fontStyle: 'italic' }}>📝 {r.nota}</div>}
                          {/* Ingredientes usados */}
                          {r.ingredientes_usados && r.ingredientes_usados.length > 0 && (
                            <details style={{ marginTop: '8px' }}>
                              <summary style={{ fontSize: '11px', color: '#3498db', cursor: 'pointer' }}>Ver ingredientes usados ({r.ingredientes_usados.length})</summary>
                              <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {r.ingredientes_usados.map((ing, i) => (
                                  <span key={i} style={{ background: '#f0f2f5', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', color: '#555' }}>
                                    {ing.ingrediente_nombre}: {parseFloat(ing.kg_usados).toFixed(2)} kg
                                  </span>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                        {esAdmin && (
                          <button onClick={() => setModalRevertir(r)} style={{ background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6c6', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', marginLeft: '10px' }}>
                            ↩️ Revertir
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {produccionDiaria.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px', color: '#aaa' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                <div>Sin registros de producción</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: Confirmar reversión */}
      {modalRevertir && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: '14px', width: mobile ? '90%' : '440px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '36px', textAlign: 'center', marginBottom: '12px' }}>↩️</div>
            <h3 style={{ margin: '0 0 12px', color: '#c0392b', textAlign: 'center', fontSize: '16px' }}>¿Revertir esta producción?</h3>
            <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', color: '#555' }}>
              <div><strong>{modalRevertir.producto_nombre}</strong></div>
              <div>{modalRevertir.num_paradas} paradas · {parseFloat(modalRevertir.kg_producidos).toFixed(1)} kg · {modalRevertir.fecha} {modalRevertir.turno}</div>
              <div style={{ marginTop: '8px', color: '#e74c3c', fontWeight: 'bold' }}>⚠️ Esto devolverá todos los ingredientes al inventario</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalRevertir(null)} style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => revertirProduccion(modalRevertir)} disabled={guardando} style={{ padding: '10px 20px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                {guardando ? 'Revirtiendo...' : '↩️ Sí, revertir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nota al admin */}
      {modalNota && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: mobile ? '16px 16px 0 0' : '12px', width: mobile ? '100%' : '480px', padding: '20px', boxShadow: '0 -4px 30px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#1a1a2e', fontSize: '15px' }}>✉️ Enviar nota al Administrador</h3>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Módulo: <strong>Producción</strong></div>
            <textarea value={textoNota} onChange={e => setTextoNota(e.target.value)} placeholder="Ej: La máquina de la salchicha se dañó, no pudimos completar las paradas..." rows={4}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #e67e22', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Arial' }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setModalNota(false); setTextoNota(''); }} style={{ padding: '10px 18px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
              <button onClick={enviarNota} disabled={!textoNota.trim()} style={{ padding: '10px 20px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>✉️ Enviar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Produccion;