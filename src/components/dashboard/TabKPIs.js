// ============================================
// TabKPIs.js
// Indicadores clave del negocio — mes actual
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

function KPICard({ emoji, label, valor, color, sub, mobile }) {
  return (
    <div style={{
      background: 'white', borderRadius: '14px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
      padding: mobile ? '14px' : '20px',
      borderTop: `4px solid ${color}`,
      display: 'flex', flexDirection: 'column', gap: '6px'
    }}>
      <div style={{ fontSize: '24px' }}>{emoji}</div>
      <div style={{ fontSize: '11px', color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ fontSize: mobile ? '22px' : '28px', fontWeight: 'bold', color }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: '11px', color: '#aaa' }}>{sub}</div>}
    </div>
  );
}

export default function TabKPIs({ mobile }) {
  const [datos,    setDatos]    = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const ahora   = new Date();
    const mes     = ahora.getMonth() + 1;
    const anio    = ahora.getFullYear();
    const primerDia = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const ultimoDia = new Date(anio, mes, 0);
    const ultimoDiaStr = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia.getDate()).padStart(2,'0')}`;

    const [
      rFacturas, rCxC, rProduccion,
      rCompras, rCxP, rNomina, rEmpleados
    ] = await Promise.all([
      // Ventas del mes
      supabase.from('facturas')
        .select('total')
        .gte('fecha', primerDia).lte('fecha', ultimoDiaStr)
        .neq('estado_cobro', 'anulado'),
      // Cuentas x cobrar pendientes
      supabase.from('facturas')
        .select('total')
        .eq('estado_cobro', 'pendiente'),
      // Producción kg mes (excluye revertidas)
      supabase.from('produccion_diaria')
        .select('kg_producidos')
        .eq('revertida', false)
        .gte('fecha', primerDia).lte('fecha', ultimoDiaStr),
      // Compras del mes
      supabase.from('compras')
        .select('total')
        .gte('fecha', primerDia).lte('fecha', ultimoDiaStr),
      // Cuentas x pagar saldo pendiente
      supabase.from('cuentas_pagar')
        .select('saldo_pendiente')
        .neq('estado', 'pagado'),
      // Nómina del mes
      supabase.from('nominas')
        .select('neto')
        .eq('mes', mes).eq('anio', anio),
      // Empleados activos
      supabase.from('empleados')
        .select('id', { count: 'exact' })
        .eq('activo', true)
    ]);

    const ventas    = (rFacturas.data   || []).reduce((s, r) => s + (r.total            || 0), 0);
    const cxc       = (rCxC.data        || []).reduce((s, r) => s + (r.total            || 0), 0);
    const kgProd    = (rProduccion.data || []).reduce((s, r) => s + (r.kg_producidos    || 0), 0);
    const compras   = (rCompras.data    || []).reduce((s, r) => s + (r.total            || 0), 0);
    const cxp       = (rCxP.data        || []).reduce((s, r) => s + (r.saldo_pendiente  || 0), 0);
    const nomina    = (rNomina.data     || []).reduce((s, r) => s + (r.neto             || 0), 0);
    const empleados = rEmpleados.count  || 0;
    const margen    = ventas - compras - nomina;

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    setDatos({ ventas, cxc, kgProd, compras, cxp, nomina, empleados, margen, mesTxt: meses[mes-1], anio });
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
      Cargando indicadores...
    </div>
  );

  const { ventas, cxc, kgProd, compras, cxp, nomina, empleados, margen, mesTxt, anio } = datos;

  const kpis = [
    {
      emoji: '💰', label: `Ventas ${mesTxt}`,
      valor: `$${ventas.toFixed(2)}`,
      color: '#27ae60',
      sub: `x cobrar: $${cxc.toFixed(2)}`
    },
    {
      emoji: '🏭', label: `Producción ${mesTxt}`,
      valor: `${kgProd.toFixed(1)} kg`,
      color: '#f39c12',
      sub: 'kilogramos producidos'
    },
    {
      emoji: '🛒', label: `Compras ${mesTxt}`,
      valor: `$${compras.toFixed(2)}`,
      color: '#2980b9',
      sub: `x pagar total: $${cxp.toFixed(2)}`
    },
    {
      emoji: '💳', label: 'Cuentas por pagar',
      valor: `$${cxp.toFixed(2)}`,
      color: cxp > 0 ? '#e74c3c' : '#27ae60',
      sub: 'saldo total pendiente'
    },
    {
      emoji: '👥', label: 'Empleados activos',
      valor: `${empleados}`,
      color: '#8e44ad',
      sub: `nómina ${mesTxt}: $${nomina.toFixed(2)}`
    },
    {
      emoji: '📊', label: `Margen estimado ${mesTxt}`,
      valor: `$${margen.toFixed(2)}`,
      color: margen >= 0 ? '#27ae60' : '#e74c3c',
      sub: 'ventas − compras − nómina'
    },
  ];

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, color: '#1a3a2a', fontSize: '16px' }}>
          Indicadores — {mesTxt} {anio}
        </h3>
        <button onClick={cargar} style={{
          background: '#f0f2f5', border: 'none', borderRadius: '8px',
          padding: '7px 14px', cursor: 'pointer', fontSize: '12px', color: '#555'
        }}>🔄 Actualizar</button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)',
        gap: '12px'
      }}>
        {kpis.map(k => (
          <KPICard key={k.label} {...k} mobile={mobile} />
        ))}
      </div>

      {/* Resumen del margen */}
      <div style={{
        marginTop: '16px', background: 'white', borderRadius: '14px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.07)', padding: '16px'
      }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a3a2a', marginBottom: '10px' }}>
          📋 Resumen financiero {mesTxt} {anio}
        </div>
        {[
          { label: '+ Ventas',   valor: ventas,   color: '#27ae60' },
          { label: '− Compras',  valor: compras,  color: '#e74c3c' },
          { label: '− Nómina',   valor: nomina,   color: '#8e44ad' },
          { label: '= Margen',   valor: margen,   color: margen >= 0 ? '#27ae60' : '#e74c3c', bold: true },
        ].map(r => (
          <div key={r.label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '6px 0',
            borderTop: r.bold ? '2px solid #eee' : '1px solid #f5f5f5',
            fontSize: r.bold ? '14px' : '13px',
            fontWeight: r.bold ? 'bold' : 'normal'
          }}>
            <span style={{ color: '#555' }}>{r.label}</span>
            <span style={{ color: r.color }}>${Math.abs(r.valor).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
