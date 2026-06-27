import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud } from '../shared/TablaCrud';

const VACIO = { fecha: '', ruc: '', proveedor: '', numero_factura: '', valor: '', detalle: '' };

export default function FacturasPersonales() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,     setFilas]     = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [form,      setForm]      = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from('talonario_registro_facturas_dueno')
      .select('*').eq('mes', mes).eq('año', año).order('fecha');
    setFilas(data || []);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.proveedor || !form.valor) return alert('Proveedor y valor son requeridos');
    setGuardando(true);
    const payload = {
      mes, año, fecha: form.fecha || null, ruc: form.ruc || null,
      proveedor: form.proveedor, numero_factura: form.numero_factura || null,
      valor: parseFloat(form.valor), detalle: form.detalle || null,
    };
    if (form.id) {
      await supabase.from('talonario_registro_facturas_dueno').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_registro_facturas_dueno').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_registro_facturas_dueno').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',          label: 'Fecha' },
    { key: 'ruc',            label: 'RUC' },
    { key: 'proveedor',      label: 'Proveedor' },
    { key: 'numero_factura', label: 'Número' },
    { key: 'valor',          label: 'Valor', render: f => `$${parseFloat(f.valor || 0).toFixed(2)}`, align: 'right' },
    { key: 'detalle',        label: 'Detalle' },
  ];

  return (
    <>
      <div style={{ marginBottom: 14, fontSize: 12, color: '#888', fontStyle: 'italic' }}>
        📄 Registro de facturas a nombre del dueño (hechas por otras personas) — no suma al Resumen.
      </div>
      <TablaCrud
        titulo="Facturas Personales"
        filas={filas}
        columnas={columnas}
        campoMonto="valor"
        cargando={cargando}
        esAdminContador={esAdminContador}
        onAgregar={() => setForm({ ...VACIO })}
        onEditar={f => setForm({ ...f })}
        onEliminar={eliminar}
      />

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>
              {form.id ? 'Editar registro' : 'Nuevo registro'}
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Fecha</label>
              <input type="date" value={form.fecha || ''} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>RUC</label>
              <input type="text" value={form.ruc || ''} onChange={e => setForm(p => ({ ...p, ruc: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Proveedor</label>
              <input type="text" value={form.proveedor || ''} onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Número de factura</label>
              <input type="text" value={form.numero_factura || ''} onChange={e => setForm(p => ({ ...p, numero_factura: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Valor ($)</label>
              <input type="number" min="0" step="0.01" value={form.valor || ''} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Detalle</label>
              <input type="text" value={form.detalle || ''} onChange={e => setForm(p => ({ ...p, detalle: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, boxSizing: 'border-box' }} />
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
