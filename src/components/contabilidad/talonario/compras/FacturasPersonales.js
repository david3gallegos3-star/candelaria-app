import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaCrud, FORMAS_PAGO } from '../shared/TablaCrud';
import { calcularResumenItems } from '../../../../utils/comprasCalc';

const itemVacio = () => ({ descripcion: '', monto: '', descuento: '', iva_pct: 15, ivaDiferente: false });

const VACIO = { fecha: '', proveedor: '', descripcion: '', items: [itemVacio()],
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

    const idsManuales = (manuales || []).map(m => m.id);
    const { data: itemsManuales } = idsManuales.length > 0
      ? await supabase.from('talonario_facturas_personales_items').select('*').in('factura_id', idsManuales).order('orden')
      : { data: [] };

    const manualesConItems = (manuales || []).map(m => ({
      ...m,
      items: (itemsManuales || []).filter(it => it.factura_id === m.id),
    }));

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

    setFilas([...manualesConItems, ...deComprasNorm]);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [mes, año]);

  async function guardar() {
    const itemsValidos = (form.items || []).filter(i => i.descripcion && parseFloat(i.monto) > 0);
    if (!form.descripcion || itemsValidos.length === 0) return alert('Descripción y al menos un item con monto son requeridos');
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
    const resumen = calcularResumenItems(itemsValidos);
    const payload = { mes, año, fecha: form.fecha || null, proveedor: form.proveedor || null,
      descripcion: form.descripcion, monto: resumen.total,
      base_iva15: resumen.baseIva15, base_iva0: resumen.baseIva0,
      iva: resumen.ivaTotal, descuento: resumen.descuentoTotal,
      tiene_factura: form.tiene_factura !== false,
      forma_pago: form.forma_pago, comentario: form.comentario || null,
      numero_transferencia: form.forma_pago === '20' ? form.numero_transferencia.trim() : null };

    let facturaId = form.id;
    if (form.id) {
      await supabase.from('talonario_facturas_personales').update(payload).eq('id', form.id);
      await supabase.from('talonario_facturas_personales_items').delete().eq('factura_id', form.id);
    } else {
      const { data: nueva } = await supabase.from('talonario_facturas_personales').insert(payload).select().single();
      facturaId = nueva.id;
    }
    await supabase.from('talonario_facturas_personales_items').insert(
      itemsValidos.map((it, i) => ({
        factura_id:  facturaId,
        descripcion: it.descripcion,
        monto:       parseFloat(it.monto) || 0,
        descuento:   parseFloat(it.descuento) || 0,
        iva_pct:     parseFloat(it.iva_pct ?? 15),
        orden:       i,
      }))
    );
    setGuardando(false);
    setForm(null);
    cargar();
  }

  async function eliminar(id) {
    if (String(id).startsWith('compra_')) return;
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
        onAgregar={() => setForm({ ...VACIO, items: [itemVacio()] })}
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
              ['comentario',  'Comentario',  'text'],
            ].map(([key, lbl, type]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{lbl}</label>
                <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                    border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Items de la factura</label>
                <button
                  onClick={() => setForm(p => ({ ...p, items: [...(p.items || []), itemVacio()] }))}
                  style={{ background: '#27ae60', color: 'white', border: 'none',
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
                >+ Agregar item</button>
              </div>
              {(form.items || []).map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 28px', gap: 6, marginBottom: 6 }}>
                  <input type="text" value={item.descripcion} placeholder="Descripción"
                    onChange={e => setForm(p => ({ ...p, items: p.items.map((it,i) => i===idx ? { ...it, descripcion: e.target.value } : it) }))}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  <input type="number" min="0" step="0.01" value={item.monto} placeholder="Monto"
                    onChange={e => setForm(p => ({ ...p, items: p.items.map((it,i) => i===idx ? { ...it, monto: e.target.value } : it) }))}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  <input type="number" min="0" step="0.01" value={item.descuento} placeholder="Desc."
                    onChange={e => setForm(p => ({ ...p, items: p.items.map((it,i) => i===idx ? { ...it, descuento: e.target.value } : it) }))}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  {item.ivaDiferente ? (
                    <input type="number" min="0" max="100" step="0.01" value={item.iva_pct} placeholder="IVA %"
                      onChange={e => setForm(p => ({ ...p, items: p.items.map((it,i) => i===idx ? { ...it, iva_pct: e.target.value } : it) }))}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ padding: '4px 8px', borderRadius: 6, background: '#f0f2f5', fontSize: 11, fontWeight: 'bold' }}>{item.iva_pct}%</span>
                      <button
                        onClick={() => setForm(p => ({ ...p, items: p.items.map((it,i) => i===idx ? { ...it, ivaDiferente: true } : it) }))}
                        title="Usar otra tasa de IVA"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
                      >✏️</button>
                    </div>
                  )}
                  <button
                    onClick={() => setForm(p => ({ ...p, items: p.items.filter((_,i) => i!==idx) }))}
                    disabled={(form.items || []).length <= 1}
                    style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 16 }}
                  >✕</button>
                </div>
              ))}
              {(() => {
                const r = calcularResumenItems((form.items || []).filter(i => i.descripcion && parseFloat(i.monto) > 0));
                return (
                  <div style={{ background: '#f8f9fa', borderRadius: 6, padding: 8, fontSize: 12, marginTop: 4 }}>
                    {r.baseIva15 > 0 && <div>Base IVA 15%: ${r.baseIva15.toFixed(2)}</div>}
                    {r.baseIva0 > 0 && <div>Base IVA 0%: ${r.baseIva0.toFixed(2)}</div>}
                    {Object.entries(r.otrasBases).map(([pct, monto]) => (
                      <div key={pct}>Base IVA {pct}%: ${monto.toFixed(2)}</div>
                    ))}
                    {r.descuentoTotal > 0 && <div>Descuento: -${r.descuentoTotal.toFixed(2)}</div>}
                    <div>IVA: ${r.ivaTotal.toFixed(2)}</div>
                    <div style={{ fontWeight: 'bold' }}>Total: ${r.total.toFixed(2)}</div>
                  </div>
                );
              })()}
            </div>
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
