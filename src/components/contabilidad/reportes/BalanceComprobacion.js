import React, { useEffect, useState } from 'react';
import { getAsientosPorPeriodo, getDetallesPorAsientos, getCuentasContables, agruparPorCuenta, calcularSaldo } from './reporteQueries';

export default function BalanceComprobacion({ fechaDesde, fechaHasta, empresa }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (fechaDesde && fechaHasta) cargar();
  }, [fechaDesde, fechaHasta]);

  async function cargar() {
    setCargando(true);
    try {
      const [asientoIds, cuentas] = await Promise.all([
        getAsientosPorPeriodo(fechaDesde, fechaHasta),
        getCuentasContables(),
      ]);
      const detalles = await getDetallesPorAsientos(asientoIds);
      const totales  = agruparPorCuenta(detalles);
      setFilas(cuentas.filter(c => totales[c.id]).map(c => ({
        ...c,
        debe:  totales[c.id].debe,
        haber: totales[c.id].haber,
        saldo: calcularSaldo(totales[c.id].debe, totales[c.id].haber, c.naturaleza),
      })));
    } catch (e) { console.error(e); }
    setCargando(false);
  }

  const totalDebe  = filas.reduce((s, f) => s + f.debe,  0);
  const totalHaber = filas.reduce((s, f) => s + f.haber, 0);
  const cuadra     = Math.abs(totalDebe - totalHaber) < 0.01;
  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando...</div>;

  return (
    <div id="reporte-imprimible">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>BALANCE DE COMPROBACIÓN</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Período: {fechaDesde} al {fechaHasta}</div>
      </div>
      {filas.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>Sin movimientos en este período</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1a2a4a', color: 'white' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Código</th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>Cuenta</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Debe</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Haber</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id} style={{ background: i % 2 === 0 ? 'white' : '#f8f9fa', borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{f.codigo}</td>
                <td style={{ padding: '6px 10px' }}>{f.nombre}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{$(f.debe)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{$(f.haber)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: f.saldo >= 0 ? '#27ae60' : '#e74c3c' }}>{$(Math.abs(f.saldo))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#1a2a4a', color: 'white', fontWeight: 'bold' }}>
              <td colSpan={2} style={{ padding: '8px 10px' }}>TOTALES</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{$(totalDebe)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{$(totalHaber)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>{cuadra ? '✅ Cuadra' : '❌ No cuadra'}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
