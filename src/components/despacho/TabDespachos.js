// ============================================
// TabDespachos.js
// Lista de despachos con seguimiento de estado
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const ESTADO = {
  preparando: { bg: '#fef9e7', color: '#f39c12', label: '📦 Preparando' },
  despachado: { bg: '#e8f4fd', color: '#2980b9', label: '🚚 Despachado' },
  entregado:  { bg: '#e8f5e9', color: '#27ae60', label: '✅ Entregado'  },
  cancelado:  { bg: '#fde8e8', color: '#e74c3c', label: '❌ Cancelado'  },
};

const hoy    = new Date().toISOString().slice(0, 10);
const mes1   = hoy.slice(0, 7) + '-01';

export default function TabDespachos({ mobile, refrescar }) {
  const [despachos,  setDespachos]  = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [desde,      setDesde]      = useState(mes1);
  const [hasta,      setHasta]      = useState(hoy);
  const [expandido,  setExpandido]  = useState(null);
  const [lotesDet,   setLotesDet]   = useState([]);
  const [exito,      setExito]      = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.from('despachos')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('created_at', { ascending: false });
    setDespachos(data || []);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (refrescar) cargar(); }, [refrescar]);

  async function toggleDetalle(id) {
    if (expandido === id) { setExpandido(null); setLotesDet([]); return; }
    setExpandido(id);
    const { data } = await supabase.from('despacho_lotes')
      .select('*').eq('despacho_id', id).order('id');
    setLotesDet(data || []);
  }

  async function cambiarEstado(id, nuevoEstado) {
    await supabase.from('despachos').update({ estado: nuevoEstado }).eq('id', id);

    // Si se marca como cancelado, devolver lotes a "activo"
    if (nuevoEstado === 'cancelado') {
      const { data: dl } = await supabase.from('despacho_lotes')
        .select('lote_id').eq('despacho_id', id);
      if (dl && dl.length > 0) {
        await supabase.from('lotes_produccion')
          .update({ estado: 'activo' })
          .in('id', dl.map(d => d.lote_id));
      }
    }

    mostrarExito(`✅ Estado actualizado a "${ESTADO[nuevoEstado]?.label}"`);
    cargar();
  }

  function mostrarExito(msg) {
    setExito(msg);
    setTimeout(() => setExito(''), 4000);
  }

  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  return (
    <div>
      {exito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '10px 14px', borderRadius: 8,
          marginBottom: 12, fontWeight: 'bold', fontSize: '13px'
        }}>{exito}</div>
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
        <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#555', fontWeight: 'bold' }}>
          {despachos.length} despachos
        </span>
      </div>

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>
      ) : despachos.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'white', borderRadius: 12, color: '#aaa'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🚚</div>
          <div style={{ fontWeight: 'bold' }}>Sin despachos en este período</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {despachos.map(d => {
            const est = ESTADO[d.estado] || ESTADO.preparando;
            const abierto = expandido === d.id;
            return (
              <div key={d.id} style={{
                background: 'white', borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                border: abierto ? '2px solid #2d6a4f' : '2px solid transparent',
                overflow: 'hidden'
              }}>
                {/* Fila principal */}
                <div style={{
                  padding: mobile ? '12px' : '12px 16px',
                  display: 'flex', alignItems: 'center',
                  flexWrap: 'wrap', gap: 8
                }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a1a2e', marginBottom: 2 }}>
                      {d.numero}
                      <span style={{
                        marginLeft: 8, fontSize: '10px',
                        background: est.bg, color: est.color,
                        padding: '2px 8px', borderRadius: 8
                      }}>{est.label}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                      📅 {d.fecha}
                      {d.destino && ` · 📍 ${d.destino}`}
                    </div>
                    {d.transportista && (
                      <div style={{ fontSize: '11px', color: '#888' }}>
                        🚛 {d.transportista}{d.placa ? ` · ${d.placa}` : ''}
                      </div>
                    )}
                  </div>

                  {/* Acciones estado */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {d.estado === 'preparando' && (
                      <button onClick={() => cambiarEstado(d.id, 'despachado')} style={{
                        background: '#e8f4fd', color: '#2980b9',
                        border: '1.5px solid #2980b9',
                        borderRadius: 7, padding: '6px 12px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
                      }}>🚚 Marcar despachado</button>
                    )}
                    {d.estado === 'despachado' && (
                      <button onClick={() => cambiarEstado(d.id, 'entregado')} style={{
                        background: '#e8f5e9', color: '#27ae60',
                        border: '1.5px solid #27ae60',
                        borderRadius: 7, padding: '6px 12px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
                      }}>✅ Marcar entregado</button>
                    )}
                    {(d.estado === 'preparando' || d.estado === 'despachado') && (
                      <button onClick={() => cambiarEstado(d.id, 'cancelado')} style={{
                        background: 'white', color: '#e74c3c',
                        border: '1.5px solid #e74c3c',
                        borderRadius: 7, padding: '6px 12px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
                      }}>❌ Cancelar</button>
                    )}
                    <button onClick={() => toggleDetalle(d.id)} style={{
                      background: abierto ? '#2d6a4f' : 'white',
                      color: abierto ? 'white' : '#2d6a4f',
                      border: '1.5px solid #2d6a4f',
                      borderRadius: 7, padding: '6px 12px',
                      cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
                    }}>{abierto ? '▲' : '👁 Ver'}</button>
                  </div>
                </div>

                {/* Detalle lotes */}
                {abierto && (
                  <div style={{
                    borderTop: '1.5px solid #e8f4fd',
                    padding: '10px 16px', background: '#f8fcff'
                  }}>
                    {d.observaciones && (
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: 8, fontStyle: 'italic' }}>
                        📝 {d.observaciones}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', marginBottom: 6, textTransform: 'uppercase' }}>
                      Lotes incluidos
                    </div>
                    {lotesDet.length === 0 ? (
                      <div style={{ color: '#aaa', fontSize: '12px' }}>Sin lotes registrados</div>
                    ) : lotesDet.map((l, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '6px 0', borderBottom: '1px solid #f0f0f0',
                        fontSize: '13px'
                      }}>
                        <span style={{ color: '#1a1a2e', fontWeight: '500' }}>{l.producto}</span>
                        <span style={{ color: '#2980b9', fontWeight: 'bold' }}>
                          {parseFloat(l.kg_despachados).toFixed(3)} kg
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
