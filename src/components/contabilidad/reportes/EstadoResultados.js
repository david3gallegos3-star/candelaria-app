import React, { useEffect, useState } from 'react';
import { getAsientosPorPeriodo, getDetallesPorAsientos, getCuentasContables, agruparPorCuenta } from './reporteQueries';

export default function EstadoResultados({ fechaDesde, fechaHasta, empresa }) {
  const [ingresos, setIngresos] = useState([]);
  const [gastos,   setGastos]   = useState([]);
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
      setIngresos(cuentas.filter(c => c.tipo === 'ingreso' && totales[c.id]).map(c => ({
        ...c, monto: (totales[c.id].haber || 0) - (totales[c.id].debe || 0),
      })));
      setGastos(cuentas.filter(c => c.tipo === 'gasto' && totales[c.id]).map(c => ({
        ...c, monto: (totales[c.id].debe || 0) - (totales[c.id].haber || 0),
      })));
    } catch (e) { console.error(e); }
    setCargando(false);
  }

  const totalIngresos = ingresos.reduce((s, f) => s + f.monto, 0);
  const totalGastos   = gastos.reduce((s, f) => s + f.monto, 0);
  const utilidad      = totalIngresos - totalGastos;
  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;

  const Seccion = ({ titulo, color, filas, total }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 'bold', color, fontSize: 13, borderBottom: `2px solid ${color}`, paddingBottom: 4, marginBottom: 8 }}>{titulo}</div>
      {filas.map(f => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
          <span style={{ color: '#555' }}>{f.codigo} — {f.nombre}</span>
          <span style={{ color }}>{$(f.monto)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid #eee', paddingTop: 6, marginTop: 4, fontSize: 13 }}>
        <span>TOTAL {titulo.toUpperCase()}</span>
        <span style={{ color }}>{$(total)}</span>
      </div>
    </div>
  );

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando...</div>;

  return (
    <div id="reporte-imprimible" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>ESTADO DE RESULTADOS</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Período: {fechaDesde} al {fechaHasta}</div>
      </div>
      <Seccion titulo="Ingresos" color="#27ae60" filas={ingresos} total={totalIngresos} />
      <Seccion titulo="Gastos"   color="#e74c3c" filas={gastos}   total={totalGastos} />
      <div style={{ background: utilidad >= 0 ? '#e8f5e9' : '#fde8e8', borderRadius: 8, padding: '12px 16px',
        display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 15, marginTop: 8 }}>
        <span>{utilidad >= 0 ? 'UTILIDAD DEL PERÍODO' : 'PÉRDIDA DEL PERÍODO'}</span>
        <span style={{ color: utilidad >= 0 ? '#27ae60' : '#e74c3c' }}>{$(Math.abs(utilidad))}</span>
      </div>
    </div>
  );
}
