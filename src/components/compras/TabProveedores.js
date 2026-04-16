// ============================================
// TabProveedores.js
// CRUD completo de proveedores
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const TIPO_OPTIONS = ['Nacional', 'Extranjero'];
const EMPTY_FORM = {
  nombre: '', ruc: '', tipo: 'Nacional',
  telefono: '', email: '', direccion: '',
  contacto: '', dias_credito: 0, notas: ''
};

export default function TabProveedores({ mobile }) {
  const [proveedores, setProveedores] = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [busqueda,    setBusqueda]    = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando,    setEditando]    = useState(null); // null=nuevo, obj=editar
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [guardando,   setGuardando]   = useState(false);
  const [error,       setError]       = useState('');
  const [confirmarElim, setConfirmarElim] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('proveedores')
      .select('*')
      .is('deleted_at', null)
      .order('nombre');
    setProveedores(data || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.ruc || '').includes(busqueda) ||
    (p.contacto || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  function abrirNuevo() {
    setEditando(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalAbierto(true);
  }

  function abrirEditar(p) {
    setEditando(p);
    setForm({
      nombre:       p.nombre       || '',
      ruc:          p.ruc          || '',
      tipo:         p.tipo         || 'Nacional',
      telefono:     p.telefono     || '',
      email:        p.email        || '',
      direccion:    p.direccion    || '',
      contacto:     p.contacto     || '',
      dias_credito: p.dias_credito || 0,
      notas:        p.notas        || ''
    });
    setError('');
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
    setEditando(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    setGuardando(true);
    setError('');
    const payload = {
      nombre:       form.nombre.trim(),
      ruc:          form.ruc.trim() || null,
      tipo:         form.tipo,
      telefono:     form.telefono.trim() || null,
      email:        form.email.trim() || null,
      direccion:    form.direccion.trim() || null,
      contacto:     form.contacto.trim() || null,
      dias_credito: parseInt(form.dias_credito) || 0,
      notas:        form.notas.trim() || null,
      updated_at:   new Date().toISOString()
    };

    let err;
    if (editando) {
      ({ error: err } = await supabase
        .from('proveedores').update(payload).eq('id', editando.id));
    } else {
      ({ error: err } = await supabase
        .from('proveedores').insert({ ...payload, activo: true }));
    }

    if (err) { setError(err.message); setGuardando(false); return; }
    await cargar();
    cerrarModal();
    setGuardando(false);
  }

  async function eliminar(p) {
    await supabase.from('proveedores')
      .update({ deleted_at: new Date().toISOString(), activo: false })
      .eq('id', p.id);
    setConfirmarElim(null);
    await cargar();
  }

  // ── Estilos reutilizables ──
  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: mobile ? '12px' : '16px',
    marginBottom: '12px'
  };
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px',
    boxSizing: 'border-box', outline: 'none'
  };
  const labelStyle = {
    display: 'block', fontSize: '12px',
    color: '#555', marginBottom: '4px', fontWeight: '600'
  };

  return (
    <div>
      {/* Barra superior */}
      <div style={{
        ...card,
        display: 'flex', gap: '10px', alignItems: 'center',
        flexWrap: mobile ? 'wrap' : 'nowrap'
      }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, RUC o contacto..."
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <button onClick={abrirNuevo} style={{
          background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 16px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          + Nuevo proveedor
        </button>
      </div>

      {/* Contador */}
      <div style={{ color: '#666', fontSize: '12px', marginBottom: '10px', paddingLeft: '4px' }}>
        {filtrados.length} proveedor{filtrados.length !== 1 ? 'es' : ''}
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          Cargando proveedores...
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          {busqueda ? 'No hay resultados para esa búsqueda.' : 'Aún no tienes proveedores registrados.'}
        </div>
      ) : (
        filtrados.map(p => (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {/* Nombre + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a3a2a' }}>
                    🏢 {p.nombre}
                  </span>
                  <span style={{
                    background: p.tipo === 'Extranjero' ? '#8e44ad' : '#27ae60',
                    color: 'white', borderRadius: '12px',
                    padding: '2px 10px', fontSize: '11px', fontWeight: 'bold'
                  }}>
                    {p.tipo || 'Nacional'}
                  </span>
                  {p.dias_credito > 0 && (
                    <span style={{
                      background: '#f39c12', color: 'white', borderRadius: '12px',
                      padding: '2px 10px', fontSize: '11px', fontWeight: 'bold'
                    }}>
                      {p.dias_credito}d crédito
                    </span>
                  )}
                </div>

                {/* Datos secundarios */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)',
                  gap: '4px 16px', fontSize: '12px', color: '#555'
                }}>
                  {p.ruc      && <span>🪪 RUC/ID: <b>{p.ruc}</b></span>}
                  {p.telefono && <span>📞 {p.telefono}</span>}
                  {p.email    && <span>✉️ {p.email}</span>}
                  {p.contacto && <span>👤 {p.contacto}</span>}
                  {p.direccion && <span>📍 {p.direccion}</span>}
                  {p.notas    && <span style={{ color: '#888', fontStyle: 'italic' }}>📝 {p.notas}</span>}
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: '6px', marginLeft: '10px', flexShrink: 0 }}>
                <button onClick={() => abrirEditar(p)} style={{
                  background: '#f0f2f5', border: 'none', borderRadius: '8px',
                  padding: '7px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                }}>✏️ Editar</button>
                <button onClick={() => setConfirmarElim(p)} style={{
                  background: '#ffeaea', border: 'none', borderRadius: '8px',
                  padding: '7px 10px', cursor: 'pointer', fontSize: '12px', color: '#e74c3c'
                }}>🗑️</button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* ── Modal Nuevo / Editar ── */}
      {modalAbierto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '560px', maxHeight: '90vh',
            overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 20px', color: '#1a3a2a' }}>
              {editando ? '✏️ Editar proveedor' : '+ Nuevo proveedor'}
            </h3>

            {/* Nombre */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Nombre / Razón social *</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                style={inputStyle} placeholder="Ej. Distribuidora Andina S.A." />
            </div>

            {/* RUC + Tipo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>RUC / Cédula / Pasaporte</label>
                <input value={form.ruc} onChange={e => setForm(f => ({ ...f, ruc: e.target.value }))}
                  style={inputStyle} placeholder="0990000000001" />
              </div>
              <div>
                <label style={labelStyle}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  style={inputStyle}>
                  {TIPO_OPTIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Teléfono + Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  style={inputStyle} placeholder="0999999999" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={inputStyle} placeholder="ventas@proveedor.com" />
              </div>
            </div>

            {/* Contacto + Días crédito */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Persona de contacto</label>
                <input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}
                  style={inputStyle} placeholder="Ing. Juan Pérez" />
              </div>
              <div>
                <label style={labelStyle}>Días de crédito</label>
                <input type="number" min={0} value={form.dias_credito}
                  onChange={e => setForm(f => ({ ...f, dias_credito: e.target.value }))}
                  style={inputStyle} placeholder="0" />
              </div>
            </div>

            {/* Dirección */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Dirección</label>
              <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                style={inputStyle} placeholder="Av. Principal 123, Quito" />
            </div>

            {/* Notas */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Notas internas</label>
              <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                placeholder="Condiciones especiales, observaciones..." />
            </div>

            {error && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: '8px', padding: '10px', color: '#e74c3c',
                fontSize: '13px', marginBottom: '16px'
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={cerrarModal} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: '13px', fontWeight: 'bold'
              }}>
                {guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar eliminar ── */}
      {confirmarElim && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '28px',
            maxWidth: '400px', width: '100%', textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px', color: '#1a3a2a' }}>¿Eliminar proveedor?</h3>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: '24px' }}>
              <b>{confirmarElim.nombre}</b> será desactivado.<br />
              Las compras anteriores se conservan.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setConfirmarElim(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={() => eliminar(confirmarElim)} style={{
                background: '#e74c3c', color: 'white', border: 'none',
                borderRadius: '8px', padding: '10px 20px',
                cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
