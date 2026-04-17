// ============================================
// TabNominaIESS.js
// Cruza nómina RRHH vs IESS declarado
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export default function TabNominaIESS({ mobile }) {
  const now   = new Date();
  const [mes,       setMes]       = useState(now.getMonth());
  const [anio,      setAnio]      = useState(now.getFullYear());
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);

  const analizar = useCallback(async () => {
    setCargando(true);
    setResultado(null);

    const periodoStr = `${anio}-${String(mes + 1).padStart(2, '0')}`;

    const { data: nomina } = await supabase
      .from('nomina')
      .select('*, empleados(nombre, cedula, afiliado_iess)')
      .eq('periodo', periodoStr);

    if (!nomina?.length) {
      setResultado({ vacio: true, periodo: `${MESES[mes]} ${anio}` });
      setCargando(false);
      return;
    }

    const filas = nomina.map(n => {
      const sueldoProp    = parseFloat(n.sueldo_prop)   || 0;
      const iessEmpCalc   = parseFloat((sueldoProp * 0.0945).toFixed(2));
      const iessPatCalc   = parseFloat((sueldoProp * 0.1215).toFixed(2));
      const iessEmpReg    = parseFloat(n.iess_empleado) || 0;
      const iessPatReg    = parseFloat(n.iess_patronal) || 0;
      const diffEmp       = Math.abs(iessEmpCalc - iessEmpReg);
      const diffPat       = Math.abs(iessPatCalc - iessPatReg);
      return {
        nombre:        n.empleados?.nombre  || '—',
        cedula:        n.empleados?.cedula  || '—',
        afiliado:      n.empleados?.afiliado_iess !== false,
        sueldoProp,
        iessEmpCalc,   iessEmpReg,   diffEmp,
        iessPatCalc,   iessPatReg,   diffPat,
        costoPatronal: parseFloat(n.costo_patronal) || 0,
        estado:        n.estado,
      };
    });

    const totales = filas.reduce((acc, f) => ({
      sueldos:    acc.sueldos    + f.sueldoProp,
      iessEmpReg: acc.iessEmpReg + f.iessEmpReg,
      iessPatReg: acc.iessPatReg + f.iessPatReg,
      costoTotal: acc.costoTotal + f.costoPatronal,
    }), { sueldos: 0, iessEmpReg: 0, iessPatReg: 0, costoTotal: 0 });

    const hayDesfase = filas.some(f => f.diffEmp > 0.05 || f.diffPat > 0.05);

    setResultado({ filas, totales, hayDesfase, periodo: `${MESES[mes]} ${anio}` });
    setCargando(false);
  }, [mes, anio]);

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    padding: mobile ? '12px' : '16px', marginBottom: '12px'
  };
  const inputStyle = {
    padding: '7px 10px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: 3, fontWeight: 600 }}>Mes</div>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inputStyle}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: 3, fontWeight: 600 }}>Año</div>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px' }} />
        </div>
        <button onClick={analizar} disabled={cargando} style={{
          background: cargando ? '#aaa' : 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 18px', cursor: cargando ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {cargando ? '⏳ Analizando...' : '🔍 Analizar'}
        </button>
      </div>

      {resultado?.vacio && (
        <div style={{ ...card, textAlign: 'center', color: '#888', padding: '30px' }}>
          No hay nómina generada para {resultado.periodo}. Genérala primero en RRHH → Nómina.
        </div>
      )}

      {resultado && !resultado.vacio && (
        <>
          {resultado.hayDesfase ? (
            <div style={{
              background: '#fde8e8', border: '1px solid #e74c3c',
              borderRadius: '10px', padding: '10px 14px',
              marginBottom: '12px', fontSize: '13px', color: '#c0392b', fontWeight: 'bold'
            }}>
              ⚠️ Diferencias entre IESS calculado y registrado. Revisar detalle.
            </div>
          ) : (
            <div style={{
              background: '#d4edda', border: '1px solid #27ae60',
              borderRadius: '10px', padding: '10px 14px',
              marginBottom: '12px', fontSize: '13px', color: '#155724', fontWeight: 'bold'
            }}>
              ✅ IESS calculado coincide con nómina — {resultado.periodo}
            </div>
          )}

          {/* Totales */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)',
            gap: '8px', marginBottom: '12px'
          }}>
            {[
              { label: 'Total sueldos',  valor: resultado.totales.sueldos,    color: '#2980b9' },
              { label: 'IESS empleados', valor: resultado.totales.iessEmpReg, color: '#e74c3c' },
              { label: 'IESS patronal',  valor: resultado.totales.iessPatReg, color: '#8e44ad' },
            ].map(r => (
              <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: mobile ? '15px' : '18px', fontWeight: 'bold', color: r.color }}>
                  ${r.valor.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Detalle por empleado */}
          <div style={card}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a', marginBottom: '10px' }}>
              👥 Detalle por empleado — {resultado.periodo}
            </div>
            {resultado.filas.map((f, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: '8px',
                background: (f.diffEmp > 0.05 || f.diffPat > 0.05) ? '#fff8f0' : (i % 2 === 0 ? '#f8f9fa' : 'white'),
                border: (f.diffEmp > 0.05 || f.diffPat > 0.05) ? '1px solid #f39c12' : 'none',
                marginBottom: '6px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a2a3a' }}>{f.nombre}</span>
                    <span style={{ fontSize: '11px', color: '#888', marginLeft: 8 }}>CI: {f.cedula}</span>
                    {!f.afiliado && (
                      <span style={{
                        marginLeft: 8, background: '#fde8e8', color: '#c0392b',
                        borderRadius: '10px', padding: '1px 6px', fontSize: '10px'
                      }}>No afiliado</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555' }}>
                    Sueldo: <b>${f.sueldoProp.toFixed(2)}</b>
                  </div>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                  gap: '4px 12px', marginTop: 6, fontSize: '11px', color: '#666'
                }}>
                  <span>IESS emp. calc: <b>${f.iessEmpCalc.toFixed(2)}</b></span>
                  <span>IESS emp. reg: <b style={{ color: f.diffEmp > 0.05 ? '#e74c3c' : '#27ae60' }}>${f.iessEmpReg.toFixed(2)}</b></span>
                  <span>IESS pat. calc: <b>${f.iessPatCalc.toFixed(2)}</b></span>
                  <span>IESS pat. reg: <b style={{ color: f.diffPat > 0.05 ? '#e74c3c' : '#27ae60' }}>${f.iessPatReg.toFixed(2)}</b></span>
                </div>
                {(f.diffEmp > 0.05 || f.diffPat > 0.05) && (
                  <div style={{ fontSize: '11px', color: '#b7770d', marginTop: 4 }}>
                    ⚠️ Diferencia: emp ${f.diffEmp.toFixed(2)} · pat ${f.diffPat.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
