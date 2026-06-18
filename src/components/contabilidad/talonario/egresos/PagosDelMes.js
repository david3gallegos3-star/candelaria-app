// src/components/contabilidad/talonario/egresos/PagosDelMes.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';
import { generarAsientoPagoFijo } from '../../../../utils/asientosContables';

const VACIO = { fecha: '', beneficiario: '', concepto: '', monto: '', forma_pago: '20', comentario: '' };

const FORMA_LABEL = {
  transferencia: 'Transferencia',
  cheque:        'Cheque',
  deposito:      'Depósito',
};

const CUENTA_DEBE_OPTIONS = [
  { value: 'gasto_caja_id',    label: 'Gastos Generales' },
  { value: 'iess_pagar_id',    label: 'IESS por Pagar' },
  { value: 'sueldos_pagar_id', label: 'Sueldos por Pagar' },
];

const VACIO_FIJO = { nombre: '', codigo: '', monto_default: '', forma_pago: '20', cuenta_debe_key: 'gasto_caja_id', orden: 0 };

export default function PagosDelMes() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,         setFilas]         = useState([]);
  const [pagosCompras,  setPagosCompras]  = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [form,          setForm]          = useState(null);
  const [guardando,     setGuardando]     = useState(false);
  const [pagosFijos,    setPagosFijos]    = useState([]);
  const [montosEdit,    setMontosEdit]    = useState({});
  const [registrando,   setRegistrando]   = useState({});
  const [editandoFijo,  setEditandoFijo]  = useState(null);
  const [modalFijos,    setModalFijos]    = useState(false);
  const [formFijo,      setFormFijo]      = useState(null);
  const [guardandoFijo, setGuardandoFijo] = useState(false);

  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const ultimoDia  = new Date(año, mes, 0).getDate();
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

    const [{ data }, { data: pagos }, { data: fijos }] = await Promise.all([
      supabase.from('talonario_pagos_banco')
        .select('*').eq('mes', mes).eq('año', año).order('fecha'),
      supabase.from('pagos_compras')
        .select('id,monto,forma_pago,fecha_pago,notas,comision,proveedores(nombre),compras(es_personal)')
        .in('forma_pago', ['transferencia','cheque','deposito'])
        .gte('fecha_pago', fechaDesde).lte('fecha_pago', fechaHasta)
        .order('fecha_pago'),
      supabase.from('pagos_fijos')
        .select('*').order('orden').order('nombre'),
    ]);

    const filasMes = data || [];
    setFilas(filasMes);
    setPagosCompras((pagos || []).filter(p => !p.compras?.es_personal));
    setPagosFijos(fijos || []);

    const registradosIds = new Set(filasMes.filter(f => f.pago_fijo_id).map(f => f.pago_fijo_id));
    const initMontos = {};
    (fijos || []).forEach(f => {
      if (!registradosIds.has(f.id)) initMontos[f.id] = String(f.monto_default || '');
    });
    setMontosEdit(initMontos);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.concepto || !form.monto) return alert('Concepto y monto son requeridos');
    setGuardando(true);
    const payload = { mes, año, fecha: form.fecha || null, beneficiario: form.beneficiario || null,
      concepto: form.concepto, monto: parseFloat(form.monto),
      forma_pago: form.forma_pago, comentario: form.comentario || null };
    if (form.id) {
      await supabase.from('talonario_pagos_banco').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_pagos_banco').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_pagos_banco').delete().eq('id', id);
    cargar();
  }

  async function registrarPagoFijo(fijo) {
    const monto = parseFloat(montosEdit[fijo.id]) || 0;
    if (!monto) return alert('Ingresa un monto mayor a $0');
    setRegistrando(r => ({ ...r, [fijo.id]: true }));

    const { data: pago, error } = await supabase.from('talonario_pagos_banco').insert({
      mes, año,
      fecha:        new Date().toISOString().split('T')[0],
      beneficiario: fijo.nombre,
      concepto:     `${fijo.codigo} — ${fijo.nombre}`,
      monto,
      forma_pago:   fijo.forma_pago,
      pago_fijo_id: fijo.id,
    }).select('id').single();

    if (!error && pago) {
      generarAsientoPagoFijo({ id: pago.id, monto, codigo: fijo.codigo, cuenta_debe_key: fijo.cuenta_debe_key, mes, año })
        .catch(e => console.error('Asiento pago fijo:', e));
    }
    setRegistrando(r => ({ ...r, [fijo.id]: false }));
    cargar();
  }

  async function guardarEdicionFijo(fijo, filaExistente) {
    const monto = parseFloat(montosEdit[fijo.id]) || 0;
    if (!monto) return alert('Ingresa un monto mayor a $0');
    setRegistrando(r => ({ ...r, [fijo.id]: true }));

    await supabase.from('talonario_pagos_banco').update({ monto }).eq('id', filaExistente.id);
    await supabase.from('libro_diario').delete()
      .eq('origen', 'talonario_pagos_banco').eq('origen_id', filaExistente.id);
    generarAsientoPagoFijo({ id: filaExistente.id, monto, codigo: fijo.codigo, cuenta_debe_key: fijo.cuenta_debe_key, mes, año })
      .catch(e => console.error('Asiento pago fijo edit:', e));

    setRegistrando(r => ({ ...r, [fijo.id]: false }));
    setEditandoFijo(null);
    cargar();
  }

  async function guardarFijo() {
    if (!formFijo.nombre || !formFijo.codigo) return alert('Nombre y código son requeridos');
    setGuardandoFijo(true);
    const payload = {
      nombre:          formFijo.nombre.trim(),
      codigo:          formFijo.codigo.trim().toUpperCase(),
      monto_default:   parseFloat(formFijo.monto_default) || 0,
      forma_pago:      formFijo.forma_pago || '20',
      cuenta_debe_key: formFijo.cuenta_debe_key,
      orden:           parseInt(formFijo.orden) || 0,
    };
    if (formFijo.id) {
      await supabase.from('pagos_fijos').update(payload).eq('id', formFijo.id);
    } else {
      await supabase.from('pagos_fijos').insert(payload);
    }
    setGuardandoFijo(false);
    setFormFijo(null);
    cargar();
  }

  async function toggleActivoFijo(fijo) {
    await supabase.from('pagos_fijos').update({ activo: !fijo.activo }).eq('id', fijo.id);
    cargar();
  }

  async function eliminarFijo(id) {
    if (!window.confirm('¿Eliminar este pago fijo del catálogo?')) return;
    await supabase.from('pagos_fijos').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',        label: 'Fecha' },
    { key: 'beneficiario', label: 'Beneficiario' },
    { key: 'concepto',     label: 'Concepto' },
    { key: 'monto',        label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',   label: 'Forma Pago', render: f => {
      const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
      return fp ? fp.label : f.forma_pago;
    }},
    { key: 'comentario', label: 'Comentario' },
  ];

  const totalPagosCompras = pagosCompras.reduce((s, p) => s + parseFloat(p.monto||0), 0);
  const totalComisiones   = pagosCompras.reduce((s, p) => s + parseFloat(p.comision||0), 0);
  const fijosFiltrados    = pagosFijos.filter(f => f.activo);

  return (
    <>
      {/* Botón administrar fijos */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={() => setModalFijos(true)} style={{
          background: '#1a3a2a', color: 'white', border: 'none', borderRadius: 8,
          padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
        }}>⚙️ Administrar fijos</button>
      </div>

      {/* Sección Pagos Fijos del Mes */}
      {fijosFiltrados.length > 0 && (
        <div style={{ marginBottom: 16, background: 'white', borderRadius: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ background: '#2c3e50', color: 'white', padding: '10px 16px',
            fontWeight: 'bold', fontSize: 13 }}>
            📌 Pagos Fijos del Mes
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f7f5' }}>
                {['Código','Nombre','Cuenta','Monto','Estado'].map(h => (
                  <th key={h} style={{ padding: '7px 12px', textAlign: h === 'Monto' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fijosFiltrados.map(fijo => {
                const filaReg    = filas.find(f => f.pago_fijo_id === fijo.id);
                const cuentaLabel = CUENTA_DEBE_OPTIONS.find(o => o.value === fijo.cuenta_debe_key)?.label || fijo.cuenta_debe_key;
                const estaEditando = editandoFijo === fijo.id;

                return (
                  <tr key={fijo.id} style={{ borderBottom: '1px solid #f0f0f0',
                    background: filaReg ? '#f0fff4' : 'white' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1a3a2a', fontFamily: 'monospace' }}>
                      {fijo.codigo}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{fijo.nombre}</td>
                    <td style={{ padding: '8px 12px', color: '#666', fontSize: 11 }}>{cuentaLabel}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {filaReg && !estaEditando ? (
                        <span style={{ fontWeight: 'bold', color: '#27ae60' }}>
                          ${parseFloat(filaReg.monto||0).toFixed(2)}
                        </span>
                      ) : (
                        <input
                          type="number" min="0" step="0.01"
                          value={montosEdit[fijo.id] ?? String(fijo.monto_default || '')}
                          onChange={e => setMontosEdit(m => ({ ...m, [fijo.id]: e.target.value }))}
                          style={{ width: 90, padding: '4px 8px', borderRadius: 6,
                            border: '1px solid #ddd', fontSize: 12, textAlign: 'right' }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {filaReg && !estaEditando ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ Registrado</span>
                          {esAdminContador && (
                            <button onClick={() => {
                              setEditandoFijo(fijo.id);
                              setMontosEdit(m => ({ ...m, [fijo.id]: String(filaReg.monto || '') }));
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 11, color: '#2980b9' }}>✏️ Editar</button>
                          )}
                        </div>
                      ) : estaEditando ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => guardarEdicionFijo(fijo, filaReg)}
                            disabled={registrando[fijo.id]}
                            style={{ background: '#27ae60', color: 'white', border: 'none',
                              borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                            {registrando[fijo.id] ? '...' : '✓ Guardar'}
                          </button>
                          <button onClick={() => setEditandoFijo(null)}
                            style={{ background: '#f0f2f5', color: '#555', border: 'none',
                              borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => registrarPagoFijo(fijo)}
                          disabled={registrando[fijo.id]}
                          style={{ background: '#2c3e50', color: 'white', border: 'none',
                            borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                            fontSize: 11, fontWeight: 'bold' }}>
                          {registrando[fijo.id] ? '...' : '▶ Registrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TablaCrud
        titulo="🏧 Pagos del Mes"
        filas={filas.filter(f => !f.pago_fijo_id)}
        columnas={columnas}
        campoMonto="monto"
        cargando={cargando}
        esAdminContador={esAdminContador}
        onAgregar={() => setForm({ ...VACIO })}
        onEditar={f => setForm({ ...f })}
        onEliminar={eliminar}
      />

      {/* Pagos a proveedores (desde módulo Compras) */}
      {pagosCompras.length > 0 && (
        <div style={{ marginTop: 20, background: 'white', borderRadius: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ background: '#1a3a2a', color: 'white', padding: '10px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', fontSize: 13 }}>🏢 Pagos a Proveedores (módulo Compras)</span>
            <span style={{ fontSize: 13 }}>
              Total: ${totalPagosCompras.toFixed(2)}
              {totalComisiones > 0 && <span style={{ color: '#f9ca24', marginLeft: 8 }}>+ Comisiones: ${totalComisiones.toFixed(2)}</span>}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f7f5' }}>
                {['Fecha','Proveedor','Forma','Notas','Monto'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Monto' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagosCompras.map(p => (
                <React.Fragment key={p.id}>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '7px 10px', color: '#555' }}>{p.fecha_pago || '—'}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{p.proveedores?.nombre || '—'}</td>
                    <td style={{ padding: '7px 10px', color: '#666' }}>{FORMA_LABEL[p.forma_pago] || p.forma_pago}</td>
                    <td style={{ padding: '7px 10px', color: '#888', fontStyle: 'italic' }}>{p.notas || ''}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a3a2a' }}>
                      ${parseFloat(p.monto||0).toFixed(2)}
                    </td>
                  </tr>
                  {parseFloat(p.comision||0) > 0 && (
                    <tr style={{ background: '#fff8f8' }}>
                      <td colSpan={4} style={{ padding: '3px 10px 5px 24px', color: '#e74c3c', fontSize: 11 }}>
                        └ Comisión banco
                      </td>
                      <td style={{ padding: '3px 10px 5px', textAlign: 'right', color: '#e74c3c', fontSize: 11, fontWeight: 'bold' }}>
                        ${parseFloat(p.comision).toFixed(2)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal pago manual */}
      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar pago' : 'Nuevo pago del mes'}
            </h3>
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
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#e74c3c', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Administrar Fijos */}
      {modalFijos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24,
            width: 700, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>⚙️ Administrar Pagos Fijos</h3>
              <button onClick={() => { setModalFijos(false); setFormFijo(null); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {pagosFijos.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#f5f7f5' }}>
                    {['Cód','Nombre','Monto default','Forma pago','Cuenta DEBE','Orden','Activo',''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11,
                        fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagosFijos.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: f.activo ? 1 : 0.5 }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 'bold' }}>{f.codigo}</td>
                      <td style={{ padding: '6px 10px' }}>{f.nombre}</td>
                      <td style={{ padding: '6px 10px' }}>${parseFloat(f.monto_default||0).toFixed(2)}</td>
                      <td style={{ padding: '6px 10px' }}>
                        {FORMAS_PAGO.find(fp => fp.value === f.forma_pago)?.label || f.forma_pago}
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: 11 }}>
                        {CUENTA_DEBE_OPTIONS.find(o => o.value === f.cuenta_debe_key)?.label || f.cuenta_debe_key}
                      </td>
                      <td style={{ padding: '6px 10px' }}>{f.orden}</td>
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
                  {formFijo.id ? 'Editar pago fijo' : 'Nuevo pago fijo'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Nombre</label>
                    <input type="text" value={formFijo.nombre}
                      onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))}
                      placeholder="Ej: IESS mensual"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Código</label>
                    <input type="text" value={formFijo.codigo}
                      onChange={e => setFormFijo(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                      placeholder="Ej: IESS"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, fontFamily: 'monospace',
                        boxSizing: 'border-box' }} />
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
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Cuenta DEBE (libro diario)</label>
                    <select value={formFijo.cuenta_debe_key}
                      onChange={e => setFormFijo(p => ({ ...p, cuenta_debe_key: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12 }}>
                      {CUENTA_DEBE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
