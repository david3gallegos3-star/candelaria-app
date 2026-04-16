// ============================================
// TabGuiasRemision.js
// Guías de remisión internas — vista imprimible
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

export default function TabGuiasRemision({ mobile }) {
  const [despachos, setDespachos] = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [desde,     setDesde]     = useState(mes1);
  const [hasta,     setHasta]     = useState(hoy);
  const [seleccion, setSeleccion] = useState(null); // despacho seleccionado para imprimir
  const [lotesDet,  setLotesDet]  = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.from('despachos')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .neq('estado', 'cancelado')
      .order('fecha', { ascending: false });
    setDespachos(data || []);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  async function verGuia(despacho) {
    const { data } = await supabase.from('despacho_lotes')
      .select('*').eq('despacho_id', despacho.id).order('id');
    setLotesDet(data || []);
    setSeleccion(despacho);
  }

  function imprimir() {
    window.print();
  }

  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  const totalKg = lotesDet.reduce((s, l) => s + (parseFloat(l.kg_despachados) || 0), 0);

  return (
    <div>
      {/* Modal guía imprimible */}
      {seleccion && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300, padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 14,
            width: '100%', maxWidth: 620,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)'
          }} id="guia-imprimible">

            {/* Header guía */}
            <div style={{
              background: '#1a3a2a', color: 'white',
              padding: '16px 20px', borderRadius: '14px 14px 0 0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                    GUÍA DE REMISIÓN
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    Embutidos y Jamones Candelaria
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                    {seleccion.numero}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    {seleccion.fecha}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Datos emisor */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 12, marginBottom: 16,
                padding: 14, background: '#f8f9fa', borderRadius: 10
              }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
                    Punto de partida
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                    {seleccion.origen || 'Ibarra, Imbabura, Ecuador'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
                    Destino
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                    {seleccion.destino}
                  </div>
                </div>
                {seleccion.transportista && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
                      Transportista
                    </div>
                    <div style={{ fontSize: '13px' }}>{seleccion.transportista}</div>
                  </div>
                )}
                {seleccion.ruc_transp && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
                      RUC/Cédula transportista
                    </div>
                    <div style={{ fontSize: '13px' }}>{seleccion.ruc_transp}</div>
                  </div>
                )}
                {seleccion.placa && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
                      Placa
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: 1 }}>
                      {seleccion.placa}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>
                    Fecha de traslado
                  </div>
                  <div style={{ fontSize: '13px' }}>{seleccion.fecha}</div>
                </div>
              </div>

              {/* Detalle productos */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: '11px', fontWeight: 'bold', color: '#555',
                  textTransform: 'uppercase', marginBottom: 8
                }}>
                  Detalle de mercadería
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#e8f5e9' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#1a3a2a' }}>Lote / Producto</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: '#1a3a2a' }}>Kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotesDet.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 10px', color: '#1a1a2e' }}>
                          <div style={{ fontWeight: 'bold' }}>{l.producto}</div>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                          {parseFloat(l.kg_despachados).toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f0f7ff', fontWeight: 'bold' }}>
                      <td style={{ padding: '8px 10px', color: '#1a3a2a' }}>TOTAL</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#1a5276', fontSize: '15px' }}>
                        {totalKg.toFixed(3)} kg
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {seleccion.observaciones && (
                <div style={{
                  padding: '10px 14px', background: '#fef9e7',
                  borderRadius: 8, fontSize: '12px', color: '#7d6608',
                  marginBottom: 16
                }}>
                  📝 {seleccion.observaciones}
                </div>
              )}

              {/* Firmas */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 20, marginTop: 24
              }}>
                {['Entregado por', 'Recibido por'].map(label => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{
                      borderTop: '1.5px solid #aaa',
                      paddingTop: 6, fontSize: '11px', color: '#888'
                    }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Botones */}
              <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}
                className="no-print">
                <button onClick={() => setSeleccion(null)} style={{
                  background: '#f0f2f5', color: '#555', border: 'none',
                  borderRadius: 8, padding: '10px 20px',
                  cursor: 'pointer', fontWeight: 'bold'
                }}>Cerrar</button>
                <button onClick={imprimir} style={{
                  background: '#1a3a2a', color: 'white', border: 'none',
                  borderRadius: 8, padding: '10px 20px',
                  cursor: 'pointer', fontWeight: 'bold'
                }}>🖨️ Imprimir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{
        background: 'white', borderRadius: 12,
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '12px', color: '#555' }}>Desde</span>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '12px', color: '#555' }}>Hasta</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={cargar} style={{
          background: '#f0f2f5', border: 'none', borderRadius: 8,
          padding: '8px 14px', cursor: 'pointer', fontSize: '12px', color: '#555'
        }}>🔄 Actualizar</button>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>
      ) : despachos.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'white', borderRadius: 12, color: '#aaa'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
          <div>Sin guías en este período</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {despachos.map(d => (
            <div key={d.id} style={{
              background: 'white', borderRadius: 12,
              padding: '12px 16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center',
              flexWrap: 'wrap', gap: 10
            }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a1a2e' }}>
                  {d.numero}
                </div>
                <div style={{ fontSize: '12px', color: '#555' }}>
                  {d.fecha} · {d.destino}
                </div>
                {d.transportista && (
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    🚛 {d.transportista}{d.placa ? ` · ${d.placa}` : ''}
                  </div>
                )}
              </div>
              <button onClick={() => verGuia(d)} style={{
                background: '#1a3a2a', color: 'white',
                border: 'none', borderRadius: 8,
                padding: '8px 16px', cursor: 'pointer',
                fontWeight: 'bold', fontSize: '13px'
              }}>📄 Ver guía</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
