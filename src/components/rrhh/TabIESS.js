// ============================================
// TabIESS.js
// Resumen de aportes IESS por período
// Planilla mensual para declaración
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export default function TabIESS({ mobile }) {
  const now  = new Date();
  const [mes,      setMes]      = useState(now.getMonth());
  const [anio,     setAnio]     = useState(now.getFullYear());
  const [planilla, setPlanilla] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;
    const { data } = await supabase
      .from('nomina')
      .select('*, empleados(nombre, cedula, cargo)')
      .eq('periodo', periodoStr)
      .eq('estado', 'pagado');            // solo nómina pagada
    setPlanilla(data || []);
    setCargando(false);
  }, [mes, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  // Totales
  const totIessEmp = planilla.reduce((s, n) => s + (n.iess_empleado || 0), 0);
  const totIesPat  = planilla.reduce((s, n) => s + (n.iess_patronal || 0), 0);
  const totFondo   = planilla.reduce((s, n) => s + (n.fondo_reserva || 0), 0);
  const totDecXIII = planilla.reduce((s, n) => s + (n.decimo_tercero || 0), 0);
  const totDecXIV  = planilla.reduce((s, n) => s + (n.decimo_cuarto  || 0), 0);
  const totNeto    = planilla.reduce((s, n) => s + (n.sueldo_neto    || 0), 0);
  const totPatronal= planilla.reduce((s, n) => s + (n.costo_patronal || 0), 0);

  function exportarPlanilla() {
    const enc = [
      'Cédula','Nombre','Cargo',
      'Sueldo neto','IESS empleado','IESS patronal',
      'Fondo reserva','XIII mensual','XIV mensual','Costo total'
    ];
    const rows = planilla.map(n => [
      n.empleados?.cedula || '',
      n.empleados?.nombre || '',
      n.empleados?.cargo  || '',
      (n.sueldo_neto     || 0).toFixed(2),
      (n.iess_empleado   || 0).toFixed(2),
      (n.iess_patronal   || 0).toFixed(2),
      (n.fondo_reserva   || 0).toFixed(2),
      (n.decimo_tercero  || 0).toFixed(2),
      (n.decimo_cuarto   || 0).toFixed(2),
      (n.costo_patronal  || 0).toFixed(2),
    ]);
    // Fila totales
    rows.push(['','TOTALES','',
      totNeto.toFixed(2), totIessEmp.toFixed(2), totIesPat.toFixed(2),
      totFondo.toFixed(2), totDecXIII.toFixed(2), totDecXIV.toFixed(2),
      totPatronal.toFixed(2)
    ]);
    const csv = [enc, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `planilla_iess_${MESES[mes]}_${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Mes</div>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inputStyle}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Año</div>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px' }} />
        </div>
        {planilla.length > 0 && (
          <button onClick={exportarPlanilla} style={{
            background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px',
            padding: '9px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
          }}>📥 Exportar planilla IESS</button>
        )}
      </div>

      {/* Info períodos IESS Ecuador */}
      <div style={{ ...card, background: '#eaf4ff', border: '1px solid #bee3f8' }}>
        <div style={{ fontSize: '12px', color: '#1a3a5c', lineHeight: '1.7' }}>
          <b>🏛️ Fechas límite IESS Ecuador:</b>
          {' '}Planilla mensual: hasta el <b>día 15</b> del mes siguiente.
          {' '}Décimo tercero: <b>15 de diciembre</b> (o mensual).
          {' '}Décimo cuarto (Sierra): <b>15 de agosto</b>.
          {' '}Fondo de reserva: a partir del <b>segundo año</b> de trabajo.
        </div>
      </div>

      {/* Resumen totales */}
      {planilla.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)',
          gap: '8px', marginBottom: '12px'
        }}>
          {[
            { label: 'IESS empleados',  valor: totIessEmp,  color: '#e74c3c' },
            { label: 'IESS patronal',   valor: totIesPat,   color: '#8e44ad' },
            { label: 'Fondo reserva',   valor: totFondo,    color: '#2980b9' },
            { label: 'Total a declarar',valor: totIessEmp + totIesPat + totFondo, color: '#2c1a4a' },
          ].map(r => (
            <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
              <div style={{ fontSize: mobile ? '16px' : '20px', fontWeight: 'bold', color: r.color }}>
                ${r.valor.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla planilla */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando...</div>
      ) : planilla.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay nóminas <b>pagadas</b> para {MESES[mes]} {anio}.<br />
          <span style={{ fontSize: '12px' }}>Genera y paga la nómina en la pestaña Nómina primero.</span>
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '12px' }}>
            Planilla IESS — {MESES[mes]} {anio} ({planilla.length} empleados)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f0f2f5' }}>
                  {['Cédula','Nombre','Cargo','Neto','IESS emp.','IESS pat.','F.Reserva','XIII','XIV','Costo total'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#555', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planilla.map((n, i) => (
                  <tr key={n.id} style={{ borderBottom: '1px solid #f0f2f5', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '8px 10px', color: '#555' }}>{n.empleados?.cedula}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#2c1a4a' }}>{n.empleados?.nombre}</td>
                    <td style={{ padding: '8px 10px', color: '#777' }}>{n.empleados?.cargo}</td>
                    <td style={{ padding: '8px 10px', color: '#27ae60', fontWeight: 'bold' }}>${(n.sueldo_neto||0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', color: '#e74c3c' }}>${(n.iess_empleado||0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', color: '#8e44ad' }}>${(n.iess_patronal||0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', color: '#2980b9' }}>${(n.fondo_reserva||0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', color: '#555' }}>${(n.decimo_tercero||0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', color: '#555' }}>${(n.decimo_cuarto||0).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#f39c12' }}>${(n.costo_patronal||0).toFixed(2)}</td>
                  </tr>
                ))}
                {/* Fila totales */}
                <tr style={{ background: '#f0f2f5', fontWeight: 'bold' }}>
                  <td colSpan={3} style={{ padding: '8px 10px', color: '#2c1a4a' }}>TOTALES</td>
                  <td style={{ padding: '8px 10px', color: '#27ae60' }}>${totNeto.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', color: '#e74c3c' }}>${totIessEmp.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', color: '#8e44ad' }}>${totIesPat.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', color: '#2980b9' }}>${totFondo.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px' }}>${totDecXIII.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px' }}>${totDecXIV.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', color: '#f39c12' }}>${totPatronal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
