// ============================================
// TabNomina.js
// Generación y gestión de roles de pago
// Ecuador: SBU 2024 = $460, décimos, vacaciones
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Cálculos Ecuador
function calcularRol(emp, diasTrabajados = 30) {
  const sueldo       = emp.sueldo_base || 0;
  const factor       = diasTrabajados / 30;
  const sueldoProp   = sueldo * factor;

  // IESS
  const pEmp         = (emp.porcentaje_iess_empleado || 9.45) / 100;
  const pPat         = (emp.porcentaje_iess_patronal || 12.15) / 100;
  const iessEmp      = emp.afiliado_iess ? sueldoProp * pEmp  : 0;
  const iessPat      = emp.afiliado_iess ? sueldoProp * pPat  : 0;

  // Beneficios sociales (proporcional mensual)
  const decimoTercero  = sueldoProp / 12;          // 1/12 mensual
  const decimoCuarto   = (460 / 12) * factor;      // SBU proporcional
  const fondoReserva   = sueldo >= 460 ? sueldoProp / 12 : 0; // solo si > 1 año
  const vacaciones     = sueldoProp / 24;           // 15 días / año

  const sueldoNeto     = sueldoProp - iessEmp;
  const costoPatronal  = sueldoProp + iessPat + decimoTercero + decimoCuarto + fondoReserva + vacaciones;

  return {
    sueldoProp, iessEmp, iessPat,
    decimoTercero, decimoCuarto, fondoReserva, vacaciones,
    sueldoNeto, costoPatronal
  };
}

export default function TabNomina({ mobile }) {
  const now   = new Date();
  const [mes,        setMes]        = useState(now.getMonth());       // 0-11
  const [anio,       setAnio]       = useState(now.getFullYear());
  const [empleados,  setEmpleados]  = useState([]);
  const [nomina,     setNomina]     = useState([]);  // nómina ya guardada del período
  const [cargando,   setCargando]   = useState(true);
  const [generando,  setGenerando]  = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [diasMap,    setDiasMap]    = useState({});  // empId → diasTrabajados
  const [yaGenerada, setYaGenerada] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;

    // Empleados activos
    const { data: emps } = await supabase
      .from('empleados').select('*')
      .eq('activo', true).is('deleted_at', null).order('nombre');

    // Nómina existente para el período
    const { data: nom } = await supabase
      .from('nomina')
      .select('*, empleados(nombre, cedula)')
      .eq('periodo', periodoStr)
      .order('created_at');

    const lista = emps || [];
    setEmpleados(lista);
    setNomina(nom || []);
    setYaGenerada((nom || []).length > 0);

    // Inicializar días trabajados en 30
    const dm = {};
    lista.forEach(e => { dm[e.id] = diasMap[e.id] || 30; });
    setDiasMap(dm);
    setCargando(false);
  }, [mes, anio]); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  // Sincroniza costo_patronal de la nómina → mod_directa / mod_indirecta → config_productos
  async function sincronizarConMODCIF(periodoStr) {
    try {
      const [
        { data: nomPeriodo },
        { data: modD },
        { data: modI },
        { data: cfg },
        { data: cif },
      ] = await Promise.all([
        supabase.from('nomina').select('costo_patronal, empleados(nombre)').eq('periodo', periodoStr),
        supabase.from('mod_directa').select('id, nombre, sueldo_mes'),
        supabase.from('mod_indirecta').select('id, nombre, sueldo_mes'),
        supabase.from('costos_mod_cif').select('produccion_kg').single(),
        supabase.from('cif_items').select('valor_mes'),
      ]);

      if (!nomPeriodo?.length) return;

      const prodKg = parseFloat(cfg?.produccion_kg) || 13600;
      let totalMO = 0;

      // Actualizar filas de MOD que coincidan con nombres de empleados
      for (const row of (modD || [])) {
        const match = nomPeriodo.find(n => norm(n.empleados?.nombre) === norm(row.nombre));
        if (match) {
          await supabase.from('mod_directa').update({
            sueldo_mes: match.costo_patronal,
            costo_kg:   prodKg > 0 ? match.costo_patronal / prodKg : 0,
          }).eq('id', row.id);
          totalMO += match.costo_patronal;
        } else {
          totalMO += parseFloat(row.sueldo_mes) || 0;
        }
      }
      for (const row of (modI || [])) {
        const match = nomPeriodo.find(n => norm(n.empleados?.nombre) === norm(row.nombre));
        if (match) {
          await supabase.from('mod_indirecta').update({
            sueldo_mes: match.costo_patronal,
            costo_kg:   prodKg > 0 ? match.costo_patronal / prodKg : 0,
          }).eq('id', row.id);
          totalMO += match.costo_patronal;
        } else {
          totalMO += parseFloat(row.sueldo_mes) || 0;
        }
      }

      // Recalcular mod_cif_kg y propagar a todas las fórmulas
      const totalCIF      = (cif || []).reduce((s, c) => s + (parseFloat(c.valor_mes) || 0), 0);
      const nuevoModCifKg = prodKg > 0 ? (totalMO + totalCIF) / prodKg : 0;
      await supabase.from('config_productos').update({ mod_cif_kg: nuevoModCifKg });
    } catch (_) {
      // Sincronización no crítica: si falla, no bloquea el guardado de nómina
    }
  }

  async function generarNomina() {
    if (yaGenerada) {
      if (!window.confirm(`Ya existe nómina para ${MESES[mes]} ${anio}. ¿Regenerar y reemplazar?`)) return;
      // Borrar la anterior
      const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;
      await supabase.from('nomina').delete().eq('periodo', periodoStr);
    }
    setGenerando(true);
    const periodoStr = `${anio}-${String(mes + 1).padStart(2,'0')}`;
    const rows = empleados.map(emp => {
      const dias = diasMap[emp.id] || 30;
      const r    = calcularRol(emp, dias);
      return {
        empleado_id:      emp.id,
        periodo:          periodoStr,
        dias_trabajados:  dias,
        sueldo_base:      emp.sueldo_base,
        sueldo_prop:      r.sueldoProp,
        iess_empleado:    r.iessEmp,
        iess_patronal:    r.iessPat,
        decimo_tercero:   r.decimoTercero,
        decimo_cuarto:    r.decimoCuarto,
        fondo_reserva:    r.fondoReserva,
        vacaciones:       r.vacaciones,
        sueldo_neto:      r.sueldoNeto,
        costo_patronal:   r.costoPatronal,
        estado:           'generado'
      };
    });

    const { error } = await supabase.from('nomina').insert(rows);
    if (error) { alert('Error al generar nómina: ' + error.message); setGenerando(false); return; }
    await cargar();
    await sincronizarConMODCIF(periodoStr);
    setGenerando(false);
  }

  async function marcarPagado(id) {
    await supabase.from('nomina').update({
      estado: 'pagado', fecha_pago: new Date().toISOString().slice(0,10)
    }).eq('id', id);
    await cargar();
  }

  // Totales de la nómina cargada
  const totales = nomina.reduce((acc, n) => ({
    sueldos:   acc.sueldos   + (n.sueldo_prop     || 0),
    iessEmp:   acc.iessEmp   + (n.iess_empleado   || 0),
    iessPat:   acc.iessPat   + (n.iess_patronal   || 0),
    neto:      acc.neto      + (n.sueldo_neto     || 0),
    patronal:  acc.patronal  + (n.costo_patronal  || 0),
  }), { sueldos: 0, iessEmp: 0, iessPat: 0, neto: 0, patronal: 0 });

  function exportarCSV() {
    const enc = ['Empleado','Cédula','Días','Sueldo','IESS emp.','IESS pat.','XIII','XIV','F.Reserva','Vacaciones','Neto','Costo patronal','Estado'];
    const rows = nomina.map(n => [
      n.empleados?.nombre || '', n.empleados?.cedula || '',
      n.dias_trabajados, n.sueldo_prop?.toFixed(2),
      n.iess_empleado?.toFixed(2), n.iess_patronal?.toFixed(2),
      n.decimo_tercero?.toFixed(2), n.decimo_cuarto?.toFixed(2),
      n.fondo_reserva?.toFixed(2), n.vacaciones?.toFixed(2),
      n.sueldo_neto?.toFixed(2), n.costo_patronal?.toFixed(2),
      n.estado
    ]);
    const csv = [enc, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `nomina_${MESES[mes]}_${anio}.csv`;
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
      {/* Selector período + acciones */}
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
        <button onClick={generarNomina} disabled={generando || cargando || empleados.length === 0} style={{
          background: (generando || cargando) ? '#aaa' : 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 18px', cursor: (generando || cargando) ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {generando ? 'Generando...' : yaGenerada ? '🔄 Regenerar' : '⚡ Generar nómina'}
        </button>
        {nomina.length > 0 && (
          <button onClick={exportarCSV} style={{
            background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px',
            padding: '9px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
          }}>📥 Exportar CSV</button>
        )}
      </div>

      {/* Días trabajados — solo cuando aún no se generó */}
      {!yaGenerada && !cargando && empleados.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '10px' }}>
            📋 Días trabajados — {MESES[mes]} {anio}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)',
            gap: '8px'
          }}>
            {empleados.map(emp => (
              <div key={emp.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#f8f9fa', borderRadius: '8px', padding: '8px 12px'
              }}>
                <span style={{ fontSize: '13px', color: '#333' }}>{emp.nombre}</span>
                <input
                  type="number" min={1} max={31}
                  value={diasMap[emp.id] || 30}
                  onChange={e => setDiasMap(d => ({ ...d, [emp.id]: Number(e.target.value) }))}
                  style={{
                    width: '52px', padding: '4px 8px', borderRadius: '6px',
                    border: '1.5px solid #ddd', fontSize: '13px', textAlign: 'center'
                  }}
                />
              </div>
            ))}
          </div>
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
            { label: 'Sueldos',       valor: totales.sueldos,  color: '#2980b9' },
            { label: 'IESS empleados',valor: totales.iessEmp,  color: '#e74c3c' },
            { label: 'IESS patronal', valor: totales.iessPat,  color: '#8e44ad' },
            { label: 'Neto a pagar',  valor: totales.neto,     color: '#27ae60' },
            { label: 'Costo empresa', valor: totales.patronal, color: '#f39c12' },
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
            ? 'No tienes empleados activos. Regístralos primero en la pestaña Empleados.'
            : `No hay nómina generada para ${MESES[mes]} ${anio}. Ajusta los días y presiona "Generar nómina".`}
        </div>
      ) : (
        nomina.map(n => (
          <div key={n.id} style={{
            ...card,
            borderLeft: `4px solid ${n.estado === 'pagado' ? '#27ae60' : '#4a2c7a'}`
          }}>
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
                  }}>
                    {n.estado === 'pagado' ? '✅ Pagado' : '⏳ Pendiente'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#888' }}>
                    {n.dias_trabajados}d trabajados
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(5, auto)',
                  gap: '4px 16px', fontSize: '12px', color: '#555'
                }}>
                  <span>Sueldo: <b>${(n.sueldo_prop||0).toFixed(2)}</b></span>
                  <span style={{ color: '#e74c3c' }}>IESS: -${(n.iess_empleado||0).toFixed(2)}</span>
                  <span style={{ color: '#27ae60', fontWeight: 'bold' }}>Neto: ${(n.sueldo_neto||0).toFixed(2)}</span>
                  <span style={{ color: '#8e44ad' }}>XIII: +${(n.decimo_tercero||0).toFixed(2)}</span>
                  <span style={{ color: '#f39c12' }}>Costo emp.: ${(n.costo_patronal||0).toFixed(2)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => setModalDetalle(n)} style={{
                  background: '#f0f2f5', border: 'none', borderRadius: '8px',
                  padding: '7px 12px', cursor: 'pointer', fontSize: '12px'
                }}>🔍 Detalle</button>
                {n.estado !== 'pagado' && (
                  <button onClick={() => marcarPagado(n.id)} style={{
                    background: '#27ae60', color: 'white', border: 'none',
                    borderRadius: '8px', padding: '7px 12px',
                    cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                  }}>✅ Pagar</button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Modal detalle rol de pago */}
      {modalDetalle && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '420px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#2c1a4a' }}>📄 Rol de pago</h3>
              <button onClick={() => setModalDetalle(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '6px',
                padding: '5px 10px', cursor: 'pointer', fontSize: '12px'
              }}>✕</button>
            </div>

            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
              {modalDetalle.empleados?.nombre}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
              {MESES[mes]} {anio} · {modalDetalle.dias_trabajados} días trabajados
            </div>

            {[
              { label: 'Sueldo proporcional',  valor:  modalDetalle.sueldo_prop,     color: '#333',   sign: '' },
              { label: `IESS empleado (${modalDetalle.iess_empleado && modalDetalle.sueldo_prop ? ((modalDetalle.iess_empleado/modalDetalle.sueldo_prop)*100).toFixed(2) : '9.45'}%)`,
                                               valor: -modalDetalle.iess_empleado,   color: '#e74c3c', sign: '-' },
              { label: '── Sueldo neto a recibir', valor: modalDetalle.sueldo_neto,  color: '#27ae60', bold: true },
              null,
              { label: 'Décimo tercero (1/12)', valor: modalDetalle.decimo_tercero,  color: '#8e44ad', sign: '+' },
              { label: 'Décimo cuarto (1/12)',  valor: modalDetalle.decimo_cuarto,   color: '#8e44ad', sign: '+' },
              { label: 'Fondo de reserva',      valor: modalDetalle.fondo_reserva,   color: '#8e44ad', sign: '+' },
              { label: 'Vacaciones (1/24)',      valor: modalDetalle.vacaciones,      color: '#8e44ad', sign: '+' },
              { label: 'IESS patronal',          valor: modalDetalle.iess_patronal,   color: '#8e44ad', sign: '+' },
              null,
              { label: '── COSTO TOTAL EMPRESA', valor: modalDetalle.costo_patronal, color: '#f39c12', bold: true },
            ].map((r, i) => {
              if (!r) return <hr key={i} style={{ border: 'none', borderTop: '1px solid #eee', margin: '8px 0' }} />;
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '5px 0', fontSize: r.bold ? '14px' : '13px',
                  fontWeight: r.bold ? 'bold' : 'normal', color: r.color
                }}>
                  <span>{r.label}</span>
                  <span>{r.sign === '-' ? '-' : ''} ${Math.abs(r.valor || 0).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
