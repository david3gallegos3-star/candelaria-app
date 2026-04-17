// ============================================
// TabARCSA.js
// Registro de productos con notificación
// sanitaria ARCSA Ecuador + fichas técnicas
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const TIPOS_NOTIF = [
  'Notificación sanitaria obligatoria (NSO)',
  'Notificación sanitaria especial (NSE)',
  'Certificado de libre venta',
  'Permiso de funcionamiento'
];
const EMPTY_FORM = {
  producto_nombre: '', numero_notificacion: '', tipo_notificacion: TIPOS_NOTIF[0],
  fecha_emision: '', fecha_vencimiento: '', titular: '',
  condiciones_almacenamiento: '', vida_util_dias: '90',
  ingredientes_declarados: '', notas: ''
};

export default function TabARCSA({ mobile }) {
  const [registros,  setRegistros]  = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [modal,      setModal]      = useState(false);
  const [editando,   setEditando]   = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');
  const [expandido,  setExpandido]  = useState(null);
  const [busqueda,   setBusqueda]   = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('arcsa_registros')
      .select('*')
      .is('deleted_at', null)
      .order('producto_nombre');
    setRegistros(data || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function diasVenc(fechaV) {
    if (!fechaV) return null;
    const v = new Date(fechaV + 'T00:00:00');
    const h = new Date(); h.setHours(0,0,0,0);
    return Math.round((v - h) / 86400000);
  }

  function abrirNuevo() {
    setEditando(null); setForm(EMPTY_FORM); setError(''); setModal(true);
  }

  function abrirEditar(r) {
    setEditando(r);
    setForm({
      producto_nombre:             r.producto_nombre             || '',
      numero_notificacion:         r.numero_notificacion         || '',
      tipo_notificacion:           r.tipo_notificacion           || TIPOS_NOTIF[0],
      fecha_emision:               r.fecha_emision               || '',
      fecha_vencimiento:           r.fecha_vencimiento           || '',
      titular:                     r.titular                     || '',
      condiciones_almacenamiento:  r.condiciones_almacenamiento  || '',
      vida_util_dias:              r.vida_util_dias?.toString()  || '90',
      ingredientes_declarados:     r.ingredientes_declarados     || '',
      notas:                       r.notas                       || ''
    });
    setError(''); setModal(true);
  }

  async function guardar() {
    if (!form.producto_nombre.trim())       { setError('El nombre del producto es obligatorio.'); return; }
    if (!form.numero_notificacion.trim())   { setError('El número de notificación es obligatorio.'); return; }
    setGuardando(true); setError('');

    const payload = {
      producto_nombre:            form.producto_nombre.trim(),
      numero_notificacion:        form.numero_notificacion.trim(),
      tipo_notificacion:          form.tipo_notificacion,
      fecha_emision:              form.fecha_emision || null,
      fecha_vencimiento:          form.fecha_vencimiento || null,
      titular:                    form.titular.trim() || null,
      condiciones_almacenamiento: form.condiciones_almacenamiento.trim() || null,
      vida_util_dias:             parseInt(form.vida_util_dias) || 90,
      ingredientes_declarados:    form.ingredientes_declarados.trim() || null,
      notas:                      form.notas.trim() || null,
      updated_at:                 new Date().toISOString()
    };

    let err;
    if (editando) {
      ({ error: err } = await supabase.from('arcsa_registros').update(payload).eq('id', editando.id));
    } else {
      ({ error: err } = await supabase.from('arcsa_registros').insert(payload));
    }
    if (err) { setError(err.message); setGuardando(false); return; }
    await cargar();
    setModal(false);
    setGuardando(false);
  }

  async function eliminar(id) {
    await supabase.from('arcsa_registros').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await cargar();
  }

  const filtrados = registros.filter(r =>
    !busqueda ||
    r.producto_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.numero_notificacion?.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Alertas próximas a vencer (≤60 días)
  const porVencer = registros.filter(r => {
    const d = diasVenc(r.fecha_vencimiento);
    return d !== null && d >= 0 && d <= 60;
  });

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
      {/* Alerta por vencer */}
      {porVencer.length > 0 && (
        <div style={{ ...card, background: '#fff8e1', border: '1px solid #f39c12' }}>
          <div style={{ fontSize: '13px', color: '#8a6d00', fontWeight: 'bold', marginBottom: '6px' }}>
            ⚠️ {porVencer.length} notificacion{porVencer.length > 1 ? 'es' : ''} próxima{porVencer.length > 1 ? 's' : ''} a vencer:
          </div>
          {porVencer.map(r => {
            const d = diasVenc(r.fecha_vencimiento);
            return (
              <div key={r.id} style={{ fontSize: '12px', color: '#555', marginBottom: '2px' }}>
                • <b>{r.producto_nombre}</b> — {r.numero_notificacion} — vence en <b style={{ color: d <= 30 ? '#e74c3c' : '#f39c12' }}>{d} días</b> ({r.fecha_vencimiento})
              </div>
            );
          })}
        </div>
      )}

      {/* Barra */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto o N° notificación..."
          style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <button onClick={abrirNuevo} style={{
          background: 'linear-gradient(135deg,#1a3a1a,#2d5a1b)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
        }}>+ Nueva notificación</button>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando registros ARCSA...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          {busqueda ? 'Sin resultados.' : 'No hay registros ARCSA. Agrega la notificación sanitaria de cada producto.'}
        </div>
      ) : (
        filtrados.map(r => {
          const dias = diasVenc(r.fecha_vencimiento);
          const colorBorde = dias === null ? '#888' : dias < 0 ? '#e74c3c' : dias <= 60 ? '#f39c12' : '#27ae60';
          return (
            <div key={r.id} style={{ ...card, borderLeft: `4px solid ${colorBorde}` }}>
              <div onClick={() => setExpandido(expandido === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a1a' }}>
                        📋 {r.producto_nombre}
                      </span>
                      <span style={{ background: '#2d5a1b', color: 'white', borderRadius: '12px', padding: '2px 10px', fontSize: '11px' }}>
                        {r.numero_notificacion}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#555', flexWrap: 'wrap' }}>
                      <span>{r.tipo_notificacion}</span>
                      {r.fecha_vencimiento && (
                        <span style={{ color: colorBorde, fontWeight: dias !== null && dias <= 60 ? 'bold' : 'normal' }}>
                          Vence: {r.fecha_vencimiento}
                          {dias !== null && ` (${dias < 0 ? 'VENCIDO' : dias + 'd'})`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button onClick={e => { e.stopPropagation(); abrirEditar(r); }} style={{
                      background: '#f0f2f5', border: 'none', borderRadius: '8px',
                      padding: '6px 12px', cursor: 'pointer', fontSize: '12px'
                    }}>✏️</button>
                    <button onClick={e => { e.stopPropagation(); if (window.confirm('¿Eliminar este registro?')) eliminar(r.id); }} style={{
                      background: '#ffeaea', border: 'none', borderRadius: '8px',
                      padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: '#e74c3c'
                    }}>🗑️</button>
                    <span style={{ fontSize: '12px', color: '#aaa' }}>{expandido === r.id ? '▲' : '▼'}</span>
                  </div>
                </div>
              </div>

              {expandido === r.id && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f2f5', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '8px', fontSize: '12px', color: '#555' }}>
                  {r.titular && <div><b>Titular:</b> {r.titular}</div>}
                  {r.fecha_emision && <div><b>Fecha emisión:</b> {r.fecha_emision}</div>}
                  {r.vida_util_dias && <div><b>Vida útil:</b> {r.vida_util_dias} días</div>}
                  {r.condiciones_almacenamiento && <div><b>Almacenamiento:</b> {r.condiciones_almacenamiento}</div>}
                  {r.ingredientes_declarados && (
                    <div style={{ gridColumn: mobile ? '1' : '1/-1' }}>
                      <b>Ingredientes declarados:</b><br />
                      <span style={{ whiteSpace: 'pre-wrap' }}>{r.ingredientes_declarados}</span>
                    </div>
                  )}
                  {r.notas && <div style={{ gridColumn: mobile ? '1' : '1/-1', fontStyle: 'italic', color: '#888' }}>📝 {r.notas}</div>}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 20px', color: '#1a3a1a' }}>
              {editando ? '✏️ Editar registro ARCSA' : '+ Nueva notificación ARCSA'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Producto *</label>
                <input value={form.producto_nombre} onChange={e => setForm(f => ({ ...f, producto_nombre: e.target.value }))}
                  style={inputStyle} placeholder="Jamón de pierna" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>N° Notificación *</label>
                <input value={form.numero_notificacion} onChange={e => setForm(f => ({ ...f, numero_notificacion: e.target.value }))}
                  style={inputStyle} placeholder="ARCSA-xxx-xxx-xxx" />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Tipo</label>
              <select value={form.tipo_notificacion} onChange={e => setForm(f => ({ ...f, tipo_notificacion: e.target.value }))} style={inputStyle}>
                {TIPOS_NOTIF.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Fecha emisión</label>
                <input type="date" value={form.fecha_emision} onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Fecha vencimiento</label>
                <input type="date" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Vida útil (días)</label>
                <input type="number" value={form.vida_util_dias} onChange={e => setForm(f => ({ ...f, vida_util_dias: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Titular / Empresa</label>
              <input value={form.titular} onChange={e => setForm(f => ({ ...f, titular: e.target.value }))}
                style={inputStyle} placeholder="Embutidos Candelaria" />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Condiciones de almacenamiento</label>
              <input value={form.condiciones_almacenamiento} onChange={e => setForm(f => ({ ...f, condiciones_almacenamiento: e.target.value }))}
                style={inputStyle} placeholder="Refrigerar entre 0°C y 4°C" />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Ingredientes declarados</label>
              <textarea value={form.ingredientes_declarados} onChange={e => setForm(f => ({ ...f, ingredientes_declarados: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                placeholder="Carne de cerdo, sal, especias..." />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Notas</label>
              <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '50px' }} />
            </div>

            {error && (
              <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: '8px', padding: '10px', color: '#e74c3c', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ background: '#f0f2f5', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a3a1a,#2d5a1b)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>{guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
