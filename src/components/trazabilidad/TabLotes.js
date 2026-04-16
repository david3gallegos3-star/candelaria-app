// ============================================
// TabLotes.js
// Registro y consulta de lotes de producción
// Vinculados a produccion_diaria + formulaciones
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

function generarCodigoLote(productoNombre, fecha) {
  const siglas = productoNombre
    .split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 3);
  const fechaCorta = fecha.replace(/-/g, '').slice(2); // YYMMDD
  const rand = Math.floor(Math.random() * 900 + 100);
  return `${siglas}-${fechaCorta}-${rand}`;
}

export default function TabLotes({ mobile }) {
  const [lotes,     setLotes]     = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [busqueda,  setBusqueda]  = useState('');
  const [modal,     setModal]     = useState(false);
  const [producciones, setProducciones] = useState([]);
  const [form, setForm] = useState({
    produccion_id: '', codigo_lote: '', fecha_vencimiento: '',
    cantidad_kg: '', notas: ''
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [expandido, setExpandido] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('lotes_produccion')
      .select(`*, produccion_diaria(producto_nombre, kg_producidos, fecha)`)
      .gte('fecha_produccion', desde)
      .lte('fecha_produccion', hasta)
      .order('fecha_produccion', { ascending: false });
    setLotes(data || []);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  async function abrirModal() {
    // Cargar producciones sin lote asignado
    const { data: prods } = await supabase
      .from('produccion_diaria')
      .select('id, producto_nombre, kg_producidos, fecha')
      .is('deleted_at', null)
      .order('fecha', { ascending: false })
      .limit(50);

    // IDs de producciones que ya tienen lote
    const { data: conLote } = await supabase
      .from('lotes_produccion').select('produccion_id');
    const idsConLote = new Set((conLote || []).map(l => l.produccion_id));

    setProducciones((prods || []).filter(p => !idsConLote.has(p.id)));
    setForm({ produccion_id: '', codigo_lote: '', fecha_vencimiento: '', cantidad_kg: '', notas: '' });
    setError('');
    setModal(true);
  }

  function onChangeProd(id) {
    const prod = producciones.find(p => p.id === id);
    if (!prod) { setForm(f => ({ ...f, produccion_id: id })); return; }
    // Calcular vencimiento por defecto: 90 días desde la fecha
    const fecha = new Date(prod.fecha + 'T00:00:00');
    fecha.setDate(fecha.getDate() + 90);
    setForm(f => ({
      ...f,
      produccion_id:    id,
      codigo_lote:      generarCodigoLote(prod.producto_nombre, prod.fecha),
      cantidad_kg:      prod.kg_producidos?.toString() || '',
      fecha_vencimiento: fecha.toISOString().slice(0, 10)
    }));
  }

  async function guardar() {
    if (!form.produccion_id)     { setError('Selecciona una producción.'); return; }
    if (!form.codigo_lote.trim()){ setError('El código de lote es obligatorio.'); return; }
    if (!form.fecha_vencimiento) { setError('La fecha de vencimiento es obligatoria.'); return; }
    setGuardando(true); setError('');

    const prod = producciones.find(p => p.id === form.produccion_id);
    const { error: err } = await supabase.from('lotes_produccion').insert({
      produccion_id:     form.produccion_id,
      producto_nombre:   prod?.producto_nombre || '',
      codigo_lote:       form.codigo_lote.trim().toUpperCase(),
      fecha_produccion:  prod?.fecha || hoy,
      fecha_vencimiento: form.fecha_vencimiento,
      cantidad_kg:       parseFloat(form.cantidad_kg) || 0,
      estado:            'activo',
      notas:             form.notas.trim() || null
    });
    if (err) { setError(err.message); setGuardando(false); return; }
    await cargar();
    setModal(false);
    setGuardando(false);
  }

  const filtrados = lotes.filter(l =>
    !busqueda ||
    l.codigo_lote?.toLowerCase().includes(busqueda.toLowerCase()) ||
    l.producto_nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );

  function diasVenc(fechaV) {
    if (!fechaV) return null;
    const v = new Date(fechaV + 'T00:00:00');
    const h = new Date(); h.setHours(0,0,0,0);
    return Math.round((v - h) / 86400000);
  }

  function colorVenc(dias) {
    if (dias === null) return '#888';
    if (dias < 0) return '#e74c3c';
    if (dias <= 30) return '#f39c12';
    return '#27ae60';
  }

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px',
    boxSizing: 'border-box', outline: 'none'
  };

  return (
    <div>
      {/* Barra */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Desde</div>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', outline: 'none' }} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Hasta</div>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', outline: 'none' }} />
        </div>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar lote o producto..."
          style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <button onClick={abrirModal} style={{
          background: 'linear-gradient(135deg,#1a3a1a,#2d5a1b)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
        }}>+ Nuevo lote</button>
      </div>

      {/* Conteo */}
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px', paddingLeft: '4px' }}>
        {filtrados.length} lote{filtrados.length !== 1 ? 's' : ''}
        {' · '}
        <span style={{ color: '#e74c3c' }}>
          {filtrados.filter(l => { const d = diasVenc(l.fecha_vencimiento); return d !== null && d <= 30; }).length} próximos a vencer
        </span>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando lotes...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay lotes en el período seleccionado.
        </div>
      ) : (
        filtrados.map(l => {
          const dias = diasVenc(l.fecha_vencimiento);
          const col  = colorVenc(dias);
          return (
            <div key={l.id} style={{ ...card, borderLeft: `4px solid ${col}` }}>
              <div
                onClick={() => setExpandido(expandido === l.id ? null : l.id)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a3a1a', fontFamily: 'monospace' }}>
                        🏷️ {l.codigo_lote}
                      </span>
                      <span style={{
                        background: '#2d5a1b', color: 'white', borderRadius: '12px',
                        padding: '2px 10px', fontSize: '11px', fontWeight: 'bold'
                      }}>{l.producto_nombre}</span>
                      <span style={{
                        background: l.estado === 'activo' ? '#27ae60' : '#aaa',
                        color: 'white', borderRadius: '12px', padding: '2px 8px', fontSize: '10px'
                      }}>{l.estado}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#555', flexWrap: 'wrap' }}>
                      <span>📅 Producido: {l.fecha_produccion}</span>
                      <span style={{ color: col, fontWeight: dias !== null && dias <= 30 ? 'bold' : 'normal' }}>
                        ⏳ Vence: {l.fecha_vencimiento}
                        {dias !== null && ` (${dias < 0 ? 'VENCIDO' : dias + 'd'})`}
                      </span>
                      <span>⚖️ {l.cantidad_kg} kg</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#aaa' }}>{expandido === l.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expandido === l.id && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f2f5' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '8px', fontSize: '12px', color: '#555' }}>
                    <div><b>Producción origen:</b> {l.produccion_diaria?.fecha} — {l.produccion_diaria?.kg_producidos} kg</div>
                    {l.notas && <div><b>Notas:</b> {l.notas}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    {l.estado === 'activo' && (
                      <>
                        <button onClick={async () => {
                          await supabase.from('lotes_produccion').update({ estado: 'despachado' }).eq('id', l.id);
                          cargar();
                        }} style={{
                          background: '#2980b9', color: 'white', border: 'none', borderRadius: '8px',
                          padding: '6px 14px', cursor: 'pointer', fontSize: '12px'
                        }}>📦 Marcar despachado</button>
                        <button onClick={async () => {
                          await supabase.from('lotes_produccion').update({ estado: 'retenido' }).eq('id', l.id);
                          cargar();
                        }} style={{
                          background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px',
                          padding: '6px 14px', cursor: 'pointer', fontSize: '12px'
                        }}>🚫 Retener lote</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Modal nuevo lote */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 20px', color: '#1a3a1a' }}>🏷️ Registrar nuevo lote</h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Producción de origen *
              </label>
              <select value={form.produccion_id} onChange={e => onChangeProd(e.target.value)} style={inputStyle}>
                <option value="">— Selecciona producción —</option>
                {producciones.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.fecha} · {p.producto_nombre} · {p.kg_producidos} kg
                  </option>
                ))}
              </select>
              {producciones.length === 0 && (
                <div style={{ fontSize: '11px', color: '#e74c3c', marginTop: '4px' }}>
                  Todas las producciones ya tienen lote asignado.
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                  Código de lote *
                </label>
                <input value={form.codigo_lote}
                  onChange={e => setForm(f => ({ ...f, codigo_lote: e.target.value.toUpperCase() }))}
                  style={inputStyle} placeholder="Ej. SAL-260415-312" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                  Fecha vencimiento *
                </label>
                <input type="date" value={form.fecha_vencimiento}
                  onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                  style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Cantidad (kg)
              </label>
              <input type="number" step="0.1" value={form.cantidad_kg}
                onChange={e => setForm(f => ({ ...f, cantidad_kg: e.target.value }))}
                style={inputStyle} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Notas
              </label>
              <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
                placeholder="Observaciones del lote..." />
            </div>

            {error && (
              <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: '8px', padding: '10px', color: '#e74c3c', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a3a1a,#2d5a1b)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: '13px', fontWeight: 'bold'
              }}>
                {guardando ? 'Guardando...' : 'Registrar lote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
