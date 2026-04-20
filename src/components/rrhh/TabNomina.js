// ============================================
// TabNomina.js — Empresa artesanal
// Sin décimos, fondo de reserva ni vacaciones
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import * as XLSX from 'xlsx';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

function calcularRol(emp, dias, ext) {
  const sueldo     = parseFloat(emp.sueldo_base || 0);
  const sueldoProp = parseFloat((sueldo * (dias / 30)).toFixed(2));

  const pEmp    = (emp.porcentaje_iess_empleado || 9.45) / 100;
  const pPat    = (emp.porcentaje_iess_patronal || 12.15) / 100;
  const iessEmp = emp.afiliado_iess ? parseFloat((sueldoProp * pEmp).toFixed(2)) : 0;
  const iessPat = emp.afiliado_iess ? parseFloat((sueldoProp * pPat).toFixed(2)) : 0;

  const bonificacion    = parseFloat(ext.bonificacion    || 0);
  const horasExtra      = parseFloat(ext.horasExtra      || 0);
  const valorHoraExtra  = parseFloat(ext.valorHoraExtra  || 0);
  const totalExtras     = parseFloat((horasExtra * valorHoraExtra).toFixed(2));
  const horasAtraso     = parseFloat(ext.horasAtraso     || 0);
  const valorHoraAtraso = parseFloat(ext.valorHoraAtraso || 0);
  const totalAtrasos    = parseFloat((horasAtraso * valorHoraAtraso).toFixed(2));
  const anticipo        = parseFloat(ext.anticipo        || 0);
  const comprasEmpresa  = parseFloat(ext.comprasEmpresa  || 0);

  const totalDescuentos = parseFloat((iessEmp + totalAtrasos + anticipo + comprasEmpresa).toFixed(2));
  const sueldoNeto      = parseFloat((sueldoProp + bonificacion + totalExtras - totalDescuentos).toFixed(2));
  const costoPatronal   = parseFloat((sueldoProp + bonificacion + totalExtras + iessPat).toFixed(2));

  return {
    sueldoProp, iessEmp, iessPat,
    bonificacion, horasExtra, valorHoraExtra, totalExtras,
    horasAtraso, valorHoraAtraso, totalAtrasos,
    anticipo, comprasEmpresa,
    totalDescuentos, sueldoNeto, costoPatronal
  };
}

function RolFila({ label, valor, color = '#333', bold = false }) {
  const v = parseFloat(valor || 0);
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 0', fontSize: bold ? '14px' : '13px',
      fontWeight: bold ? 'bold' : 'normal', color
    }}>
      <span>{label}</span>
      <span>{v < 0 ? '-' : ''}${Math.abs(v).toFixed(2)}</span>
    </div>
  );
}

export default function TabNomina({ mobile }) {
  const now = new Date();
  const [mes,          setMes]          = useState(now.getMonth());
  const [anio,         setAnio]         = useState(now.getFullYear());
  const [empleados,    setEmpleados]    = useState([]);
  const [nomina,       setNomina]       = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [generando,    setGenerando]    = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [yaGenerada,   setYaGenerada]   = useState(false);

  const [diasMap,           setDiasMap]           = useState({});
  const [bonifMap,          setBonifMap]           = useState({});
  const [horasExtraMap,     setHorasExtraMap]     = useState({});
  const [valHoraExtraMap,   setValHoraExtraMap]   = useState({});
  const [horasAtrasoMap,    setHorasAtrasoMap]    = useState({});
  const [valHoraAtrasoMap,  setValHoraAtrasoMap]  = useState({});
  const [anticipoMap,       setAnticipoMap]        = useState({});
  const [comprasEmpMap,     setComprasEmpMap]      = useState({});

  const cargar = useCallback(async () => {
    setCargando(true);
    const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;
    const [{ data: emps }, { data: nom }] = await Promise.all([
      supabase.from('empleados').select('*').eq('activo', true).is('deleted_at', null).order('nombre'),
      supabase.from('nomina').select('*, empleados(nombre, cedula)').eq('periodo', periodoStr).order('created_at')
    ]);
    const lista = emps || [];
    setEmpleados(lista);
    setNomina(nom || []);
    setYaGenerada((nom || []).length > 0);
    setDiasMap(prev => {
      const dm = {};
      lista.forEach(e => { dm[e.id] = prev[e.id] || 30; });
      return dm;
    });
    setCargando(false);
  }, [mes, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  function getExtras(empId) {
    return {
      bonificacion:    bonifMap[empId]        || 0,
      horasExtra:      horasExtraMap[empId]   || 0,
      valorHoraExtra:  valHoraExtraMap[empId] || 0,
      horasAtraso:     horasAtrasoMap[empId]  || 0,
      valorHoraAtraso: valHoraAtrasoMap[empId]|| 0,
      anticipo:        anticipoMap[empId]     || 0,
      comprasEmpresa:  comprasEmpMap[empId]   || 0,
    };
  }

  async function generarNomina() {
    if (yaGenerada) {
      if (!window.confirm(`Ya existe nómina para ${MESES[mes]} ${anio}. ¿Regenerar?`)) return;
      const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;
      await supabase.from('nomina').delete().eq('periodo', periodoStr);
    }
    setGenerando(true);
    const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;
    const rows = empleados.map(emp => {
      const dias = diasMap[emp.id] || 30;
      const r    = calcularRol(emp, dias, getExtras(emp.id));
      return {
        empleado_id:        emp.id,
        periodo:            periodoStr,
        dias_trabajados:    dias,
        sueldo_base:        emp.sueldo_base,
        sueldo_prop:        r.sueldoProp,
        iess_empleado:      r.iessEmp,
        iess_patronal:      r.iessPat,
        decimo_tercero:     0,
        decimo_cuarto:      0,
        fondo_reserva:      0,
        vacaciones:         0,
        bonificacion:       r.bonificacion,
        horas_extra:        r.horasExtra,
        valor_hora_extra:   r.valorHoraExtra,
        total_extras:       r.totalExtras,
        horas_atraso:       r.horasAtraso,
        valor_hora_atraso:  r.valorHoraAtraso,
        total_atrasos:      r.totalAtrasos,
        anticipo:           r.anticipo,
        compras_empresa:    r.comprasEmpresa,
        sueldo_neto:        r.sueldoNeto,
        costo_patronal:     r.costoPatronal,
        estado:             'generado'
      };
    });
    const { error } = await supabase.from('nomina').insert(rows);
    if (error) { alert('Error al generar nómina: ' + error.message); setGenerando(false); return; }
    await cargar();
    setGenerando(false);
  }

  async function marcarPagado(id) {
    await supabase.from('nomina')
      .update({ estado: 'pagado', fecha_pago: new Date().toISOString().slice(0,10) })
      .eq('id', id);
    await cargar();
  }

  const totales = nomina.reduce((acc, n) => ({
    sueldos:  acc.sueldos  + (n.sueldo_prop    || 0),
    iessEmp:  acc.iessEmp  + (n.iess_empleado  || 0),
    iessPat:  acc.iessPat  + (n.iess_patronal  || 0),
    neto:     acc.neto     + (n.sueldo_neto    || 0),
    patronal: acc.patronal + (n.costo_patronal || 0),
  }), { sueldos: 0, iessEmp: 0, iessPat: 0, neto: 0, patronal: 0 });

  function exportarExcel() {
    const filas = nomina.map(n => ({
      'Empleado':        n.empleados?.nombre || '',
      'Cédula':          n.empleados?.cedula || '',
      'Días':            n.dias_trabajados,
      'Sueldo':          parseFloat((n.sueldo_prop      || 0).toFixed(2)),
      'Bonificación':    parseFloat((n.bonificacion     || 0).toFixed(2)),
      'H. Extra':        n.horas_extra || 0,
      'Val/H. Extra':    parseFloat((n.valor_hora_extra  || 0).toFixed(2)),
      'Total Extras':    parseFloat((n.total_extras      || 0).toFixed(2)),
      'H. Atraso':       n.horas_atraso || 0,
      'Val/H. Atraso':   parseFloat((n.valor_hora_atraso || 0).toFixed(2)),
      'Total Atrasos':   parseFloat((n.total_atrasos     || 0).toFixed(2)),
      'Anticipo':        parseFloat((n.anticipo          || 0).toFixed(2)),
      'Compras Empresa': parseFloat((n.compras_empresa   || 0).toFixed(2)),
      'IESS Empleado':   parseFloat((n.iess_empleado     || 0).toFixed(2)),
      'IESS Patronal':   parseFloat((n.iess_patronal     || 0).toFixed(2)),
      'Neto a Pagar':    parseFloat((n.sueldo_neto       || 0).toFixed(2)),
      'Costo Empresa':   parseFloat((n.costo_patronal    || 0).toFixed(2)),
      'Estado':          n.estado
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${MESES[mes]} ${anio}`);
    XLSX.writeFile(wb, `nomina_${MESES[mes]}_${anio}.xlsx`);
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
  const fieldStyle = (color = '#ddd') => ({
    width: '100%', padding: '6px 8px', borderRadius: '6px',
    border: `1.5px solid ${color}`, fontSize: '13px',
    boxSizing: 'border-box', outline: 'none'
  });
  const labelStyle = (color = '#777') => ({
    fontSize: '10px', color, marginBottom: '3px', fontWeight: '600', display: 'block'
  });

  return (
    <div>
      {/* Selector período + acciones */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={labelStyle()}>Mes</div>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inputStyle}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle()}>Año</div>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px' }} />
        </div>
        <button onClick={generarNomina} disabled={generando || cargando || empleados.length === 0}
          style={{
            background: (generando || cargando) ? '#aaa' : 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
            color: 'white', border: 'none', borderRadius: '8px',
            padding: '9px 18px', cursor: (generando || cargando) ? 'default' : 'pointer',
            fontSize: '13px', fontWeight: 'bold'
          }}>
          {generando ? 'Generando...' : yaGenerada ? '🔄 Regenerar' : '⚡ Generar nómina'}
        </button>
        {nomina.length > 0 && (
          <button onClick={exportarExcel} style={{
            background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px',
            padding: '9px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
          }}>📥 Exportar CSV</button>
        )}
      </div>

      {/* Inputs pre-generación por empleado */}
      {!yaGenerada && !cargando && empleados.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '12px' }}>
            📋 Datos de nómina — {MESES[mes]} {anio}
          </div>
          {empleados.map(emp => (
            <div key={emp.id} style={{
              marginBottom: '14px', padding: '12px',
              background: '#f8f9fa', borderRadius: '10px',
              borderLeft: '3px solid #4a2c7a'
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '10px' }}>
                👤 {emp.nombre} — Sueldo base: ${parseFloat(emp.sueldo_base || 0).toFixed(2)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '8px' }}>
                <div>
                  <label style={labelStyle()}>Días trabajados</label>
                  <input type="number" min={1} max={31} value={diasMap[emp.id] || 30}
                    onChange={e => setDiasMap(d => ({ ...d, [emp.id]: Number(e.target.value) }))}
                    style={fieldStyle()} />
                </div>
                <div>
                  <label style={labelStyle('#27ae60')}>Bonificación $</label>
                  <input type="number" min={0} step="0.01" value={bonifMap[emp.id] || ''}
                    onChange={e => setBonifMap(d => ({ ...d, [emp.id]: e.target.value }))}
                    placeholder="0.00" style={fieldStyle('#27ae60')} />
                </div>
                <div>
                  <label style={labelStyle('#27ae60')}>H. Extras (cant)</label>
                  <input type="number" min={0} step="0.5" value={horasExtraMap[emp.id] || ''}
                    onChange={e => setHorasExtraMap(d => ({ ...d, [emp.id]: e.target.value }))}
                    placeholder="0" style={fieldStyle('#27ae60')} />
                </div>
                <div>
                  <label style={labelStyle('#27ae60')}>Valor/H. Extra $</label>
                  <input type="number" min={0} step="0.01" value={valHoraExtraMap[emp.id] || ''}
                    onChange={e => setValHoraExtraMap(d => ({ ...d, [emp.id]: e.target.value }))}
                    placeholder="0.00" style={fieldStyle('#27ae60')} />
                </div>
                <div>
                  <label style={labelStyle('#e74c3c')}>H. Atraso (cant)</label>
                  <input type="number" min={0} step="0.5" value={horasAtrasoMap[emp.id] || ''}
                    onChange={e => setHorasAtrasoMap(d => ({ ...d, [emp.id]: e.target.value }))}
                    placeholder="0" style={fieldStyle('#e74c3c')} />
                </div>
                <div>
                  <label style={labelStyle('#e74c3c')}>Valor/H. Atraso $</label>
                  <input type="number" min={0} step="0.01" value={valHoraAtrasoMap[emp.id] || ''}
                    onChange={e => setValHoraAtrasoMap(d => ({ ...d, [emp.id]: e.target.value }))}
                    placeholder="0.00" style={fieldStyle('#e74c3c')} />
                </div>
                <div>
                  <label style={labelStyle('#e74c3c')}>Anticipo $</label>
                  <input type="number" min={0} step="0.01" value={anticipoMap[emp.id] || ''}
                    onChange={e => setAnticipoMap(d => ({ ...d, [emp.id]: e.target.value }))}
                    placeholder="0.00" style={fieldStyle('#e74c3c')} />
                </div>
                <div>
                  <label style={labelStyle('#e74c3c')}>Compras Empresa $</label>
                  <input type="number" min={0} step="0.01" value={comprasEmpMap[emp.id] || ''}
                    onChange={e => setComprasEmpMap(d => ({ ...d, [emp.id]: e.target.value }))}
                    placeholder="0.00" style={fieldStyle('#e74c3c')} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen totales */}
      {nomina.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(5,1fr)',
          gap: '8px', marginBottom: '12px'
        }}>
          {[
            { label: 'Sueldos',        valor: totales.sueldos,  color: '#2980b9' },
            { label: 'IESS empleados', valor: totales.iessEmp,  color: '#e74c3c' },
            { label: 'IESS patronal',  valor: totales.iessPat,  color: '#8e44ad' },
            { label: 'Neto a pagar',   valor: totales.neto,     color: '#27ae60' },
            { label: 'Costo empresa',  valor: totales.patronal, color: '#f39c12' },
          ].map(r => (
            <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
              <div style={{ fontSize: mobile ? '14px' : '17px', fontWeight: 'bold', color: r.color }}>
                ${r.valor.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista nómina */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando...</div>
      ) : nomina.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          {empleados.length === 0
            ? 'No tienes empleados activos. Regístralos en la pestaña Empleados.'
            : `Completa los datos arriba y presiona "Generar nómina".`}
        </div>
      ) : (
        nomina.map(n => (
          <div key={n.id} style={{ ...card, borderLeft: `4px solid ${n.estado === 'pagado' ? '#27ae60' : '#4a2c7a'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#2c1a4a' }}>
                    👤 {n.empleados?.nombre}
                  </span>
                  <span style={{
                    background: n.estado === 'pagado' ? '#27ae60' : '#4a2c7a',
                    color: 'white', borderRadius: '12px', padding: '2px 10px',
                    fontSize: '11px', fontWeight: 'bold'
                  }}>{n.estado === 'pagado' ? '✅ Pagado' : '⏳ Pendiente'}</span>
                  <span style={{ fontSize: '11px', color: '#888' }}>{n.dias_trabajados}d</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '12px' }}>
                  <span style={{ color: '#555' }}>Sueldo: <b>${(n.sueldo_prop||0).toFixed(2)}</b></span>
                  {(n.bonificacion||0) > 0   && <span style={{ color: '#27ae60' }}>Bonif: +${(n.bonificacion||0).toFixed(2)}</span>}
                  {(n.total_extras||0) > 0   && <span style={{ color: '#27ae60' }}>Extras: +${(n.total_extras||0).toFixed(2)}</span>}
                  {(n.total_atrasos||0) > 0  && <span style={{ color: '#e74c3c' }}>Atrasos: -${(n.total_atrasos||0).toFixed(2)}</span>}
                  {(n.anticipo||0) > 0       && <span style={{ color: '#e74c3c' }}>Anticipo: -${(n.anticipo||0).toFixed(2)}</span>}
                  {(n.compras_empresa||0) > 0&& <span style={{ color: '#e74c3c' }}>Compras: -${(n.compras_empresa||0).toFixed(2)}</span>}
                  <span style={{ color: '#e74c3c' }}>IESS: -${(n.iess_empleado||0).toFixed(2)}</span>
                  <span style={{ color: '#27ae60', fontWeight: 'bold' }}>NETO: ${(n.sueldo_neto||0).toFixed(2)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => setModalDetalle(n)} style={{
                  background: '#f0f2f5', border: 'none', borderRadius: '8px',
                  padding: '7px 12px', cursor: 'pointer', fontSize: '12px'
                }}>🔍 Detalle</button>
                {n.estado !== 'pagado' && (
                  <button onClick={() => marcarPagado(n.id)} style={{
                    background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px',
                    padding: '7px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                  }}>✅ Pagar</button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Modal rol de pago — Básico + Extras */}
      {modalDetalle && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '680px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            overflowY: 'auto', maxHeight: '90vh'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#2c1a4a' }}>📄 Rol de Pago</h3>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                  Embutidos y Jamones Candelaria — {MESES[mes]} {anio}
                </div>
              </div>
              <button onClick={() => setModalDetalle(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '6px',
                padding: '5px 10px', cursor: 'pointer', fontSize: '12px'
              }}>✕</button>
            </div>

            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#2c1a4a' }}>
              {modalDetalle.empleados?.nombre}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
              Cédula: {modalDetalle.empleados?.cedula || '—'} · {modalDetalle.dias_trabajados} días trabajados
            </div>

            {/* Dos columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '14px' }}>

              {/* BÁSICO */}
              <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '16px' }}>
                <div style={{
                  fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a',
                  marginBottom: '10px', borderBottom: '1px solid #ddd', paddingBottom: '6px'
                }}>
                  📋 BÁSICO
                </div>
                <RolFila label="Sueldo básico" valor={modalDetalle.sueldo_prop} />
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#e74c3c', margin: '10px 0 6px' }}>
                  DESCUENTOS
                </div>
                {(modalDetalle.anticipo || 0) > 0 && (
                  <RolFila label="Anticipos" valor={-(modalDetalle.anticipo || 0)} color="#e74c3c" />
                )}
                {(modalDetalle.compras_empresa || 0) > 0 && (
                  <RolFila label="Compras Empresa" valor={-(modalDetalle.compras_empresa || 0)} color="#e74c3c" />
                )}
                <RolFila
                  label={`Aporte IESS ${(modalDetalle.sueldo_prop ? (modalDetalle.iess_empleado / modalDetalle.sueldo_prop * 100).toFixed(2) : '9.45')}%`}
                  valor={-(modalDetalle.iess_empleado || 0)}
                  color="#e74c3c"
                />
                <div style={{ borderTop: '2px solid #2c1a4a', margin: '10px 0 6px' }} />
                <RolFila
                  label="TOTAL"
                  valor={
                    (modalDetalle.sueldo_prop || 0)
                    - (modalDetalle.anticipo || 0)
                    - (modalDetalle.compras_empresa || 0)
                    - (modalDetalle.iess_empleado || 0)
                  }
                  bold color="#2c1a4a"
                />
              </div>

              {/* EXTRAS */}
              <div style={{ background: '#f0f7ff', borderRadius: '12px', padding: '16px' }}>
                <div style={{
                  fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a',
                  marginBottom: '10px', borderBottom: '1px solid #c8dff5', paddingBottom: '6px'
                }}>
                  ⚡ EXTRAS / BONOS
                </div>
                {(modalDetalle.bonificacion || 0) > 0 && (
                  <RolFila label="Bonificación" valor={modalDetalle.bonificacion} color="#27ae60" />
                )}
                {(modalDetalle.total_extras || 0) > 0 && (
                  <RolFila
                    label={`${modalDetalle.horas_extra} H. Extra × $${parseFloat(modalDetalle.valor_hora_extra || 0).toFixed(2)}`}
                    valor={modalDetalle.total_extras}
                    color="#27ae60"
                  />
                )}
                {(modalDetalle.total_atrasos || 0) > 0 && (
                  <RolFila
                    label={`${modalDetalle.horas_atraso} H. Atraso × $${parseFloat(modalDetalle.valor_hora_atraso || 0).toFixed(2)}`}
                    valor={-(modalDetalle.total_atrasos || 0)}
                    color="#e74c3c"
                  />
                )}
                <div style={{ borderTop: '2px solid #2c1a4a', margin: '10px 0 6px' }} />
                <RolFila
                  label="TOTAL"
                  valor={
                    (modalDetalle.bonificacion || 0)
                    + (modalDetalle.total_extras || 0)
                    - (modalDetalle.total_atrasos || 0)
                  }
                  bold color="#2c1a4a"
                />
              </div>
            </div>

            {/* NETO FINAL */}
            <div style={{
              background: 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
              borderRadius: '12px', padding: '16px', marginTop: '14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                NETO TOTAL A PAGAR
              </div>
              <div style={{ color: '#a9dfbf', fontWeight: 'bold', fontSize: '24px' }}>
                ${(modalDetalle.sueldo_neto || 0).toFixed(2)}
              </div>
            </div>

            <div style={{ marginTop: '10px', fontSize: '11px', color: '#888', textAlign: 'center' }}>
              IESS patronal: ${(modalDetalle.iess_patronal || 0).toFixed(2)} · Costo total empresa: ${(modalDetalle.costo_patronal || 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
