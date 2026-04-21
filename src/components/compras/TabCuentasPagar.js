// ============================================
// TabCuentasPagar.js
// Cuentas por pagar con alertas de vencimiento
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

function diasRestantes(fechaVenc) {
  if (!fechaVenc) return null;
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(fechaVenc + 'T00:00:00');
  return Math.round((venc - hoy) / 86400000);
}

function badgeVenc(dias) {
  if (dias === null) return null;
  if (dias < 0)  return { label: `Vencida ${Math.abs(dias)}d`, bg: '#e74c3c', color: 'white' };
  if (dias === 0) return { label: 'Vence hoy',                  bg: '#e74c3c', color: 'white' };
  if (dias <= 5)  return { label: `${dias}d`,                   bg: '#f39c12', color: 'white' };
  return              { label: `${dias}d`,                      bg: '#27ae60', color: 'white' };
}

export default function TabCuentasPagar({ mobile }) {
  const [cuentas,    setCuentas]    = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [filtro,     setFiltro]     = useState('pendientes'); // pendientes | vencidas | pagadas | todas
  const [modalPago,  setModalPago]  = useState(null); // cuenta seleccionada
  const [montoPago,  setMontoPago]  = useState('');
  const [formaPago,  setFormaPago]  = useState('transferencia');
  const [notaPago,   setNotaPago]   = useState('');
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');
  const [modalSeq,    setModalSeq]    = useState(null);
  const [seqValor,    setSeqValor]    = useState('');
  const [modalEditar,   setModalEditar]   = useState(null);
  const [editForm,      setEditForm]      = useState({});
  const [xmlEditContent,setXmlEditContent]= useState('');

  function parsearXmlSRI(file, onDone) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const rawXml = e.target.result;
        const xml    = new DOMParser().parseFromString(rawXml, 'text/xml');
        const clave  = xml.querySelector('claveAcceso')?.textContent?.trim() || '';
        const estab  = xml.querySelector('estab')?.textContent?.trim() || '';
        const pto    = xml.querySelector('ptoEmi')?.textContent?.trim() || '';
        const secu   = xml.querySelector('secuencial')?.textContent?.trim() || '';
        const numF   = estab && pto && secu ? `${estab}-${pto}-${secu}` : '';
        onDone({ autorizacion_sri: clave, numero_factura: numF, xmlContent: rawXml });
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from('cuentas_pagar')
      .select(`
        *,
        proveedores ( nombre, razon_social, ruc ),
        compras ( numero_factura, autorizacion_sri, xml_sri_url, recordar_factura )
      `)
      .order('fecha_vencimiento', { ascending: true });
    setCuentas(data || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrado
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const filtradas = cuentas.filter(c => {
    const dias = diasRestantes(c.fecha_vencimiento);
    if (filtro === 'pendientes') return c.estado !== 'pagado';
    if (filtro === 'vencidas')   return c.estado !== 'pagado' && dias !== null && dias < 0;
    if (filtro === 'pagadas')    return c.estado === 'pagado';
    return true;
  });

  // Totales resumen
  const totalPendiente = cuentas
    .filter(c => c.estado !== 'pagado')
    .reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const totalVencido = cuentas
    .filter(c => c.estado !== 'pagado' && diasRestantes(c.fecha_vencimiento) < 0)
    .reduce((s, c) => s + (c.saldo_pendiente || 0), 0);

  function abrirPago(cuenta) {
    setModalPago(cuenta);
    setMontoPago(parseFloat(cuenta.saldo_pendiente || 0).toFixed(2));
    setFormaPago('transferencia');
    setNotaPago('');
    setError('');
  }

  async function registrarPago() {
    const monto  = parseFloat(montoPago);
    const saldo  = parseFloat(modalPago.saldo_pendiente) || 0;
    if (!monto || monto <= 0) { setError('Ingresa un monto válido.'); return; }
    if (monto > saldo + 0.001) {
      setError(`El monto no puede superar el saldo: $${saldo.toFixed(2)}`);
      return;
    }
    setGuardando(true);
    setError('');

    const nuevoSaldo  = Math.max(0, saldo - monto);
    const nuevoEstado = nuevoSaldo <= 0.001 ? 'pagado' : 'parcial';
    const ahora       = new Date().toISOString();

    // 1. Actualizar cuenta
    const { error: e1 } = await supabase.from('cuentas_pagar').update({
      saldo_pendiente: nuevoSaldo,
      estado:          nuevoEstado,
      updated_at:      ahora
    }).eq('id', modalPago.id);
    if (e1) { setError(e1.message); setGuardando(false); return; }

    // 2. Registrar en pagos_compras
    const { error: e2 } = await supabase.from('pagos_compras').insert({
      cuenta_pagar_id:  modalPago.id,
      compra_id:        modalPago.compra_id,
      proveedor_id:     modalPago.proveedor_id,
      monto:            monto,
      forma_pago:       formaPago,
      fecha_pago:       ahora.slice(0, 10),
      notas:            notaPago.trim() || null
    });
    if (e2) { setError(e2.message); setGuardando(false); return; }

    await cargar();
    setModalPago(null);
    setGuardando(false);
  }

  function abrirEditar(c) {
    setEditForm({
      monto_total:       parseFloat(c.monto_total || 0).toFixed(2),
      saldo_pendiente:   parseFloat(c.saldo_pendiente || 0).toFixed(2),
      fecha_vencimiento: c.fecha_vencimiento || '',
      estado:            c.estado || 'pendiente',
      forma_pago:        c.forma_pago || 'credito',
      notas:             c.notas || '',
      numero_factura:    c.compras?.numero_factura   || '',
      autorizacion_sri:  c.compras?.autorizacion_sri || ''
    });
    setModalEditar(c);
  }

  async function guardarEdicion() {
    await supabase.from('cuentas_pagar').update({
      monto_total:       parseFloat(editForm.monto_total)     || 0,
      saldo_pendiente:   parseFloat(editForm.saldo_pendiente) || 0,
      fecha_vencimiento: editForm.fecha_vencimiento || null,
      estado:            editForm.estado,
      forma_pago:        editForm.forma_pago,
      notas:             editForm.notas.trim() || null,
      updated_at:        new Date().toISOString()
    }).eq('id', modalEditar.id);

    if (modalEditar.compra_id) {
      const nf = editForm.numero_factura.trim() || null;
      await supabase.from('compras')
        .update({
          numero_factura:   nf,
          autorizacion_sri: editForm.autorizacion_sri.trim() || null,
          recordar_factura: nf ? false : undefined
        })
        .eq('id', modalEditar.compra_id);
    }

    // Subir XML a Storage si se cargó uno nuevo
    if (xmlEditContent && modalEditar.compra_id) {
      const blob = new Blob([xmlEditContent], { type: 'text/xml' });
      const { error: uploadErr } = await supabase.storage.from('xml-sri').upload(`compras/${modalEditar.compra_id}.xml`, blob, { upsert: true, contentType: 'text/xml' });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('xml-sri').getPublicUrl(`compras/${modalEditar.compra_id}.xml`);
        await supabase.from('compras').update({ xml_sri_url: urlData.publicUrl }).eq('id', modalEditar.compra_id);
      }
      setXmlEditContent('');
    }

    setModalEditar(null);
    await cargar();
  }

  async function guardarSecuencial() {
    if (!modalSeq) return;
    await supabase.from('compras')
      .update({ numero_factura: seqValor.trim() || null })
      .eq('id', modalSeq.compra_id);
    setModalSeq(null);
    setSeqValor('');
    await cargar();
  }

  // ── Estilos ──
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

  return (
    <div>
      {/* Resumen */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)',
        gap: '10px', marginBottom: '14px'
      }}>
        {[
          { label: 'Total pendiente', valor: totalPendiente,       color: '#2980b9' },
          { label: 'Total vencido',   valor: totalVencido,         color: '#e74c3c' },
          { label: 'Cuentas abiertas',valor: cuentas.filter(c => c.estado !== 'pagado').length, color: '#27ae60', esCant: true },
        ].map(r => (
          <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
            <div style={{ fontSize: mobile ? '18px' : '22px', fontWeight: 'bold', color: r.color }}>
              {r.esCant ? r.valor : `$${r.valor.toFixed(2)}`}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { k: 'pendientes', label: '⏳ Pendientes' },
          { k: 'vencidas',   label: '🚨 Vencidas'   },
          { k: 'pagadas',    label: '✅ Pagadas'     },
          { k: 'todas',      label: '📋 Todas'       },
        ].map(f => (
          <button key={f.k} onClick={() => setFiltro(f.k)} style={{
            padding: '7px 14px', borderRadius: '20px', fontSize: '12px',
            fontWeight: 'bold', cursor: 'pointer',
            border: filtro === f.k ? 'none' : '1px solid #ddd',
            background: filtro === f.k ? '#1a3a2a' : '#f5f5f5',
            color: filtro === f.k ? 'white' : '#555'
          }}>{f.label}</button>
        ))}
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          Cargando cuentas...
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay cuentas en esta categoría.
        </div>
      ) : (
        filtradas.map(c => {
          const dias  = diasRestantes(c.fecha_vencimiento);
          const badge = badgeVenc(dias);
          const pagado = c.estado === 'pagado';

          return (
            <div key={c.id} style={{
              ...card,
              borderLeft: `4px solid ${pagado ? '#27ae60' : dias !== null && dias < 0 ? '#e74c3c' : dias !== null && dias <= 5 ? '#f39c12' : '#2980b9'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a' }}>
                      🏢 {c.proveedores?.nombre || 'Proveedor'}
                    </span>
                    <span style={{
                      background: pagado ? '#27ae60' : c.estado === 'parcial' ? '#f39c12' : '#e74c3c',
                      color: 'white', borderRadius: '12px', padding: '2px 10px',
                      fontSize: '11px', fontWeight: 'bold', textTransform: 'capitalize'
                    }}>
                      {pagado ? '✅ Pagado' : c.estado === 'parcial' ? '⚡ Parcial' : '⏳ Pendiente'}
                    </span>
                    {badge && (
                      <span style={{
                        background: badge.bg, color: badge.color,
                        borderRadius: '12px', padding: '2px 10px',
                        fontSize: '11px', fontWeight: 'bold'
                      }}>
                        {badge.label}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#555' }}>
                    <span>📅 Vence: <b>{c.fecha_vencimiento || '—'}</b></span>
                    <span>💰 Total: <b>${(c.monto_total || 0).toFixed(2)}</b></span>
                    {!pagado && (
                      <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                        Saldo: ${(c.saldo_pendiente || 0).toFixed(2)}
                      </span>
                    )}
                    {c.forma_pago && <span>💳 {c.forma_pago}</span>}
                    {c.compras?.numero_factura && (
                      <span style={{ color: '#2980b9' }}>🧾 {c.compras.numero_factura}</span>
                    )}
                    {pagado && c.compras?.recordar_factura && (
                      <span style={{ background: '#fff3e0', color: '#e67e22', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                        🔔 Factura pendiente
                      </span>
                    )}
                    {c.compras?.autorizacion_sri ? (
                      <span style={{ color: '#27ae60', fontSize: '11px' }}>
                        ✅ XML ···{c.compras.autorizacion_sri.slice(-8)}
                      </span>
                    ) : (
                      <span style={{ color: '#ccc', fontSize: '11px' }}>— Sin XML</span>
                    )}
                    {c.compras?.xml_sri_url && (
                      <a href={c.compras.xml_sri_url}
                        download={`factura_${c.compras?.numero_factura || c.id}.xml`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: '10px', color: '#2980b9', textDecoration: 'none' }}>
                        📥 descargar XML
                      </a>
                    )}
                  </div>

                  {c.notas && (
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>
                      📝 {c.notas}
                    </div>
                  )}
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                  <button onClick={() => abrirEditar(c)} style={{
                    background: '#f0f2f5', border: 'none', borderRadius: '8px',
                    padding: '8px 12px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap'
                  }}>✏️ Editar</button>
                  {!pagado && (
                    <button onClick={() => abrirPago(c)} style={{
                      background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                      color: 'white', border: 'none', borderRadius: '8px',
                      padding: '8px 16px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap'
                    }}>💳 Registrar pago</button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* ── Modal Registrar Pago ── */}
      {modalPago && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '420px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 6px', color: '#1a3a2a' }}>💳 Registrar pago</h3>
            <p style={{ margin: '0 0 20px', color: '#555', fontSize: '13px' }}>
              Proveedor: <b>{modalPago.proveedores?.nombre}</b><br />
              Saldo pendiente: <b style={{ color: '#e74c3c' }}>${(modalPago.saldo_pendiente || 0).toFixed(2)}</b>
            </p>

            {/* Monto */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Monto a pagar *
              </label>
              <input
                type="number" min="0.01" step="0.01"
                value={montoPago}
                onChange={e => setMontoPago(e.target.value)}
                style={inputStyle}
                placeholder="0.00"
              />
            </div>

            {/* Forma de pago */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Forma de pago
              </label>
              <select value={formaPago} onChange={e => setFormaPago(e.target.value)} style={inputStyle}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>

            {/* Nota */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>
                Nota (opcional)
              </label>
              <input value={notaPago} onChange={e => setNotaPago(e.target.value)}
                style={inputStyle} placeholder="Ej. Transferencia Banco Pichincha" />
            </div>

            {error && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: '8px', padding: '10px', color: '#e74c3c',
                fontSize: '13px', marginBottom: '16px'
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalPago(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={registrarPago} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: '13px', fontWeight: 'bold'
              }}>
                {guardando ? 'Guardando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Cuenta ── */}
      {modalEditar && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            maxWidth: '480px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 4px', color: '#1a3a2a' }}>✏️ Editar cuenta</h3>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '18px' }}>
              {modalEditar.proveedores?.nombre}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Monto total $</label>
                <input type="number" min="0" step="0.01"
                  value={editForm.monto_total}
                  onChange={e => setEditForm(f => ({ ...f, monto_total: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Saldo pendiente $</label>
                <input type="number" min="0" step="0.01"
                  value={editForm.saldo_pendiente}
                  onChange={e => setEditForm(f => ({ ...f, saldo_pendiente: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Fecha vencimiento</label>
                <input type="date"
                  value={editForm.fecha_vencimiento}
                  onChange={e => setEditForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Estado</label>
                <select value={editForm.estado}
                  onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))}
                  style={inputStyle}>
                  <option value="pendiente">⏳ Pendiente</option>
                  <option value="parcial">⚡ Parcial</option>
                  <option value="pagado">✅ Pagado</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Forma de pago</label>
                <select value={editForm.forma_pago}
                  onChange={e => setEditForm(f => ({ ...f, forma_pago: e.target.value }))}
                  style={inputStyle}>
                  <option value="credito">📅 Crédito</option>
                  <option value="transferencia">🏦 Transferencia</option>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="cheque">📝 Cheque</option>
                </select>
              </div>
            </div>

            {/* N° Factura + XML upload */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>🧾 N° Factura proveedor</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={editForm.numero_factura}
                  onChange={e => setEditForm(f => ({ ...f, numero_factura: e.target.value }))}
                  placeholder="001-001-000000001"
                  style={{ ...inputStyle, flex: 1 }} />
                <input id="xml-edit-cxp" type="file" accept=".xml" style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files[0]) parsearXmlSRI(e.target.files[0], ({ autorizacion_sri, numero_factura, xmlContent }) => {
                      setEditForm(f => ({
                        ...f,
                        autorizacion_sri: autorizacion_sri || f.autorizacion_sri,
                        numero_factura:   numero_factura   || f.numero_factura
                      }));
                      if (xmlContent) setXmlEditContent(xmlContent);
                    });
                    e.target.value = '';
                  }}
                />
                <label htmlFor="xml-edit-cxp" style={{
                  background: '#e3f2fd', color: '#1565c0', border: '1.5px solid #90caf9',
                  borderRadius: '8px', padding: '0 12px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap'
                }}>📎 XML</label>
              </div>
            </div>

            {/* Autorización SRI */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Autorización SRI (clave de acceso)</label>
              <input value={editForm.autorizacion_sri}
                onChange={e => setEditForm(f => ({ ...f, autorizacion_sri: e.target.value }))}
                placeholder="49 dígitos"
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px', borderColor: editForm.autorizacion_sri ? '#27ae60' : '#ddd' }} />
              {editForm.autorizacion_sri && (
                <div style={{ fontSize: '10px', color: '#27ae60', marginTop: '2px' }}>✅ XML cargado</div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Notas</label>
              <input value={editForm.notas}
                onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones..."
                style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEditar(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardarEdicion} style={{
                background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal N° Factura / Secuencial ── */}
      {modalSeq && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '28px',
            maxWidth: '400px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#1a3a2a' }}>🧾 N° Factura / Secuencial</h3>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
              Ingresa el número de la factura del proveedor (ej. 001-001-000000123)
            </p>
            <input
              value={seqValor}
              onChange={e => setSeqValor(e.target.value)}
              placeholder="001-001-000000001"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1.5px solid #2980b9', fontSize: '14px',
                boxSizing: 'border-box', outline: 'none', marginBottom: '20px'
              }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalSeq(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardarSecuencial} style={{
                background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
