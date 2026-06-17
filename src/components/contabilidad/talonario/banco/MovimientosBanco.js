import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { calcularSaldoCalculado, calcularDiferencia } from '../../../../utils/saldoBanco';

export default function MovimientosBanco() {
  const { mes, año, fechaDesde, fechaHasta, MESES } = useTalonario();
  const [movs,          setMovs]          = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [saldoReal,     setSaldoReal]     = useState('');
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [guardandoS,    setGuardandoS]    = useState(false);
  const [filtro,        setFiltro]        = useState('');
  const [editandoComision,  setEditandoComision]  = useState(null);
  const [montoComisionEdit, setMontoComisionEdit] = useState('');
  const [saldoCalculado,   setSaldoCalculado]   = useState(0);
  const [pendienteInicial, setPendienteInicial] = useState(false);
  const [notaDiferencia,   setNotaDiferencia]   = useState('');
  const [editandoNota,     setEditandoNota]     = useState(false);
  const [notaEdit,         setNotaEdit]         = useState('');

  useEffect(() => { cargar(); }, [mes, año]);

  async function cargar() {
    setCargando(true);
    const [
      { data: cobros },
      { data: pagosB },
      { data: otrosI },
      { data: config },
      { data: factsP },
      { data: ventasBanco },
      { data: comprasBanco },
      { data: cajasMes },
    ] = await Promise.all([
      supabase.from('cobros')
        .select('id,fecha,monto,comision,forma_pago,observaciones,clientes(nombre),facturas(numero)')
        .in('forma_pago', ['transferencia','deposito','cheque'])
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
      supabase.from('talonario_pagos_banco')
        .select('id,fecha,monto,concepto,beneficiario')
        .eq('mes', mes).eq('año', año).order('fecha'),
      supabase.from('talonario_otros_ingresos')
        .select('id,fecha,monto,descripcion,empresa,forma_pago')
        .eq('mes', mes).eq('año', año)
        .neq('forma_pago', '01').order('fecha'),
      supabase.from('config_contabilidad')
        .select('valor').eq('clave', `saldo_banco_${año}_${mes}`).maybeSingle(),
      supabase.from('talonario_facturas_personales')
        .select('id,fecha,proveedor,descripcion,monto,numero_transferencia')
        .eq('mes', mes).eq('año', año)
        .eq('forma_pago', '20').order('fecha'),
      supabase.from('facturas')
        .select('id,numero,total,cliente_nombre,metodo_pago,created_at')
        .in('metodo_pago', ['transferencia','cheque'])
        .neq('estado', 'anulada')
        .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59')
        .order('created_at'),
      supabase.from('compras')
        .select('id,fecha,total,proveedor_nombre,forma_pago')
        .in('forma_pago', ['transferencia','cheque','deposito'])
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
      supabase.from('caja_chica')
        .select('id,fecha')
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
    ]);
    setSaldoReal(config?.valor?.saldo || '');
    setNotaDiferencia(config?.valor?.notaDiferencia || '');

    const cajaIds = (cajasMes || []).map(c => c.id);
    const fechaPorCaja = {};
    (cajasMes || []).forEach(c => { fechaPorCaja[c.id] = c.fecha; });
    const { data: entregas } = cajaIds.length > 0
      ? await supabase.from('caja_entregas').select('caja_id,cantidad,recibe').in('caja_id', cajaIds)
      : { data: [] };

    const lista = [
      ...(cobros||[]).flatMap(c => {
        const label = c.forma_pago === 'deposito' ? 'Depósito' : c.forma_pago === 'cheque' ? 'Cheque' : 'Transferencia';
        const quien = c.clientes?.nombre || c.facturas?.numero || c.observaciones || '';
        const filas = [{
          fecha: c.fecha,
          descripcion: `Cobro ${label} — ${quien}`,
          tipo: 'entrada',
          monto: parseFloat(c.monto||0),
          cobroId: c.id,
          comisionActual: parseFloat(c.comision||0),
        }];
        if (parseFloat(c.comision||0) > 0) {
          filas.push({
            fecha: c.fecha,
            descripcion: `└ Comisión — ${quien}`,
            tipo: 'salida',
            monto: parseFloat(c.comision),
            esComision: true,
          });
        }
        return filas;
      }),
      ...(otrosI||[]).map(o => ({
        fecha: o.fecha || '',
        descripcion: `Otro ingreso — ${o.descripcion || o.empresa || ''}`,
        tipo: 'entrada',
        monto: parseFloat(o.monto||0),
      })),
      ...(pagosB||[]).map(p => ({
        fecha: p.fecha || '',
        descripcion: `Pago banco — ${p.concepto || p.beneficiario || ''}`,
        tipo: 'salida',
        monto: parseFloat(p.monto||0),
      })),
      ...(factsP||[]).map(f => ({
        fecha: f.fecha || '',
        descripcion: `Factura personal — ${f.proveedor || f.descripcion || ''}${f.numero_transferencia ? ` (${f.numero_transferencia})` : ''}`,
        tipo: 'salida',
        monto: parseFloat(f.monto||0),
      })),
      ...(ventasBanco||[]).map(f => ({
        fecha: (f.created_at || '').split('T')[0],
        descripcion: `Venta ${f.metodo_pago} — ${f.numero} — ${f.cliente_nombre || ''}`,
        tipo: 'entrada',
        monto: parseFloat(f.total||0),
      })),
      ...(comprasBanco||[]).map(c => ({
        fecha: c.fecha || '',
        descripcion: `Compra ${c.forma_pago} — ${c.proveedor_nombre || ''}`,
        tipo: 'salida',
        monto: parseFloat(c.total||0),
      })),
      ...(entregas||[]).map(e => ({
        fecha: fechaPorCaja[e.caja_id] || '',
        descripcion: `Depósito desde Caja Chica${e.recibe ? ` — ${e.recibe}` : ''}`,
        tipo: 'entrada',
        monto: parseFloat(e.cantidad||0),
      })),
    ].sort((a, b) => (a.fecha||'').localeCompare(b.fecha||''));

    const totalEntradasMes = lista.filter(m => m.tipo === 'entrada').reduce((s,m) => s + m.monto, 0);
    const totalSalidasMes  = lista.filter(m => m.tipo === 'salida').reduce((s,m) => s + m.monto, 0);
    const { saldoCalculado: sc, pendienteInicial: pi } = await calcularSaldoCalculado(año, mes, totalEntradasMes - totalSalidasMes);

    setMovs(lista);
    setSaldoCalculado(sc);
    setPendienteInicial(pi);
    setCargando(false);
  }

  async function guardarSaldo(val) {
    setGuardandoS(true);
    await supabase.from('config_contabilidad')
      .upsert({ clave: `saldo_banco_${año}_${mes}`, valor: { saldo: val, notaDiferencia } }, { onConflict: 'clave' });
    setGuardandoS(false);
    setEditandoSaldo(false);
  }

  async function guardarNota(val) {
    setGuardandoS(true);
    await supabase.from('config_contabilidad')
      .upsert({ clave: `saldo_banco_${año}_${mes}`, valor: { saldo: saldoReal, notaDiferencia: val } }, { onConflict: 'clave' });
    setNotaDiferencia(val);
    setGuardandoS(false);
    setEditandoNota(false);
  }

  async function guardarComision(cobroId, val) {
    await supabase.from('cobros').update({ comision: parseFloat(val) || 0 }).eq('id', cobroId);
    setEditandoComision(null);
    setMontoComisionEdit('');
    cargar();
  }

  const totalEntradas = movs.filter(m => m.tipo === 'entrada').reduce((s,m) => s + m.monto, 0);
  const totalSalidas  = movs.filter(m => m.tipo === 'salida').reduce((s,m) => s + m.monto, 0);
  const neto          = totalEntradas - totalSalidas;

  const fmt = fecha => {
    if (!fecha) return '—';
    const [y,mo,d] = fecha.split('-');
    return `${parseInt(d)}/${parseInt(mo)}/${y}`;
  };

  if (cargando) return <div style={{ padding:40, textAlign:'center', color:'#888' }}>Cargando...</div>;

  const { dif, cuadra, color: difColor } = calcularDiferencia(saldoReal, saldoCalculado);

  const q        = filtro.toLowerCase();
  const movsFilt = filtro
    ? movs.filter(m => m.descripcion.toLowerCase().includes(q) || fmt(m.fecha).includes(q))
    : movs;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
        {[
          { label:'ENTRADAS AL BANCO', val: totalEntradas, color:'#27ae60', bg:'#e8f5e9' },
          { label:'SALIDAS DEL BANCO', val: totalSalidas,  color:'#e74c3c', bg:'#fde8e8' },
          { label:'NETO DEL MES',      val: neto,          color: neto>=0?'#27ae60':'#e74c3c', bg: neto>=0?'#e8f5e9':'#fde8e8' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, border:`2px solid ${k.color}`, borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
            <div style={{ fontSize:10, fontWeight:'bold', color:'#888', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:'bold', color:k.color }}>${k.val.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Saldo banco */}
      <div style={{ background:'white', borderRadius:12, padding:16, marginBottom:16,
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)', display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:'bold', color:'#888', marginBottom:4 }}>SALDO REAL BANCO — {MESES[mes-1]} {año}</div>
          {editandoSaldo ? (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input
                type="number" value={saldoReal} onChange={e => setSaldoReal(e.target.value)}
                placeholder="0.00" autoFocus
                style={{ fontSize:20, fontWeight:'bold', padding:'6px 10px', borderRadius:8,
                  border:'2px solid #2980b9', width:160, outline:'none' }}
              />
              <button onClick={() => guardarSaldo(saldoReal)} disabled={guardandoS}
                style={{ background:'#27ae60', color:'white', border:'none', borderRadius:8,
                  padding:'8px 16px', cursor:'pointer', fontWeight:'bold', fontSize:13 }}>
                {guardandoS ? '...' : '✓ Guardar'}
              </button>
              <button onClick={() => setEditandoSaldo(false)}
                style={{ background:'#f0f2f5', color:'#555', border:'none', borderRadius:8,
                  padding:'8px 12px', cursor:'pointer', fontSize:13 }}>
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:24, fontWeight:'bold', color:'#1a2a4a' }}>
                {saldoReal ? `$${parseFloat(saldoReal).toFixed(2)}` : '—'}
              </span>
              <button onClick={() => setEditandoSaldo(true)}
                style={{ background:'#2980b9', color:'white', border:'none', borderRadius:8,
                  padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:'bold' }}>
                ✏️ {saldoReal ? 'Editar' : 'Ingresar saldo'}
              </button>
            </div>
          )}
          <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>
            Ingresa el saldo real del estado de cuenta del banco
          </div>
        </div>

        {saldoReal && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div style={{ textAlign:'center', padding:'10px 16px', borderRadius:10,
                background:'#f0f2f5', border:'1px solid #ddd' }}>
                <div style={{ fontSize:10, color:'#888', fontWeight:'bold' }}>NETO CALCULADO</div>
                <div style={{ fontSize:18, fontWeight:'bold', color: neto>=0?'#27ae60':'#e74c3c' }}>${neto.toFixed(2)}</div>
              </div>
              <div style={{ textAlign:'center', padding:'10px 16px', borderRadius:10,
                background:'#f0f2f5', border:'1px solid #ddd' }}>
                <div style={{ fontSize:10, color:'#888', fontWeight:'bold' }}>SALDO CALCULADO</div>
                <div style={{ fontSize:18, fontWeight:'bold', color: saldoCalculado>=0?'#27ae60':'#e74c3c' }}>${saldoCalculado.toFixed(2)}</div>
                {pendienteInicial && (
                  <div style={{ fontSize:9, color:'#e67e22', marginTop:4, maxWidth:140 }}>
                    ⚠️ Pendiente configurar Asiento Inicial
                  </div>
                )}
              </div>
              <div style={{ textAlign:'center', padding:'10px 16px', borderRadius:10,
                background: cuadra ? '#e8f5e9' : (dif < 0 ? '#fde8e8' : '#fdf0e3'),
                border: `2px solid ${difColor}` }}>
                <div style={{ fontSize:10, fontWeight:'bold', color: difColor }}>DIFERENCIA</div>
                <div style={{ fontSize:18, fontWeight:'bold', color: difColor }}>
                  {cuadra ? '✓ Cuadra' : `${dif>0?'+':''}$${dif.toFixed(2)}`}
                </div>
              </div>
            </div>

            {!cuadra && (
              editandoNota ? (
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <input type="text" value={notaEdit} onChange={e => setNotaEdit(e.target.value)}
                    placeholder="¿Por qué existe esta diferencia?" autoFocus
                    style={{ flex:1, minWidth:240, fontSize:13, padding:'7px 10px', borderRadius:8,
                      border:'1.5px solid #2980b9', outline:'none' }} />
                  <button onClick={() => guardarNota(notaEdit)} disabled={guardandoS}
                    style={{ background:'#27ae60', color:'white', border:'none', borderRadius:8,
                      padding:'7px 14px', cursor:'pointer', fontWeight:'bold', fontSize:12 }}>
                    {guardandoS ? '...' : '✓ Guardar'}
                  </button>
                  <button onClick={() => setEditandoNota(false)}
                    style={{ background:'#f0f2f5', color:'#555', border:'none', borderRadius:8,
                      padding:'7px 12px', cursor:'pointer', fontSize:12 }}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:12 }}>
                  <span style={{ color:'#888' }}>
                    {notaDiferencia ? `📝 ${notaDiferencia}` : 'Sin explicación para esta diferencia.'}
                  </span>
                  <button onClick={() => { setNotaEdit(notaDiferencia); setEditandoNota(true); }}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#2980b9' }}>
                    ✏️ {notaDiferencia ? 'Editar' : 'Explicar'}
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Buscador */}
      <div style={{ marginBottom:12 }}>
        <input
          type="text" value={filtro} onChange={e => setFiltro(e.target.value)}
          placeholder="🔍 Buscar movimiento..."
          style={{ width:'100%', padding:'9px 14px', borderRadius:8, border:'1px solid #ddd',
            fontSize:13, outline:'none', boxSizing:'border-box' }}
        />
      </div>

      {/* Tabla */}
      {movs.length === 0 ? (
        <div style={{ background:'white', borderRadius:12, padding:40, textAlign:'center', color:'#aaa', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          Sin movimientos bancarios en {MESES[mes-1]} {año}
        </div>
      ) : (
        <div style={{ background:'white', borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1a2a4a', color:'white' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11 }}>FECHA</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11 }}>DESCRIPCIÓN</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontSize:11, color:'#4ade80' }}>ENTRADA (+)</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontSize:11, color:'#f87171' }}>SALIDA (-)</th>
              </tr>
            </thead>
            <tbody>
              {movsFilt.length === 0 ? (
                <tr><td colSpan={4} style={{ padding:24, textAlign:'center', color:'#aaa', fontSize:13 }}>Sin resultados para "{filtro}"</td></tr>
              ) : movsFilt.map((m, i) => (
                <tr key={i} style={{ borderBottom:'1px solid #f0f0f0',
                  background: m.esComision ? '#fff8f8' : i%2===0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding:'8px 14px', fontSize:12, color:'#888' }}>{fmt(m.fecha)}</td>
                  <td style={{ padding:'8px 14px', fontSize:12, color: m.esComision ? '#e74c3c' : '#333' }}>
                    {m.descripcion}
                    {m.cobroId && (
                      editandoComision === m.cobroId ? (
                        <span style={{ display:'inline-flex', gap:4, marginLeft:8, alignItems:'center' }}>
                          <input type="number" value={montoComisionEdit}
                            onChange={e => setMontoComisionEdit(e.target.value)}
                            placeholder="0.00" autoFocus
                            style={{ width:80, padding:'2px 6px', borderRadius:4, border:'1px solid #e74c3c',
                              fontSize:11, outline:'none' }}
                          />
                          <button onClick={() => guardarComision(m.cobroId, montoComisionEdit)}
                            style={{ background:'#27ae60', color:'white', border:'none', borderRadius:4,
                              padding:'2px 8px', cursor:'pointer', fontSize:11 }}>✓</button>
                          <button onClick={() => setEditandoComision(null)}
                            style={{ background:'#f0f2f5', color:'#555', border:'none', borderRadius:4,
                              padding:'2px 6px', cursor:'pointer', fontSize:11 }}>✕</button>
                        </span>
                      ) : (
                        <button onClick={() => { setEditandoComision(m.cobroId); setMontoComisionEdit(m.comisionActual > 0 ? String(m.comisionActual) : ''); }}
                          title="Agregar/editar comisión"
                          style={{ marginLeft:8, background:'none', border:'none', cursor:'pointer',
                            fontSize:11, color:'#aaa', padding:'1px 4px', borderRadius:4 }}>✏️</button>
                      )
                    )}
                  </td>
                  <td style={{ padding:'8px 14px', fontSize:12, textAlign:'right', fontWeight:'bold', color:'#27ae60' }}>
                    {m.tipo === 'entrada' ? `$${m.monto.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding:'8px 14px', fontSize:12, textAlign:'right', fontWeight:'bold', color:'#e74c3c' }}>
                    {m.tipo === 'salida' ? `$${m.monto.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
              {!cuadra && notaDiferencia && (
                <tr style={{ background:'#fff8e1', borderTop:'2px solid #f0e0b0' }}>
                  <td colSpan={2} style={{ padding:'8px 14px', fontSize:12, color:'#996600', fontStyle:'italic' }}>
                    📝 Diferencia {dif>0?'+':''}${dif.toFixed(2)}: {notaDiferencia}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background:'#1a2a4a', color:'white', fontWeight:'bold' }}>
                <td colSpan={2} style={{ padding:'8px 14px', fontSize:12 }}>TOTAL {MESES[mes-1].toUpperCase()} {año}</td>
                <td style={{ padding:'8px 14px', textAlign:'right', fontSize:12, color:'#4ade80' }}>${totalEntradas.toFixed(2)}</td>
                <td style={{ padding:'8px 14px', textAlign:'right', fontSize:12, color:'#f87171' }}>${totalSalidas.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
