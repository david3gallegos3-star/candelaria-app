import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import EditarCompraModal from './EditarCompraModal';

const FORMA_LABEL = {
  efectivo: '💵 Efectivo', transferencia: '🏦 Transferencia', cheque: '📝 Cheque',
  credito: '📅 Crédito', deposito: '🏛️ Depósito',
};

export default function TabPersonalesCompras({ mobile, currentUser, userRol, editCompraId, onClearEdit }) {
  const [compras,      setCompras]      = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [filtroDesde,  setFiltroDesde]  = useState('');
  const [filtroHasta,  setFiltroHasta]  = useState('');
  const [busqueda,     setBusqueda]     = useState('');
  const [modalCompraId, setModalCompraId] = useState(null);

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
    setModalCompraId(editCompraId);
  }, [editCompraId]);

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
                    <button onClick={() => setModalCompraId(c.id)}
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

      {modalCompraId && (
        <EditarCompraModal
          compraId={modalCompraId}
          userRol={userRol}
          currentUser={currentUser}
          onClose={() => { setModalCompraId(null); onClearEdit?.(); }}
          onGuardado={() => { setModalCompraId(null); onClearEdit?.(); cargar(); }}
        />
      )}
    </div>
  );
}
