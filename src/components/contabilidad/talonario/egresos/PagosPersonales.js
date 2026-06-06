// src/components/contabilidad/talonario/egresos/PagosPersonales.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';

const CATEGORIAS = [
  { value: 'prestamos',       label: '🏦 Préstamos' },
  { value: 'tarjetas',        label: '💳 Tarjetas' },
  { value: 'gastos_personal', label: '👤 Gastos Personales' },
  { value: 'otros',           label: '📋 Otros' },
];

const SECCIONES = [
  { titulo: '🏦 Pagos Préstamo y Tarjeta', cats: ['prestamos', 'tarjetas'], color: '#1a5276' },
  { titulo: '👤 Pagos Gastos Personales',  cats: ['gastos_personal'],       color: '#6c3483' },
  { titulo: '📋 Otros Pagos Personales',   cats: ['otros'],                 color: '#117a65' },
];

const VACIO = { fecha: '', beneficiario: '', concepto: '', monto: '',
  categoria: 'prestamos', forma_pago: '20', comentario: '' };

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
        />
      </div>
    </div>
  );
}

export default function PagosPersonales() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,         setFilas]         = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [form,          setForm]          = useState(null);
  const [guardando,     setGuardando]     = useState(false);
  const [busqueda,      setBusqueda]      = useState('');
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [eliminando,    setEliminando]    = useState(false);

  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${new Date(año, mes, 0).getDate()}`;

    const [{ data }, { data: cajas }] = await Promise.all([
      supabase.from('talonario_pagos_personales')
        .select('*').eq('mes', mes).eq('año', año).order('categoria').order('fecha'),
      supabase.from('caja_chica')
        .select('id, fecha')
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    ]);

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
        categoria:    'gastos_personal',
        forma_pago:   '01',
        comentario:   'Registrado en Caja Chica',
        _readOnly:    true,
      }));
    }

    setFilas([...(data || []), ...gastosPersonales]);
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
          <button onClick={() => setForm({ ...VACIO })}
            style={{ background: '#27ae60', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
            + Agregar
          </button>
        )}
      </div>

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
          onEditar={f => setForm({ ...f })}
          onEliminar={eliminar}
          seleccionados={seleccionados}
          onToggleTodos={toggleTodos}
        />
      ))}

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
    </>
  );
}
