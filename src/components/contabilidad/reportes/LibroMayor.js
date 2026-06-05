import React, { useEffect, useState } from 'react';
import { getAsientosPorPeriodo, getDetallesConFechaPorAsientos, getCuentasContables } from './reporteQueries';

export default function LibroMayor({ fechaDesde, fechaHasta, empresa }) {
  const [cuentas,     setCuentas]     = useState([]);
  const [cuentaSelec, setCuentaSelec] = useState('');
  const [movimientos, setMovimientos] = useState([]);
  const [cargando,    setCargando]    = useState(false);

  useEffect(() => { getCuentasContables().then(setCuentas).catch(console.error); }, []);

  useEffect(() => {
    if (cuentaSelec && fechaDesde && fechaHasta) cargarMovimientos();
  }, [cuentaSelec, fechaDesde, fechaHasta]);

  async function cargarMovimientos() {
    setCargando(true);
    try {
      const asientoIds = await getAsientosPorPeriodo(fechaDesde, fechaHasta);
      const detalles   = await getDetallesConFechaPorAsientos(asientoIds);
      setMovimientos(detalles
        .filter(d => d.cuenta_id === cuentaSelec)
        .sort((a, b) => (a.asiento?.fecha || '').localeCompare(b.asiento?.fecha || '')));
    } catch (e) { console.error(e); }
    setCargando(false);
  }

  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;
  const cuentaObj = cuentas.find(c => c.id === cuentaSelec);
  let saldo = 0;

  return (
    <div id="reporte-imprimible">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>LIBRO MAYOR</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Período: {fechaDesde} al {fechaHasta}</div>
      </div>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <select value={cuentaSelec} onChange={e => setCuentaSelec(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13 }}>
          <option value="">— Elegir cuenta —</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
        </select>
      </div>
      {cuentaObj && <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 12, color: '#1a2a4a' }}>{cuentaObj.codigo} — {cuentaObj.nombre}</div>}
      {cargando ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>Cargando...</div>
      ) : movimientos.length === 0 && cuentaSelec ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>Sin movimientos en este período</div>
      ) : movimientos.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1a2a4a', color: 'white' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left' }}>Fecha</th>
              <th style={{ padding: '7px 10px', textAlign: 'left' }}>Descripción</th>
              <th style={{ padding: '7px 10px', textAlign: 'right' }}>Debe</th>
              <th style={{ padding: '7px 10px', textAlign: 'right' }}>Haber</th>
              <th style={{ padding: '7px 10px', textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m, i) => {
              saldo += parseFloat(m.debe || 0) - parseFloat(m.haber || 0);
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? 'white' : '#f8f9fa' }}>
                  <td style={{ padding: '6px 10px' }}>{m.asiento?.fecha || '—'}</td>
                  <td style={{ padding: '6px 10px', color: '#555' }}>{m.descripcion || m.asiento?.descripcion || '—'}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{m.debe > 0 ? $(m.debe) : ''}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>{m.haber > 0 ? $(m.haber) : ''}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: saldo >= 0 ? '#27ae60' : '#e74c3c' }}>{$(saldo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
