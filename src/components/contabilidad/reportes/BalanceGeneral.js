import React, { useEffect, useState } from 'react';
import { getAsientosHasta, getDetallesPorAsientos, getCuentasContables, agruparPorCuenta, calcularSaldo } from './reporteQueries';

export default function BalanceGeneral({ fechaHasta, empresa }) {
  const [activos,    setActivos]    = useState([]);
  const [pasivos,    setPasivos]    = useState([]);
  const [patrimonio, setPatrimonio] = useState([]);
  const [cargando,   setCargando]   = useState(false);

  useEffect(() => {
    if (fechaHasta) cargar();
  }, [fechaHasta]);

  async function cargar() {
    setCargando(true);
    try {
      const [asientoIds, cuentas] = await Promise.all([
        getAsientosHasta(fechaHasta),
        getCuentasContables(),
      ]);
      const detalles = await getDetallesPorAsientos(asientoIds);
      const totales  = agruparPorCuenta(detalles);
      const mapear = tipo => cuentas
        .filter(c => c.tipo === tipo && totales[c.id])
        .map(c => ({ ...c, saldo: calcularSaldo(totales[c.id].debe, totales[c.id].haber, c.naturaleza) }))
        .filter(c => Math.abs(c.saldo) > 0.01);
      setActivos(mapear('activo'));
      setPasivos(mapear('pasivo'));
      setPatrimonio(mapear('patrimonio'));
    } catch (e) { console.error(e); }
    setCargando(false);
  }

  const totalActivos    = activos.reduce((s, f) => s + f.saldo, 0);
  const totalPasivos    = pasivos.reduce((s, f) => s + f.saldo, 0);
  const totalPatrimonio = patrimonio.reduce((s, f) => s + f.saldo, 0);
  const cuadra = Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 0.01;
  const $ = v => `$${parseFloat(v || 0).toFixed(2)}`;

  const Grupo = ({ titulo, color, filas, total }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 'bold', color, fontSize: 12, marginBottom: 6 }}>{titulo}</div>
      {filas.map(f => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', fontSize: 12 }}>
          <span style={{ color: '#555' }}>{f.codigo} — {f.nombre}</span>
          <span>{$(f.saldo)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderTop: '1px solid #eee', padding: '4px 8px', marginTop: 4, fontSize: 12 }}>
        <span>TOTAL</span><span style={{ color }}>{$(total)}</span>
      </div>
    </div>
  );

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Calculando...</div>;

  return (
    <div id="reporte-imprimible">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 'bold', fontSize: 16 }}>BALANCE GENERAL</div>
        <div style={{ fontSize: 13, color: '#555' }}>{empresa}</div>
        <div style={{ fontSize: 12, color: '#888' }}>Al {fechaHasta}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ fontWeight: 'bold', background: '#1a2a4a', color: 'white', padding: '6px 10px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>ACTIVOS</div>
          <Grupo titulo="Activo Corriente" color="#27ae60"
            filas={activos.filter(f => f.codigo.startsWith('1.1'))}
            total={activos.filter(f => f.codigo.startsWith('1.1')).reduce((s,f)=>s+f.saldo,0)} />
          <Grupo titulo="Activo No Corriente" color="#27ae60"
            filas={activos.filter(f => !f.codigo.startsWith('1.1'))}
            total={activos.filter(f => !f.codigo.startsWith('1.1')).reduce((s,f)=>s+f.saldo,0)} />
          <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', background:'#e8f5e9', padding:'8px 10px', borderRadius:6, fontSize:13 }}>
            <span>TOTAL ACTIVOS</span><span style={{ color:'#27ae60' }}>{$(totalActivos)}</span>
          </div>
        </div>
        <div>
          <div style={{ fontWeight:'bold', background:'#7b241c', color:'white', padding:'6px 10px', borderRadius:6, marginBottom:12, fontSize:13 }}>PASIVOS Y PATRIMONIO</div>
          <Grupo titulo="Pasivos"    color="#e74c3c" filas={pasivos}    total={totalPasivos} />
          <Grupo titulo="Patrimonio" color="#8e44ad" filas={patrimonio} total={totalPatrimonio} />
          <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', background: cuadra ? '#e8f5e9' : '#fde8e8', padding:'8px 10px', borderRadius:6, fontSize:13 }}>
            <span>TOTAL PAS. + PAT.</span>
            <span style={{ color: cuadra ? '#27ae60' : '#e74c3c' }}>{$(totalPasivos + totalPatrimonio)} {cuadra ? '✅' : '❌'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
