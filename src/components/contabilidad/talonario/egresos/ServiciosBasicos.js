// src/components/contabilidad/talonario/egresos/ServiciosBasicos.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { FORMAS_PAGO } from '../shared/TablaCrud';
import { generarAsientoPagoFijo } from '../../../../utils/asientosContables';

const TIPO_MOD_CIF_OPTIONS = [
  { value: '',          label: '— Sin vinculación —' },
  { value: 'directa',   label: 'MOD Directa' },
  { value: 'indirecta', label: 'MOD Indirecta' },
  { value: 'cif',       label: 'CIF' },
];

const VACIO_FIJO = {
  nombre: '', empresa: '', monto_default: '', forma_pago: '01',
  orden: 0, tipo_mod_cif: '', mod_cif_row_id: '',
};

async function syncModCifRow(fijo, monto) {
  if (!fijo.tipo_mod_cif || !fijo.mod_cif_row_id) return;
  const tabla = fijo.tipo_mod_cif === 'cif' ? 'cif_items'
    : fijo.tipo_mod_cif === 'directa' ? 'mod_directa' : 'mod_indirecta';
  const campo = fijo.tipo_mod_cif === 'cif' ? 'valor_mes' : 'sueldo_mes';
  await supabase.from(tabla).update({ [campo]: monto }).eq('id', fijo.mod_cif_row_id);
}

export default function ServiciosBasicos() {
  const { mes, año, esAdminContador } = useTalonario();
  const [catalogo,      setCatalogo]      = useState([]);
  const [registrosCaja, setRegistrosCaja] = useState([]);
  const [registrosBanco,setRegistrosBanco]= useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [montosEdit,    setMontosEdit]    = useState({});
  const [facturaEdit,   setFacturaEdit]   = useState({});
  const [registrando,   setRegistrando]   = useState({});
  const [editando,      setEditando]      = useState(null);
  const [modalCat,      setModalCat]      = useState(false);
  const [formFijo,      setFormFijo]      = useState(null);
  const [guardandoFijo, setGuardandoFijo] = useState(false);
  const [modCifRows,    setModCifRows]    = useState({ directa: [], indirecta: [], cif: [] });

  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const ultimoDia  = new Date(año, mes, 0).getDate();
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

    const [{ data: fijos }, { data: bancoRows }, { data: cajasMes }] = await Promise.all([
      supabase.from('pagos_fijos_servicios_basicos').select('*').order('orden').order('nombre'),
      supabase.from('talonario_pagos_banco')
        .select('*').eq('mes', mes).eq('año', año).not('origen_servicio_basico_id', 'is', null),
      supabase.from('caja_chica').select('id').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    ]);

    let regCaja = [];
    const cajaIds = (cajasMes || []).map(c => c.id);
    if (cajaIds.length) {
      const { data: gc } = await supabase
        .from('caja_gastos').select('*').in('caja_id', cajaIds).not('origen_servicio_basico_id', 'is', null);
      regCaja = gc || [];
    }

    setCatalogo(fijos || []);
    setRegistrosCaja(regCaja);
    setRegistrosBanco(bancoRows || []);

    const registradosIds = new Set([
      ...regCaja.map(r => r.origen_servicio_basico_id),
      ...(bancoRows || []).map(r => r.origen_servicio_basico_id),
    ]);
    const initMontos = {};
    (fijos || []).forEach(f => {
      if (!registradosIds.has(f.id)) initMontos[f.id] = String(f.monto_default || '');
    });
    setMontosEdit(initMontos);
    setCargando(false);
  }

  async function cargarModCifRows() {
    const [{ data: d }, { data: i }, { data: c }] = await Promise.all([
      supabase.from('mod_directa').select('id,nombre').order('orden'),
      supabase.from('mod_indirecta').select('id,nombre').order('orden'),
      supabase.from('cif_items').select('id,detalle').order('orden'),
    ]);
    setModCifRows({ directa: d||[], indirecta: i||[], cif: c||[] });
  }

  useEffect(() => { cargar(); }, [mes, año]);
  useEffect(() => { if (modalCat) cargarModCifRows(); }, [modalCat]);

  function registroDe(fijo) {
    return registrosCaja.find(r => r.origen_servicio_basico_id === fijo.id)
      || registrosBanco.find(r => r.origen_servicio_basico_id === fijo.id);
  }

  async function registrar(fijo) {
    const monto = parseFloat(montosEdit[fijo.id]) || 0;
    if (!monto) return alert('Ingresa un monto mayor a $0');
    setRegistrando(r => ({ ...r, [fijo.id]: true }));
    const numeroFactura = facturaEdit[fijo.id] || null;
    const esEfectivo = fijo.forma_pago === '01';

    let registroId = null;
    let origenAsiento = 'talonario_pagos_banco';

    if (esEfectivo) {
      const hoy = new Date().toISOString().split('T')[0];
      let { data: cajaDia } = await supabase.from('caja_chica').select('id').eq('fecha', hoy).maybeSingle();
      if (!cajaDia) {
        const { data: nuevaCaja } = await supabase
          .from('caja_chica').insert({ fecha: hoy, responsable: '', caja_inicial: 0, caja_cierre: 0 })
          .select().single();
        cajaDia = nuevaCaja;
      }
      const { data: gasto } = await supabase.from('caja_gastos').insert({
        caja_id: cajaDia.id,
        proveedor: fijo.empresa || fijo.nombre,
        detalle: fijo.nombre,
        valor: monto,
        es_personal: false,
        numero_factura: numeroFactura,
        origen_servicio_basico_id: fijo.id,
      }).select('id').single();
      registroId = gasto?.id || null;
      origenAsiento = 'caja_gastos';
    } else {
      const { data: pago } = await supabase.from('talonario_pagos_banco').insert({
        mes, año,
        fecha: new Date().toISOString().split('T')[0],
        concepto: fijo.nombre,
        beneficiario: fijo.empresa || fijo.nombre,
        monto,
        numero_factura: numeroFactura,
        origen_servicio_basico_id: fijo.id,
      }).select('id').single();
      registroId = pago?.id || null;
    }

    if (registroId) {
      generarAsientoPagoFijo({
        id: registroId, monto, codigo: fijo.nombre, cuenta_debe_key: 'gasto_caja_id',
        mes, año, formaPago: fijo.forma_pago, origen: origenAsiento,
      }).catch(e => console.error('Asiento servicio básico:', e));
      syncModCifRow(fijo, monto).catch(e => console.error('Sync MOD+CIF:', e));
    }

    setRegistrando(r => ({ ...r, [fijo.id]: false }));
    cargar();
  }

  async function guardarEdicion(fijo, registro) {
    const monto = parseFloat(montosEdit[fijo.id]) || 0;
    if (!monto) return alert('Ingresa un monto mayor a $0');
    setRegistrando(r => ({ ...r, [fijo.id]: true }));
    const numeroFactura = facturaEdit[fijo.id] || null;
    const esEfectivo = fijo.forma_pago === '01';
    const tabla = esEfectivo ? 'caja_gastos' : 'talonario_pagos_banco';
    const campoMonto = esEfectivo ? 'valor' : 'monto';

    await supabase.from(tabla).update({ [campoMonto]: monto, numero_factura: numeroFactura }).eq('id', registro.id);
    await supabase.from('libro_diario').delete().eq('origen', tabla).eq('origen_id', registro.id);
    generarAsientoPagoFijo({
      id: registro.id, monto, codigo: fijo.nombre, cuenta_debe_key: 'gasto_caja_id',
      mes, año, formaPago: fijo.forma_pago, origen: tabla,
    }).catch(e => console.error('Asiento servicio básico edit:', e));
    syncModCifRow(fijo, monto).catch(e => console.error('Sync MOD+CIF edit:', e));

    setRegistrando(r => ({ ...r, [fijo.id]: false }));
    setEditando(null);
    cargar();
  }

  async function eliminarRegistro(fijo, registro) {
    if (!window.confirm('¿Eliminar este registro del mes?')) return;
    const esEfectivo = fijo.forma_pago === '01';
    const tabla = esEfectivo ? 'caja_gastos' : 'talonario_pagos_banco';
    await supabase.from(tabla).delete().eq('id', registro.id);
    cargar();
  }

  async function guardarFijo() {
    if (!formFijo.nombre) return alert('El nombre es requerido');
    setGuardandoFijo(true);

    let modCifRowId = formFijo.mod_cif_row_id || null;
    if (formFijo.tipo_mod_cif && formFijo.mod_cif_row_id === 'NUEVO') {
      const tabla = formFijo.tipo_mod_cif === 'cif' ? 'cif_items'
        : formFijo.tipo_mod_cif === 'directa' ? 'mod_directa' : 'mod_indirecta';
      const maxOrden = (formFijo.tipo_mod_cif === 'cif' ? modCifRows.cif
        : formFijo.tipo_mod_cif === 'directa' ? modCifRows.directa : modCifRows.indirecta).length;
      const rowPayload = formFijo.tipo_mod_cif === 'cif'
        ? { detalle: formFijo.nombre.trim(), valor_mes: 0, porcentaje_merma: 0, costo_kg: 0, orden: maxOrden }
        : { nombre: formFijo.nombre.trim(), horas_mes: 240, sueldo_mes: 0, costo_kg: 0, orden: maxOrden };
      const { data: newRow } = await supabase.from(tabla).insert(rowPayload).select('id').single();
      modCifRowId = newRow?.id || null;
    }
    if (!formFijo.tipo_mod_cif) modCifRowId = null;

    const payload = {
      nombre: formFijo.nombre.trim(),
      empresa: formFijo.empresa?.trim() || null,
      monto_default: parseFloat(formFijo.monto_default) || 0,
      forma_pago: formFijo.forma_pago || '01',
      orden: parseInt(formFijo.orden) || 0,
      tipo_mod_cif: formFijo.tipo_mod_cif || null,
      mod_cif_row_id: modCifRowId,
    };
    if (formFijo.id) {
      await supabase.from('pagos_fijos_servicios_basicos').update(payload).eq('id', formFijo.id);
    } else {
      await supabase.from('pagos_fijos_servicios_basicos').insert(payload);
    }
    setGuardandoFijo(false);
    setFormFijo(null);
    cargarModCifRows();
    cargar();
  }

  async function toggleActivo(fijo) {
    await supabase.from('pagos_fijos_servicios_basicos').update({ activo: !fijo.activo }).eq('id', fijo.id);
    cargar();
  }

  async function eliminarFijo(id) {
    if (!window.confirm('¿Eliminar este servicio básico del catálogo?')) return;
    await supabase.from('pagos_fijos_servicios_basicos').delete().eq('id', id);
    cargar();
  }

  const rowsParaTipo = (tipo) => {
    if (tipo === 'directa')   return modCifRows.directa.map(r => ({ id: r.id, label: r.nombre }));
    if (tipo === 'indirecta') return modCifRows.indirecta.map(r => ({ id: r.id, label: r.nombre }));
    if (tipo === 'cif')       return modCifRows.cif.map(r => ({ id: r.id, label: r.detalle }));
    return [];
  };
  const tipoLabel = (tipo) => TIPO_MOD_CIF_OPTIONS.find(o => o.value === tipo)?.label || '—';
  const catalogoActivo = catalogo.filter(f => f.activo);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={() => setModalCat(true)} style={{
          background: '#1a3a2a', color: 'white', border: 'none', borderRadius: 8,
          padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
        }}>⚙️ Administrar servicios</button>
      </div>

      <div style={{ background: 'white', borderRadius: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: '#2c3e50', color: 'white', padding: '10px 16px',
          fontWeight: 'bold', fontSize: 13 }}>
          🔌 Servicios Básicos del Mes
        </div>
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Cargando...</div>
        ) : catalogoActivo.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
            Sin servicios básicos en el catálogo
          </div>
        ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f5f7f5' }}>
              {['Nombre','Empresa','Monto','Nº Factura','Estado'].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: h === 'Monto' ? 'right' : 'left',
                  fontSize: 11, fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalogoActivo.map(fijo => {
              const registro = registroDe(fijo);
              const estaEditando = editando === fijo.id;
              return (
                <tr key={fijo.id} style={{ borderBottom: '1px solid #f0f0f0',
                  background: registro ? '#f0fff4' : 'white' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1a3a2a' }}>
                    {fijo.nombre}
                    {fijo.tipo_mod_cif && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: '#eaf4ff',
                        color: '#2980b9', borderRadius: 4, padding: '1px 5px' }}>
                        {tipoLabel(fijo.tipo_mod_cif)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>{fijo.empresa || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {registro && !estaEditando ? (
                      <span style={{ fontWeight: 'bold', color: '#27ae60' }}>
                        ${parseFloat(registro.valor ?? registro.monto ?? 0).toFixed(2)}
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
                    {registro && !estaEditando ? (
                      <span style={{ color: '#666' }}>{registro.numero_factura || '—'}</span>
                    ) : (
                      <input type="text"
                        value={facturaEdit[fijo.id] ?? (registro?.numero_factura || '')}
                        onChange={e => setFacturaEdit(f => ({ ...f, [fijo.id]: e.target.value }))}
                        placeholder="001-001-000000001"
                        style={{ width: 130, padding: '4px 8px', borderRadius: 6,
                          border: '1px solid #ddd', fontSize: 12 }} />
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {registro && !estaEditando ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ Registrado</span>
                        {esAdminContador && (
                          <>
                            <button onClick={() => {
                              setEditando(fijo.id);
                              setMontosEdit(m => ({ ...m, [fijo.id]: String(registro.valor ?? registro.monto ?? '') }));
                              setFacturaEdit(f => ({ ...f, [fijo.id]: registro.numero_factura || '' }));
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 11, color: '#2980b9' }}>✏️ Editar</button>
                            <button onClick={() => eliminarRegistro(fijo, registro)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 11, color: '#e74c3c' }}>🗑️</button>
                          </>
                        )}
                      </div>
                    ) : estaEditando ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => guardarEdicion(fijo, registro)}
                          disabled={registrando[fijo.id]}
                          style={{ background: '#27ae60', color: 'white', border: 'none',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                          {registrando[fijo.id] ? '...' : '✓ Guardar'}
                        </button>
                        <button onClick={() => setEditando(null)}
                          style={{ background: '#f0f2f5', color: '#555', border: 'none',
                            borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => registrar(fijo)}
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
        )}
      </div>

      {modalCat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24,
            width: 700, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>⚙️ Administrar Servicios Básicos</h3>
              <button onClick={() => { setModalCat(false); setFormFijo(null); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {catalogo.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#f5f7f5' }}>
                    {['Nombre','Empresa','Monto default','MOD+CIF','Activo',''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11,
                        fontWeight: 700, color: '#555', borderBottom: '1px solid #eee' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catalogo.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: f.activo ? 1 : 0.5 }}>
                      <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>{f.nombre}</td>
                      <td style={{ padding: '6px 10px' }}>{f.empresa || '—'}</td>
                      <td style={{ padding: '6px 10px' }}>${parseFloat(f.monto_default||0).toFixed(2)}</td>
                      <td style={{ padding: '6px 10px' }}>
                        {f.tipo_mod_cif ? (
                          <span style={{ background: '#eaf4ff', color: '#2980b9',
                            borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 'bold' }}>
                            {tipoLabel(f.tipo_mod_cif)}
                          </span>
                        ) : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <button onClick={() => toggleActivo(f)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                          {f.activo ? '✅' : '⬜'}
                        </button>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setFormFijo({ ...f, tipo_mod_cif: f.tipo_mod_cif || '', mod_cif_row_id: f.mod_cif_row_id || '' })}
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
                  {formFijo.id ? 'Editar servicio básico' : 'Nuevo servicio básico'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Nombre</label>
                    <input type="text" value={formFijo.nombre}
                      onChange={e => setFormFijo(p => ({ ...p, nombre: e.target.value }))}
                      placeholder="Ej: Luz EMELNORTE"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                        border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Empresa</label>
                    <input type="text" value={formFijo.empresa}
                      onChange={e => setFormFijo(p => ({ ...p, empresa: e.target.value }))}
                      placeholder="Ej: EMELNORTE"
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

                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e0e0e0', paddingTop: 10, marginTop: 4 }}>
                    <label style={{ fontSize: 11, color: '#2980b9', fontWeight: 'bold', display: 'block', marginBottom: 6 }}>
                      🔗 Vinculación con MOD+CIF (permanente, aplica todos los meses)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Sección</label>
                        <select value={formFijo.tipo_mod_cif}
                          onChange={e => setFormFijo(p => ({ ...p, tipo_mod_cif: e.target.value, mod_cif_row_id: '' }))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                            border: '1.5px solid #2980b9', fontSize: 12 }}>
                          {TIPO_MOD_CIF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {formFijo.tipo_mod_cif && (
                        <div>
                          <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Fila en MOD+CIF</label>
                          <select value={formFijo.mod_cif_row_id}
                            onChange={e => setFormFijo(p => ({ ...p, mod_cif_row_id: e.target.value }))}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                              border: '1.5px solid #2980b9', fontSize: 12 }}>
                            <option value="">— Seleccionar fila —</option>
                            <option value="NUEVO">➕ Crear nueva fila</option>
                            {rowsParaTipo(formFijo.tipo_mod_cif).map(r => (
                              <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    {formFijo.tipo_mod_cif && (
                      <div style={{ marginTop: 7, fontSize: 11, color: '#666', background: '#eaf4ff',
                        borderRadius: 6, padding: '6px 10px' }}>
                        Al registrar cada mes, el monto pagado se sincronizará automáticamente con la fila seleccionada en {tipoLabel(formFijo.tipo_mod_cif)}.
                      </div>
                    )}
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
                + Nuevo servicio básico
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
