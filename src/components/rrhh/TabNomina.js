// ============================================
// TabNomina.js — Roles de Pago
// Movimientos progresivos + Generación + Impresión
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

const EMPRESA = {
  nombre: 'CORELLA PLACENCIA SEBASTIAN FRANCISCO',
  ruc:    '1002345351001',
};

const TIPOS_MOV = [
  { value: 'anticipo',          label: '💸 Anticipo',           color: '#e74c3c', lado: 'D' },
  { value: 'compra',            label: '🛒 Compra empresa',      color: '#e74c3c', lado: 'D' },
  { value: 'bono',              label: '🎁 Bonificación',        color: '#27ae60', lado: 'I' },
  { value: 'bono_mensualizado', label: '📅 Bono mensualizado',   color: '#27ae60', lado: 'I' },
  { value: 'extra',             label: '⏱ Hora extra',          color: '#2980b9', lado: 'I' },
  { value: 'atraso',            label: '⏰ Atraso (descuento)',  color: '#e67e22', lado: 'D' },
];

// ── Fila de detalle ──────────────────────────────────────────
function Fila({ label, valor, color = '#333', bold = false }) {
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

// ── Imprimir Rol de Pago (ventana nueva) ─────────────────────
function imprimirRol(n, mesLabel, anio) {
  const sueldoProp   = parseFloat(n.sueldo_prop         || 0);
  const anticipo     = parseFloat(n.anticipo            || 0);
  const compras      = parseFloat(n.compras_empresa     || 0);
  const iessEmp      = parseFloat(n.iess_empleado       || 0);
  const bonif        = parseFloat(n.bonificacion        || 0);
  const bonosMens    = parseFloat(n.bonos_mensualizados || 0);
  const totalExtras  = parseFloat(n.total_extras        || 0);
  const totalAtrasos = parseFloat(n.total_atrasos       || 0);
  const horasExtra   = parseFloat(n.horas_extra         || 0);
  const valHExtra    = parseFloat(n.valor_hora_extra    || 0);
  const horasAtraso  = parseFloat(n.horas_atraso        || 0);
  const valHAtraso   = parseFloat(n.valor_hora_atraso   || 0);
  const iessP        = parseFloat(n.empleados?.porcentaje_iess_empleado || 9.45);

  const subtotalBasicoIngresos  = sueldoProp;
  const subtotalDescuentosBasico = parseFloat((anticipo + compras + iessEmp).toFixed(2));
  const totalBasico              = parseFloat((subtotalBasicoIngresos - subtotalDescuentosBasico).toFixed(2));

  const subtotalBonos = parseFloat((bonif + bonosMens + totalExtras - totalAtrasos).toFixed(2));
  const granTotal     = parseFloat((totalBasico + subtotalBonos).toFixed(2));

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Rol de Pagos — ${n.empleados?.nombre} — ${mesLabel} ${anio}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000}
.paginas{display:flex;gap:16px;padding:10px}
.pagina{width:48%;border:1px solid #aaa;padding:14px;font-size:9pt}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px}
.rol-tit{font-size:11pt;font-weight:bold}
.emp-nom{font-weight:bold;font-size:9.5pt;margin:6px 0 2px}
.emp-ruc{font-size:8pt;margin-bottom:6px}
.info{width:100%;margin-bottom:6px}
.info td{padding:1px 0;font-size:9pt}
.lbl{font-weight:bold;width:95px}
table.sec{width:100%;border-collapse:collapse;margin:6px 0;font-size:9pt}
table.sec th,table.sec td{border:1px solid #444;padding:3px 5px}
table.sec th{background:#f0f0f0;font-size:8pt;font-weight:bold;text-align:center}
.r{text-align:right}
.sub-row td{font-weight:bold;border-top:2px solid #000;background:#f5f5f5}
.tot-row td{font-weight:bold;background:#e8e8e8}
.desc-lbl{font-weight:bold;font-size:8.5pt;margin:8px 0 3px}
.cedula{margin-top:12px;font-size:7.5pt;color:#555;border-top:1px solid #ddd;padding-top:6px}
.conforme{margin-top:16px;font-size:8.5pt}
.gran-tot{margin-top:10px;background:#ffff00;border:2px solid #000;padding:8px;font-size:14pt;font-weight:bold;text-align:right}
@media print{body{margin:0}.paginas{gap:8px}}
</style>
</head>
<body>
<div class="paginas">

<!-- ===== BÁSICO ===== -->
<div class="pagina">
  <div class="hdr">
    <div><img src="/LOGO_CANDELARIA_1.png" style="height:50px;background:white;padding:3px 6px;border-radius:5px"/></div>
    <div class="rol-tit">Rol de Pagos</div>
  </div>
  <div class="emp-nom">${EMPRESA.nombre}</div>
  <div class="emp-ruc">${EMPRESA.ruc}</div>
  <table class="info">
    <tr><td class="lbl">Mes a Pagar :</td><td><b>${mesLabel.toUpperCase()}&nbsp;&nbsp;&nbsp;${anio}</b></td></tr>
    <tr><td class="lbl">Trabajador :</td><td>${n.empleados?.nombre || ''}</td></tr>
    <tr><td class="lbl">Cargo :</td><td>${n.empleados?.cargo || ''}</td></tr>
  </table>

  <table class="sec">
    <thead><tr><th></th><th>V. unit</th><th>Total a pagar $</th></tr></thead>
    <tbody>
      <tr><td>Sueldo básico</td><td></td><td class="r">${subtotalBasicoIngresos.toFixed(2)}</td></tr>
      <tr class="sub-row"><td colspan="2">subtotal</td><td class="r">${subtotalBasicoIngresos.toFixed(2)}</td></tr>
    </tbody>
  </table>

  <div class="desc-lbl">Descuentos</div>
  <table class="sec">
    <thead><tr><th></th><th>Total a pagar $</th></tr></thead>
    <tbody>
      ${anticipo > 0 ? `<tr><td>Anticipos</td><td class="r">${anticipo.toFixed(2)}</td></tr>` : ''}
      ${compras  > 0 ? `<tr><td>Compras Empresa</td><td class="r">${compras.toFixed(2)}</td></tr>` : ''}
      <tr><td>Aporte al IESS ${iessP.toFixed(2)}%</td><td class="r">${iessEmp.toFixed(2)}</td></tr>
      <tr class="sub-row"><td>subtotal</td><td class="r">${subtotalDescuentosBasico.toFixed(2)}</td></tr>
      <tr class="tot-row"><td>TOTAL</td><td class="r">${totalBasico.toFixed(2)}</td></tr>
    </tbody>
  </table>
  <div class="cedula">${n.empleados?.cedula || ''}</div>
</div>

<!-- ===== EXTRAS / BONOS ===== -->
<div class="pagina">
  <div class="hdr">
    <div><img src="/LOGO_CANDELARIA_1.png" style="height:50px;background:white;padding:3px 6px;border-radius:5px"/></div>
    <div class="rol-tit">Rol de Pagos</div>
  </div>
  <div class="emp-nom">${EMPRESA.nombre}</div>
  <div class="emp-ruc">${EMPRESA.ruc}</div>
  <table class="info">
    <tr><td class="lbl">Mes a Pagar :</td><td><b>${mesLabel.toUpperCase()}&nbsp;&nbsp;&nbsp;${anio}</b></td></tr>
    <tr><td class="lbl">Trabajador :</td><td>${n.empleados?.nombre || ''}</td></tr>
    <tr><td class="lbl">Cargo :</td><td>${n.empleados?.cargo || ''}</td></tr>
  </table>

  <table class="sec">
    <thead><tr><th></th><th>V. unit</th><th>Total a pagar $</th></tr></thead>
    <tbody>
      ${bonif > 0 ? `<tr><td>Bonificación</td><td></td><td class="r">${bonif.toFixed(2)}</td></tr>` : ''}
      <tr><td>BONOS MENSUALIZADOS</td><td></td><td class="r">${bonosMens.toFixed(2)}</td></tr>
      <tr><td>${horasAtraso} Atrasos</td><td class="r">${horasAtraso > 0 ? '-' + valHAtraso.toFixed(2) : '0.00'}</td><td class="r">${totalAtrasos.toFixed(2)}</td></tr>
      <tr><td>${horasExtra} Extras</td><td class="r">${valHExtra.toFixed(2)}</td><td class="r">${totalExtras.toFixed(2)}</td></tr>
      <tr class="sub-row"><td colspan="2">subtotal</td><td class="r">${subtotalBonos.toFixed(2)}</td></tr>
    </tbody>
  </table>

  <div class="desc-lbl">Descuentos</div>
  <table class="sec">
    <thead><tr><th></th><th>Total a pagar $</th></tr></thead>
    <tbody>
      <tr><td></td><td class="r">0.00</td></tr>
      <tr class="sub-row"><td>subtotal</td><td class="r"></td></tr>
      <tr class="tot-row"><td>TOTAL</td><td class="r">0.00</td></tr>
    </tbody>
  </table>
  <div style="text-align:right;font-weight:bold;font-size:11pt;margin-top:6px">${subtotalBonos.toFixed(2)}</div>
  <div class="conforme">Es Conforme ___________________________</div>
  <div class="gran-tot">${granTotal.toFixed(2)}</div>
</div>

</div>
<div style="text-align:center;margin:20px 0;padding:10px" class="no-print">
  <button onclick="window.print()" style="background:#2c1a4a;color:white;border:none;border-radius:8px;padding:12px 32px;font-size:14pt;cursor:pointer;font-weight:bold">
    🖨️ Imprimir Rol de Pago
  </button>
</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=960,height=680');
  w.document.write(html);
  w.document.close();
}

// ── Componente principal ─────────────────────────────────────
export default function TabNomina({ mobile }) {
  const now = new Date();
  const [mes,          setMes]          = useState(now.getMonth());
  const [anio,         setAnio]         = useState(now.getFullYear());
  const [empleados,    setEmpleados]    = useState([]);
  const [nomina,       setNomina]       = useState([]);
  const [movimientos,  setMovimientos]  = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [generando,    setGenerando]    = useState(false);
  const [yaGenerada,   setYaGenerada]   = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [modalMov,     setModalMov]     = useState(null);
  const [diasMap,      setDiasMap]      = useState({});

  // Form movimiento
  const formVacio = { tipo: 'anticipo', descripcion: '', valor: '', horas: '', valor_hora: '', fecha: now.toISOString().slice(0, 10) };
  const [formMov,     setFormMov]     = useState(formVacio);
  const [guardandoMov,setGuardandoMov]= useState(false);

  const periodoStr = `${anio}-${String(mes + 1).padStart(2, '0')}`;

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: emps }, { data: nom }, { data: movs }] = await Promise.all([
      supabase.from('empleados').select('*').eq('activo', true).is('deleted_at', null).order('nombre'),
      supabase.from('nomina')
        .select('*, empleados(nombre, cedula, cargo, porcentaje_iess_empleado)')
        .eq('periodo', periodoStr).order('created_at'),
      supabase.from('nomina_movimientos')
        .select('*').eq('periodo', periodoStr).order('fecha')
    ]);
    const lista = emps || [];
    setEmpleados(lista);
    setNomina(nom || []);
    setMovimientos(movs || []);
    setYaGenerada((nom || []).length > 0);
    setDiasMap(prev => {
      const dm = {};
      lista.forEach(e => { dm[e.id] = prev[e.id] || 30; });
      return dm;
    });
    setCargando(false);
  }, [periodoStr]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Helpers movimientos ──────────────────────────────────
  const movsEmp    = empId => movimientos.filter(m => m.empleado_id === empId);
  const sumaMov    = (empId, tipo) => movsEmp(empId).filter(m => m.tipo === tipo).reduce((s, m) => s + parseFloat(m.valor || 0), 0);

  // ── Agregar movimiento ───────────────────────────────────
  async function agregarMovimiento() {
    if (!formMov.valor || parseFloat(formMov.valor) <= 0) return;
    setGuardandoMov(true);
    await supabase.from('nomina_movimientos').insert({
      empleado_id:  modalMov.id,
      periodo:      periodoStr,
      tipo:         formMov.tipo,
      descripcion:  formMov.descripcion || null,
      valor:        parseFloat(formMov.valor),
      horas:        formMov.horas      ? parseFloat(formMov.horas)      : null,
      valor_hora:   formMov.valor_hora ? parseFloat(formMov.valor_hora) : null,
      fecha:        formMov.fecha
    });
    setFormMov(formVacio);
    await cargar();
    setGuardandoMov(false);
  }

  async function eliminarMov(id) {
    await supabase.from('nomina_movimientos').delete().eq('id', id);
    await cargar();
  }

  // ── Generar nómina ───────────────────────────────────────
  async function generarNomina() {
    if (yaGenerada && !window.confirm(`Ya existe nómina para ${MESES[mes]} ${anio}. ¿Regenerar?`)) return;
    if (yaGenerada) await supabase.from('nomina').delete().eq('periodo', periodoStr);
    setGenerando(true);

    const rows = empleados.map(emp => {
      const dias       = diasMap[emp.id] || 30;
      const sueldoProp = parseFloat(((emp.sueldo_base || 0) * dias / 30).toFixed(2));
      const pEmp       = (emp.porcentaje_iess_empleado || 9.45)  / 100;
      const pPat       = (emp.porcentaje_iess_patronal || 12.15) / 100;
      const iessEmp    = emp.afiliado_iess ? parseFloat((sueldoProp * pEmp).toFixed(2)) : 0;
      const iessPat    = emp.afiliado_iess ? parseFloat((sueldoProp * pPat).toFixed(2)) : 0;

      const anticipo      = parseFloat(sumaMov(emp.id, 'anticipo').toFixed(2));
      const comprasEmp    = parseFloat(sumaMov(emp.id, 'compra').toFixed(2));
      const bonif         = parseFloat(sumaMov(emp.id, 'bono').toFixed(2));
      const bonosMens     = parseFloat(sumaMov(emp.id, 'bono_mensualizado').toFixed(2));
      const totalExtras   = parseFloat(sumaMov(emp.id, 'extra').toFixed(2));
      const totalAtrasos  = parseFloat(sumaMov(emp.id, 'atraso').toFixed(2));

      const movExtras  = movsEmp(emp.id).filter(m => m.tipo === 'extra');
      const movAtrasos = movsEmp(emp.id).filter(m => m.tipo === 'atraso');
      const horasExtra    = movExtras.reduce((s,m)  => s + parseFloat(m.horas||0), 0);
      const valHExtra     = movExtras[0]  ? parseFloat(movExtras[0].valor_hora  || 0) : 0;
      const horasAtraso   = movAtrasos.reduce((s,m) => s + parseFloat(m.horas||0), 0);
      const valHAtraso    = movAtrasos[0] ? parseFloat(movAtrasos[0].valor_hora || 0) : 0;

      const sueldoNeto    = parseFloat((sueldoProp + bonif + bonosMens + totalExtras - totalAtrasos - anticipo - comprasEmp - iessEmp).toFixed(2));
      const costoPatronal = parseFloat((sueldoProp + bonif + bonosMens + totalExtras - totalAtrasos + iessPat).toFixed(2));

      return {
        empleado_id:         emp.id,
        periodo:             periodoStr,
        dias_trabajados:     dias,
        sueldo_base:         emp.sueldo_base,
        sueldo_prop:         sueldoProp,
        iess_empleado:       iessEmp,
        iess_patronal:       iessPat,
        decimo_tercero:      0,
        decimo_cuarto:       0,
        fondo_reserva:       0,
        vacaciones:          0,
        bonificacion:        bonif,
        bonos_mensualizados: bonosMens,
        horas_extra:         horasExtra,
        valor_hora_extra:    valHExtra,
        total_extras:        totalExtras,
        horas_atraso:        horasAtraso,
        valor_hora_atraso:   valHAtraso,
        total_atrasos:       totalAtrasos,
        anticipo,
        compras_empresa:     comprasEmp,
        sueldo_neto:         sueldoNeto,
        costo_patronal:      costoPatronal,
        estado:              'generado'
      };
    });

    const { error } = await supabase.from('nomina').insert(rows);
    if (error) alert('Error al generar: ' + error.message);
    else await cargar();
    setGenerando(false);
  }

  async function marcarPagado(id) {
    await supabase.from('nomina').update({ estado: 'pagado', fecha_pago: now.toISOString().slice(0, 10) }).eq('id', id);
    await cargar();
  }

  const totales = nomina.reduce((acc, n) => ({
    sueldos:  acc.sueldos  + (n.sueldo_prop    || 0),
    iessEmp:  acc.iessEmp  + (n.iess_empleado  || 0),
    iessPat:  acc.iessPat  + (n.iess_patronal  || 0),
    neto:     acc.neto     + (n.sueldo_neto    || 0),
    patronal: acc.patronal + (n.costo_patronal || 0),
  }), { sueldos: 0, iessEmp: 0, iessPat: 0, neto: 0, patronal: 0 });

  // ── Estilos ──────────────────────────────────────────────
  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inp = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };
  const field = (c = '#ddd') => ({
    width: '100%', padding: '6px 8px', borderRadius: '6px',
    border: `1.5px solid ${c}`, fontSize: '13px',
    boxSizing: 'border-box', outline: 'none'
  });
  const lbl = (c = '#777') => ({
    fontSize: '10px', color: c, marginBottom: '3px',
    fontWeight: '600', display: 'block'
  });

  const tipoMov = TIPOS_MOV.find(t => t.value === formMov.tipo) || TIPOS_MOV[0];
  const esHoras = formMov.tipo === 'extra' || formMov.tipo === 'atraso';

  return (
    <div>
      {/* ── Selector período + Generar ── */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={lbl()}>Mes</div>
          <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inp}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl()}>Año</div>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ ...inp, width: '80px' }} />
        </div>
        <button
          onClick={generarNomina}
          disabled={generando || cargando || empleados.length === 0}
          style={{
            background: (generando || cargando) ? '#aaa' : 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
            color: 'white', border: 'none', borderRadius: '8px',
            padding: '9px 18px', cursor: (generando || cargando) ? 'default' : 'pointer',
            fontSize: '13px', fontWeight: 'bold'
          }}>
          {generando ? 'Generando...' : yaGenerada ? '🔄 Regenerar nómina' : '⚡ Generar nómina'}
        </button>
      </div>

      {/* ── Totales generados ── */}
      {nomina.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(5,1fr)',
          gap: '8px', marginBottom: '10px'
        }}>
          {[
            { label: 'Sueldos',        valor: totales.sueldos,  color: '#2980b9' },
            { label: 'IESS empleados', valor: totales.iessEmp,  color: '#e74c3c' },
            { label: 'IESS patronal',  valor: totales.iessPat,  color: '#8e44ad' },
            { label: 'Neto a pagar',   valor: totales.neto,     color: '#27ae60' },
            { label: 'Costo empresa',  valor: totales.patronal, color: '#f39c12' },
          ].map(r => (
            <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '10px 8px' }}>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>{r.label}</div>
              <div style={{ fontSize: mobile ? '13px' : '16px', fontWeight: 'bold', color: r.color }}>
                ${r.valor.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lista empleados ── */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando...</div>
      ) : empleados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No tienes empleados activos. Regístralos en la pestaña Empleados.
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '8px', paddingLeft: '2px' }}>
            👥 Empleados — {MESES[mes]} {anio}
          </div>
          {empleados.map(emp => {
            const movEmp  = movsEmp(emp.id);
            const nomEmp  = nomina.find(n => n.empleado_id === emp.id);
            return (
              <div key={emp.id} style={{ ...card, borderLeft: `4px solid ${nomEmp ? '#27ae60' : '#4a2c7a'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#2c1a4a' }}>
                      👤 {emp.nombre}
                      <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal', marginLeft: '8px' }}>
                        {emp.cargo}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#555', marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '0 14px' }}>
                      <span>💵 Base: ${parseFloat(emp.sueldo_base||0).toFixed(2)}</span>
                      {movEmp.length > 0 && (
                        <span style={{ color: '#8e44ad' }}>
                          📋 {movEmp.length} movimiento{movEmp.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {nomEmp && (
                        <span style={{ color: '#27ae60', fontWeight: 'bold' }}>
                          ✅ Neto: ${parseFloat(nomEmp.sueldo_neto||0).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {movEmp.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', fontSize: '11px', marginTop: '4px' }}>
                        {TIPOS_MOV.map(t => {
                          const s = sumaMov(emp.id, t.value);
                          if (!s) return null;
                          return (
                            <span key={t.value} style={{ color: t.color }}>
                              {t.label.split(' ').slice(1).join(' ')}: ${s.toFixed(2)}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button onClick={() => { setModalMov(emp); setFormMov(formVacio); }} style={{
                      background: '#e3f2fd', border: '1.5px solid #90caf9',
                      borderRadius: '8px', padding: '7px 12px',
                      cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#1565c0'
                    }}>➕ Movimientos</button>
                    {nomEmp && (
                      <>
                        <button onClick={() => setModalDetalle(nomEmp)} style={{
                          background: '#f0f2f5', border: 'none', borderRadius: '8px',
                          padding: '7px 12px', cursor: 'pointer', fontSize: '12px'
                        }}>🔍 Detalle</button>
                        <button onClick={() => imprimirRol(nomEmp, MESES[mes], anio)} style={{
                          background: '#2c1a4a', color: 'white', border: 'none',
                          borderRadius: '8px', padding: '7px 12px',
                          cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                        }}>🖨️ Imprimir</button>
                        {nomEmp.estado !== 'pagado' && (
                          <button onClick={() => marcarPagado(nomEmp.id)} style={{
                            background: '#27ae60', color: 'white', border: 'none',
                            borderRadius: '8px', padding: '7px 12px',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                          }}>✅ Pagar</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── Modal: Movimientos por empleado ── */}
      {modalMov && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '720px', maxHeight: '90vh',
            overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
          }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h3 style={{ margin: 0, color: '#2c1a4a' }}>
                📋 Movimientos — {modalMov.nombre}
              </h3>
              <button onClick={() => setModalMov(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '6px',
                padding: '5px 10px', cursor: 'pointer', fontSize: '13px'
              }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
              {MESES[mes]} {anio} · Sueldo base: ${parseFloat(modalMov.sueldo_base||0).toFixed(2)}
            </div>

            {/* Formulario nuevo movimiento */}
            <div style={{
              background: '#f8f9fa', borderRadius: '12px',
              padding: '14px', marginBottom: '16px',
              border: '1.5px solid #e0e0e0'
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '10px' }}>
                + Agregar movimiento
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)',
                gap: '10px', marginBottom: '10px'
              }}>
                <div>
                  <label style={lbl()}>Tipo</label>
                  <select value={formMov.tipo}
                    onChange={e => setFormMov(f => ({ ...f, tipo: e.target.value, horas: '', valor_hora: '', valor: '' }))}
                    style={field()}>
                    {TIPOS_MOV.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl()}>Fecha</label>
                  <input type="date" value={formMov.fecha}
                    onChange={e => setFormMov(f => ({ ...f, fecha: e.target.value }))}
                    style={field()} />
                </div>
                <div>
                  <label style={lbl()}>Descripción (opcional)</label>
                  <input value={formMov.descripcion}
                    onChange={e => setFormMov(f => ({ ...f, descripcion: e.target.value }))}
                    placeholder="Ej: anticipo semana 1"
                    style={field()} />
                </div>

                {esHoras ? (
                  <>
                    <div>
                      <label style={lbl(tipoMov.color)}>Horas</label>
                      <input type="number" min={0} step="0.5" value={formMov.horas}
                        onChange={e => {
                          const h = e.target.value;
                          const vh = formMov.valor_hora;
                          setFormMov(f => ({
                            ...f, horas: h,
                            valor: h && vh ? (parseFloat(h) * parseFloat(vh)).toFixed(2) : f.valor
                          }));
                        }}
                        placeholder="0" style={field(tipoMov.color)} />
                    </div>
                    <div>
                      <label style={lbl(tipoMov.color)}>Valor/hora $</label>
                      <input type="number" min={0} step="0.01" value={formMov.valor_hora}
                        onChange={e => {
                          const vh = e.target.value;
                          const h  = formMov.horas;
                          setFormMov(f => ({
                            ...f, valor_hora: vh,
                            valor: h && vh ? (parseFloat(h) * parseFloat(vh)).toFixed(2) : f.valor
                          }));
                        }}
                        placeholder="0.00" style={field(tipoMov.color)} />
                    </div>
                    <div>
                      <label style={lbl('#2c1a4a')}>Total calculado $</label>
                      <input type="number" min={0} step="0.01" value={formMov.valor}
                        onChange={e => setFormMov(f => ({ ...f, valor: e.target.value }))}
                        placeholder="0.00" style={field('#2c1a4a')} />
                    </div>
                  </>
                ) : (
                  <div>
                    <label style={lbl(tipoMov.color)}>Valor $</label>
                    <input type="number" min={0} step="0.01" value={formMov.valor}
                      onChange={e => setFormMov(f => ({ ...f, valor: e.target.value }))}
                      placeholder="0.00" style={field(tipoMov.color)} />
                  </div>
                )}
              </div>
              <button
                onClick={agregarMovimiento}
                disabled={guardandoMov || !formMov.valor || parseFloat(formMov.valor) <= 0}
                style={{
                  background: (guardandoMov || !formMov.valor) ? '#aaa' : 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
                  color: 'white', border: 'none', borderRadius: '8px',
                  padding: '9px 22px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 'bold'
                }}>
                {guardandoMov ? 'Guardando...' : '+ Agregar'}
              </button>
            </div>

            {/* Lista movimientos del empleado */}
            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#555', marginBottom: '8px' }}>
              Registros del mes ({movsEmp(modalMov.id).length})
            </div>
            {movsEmp(modalMov.id).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#aaa', fontSize: '13px' }}>
                Aún no hay movimientos registrados para {MESES[mes]}
              </div>
            ) : (
              <>
                {movsEmp(modalMov.id).map(mov => {
                  const t = TIPOS_MOV.find(x => x.value === mov.tipo) || TIPOS_MOV[0];
                  return (
                    <div key={mov.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', borderRadius: '8px', marginBottom: '6px',
                      background: '#f8f9fa', borderLeft: `3px solid ${t.color}`
                    }}>
                      <div>
                        <span style={{ fontWeight: 'bold', fontSize: '12px', color: t.color }}>{t.label}</span>
                        {mov.descripcion && (
                          <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{mov.descripcion}</span>
                        )}
                        {mov.horas > 0 && (
                          <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>
                            {mov.horas}h × ${parseFloat(mov.valor_hora||0).toFixed(2)}
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: '#bbb', marginLeft: '8px' }}>{mov.fecha}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: t.color }}>
                          ${parseFloat(mov.valor||0).toFixed(2)}
                        </span>
                        <button onClick={() => eliminarMov(mov.id)} style={{
                          background: 'none', border: 'none',
                          color: '#e74c3c', cursor: 'pointer', fontSize: '16px'
                        }}>✕</button>
                      </div>
                    </div>
                  );
                })}
                {/* Resumen totales */}
                <div style={{
                  marginTop: '12px', background: '#f0f4ff',
                  borderRadius: '10px', padding: '12px',
                  border: '1.5px solid #c5cae9'
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#2c1a4a', marginBottom: '6px' }}>
                    Resumen acumulado
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: '12px' }}>
                    {TIPOS_MOV.map(t => {
                      const s = sumaMov(modalMov.id, t.value);
                      if (!s) return null;
                      return (
                        <span key={t.value} style={{ color: t.color }}>
                          {t.label}: <b>${s.toFixed(2)}</b>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Detalle nómina ── */}
      {modalDetalle && (() => {
        const n   = modalDetalle;
        const sp  = parseFloat(n.sueldo_prop || 0);
        const ant = parseFloat(n.anticipo    || 0);
        const com = parseFloat(n.compras_empresa || 0);
        const ies = parseFloat(n.iess_empleado  || 0);
        const bon = parseFloat(n.bonificacion        || 0);
        const bm  = parseFloat(n.bonos_mensualizados || 0);
        const tex = parseFloat(n.total_extras  || 0);
        const tat = parseFloat(n.total_atrasos || 0);
        const iessP = parseFloat(n.empleados?.porcentaje_iess_empleado || 9.45);
        const totalBasico = parseFloat((sp - ant - com - ies).toFixed(2));
        const totalBonos  = parseFloat((bon + bm + tex - tat).toFixed(2));
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}>
            <div style={{
              background: 'white', borderRadius: '16px', padding: '24px',
              width: '100%', maxWidth: '680px', maxHeight: '90vh',
              overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#2c1a4a' }}>📄 Rol de Pago</h3>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                    Embutidos y Jamones Candelaria — {MESES[mes]} {anio}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => imprimirRol(n, MESES[mes], anio)} style={{
                    background: '#2c1a4a', color: 'white', border: 'none',
                    borderRadius: '8px', padding: '7px 14px',
                    cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                  }}>🖨️ Imprimir</button>
                  <button onClick={() => setModalDetalle(null)} style={{
                    background: '#f0f2f5', border: 'none', borderRadius: '6px',
                    padding: '5px 10px', cursor: 'pointer', fontSize: '12px'
                  }}>✕</button>
                </div>
              </div>

              <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#2c1a4a' }}>{n.empleados?.nombre}</div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                Cédula: {n.empleados?.cedula || '—'} · {n.dias_trabajados} días
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                {/* Básico */}
                <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '10px', borderBottom: '1px solid #ddd', paddingBottom: '6px' }}>
                    📋 BÁSICO
                  </div>
                  <Fila label="Sueldo básico" valor={sp} />
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#e74c3c', margin: '8px 0 4px' }}>DESCUENTOS</div>
                  {ant > 0 && <Fila label="Anticipos"      valor={-ant} color="#e74c3c" />}
                  {com > 0 && <Fila label="Compras Empresa" valor={-com} color="#e74c3c" />}
                  <Fila label={`Aporte IESS ${iessP}%`} valor={-ies} color="#e74c3c" />
                  <div style={{ borderTop: '2px solid #2c1a4a', margin: '8px 0 4px' }} />
                  <Fila label="TOTAL" valor={totalBasico} color="#2c1a4a" bold />
                </div>

                {/* Bonos */}
                <div style={{ background: '#f0f7ff', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2c1a4a', marginBottom: '10px', borderBottom: '1px solid #c8dff5', paddingBottom: '6px' }}>
                    ⚡ BONOS / EXTRAS
                  </div>
                  {bon > 0 && <Fila label="Bonificación"       valor={bon} color="#27ae60" />}
                  {bm  > 0 && <Fila label="Bonos mensualiz."   valor={bm}  color="#27ae60" />}
                  {tex > 0 && <Fila label={`${n.horas_extra}h Extra × $${parseFloat(n.valor_hora_extra||0).toFixed(2)}`} valor={tex} color="#27ae60" />}
                  {tat > 0 && <Fila label={`${n.horas_atraso}h Atraso × $${parseFloat(n.valor_hora_atraso||0).toFixed(2)}`} valor={-tat} color="#e74c3c" />}
                  <div style={{ borderTop: '2px solid #2c1a4a', margin: '8px 0 4px' }} />
                  <Fila label="TOTAL" valor={totalBonos} color="#2c1a4a" bold />
                </div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg,#2c1a4a,#4a2c7a)',
                borderRadius: '12px', padding: '16px', marginTop: '14px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                  NETO TOTAL A PAGAR
                </div>
                <div style={{ color: '#a9dfbf', fontWeight: 'bold', fontSize: '24px' }}>
                  ${parseFloat(n.sueldo_neto || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#888', textAlign: 'center' }}>
                IESS patronal: ${parseFloat(n.iess_patronal||0).toFixed(2)} · Costo total empresa: ${parseFloat(n.costo_patronal||0).toFixed(2)}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
