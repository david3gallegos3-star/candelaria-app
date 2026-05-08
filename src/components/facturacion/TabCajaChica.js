// ============================================
// TabCajaChica.js
// Caja diaria — Gastos, Cobros, Entregas
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

export default function TabCajaChica({ mobile, currentUser }) {
  const hoy = new Date().toISOString().split('T')[0];

  const [vista,        setVista]        = useState('dia');
  const [fecha,        setFecha]        = useState(hoy);
  const [cajaId,       setCajaId]       = useState(null);
  const [responsable,  setResponsable]  = useState('');
  const [inicial,      setInicial]      = useState('');
  const [cierre,       setCierre]       = useState('');
  const [observaciones,setObservaciones]= useState('');
  const [gastos,       setGastos]       = useState([fGasto()]);
  const [entregas,     setEntregas]     = useState([fEntrega()]);
  const [cobros,       setCobros]       = useState([]);
  const [guardando,    setGuardando]    = useState(false);
  const [msgExito,     setMsgExito]     = useState('');
  const [mesSel,       setMesSel]       = useState(hoy.slice(0, 7));
  const [datosMes,     setDatosMes]     = useState([]);

  function fGasto() {
    return { proveedor:'', detalle:'', valor:'', ruc:'', numero_factura:'', pendiente_compra:false, expandido:false };
  }
  function fEntrega() { return { cantidad:'', recibe:'' }; }

  useEffect(() => { cargarDia(); }, [fecha]);
  useRealtime(['caja_chica', 'caja_entregas', 'caja_gastos', 'cobros', 'compras'], cargarDia);
  useEffect(() => { if (vista === 'mes') cargarMes(); }, [vista, mesSel]);

  async function cargarDia() {
    const { data: caja } = await supabase
      .from('caja_chica')
      .select('*')
      .eq('fecha', fecha)
      .maybeSingle();

    if (caja) {
      setCajaId(caja.id);
      setResponsable(caja.responsable || '');
      setInicial(caja.caja_inicial || '');
      setCierre(caja.caja_cierre || '');
      setObservaciones(caja.observaciones || '');

      const { data: g } = await supabase
        .from('caja_gastos').select('*').eq('caja_id', caja.id).order('orden');
      setGastos(g?.length
        ? g.map(x => ({ ...x, expandido: !!(x.ruc || x.numero_factura) }))
        : [fGasto()]);

      const { data: e } = await supabase
        .from('caja_entregas').select('*').eq('caja_id', caja.id).order('orden');
      setEntregas(e?.length ? e : [fEntrega()]);
    } else {
      setCajaId(null);
      setResponsable('');
      setInicial('');
      setCierre('');
      setObservaciones('');
      setGastos([fGasto()]);
      setEntregas([fEntrega()]);
    }

    const { data: c } = await supabase
      .from('cobros')
      .select('*, facturas(numero), clientes(nombre)')
      .eq('fecha', fecha);
    setCobros(c || []);
  }

  async function cargarMes() {
    const [y, m] = mesSel.split('-');
    const desde = `${y}-${m}-01`;
    const ultimoDia = new Date(parseInt(y), parseInt(m), 0).getDate();
    const hasta = `${y}-${m}-${String(ultimoDia).padStart(2,'0')}`;

    const [{ data: cajas }, { data: gastosM }, { data: cobrosM }] = await Promise.all([
      supabase.from('caja_chica').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'),
      supabase.from('caja_gastos').select('caja_id, valor'),
      supabase.from('cobros').select('fecha,monto,forma_pago').gte('fecha', desde).lte('fecha', hasta)
    ]);

    const gastosPorCaja = {};
    (gastosM || []).forEach(g => {
      gastosPorCaja[g.caja_id] = (gastosPorCaja[g.caja_id] || 0) + parseFloat(g.valor || 0);
    });

    const dias = {};
    (cajas || []).forEach(c => {
      dias[c.fecha] = {
        fecha: c.fecha,
        inicial: parseFloat(c.caja_inicial || 0),
        cierre: parseFloat(c.caja_cierre || 0),
        gastos: gastosPorCaja[c.id] || 0,
        efectivo: 0, transferencia: 0, cheque: 0
      };
    });
    (cobrosM || []).forEach(c => {
      if (!dias[c.fecha]) dias[c.fecha] = { fecha: c.fecha, inicial: 0, cierre: 0, gastos: 0, efectivo: 0, transferencia: 0, cheque: 0 };
      const f = c.forma_pago;
      if (dias[c.fecha][f] !== undefined) dias[c.fecha][f] += parseFloat(c.monto || 0);
    });

    setDatosMes(Object.values(dias).sort((a, b) => a.fecha.localeCompare(b.fecha)));
  }

  async function guardar() {
    setGuardando(true);
    let id = cajaId;
    const row = {
      fecha, responsable,
      caja_inicial: parseFloat(inicial) || 0,
      caja_cierre:  parseFloat(cierre)  || 0,
      observaciones
    };

    if (!id) {
      const { data } = await supabase.from('caja_chica').insert(row).select().single();
      id = data.id;
      setCajaId(id);
    } else {
      await supabase.from('caja_chica').update(row).eq('id', id);
    }

    // Gastos
    await supabase.from('caja_gastos').delete().eq('caja_id', id);
    const gastosOk = gastos.filter(g => g.proveedor || g.detalle || g.valor);
    if (gastosOk.length) {
      await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
        caja_id: id,
        proveedor: g.proveedor, ruc: g.ruc,
        numero_factura: g.numero_factura, detalle: g.detalle,
        valor: parseFloat(g.valor) || 0,
        pendiente_compra: g.pendiente_compra, orden: i
      })));

      for (const g of gastosOk.filter(g => g.pendiente_compra && g.proveedor)) {
        await supabase.from('compras').insert({
          proveedor_nombre: g.proveedor,
          proveedor_ruc:    g.ruc || '',
          numero_factura:   g.numero_factura || '',
          subtotal:         parseFloat(g.valor) || 0,
          descuento: 0, iva: 0,
          total:            parseFloat(g.valor) || 0,
          fecha, estado: 'pendiente', origen: 'caja_chica'
        });
      }
    }

    // Entregas
    await supabase.from('caja_entregas').delete().eq('caja_id', id);
    const entregasOk = entregas.filter(e => e.cantidad || e.recibe);
    if (entregasOk.length) {
      await supabase.from('caja_entregas').insert(entregasOk.map((e, i) => ({
        caja_id: id, cantidad: parseFloat(e.cantidad) || 0, recibe: e.recibe, orden: i
      })));
    }

    setGuardando(false);
    setMsgExito('✅ Caja guardada correctamente');
    setTimeout(() => setMsgExito(''), 3000);
  }

  function descargarDiaCSV() {
    const SEP = ';';
    const n = v => parseFloat(v||0).toFixed(2).replace('.',',');
    const rows = [];

    rows.push(['=== CAJA CHICA — ' + fecha + ' ===']);
    rows.push([]);
    rows.push(['RESPONSABLE', responsable, '', 'INICIAL', n(inicial), '', 'CIERRE', n(cierre)]);
    rows.push([]);

    rows.push(['--- GASTOS ---']);
    rows.push(['PROVEEDOR','DETALLE','N° FACTURA','VALOR','PENDIENTE COMPRA']);
    gastos.filter(g => g.proveedor||g.detalle||g.valor).forEach(g => {
      rows.push([g.proveedor||'', g.detalle||'', g.numero_factura||'', n(g.valor), g.pendiente_compra?'SÍ':'']);
    });
    rows.push(['','','TOTAL GASTOS', n(tGastos)]);
    rows.push([]);

    rows.push(['--- COBROS DEL DÍA ---']);
    rows.push(['TIPO','#FACTURA','CLIENTE','REFERENCIA','VALOR']);
    cobros.forEach(c => {
      rows.push([
        (c.forma_pago||'').toUpperCase(),
        c.facturas?.numero||'',
        c.clientes?.nombre||c.cliente_nombre||'',
        c.observaciones||'',
        n(c.monto)
      ]);
    });
    rows.push(['','','','TOTAL COBROS', n(tCobros)]);
    rows.push(['','','','Transferencias', n(tTransf)]);
    rows.push(['','','','Cheques', n(tCheq)]);
    rows.push(['','','','Efectivo', n(tEfect)]);
    rows.push([]);

    rows.push(['--- ENTREGAS A ADMINISTRACIÓN ---']);
    rows.push(['CANTIDAD','RECIBE']);
    entregas.filter(e=>e.cantidad||e.recibe).forEach(e => {
      rows.push([n(e.cantidad), e.recibe||'']);
    });
    rows.push(['TOTAL ENTREGADO', n(tEntregas)]);
    rows.push([]);
    rows.push(['OBSERVACIONES', observaciones||'']);

    const csv = [`sep=${SEP}`, ...rows.map(r => r.join(SEP))].join('\n');
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caja_chica_${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function imprimir() {
    const transf   = cobros.filter(c => c.forma_pago === 'transferencia');
    const cheques  = cobros.filter(c => c.forma_pago === 'cheque');
    const efectivo = cobros.filter(c => c.forma_pago === 'efectivo');
    const tTransf  = transf.reduce((s, c) => s + parseFloat(c.monto), 0);
    const tCheq    = cheques.reduce((s, c) => s + parseFloat(c.monto), 0);
    const tEfect   = efectivo.reduce((s, c) => s + parseFloat(c.monto), 0);
    const tGastos  = gastos.reduce((s, g) => s + parseFloat(g.valor || 0), 0);
    const tEntregas= entregas.reduce((s, e) => s + parseFloat(e.cantidad || 0), 0);
    const fmt = f => { if (!f) return ''; const [y,m,d]=f.split('-'); return `${d}/${m}/${y}`; };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;font-size:9pt;margin:16px;color:#111}
      .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      h2{margin:0;font-size:13pt}
      .logo{height:55px}
      .info{font-size:9pt;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:8pt}
      th{background:#e8e8e8;border:1px solid #999;padding:4px 6px;font-weight:bold;text-align:left}
      td{border:1px solid #bbb;padding:3px 6px}
      td.r{text-align:right}
      .sec{font-weight:bold;font-size:10pt;margin:10px 0 4px;border-bottom:2px solid #333;padding-bottom:2px}
      .totales{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
      .tot{border:1px solid #999;padding:5px 10px}
      .tlbl{font-size:8pt;font-weight:bold;color:#555}
      .tval{font-size:11pt;font-weight:bold}
      .obs{border:1px solid #999;padding:8px;min-height:50px;margin-top:8px;font-size:9pt}
      @media print{body{margin:6px}}
    </style></head><body>
    <div class="top">
      <div>
        <h2>CAJA EMBUTIDOS Y JAMONES CANDELARIA</h2>
        <div class="info">
          <b>RESPONSABLE:</b> ${responsable || '________________'} &nbsp;&nbsp;
          <b>FECHA:</b> ${fmt(fecha)}
        </div>
      </div>
      <img src="/LOGO_CANDELARIA_1.png" class="logo" onerror="this.style.display='none'"/>
    </div>

    <div class="sec">GASTOS</div>
    <table><thead><tr><th>PROVEEDOR</th><th>DETALLE</th><th>N° FACTURA</th><th>VALOR</th></tr></thead><tbody>
    ${gastos.filter(g=>g.proveedor||g.detalle||g.valor).map(g=>`
      <tr><td>${g.proveedor||''}</td><td>${g.detalle||''}</td><td>${g.numero_factura||''}</td><td class="r">${parseFloat(g.valor||0).toFixed(2)}</td></tr>
    `).join('')}
    <tr><td colspan="3" class="r"><b>TOTAL GASTOS</b></td><td class="r"><b>${tGastos.toFixed(2)}</b></td></tr>
    </tbody></table>

    <div class="sec">DETALLE COBROS TRANSFERENCIAS</div>
    <table><thead><tr><th>#FACT/APLICA</th><th>FECHA FACT</th><th>NUMERO TRANSF</th><th>CLIENTE</th><th>VALOR</th></tr></thead><tbody>
    ${transf.map(c=>`<tr><td>${c.facturas?.numero||''}</td><td>${fmt(c.fecha)}</td><td>${c.observaciones||''}</td><td>${c.clientes?.nombre||c.cliente_nombre||''}</td><td class="r">${parseFloat(c.monto).toFixed(2)}</td></tr>`).join('')}
    <tr><td colspan="4" class="r"><b>TOTAL</b></td><td class="r"><b>${tTransf.toFixed(2)}</b></td></tr>
    </tbody></table>

    <div class="sec">DETALLE COBROS CHEQUES</div>
    <table><thead><tr><th>#FACT/APLICA</th><th>FECHA FACT</th><th>NUMERO CHEQ</th><th>FECHA CHEQUE</th><th>CLIENTE</th><th>VALOR</th></tr></thead><tbody>
    ${cheques.map(c=>`<tr><td>${c.facturas?.numero||''}</td><td>${fmt(c.fecha)}</td><td>${c.observaciones||''}</td><td></td><td>${c.clientes?.nombre||c.cliente_nombre||''}</td><td class="r">${parseFloat(c.monto).toFixed(2)}</td></tr>`).join('')}
    <tr><td colspan="5" class="r"><b>TOTAL</b></td><td class="r"><b>${tCheq.toFixed(2)}</b></td></tr>
    </tbody></table>

    <div class="sec">DETALLE COBROS EFECTIVO</div>
    <table><thead><tr><th>#FACT/APLICA</th><th>FECHA FACT</th><th>CLIENTE</th><th>DETALLE</th><th>VALOR</th></tr></thead><tbody>
    ${efectivo.map(c=>`<tr><td>${c.facturas?.numero||''}</td><td>${fmt(c.fecha)}</td><td>${c.clientes?.nombre||c.cliente_nombre||''}</td><td>${c.observaciones||''}</td><td class="r">${parseFloat(c.monto).toFixed(2)}</td></tr>`).join('')}
    <tr><td colspan="4" class="r"><b>TOTAL</b></td><td class="r"><b>${tEfect.toFixed(2)}</b></td></tr>
    </tbody></table>

    <div class="sec">ENTREGA EFECTIVO / ADMINISTRACIÓN</div>
    <table><thead><tr><th>CANTIDAD</th><th>RECIBE</th><th>FIRMA</th></tr></thead><tbody>
    ${entregas.filter(e=>e.cantidad||e.recibe).map(e=>`<tr><td class="r">${parseFloat(e.cantidad||0).toFixed(2)}</td><td>${e.recibe||''}</td><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td></tr>`).join('')}
    <tr><td class="r"><b>${tEntregas.toFixed(2)}</b></td><td colspan="2"></td></tr>
    </tbody></table>

    <div class="totales">
      <div class="tot"><div class="tlbl">TOTAL TRANSFERENCIAS</div><div class="tval">${tTransf.toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">INICIAL</div><div class="tval">${parseFloat(inicial||0).toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">TOTAL CHEQUES</div><div class="tval">${tCheq.toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">CIERRE</div><div class="tval">${parseFloat(cierre||0).toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">TOTAL EFECTIVO</div><div class="tval">${tEfect.toFixed(2)}</div></div>
      <div></div>
    </div>
    <div class="obs"><b>OBSERVACIONES:</b> ${observaciones || ''}</div>
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  }

  const updG = (i, f, v) => setGastos(g => g.map((x, idx) => idx === i ? { ...x, [f]: v } : x));
  const updE = (i, f, v) => setEntregas(e => e.map((x, idx) => idx === i ? { ...x, [f]: v } : x));

  const tGastos   = gastos.reduce((s, g) => s + (parseFloat(g.valor) || 0), 0);
  const tEntregas = entregas.reduce((s, e) => s + (parseFloat(e.cantidad) || 0), 0);
  const tCobros   = cobros.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
  const tTransf   = cobros.filter(c => c.forma_pago === 'transferencia').reduce((s, c) => s + parseFloat(c.monto), 0);
  const tCheq     = cobros.filter(c => c.forma_pago === 'cheque').reduce((s, c) => s + parseFloat(c.monto), 0);
  const tEfect    = cobros.filter(c => c.forma_pago === 'efectivo').reduce((s, c) => s + parseFloat(c.monto), 0);

  const inp = { padding:'7px 10px', borderRadius:7, border:'1.5px solid #ddd', fontSize:'13px', outline:'none', boxSizing:'border-box' };
  const thS = { background:'#f0f2f5', padding:'6px 8px', fontWeight:'bold', fontSize:'10px', color:'#555', textAlign:'left', borderBottom:'2px solid #ddd' };
  const tdS = { padding:'5px 8px', borderBottom:'1px solid #f0f0f0', fontSize:'12px', verticalAlign:'middle' };

  // ── VISTA MES ─────────────────────────────────────────────
  if (vista === 'mes') {
    const totM = { efectivo:0, transferencia:0, cheque:0, gastos:0 };
    datosMes.forEach(d => { totM.efectivo+=d.efectivo; totM.transferencia+=d.transferencia; totM.cheque+=d.cheque; totM.gastos+=d.gastos; });
    const fmtF = f => { const [y,m,d]=f.split('-'); return `${parseInt(d)}/${parseInt(m)}/${y}`; };

    function imprimirMes() {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:9pt;margin:16px}
        .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        h2{margin:0;font-size:13pt}
        .logo{height:50px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th{background:#1a2a4a;color:white;padding:8px;font-size:9pt;text-align:right}
        th:first-child{text-align:left}
        td{border:1px solid #ddd;padding:5px 8px;font-size:8pt;text-align:right}
        td:first-child{text-align:left;font-weight:bold}
        tr:nth-child(even){background:#f9f9f9}
        .tot{background:#ffd700!important;font-weight:bold}
        @media print{body{margin:6px}}
      </style></head><body>
      <div class="top">
        <div>
          <h2>RESUMEN DIARIO — CAJA CANDELARIA</h2>
          <div style="font-size:9pt;margin-top:4px"><b>PERÍODO:</b> ${mesSel}</div>
        </div>
        <img src="/LOGO_CANDELARIA_1.png" class="logo" onerror="this.style.display='none'"/>
      </div>
      <table><thead><tr>
        <th>FECHA</th><th>EFECTIVO</th><th>TRANSFERENCIA</th><th>CHEQUE</th><th>GASTOS</th><th>INICIAL</th><th>CIERRE</th>
      </tr></thead><tbody>
      ${datosMes.map(d=>`<tr>
        <td>${fmtF(d.fecha)}</td>
        <td>${d.efectivo>0?d.efectivo.toFixed(2):'—'}</td>
        <td>${d.transferencia>0?d.transferencia.toFixed(2):'—'}</td>
        <td>${d.cheque>0?d.cheque.toFixed(2):'—'}</td>
        <td>${d.gastos>0?d.gastos.toFixed(2):'—'}</td>
        <td>${d.inicial>0?d.inicial.toFixed(2):'—'}</td>
        <td>${d.cierre>0?d.cierre.toFixed(2):'—'}</td>
      </tr>`).join('')}
      </tbody><tfoot>
        <tr class="tot">
          <td>TOTAL</td>
          <td>${totM.efectivo.toFixed(2)}</td>
          <td>${totM.transferencia.toFixed(2)}</td>
          <td>${totM.cheque.toFixed(2)}</td>
          <td>${totM.gastos.toFixed(2)}</td>
          <td>—</td><td>—</td>
        </tr>
      </tfoot></table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;
      const w = window.open('', '_blank', 'width=900,height=600');
      w.document.write(html);
      w.document.close();
    }

    function descargarMesCSV() {
      const SEP = ';';
      const enc = ['FECHA','EFECTIVO','TRANSFERENCIA','CHEQUE','GASTOS','INICIAL','CIERRE'];
      const rows = datosMes.map(d => [
        fmtF(d.fecha),
        d.efectivo.toFixed(2).replace('.',','),
        d.transferencia.toFixed(2).replace('.',','),
        d.cheque.toFixed(2).replace('.',','),
        d.gastos.toFixed(2).replace('.',','),
        d.inicial.toFixed(2).replace('.',','),
        d.cierre.toFixed(2).replace('.',',')
      ]);
      const totRow = ['TOTAL',
        totM.efectivo.toFixed(2).replace('.',','),
        totM.transferencia.toFixed(2).replace('.',','),
        totM.cheque.toFixed(2).replace('.',','),
        totM.gastos.toFixed(2).replace('.',','),
        '—','—'
      ];
      const csv = [`sep=${SEP}`, enc.join(SEP), ...rows.map(r=>r.join(SEP)), totRow.join(SEP)].join('\n');
      const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `caja_chica_${mesSel}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    return (
      <div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap',
          background:'white', borderRadius:12, padding:'12px 16px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <button onClick={() => setVista('dia')} style={{ ...inp, background:'#f0f2f5', border:'none', cursor:'pointer', fontWeight:'bold', padding:'7px 14px' }}>← Volver al día</button>
          <input type="month" value={mesSel} onChange={e => setMesSel(e.target.value)} style={inp} />
          <span style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'15px' }}>📊 Resumen mensual</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button onClick={imprimirMes} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'#1a2a4a', color:'white', cursor:'pointer', fontWeight:'bold', fontSize:'12px' }}>🖨️ Imprimir</button>
            <button onClick={descargarMesCSV} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'#27ae60', color:'white', cursor:'pointer', fontWeight:'bold', fontSize:'12px' }}>📥 Excel</button>
          </div>
        </div>

        <div style={{ background:'white', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1a2a4a', color:'white' }}>
                {['FECHA','EFECTIVO','TRANSFERENCIA','CHEQUE','GASTOS','INICIAL','CIERRE',''].map(h => (
                  <th key={h} style={{ padding:'10px 8px', fontSize:'11px', fontWeight:'bold', textAlign: h==='FECHA'?'left':'right', borderRight:'1px solid rgba(255,255,255,0.1)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datosMes.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:30, color:'#aaa' }}>Sin datos para este mes</td></tr>
              ) : datosMes.map((d, i) => (
                <tr key={d.fecha} style={{ background: i%2===0?'white':'#fafafa' }}>
                  <td style={{ ...tdS, fontWeight:'bold', color:'#1a5276' }}>{fmtF(d.fecha)}</td>
                  <td style={{ ...tdS, textAlign:'right', color:'#27ae60' }}>{d.efectivo>0 ? d.efectivo.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign:'right', color:'#2980b9' }}>{d.transferencia>0 ? d.transferencia.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign:'right', color:'#8e44ad' }}>{d.cheque>0 ? d.cheque.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign:'right', color:'#e74c3c' }}>{d.gastos>0 ? d.gastos.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign:'right' }}>{d.inicial>0 ? d.inicial.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign:'right' }}>{d.cierre>0 ? d.cierre.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <button onClick={() => { setFecha(d.fecha); setVista('dia'); }}
                      style={{ padding:'4px 12px', borderRadius:6, border:'none', background:'#2980b9',
                        color:'white', cursor:'pointer', fontWeight:'bold', fontSize:'11px' }}>
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:'#ffd700', fontWeight:'bold' }}>
                <td style={{ ...tdS, fontWeight:'bold' }}>TOTAL</td>
                <td style={{ ...tdS, textAlign:'right' }}>{totM.efectivo.toFixed(2)}</td>
                <td style={{ ...tdS, textAlign:'right' }}>{totM.transferencia.toFixed(2)}</td>
                <td style={{ ...tdS, textAlign:'right' }}>{totM.cheque.toFixed(2)}</td>
                <td style={{ ...tdS, textAlign:'right' }}>{totM.gastos.toFixed(2)}</td>
                <td style={{ ...tdS, textAlign:'right' }}>—</td>
                <td style={{ ...tdS, textAlign:'right' }}>—</td>
                <td style={{ ...tdS }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // ── VISTA DÍA ─────────────────────────────────────────────
  return (
    <div>
      {msgExito && (
        <div style={{ background:'#d4edda', color:'#155724', padding:'10px 14px', borderRadius:8, marginBottom:12, fontWeight:'bold' }}>
          {msgExito}
        </div>
      )}

      {/* Selector de fecha */}
      <div style={{ background:'white', borderRadius:12, padding:'12px 16px', marginBottom:12,
        display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <span style={{ fontWeight:'bold', color:'#555', fontSize:'12px' }}>📅 Fecha:</span>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
        {cajaId && <span style={{ fontSize:'11px', color:'#27ae60', fontWeight:'bold' }}>✅ Caja registrada</span>}
        {!cajaId && <span style={{ fontSize:'11px', color:'#e67e22', fontWeight:'bold' }}>⚠️ Sin registrar</span>}
        <button onClick={() => { setVista('mes'); cargarMes(); }}
          style={{ marginLeft:'auto', padding:'7px 16px', borderRadius:8, border:'none',
            background:'#1a2a4a', color:'white', cursor:'pointer', fontWeight:'bold', fontSize:'12px' }}>
          📊 Ver mes
        </button>
      </div>

      {/* Responsable + Inicial + Cierre */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12,
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', display:'grid',
        gridTemplateColumns: mobile ? '1fr' : '2fr 1fr 1fr', gap:12 }}>
        <div>
          <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555', display:'block', marginBottom:4 }}>RESPONSABLE</label>
          <input value={responsable} onChange={e => setResponsable(e.target.value)}
            placeholder="Nombre del responsable..." style={{ ...inp, width:'100%' }} />
        </div>
        <div>
          <label style={{ fontSize:'11px', fontWeight:'bold', color:'#27ae60', display:'block', marginBottom:4 }}>CAJA INICIAL ($)</label>
          <input type="number" value={inicial} onChange={e => setInicial(e.target.value)}
            placeholder="0.00" style={{ ...inp, width:'100%', borderColor:'#27ae60' }} />
        </div>
        <div>
          <label style={{ fontSize:'11px', fontWeight:'bold', color:'#e74c3c', display:'block', marginBottom:4 }}>CAJA CIERRE ($)</label>
          <input type="number" value={cierre} onChange={e => setCierre(e.target.value)}
            placeholder="0.00" style={{ ...inp, width:'100%', borderColor:'#e74c3c' }} />
        </div>
      </div>

      {/* GASTOS */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          💸 GASTOS
          <span style={{ fontSize:'13px', color:'#e74c3c', fontWeight:'bold' }}>Total: ${tGastos.toFixed(2)}</span>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            <th style={thS}>PROVEEDOR</th>
            <th style={thS}>DETALLE</th>
            <th style={{ ...thS, width:100 }}>VALOR ($)</th>
            <th style={{ ...thS, width:70, textAlign:'center' }}>PENDIENTE</th>
            <th style={{ ...thS, width:70, textAlign:'center' }}>+INFO / 🗑</th>
          </tr></thead>
          <tbody>
            {gastos.map((g, i) => (
              <React.Fragment key={i}>
                <tr>
                  <td style={tdS}>
                    <input value={g.proveedor} onChange={e => updG(i,'proveedor',e.target.value)}
                      placeholder="Proveedor" style={{ ...inp, width:'100%', padding:'4px 8px' }} />
                  </td>
                  <td style={tdS}>
                    <input value={g.detalle} onChange={e => updG(i,'detalle',e.target.value)}
                      placeholder="Detalle gasto" style={{ ...inp, width:'100%', padding:'4px 8px' }} />
                  </td>
                  <td style={tdS}>
                    <input type="number" value={g.valor} onChange={e => updG(i,'valor',e.target.value)}
                      placeholder="0.00" style={{ ...inp, width:'100%', padding:'4px 8px' }} />
                  </td>
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <input type="checkbox" checked={g.pendiente_compra}
                      onChange={e => updG(i,'pendiente_compra',e.target.checked)}
                      title="Marcar pendiente en Compras"
                      style={{ width:16, height:16, cursor:'pointer' }} />
                  </td>
                  <td style={{ ...tdS, textAlign:'center' }}>
                    <button onClick={() => updG(i,'expandido',!g.expandido)}
                      title="Agregar RUC / N° Factura"
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:'14px', marginRight:4 }}>
                      {g.expandido ? '▲' : '📋'}
                    </button>
                    <button onClick={() => setGastos(gs => gs.filter((_,idx) => idx !== i))}
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#e74c3c' }}>🗑</button>
                  </td>
                </tr>
                {g.expandido && (
                  <tr>
                    <td colSpan={5} style={{ ...tdS, background:'#f8f9fa', padding:'10px 12px' }}>
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                        <div style={{ flex:1, minWidth:130 }}>
                          <label style={{ fontSize:'10px', fontWeight:'bold', color:'#888', display:'block', marginBottom:3 }}>RUC PROVEEDOR</label>
                          <input value={g.ruc||''} onChange={e => updG(i,'ruc',e.target.value)}
                            placeholder="1234567890001" style={{ ...inp, width:'100%', padding:'4px 8px' }} />
                        </div>
                        <div style={{ flex:1, minWidth:160 }}>
                          <label style={{ fontSize:'10px', fontWeight:'bold', color:'#888', display:'block', marginBottom:3 }}>N° FACTURA</label>
                          <input value={g.numero_factura||''} onChange={e => updG(i,'numero_factura',e.target.value)}
                            placeholder="001-001-000000001" style={{ ...inp, width:'100%', padding:'4px 8px' }} />
                        </div>
                        {g.pendiente_compra && (
                          <div style={{ background:'#fff3cd', color:'#856404', padding:'5px 12px',
                            borderRadius:8, fontSize:'11px', fontWeight:'bold' }}>
                            ⏳ Aparecerá en Compras como pendiente
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <button onClick={() => setGastos(g => [...g, fGasto()])}
          style={{ marginTop:8, padding:'6px 16px', borderRadius:8, border:'2px dashed #ddd',
            background:'transparent', cursor:'pointer', color:'#555', fontSize:'12px', fontWeight:'bold' }}>
          + Agregar gasto
        </button>
      </div>

      {/* COBROS DEL DÍA */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          💵 COBROS DEL DÍA
          <span style={{ fontSize:'13px', color:'#27ae60', fontWeight:'bold' }}>Total: ${tCobros.toFixed(2)}</span>
        </div>

        {cobros.length === 0 ? (
          <div style={{ textAlign:'center', padding:'24px', color:'#aaa', fontSize:'12px', background:'#f9f9f9', borderRadius:8 }}>
            Sin cobros registrados para este día.<br />
            <span style={{ fontSize:'11px' }}>Regístralos en <b>Por cobrar</b> y aparecerán aquí automáticamente.</span>
          </div>
        ) : (
          ['transferencia','cheque','efectivo'].map(tipo => {
            const lista = cobros.filter(c => c.forma_pago === tipo);
            if (!lista.length) return null;
            const iconos = { transferencia:'🏦', cheque:'📝', efectivo:'💵' };
            const totalTipo = lista.reduce((s, c) => s + parseFloat(c.monto), 0);
            return (
              <div key={tipo} style={{ marginBottom:12 }}>
                <div style={{ fontSize:'11px', fontWeight:'bold', color:'#555', marginBottom:4,
                  display:'flex', justifyContent:'space-between' }}>
                  <span>{iconos[tipo]} {tipo.toUpperCase()}</span>
                  <span style={{ color:'#1a5276' }}>${totalTipo.toFixed(2)}</span>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>
                    <th style={thS}>#FACTURA</th>
                    <th style={thS}>CLIENTE</th>
                    <th style={thS}>REFERENCIA</th>
                    <th style={{ ...thS, textAlign:'right' }}>VALOR</th>
                  </tr></thead>
                  <tbody>
                    {lista.map(c => (
                      <tr key={c.id}>
                        <td style={tdS}>{c.facturas?.numero || '—'}</td>
                        <td style={tdS}>{c.clientes?.nombre || c.cliente_nombre || '—'}</td>
                        <td style={{ ...tdS, color:'#888' }}>{c.observaciones || '—'}</td>
                        <td style={{ ...tdS, textAlign:'right', fontWeight:'bold', color:'#27ae60' }}>
                          ${parseFloat(c.monto).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}

        {tCobros > 0 && (
          <div style={{ display:'flex', gap:16, padding:'8px 12px', background:'#f0f9f0',
            borderRadius:8, marginTop:6, fontSize:'12px', fontWeight:'bold', flexWrap:'wrap' }}>
            <span>🏦 Transf: ${tTransf.toFixed(2)}</span>
            <span>📝 Cheques: ${tCheq.toFixed(2)}</span>
            <span>💵 Efectivo: ${tEfect.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* ENTREGAS A ADMINISTRACIÓN */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          📤 ENTREGA EFECTIVO / ADMINISTRACIÓN
          <span style={{ fontSize:'13px', color:'#8e44ad', fontWeight:'bold' }}>Total: ${tEntregas.toFixed(2)}</span>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            <th style={{ ...thS, width:160 }}>CANTIDAD ($)</th>
            <th style={thS}>RECIBE</th>
            <th style={{ ...thS, width:50 }}></th>
          </tr></thead>
          <tbody>
            {entregas.map((e, i) => (
              <tr key={i}>
                <td style={tdS}>
                  <input type="number" value={e.cantidad} onChange={ev => updE(i,'cantidad',ev.target.value)}
                    placeholder="0.00" style={{ ...inp, width:'100%', padding:'4px 8px' }} />
                </td>
                <td style={tdS}>
                  <input value={e.recibe} onChange={ev => updE(i,'recibe',ev.target.value)}
                    placeholder="Nombre de quien recibe" style={{ ...inp, width:'100%', padding:'4px 8px' }} />
                </td>
                <td style={{ ...tdS, textAlign:'center' }}>
                  <button onClick={() => setEntregas(es => es.filter((_,idx) => idx !== i))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#e74c3c', fontSize:'16px' }}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setEntregas(e => [...e, fEntrega()])}
          style={{ marginTop:8, padding:'6px 16px', borderRadius:8, border:'2px dashed #ddd',
            background:'transparent', cursor:'pointer', color:'#555', fontSize:'12px', fontWeight:'bold' }}>
          + Agregar entrega
        </button>
      </div>

      {/* OBSERVACIONES */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555', display:'block', marginBottom:6 }}>OBSERVACIONES</label>
        <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
          rows={3} placeholder="Notas del día..."
          style={{ ...inp, width:'100%', resize:'vertical', fontFamily:'inherit' }} />
      </div>

      {/* Resumen + Botones */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
        display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:20, flex:1, flexWrap:'wrap' }}>
          {[
            { label:'COBROS',    val: tCobros,   color:'#27ae60' },
            { label:'GASTOS',    val: tGastos,   color:'#e74c3c' },
            { label:'ENTREGADO', val: tEntregas, color:'#8e44ad' },
          ].map(x => (
            <div key={x.label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:'10px', color:'#888', fontWeight:700 }}>{x.label}</div>
              <div style={{ fontSize:'20px', fontWeight:'bold', color:x.color }}>${x.val.toFixed(2)}</div>
            </div>
          ))}
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'10px', color:'#888', fontWeight:700 }}>INICIAL → CIERRE</div>
            <div style={{ fontSize:'16px', fontWeight:'bold', color:'#1a5276' }}>
              ${parseFloat(inicial||0).toFixed(2)} → ${parseFloat(cierre||0).toFixed(2)}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={descargarDiaCSV}
            style={{ padding:'10px 16px', borderRadius:8, border:'none', background:'#27ae60',
              color:'white', cursor:'pointer', fontWeight:'bold', fontSize:'13px' }}>
            📥 Excel
          </button>
          <button onClick={imprimir}
            style={{ padding:'10px 20px', borderRadius:8, border:'none', background:'#1a2a4a',
              color:'white', cursor:'pointer', fontWeight:'bold', fontSize:'13px' }}>
            🖨️ Imprimir
          </button>
          <button onClick={guardar} disabled={guardando}
            style={{ padding:'10px 28px', borderRadius:8, border:'none',
              background: guardando ? '#95a5a6' : '#27ae60',
              color:'white', cursor: guardando ? 'not-allowed' : 'pointer',
              fontWeight:'bold', fontSize:'13px' }}>
            {guardando ? '⏳...' : '💾 Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
