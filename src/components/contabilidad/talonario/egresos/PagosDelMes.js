// src/components/contabilidad/talonario/egresos/PagosDelMes.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';

const VACIO = { fecha: '', beneficiario: '', concepto: '', monto: '', forma_pago: '20', comentario: '' };

const FORMA_LABEL = {
  transferencia: 'Transferencia',
  cheque:        'Cheque',
  deposito:      'Depósito',
};

export default function PagosDelMes() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,         setFilas]         = useState([]);
  const [pagosCompras,  setPagosCompras]  = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [form,          setForm]          = useState(null);
  const [guardando,     setGuardando]     = useState(false);

  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const ultimoDia  = new Date(año, mes, 0).getDate();
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

    const [{ data }, { data: pagos }] = await Promise.all([
      supabase.from('talonario_pagos_banco')
        .select('*').eq('mes', mes).eq('año', año).order('fecha'),
      supabase.from('pagos_compras')
        .select('id,monto,forma_pago,fecha_pago,notas,comision,proveedores(nombre),compras(es_personal)')
        .in('forma_pago', ['transferencia','cheque','deposito'])
        .gte('fecha_pago', fechaDesde).lte('fecha_pago', fechaHasta)
        .order('fecha_pago'),
    ]);
    setFilas(data || []);
    setPagosCompras((pagos || []).filter(p => !p.compras?.es_personal));
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

  return (
    <>
      <TablaCrud
        titulo="🏧 Pagos del Mes"
        filas={filas}
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
    </>
  );
}
