// ============================================
// TabFacturas.js
// Lista de facturas emitidas — ver, anular
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { getBorradores as getLocalBorradores } from '../../lib/offlineBorradores';

const ESTADO_COLOR = {
  autorizada: { bg: '#e8f5e9', color: '#27ae60', label: '✅ Autorizada' },
  anulada:    { bg: '#fde8e8', color: '#e74c3c', label: '❌ Anulada'    },
  borrador:   { bg: '#fef9e7', color: '#f39c12', label: '📝 Borrador'   },
};

export default function TabFacturas({ mobile }) {

  const [facturas,    setFacturas]    = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado,setFiltroEstado]= useState('todas');
  const [expandida,   setExpandida]   = useState(null); // id de factura expandida
  const [detalle,     setDetalle]     = useState([]);   // líneas de la factura expandida
  const [modalAnular, setModalAnular] = useState(null); // factura a anular
  const [motivoAnul,  setMotivoAnul]  = useState('');
  const [anulando,    setAnulando]    = useState(false);
  const [msgExito,    setMsgExito]    = useState('');
  const [emitiendoId,     setEmitiendoId]     = useState(null);
  const [errorEmitir,     setErrorEmitir]     = useState({});
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => { cargarFacturas(); }, []);
  useRealtime(['facturas', 'facturas_detalle'], cargarFacturas);

  // ── Cargar facturas ───────────────────────────────────────
  async function cargarFacturas() {
    setCargando(true);
    const { data } = await supabase.from('facturas')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Borradores locales (offline) — vienen de localStorage, siempre disponibles
    const locales = getLocalBorradores().map(b => ({
      ...b.facturaPayload,
      id:             b.id,
      cliente_nombre: b.clienteData?.nombre || 'CONSUMIDOR FINAL',
      estado:         'borrador',
      created_at:     new Date(b.timestamp).toISOString(),
      _local:         true,
      _detalle:       b.detallePayload,
    }));

    // Evitar duplicados: quitar locales que ya están en Supabase (mismo numero)
    const numerosEnSupabase = new Set((data || []).map(f => f.numero));
    const localesFiltrados = locales.filter(l => !numerosEnSupabase.has(l.numero));

    setFacturas([...localesFiltrados, ...(data || [])]);
    setCargando(false);
  }

  // ── Ver detalle de una factura ────────────────────────────
  async function toggleDetalle(id) {
    if (expandida === id) { setExpandida(null); setDetalle([]); return; }
    setExpandida(id);
    setDetalle([]);
    setCargandoDetalle(true);

    // Borrador local: leer detalle directo de localStorage (sin red ni cache)
    const localBorrador = getLocalBorradores().find(b => b.id === id);
    if (localBorrador) {
      setDetalle(localBorrador.detallePayload.map((it, i) => ({
        ...it, id: `${id}-${i}`, factura_id: id
      })));
      setCargandoDetalle(false);
      return;
    }

    const { data } = await supabase.from('facturas_detalle')
      .select('*').eq('factura_id', id).order('id');
    setDetalle(data || []);
    setCargandoDetalle(false);
  }

  // ── Anular factura con nota de crédito ────────────────────
  async function anularFactura() {
    if (!motivoAnul.trim()) return alert('Escribe el motivo de anulación');
    setAnulando(true);
    const f = modalAnular;

    // Crear nota de crédito
    await supabase.from('notas_credito').insert({
      factura_id: f.id,
      motivo:     motivoAnul,
      total:      f.total,
      estado:     'emitida'
    });

    // Marcar factura como anulada (soft — nunca se borra)
    await supabase.from('facturas')
      .update({ estado: 'anulada' })
      .eq('id', f.id);

    // Si tenía cuenta x cobrar pendiente → marcarla como anulada
    await supabase.from('cuentas_cobrar')
      .update({ estado: 'anulada' })
      .eq('factura_id', f.id)
      .eq('estado', 'pendiente');

    setAnulando(false);
    setModalAnular(null);
    setMotivoAnul('');
    mostrarExito('✅ Factura anulada con nota de crédito');
    cargarFacturas();
  }

  // ── Emitir borrador al SRI ────────────────────────────────
  async function emitirBorrador(f) {
    if (!navigator.onLine) {
      setErrorEmitir(prev => ({ ...prev, [f.id]: 'Sin conexión a internet. Conéctate e intenta de nuevo.' }));
      return;
    }
    setEmitiendoId(f.id);
    setErrorEmitir(prev => { const n = { ...prev }; delete n[f.id]; return n; });

    try {
      const { data: clienteData, error: errC } = await supabase.from('clientes')
        .select('*').eq('id', f.cliente_id).single();
      if (errC || !clienteData) throw new Error('No se pudo cargar el cliente');

      const { data: detalleData, error: errD } = await supabase.from('facturas_detalle')
        .select('*').eq('factura_id', f.id);
      if (errD || !detalleData?.length) throw new Error('No se pudo cargar el detalle');

      const secuencial = parseInt(f.numero.split('-').pop(), 10);

      const res = await fetch('/api/emitir-factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente:      clienteData,
          items:        detalleData,
          formaPago:    f.forma_pago,
          diasCredito:  f.dias_credito || 0,
          observaciones: f.observaciones || '',
          vendedor:     f.vendedor || '',
          secuencial
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error Dátil/SRI');

      await supabase.from('facturas').update({
        estado:           'autorizada',
        autorizacion_sri: data.autorizacion,
        datil_id:         data.datil_id,
        pdf_url:          data.pdf_url,
        xml_url:          data.xml_url,
      }).eq('id', f.id);

      mostrarExito(`✅ Factura ${f.numero} autorizada por el SRI`);
      cargarFacturas();

    } catch (e) {
      setErrorEmitir(prev => ({ ...prev, [f.id]: e.message }));
    }
    setEmitiendoId(null);
  }

  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 4000);
  }

  // ── Filtros ───────────────────────────────────────────────
  const facturasFiltradas = facturas.filter(f => {
    const textoOk = !filtroTexto ||
      f.numero?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
      (f.cliente_nombre || '').toLowerCase().includes(filtroTexto.toLowerCase());
    const estadoOk = filtroEstado === 'todas' || f.estado === filtroEstado;
    return textoOk && estadoOk;
  });

  const totalFiltrado = facturasFiltradas
    .filter(f => f.estado === 'autorizada')
    .reduce((s, f) => s + (parseFloat(f.total) || 0), 0);

  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div>

      {/* Éxito */}
      {msgExito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '10px 14px', borderRadius: 8,
          marginBottom: 12, fontWeight: 'bold', fontSize: '13px'
        }}>{msgExito}</div>
      )}

      {/* Filtros */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <input
          type="text"
          value={filtroTexto}
          onChange={e => setFiltroTexto(e.target.value)}
          placeholder="🔍 Buscar por número o cliente..."
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          style={inputStyle}
        >
          <option value="todas">Todas</option>
          <option value="autorizada">Autorizadas</option>
          <option value="borrador">Borradores</option>
          <option value="anulada">Anuladas</option>
        </select>
        <div style={{
          fontSize: '13px', color: '#555',
          padding: '8px 12px', background: '#f0f7ff',
          borderRadius: 8, fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          {facturasFiltradas.length} facturas · ${totalFiltrado.toFixed(2)}
        </div>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          ⏳ Cargando facturas...
        </div>
      ) : facturasFiltradas.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'white', borderRadius: 12, color: '#aaa'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
          <div style={{ fontWeight: 'bold' }}>Sin facturas</div>
          <div style={{ fontSize: '12px', marginTop: 4 }}>
            Las facturas emitidas aparecerán aquí
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {facturasFiltradas.map(f => {
            const est = ESTADO_COLOR[f.estado] || ESTADO_COLOR.borrador;
            const abierta = expandida === f.id;
            return (
              <div key={f.id} style={{
                background: 'white', borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                border: abierta ? '2px solid #2980b9' : '2px solid transparent'
              }}>
                {/* Fila principal */}
                <div style={{
                  padding: mobile ? '12px' : '12px 16px',
                  display: 'flex', alignItems: 'center',
                  flexWrap: 'wrap', gap: 8
                }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{
                      fontWeight: 'bold', color: '#1a1a2e',
                      fontSize: '14px', marginBottom: 2
                    }}>
                      {f.numero}
                      <span style={{
                        marginLeft: 8, fontSize: '10px',
                        background: est.bg, color: est.color,
                        padding: '2px 8px', borderRadius: 8
                      }}>{est.label}</span>
                      {f._local && (
                        <span style={{
                          marginLeft: 6, fontSize: '10px',
                          background: '#fef3c7', color: '#92400e',
                          padding: '2px 8px', borderRadius: 8
                        }}>📴 sin internet</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                      👤 {f.cliente_nombre || 'CONSUMIDOR FINAL'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: 2 }}>
                      {new Date(f.created_at).toLocaleDateString('es-EC', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                      {' · '}{f.forma_pago}
                      {f.forma_pago === 'credito' && f.dias_credito
                        ? ` (${f.dias_credito} días)` : ''}
                    </div>
                  </div>

                  {/* Total */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '18px', fontWeight: 'bold', color: '#1a5276'
                    }}>${parseFloat(f.total).toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>
                      + IVA ${parseFloat(f.iva || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Botones */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => toggleDetalle(f.id)} style={{
                      background: abierta ? '#2980b9' : 'white',
                      color:      abierta ? 'white'   : '#2980b9',
                      border: '1.5px solid #2980b9',
                      borderRadius: 7, padding: '6px 12px',
                      cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
                    }}>{abierta ? '▲ Cerrar' : '👁 Ver'}</button>

                    {f.pdf_url && (
                      <a href={f.pdf_url} target="_blank" rel="noreferrer" style={{
                        background: '#e8f4fd', color: '#2980b9',
                        border: '1.5px solid #2980b9',
                        borderRadius: 7, padding: '6px 12px',
                        fontWeight: 'bold', fontSize: '12px',
                        textDecoration: 'none', display: 'inline-block'
                      }}>📄 RIDE</a>
                    )}

                    {f.estado === 'borrador' && !f._local && (
                      <button
                        onClick={() => emitirBorrador(f)}
                        disabled={emitiendoId === f.id}
                        style={{
                          background: emitiendoId === f.id ? '#95a5a6' : '#f39c12',
                          color: 'white', border: 'none',
                          borderRadius: 7, padding: '6px 12px',
                          cursor: emitiendoId === f.id ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold', fontSize: '12px'
                        }}>
                        {emitiendoId === f.id ? '⏳ Emitiendo...' : '📤 Emitir al SRI'}
                      </button>
                    )}
                    {f.estado === 'borrador' && f._local && (
                      <span style={{
                        fontSize: '11px', color: '#92400e',
                        padding: '6px 10px', background: '#fef3c7',
                        borderRadius: 7, fontWeight: 'bold'
                      }}>⏳ Se enviará al conectarse</span>
                    )}

                    {f.estado === 'autorizada' && (
                      <button onClick={() => { setModalAnular(f); setMotivoAnul(''); }} style={{
                        background: 'white', color: '#e74c3c',
                        border: '1.5px solid #e74c3c',
                        borderRadius: 7, padding: '6px 12px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
                      }}>🚫 Anular</button>
                    )}
                  </div>
                </div>

                {/* Error al emitir borrador */}
                {errorEmitir[f.id] && (
                  <div style={{
                    padding: '8px 16px', background: '#fde8e8',
                    color: '#e74c3c', fontSize: '12px', fontWeight: 'bold',
                    borderTop: '1px solid #f5c6cb'
                  }}>
                    ⚠️ {errorEmitir[f.id]}
                  </div>
                )}

                {/* Detalle expandido */}
                {abierta && (
                  <div style={{
                    borderTop: '1.5px solid #e8f4fd',
                    padding: '10px 16px', background: '#f8fcff'
                  }}>
                    {/* Autorización SRI */}
                    {f.autorizacion_sri && (
                      <div style={{
                        fontSize: '11px', color: '#888',
                        marginBottom: 8, fontFamily: 'monospace'
                      }}>
                        🔑 Auth SRI: {f.autorizacion_sri}
                      </div>
                    )}

                    {/* Tabla detalle */}
                    <table style={{
                      width: '100%', borderCollapse: 'collapse', fontSize: '12px'
                    }}>
                      <thead>
                        <tr style={{ background: '#e8f4fd' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: '#555' }}>
                            PRODUCTO
                          </th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#555' }}>
                            CANT (kg)
                          </th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#555' }}>
                            PRECIO/kg
                          </th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#555' }}>
                            SUBTOTAL
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cargandoDetalle ? (
                          <tr><td colSpan={4} style={{
                            padding: 12, textAlign: 'center', color: '#aaa'
                          }}>⏳ Cargando...</td></tr>
                        ) : detalle.length === 0 ? (
                          <tr><td colSpan={4} style={{
                            padding: 12, textAlign: 'center', color: '#aaa'
                          }}>Sin detalle disponible</td></tr>
                        ) : detalle.map((d, i) => (
                          <tr key={i} style={{
                            background: i % 2 === 0 ? 'white' : '#fafafa',
                            borderBottom: '1px solid #f0f0f0'
                          }}>
                            <td style={{ padding: '6px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>
                              {d.descripcion || d.producto_nombre}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              {parseFloat(d.cantidad).toFixed(3)}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              ${parseFloat(d.precio_unitario).toFixed(4)}
                            </td>
                            <td style={{
                              padding: '6px 10px', textAlign: 'right',
                              fontWeight: 'bold', color: '#1a5276'
                            }}>
                              ${parseFloat(d.subtotal).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Resumen totales */}
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end',
                      gap: 16, marginTop: 8, fontSize: '13px'
                    }}>
                      <span style={{ color: '#555' }}>
                        Subtotal: <b>${parseFloat(f.subtotal).toFixed(2)}</b>
                      </span>
                      <span style={{ color: '#555' }}>
                        IVA 15%: <b>${parseFloat(f.iva).toFixed(2)}</b>
                      </span>
                      <span style={{ color: '#1a5276', fontWeight: 'bold', fontSize: '14px' }}>
                        TOTAL: ${parseFloat(f.total).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal anular */}
      {modalAnular && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 14,
            padding: '24px', maxWidth: 420, width: '100%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              fontWeight: 'bold', fontSize: '16px',
              color: '#e74c3c', marginBottom: 6
            }}>🚫 Anular factura</div>
            <div style={{ fontSize: '13px', color: '#555', marginBottom: 16 }}>
              {modalAnular.numero} — ${parseFloat(modalAnular.total).toFixed(2)}
              <br/>
              <span style={{ color: '#e74c3c', fontSize: '12px' }}>
                Se generará una nota de crédito. La factura no se borra.
              </span>
            </div>
            <textarea
              value={motivoAnul}
              onChange={e => setMotivoAnul(e.target.value)}
              placeholder="Motivo de anulación (requerido)..."
              rows={3}
              style={{
                width: '100%', padding: '10px', borderRadius: 8,
                border: '1.5px solid #ddd', fontSize: '13px',
                resize: 'vertical', boxSizing: 'border-box', marginBottom: 16
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setModalAnular(null); setMotivoAnul(''); }}
                style={{
                  background: '#f0f2f5', color: '#555', border: 'none',
                  borderRadius: 8, padding: '10px 20px',
                  cursor: 'pointer', fontWeight: 'bold'
                }}>Cancelar</button>
              <button
                onClick={anularFactura}
                disabled={anulando || !motivoAnul.trim()}
                style={{
                  background: anulando ? '#95a5a6' : '#e74c3c',
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '10px 20px', cursor: anulando ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}>{anulando ? '⏳...' : '🚫 Confirmar anulación'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
