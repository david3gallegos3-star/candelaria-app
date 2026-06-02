// src/components/contabilidad/talonario/ResumenTalonario.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabase';
import { useTalonario } from './TalonarioContext';

function suma(arr, campo) {
  return arr.reduce((s, r) => s + parseFloat(r[campo] || 0), 0);
}

export default function ResumenTalonario() {
  const { mes, año, fechaDesde, fechaHasta, MESES, esAdminContador } = useTalonario();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [saldoBanco, setSaldoBanco] = useState('');
  const [editandoSaldo, setEditandoSaldo] = useState(false);

  useEffect(() => { cargar(); }, [mes, año]);

  async function cargar() {
    setCargando(true);
    const [
      { data: facturas },
      { data: cobros },
      { data: gastos },
      { data: compras },
      { data: nomina },
      { data: pagosB },
      { data: pagosP },
      { data: otrosI },
      { data: cxc },
      { data: config },
    ] = await Promise.all([
      supabase.from('facturas').select('total').gte('fecha_emision', fechaDesde).lte('fecha_emision', fechaHasta).neq('estado', 'anulada'),
      supabase.from('cobros').select('monto,forma_pago').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('caja_gastos').select('monto').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('compras').select('total,tiene_factura').gte('fecha', fechaDesde).lte('fecha', fechaHasta),
      supabase.from('nomina').select('sueldo_prop,iess_patronal').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_banco').select('monto').eq('mes', mes).eq('año', año),
      supabase.from('talonario_pagos_personales').select('monto,categoria').eq('mes', mes).eq('año', año),
      supabase.from('talonario_otros_ingresos').select('monto').eq('mes', mes).eq('año', año),
      supabase.from('cuentas_cobrar').select('monto_total,monto_cobrado').eq('estado', 'pendiente'),
      supabase.from('config_contabilidad').select('valor').eq('clave', `saldo_banco_${año}_${mes}`).single(),
    ]);

    const totalVentas    = suma(facturas || [], 'total');
    const totalOtrosI    = suma(otrosI   || [], 'monto');
    const totalGastos    = suma(gastos   || [], 'monto');
    const comprasCon     = (compras || []).filter(c =>  c.tiene_factura).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const comprasSin     = (compras || []).filter(c => !c.tiene_factura).reduce((s,c) => s + parseFloat(c.total||0), 0);
    const totalSueldos   = suma(nomina   || [], 'sueldo_prop');
    const totalIess      = suma(nomina   || [], 'iess_patronal');
    const totalPagosB    = suma(pagosB   || [], 'monto');
    const totalPagosP    = suma(pagosP   || [], 'monto');
    const pagosPrestTarj = (pagosP || []).filter(p => ['prestamos','tarjetas'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);
    const pagosGastPers  = (pagosP || []).filter(p => ['gastos_personal','otros'].includes(p.categoria)).reduce((s,p) => s + parseFloat(p.monto||0), 0);

    const cobroEfect = (cobros||[]).filter(c => c.forma_pago==='efectivo').reduce((s,c) => s+parseFloat(c.monto||0), 0);
    const cobroCheq  = (cobros||[]).filter(c => c.forma_pago==='cheque').reduce((s,c) => s+parseFloat(c.monto||0), 0);
    const cobroTransf= (cobros||[]).filter(c => ['transferencia','deposito'].includes(c.forma_pago)).reduce((s,c) => s+parseFloat(c.monto||0), 0);

    const cxcPendiente = (cxc||[]).reduce((s,c) => s + parseFloat(c.monto_total||0) - parseFloat(c.monto_cobrado||0), 0);

    setSaldoBanco(config?.valor?.saldo || '');
    setDatos({ totalVentas, totalOtrosI, totalGastos, comprasCon, comprasSin,
      totalSueldos, totalIess, totalPagosB, totalPagosP,
      cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers, cxcPendiente });
    setCargando(false);
  }

  async function guardarSaldo(val) {
    await supabase.from('config_contabilidad')
      .upsert({ clave: `saldo_banco_${año}_${mes}`, valor: { saldo: val } }, { onConflict: 'clave' });
    setEditandoSaldo(false);
  }

  if (cargando || !datos) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando resumen...</div>;

  const {
    totalVentas, totalOtrosI, totalGastos, comprasCon, comprasSin,
    totalSueldos, totalIess, totalPagosB, totalPagosP,
    cobroEfect, cobroCheq, cobroTransf, pagosPrestTarj, pagosGastPers,
    cxcPendiente,
  } = datos;

  const totalIngMes  = totalVentas + totalOtrosI;
  const totalEgrMes  = totalGastos + comprasCon + comprasSin + totalSueldos + totalIess + totalPagosB + totalPagosP;
  const utilidadBruta= totalIngMes - totalEgrMes;

  const totalIngCons = cobroEfect + cobroCheq + cobroTransf + totalOtrosI;
  const totalEgrCons = totalGastos + totalPagosB + pagosPrestTarj + pagosGastPers;

  const $ = v => `$${parseFloat(v||0).toFixed(2)}`;
  const fila = (label, valor, color) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12 }}>
      <span>{label}</span>
      <span style={{ color: color || '#333', fontWeight: color ? 'bold' : 'normal' }}>{$(valor)}</span>
    </div>
  );
  const totalRow = (label, valor, bg) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0',
      borderTop:'1px solid #eee', marginTop:4, fontWeight:'bold', fontSize:12 }}>
      <span>{label}</span>
      <span style={{ background: bg, color: 'white', padding:'1px 8px', borderRadius:4 }}>{$(valor)}</span>
    </div>
  );
  const titulo = (label, color) => (
    <div style={{ fontWeight:'bold', color, margin:'10px 0 4px', fontSize:12 }}>{label}</div>
  );

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

      {/* Columna MES */}
      <div style={{ border:'2px solid #1a2a4a', borderRadius:10, overflow:'hidden' }}>
        <div style={{ background:'#1a2a4a', color:'white', padding:'10px 14px', textAlign:'center', fontWeight:'bold', fontSize:13 }}>
          {MESES[mes-1].toUpperCase()} {año}<br/>
          <span style={{ fontSize:10, opacity:0.8 }}>Embutidos y Jamones Candelaria</span>
        </div>
        <div style={{ padding:14 }}>
          {titulo('INGRESOS', '#27ae60')}
          {fila('(+) Total ventas del mes', totalVentas, '#27ae60')}
          {fila('(+) Otros ingresos', totalOtrosI, '#27ae60')}
          {totalRow('TOTAL INGRESOS', totalIngMes, '#27ae60')}

          {titulo('EGRESOS', '#e74c3c')}
          {fila('(-) Gastos efectivo', totalGastos, '#e74c3c')}
          {fila('(-) Proveedores con factura', comprasCon, '#e74c3c')}
          {fila('(-) Proveedores sin factura', comprasSin, '#e74c3c')}
          {fila('(-) Sueldos', totalSueldos, '#e74c3c')}
          {fila('(-) IESS patronal', totalIess, '#e74c3c')}
          {fila('(-) Pagos del mes', totalPagosB, '#e74c3c')}
          {fila('(-) Pagos personales', totalPagosP, '#e74c3c')}
          {totalRow('TOTAL EGRESOS', totalEgrMes, '#e74c3c')}

          <div style={{ marginTop:12, background:'#ffd700', padding:'8px 10px',
            borderRadius:6, display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize:13 }}>
            <span>UTILIDAD BRUTA</span>
            <span style={{ color: utilidadBruta >= 0 ? '#155724' : '#721c24' }}>{$(utilidadBruta)}</span>
          </div>
        </div>
      </div>

      {/* Columna CONSOLIDADO */}
      <div style={{ border:'2px solid #2980b9', borderRadius:10, overflow:'hidden' }}>
        <div style={{ background:'#2980b9', color:'white', padding:'10px 14px', textAlign:'center', fontWeight:'bold', fontSize:13 }}>
          CONSOLIDADO<br/>
          <span style={{ fontSize:10, opacity:0.8 }}>Embutidos y Jamones Candelaria</span>
        </div>
        <div style={{ padding:14 }}>
          {titulo('INGRESOS (cobros reales)', '#27ae60')}
          {fila('(+) Cobros efectivo', cobroEfect, '#27ae60')}
          {fila('(+) Cobros cheque', cobroCheq, '#27ae60')}
          {fila('(+) Cobros transf./depósito', cobroTransf, '#27ae60')}
          {fila('(+) Otros ingresos', totalOtrosI, '#27ae60')}
          {totalRow('TOTAL', totalIngCons, '#27ae60')}

          {titulo('EGRESOS (pagos reales)', '#e74c3c')}
          {fila('(-) Gastos efectivo', totalGastos, '#e74c3c')}
          {fila('(-) Pagos con banco', totalPagosB, '#e74c3c')}
          {fila('(-) Tarjetas/préstamos', pagosPrestTarj, '#e74c3c')}
          {fila('(-) Gastos personales', pagosGastPers, '#e74c3c')}
          {totalRow('TOTAL', totalEgrCons, '#e74c3c')}

          {titulo('ACTIVOS', '#555')}
          {fila('(+) Cuentas por cobrar', cxcPendiente, '#27ae60')}

          <div style={{ marginTop:10, background:'#1a2a4a', color:'white', padding:'7px 10px',
            borderRadius:6, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
            <span>💳 Saldo cuenta corriente</span>
            {editandoSaldo ? (
              <div style={{ display:'flex', gap:6 }}>
                <input type="number" value={saldoBanco} onChange={e => setSaldoBanco(e.target.value)}
                  style={{ width:100, padding:'3px 6px', borderRadius:4, border:'none', fontSize:12 }} />
                <button onClick={() => guardarSaldo(saldoBanco)}
                  style={{ background:'#27ae60', color:'white', border:'none', borderRadius:4,
                    padding:'3px 8px', cursor:'pointer', fontSize:11 }}>✓</button>
              </div>
            ) : (
              <span onClick={() => esAdminContador && setEditandoSaldo(true)}
                style={{ fontWeight:'bold', cursor: esAdminContador ? 'pointer' : 'default' }}>
                {saldoBanco ? `$${parseFloat(saldoBanco).toFixed(2)}` : (esAdminContador ? '✏️ Ingresar' : '—')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
