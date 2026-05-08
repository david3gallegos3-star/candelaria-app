// ============================================
// TabPagos.js
// Historial de pagos a proveedores + Excel
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

const FORMAS = ['Todas', 'transferencia', 'efectivo', 'cheque', 'tarjeta'];

const FORMA_SRI = { efectivo: '01', transferencia: '20', cheque: '20', credito: '19', tarjeta: '19' };

function tipoIdDoc(ruc) {
  if (!ruc) return '07';
  const limpio = ruc.replace(/[^0-9]/g, '');
  if (limpio.length === 13) return '04';
  if (limpio.length === 10) return '05';
  return '06';
}

function exportarPagos(filas) {
  const datos = filas.map(p => ({
    'Fecha':         p.fecha_pago || '',
    'Proveedor':     p.proveedores?.nombre || '',
    'Forma de pago': p.forma_pago || '',
    'Monto':         parseFloat((p.monto || 0).toFixed(2)),
    'Notas':         p.notas || ''
  }));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
  XLSX.writeFile(wb, `pagos_proveedores_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportarATS(compras) {
  const RUC_EMPRESA   = '1004007884001';
  const NOMBRE_EMPRESA = 'Embutidos y Jamones Candelaria';

  const enc = [
    'N','CodDoc','Fecha','RUC Emisor','Razón Social Emisor',
    'Nro.Secuencial','TipoId.','Id.Comprador','Razón Social Comprador',
    'Formas de Pago','Descuento','Total Sin Impuestos',
    'Base IVA 0%','Base IVA 5%','Base IVA 8%','Base IVA 12%','Base IVA 14%','Base IVA 15%',
    'No Objeto IVA','Exento IVA','Desc. Adicional','Devol. IVA',
    'Monto IVA','Base ICE','Monto ICE','Base IRBPNR','Monto IRBPNR',
    'Propina','Ret. IVA Pres.','Ret. Renta Pres.',
    'Monto Total','Guía de Remisión','Primeras 3 Artículos','EXTRAS','Nro de Autorización'
  ];

  const rows = compras.map((c, i) => {
    const subtotal  = parseFloat(c.subtotal || 0);
    const iva       = parseFloat(c.iva || 0);
    const total     = parseFloat(c.total || 0);
    const codDoc    = c.tiene_factura ? '01' : '03';
    const baseIVA15 = c.tiene_factura ? subtotal : 0;
    const baseIVA0  = c.tiene_factura ? 0 : subtotal;

    const items3 = (c.compras_detalle || [])
      .slice(0, 3).map(d => d.mp_nombre).join(' / ');

    return [
      i + 1,
      codDoc,
      c.fecha || '',
      c.proveedores?.ruc   || '',
      c.proveedores?.razon_social || c.proveedores?.nombre || c.proveedor_nombre || '',
      c.numero_factura || '',
      tipoIdDoc(c.proveedores?.ruc),
      RUC_EMPRESA,
      NOMBRE_EMPRESA,
      FORMA_SRI[c.forma_pago] || '20',
      '0.00',
      subtotal.toFixed(2),
      baseIVA0.toFixed(2), '0.00','0.00','0.00','0.00',
      baseIVA15.toFixed(2),
      '0.00','0.00','0.00','0.00',
      iva.toFixed(2),
      '0.00','0.00','0.00','0.00','0.00','0.00','0.00',
      total.toFixed(2),
      '',
      items3,
      '',
      c.autorizacion_sri || ''
    ];
  });

  const datos = rows.map(r => Object.fromEntries(enc.map((k, i) => [k, r[i]])));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ATS Compras');
  XLSX.writeFile(wb, `ATS_compras_${new Date().toISOString().slice(0,10)}.xlsx`);
}

const FORMAS_PAGO = ['transferencia', 'efectivo', 'cheque', 'tarjeta'];

export default function TabPagos({ mobile }) {
  const hoy   = new Date().toISOString().slice(0, 10);
  const mes1  = hoy.slice(0, 7) + '-01';

  const [pagos,        setPagos]        = useState([]);
  const [comprasATS,   setComprasATS]   = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [desde,        setDesde]        = useState(mes1);
  const [hasta,        setHasta]        = useState(hoy);
  const [formaFiltro,  setFormaFiltro]  = useState('Todas');
  const [busqueda,     setBusqueda]     = useState('');
  const [modalEditar,  setModalEditar]  = useState(null);
  const [editForm,     setEditForm]     = useState({});
  const [guardando,    setGuardando]    = useState(false);
  const [xmlEditContent, setXmlEditContent] = useState('');

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
    const [{ data: pagosData }, { data: comprasData }] = await Promise.all([
      (() => {
        let q = supabase
          .from('pagos_compras')
          .select(`*, proveedores ( nombre ), compras ( id, numero_factura, autorizacion_sri, xml_sri_url, recordar_factura, subtotal, descuento, iva, total )`)
          .gte('fecha_pago', desde)
          .lte('fecha_pago', hasta)
          .order('fecha_pago', { ascending: false });
        if (formaFiltro !== 'Todas') q = q.eq('forma_pago', formaFiltro);
        return q;
      })(),
      supabase
        .from('compras')
        .select(`*, proveedores ( ruc, nombre ), compras_detalle ( mp_nombre )`)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
    ]);
    setPagos(pagosData || []);
    setComprasATS(comprasData || []);
    setCargando(false);
  }, [desde, hasta, formaFiltro]);

  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['pagos_compras', 'compras', 'proveedores'], cargar);

  function abrirEditar(p) {
    setEditForm({
      monto:           p.monto || '',
      forma_pago:      p.forma_pago || 'transferencia',
      fecha_pago:      p.fecha_pago || hoy,
      notas:           p.notas || '',
      numero_factura:  p.compras?.numero_factura  || '',
      autorizacion_sri:p.compras?.autorizacion_sri || '',
      subtotal:        p.compras?.subtotal || '',
      descuento:       p.compras?.descuento || '',
      iva:             p.compras?.iva || '',
      total:           p.compras?.total || ''
    });
    setModalEditar(p);
  }

  async function guardarEdicion() {
    if (!modalEditar) return;
    setGuardando(true);
    await supabase.from('pagos_compras').update({
      monto:      parseFloat(editForm.monto) || 0,
      forma_pago: editForm.forma_pago,
      fecha_pago: editForm.fecha_pago,
      notas:      editForm.notas || null
    }).eq('id', modalEditar.id);

    if (modalEditar.compras?.id) {
      await supabase.from('compras').update({
        numero_factura:  editForm.numero_factura   || null,
        autorizacion_sri:editForm.autorizacion_sri || null,
        recordar_factura:editForm.numero_factura ? false : undefined,
        subtotal:        parseFloat(editForm.subtotal) || 0,
        descuento:       parseFloat(editForm.descuento) || 0,
        iva:             parseFloat(editForm.iva) || 0,
        total:           parseFloat(editForm.total) || 0
      }).eq('id', modalEditar.compras.id);
    }

    // Subir XML a Storage si se cargó uno nuevo
    if (xmlEditContent && modalEditar.compras?.id) {
      const blob = new Blob([xmlEditContent], { type: 'text/xml' });
      const { error: uploadErr } = await supabase.storage.from('xml-sri').upload(`compras/${modalEditar.compras.id}.xml`, blob, { upsert: true, contentType: 'text/xml' });
      if (uploadErr) {
        alert('⚠️ Error al subir XML: ' + uploadErr.message);
      } else {
        const { data: urlData } = supabase.storage.from('xml-sri').getPublicUrl(`compras/${modalEditar.compras.id}.xml`);
        await supabase.from('compras').update({ xml_sri_url: urlData.publicUrl }).eq('id', modalEditar.compras.id);
      }
      setXmlEditContent('');
    }

    setGuardando(false);
    setModalEditar(null);
    cargar();
  }

  // Filtro por búsqueda local (proveedor o nota)
  const filtrados = pagos.filter(p => {
    if (!busqueda) return true;
    const b = busqueda.toLowerCase();
    return (
      (p.proveedores?.nombre || '').toLowerCase().includes(b) ||
      (p.notas || '').toLowerCase().includes(b)
    );
  });

  // Totales por forma
  const totalesPorForma = filtrados.reduce((acc, p) => {
    const f = p.forma_pago || 'otro';
    acc[f] = (acc[f] || 0) + (p.monto || 0);
    return acc;
  }, {});
  const totalGeneral = filtrados.reduce((s, p) => s + (p.monto || 0), 0);

  const FORMA_EMOJI = {
    transferencia: '🏦', efectivo: '💵', cheque: '📄', tarjeta: '💳'
  };

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Desde</div>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Hasta</div>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Forma de pago</div>
          <select value={formaFiltro} onChange={e => setFormaFiltro(e.target.value)} style={inputStyle}>
            {FORMAS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Buscar proveedor</div>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Nombre del proveedor..."
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={() => exportarPagos(filtrados)} style={{
          background: '#27ae60', color: 'white', border: 'none',
          borderRadius: '8px', padding: '9px 16px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          📥 Pagos CSV
        </button>
        <button onClick={() => exportarATS(comprasATS)} style={{
          background: '#8e44ad', color: 'white', border: 'none',
          borderRadius: '8px', padding: '9px 16px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          📋 ATS SRI
        </button>
      </div>

      {/* Resumen totales */}
      {filtrados.length > 0 && (
        <div style={{
          ...card,
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a', marginRight: '4px' }}>
            Total: <span style={{ color: '#2980b9' }}>${totalGeneral.toFixed(2)}</span>
          </div>
          {Object.entries(totalesPorForma).map(([forma, total]) => (
            <span key={forma} style={{
              background: '#f0f2f5', borderRadius: '20px',
              padding: '4px 12px', fontSize: '12px', color: '#555'
            }}>
              {FORMA_EMOJI[forma] || '💰'} {forma}: <b>${total.toFixed(2)}</b>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
            {filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          Cargando pagos...
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay pagos en el período seleccionado.
        </div>
      ) : (
        filtrados.map(p => {
          const sri      = p.compras?.autorizacion_sri || '';
          const xmlUrl   = p.compras?.xml_sri_url || null;
          return (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>

                {/* Izquierda — proveedor + fecha */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a' }}>
                      🏢 {p.proveedores?.nombre || '—'}
                    </span>
                    <span style={{
                      background: '#eaf4ff', color: '#2980b9',
                      borderRadius: '12px', padding: '2px 10px',
                      fontSize: '11px', fontWeight: 'bold'
                    }}>
                      {FORMA_EMOJI[p.forma_pago] || '💰'} {p.forma_pago || '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#777' }}>
                    📅 {p.fecha_pago}
                    {p.notas && <span style={{ marginLeft: '10px', fontStyle: 'italic' }}>📝 {p.notas}</span>}
                  </div>
                </div>

                {/* Derecha — monto + botones + XML */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                  {/* Fila 1: monto */}
                  <div style={{ fontSize: mobile ? '18px' : '20px', fontWeight: 'bold', color: '#27ae60' }}>
                    ${(p.monto || 0).toFixed(2)}
                  </div>
                  {/* Fila 2: Editar | Alerta | XML badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={() => abrirEditar(p)} style={{
                      background: '#f0f2f5', border: '1px solid #ddd',
                      borderRadius: '8px', padding: '5px 10px',
                      cursor: 'pointer', fontSize: '12px', color: '#555'
                    }}>✏️ Editar</button>

                    {p.compras?.recordar_factura && (
                      <span style={{
                        background: '#fff3e0', color: '#e67e22',
                        borderRadius: '10px', padding: '3px 10px',
                        fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap'
                      }}>🔔 Factura pendiente</span>
                    )}

                    {sri ? (
                      <span style={{
                        background: '#eafaf1', color: '#27ae60',
                        borderRadius: '8px', padding: '3px 10px',
                        fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap'
                      }}>✅ XML ···{sri.slice(-8)}</span>
                    ) : (
                      <span style={{
                        background: '#f5f5f5', color: '#bbb',
                        borderRadius: '8px', padding: '3px 10px',
                        fontSize: '11px', whiteSpace: 'nowrap'
                      }}>— Sin XML</span>
                    )}
                  </div>
                  {/* Fila 3: descarga XML o aviso */}
                  {sri && (
                    xmlUrl
                      ? <a href={xmlUrl}
                          download={`factura_${p.compras?.numero_factura || p.id}.xml`}
                          target="_blank" rel="noreferrer"
                          style={{ fontSize: '10px', color: '#2980b9', textDecoration: 'underline', cursor: 'pointer' }}>
                          📥 descargar XML SRI
                        </a>
                      : <span
                          onClick={() => abrirEditar(p)}
                          style={{ fontSize: '10px', color: '#aaa', cursor: 'pointer', textDecoration: 'underline' }}
                          title="Re-sube el XML en Editar para guardarlo">
                          📎 re-subir XML para descargar
                        </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Modal editar pago */}
      {modalEditar && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: mobile ? '95vw' : '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '16px', color: '#1a3a2a' }}>
              ✏️ Editar pago — {modalEditar.proveedores?.nombre || '—'}
            </div>

            {/* Campos del pago */}
            <div style={{ fontSize: '11px', color: '#2980b9', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pago
            </div>
            {[
              { label: 'Monto pagado ($)', key: 'monto', type: 'number' },
              { label: 'Fecha de pago', key: 'fecha_pago', type: 'date' },
              { label: 'Notas', key: 'notas', type: 'text' }
            ].map(({ label, key, type }) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>{label}</div>
                <input
                  type={type}
                  value={editForm[key]}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '8px 12px', borderRadius: '8px',
                    border: '1.5px solid #ddd', fontSize: '13px'
                  }}
                />
              </div>
            ))}

            {/* Campos de la compra */}
            {modalEditar?.compras?.id && <>
              <div style={{ fontSize: '11px', color: '#27ae60', fontWeight: '700', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Compra
              </div>

              {/* N° Factura + XML */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>🧾 N° Factura</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text" value={editForm.numero_factura}
                    onChange={e => setEditForm(f => ({ ...f, numero_factura: e.target.value }))}
                    placeholder="001-001-000000001"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  <input id="xml-edit-pagos" type="file" accept=".xml" style={{ display: 'none' }}
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
                  <label htmlFor="xml-edit-pagos" style={{
                    background: '#e3f2fd', color: '#1565c0', border: '1.5px solid #90caf9',
                    borderRadius: '8px', padding: '7px 10px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap'
                  }}>📎 XML</label>
                </div>
              </div>

              {/* Autorización SRI */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Autorización SRI</div>
                <input
                  type="text" value={editForm.autorizacion_sri}
                  onChange={e => setEditForm(f => ({ ...f, autorizacion_sri: e.target.value }))}
                  placeholder="49 dígitos (clave de acceso)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: `1.5px solid ${editForm.autorizacion_sri ? '#27ae60' : '#ddd'}`, fontSize: '11px', fontFamily: 'monospace' }}
                />
                {editForm.autorizacion_sri && (
                  <div style={{ fontSize: '10px', color: '#27ae60', marginTop: '2px' }}>✅ XML cargado</div>
                )}
              </div>

              {[
                { label: 'Subtotal ($)', key: 'subtotal', type: 'number' },
                { label: 'Descuento ($)', key: 'descuento', type: 'number' },
                { label: 'IVA ($)', key: 'iva', type: 'number' },
                { label: 'Total ($)', key: 'total', type: 'number' }
              ].map(({ label, key, type }) => (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>{label}</div>
                  <input
                    type={type} value={editForm[key]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '13px' }}
                  />
                </div>
              ))}
            </>}

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Forma de pago</div>
              <select
                value={editForm.forma_pago}
                onChange={e => setEditForm(f => ({ ...f, forma_pago: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  border: '1.5px solid #ddd', fontSize: '13px'
                }}
              >
                {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEditar(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px',
                padding: '9px 18px', cursor: 'pointer', fontSize: '13px'
              }}>
                Cancelar
              </button>
              <button onClick={guardarEdicion} disabled={guardando} style={{
                background: '#2980b9', color: 'white', border: 'none',
                borderRadius: '8px', padding: '9px 18px', cursor: 'pointer',
                fontSize: '13px', fontWeight: 'bold'
              }}>
                {guardando ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
