// ============================================
// TabReportesRRHH.js
// Historial de nóminas, costos acumulados
// y proyección anual de planilla
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES = [
  'Ene','Feb','Mar','Abr','May','Jun',
  'Jul','Ago','Sep','Oct','Nov','Dic'
];

export default function TabReportesRRHH({ mobile }) {
  const [anio,     setAnio]     = useState(new Date().getFullYear());
  const [resumen,  setResumen]  = useState([]);   // por mes
  const [cargando, setCargando] = useState(false);
  const [empleados,setEmpleados]= useState([]);
  const [verDetalle,setVerDetalle] = useState(null); // mes seleccionado

  const cargar = useCallback(async () => {
    setCargando(true);

    // Nóminas del año
    const { data: nominas } = await supabase
      .from('nomina')
      .select('*, empleados(nombre)')
      .gte('periodo', `${anio}-01`)
      .lte('periodo', `${anio}-12`)
      .order('periodo');

    // Empleados activos
    const { data: emps } = await supabase
      .from('empleados').select('id, nombre, sueldo_base, cargo')
      .eq('activo', true).is('deleted_at', null);

    // Agrupar por mes
    const porMes = {};
    for (let i = 0; i < 12; i++) {
      const key = `${anio}-${String(i + 1).padStart(2,'0')}`;
      porMes[key] = { mes: i, periodo: key, sueldos: 0, neto: 0, patronal: 0, iessTotal: 0, count: 0, filas: [] };
    }
    (nominas || []).forEach(n => {
      if (porMes[n.periodo]) {
        porMes[n.periodo].sueldos   += n.sueldo_prop    || 0;
        porMes[n.periodo].neto      += n.sueldo_neto    || 0;
        porMes[n.periodo].patronal  += n.costo_patronal || 0;
        porMes[n.periodo].iessTotal += (n.iess_empleado || 0) + (n.iess_patronal || 0) + (n.fondo_reserva || 0);
        porMes[n.periodo].count     += 1;
        porMes[n.periodo].filas.push(n);
      }
    });

    setResumen(Object.values(porMes));
    setEmpleados(emps || []);
    setCargando(false);
  }, [anio]);

  useEffect(() => { cargar(); }, [cargar]);

  // Totales anuales
  const totAnual = resumen.reduce((acc, m) => ({
    sueldos:  acc.sueldos  + m.sueldos,
    neto:     acc.neto     + m.neto,
    patronal: acc.patronal + m.patronal,
    iess:     acc.iess     + m.iessTotal,
  }), { sueldos: 0, neto: 0, patronal: 0, iess: 0 });

  // Proyección anual (planilla actual × 12 + beneficios)
  const planillaMensual   = empleados.reduce((s, e) => s + (e.sueldo_base || 0), 0);
  const proyeccionAnual   = planillaMensual * 12;
  const proyeccionCompleta = proyeccionAnual * 1.2815; // ~28.15% beneficios aprox.

  // Max para barras
  const maxPatronal = Math.max(...resumen.map(m => m.patronal), 1);

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
      {/* Selector año */}
      <div style={{ ...card, display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Año</div>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ ...inputStyle, width: '90px' }} />
        </div>
        <div style={{ fontSize: '13px', color: '#555' }}>
          Empleados activos: <b style={{ color: '#2c1a4a' }}>{empleados.length}</b>
          {' · '}Planilla mensual: <b style={{ color: '#27ae60' }}>${planillaMensual.toFixed(2)}</b>
        </div>
      </div>

      {/* Proyección */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)',
        gap: '8px', marginBottom: '12px'
      }}>
        {[
          { label: 'Costo real año',    valor: totAnual.patronal,     color: '#f39c12' },
          { label: 'Neto pagado año',   valor: totAnual.neto,         color: '#27ae60' },
          { label: 'IESS total año',    valor: totAnual.iess,         color: '#8e44ad' },
          { label: 'Proyección anual',  valor: proyeccionCompleta,    color: '#2c1a4a' },
        ].map(r => (
          <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
            <div style={{ fontSize: mobile ? '15px' : '18px', fontWeight: 'bold', color: r.color }}>
              ${r.valor.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico de barras mensual */}
      {!cargando && (
        <div style={card}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '12px' }}>
            📊 Costo empresa por mes — {anio}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: mobile ? '4px' : '8px', height: '100px' }}>
            {resumen.map(m => {
              const h = maxPatronal > 0 ? (m.patronal / maxPatronal) * 90 : 0;
              return (
                <div key={m.mes}
                  onClick={() => setVerDetalle(verDetalle === m.mes ? null : m.mes)}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{
                    width: '100%', height: `${h}px`, minHeight: m.patronal > 0 ? 4 : 0,
                    background: verDetalle === m.mes ? '#4a2c7a' : '#c8b3f0',
                    borderRadius: '4px 4px 0 0',
                    transition: 'background 0.2s'
                  }} />
                  <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
                    {MESES[m.mes]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detalle mes */}
      {verDetalle !== null && resumen[verDetalle]?.filas?.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '10px' }}>
            📋 {MESES[verDetalle]} {anio} — {resumen[verDetalle].count} empleados
          </div>
          {resumen[verDetalle].filas.map(n => (
            <div key={n.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid #f0f2f5', fontSize: '13px'
            }}>
              <div>
                <b>{n.empleados?.nombre}</b>
                <span style={{ color: '#888', fontSize: '11px', marginLeft: '8px' }}>
                  {n.dias_trabajados}d
                </span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                <span style={{ color: '#27ae60' }}>Neto: ${(n.sueldo_neto||0).toFixed(2)}</span>
                <span style={{ color: '#f39c12', fontWeight: 'bold' }}>Total: ${(n.costo_patronal||0).toFixed(2)}</span>
                <span style={{
                  background: n.estado === 'pagado' ? '#27ae60' : '#f39c12',
                  color: 'white', borderRadius: '10px', padding: '1px 8px', fontSize: '10px'
                }}>
                  {n.estado === 'pagado' ? '✅' : '⏳'}
                </span>
              </div>
            </div>
          ))}
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '16px', fontSize: '13px', fontWeight: 'bold' }}>
            <span style={{ color: '#27ae60' }}>Neto total: ${resumen[verDetalle].neto.toFixed(2)}</span>
            <span style={{ color: '#f39c12' }}>Costo empresa: ${resumen[verDetalle].patronal.toFixed(2)}</span>
          </div>
        </div>
      )}

      {verDetalle !== null && resumen[verDetalle]?.count === 0 && (
        <div style={{ ...card, textAlign: 'center', color: '#888', padding: '20px' }}>
          Sin nómina registrada para {MESES[verDetalle]} {anio}.
        </div>
      )}

      {cargando && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando reportes...</div>
      )}
    </div>
  );
}
