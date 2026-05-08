// ============================================
// TabEmpleados.js
// CRUD completo de empleados
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

const CARGO_OPTIONS = [
  'Operario de producción', 'Bodeguero', 'Vendedor', 'Contador/a',
  'Administrador/a', 'Chofer', 'Supervisor de producción', 'Otro'
];
const TIPO_CONTRATO = ['Tiempo completo', 'Tiempo parcial', 'Eventual', 'Por obra'];
const EMPTY_FORM = {
  cedula: '', nombre: '', cargo: 'Operario de producción',
  tipo_contrato: 'Tiempo completo', fecha_ingreso: '',
  sueldo_base: '', telefono: '', email: '',
  afiliado_iess: true, porcentaje_iess_empleado: 9.45,
  porcentaje_iess_patronal: 12.15, notas: ''
};

export default function TabEmpleados({ mobile }) {
  const [empleados,    setEmpleados]    = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [busqueda,     setBusqueda]     = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando,     setEditando]     = useState(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [guardando,    setGuardando]    = useState(false);
  const [error,        setError]        = useState('');
  const [confirmarElim,setConfirmarElim]= useState(null);
  const [soloActivos,  setSoloActivos]  = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase.from('empleados').select('*').order('nombre');
    if (soloActivos) q = q.eq('activo', true).is('deleted_at', null);
    const { data } = await q;
    setEmpleados(data || []);
    setCargando(false);
  }, [soloActivos]);

  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['empleados'], cargar);

  const filtrados = empleados.filter(e =>
    e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (e.cedula || '').includes(busqueda) ||
    (e.cargo  || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...EMPTY_FORM, fecha_ingreso: new Date().toISOString().slice(0,10) });
    setError('');
    setModalAbierto(true);
  }

  function abrirEditar(e) {
    setEditando(e);
    setForm({
      cedula:                    e.cedula                    || '',
      nombre:                    e.nombre                    || '',
      cargo:                     e.cargo                     || 'Operario de producción',
      tipo_contrato:             e.tipo_contrato             || 'Tiempo completo',
      fecha_ingreso:             e.fecha_ingreso             || '',
      sueldo_base:               e.sueldo_base               || '',
      telefono:                  e.telefono                  || '',
      email:                     e.email                     || '',
      afiliado_iess:             e.afiliado_iess             ?? true,
      porcentaje_iess_empleado:  e.porcentaje_iess_empleado  || 9.45,
      porcentaje_iess_patronal:  e.porcentaje_iess_patronal  || 12.15,
      notas:                     e.notas                     || ''
    });
    setError('');
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false); setEditando(null);
    setForm(EMPTY_FORM); setError('');
  }

  async function guardar() {
    if (!form.nombre.trim())    { setError('El nombre es obligatorio.'); return; }
    if (!form.cedula.trim())    { setError('La cédula es obligatoria.');  return; }
    if (!form.sueldo_base || parseFloat(form.sueldo_base) <= 0) {
      setError('El sueldo base debe ser mayor a 0.'); return;
    }
    setGuardando(true); setError('');

    const payload = {
      cedula:                   form.cedula.trim(),
      nombre:                   form.nombre.trim(),
      cargo:                    form.cargo,
      tipo_contrato:            form.tipo_contrato,
      fecha_ingreso:            form.fecha_ingreso || null,
      sueldo_base:              parseFloat(form.sueldo_base),
      telefono:                 form.telefono.trim() || null,
      email:                    form.email.trim() || null,
      afiliado_iess:            form.afiliado_iess,
      porcentaje_iess_empleado: parseFloat(form.porcentaje_iess_empleado) || 9.45,
      porcentaje_iess_patronal: parseFloat(form.porcentaje_iess_patronal) || 12.15,
      notas:                    form.notas.trim() || null,
      updated_at:               new Date().toISOString()
    };

    let err;
    if (editando) {
      ({ error: err } = await supabase.from('empleados').update(payload).eq('id', editando.id));
    } else {
      ({ error: err } = await supabase.from('empleados').insert({ ...payload, activo: true }));
    }

    if (err) { setError(err.message); setGuardando(false); return; }
    await cargar();
    cerrarModal();
    setGuardando(false);
  }

  async function desactivar(e) {
    await supabase.from('empleados').update({
      activo: false, deleted_at: new Date().toISOString()
    }).eq('id', e.id);
    setConfirmarElim(null);
    await cargar();
  }

  // Calcular aportes IESS para mostrar en tarjeta
  function calcAportes(emp) {
    const s = emp.sueldo_base || 0;
    return {
      empleado:  (s * (emp.porcentaje_iess_empleado || 9.45) / 100),
      patronal:  (s * (emp.porcentaje_iess_patronal || 12.15) / 100),
      neto:      s - (s * (emp.porcentaje_iess_empleado || 9.45) / 100)
    };
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
  const labelStyle = {
    display: 'block', fontSize: '12px',
    color: '#555', marginBottom: '4px', fontWeight: '600'
  };

  return (
    <div>
      {/* Barra superior */}
      <div style={{ ...card, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, cédula o cargo..."
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
        <button onClick={abrirNuevo} style={{
          background: 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 16px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>+ Nuevo empleado</button>
      </div>

      {/* Total */}
      <div style={{ color: '#666', fontSize: '12px', marginBottom: '10px', paddingLeft: '4px' }}>
        {filtrados.length} empleado{filtrados.length !== 1 ? 's' : ''}
        {' · '}Planilla total: <b style={{ color: '#2c1a4a' }}>
          ${filtrados.reduce((s, e) => s + (e.sueldo_base || 0), 0).toFixed(2)}
        </b>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando empleados...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          {busqueda ? 'No hay resultados.' : 'Aún no tienes empleados registrados.'}
        </div>
      ) : (
        filtrados.map(emp => {
          const ap = calcAportes(emp);
          return (
            <div key={emp.id} style={{ ...card, borderLeft: `4px solid ${emp.activo ? '#4a2c7a' : '#aaa'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  {/* Nombre + badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#2c1a4a' }}>
                      👤 {emp.nombre}
                    </span>
                    <span style={{
                      background: '#4a2c7a', color: 'white', borderRadius: '12px',
                      padding: '2px 10px', fontSize: '11px', fontWeight: 'bold'
                    }}>{emp.cargo}</span>
                    {!emp.activo && (
                      <span style={{ background: '#aaa', color: 'white', borderRadius: '12px', padding: '2px 8px', fontSize: '11px' }}>
                        Inactivo
                      </span>
                    )}
                    {emp.afiliado_iess && (
                      <span style={{ background: '#eaf4ff', color: '#2980b9', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                        🏛️ IESS
                      </span>
                    )}
                  </div>

                  {/* Datos */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, auto)',
                    gap: '4px 20px', fontSize: '12px', color: '#555'
                  }}>
                    <span>🪪 {emp.cedula}</span>
                    <span>📅 Ingreso: {emp.fecha_ingreso || '—'}</span>
                    <span>📋 {emp.tipo_contrato}</span>
                    {emp.telefono && <span>📞 {emp.telefono}</span>}
                  </div>

                  {/* Sueldo y aportes */}
                  <div style={{
                    display: 'flex', gap: '16px', flexWrap: 'wrap',
                    marginTop: '8px', fontSize: '12px'
                  }}>
                    <span style={{ fontWeight: 'bold', color: '#27ae60' }}>
                      💵 Sueldo: ${(emp.sueldo_base || 0).toFixed(2)}
                    </span>
                    {emp.afiliado_iess && (
                      <>
                        <span style={{ color: '#e74c3c' }}>
                          IESS emp.: ${ap.empleado.toFixed(2)}
                        </span>
                        <span style={{ color: '#8e44ad' }}>
                          IESS pat.: ${ap.patronal.toFixed(2)}
                        </span>
                        <span style={{ color: '#27ae60', fontWeight: 'bold' }}>
                          Neto: ${ap.neto.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => abrirEditar(emp)} style={{
                    background: '#f0f2f5', border: 'none', borderRadius: '8px',
                    padding: '7px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                  }}>✏️ Editar</button>
                  {emp.activo && (
                    <button onClick={() => setConfirmarElim(emp)} style={{
                      background: '#ffeaea', border: 'none', borderRadius: '8px',
                      padding: '7px 10px', cursor: 'pointer', fontSize: '12px', color: '#e74c3c'
                    }}>🗑️</button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* ── Modal Nuevo/Editar ── */}
      {modalAbierto && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '600px', maxHeight: '90vh',
            overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 20px', color: '#2c1a4a' }}>
              {editando ? '✏️ Editar empleado' : '+ Nuevo empleado'}
            </h3>

            {/* Nombre + Cédula */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Nombre completo *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  style={inputStyle} placeholder="Juan Pérez" />
              </div>
              <div>
                <label style={labelStyle}>Cédula *</label>
                <input value={form.cedula} onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))}
                  style={inputStyle} placeholder="1004007884" />
              </div>
            </div>

            {/* Cargo + Tipo contrato */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Cargo</label>
                <select value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} style={inputStyle}>
                  {CARGO_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tipo de contrato</label>
                <select value={form.tipo_contrato} onChange={e => setForm(f => ({ ...f, tipo_contrato: e.target.value }))} style={inputStyle}>
                  {TIPO_CONTRATO.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Sueldo + Fecha ingreso */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Sueldo base (USD) *</label>
                <input type="number" min="0" step="0.01" value={form.sueldo_base}
                  onChange={e => setForm(f => ({ ...f, sueldo_base: e.target.value }))}
                  style={inputStyle} placeholder="460.00" />
              </div>
              <div>
                <label style={labelStyle}>Fecha de ingreso</label>
                <input type="date" value={form.fecha_ingreso}
                  onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))}
                  style={inputStyle} />
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
                  style={inputStyle} placeholder="juan@ejemplo.com" />
              </div>
            </div>

            {/* IESS */}
            <div style={{
              background: '#eaf4ff', borderRadius: '10px',
              padding: '12px', marginBottom: '14px'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '10px' }}>
                <input type="checkbox" checked={form.afiliado_iess}
                  onChange={e => setForm(f => ({ ...f, afiliado_iess: e.target.checked }))} />
                <b>Afiliado al IESS</b>
              </label>
              {form.afiliado_iess && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>% Aporte empleado</label>
                    <input type="number" step="0.01" value={form.porcentaje_iess_empleado}
                      onChange={e => setForm(f => ({ ...f, porcentaje_iess_empleado: e.target.value }))}
                      style={inputStyle} />
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>
                      = ${form.sueldo_base ? (parseFloat(form.sueldo_base) * parseFloat(form.porcentaje_iess_empleado) / 100).toFixed(2) : '0.00'}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>% Aporte patronal</label>
                    <input type="number" step="0.01" value={form.porcentaje_iess_patronal}
                      onChange={e => setForm(f => ({ ...f, porcentaje_iess_patronal: e.target.value }))}
                      style={inputStyle} />
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>
                      = ${form.sueldo_base ? (parseFloat(form.sueldo_base) * parseFloat(form.porcentaje_iess_patronal) / 100).toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notas */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Notas</label>
              <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
                placeholder="Observaciones, acuerdos especiales..." />
            </div>

            {error && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: '8px',
                padding: '10px', color: '#e74c3c', fontSize: '13px', marginBottom: '16px'
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={cerrarModal} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
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

      {/* Confirmar desactivar */}
      {confirmarElim && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '28px',
            maxWidth: '400px', width: '100%', textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', color: '#2c1a4a' }}>¿Desactivar empleado?</h3>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: '24px' }}>
              <b>{confirmarElim.nombre}</b> quedará inactivo.<br />
              Su historial de nómina se conserva.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setConfirmarElim(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={() => desactivar(confirmarElim)} style={{
                background: '#e74c3c', color: 'white', border: 'none',
                borderRadius: '8px', padding: '10px 20px',
                cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>Sí, desactivar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
