import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';

const VACIO = { fecha: '', proveedor: '', descripcion: '', monto: '',
  tiene_factura: true, forma_pago: '20', comentario: '', numero_transferencia: '' };

export default function FacturasPersonales() {
  const { mes, año, esAdminContador } = useTalonario();
  const [filas,     setFilas]     = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [form,      setForm]      = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
    const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${new Date(año, mes, 0).getDate()}`;

    const [{ data: manuales }, { data: deCompras }] = await Promise.all([
      supabase.from('talonario_facturas_personales')
        .select('*').eq('mes', mes).eq('año', año).order('fecha'),
      supabase.from('compras')
        .select('id, fecha, proveedor_nombre, total, tiene_factura, numero_factura, forma_pago')
        .eq('es_personal', true)
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
    ]);

    // Unificar: marcar las de compras con _fuente para no editarlas
    const deComprasNorm = (deCompras || []).map(c => ({
      id:           `compra_${c.id}`,
      fecha:        c.fecha,
      proveedor:    c.proveedor_nombre,
      descripcion:  c.numero_factura ? `Factura ${c.numero_factura}` : 'Compra personal',
      monto:        parseFloat(c.total || 0),
      tiene_factura: c.tiene_factura,
      forma_pago:   c.forma_pago || '20',
      comentario:   'Registrada en módulo Compras',
      _readOnly:    true,
    }));

    setFilas([...(manuales || []), ...deComprasNorm]);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    if (!form.descripcion || !form.monto) return alert('Descripción y monto son requeridos');
    if (form.forma_pago === '20' && !form.numero_transferencia?.trim())
      return alert('El número de transferencia es obligatorio para pagos bancarios');
    if (form.forma_pago === '20') {
      const { data: existe } = await supabase
        .from('talonario_facturas_personales')
        .select('id')
        .eq('numero_transferencia', form.numero_transferencia.trim())
        .neq('id', form.id || '')
        .maybeSingle();
      if (existe) return alert('Este número de transferencia ya está registrado');
    }
    setGuardando(true);
    const payload = { mes, año, fecha: form.fecha || null, proveedor: form.proveedor || null,
      descripcion: form.descripcion, monto: parseFloat(form.monto),
      tiene_factura: form.tiene_factura !== false,
      forma_pago: form.forma_pago, comentario: form.comentario || null,
      numero_transferencia: form.forma_pago === '20' ? form.numero_transferencia.trim() : null };
    if (form.id) {
      await supabase.from('talonario_facturas_personales').update(payload).eq('id', form.id);
    } else {
      await supabase.from('talonario_facturas_personales').insert(payload);
    }
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    await supabase.from('talonario_facturas_personales').delete().eq('id', id);
    cargar();
  }

  const columnas = [
    { key: 'fecha',                 label: 'Fecha' },
    { key: 'proveedor',             label: 'Proveedor' },
    { key: 'descripcion',           label: 'Descripción' },
    { key: 'numero_transferencia',  label: 'Nº Transf.', render: f => f.numero_transferencia || '—' },
    { key: 'tiene_factura',         label: 'Factura', render: f => f.tiene_factura ? '✅' : '❌' },
    { key: 'monto',                 label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',            label: 'Forma Pago', render: f => {
      const fp = FORMAS_PAGO.find(x => x.value === f.forma_pago);
      return fp ? fp.label : f.forma_pago;
    }},
    { key: 'comentario', label: 'Comentario' },
  ];

  return (
    <>
      <TablaCrud
        titulo="📄 Facturas Personales"
        filas={filas}
        columnas={columnas}
        campoMonto="monto"
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
              {form.id ? 'Editar factura personal' : 'Nueva factura personal'}
            </h3>
            {[
              ['fecha',       'Fecha',       'date'],
              ['proveedor',   'Proveedor',   'text'],
              ['descripcion', 'Descripción', 'text'],
              ['monto',       'Monto ($)',   'number'],
              ['comentario',  'Comentario',  'text'],
            ].map(([key, lbl, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="tieneFact" checked={form.tiene_factura !== false}
                onChange={e => setForm(p => ({ ...p, tiene_factura: e.target.checked }))} />
              <label htmlFor="tieneFact" style={{ fontSize: 13 }}>Tiene factura</label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Forma de Pago</label>
              <select value={form.forma_pago || '20'} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            {form.forma_pago === '20' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
                  Nº Transferencia / Depósito *
                </label>
                <input
                  type="text"
                  value={form.numero_transferencia || ''}
                  onChange={e => setForm(p => ({ ...p, numero_transferencia: e.target.value }))}
                  placeholder="Ej: TRF-00123456"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: `1.5px solid ${!form.numero_transferencia?.trim() ? '#e74c3c' : '#ddd'}`,
                    fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setForm(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#8e44ad', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
