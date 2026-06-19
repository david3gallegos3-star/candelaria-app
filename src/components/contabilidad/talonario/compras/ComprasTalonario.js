import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function ComprasTalonario() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas,       setFilas]       = useState([]);
  const [cargando,    setCargando]    = useState(false);
  const [busqueda,    setBusqueda]    = useState('');
  const [filtroTipo,  setFiltroTipo]  = useState('');  // '' | 'con' | 'sin'
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('compras')
        .select('id, fecha, total, tiene_factura, forma_pago, numero_factura, proveedor_nombre, proveedores(nombre)')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .neq('es_personal', true)
        .neq('estado', 'anulada')
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const filasFiltradas = filas.filter(f => {
    const txt = busqueda.toLowerCase();
    const matchTxt = !busqueda ||
      (f.proveedores?.nombre || '').toLowerCase().includes(txt) ||
      (f.numero_factura || '').toLowerCase().includes(txt);
    const matchTipo = !filtroTipo ||
      (filtroTipo === 'con' &&  f.tiene_factura) ||
      (filtroTipo === 'sin' && !f.tiene_factura);
    const matchDesde = !filtroDesde || (f.fecha || '') >= filtroDesde;
    const matchHasta = !filtroHasta || (f.fecha || '') <= filtroHasta;
    return matchTxt && matchTipo && matchDesde && matchHasta;
  });

  const totalCon = filasFiltradas.filter(f =>  f.tiene_factura).reduce((s, f) => s + parseFloat(f.total||0), 0);
  const totalSin = filasFiltradas.filter(f => !f.tiene_factura).reduce((s, f) => s + parseFloat(f.total||0), 0);

  const columnas = [
    { key: 'fecha',           label: 'Fecha' },
    { key: 'proveedor',       label: 'Proveedor', render: f => f.proveedores?.nombre || f.proveedor_nombre || '—' },
    { key: 'numero_factura',  label: 'N° Factura', render: f => f.numero_factura || '—' },
    { key: 'tiene_factura',   label: 'Tipo', render: f => f.tiene_factura
      ? <span style={{ background:'#e8f5e9', color:'#27ae60', padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:'bold' }}>Con factura</span>
      : <span style={{ background:'#fff3e0', color:'#e67e22', padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:'bold' }}>Sin factura</span>
    },
    { key: 'total',       label: 'Total', render: f => `$${parseFloat(f.total||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',  label: 'Forma Pago', render: f => {
      const map = { efectivo: 'Efectivo (01)', transferencia: 'Transf. (20)',
                    cheque: 'Cheque (20)', debito: 'Débito (16)', credito: 'Crédito (19)' };
      return map[f.forma_pago] || f.forma_pago || '—';
    }},
  ];

  const inputStyle = { padding: '7px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 12 };
  const hayFiltros = busqueda || filtroTipo || filtroDesde || filtroHasta;

  return (
    <>
      {/* Filtros */}
      <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px',
        marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="🔍 Buscar proveedor o N° factura..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[['', 'Todas'], ['con', '✅ Con factura'], ['sin', '⚠️ Sin factura']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFiltroTipo(val)} style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 'bold',
              background: filtroTipo === val ? '#1a5276' : '#f0f2f5',
              color:      filtroTipo === val ? 'white'   : '#555',
              border:     filtroTipo === val ? '2px solid #1a5276' : '2px solid transparent',
            }}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: '#888' }}>Desde</label>
          <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={inputStyle} />
          <label style={{ fontSize: 11, color: '#888' }}>Hasta</label>
          <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={inputStyle} />
        </div>
        {hayFiltros && (
          <button onClick={() => { setBusqueda(''); setFiltroTipo(''); setFiltroDesde(''); setFiltroHasta(''); }}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd',
              background: '#f5f5f5', cursor: 'pointer', fontSize: 11, color: '#555' }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Totales clickeables */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[['Con factura', totalCon, 'con', '#27ae60'], ['Sin factura', totalSin, 'sin', '#e67e22']].map(([lbl, val, tipo, color]) => (
          <div key={lbl} onClick={() => setFiltroTipo(filtroTipo === tipo ? '' : tipo)}
            style={{ background: filtroTipo === tipo ? '#f0f7ff' : 'white',
              borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              border: filtroTipo === tipo ? `2px solid ${color}` : '2px solid transparent' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color }}>${val.toFixed(2)}</div>
          </div>
        ))}
        <div style={{ background: 'white', borderRadius: 8, padding: '10px 16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Total ({filasFiltradas.length} registros)</div>
          <div style={{ fontSize: 15, fontWeight: 'bold', color: '#1a5276' }}>${(totalCon + totalSin).toFixed(2)}</div>
        </div>
      </div>

      <TablaLectura
        titulo="🛒 Compras del Mes"
        filas={filasFiltradas}
        columnas={columnas}
        cargando={cargando}
        campoMonto="total"
      />
    </>
  );
}
