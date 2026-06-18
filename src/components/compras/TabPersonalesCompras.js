import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { calcularResumenItems } from '../../utils/comprasCalc';

const itemVacio = () => ({ descripcion: '', monto: '', descuento: '', iva_pct: 15, ivaDiferente: false });

const FORMA_OPTS = [
  { value: 'efectivo',      label: '💵 Efectivo' },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'cheque',        label: '📝 Cheque' },
  { value: 'credito',       label: '📅 Crédito' },
  { value: 'deposito',      label: '🏛️ Depósito' },
];

const FORMA_LABEL = Object.fromEntries(FORMA_OPTS.map(f => [f.value, f.label]));

export default function TabPersonalesCompras({ mobile, editCompraId, onClearEdit }) {
  const [compras,      setCompras]      = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [filtroDesde,  setFiltroDesde]  = useState('');
  const [filtroHasta,  setFiltroHasta]  = useState('');
  const [busqueda,     setBusqueda]     = useState('');
  const [editForm,     setEditForm]     = useState(null);
  const [guardando,    setGuardando]    = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase
      .from('compras')
      .select('id,fecha,proveedor_nombre,total,tiene_factura,numero_factura,forma_pago,notas,subtotal,iva,descuento')
      .eq('es_personal', true)
      .order('fecha', { ascending: false });
    if (filtroDesde) q = q.gte('fecha', filtroDesde);
    if (filtroHasta) q = q.lte('fecha', filtroHasta);
    const { data } = await q;
    setCompras(data || []);
    setCargando(false);
  }, [filtroDesde, filtroHasta]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!editCompraId) return;
    abrirEdit(editCompraId);
  }, [editCompraId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrirEdit(compraId) {
    const [{ data: c }, { data: detalles }] = await Promise.all([
      supabase.from('compras').select('*').eq('id', compraId).single(),
      supabase.from('compras_detalle').select('*').eq('compra_id', compraId).order('id'),
    ]);
    if (!c) return;
    setEditForm({
      id:             c.id,
      fecha:          c.fecha || '',
      proveedor:      c.proveedor_nombre || '',
      tiene_factura:  c.tiene_factura || false,
      numero_factura: c.numero_factura || '',
      forma_pago:     c.forma_pago || 'efectivo',
      notas:          c.notas || '',
      items: detalles && detalles.length > 0
        ? detalles.map(it => ({
            descripcion:   it.mp_nombre || '',
            monto:         String(it.subtotal || ''),
            descuento:     String(it.descuento || ''),
            iva_pct:       it.iva_pct ?? 15,
            ivaDiferente:  it.iva_pct != null && it.iva_pct !== 15,
          }))
        : [itemVacio()],
    });
  }

  async function guardarEdit() {
    if (!editForm) return;
    const itemsValidos = editForm.items.filter(i => i.descripcion && parseFloat(i.monto) > 0);
    if (itemsValidos.length === 0) return alert('Agrega al menos un item con monto');
    setGuardando(true);
    const resumen = calcularResumenItems(itemsValidos);
    const { error: errU } = await supabase.from('compras').update({
      fecha:           editForm.fecha || null,
      proveedor_nombre: editForm.proveedor || '',
      tiene_factura:   editForm.tiene_factura,
      numero_factura:  editForm.tiene_factura ? (editForm.numero_factura || null) : null,
      forma_pago:      editForm.forma_pago,
      notas:           editForm.notas || null,
      subtotal:        resumen.subtotalTotal,
      descuento:       resumen.descuentoTotal || null,
      iva:             resumen.ivaTotal,
      total:           resumen.total,
    }).eq('id', editForm.id);
    if (errU) { setGuardando(false); return alert('Error: ' + errU.message); }
    await supabase.from('compras_detalle').delete().eq('compra_id', editForm.id);
    await supabase.from('compras_detalle').insert(
      itemsValidos.map(it => ({
        compra_id:        editForm.id,
        materia_prima_id: null,
        mp_nombre:        it.descripcion,
        cantidad_kg:      null,
        precio_kg:        null,
        subtotal:         parseFloat(it.monto),
        descuento:        parseFloat(it.descuento) || 0,
        iva_pct:          (it.iva_pct === '' || it.iva_pct == null) ? 15 : parseFloat(it.iva_pct) || 0,
      }))
    );
    setGuardando(false);
    setEditForm(null);
    onClearEdit?.();
    cargar();
  }

  const filtradas = compras.filter(c =>
    !busqueda || (c.proveedor_nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  );
  const totalGeneral = filtradas.reduce((s, c) => s + parseFloat(c.total || 0), 0);

  const inputStyle = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd',
    fontSize: 12, boxSizing: 'border-box', width: '100%',
  };
  const labelStyle = { fontSize: 11, color: '#777', display: 'block', marginBottom: 3 };

  return (
    <div>
      {/* Filtros */}
      <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px',
        marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Desde</label>
          <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
            style={{ ...inputStyle, width: 140 }} />
        </div>
        <div>
          <label style={labelStyle}>Hasta</label>
          <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
            style={{ ...inputStyle, width: 140 }} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={labelStyle}>Proveedor</label>
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar..." style={{ ...inputStyle }} />
        </div>
        {(filtroDesde || filtroHasta || busqueda) && (
          <button onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setBusqueda(''); }}
            style={{ background: 'none', border: 'none', color: '#e74c3c',
              cursor: 'pointer', fontSize: 12, paddingBottom: 2 }}>✕ Limpiar</button>
        )}
        <div style={{ background: '#f5f0fa', borderRadius: 8, padding: '6px 14px',
          fontWeight: 'bold', fontSize: 13, color: '#7d3c98', whiteSpace: 'nowrap' }}>
          Total: ${totalGeneral.toFixed(2)}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>⏳ Cargando...</div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>
            Sin compras personales registradas
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f0fa' }}>
                {['Fecha', 'Proveedor', 'Forma pago', 'Factura', 'Total', ''].map(h => (
                  <th key={h} style={{
                    padding: '9px 12px', textAlign: h === 'Total' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: '#555',
                    borderBottom: '2px solid #e0d0f0',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0',
                  background: i % 2 === 0 ? 'white' : '#fdf9ff' }}>
                  <td style={{ padding: '8px 12px', color: '#555' }}>{c.fecha || '—'}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.proveedor_nombre || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>
                    {FORMA_LABEL[c.forma_pago] || c.forma_pago}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {c.tiene_factura
                      ? (c.numero_factura
                          ? <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ {c.numero_factura}</span>
                          : <span style={{ color: '#f39c12' }}>⚠️ Pendiente</span>)
                      : <span style={{ color: '#aaa' }}>Sin factura</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#7d3c98' }}>
                    ${parseFloat(c.total || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <button onClick={() => abrirEdit(c.id)}
                      style={{ background: '#8e44ad', color: 'white', border: 'none',
                        borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                        fontSize: 11, fontWeight: 'bold' }}>
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal edición */}
      {editForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'white', borderRadius: 14, width: 560, maxWidth: '96vw',
            maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>

            {/* Header modal */}
            <div style={{ background: 'linear-gradient(135deg,#7d3c98,#5b2c6f)', padding: '14px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>✏️ Editar compra personal</span>
              <button onClick={() => { setEditForm(null); onClearEdit?.(); }}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

              {/* Fecha y proveedor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Fecha</label>
                  <input type="date" value={editForm.fecha}
                    onChange={e => setEditForm(p => ({ ...p, fecha: e.target.value }))}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Proveedor</label>
                  <input type="text" value={editForm.proveedor}
                    onChange={e => setEditForm(p => ({ ...p, proveedor: e.target.value }))}
                    placeholder="Nombre del proveedor"
                    style={inputStyle} />
                </div>
              </div>

              {/* Forma de pago */}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Forma de pago</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {FORMA_OPTS.map(f => (
                    <button key={f.value} onClick={() => setEditForm(p => ({ ...p, forma_pago: f.value }))}
                      style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 'bold',
                        background: editForm.forma_pago === f.value ? '#8e44ad' : '#f0eaf5',
                        color: editForm.forma_pago === f.value ? 'white' : '#555' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: '#555', fontWeight: 'bold' }}>Items de la compra</label>
                  <button onClick={() => setEditForm(p => ({ ...p, items: [...p.items, itemVacio()] }))}
                    style={{ background: '#27ae60', color: 'white', border: 'none',
                      borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}>
                    + Agregar item
                  </button>
                </div>

                {/* Cabecera de items */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 28px',
                  gap: 6, marginBottom: 4 }}>
                  {['Descripción', 'Monto', 'Descuento', 'IVA %', ''].map(h => (
                    <span key={h} style={{ fontSize: 10, color: '#888', fontWeight: 'bold', paddingLeft: 2 }}>{h}</span>
                  ))}
                </div>

                {editForm.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 28px',
                    gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input type="text" value={item.descripcion} placeholder="Descripción"
                      onChange={e => setEditForm(p => ({ ...p, items: p.items.map((it, i) =>
                        i === idx ? { ...it, descripcion: e.target.value } : it) }))}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                    <input type="number" min="0" step="0.01" value={item.monto} placeholder="0.00"
                      onChange={e => setEditForm(p => ({ ...p, items: p.items.map((it, i) =>
                        i === idx ? { ...it, monto: e.target.value } : it) }))}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                    <input type="number" min="0" step="0.01" value={item.descuento} placeholder="0.00"
                      onChange={e => setEditForm(p => ({ ...p, items: p.items.map((it, i) =>
                        i === idx ? { ...it, descuento: e.target.value } : it) }))}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                    {item.ivaDiferente ? (
                      <input type="number" min="0" max="100" step="1" value={item.iva_pct} placeholder="15"
                        onChange={e => setEditForm(p => ({ ...p, items: p.items.map((it, i) =>
                          i === idx ? { ...it, iva_pct: e.target.value } : it) }))}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ padding: '4px 8px', borderRadius: 6, background: '#f0f2f5', fontSize: 11, fontWeight: 'bold' }}>
                          {item.iva_pct}%
                        </span>
                        <button onClick={() => setEditForm(p => ({ ...p, items: p.items.map((it, i) =>
                          i === idx ? { ...it, ivaDiferente: true } : it) }))}
                          title="Cambiar tasa IVA"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0 }}>✏️</button>
                      </div>
                    )}
                    <button
                      onClick={() => setEditForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                      disabled={editForm.items.length <= 1}
                      style={{ background: 'none', border: 'none', color: '#e74c3c',
                        cursor: editForm.items.length <= 1 ? 'not-allowed' : 'pointer',
                        fontSize: 16, opacity: editForm.items.length <= 1 ? 0.3 : 1 }}>✕</button>
                  </div>
                ))}

                {/* Resumen */}
                {(() => {
                  const validos = editForm.items.filter(i => i.descripcion && parseFloat(i.monto) > 0);
                  if (!validos.length) return null;
                  const r = calcularResumenItems(validos);
                  return (
                    <div style={{ background: '#f8f0ff', borderRadius: 8, padding: '8px 12px',
                      fontSize: 12, marginTop: 4, borderLeft: '3px solid #8e44ad' }}>
                      {r.baseIva15 > 0 && <div style={{ color: '#555' }}>Base IVA 15%: ${r.baseIva15.toFixed(2)}</div>}
                      {r.baseIva0 > 0 && <div style={{ color: '#555' }}>Base IVA 0%: ${r.baseIva0.toFixed(2)}</div>}
                      {Object.entries(r.otrasBases || {}).map(([pct, monto]) => (
                        <div key={pct} style={{ color: '#555' }}>Base IVA {pct}%: ${monto.toFixed(2)}</div>
                      ))}
                      {r.descuentoTotal > 0 && <div style={{ color: '#e74c3c' }}>Descuento: -${r.descuentoTotal.toFixed(2)}</div>}
                      <div style={{ color: '#555' }}>IVA: ${r.ivaTotal.toFixed(2)}</div>
                      <div style={{ fontWeight: 'bold', color: '#7d3c98', fontSize: 13 }}>
                        Total: ${r.total.toFixed(2)}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Factura */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" id="editTieneFactura" checked={editForm.tiene_factura}
                    onChange={e => setEditForm(p => ({ ...p, tiene_factura: e.target.checked }))} />
                  <label htmlFor="editTieneFactura" style={{ fontSize: 13, cursor: 'pointer' }}>Tiene factura</label>
                </div>
                {editForm.tiene_factura && (
                  <div>
                    <label style={labelStyle}>N° Factura</label>
                    <input type="text" value={editForm.numero_factura}
                      onChange={e => setEditForm(p => ({ ...p, numero_factura: e.target.value }))}
                      placeholder="001-001-000000001"
                      style={inputStyle} />
                  </div>
                )}
              </div>

              {/* Notas */}
              <div style={{ marginBottom: 4 }}>
                <label style={labelStyle}>Notas (opcional)</label>
                <input type="text" value={editForm.notas}
                  onChange={e => setEditForm(p => ({ ...p, notas: e.target.value }))}
                  placeholder="Observaciones..."
                  style={inputStyle} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #eee',
              display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fdfbff' }}>
              <button onClick={() => { setEditForm(null); onClearEdit?.(); }}
                style={{ padding: '9px 22px', borderRadius: 8, border: '1px solid #ddd',
                  background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardarEdit} disabled={guardando}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none',
                  background: guardando ? '#aaa' : '#8e44ad', color: 'white',
                  cursor: guardando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
