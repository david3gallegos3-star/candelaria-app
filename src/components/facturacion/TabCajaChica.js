// ============================================
// TabCajaChica.js
// Caja diaria — Gastos, Cobros, Entregas
// ============================================
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { generarAsientoCierre, getCuentasModulos } from '../../utils/asientosContables';

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
  const [cobros,          setCobros]          = useState([]);
  const [ventasEfectivo,  setVentasEfectivo]  = useState([]);
  const [comprasEfect,    setComprasEfect]    = useState([]);
  const [pagosEfect,      setPagosEfect]      = useState([]);
  const [adelantosNomina, setAdelantosNomina] = useState([]);
  const [serviciosBasicosCaja, setServiciosBasicosCaja] = useState([]);
  const [guardando,       setGuardando]       = useState(false);
  const [estadoAutosave,  setEstadoAutosave]  = useState('idle'); // idle | guardando | guardado
  const [guardadoHoy,  setGuardadoHoy]  = useState(false);
  const [mesSel,       setMesSel]       = useState(hoy.slice(0, 7));
  const [datosMes,     setDatosMes]     = useState([]);
  const [provSugs,     setProvSugs]     = useState([]);
  const [serviciosBasicosCatalogo, setServiciosBasicosCatalogo] = useState([]);
  const [provFoco,     setProvFoco]     = useState(null);
  const listo       = useRef(false);
  const autoSaveRef = useRef(null);

  function fGasto() {
    return { proveedor:'', detalle:'', valor:'', ruc:'', numero_factura:'', pendiente_compra:false, expandido:false, es_personal:false };
  }
  function fEntrega() { return { cantidad:'', recibe:'' }; }

  useEffect(() => { listo.current = false; setEstadoAutosave('idle'); cargarDia(); }, [fecha]);
  useEffect(() => { cargarProveedores(); }, []);
  useEffect(() => { cargarServiciosBasicos(); }, []);
  useRealtime(['cobros', 'compras', 'facturas', 'pagos_compras'], cargarSoloLectura);
  useEffect(() => { if (vista === 'mes') cargarMes(); }, [vista, mesSel]);

  // Autosave en Supabase — 600ms después del último cambio
  useEffect(() => {
    if (!listo.current || guardadoHoy) return;
    clearTimeout(autoSaveRef.current);
    setEstadoAutosave('pendiente');
    autoSaveRef.current = setTimeout(() => autoGuardarBorrador(), 600);
  }, [responsable, inicial, cierre, observaciones, gastos, entregas, guardadoHoy]);

  async function autoGuardarBorrador() {
    if (guardadoHoy) return;
    setEstadoAutosave('guardando');
    let id = cajaId;
    const row = {
      fecha, responsable,
      caja_inicial: parseFloat(inicial) || 0,
      caja_cierre:  parseFloat(cierre)  || 0,
      observaciones,
    };
    if (!id) {
      const { data } = await supabase.from('caja_chica').insert(row).select().single();
      if (data?.id) { id = data.id; setCajaId(data.id); }
    } else {
      await supabase.from('caja_chica').update(row).eq('id', id);
    }
    if (!id) { setEstadoAutosave('error'); return; }

    await supabase.from('caja_gastos').delete().eq('caja_id', id)
      .is('origen_nomina_movimiento_id', null).is('origen_pago_personal_id', null);
    const gastosOk = gastos.filter(g => g.proveedor || g.detalle || g.valor);
    if (gastosOk.length) {
      await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
        caja_id: id, proveedor: g.proveedor, ruc: g.ruc,
        numero_factura: g.numero_factura, detalle: g.detalle,
        valor: parseFloat(g.valor) || 0,
        pendiente_compra: g.pendiente_compra, orden: i,
        es_personal: g.es_personal || false,
      })));
    }

    await supabase.from('caja_entregas').delete().eq('caja_id', id);
    const entregasOk = entregas.filter(e => e.cantidad || e.recibe);
    if (entregasOk.length) {
      await supabase.from('caja_entregas').insert(entregasOk.map((e, i) => ({
        caja_id: id, cantidad: parseFloat(e.cantidad) || 0, recibe: e.recibe, orden: i,
      })));
    }
    setEstadoAutosave('guardado');
  }

  async function cargarServiciosBasicos() {
    const { data } = await supabase
      .from('pagos_fijos_personales').select('nombre, concepto, empresa').eq('es_servicio_basico', true);
    setServiciosBasicosCatalogo(data || []);
  }

  async function cargarProveedores() {
    const [{ data: provs }, { data: historial }] = await Promise.all([
      supabase.from('proveedores').select('nombre, ruc').order('nombre'),
      supabase.from('caja_gastos').select('proveedor, ruc').not('proveedor', 'is', null),
    ]);
    const mapa = {};
    (provs || []).forEach(p => { if (p.nombre) mapa[p.nombre.toLowerCase()] = { nombre: p.nombre, ruc: p.ruc || '' }; });
    (historial || []).forEach(h => { if (h.proveedor && !mapa[h.proveedor.toLowerCase()]) mapa[h.proveedor.toLowerCase()] = { nombre: h.proveedor, ruc: h.ruc || '' }; });
    setProvSugs(Object.values(mapa).sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

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
      setGuardadoHoy(false);

      const { data: g } = await supabase
        .from('caja_gastos').select('*').eq('caja_id', caja.id)
        .is('origen_nomina_movimiento_id', null).is('origen_pago_personal_id', null).order('orden');
      setGastos(g?.length
        ? g.map(x => ({ ...x, expandido: !!(x.ruc || x.numero_factura) }))
        : [fGasto()]);

      const { data: an } = await supabase
        .from('caja_gastos').select('*').eq('caja_id', caja.id).not('origen_nomina_movimiento_id', 'is', null).order('orden');
      setAdelantosNomina(an || []);

      const { data: sb } = await supabase
        .from('caja_gastos').select('*').eq('caja_id', caja.id).not('origen_pago_personal_id', 'is', null).order('orden');
      setServiciosBasicosCaja(sb || []);

      const { data: e } = await supabase
        .from('caja_entregas').select('*').eq('caja_id', caja.id).order('orden');
      setEntregas(e?.length ? e : [fEntrega()]);
    } else {
      setCajaId(null);
      setGuardadoHoy(false);
      setResponsable('');
      setCierre('');
      setObservaciones('');
      setGastos([fGasto()]);
      setEntregas([fEntrega()]);
      setAdelantosNomina([]);
      setServiciosBasicosCaja([]);
      const { data: anterior } = await supabase
        .from('caja_chica')
        .select('caja_cierre')
        .lt('fecha', fecha)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      setInicial(anterior?.caja_cierre || '');
    }

    await cargarSoloLectura();
    listo.current = true;
  }

  // Datos de solo lectura (vienen de otras pantallas: Facturación, Compras).
  // Se refrescan en segundo plano (realtime / volver a la pestaña) sin tocar
  // los campos editables del formulario (gastos, entregas, responsable, etc.)
  // para no pisar cambios sin guardar.
  async function cargarSoloLectura() {
    const { data: c } = await supabase
      .from('cobros')
      .select('*, facturas(numero), clientes(nombre)')
      .eq('fecha', fecha);
    setCobros(c || []);

    // Ventas de contado en efectivo ese día (facturas/NV pagadas directo, no crédito)
    const { data: ve } = await supabase
      .from('facturas')
      .select('id, numero, total, clientes(nombre)')
      .eq('forma_pago', 'efectivo')
      .neq('estado', 'anulada')
      .gte('created_at', fecha + 'T00:00:00')
      .lte('created_at', fecha + 'T23:59:59');
    setVentasEfectivo(ve || []);

    // Compras pagadas en efectivo ese día (directas, no crédito)
    const { data: ce } = await supabase
      .from('compras')
      .select('id, proveedor_nombre, total, es_personal, fecha')
      .eq('fecha', fecha)
      .eq('forma_pago', 'efectivo');
    setComprasEfect(ce || []);

    // Pagos de facturas en crédito hechos en efectivo ese día
    const { data: pe } = await supabase
      .from('pagos_compras')
      .select('id, monto, notas, fecha_pago, compra_id, compras(proveedor_nombre, es_personal)')
      .eq('fecha_pago', fecha)
      .eq('forma_pago', 'efectivo')
      .neq('tipo', 'devolucion');
    setPagosEfect(pe || []);
  }

  async function cargarMes() {
    const [y, m] = mesSel.split('-');
    const desde = `${y}-${m}-01`;
    const ultimoDia = new Date(parseInt(y), parseInt(m), 0).getDate();
    const hasta = `${y}-${m}-${String(ultimoDia).padStart(2,'0')}`;

    const [{ data: cajas }, { data: gastosM }, { data: cobrosM }, { data: entregasM }, { data: comprasM }, { data: pagosM }, { data: ventasM }] = await Promise.all([
      supabase.from('caja_chica').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'),
      supabase.from('caja_gastos').select('caja_id, valor'),
      supabase.from('cobros').select('fecha,monto,forma_pago').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('caja_entregas').select('caja_id, cantidad'),
      // Compras pagadas en efectivo en el mes (no van por caja_id, son directas)
      supabase.from('compras').select('fecha, total').eq('forma_pago', 'efectivo').gte('fecha', desde).lte('fecha', hasta),
      // Pagos de facturas en crédito hechos en efectivo en el mes
      supabase.from('pagos_compras').select('fecha_pago, monto').eq('forma_pago', 'efectivo').neq('tipo', 'devolucion').gte('fecha_pago', desde).lte('fecha_pago', hasta),
      // Ventas de contado en efectivo en el mes (facturas/NV pagadas directo, no crédito)
      supabase.from('facturas').select('created_at, total').eq('forma_pago', 'efectivo').neq('estado', 'anulada')
        .gte('created_at', desde + 'T00:00:00').lte('created_at', hasta + 'T23:59:59'),
    ]);

    const gastosPorCaja   = {};
    const entregasPorCaja = {};
    (gastosM  || []).forEach(g => { gastosPorCaja[g.caja_id]   = (gastosPorCaja[g.caja_id]   || 0) + parseFloat(g.valor    || 0); });
    (entregasM|| []).forEach(e => { entregasPorCaja[e.caja_id] = (entregasPorCaja[e.caja_id] || 0) + parseFloat(e.cantidad || 0); });

    const comprasEfPorFecha = {};
    (comprasM || []).forEach(c => { comprasEfPorFecha[c.fecha] = (comprasEfPorFecha[c.fecha] || 0) + parseFloat(c.total || 0); });
    const pagosEfPorFecha = {};
    (pagosM   || []).forEach(p => { pagosEfPorFecha[p.fecha_pago] = (pagosEfPorFecha[p.fecha_pago] || 0) + parseFloat(p.monto || 0); });
    const ventasEfPorFecha = {};
    (ventasM  || []).forEach(f => {
      const fecha = (f.created_at || '').split('T')[0];
      ventasEfPorFecha[fecha] = (ventasEfPorFecha[fecha] || 0) + parseFloat(f.total || 0);
    });

    const vacio = fecha => ({ fecha, inicial:0, cierre:0, gastos:0, deposito:0, efectivo:0, transferencia:0, cheque:0, comprasEf:0, pagosEf:0 });

    const dias = {};
    (cajas || []).forEach(c => {
      dias[c.fecha] = {
        ...vacio(c.fecha),
        inicial: parseFloat(c.caja_inicial || 0),
        cierre:  parseFloat(c.caja_cierre  || 0),
        gastos:   gastosPorCaja[c.id]   || 0,
        deposito: entregasPorCaja[c.id] || 0,
      };
    });
    (cobrosM || []).forEach(c => {
      if (!dias[c.fecha]) dias[c.fecha] = vacio(c.fecha);
      const f = c.forma_pago;
      if (dias[c.fecha][f] !== undefined) dias[c.fecha][f] += parseFloat(c.monto || 0);
    });
    Object.keys(comprasEfPorFecha).forEach(fecha => {
      if (!dias[fecha]) dias[fecha] = vacio(fecha);
      dias[fecha].comprasEf = comprasEfPorFecha[fecha];
    });
    Object.keys(pagosEfPorFecha).forEach(fecha => {
      if (!dias[fecha]) dias[fecha] = vacio(fecha);
      dias[fecha].pagosEf = pagosEfPorFecha[fecha];
    });
    Object.keys(ventasEfPorFecha).forEach(fecha => {
      if (!dias[fecha]) dias[fecha] = vacio(fecha);
      // Efectivo del día = cobros de CxC en efectivo + ventas de contado en efectivo
      dias[fecha].efectivo += ventasEfPorFecha[fecha];
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
    await supabase.from('caja_gastos').delete().eq('caja_id', id)
      .is('origen_nomina_movimiento_id', null).is('origen_pago_personal_id', null);
    const gastosOk = gastos.filter(g => g.proveedor || g.detalle || g.valor);
    if (gastosOk.length) {
      await supabase.from('caja_gastos').insert(gastosOk.map((g, i) => ({
        caja_id: id,
        proveedor: g.proveedor, ruc: g.ruc,
        numero_factura: g.numero_factura, detalle: g.detalle,
        valor: parseFloat(g.valor) || 0,
        pendiente_compra: g.pendiente_compra, orden: i,
        es_personal: g.es_personal || false,
      })));

      for (const g of gastosOk.filter(g => g.pendiente_compra && g.proveedor)) {
        const total = parseFloat(g.valor) || 0;
        await supabase.from('compras').insert({
          proveedor_nombre:  g.proveedor,
          proveedor_ruc:     g.ruc     || null,
          numero_factura:    g.numero_factura || null,
          fecha,
          tiene_factura:     !!(g.numero_factura),
          recordar_factura:  !(g.numero_factura),
          subtotal:          total,
          descuento:         null,
          iva:               0,
          total,
          estado:            'pendiente',
          origen:            'caja_chica',
          es_personal:       false,
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

    const cierreGuardado = parseFloat(cierre) || 0;
    setGuardando(false);
    getCuentasModulos().then(({ cuentas }) => {
      if (cuentas?.caja_chica_id) {
        generarAsientoCierre({
          id, fecha,
          total_ingresos: parseFloat(inicial) || 0,
          total_gastos:   tGastos + tAdelantosEf + tServiciosBasicosEf,
          total_deposito: tEntregas,
          saldo_final:    cierreGuardado,
        }, cuentas).catch(console.error);
      }
    }).catch(console.error);

    // Resetear formulario — inicial = cierre guardado
    setInicial(cierreGuardado);
    setCierre('');
    setObservaciones('');
    setGastos([fGasto()]);
    setEntregas([fEntrega()]);
    setGuardadoHoy(true);
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

    rows.push(['--- COMPRAS / PAGOS EN EFECTIVO ---']);
    rows.push(['PROVEEDOR','TIPO','VALOR']);
    comprasEfect.forEach(c => {
      rows.push([c.proveedor_nombre||'', c.es_personal ? 'Compra personal' : 'Compra MP — pago directo', n(c.total)]);
    });
    pagosEfect.forEach(p => {
      rows.push([p.compras?.proveedor_nombre||'', (p.compras?.es_personal ? 'Compra personal' : 'Compra MP') + ' — abono factura crédito', n(p.monto)]);
    });
    rows.push(['','TOTAL COMPRAS/PAGOS EFECTIVO', n(tComprasEf + tPagosEf)]);
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
    ventasEfectivo.forEach(f => {
      rows.push(['EFECTIVO', f.numero||'', f.clientes?.nombre||'CONSUMIDOR FINAL', 'Venta de contado', n(f.total)]);
    });
    rows.push(['','','','TOTAL COBROS', n(tCobros)]);
    rows.push(['','','','Transferencias', n(tTransf)]);
    rows.push(['','','','Cheques', n(tCheq)]);
    rows.push(['','','','Efectivo', n(tEfect)]);
    rows.push([]);

    rows.push(['--- DEPÓSITO AL BANCO ---']);
    rows.push(['MONTO','BANCO / REFERENCIA']);
    entregas.filter(e=>e.cantidad||e.recibe).forEach(e => {
      rows.push([n(e.cantidad), e.recibe||'']);
    });
    rows.push(['TOTAL DEPOSITADO', n(tEntregas)]);
    rows.push([]);
    const cajaEsperada = parseFloat(inicial||0) + tEfect - tGastos - tComprasEf - tPagosEf - tAdelantosEf - tServiciosBasicosEf - tEntregas;
    rows.push(['ESPERADO EN CAJA', n(cajaEsperada)]);
    rows.push(['  (inicial + efectivo (cobros + ventas contado) - gastos - compras/pagos ef. - adelantos nomina - servicios basicos - depósito)','']);
    const cierreNum = parseFloat(cierre||0);
    const descuadre = cierreNum - cajaEsperada;
    const cuadra = cierre !== '' && Math.abs(descuadre) < 0.005;
    rows.push(['DESCUADRE (cierre - esperado)', cierre === '' ? 'PENDIENTE' : cuadra ? 'CUADRA (0.00)' : n(descuadre)]);
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
    // Efectivo del día = cobros de CxC en efectivo + ventas de contado en efectivo
    const efectivo = [
      ...cobros.filter(c => c.forma_pago === 'efectivo').map(c => ({
        numero: c.facturas?.numero, cliente: c.clientes?.nombre || c.cliente_nombre,
        referencia: c.observaciones, monto: parseFloat(c.monto) || 0,
      })),
      ...ventasEfectivo.map(f => ({
        numero: f.numero, cliente: f.clientes?.nombre || 'CONSUMIDOR FINAL',
        referencia: 'Venta de contado', monto: parseFloat(f.total) || 0,
      })),
    ];
    const tTransf  = transf.reduce((s, c) => s + parseFloat(c.monto), 0);
    const tCheq    = cheques.reduce((s, c) => s + parseFloat(c.monto), 0);
    const tEfect   = efectivo.reduce((s, c) => s + c.monto, 0);
    const tGastos  = gastos.reduce((s, g) => s + parseFloat(g.valor || 0), 0);
    const tEntregas= entregas.reduce((s, e) => s + parseFloat(e.cantidad || 0), 0);
    const tComprasEf = comprasEfect.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);
    const tPagosEf   = pagosEfect.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const tAdelantosEf = adelantosNomina.reduce((s, a) => s + (parseFloat(a.valor) || 0), 0);
    const tServiciosBasicosEf = serviciosBasicosCaja.reduce((s, a) => s + (parseFloat(a.valor) || 0), 0);
    const cajaEsperada    = parseFloat(inicial||0) + tEfect - tGastos - tComprasEf - tPagosEf - tAdelantosEf - tServiciosBasicosEf - tEntregas;
    const cierreIngresado = cierre !== '' && cierre !== null && cierre !== undefined;
    const descuadre       = parseFloat(cierre||0) - cajaEsperada;
    const cuadra          = cierreIngresado && Math.abs(descuadre) < 0.005;
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

    <div class="sec">COMPRAS / PAGOS EN EFECTIVO</div>
    <table><thead><tr><th>PROVEEDOR</th><th>TIPO</th><th>VALOR</th></tr></thead><tbody>
    ${comprasEfect.map(c=>`<tr><td>${c.proveedor_nombre||''}</td><td>${c.es_personal?'Compra personal':'Compra MP'} — pago directo efectivo</td><td class="r">${parseFloat(c.total||0).toFixed(2)}</td></tr>`).join('')}
    ${pagosEfect.map(p=>`<tr><td>${p.compras?.proveedor_nombre||''}</td><td>${p.compras?.es_personal?'Compra personal':'Compra MP'} — abono factura crédito</td><td class="r">${parseFloat(p.monto||0).toFixed(2)}</td></tr>`).join('')}
    <tr><td colspan="2" class="r"><b>TOTAL</b></td><td class="r"><b>${(tComprasEf+tPagosEf).toFixed(2)}</b></td></tr>
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
    <table><thead><tr><th>#FACT/APLICA</th><th>CLIENTE</th><th>DETALLE</th><th>VALOR</th></tr></thead><tbody>
    ${efectivo.map(c=>`<tr><td>${c.numero||''}</td><td>${c.cliente||''}</td><td>${c.referencia||''}</td><td class="r">${c.monto.toFixed(2)}</td></tr>`).join('')}
    <tr><td colspan="3" class="r"><b>TOTAL</b></td><td class="r"><b>${tEfect.toFixed(2)}</b></td></tr>
    </tbody></table>

    <div class="sec">DEPÓSITO AL BANCO</div>
    <table><thead><tr><th>MONTO</th><th>BANCO / REFERENCIA</th></tr></thead><tbody>
    ${entregas.filter(e=>e.cantidad||e.recibe).map(e=>`<tr><td class="r">${parseFloat(e.cantidad||0).toFixed(2)}</td><td>${e.recibe||''}</td></tr>`).join('')}
    </tbody></table>

    <div class="totales">
      <div class="tot"><div class="tlbl">TOTAL TRANSFERENCIAS</div><div class="tval">${tTransf.toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">INICIAL</div><div class="tval">${parseFloat(inicial||0).toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">TOTAL CHEQUES</div><div class="tval">${tCheq.toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">CIERRE</div><div class="tval">${parseFloat(cierre||0).toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">TOTAL EFECTIVO</div><div class="tval">${tEfect.toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">COMPRAS/PAGOS EFECTIVO</div><div class="tval">${(tComprasEf+tPagosEf).toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">DEPÓSITO AL BANCO</div><div class="tval">${tEntregas.toFixed(2)}</div></div>
      <div class="tot"><div class="tlbl">ESPERADO EN CAJA</div><div class="tval">${cajaEsperada.toFixed(2)}</div></div>
      <div class="tot" style="grid-column:1 / span 2;border:2px solid ${!cierreIngresado?'#e67e22':cuadra?'#27ae60':'#e74c3c'};background:${!cierreIngresado?'#fff8f0':cuadra?'#f0fff4':'#fde8e8'}">
        <div class="tlbl" style="color:${!cierreIngresado?'#e67e22':cuadra?'#27ae60':'#e74c3c'}">${!cierreIngresado?'⏳ PENDIENTE':cuadra?'✓ CUADRA':'DESCUADRE'}</div>
        <div class="tval" style="font-size:14pt;color:${!cierreIngresado?'#e67e22':cuadra?'#27ae60':'#e74c3c'}">${!cierreIngresado?'$'+cajaEsperada.toFixed(2):cuadra?'$0.00':`${descuadre>0?'+':''}$${descuadre.toFixed(2)}`}</div>
        <div style="font-size:7pt;color:#999">${!cierreIngresado?'esperado en caja':'cierre - esperado'}</div>
      </div>
    </div>
    <div class="obs"><b>OBSERVACIONES:</b> ${observaciones || ''}</div>
    <div style="margin-top:40px;display:flex;justify-content:center">
      <div style="text-align:center;border-top:1px solid #333;padding-top:4px;width:260px;font-size:9pt">
        Firma del responsable
      </div>
    </div>
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  }

  const updG = (i, f, v) => setGastos(g => g.map((x, idx) => idx === i ? { ...x, [f]: v } : x));
  const updE = (i, f, v) => setEntregas(e => e.map((x, idx) => idx === i ? { ...x, [f]: v } : x));

  function verificarServicioBasico(texto) {
    if (!texto) return;
    const textoLower = texto.toLowerCase();
    const match = serviciosBasicosCatalogo.find(sb =>
      (sb.nombre && textoLower.includes(sb.nombre.toLowerCase())) ||
      (sb.concepto && textoLower.includes(sb.concepto.toLowerCase())) ||
      (sb.empresa && textoLower.includes(sb.empresa.toLowerCase()))
    );
    if (match) {
      alert(`"${texto}" parece ser un pago de Servicio Básico (${match.nombre}). Regístralo en Pagos Personales en vez de aquí, para evitar contarlo dos veces.`);
    }
  }

  const tGastos      = gastos.reduce((s, g) => s + (parseFloat(g.valor) || 0), 0);
  const tEntregas    = entregas.reduce((s, e) => s + (parseFloat(e.cantidad) || 0), 0);
  const tTransf      = cobros.filter(c => c.forma_pago === 'transferencia').reduce((s, c) => s + parseFloat(c.monto), 0);
  const tCheq        = cobros.filter(c => c.forma_pago === 'cheque').reduce((s, c) => s + parseFloat(c.monto), 0);
  const tVentasEf    = ventasEfectivo.reduce((s, f) => s + (parseFloat(f.total) || 0), 0);
  // Efectivo del día = cobros de CxC en efectivo + ventas de contado en efectivo (mismo origen físico: la caja)
  const tEfect       = cobros.filter(c => c.forma_pago === 'efectivo').reduce((s, c) => s + parseFloat(c.monto), 0) + tVentasEf;
  const tCobros      = tTransf + tCheq + tEfect;
  const tComprasEf   = comprasEfect.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);
  const tPagosEf     = pagosEfect.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const tAdelantosEf = adelantosNomina.reduce((s, a) => s + (parseFloat(a.valor) || 0), 0);
  const tServiciosBasicosEf = serviciosBasicosCaja.reduce((s, a) => s + (parseFloat(a.valor) || 0), 0);

  const inp = { padding:'7px 10px', borderRadius:7, border:'1.5px solid #ddd', fontSize:'13px', outline:'none', boxSizing:'border-box' };
  const thS = { background:'#f0f2f5', padding:'6px 8px', fontWeight:'bold', fontSize:'10px', color:'#555', textAlign:'left', borderBottom:'2px solid #ddd' };
  const tdS = { padding:'5px 8px', borderBottom:'1px solid #f0f0f0', fontSize:'12px', verticalAlign:'middle' };

  // ── VISTA MES ─────────────────────────────────────────────
  if (vista === 'mes') {
    const totM = { efectivo:0, transferencia:0, cheque:0, gastos:0, deposito:0, comprasEf:0, pagosEf:0 };
    datosMes.forEach(d => { totM.efectivo+=d.efectivo; totM.transferencia+=d.transferencia; totM.cheque+=d.cheque; totM.gastos+=d.gastos; totM.deposito+=d.deposito||0; totM.comprasEf+=d.comprasEf||0; totM.pagosEf+=d.pagosEf||0; });
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
        <th>FECHA</th><th>EFECTIVO</th><th>TRANSFERENCIA</th><th>CHEQUE</th><th>GASTOS</th><th>COMPRAS/PAGOS EF</th><th>DEP. BANCO</th><th>INICIAL</th><th>CIERRE</th><th>DESCUADRE</th>
      </tr></thead><tbody>
      ${datosMes.map(d=>{
        const esperado = d.inicial + d.efectivo - d.gastos - (d.comprasEf||0) - (d.pagosEf||0) - (d.deposito||0);
        const desc = d.cierre - esperado;
        const cuadra = Math.abs(desc) < 0.005;
        const color = cuadra ? '#27ae60' : '#e74c3c';
        return `<tr>
        <td>${fmtF(d.fecha)}</td>
        <td>${d.efectivo>0?d.efectivo.toFixed(2):'—'}</td>
        <td>${d.transferencia>0?d.transferencia.toFixed(2):'—'}</td>
        <td>${d.cheque>0?d.cheque.toFixed(2):'—'}</td>
        <td>${d.gastos>0?d.gastos.toFixed(2):'—'}</td>
        <td>${((d.comprasEf||0)+(d.pagosEf||0))>0?((d.comprasEf||0)+(d.pagosEf||0)).toFixed(2):'—'}</td>
        <td>${(d.deposito||0)>0?(d.deposito||0).toFixed(2):'—'}</td>
        <td>${d.inicial>0?d.inicial.toFixed(2):'—'}</td>
        <td>${d.cierre>0?d.cierre.toFixed(2):'—'}</td>
        <td style="color:${color};font-weight:bold">${cuadra?'✓':(desc>0?'+':'')+desc.toFixed(2)}</td>
      </tr>`;}).join('')}
      </tbody><tfoot>
        <tr class="tot">
          <td>TOTAL</td>
          <td>${totM.efectivo.toFixed(2)}</td>
          <td>${totM.transferencia.toFixed(2)}</td>
          <td>${totM.cheque.toFixed(2)}</td>
          <td>${totM.gastos.toFixed(2)}</td>
          <td>${(totM.comprasEf+totM.pagosEf).toFixed(2)}</td>
          <td>${totM.deposito.toFixed(2)}</td>
          <td>—</td><td>—</td><td>—</td>
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
      const enc = ['FECHA','EFECTIVO','TRANSFERENCIA','CHEQUE','GASTOS','COMPRAS/PAGOS EF','DEP. BANCO','INICIAL','CIERRE','DESCUADRE'];
      const rows = datosMes.map(d => {
        const esperado = d.inicial + d.efectivo - d.gastos - (d.comprasEf||0) - (d.pagosEf||0) - (d.deposito||0);
        const desc = d.cierre - esperado;
        const cuadra = Math.abs(desc) < 0.005;
        return [
          fmtF(d.fecha),
          d.efectivo.toFixed(2).replace('.',','),
          d.transferencia.toFixed(2).replace('.',','),
          d.cheque.toFixed(2).replace('.',','),
          d.gastos.toFixed(2).replace('.',','),
          ((d.comprasEf||0)+(d.pagosEf||0)).toFixed(2).replace('.',','),
          (d.deposito||0).toFixed(2).replace('.',','),
          d.inicial.toFixed(2).replace('.',','),
          d.cierre.toFixed(2).replace('.',','),
          cuadra ? 'CUADRA' : (desc>0?'+':'')+desc.toFixed(2).replace('.',','),
        ];
      });
      const totRow = ['TOTAL',
        totM.efectivo.toFixed(2).replace('.',','),
        totM.transferencia.toFixed(2).replace('.',','),
        totM.cheque.toFixed(2).replace('.',','),
        totM.gastos.toFixed(2).replace('.',','),
        (totM.comprasEf+totM.pagosEf).toFixed(2).replace('.',','),
        totM.deposito.toFixed(2).replace('.',','),
        '—','—','—'
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
                {['FECHA','EFECTIVO','TRANSFERENCIA','CHEQUE','GASTOS','COMPRAS/PAGOS EF','DEP. BANCO','INICIAL','CIERRE','DESCUADRE',''].map(h => (
                  <th key={h} style={{ padding:'10px 8px', fontSize:'11px', fontWeight:'bold', textAlign: h==='FECHA'?'left':'right', borderRight:'1px solid rgba(255,255,255,0.1)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datosMes.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:30, color:'#aaa' }}>Sin datos para este mes</td></tr>
              ) : datosMes.map((d, i) => (
                <tr key={d.fecha} style={{ background: i%2===0?'white':'#fafafa' }}>
                  {(() => {
                    const esperado = d.inicial + d.efectivo - d.gastos - (d.comprasEf||0) - (d.pagosEf||0) - (d.deposito||0);
                    const desc = d.cierre - esperado;
                    const cuadra = Math.abs(desc) < 0.005;
                    const descColor = cuadra ? '#27ae60' : '#e74c3c';
                    return (<>
                      <td style={{ ...tdS, fontWeight:'bold', color:'#1a5276' }}>{fmtF(d.fecha)}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#27ae60' }}>{d.efectivo>0 ? d.efectivo.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#2980b9' }}>{d.transferencia>0 ? d.transferencia.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#8e44ad' }}>{d.cheque>0 ? d.cheque.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#e74c3c' }}>{d.gastos>0 ? d.gastos.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#e67e22' }}>{((d.comprasEf||0)+(d.pagosEf||0))>0 ? ((d.comprasEf||0)+(d.pagosEf||0)).toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#7d3c98' }}>{(d.deposito||0)>0 ? (d.deposito||0).toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'right' }}>{d.inicial>0 ? d.inicial.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'right' }}>{d.cierre>0 ? d.cierre.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign:'center', fontWeight:'bold', color:descColor }}>
                        {cuadra ? '✓' : (desc>0?'+':'')+desc.toFixed(2)}
                      </td>
                    </>);
                  })()}
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
                <td style={{ ...tdS, textAlign:'right' }}>{(totM.comprasEf+totM.pagosEf).toFixed(2)}</td>
                <td style={{ ...tdS, textAlign:'right' }}>{totM.deposito.toFixed(2)}</td>
                <td style={{ ...tdS, textAlign:'right' }}>—</td>
                <td style={{ ...tdS, textAlign:'right' }}>—</td>
                <td style={{ ...tdS }}></td>
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

      {/* Selector de fecha */}
      <div style={{ background:'white', borderRadius:12, padding:'12px 16px', marginBottom:12,
        display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <span style={{ fontWeight:'bold', color:'#555', fontSize:'12px' }}>📅 Fecha:</span>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
        {guardadoHoy
          ? <span style={{ fontSize:'12px', color:'#27ae60', fontWeight:'bold', background:'#f0fff4', padding:'5px 12px', borderRadius:8, border:'1px solid #27ae60' }}>
              ✅ Caja del día guardada · puedes revisarla en Ver mes
            </span>
          : cajaId
            ? <span style={{ fontSize:'11px', color:'#27ae60', fontWeight:'bold' }}>✅ Caja registrada</span>
            : <span style={{ fontSize:'11px', color:'#e67e22', fontWeight:'bold' }}>⚠️ Sin registrar</span>
        }
        {!guardadoHoy && estadoAutosave !== 'idle' && (
          <span style={{ fontSize:'11px', fontWeight:'bold',
            color: estadoAutosave === 'error' ? '#e74c3c' : estadoAutosave === 'guardado' ? '#27ae60' : '#888' }}>
            {estadoAutosave === 'pendiente' ? '✏️ Escribiendo...'
              : estadoAutosave === 'guardando' ? '💾 Guardando...'
              : estadoAutosave === 'guardado' ? '✓ Guardado'
              : '⚠️ Error al guardar'}
          </span>
        )}
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
          <div style={{ marginTop:5, fontSize:'11px', color:'#2980b9', fontWeight:'bold' }}>
            Esperado: ${(parseFloat(inicial||0) + tEfect - tGastos - tComprasEf - tPagosEf - tAdelantosEf - tServiciosBasicosEf - tEntregas).toFixed(2)}
          </div>
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
            <th style={{ ...thS, width:70, textAlign:'center' }}>PERSONAL</th>
            <th style={{ ...thS, width:70, textAlign:'center' }}>+INFO / 🗑</th>
          </tr></thead>
          <tbody>
            {gastos.map((g, i) => (
              <React.Fragment key={i}>
                <tr>
                  <td style={{ ...tdS, position:'relative' }}>
                    <input
                      value={g.proveedor}
                      onChange={e => { updG(i,'proveedor',e.target.value); setProvFoco(i); }}
                      onFocus={() => setProvFoco(i)}
                      onBlur={() => { setTimeout(() => setProvFoco(null), 150); verificarServicioBasico(g.proveedor); }}
                      placeholder="Proveedor"
                      style={{ ...inp, width:'100%', padding:'4px 8px' }}
                      autoComplete="off"
                    />
                    {provFoco === i && g.proveedor.length > 0 && (() => {
                      const filtrados = provSugs.filter(p =>
                        p.nombre.toLowerCase().includes(g.proveedor.toLowerCase())
                      ).slice(0, 6);
                      if (!filtrados.length) return null;
                      return (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:200,
                          background:'white', border:'1px solid #ddd', borderRadius:8,
                          boxShadow:'0 4px 12px rgba(0,0,0,0.12)', maxHeight:180, overflowY:'auto' }}>
                          {filtrados.map((p, idx) => (
                            <div key={idx}
                              onMouseDown={() => {
                                updG(i, 'proveedor', p.nombre);
                                if (p.ruc) updG(i, 'ruc', p.ruc);
                                setProvFoco(null);
                              }}
                              style={{ padding:'7px 12px', cursor:'pointer', fontSize:'12px',
                                borderBottom:'1px solid #f0f0f0', color:'#333',
                                display:'flex', justifyContent:'space-between', alignItems:'center' }}
                              onMouseEnter={e => e.currentTarget.style.background='#f0f7ff'}
                              onMouseLeave={e => e.currentTarget.style.background='white'}
                            >
                              <span>{p.nombre}</span>
                              {p.ruc && <span style={{ fontSize:'10px', color:'#888' }}>{p.ruc}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={tdS}>
                    <input value={g.detalle} onChange={e => updG(i,'detalle',e.target.value)}
                      onBlur={() => verificarServicioBasico(g.detalle)}
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
                    <input type="checkbox" checked={g.es_personal || false}
                      onChange={e => updG(i,'es_personal',e.target.checked)}
                      title="Marcar como gasto personal"
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

      {/* ADELANTOS DE NÓMINA (efectivo) */}
      {adelantosNomina.length > 0 && (
        <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1.5px solid #8e44ad' }}>
          <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            💰 ADELANTOS DE NÓMINA (efectivo)
            <span style={{ fontSize:'13px', color:'#8e44ad', fontWeight:'bold' }}>
              Total: ${tAdelantosEf.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize:'10px', color:'#888', marginBottom:8, fontStyle:'italic' }}>
            Solo lectura — registrado en Nómina
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <th style={thS}>CONCEPTO</th>
              <th style={{ ...thS, width:100 }}>VALOR ($)</th>
            </tr></thead>
            <tbody>
              {adelantosNomina.map(a => (
                <tr key={a.id}>
                  <td style={tdS}>{a.proveedor || a.detalle}</td>
                  <td style={tdS}>${parseFloat(a.valor||0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SERVICIOS BÁSICOS (efectivo) */}
      {serviciosBasicosCaja.length > 0 && (
        <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1.5px solid #2980b9' }}>
          <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            🔌 SERVICIOS BÁSICOS (efectivo)
            <span style={{ fontSize:'13px', color:'#2980b9', fontWeight:'bold' }}>
              Total: ${tServiciosBasicosEf.toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize:'10px', color:'#888', marginBottom:8, fontStyle:'italic' }}>
            Solo lectura — registrado en Pagos Personales
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <th style={thS}>CONCEPTO</th>
              <th style={{ ...thS, width:100 }}>VALOR ($)</th>
            </tr></thead>
            <tbody>
              {serviciosBasicosCaja.map(s => (
                <tr key={s.id}>
                  <td style={tdS}>{s.proveedor || s.detalle}</td>
                  <td style={tdS}>${parseFloat(s.valor||0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* COMPRAS / PAGOS EN EFECTIVO */}
      {(comprasEfect.length > 0 || pagosEfect.length > 0) && (
        <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:'1.5px solid #f39c12' }}>
          <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            🛒 COMPRAS / PAGOS EN EFECTIVO
            <span style={{ fontSize:'13px', color:'#e67e22', fontWeight:'bold' }}>
              Total: ${(tComprasEf + tPagosEf).toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize:'10px', color:'#888', marginBottom:8, fontStyle:'italic' }}>
            Solo lectura — registrado en Compras
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              <th style={thS}>PROVEEDOR</th>
              <th style={thS}>TIPO</th>
              <th style={{ ...thS, width:120, textAlign:'right' }}>MONTO ($)</th>
            </tr></thead>
            <tbody>
              {comprasEfect.map(c => (
                <tr key={c.id}>
                  <td style={tdS}>{c.proveedor_nombre || '—'}</td>
                  <td style={{ ...tdS, fontSize:11, color:'#888' }}>
                    {c.es_personal ? '👤 Compra personal' : '📦 Compra MP'} — pago directo efectivo
                  </td>
                  <td style={{ ...tdS, textAlign:'right', fontWeight:'bold', color:'#e67e22' }}>
                    ${parseFloat(c.total||0).toFixed(2)}
                  </td>
                </tr>
              ))}
              {pagosEfect.map(p => (
                <tr key={p.id}>
                  <td style={tdS}>{p.compras?.proveedor_nombre || '—'}</td>
                  <td style={{ ...tdS, fontSize:11, color:'#888' }}>
                    {p.compras?.es_personal ? '👤 Compra personal' : '📦 Compra MP'} — abono/pago factura crédito
                  </td>
                  <td style={{ ...tdS, textAlign:'right', fontWeight:'bold', color:'#e67e22' }}>
                    ${parseFloat(p.monto||0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* COBROS DEL DÍA */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          💵 COBROS DEL DÍA
          <span style={{ fontSize:'13px', color:'#27ae60', fontWeight:'bold' }}>Total: ${tCobros.toFixed(2)}</span>
        </div>

        {cobros.length === 0 && ventasEfectivo.length === 0 ? (
          <div style={{ textAlign:'center', padding:'24px', color:'#aaa', fontSize:'12px', background:'#f9f9f9', borderRadius:8 }}>
            Sin cobros registrados para este día.<br />
            <span style={{ fontSize:'11px' }}>Regístralos en <b>Por cobrar</b> y aparecerán aquí automáticamente.</span>
          </div>
        ) : (
          ['transferencia','cheque','efectivo'].map(tipo => {
            const lista = cobros.filter(c => c.forma_pago === tipo).map(c => ({
              id: c.id, numero: c.facturas?.numero, cliente: c.clientes?.nombre || c.cliente_nombre,
              referencia: c.observaciones, valor: parseFloat(c.monto) || 0,
            }));
            if (tipo === 'efectivo') {
              ventasEfectivo.forEach(f => lista.push({
                id: 'v' + f.id, numero: f.numero, cliente: f.clientes?.nombre || 'CONSUMIDOR FINAL',
                referencia: 'Venta de contado', valor: parseFloat(f.total) || 0,
              }));
            }
            if (!lista.length) return null;
            const iconos = { transferencia:'🏦', cheque:'📝', efectivo:'💵' };
            const totalTipo = lista.reduce((s, c) => s + c.valor, 0);
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
                        <td style={tdS}>{c.numero || '—'}</td>
                        <td style={tdS}>{c.cliente || '—'}</td>
                        <td style={{ ...tdS, color:'#888' }}>{c.referencia || '—'}</td>
                        <td style={{ ...tdS, textAlign:'right', fontWeight:'bold', color:'#27ae60' }}>
                          ${c.valor.toFixed(2)}
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

      {/* DEPÓSITO AL BANCO */}
      <div style={{ background:'white', borderRadius:12, padding:'16px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight:'bold', fontSize:'13px', color:'#1a1a2e', marginBottom:10,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          🏦 DEPÓSITO AL BANCO
          <span style={{ fontSize:'13px', color:'#8e44ad', fontWeight:'bold' }}>Total: ${tEntregas.toFixed(2)}</span>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            <th style={{ ...thS, width:160 }}>MONTO ($)</th>
            <th style={thS}>BANCO / REFERENCIA</th>
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
                    placeholder="Ej: Banco Pichincha, N° depósito..." style={{ ...inp, width:'100%', padding:'4px 8px' }} />
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
      {(() => {
        const cajaEsperada    = parseFloat(inicial||0) + tEfect - tGastos - tComprasEf - tPagosEf - tAdelantosEf - tServiciosBasicosEf - tEntregas;
        const cierreIngresado = cierre !== '' && cierre !== null;
        const descuadre       = parseFloat(cierre||0) - cajaEsperada;
        const cuadra          = cierreIngresado && Math.abs(descuadre) < 0.005;
        const descColor       = !cierreIngresado ? '#e67e22' : cuadra ? '#27ae60' : '#e74c3c';
        return (
      <div style={{ background:'white', borderRadius:12, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
        display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:20, flex:1, flexWrap:'wrap' }}>
          {[
            { label:'EFECTIVO (COBROS + VENTAS)', val: tEfect,     color:'#27ae60' },
            { label:'GASTOS',                     val: tGastos,    color:'#e74c3c' },
            { label:'DEPÓSITO BANCO',              val: tEntregas,  color:'#8e44ad' },
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
          <div style={{ textAlign:'center',
            background: !cierreIngresado ? '#fff8f0' : cuadra ? '#f0fff4' : '#fde8e8',
            border: `2px solid ${descColor}`, borderRadius:10, padding:'6px 16px' }}>
            <div style={{ fontSize:'10px', color:descColor, fontWeight:700 }}>
              {!cierreIngresado ? '⏳ PENDIENTE' : cuadra ? '✓ CUADRA' : 'DESCUADRE'}
            </div>
            <div style={{ fontSize:'22px', fontWeight:'bold', color:descColor }}>
              {!cierreIngresado
                ? `$${cajaEsperada.toFixed(2)}`
                : cuadra ? '$0.00' : `${descuadre > 0 ? '+' : ''}$${descuadre.toFixed(2)}`}
            </div>
            <div style={{ fontSize:'9px', color:'#aaa' }}>
              {!cierreIngresado ? 'esperado en caja' : 'cierre - esperado'}
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
          {!guardadoHoy && (
            <button onClick={guardar} disabled={guardando}
              style={{ padding:'10px 28px', borderRadius:8, border:'none',
                background: guardando ? '#95a5a6' : '#27ae60',
                color:'white', cursor: guardando ? 'not-allowed' : 'pointer',
                fontWeight:'bold', fontSize:'13px' }}>
              {guardando ? '⏳...' : '💾 Guardar'}
            </button>
          )}
        </div>
      </div>
        );
      })()}
    </div>
  );
}
