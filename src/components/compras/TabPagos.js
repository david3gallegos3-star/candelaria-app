// ============================================
// TabPagos.js
// Historial de pagos a proveedores + Excel
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const FORMAS = ['Todas', 'transferencia', 'efectivo', 'cheque', 'tarjeta'];

function exportarExcel(filas) {
  const encabezado = ['Fecha', 'Proveedor', 'Forma de pago', 'Monto', 'Notas'];
  const rows = filas.map(p => [
    p.fecha_pago,
    p.proveedores?.nombre || '',
    p.forma_pago || '',
    (p.monto || 0).toFixed(2),
    p.notas || ''
  ]);
  const csv = [encabezado, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pagos_proveedores_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TabPagos({ mobile }) {
  const hoy   = new Date().toISOString().slice(0, 10);
  const mes1  = hoy.slice(0, 7) + '-01';

  const [pagos,      setPagos]      = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [desde,      setDesde]      = useState(mes1);
  const [hasta,      setHasta]      = useState(hoy);
  const [formaFiltro,setFormaFiltro]= useState('Todas');
  const [busqueda,   setBusqueda]   = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase
      .from('pagos_compras')
      .select(`*, proveedores ( nombre )`)
      .gte('fecha_pago', desde)
      .lte('fecha_pago', hasta)
      .order('fecha_pago', { ascending: false });

    if (formaFiltro !== 'Todas') q = q.eq('forma_pago', formaFiltro);

    const { data } = await q;
    setPagos(data || []);
    setCargando(false);
  }, [desde, hasta, formaFiltro]);

  useEffect(() => { cargar(); }, [cargar]);

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
        <button onClick={() => exportarExcel(filtrados)} style={{
          background: '#27ae60', color: 'white', border: 'none',
          borderRadius: '8px', padding: '9px 16px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          📥 Exportar CSV
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
        filtrados.map(p => (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              {/* Izquierda */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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

              {/* Derecha — monto */}
              <div style={{
                fontSize: mobile ? '18px' : '20px',
                fontWeight: 'bold', color: '#27ae60'
              }}>
                ${(p.monto || 0).toFixed(2)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
