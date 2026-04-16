// ============================================
// TabGraficas.js
// Gráficas de producción, compras y ventas — últimos 6 meses
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function obtenerUltimos6Meses() {
  const meses = [];
  const hoy   = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({
      anio:  d.getFullYear(),
      mes:   d.getMonth() + 1,
      label: MESES_CORTO[d.getMonth()]
    });
  }
  return meses;
}

function BarChart({ titulo, data, color, unidad, mobile }) {
  const maxVal = Math.max(...data.map(d => d.valor), 1);
  return (
    <div style={{
      background: 'white', borderRadius: '14px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
      padding: mobile ? '14px' : '20px',
      marginBottom: '14px'
    }}>
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a3a2a', marginBottom: '16px' }}>
        {titulo}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: mobile ? '6px' : '10px', height: '120px' }}>
        {data.map((d, i) => {
          const pct = maxVal > 0 ? (d.valor / maxVal) * 100 : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
              <div style={{
                fontSize: '9px', color: '#888', marginBottom: '4px',
                textAlign: 'center', wordBreak: 'break-all'
              }}>
                {d.valor > 0 ? (unidad === '$' ? `$${d.valor.toFixed(0)}` : `${d.valor.toFixed(0)}`) : ''}
              </div>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{
                  width: '100%', height: `${Math.max(pct, d.valor > 0 ? 4 : 0)}%`,
                  background: color, borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                  minHeight: d.valor > 0 ? '4px' : '0'
                }} />
              </div>
              <div style={{ fontSize: '10px', color: '#555', marginTop: '6px', fontWeight: '600' }}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparativaChart({ titulo, series, meses, mobile }) {
  const allVals = series.flatMap(s => s.data.map(d => d.valor));
  const maxVal  = Math.max(...allVals, 1);

  return (
    <div style={{
      background: 'white', borderRadius: '14px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
      padding: mobile ? '14px' : '20px',
      marginBottom: '14px'
    }}>
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a3a2a', marginBottom: '10px' }}>
        {titulo}
      </div>
      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {series.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: s.color }} />
            <span style={{ color: '#555' }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: mobile ? '4px' : '8px', height: '120px' }}>
        {meses.map((mes, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
              {series.map(s => {
                const val = s.data[i]?.valor || 0;
                const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                return (
                  <div key={s.label} style={{
                    flex: 1, height: `${Math.max(pct, val > 0 ? 3 : 0)}%`,
                    background: s.color, borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s ease',
                    minHeight: val > 0 ? '3px' : '0'
                  }} />
                );
              })}
            </div>
            <div style={{ fontSize: '10px', color: '#555', marginTop: '6px', fontWeight: '600' }}>
              {mes.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TabGraficas({ mobile }) {
  const [datos,    setDatos]    = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const periodos = obtenerUltimos6Meses();

    // Rangos para consulta
    const inicio = `${periodos[0].anio}-${String(periodos[0].mes).padStart(2,'0')}-01`;
    const fin    = new Date(periodos[5].anio, periodos[5].mes, 0);
    const finStr = `${periodos[5].anio}-${String(periodos[5].mes).padStart(2,'0')}-${String(fin.getDate()).padStart(2,'0')}`;

    const [rProd, rCompras, rVentas] = await Promise.all([
      supabase.from('produccion_diaria')
        .select('fecha, kg_producidos')
        .eq('revertida', false)
        .gte('fecha', inicio).lte('fecha', finStr),
      supabase.from('compras')
        .select('fecha, total')
        .gte('fecha', inicio).lte('fecha', finStr),
      supabase.from('facturas')
        .select('fecha, total')
        .gte('fecha', inicio).lte('fecha', finStr)
        .neq('estado_cobro', 'anulado')
    ]);

    function agrupar(rows, campoFecha, campoValor) {
      return periodos.map(p => {
        const suma = (rows || [])
          .filter(r => {
            const f = new Date(r[campoFecha]);
            return f.getFullYear() === p.anio && f.getMonth() + 1 === p.mes;
          })
          .reduce((s, r) => s + (r[campoValor] || 0), 0);
        return { label: p.label, valor: suma };
      });
    }

    const produccion = agrupar(rProd.data,     'fecha', 'kg_producidos');
    const compras    = agrupar(rCompras.data,   'fecha', 'total');
    const ventas     = agrupar(rVentas.data,    'fecha', 'total');

    setDatos({ produccion, compras, ventas, periodos });
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
      Cargando gráficas...
    </div>
  );

  const { produccion, compras, ventas, periodos } = datos;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#1a3a2a', fontSize: '16px' }}>Últimos 6 meses</h3>
        <button onClick={cargar} style={{
          background: '#f0f2f5', border: 'none', borderRadius: '8px',
          padding: '7px 14px', cursor: 'pointer', fontSize: '12px', color: '#555'
        }}>🔄 Actualizar</button>
      </div>

      {/* Producción */}
      <BarChart
        titulo="🏭 Producción (kg)"
        data={produccion}
        color="#f39c12"
        unidad="kg"
        mobile={mobile}
      />

      {/* Ventas vs Compras comparativa */}
      <ComparativaChart
        titulo="💰 Ventas vs Compras ($)"
        meses={periodos}
        series={[
          { label: 'Ventas',  color: '#27ae60', data: ventas  },
          { label: 'Compras', color: '#e74c3c', data: compras },
        ]}
        mobile={mobile}
      />

      {/* Ventas */}
      <BarChart
        titulo="💰 Ventas del mes ($)"
        data={ventas}
        color="#27ae60"
        unidad="$"
        mobile={mobile}
      />

      {/* Compras */}
      <BarChart
        titulo="🛒 Compras del mes ($)"
        data={compras}
        color="#2980b9"
        unidad="$"
        mobile={mobile}
      />
    </div>
  );
}
