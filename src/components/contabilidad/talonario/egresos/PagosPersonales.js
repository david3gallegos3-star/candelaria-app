// src/components/contabilidad/talonario/egresos/PagosPersonales.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';
import ConsumoPersonal from './ConsumoPersonal';

const CATEGORIAS = [
  { value: 'prestamos',       label: '🏦 Préstamos' },
  { value: 'tarjetas',        label: '💳 Tarjetas' },
  { value: 'gastos_personal', label: '👤 Gastos Personales' },
  { value: 'otros',           label: '📋 Otros' },
];

const FORMA_SRI = { efectivo: '01', transferencia: '20', cheque: '20', deposito: '20', credito: '19', tarjeta: '19' };

const SECCIONES = [
  { titulo: '🏦 Pagos Préstamo y Tarjeta', cats: ['prestamos', 'tarjetas'], color: '#1a5276' },
  { titulo: '👤 Pagos Gastos Personales',  cats: ['gastos_personal'],       color: '#6c3483' },
  { titulo: '📋 Otros Pagos Personales',   cats: ['otros'],                 color: '#117a65' },
];

const VACIO = { fecha: '', beneficiario: '', concepto: '', monto: '',
  categoria: 'prestamos', forma_pago: '20', comentario: '' };

const VACIO_FIJO = { nombre: '', categoria: 'gastos_personal', beneficiario: '',
  concepto: '', monto_default: '', forma_pago: '20', orden: 0 };

function SeccionPagos({ titulo, color, filas, busqueda, columnas, cargando,
  esAdminContador, onAgregar, onEditar, onEliminar, seleccionados, onToggleTodos }) {

  const filasFiltradas = busqueda
    ? filas.filter(f =>
        (f.beneficiario || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (f.concepto     || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (f.comentario   || '').toLowerCase().includes(busqueda.toLowerCase()))
    : filas;

  const total = filasFiltradas.reduce((s, f) => s + parseFloat(f.monto || 0), 0);
  const todosSelec = filasFiltradas.length > 0 && filasFiltradas.every(f => seleccionados.has(f.id));
  const algunoSelec = filasFiltradas.some(f => seleccionados.has(f.id));

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: color, color: 'white', borderRadius: '8px 8px 0 0',
        padding: '8px 14px', fontSize: 13, fontWeight: 'bold' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {esAdminContador && (
            <input
              type="checkbox"
              checked={todosSelec}
              ref={el => { if (el) el.indeterminate = algunoSelec && !todosSelec; }}
              onChange={() => onToggleTodos(filasFiltradas)}
              style={{ cursor: 'pointer', width: 15, height: 15 }}
              title={todosSelec ? 'Deseleccionar todos' : 'Seleccionar todos'}
            />
          )}
          <span>{titulo}</span>
        </div>
        <span>TOTAL: ${total.toFixed(2)}</span>
      </div>
      <div style={{ background: 'white', borderRadius: '0 0 8px 8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <TablaCrud
          titulo=""
          filas={filasFiltradas}
          columnas={columnas}
          campoMonto="monto"
          cargando={cargando}
          esAdminContador={esAdminContador}
          onAgregar={onAgregar}
          onEditar={onEditar}
          onEliminar={onEliminar}
          filaStyle={f => f.pago_fijo_personal_id ? { background: '#fff8e1' } : {}}
        />
      </div>
    </div>
  );
}

export default function PagosPersonales() {
  const { mes, año, esAdminContador, onEditarCompraPersonal } = useTalonario();
  const [filas,         setFilas]         = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [form,          setForm]          = useState(null);
  const [guardando,     setGuardando]     = useState(false);
  const [busqueda,      setBusqueda]      = useState('');
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [eliminando,    setEliminando]    = useState(false);
  const [pagosFijos,    setPagosFijos]    = useState([]);
  const [montosEdit,    setMontosEdit]    = useState({});
  const [registrando,   setRegistrando]   = useState({});
  const [modalFijos,    setModalFijos]    = useState(false);
  const [formFijo,      setFormFijo]      = useState(null);
  const [guardandoFijo, setGuardandoFijo] = useState(false);

  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${new Date(año, mes, 0).getDate()}`;

    const [{ data }, { data: cajas }, { data: fijos }, { data: comprasPersonales }] = await Promise.all([
      supabase.from('talonario_pagos_personales')
        .select('*').eq('mes', mes).eq('año', año).order('categoria').order('fecha'),
      supabase.from('caja_chica')
        .select('id, fecha')
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('pagos_fijos_personales')
        .select('*').order('orden').order('nombre'),
      supabase.from('compras')
        .select('id, fecha, proveedor_nombre, total, numero_factura, forma_pago')
        .eq('es_personal', true).neq('estado', 'anulada')
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    ]);

    setPagosFijos(fijos || []);
    const registradosIds = new Set((data || []).filter(f => f.pago_fijo_personal_id).map(f => f.pago_fijo_personal_id));
    const initMontos = {};
    (fijos || []).forEach(f => {
      if (!registradosIds.has(f.id)) initMontos[f.id] = String(f.monto_default || '');
    });
    setMontosEdit(initMontos);

    let gastosPersonales = [];
    const cajaIds = (cajas || []).map(c => c.id);
    if (cajaIds.length) {
      const { data: gp } = await supabase
        .from('caja_gastos')
        .select('id, caja_id, proveedor, detalle, valor')
        .in('caja_id', cajaIds)
        .eq('es_personal', true);

      const fechaMap = Object.fromEntries((cajas || []).map(c => [c.id, c.fecha]));
      gastosPersonales = (gp || []).map(g => ({
        id:           `caja_${g.id}`,
        fecha:        fechaMap[g.caja_id] || null,
        beneficiario: g.proveedor || null,
        concepto:     g.detalle || 'Gasto personal efectivo',
        monto:        parseFloat(g.valor || 0),
        categoria:    'otros',
        forma_pago:   '01',
        comentario:   'Registrado en Caja Chica',
        _readOnly:    true,
      }));
    }

    const comprasPersonalesNorm = (comprasPersonales || []).map(c => ({
      id:           `compra_${c.id}`,
      fecha:        c.fecha,
      beneficiario: c.proveedor_nombre,
      concepto:     c.numero_factura ? `Factura ${c.numero_factura}` : 'Compra personal',
      monto:        parseFloat(c.total || 0),
      categoria:    'gastos_personal',
      forma_pago:   FORMA_SRI[c.forma_pago] || '20',
      comentario:   'Registrada en módulo Compras',
      _readOnly:    true,
    }));

    setFilas([...(data || []), ...gastosPersonales, ...comprasPersonalesNorm]);
    setSeleccionados(new Set());
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  function toggleSeleccion(id) {
    setSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleTodos(filasSec) {
    const ids = filasSec.map(f => f.id);
    const todosSelec = ids.every(id => seleccionados.has(id));
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (todosSelec) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  }

  async function eliminarSeleccionados() {
    if (seleccionados.size === 0) return;
    if (!window.confirm(`¿Eliminar ${seleccionados.size} registro(s) seleccionado(s)?`)) return;
    setEliminando(true);
    await supabase.from('talonario_pagos_personales').delete().in('id', [...seleccionados]);
    setEliminando(false);
    cargar();
  }

  async function guardar() {
    if (form._readOnly) return setForm(null);
    if (!form.concepto || !form.monto) return alert('Concepto y monto son requeridos');
    setGuardando(true);
    const payload = { mes, año, fecha: form.fecha || null, beneficiario: form.beneficiario || null,
      concepto: form.concepto, monto: parseFloat(form.monto), categoria: form.categoria,
      forma_pago: form.forma_pago, comentario: form.comentario || null };
    if (form.id) {
      await supabase.from('talonario_pagos_personales').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_pagos_personales').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    if (String(id).startsWith('caja_')) return;
    await supabase.from('talonario_pagos_personales').delete().eq('id', id);
    cargar();
  }

  async function registrarPagoFijo(fijo) {
    const monto = parseFloat(montosEdit[fijo.id]) || 0;
    if (!monto) return alert('Ingresa un monto mayor a $0');
    setRegistrando(r => ({ ...r, [fijo.id]: true }));
    await supabase.from('talonario_pagos_personales').insert({
      mes, año,
      fecha:        new Date().toISOString().split('T')[0],
      beneficiario: fijo.beneficiario || fijo.nombre,
      concepto:     fijo.concepto || fijo.nombre,
      monto,
      categoria:    fijo.categoria,
      forma_pago:   fijo.forma_pago,
      pago_fijo_personal_id: fijo.id,
    });
    setRegistrando(r => ({ ...r, [fijo.id]: false }));
    cargar();
  }

  async function guardarFijo() {
    if (!formFijo.nombre) return alert('El nombre es requerido');
    setGuardandoFijo(true);
    const payload = {
      nombre:        formFijo.nombre.trim(),
      categoria:     formFijo.categoria,
      beneficiario:  formFijo.beneficiario.trim() || null,
      concepto:      formFijo.concepto.trim() || null,
      monto_default: parseFloat(formFijo.monto_default) || 0,
      forma_pago:    formFijo.forma_pago || '20',
      orden:         parseInt(formFijo.orden) || 0,
    };
    if (formFijo.id) {
      await supabase.from('pagos_fijos_personales').update(payload).eq('id', formFijo.id);
    } else {
      await supabase.from('pagos_fijos_personales').insert(payload);
    }
    setGuardandoFijo(false);
    setFormFijo(null);
    cargar();
  }

  async function toggleActivoFijo(fijo) {
    await supabase.from('pagos_fijos_personales').update({ activo: !fijo.activo }).eq('id', fijo.id);
    cargar();
  }

  async function eliminarFijo(id) {
    if (!window.confirm('¿Eliminar este pago fijo del catálogo?')) return;
    await supabase.from('pagos_fijos_personales').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    ...(esAdminContador ? [{
      key: '_sel',
      label: '',
      render: f => (
        <input
          type="checkbox"
          checked={seleccionados.has(f.id)}
          onChange={() => toggleSeleccion(f.id)}
          style={{ cursor: 'pointer' }}
          onClick={e => e.stopPropagation()}
        />
      ),
    }] : []),
    { key: 'fecha',        label: 'Fecha' },
    { key: 'categoria',    label: 'Categoría', render: f => CATEGORIAS.find(c => c.value === f.categoria)?.label || f.categoria },
    { key: 'beneficiario', label: 'Beneficiario' },
    { key: 'concepto',     label: 'Concepto' },
    { key: 'monto',        label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',   label: 'Forma Pago', render: f => {
      const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
      return fp ? fp.label : f.forma_pago;
    }},
    { key: 'comentario',   label: 'Comentario' },
  ];

  const totalGeneral = filas.reduce((s, f) => s + parseFloat(f.monto || 0), 0);
  const fijosFiltrados = pagosFijos.filter(f => f.activo && !filas.some(x => x.pago_fijo_personal_id === f.id));

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="🔍 Buscar beneficiario, concepto, banco..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
            border: '1.5px solid #ddd', fontSize: 13 }} />
        <div style={{ background: 'white', borderRadius: 8, padding: '8px 14px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', fontWeight: 'bold', fontSize: 13, color: '#1a5276' }}>
          TOTAL: ${totalGeneral.toFixed(2)}
        </div>
        {esAdminContador && seleccionados.size > 0 && (
          <button onClick={eliminarSeleccionados} disabled={eliminando}
            style={{ background: eliminando ? '#95a5a6' : '#e74c3c', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 16px', cursor: eliminando ? 'not-allowed' : 'pointer',
              fontWeight: 'bold', fontSize: 13 }}>
            {eliminando ? '⏳ Eliminando...' : `🗑️ Eliminar ${seleccionados.size} seleccionado(s)`}
          </button>
        )}
        {esAdminContador && (
          <button onClick={() => setModalFijos(true)} style={{
            background: '#1a3a2a', color: 'white', border: 'none', borderRadius: 8,
            padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
          }}>⚙️ Administrar fijos</button>
        )}
        {esAdminContador && (
          <button onClick={() => setForm({ ...VACIO })}
            style={{ background: '#27ae60', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
            + Agregar
          </button>
        )}
      </div>

      {fijosFiltrados.length > 0 && (
        <div style={{ marginBottom: 16, background: 'white', borderRadius: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ background: '#2c3e50', color: 'white', padding: '10px 16px',
            fontWeight: 'bold', fontSize: 13 }}>
            📌 Pagos Fijos Personales del Mes
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f7f5' }}>
                {['Nombre','Categoría','Monto','Estado'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: h === 'Monto' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fijosFiltrados.map(fijo => (
                <tr key={fijo.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1a3a2a' }}>{fijo.nombre}</td>
                  <td style={{ padding: '8px 12px', color: '#666', fontSize: 11 }}>
                    {CATEGORIAS.find(c => c.value === fijo.categoria)?.label || fijo.categoria}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <input
                      type="number" min="0" step="0.01"
                      value={montosEdit[fijo.id] ?? String(fijo.monto_default || '')}
                      onChange={e => setMontosEdit(m => ({ ...m, [fijo.id]: e.target.value }))}
                      style={{ width: 90, padding: '4px 8px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <button onClick={() => registrarPagoFijo(fijo)}
                      disabled={registrando[fijo.id]}
                      style={{ background: '#2c3e50', color: 'white', border: 'none',
                        borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                        fontSize: 11, fontWeight: 'bold' }}>
                      {registrando[fijo.id] ? '...' : '▶ Registrar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {SECCIONES.map(sec => (
        <SeccionPagos
          key={sec.titulo}
          titulo={sec.titulo}
          color={sec.color}
          filas={filas.filter(f => sec.cats.includes(f.categoria))}
          busqueda={busqueda}
          columnas={columnas}
          cargando={cargando}
          esAdminContador={esAdminContador}
          onAgregar={() => setForm({ ...VACIO, categoria: sec.cats[0] })}
          onEditar={f => {
            if (typeof f.id === 'string' && f.id.startsWith('compra_')) {
              onEditarCompraPersonal(f.id.replace('compra_', ''));
              return;
            }
            setForm({ ...f });
          }}
          onEliminar={eliminar}
          seleccionados={seleccionados}
          onToggleTodos={toggleTodos}
        />
      ))}

      <ConsumoPersonal />

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar pago personal' : 'Nuevo pago personal'}
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Categoría</label>
              <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {[
              ['fecha',        'Fecha',        'date'],
              ['beneficiario', 'Beneficiario', 'text'],
              ['concepto',     'Concepto',     'text'],
              ['monto',        'Monto ($)',     'number'],
              ['comentario',   'Comentario',   'text'],
            ].map(([key, lbl, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Forma de Pago</label>
              <select value={form.forma_pago || '20'} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd',
                  background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFijos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24,
            width: 600, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>⚙️ Administrar Pagos Fijos Personales</h3>
              <button onClick={() => { setModalFijos(false); setFormFijo(null); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {pagosFijos.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#f5f7f5' }}>
                    {['Nombre','Categoría','Monto default','Activo',''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11,
                        fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagosFijos.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: f.activo ? 1 : 0.5 }}>
                      <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>{f.nombre}</td>
                      <td style={{ padding: '6px 10px', fontSize: 11 }}>
                        {CATEGORIAS.find(c => c.value === f.categoria)?.label || f.categoria}
                      </td>
                      <td style={{ padding: '6px 10px' }}>${parseFloat(f.monto_default||0).toFixed(2)}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <button onClick={() => toggleActivoFijo(f)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                          {f.activo ? '✅' : '⬜'}
                        </button>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setFormFijo({ ...f })}
                            style={{ background: '#2980b9', color: 'white', border: 'none',
                              borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✏️</button>
                          <button onClick={() => eliminarFijo(f.id)}
                            style={{ background: '#e74c3c', color: 'white', border: 'none',
                              borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {formFijo ? (
              <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, border: '1.5px solid #ddd' }}>
                <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
                  {formFijo.id ? 'Editar pago fijo' : 'Nuevo pago fijo personal'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Nombre</label>
                    <input type="text" value={formFijo.nombre}
                      onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))}
                      placeholder="Ej: Joaquín — Escuela"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Categoría</label>
                    <select value={formFijo.categoria}
                      onChange={e => setFormFijo(p => ({ ...p, categoria: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12 }}>
                      {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Beneficiario</label>
                    <input type="text" value={formFijo.beneficiario}
                      onChange={e => setFormFijo(p => ({ ...p, beneficiario: e.target.value }))}
                      placeholder="Ej: Joaquín Escuela"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Concepto</label>
                    <input type="text" value={formFijo.concepto}
                      onChange={e => setFormFijo(p => ({ ...p, concepto: e.target.value }))}
                      placeholder="Ej: Pensión mensual"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Monto default ($)</label>
                    <input type="number" min="0" step="0.01" value={formFijo.monto_default}
                      onChange={e => setFormFijo(p => ({ ...p, monto_default: e.target.value }))}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Forma de pago</label>
                    <select value={formFijo.forma_pago}
                      onChange={e => setFormFijo(p => ({ ...p, forma_pago: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12 }}>
                      {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Orden</label>
                    <input type="number" min="0" value={formFijo.orden}
                      onChange={e => setFormFijo(p => ({ ...p, orden: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                  <button onClick={() => setFormFijo(null)}
                    style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #ddd',
                      background: 'white', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                  <button onClick={guardarFijo} disabled={guardandoFijo}
                    style={{ padding: '8px 18px', borderRadius: 6, border: 'none',
                      background: '#1a3a2a', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                    {guardandoFijo ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setFormFijo({ ...VACIO_FIJO })}
                style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: 8,
                  padding: '9px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
                + Nuevo pago fijo
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
