// ============================================
// TabHistorial.js
// Historial de producción agrupado por fecha
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function TabHistorial({
  historialAgrupado,
  produccionDiaria,
  esAdmin,
  setModalRevertir,
  recargarHistorial,
}) {
  const [lotesInyeccion,   setLotesInyeccion]   = useState([]);
  const [cierresDespacho,  setCierresDespacho]  = useState([]);
  const [cortesDespacho,   setCortesDespacho]   = useState([]);
  const [lotesHorneado,    setLotesHorneado]    = useState([]);
  const [cargando,         setCargando]         = useState(true);

  const [editandoCierre,   setEditandoCierre]   = useState(null);
  const [formCierre,       setFormCierre]       = useState({ hueso:'', aserrin:'', carnudo:'' });
  const [guardandoCierre,  setGuardandoCierre]  = useState(false);

  // Editar lote horneado
  const [editandoHorneado,  setEditandoHorneado]  = useState(null);
  const [kgEntradaEdit,     setKgEntradaEdit]     = useState('');
  const [kgHornoEdit,       setKgHornoEdit]       = useState('');
  const [guardandoH,        setGuardandoH]        = useState(false);
  const [errorH,            setErrorH]            = useState('');

  // Editar nota produccion_diaria
  const [editandoRegistro,  setEditandoRegistro]  = useState(null);
  const [notaEdit,          setNotaEdit]          = useState('');
  const [guardandoReg,      setGuardandoReg]      = useState(false);

  useEffect(() => {
    setCargando(true);
    Promise.all([
      supabase.from('produccion_inyeccion')
        .select('*, produccion_inyeccion_cortes(*)')
        .eq('estado', 'cerrado')
        .order('fecha', { ascending: false })
        .limit(60),
      supabase.from('despacho_cierre_dia')
        .select('*').order('fecha', { ascending: false }).limit(60),
      supabase.from('despacho_cortes')
        .select('*').order('fecha', { ascending: false }).limit(300),
      supabase.from('produccion_horneado_lotes')
        .select('*').order('fecha', { ascending: false }).limit(60),
    ]).then(([r1, r2, r3, r4]) => {
      setLotesInyeccion(r1.data || []);
      setCierresDespacho(r2.data || []);
      setCortesDespacho(r3.data || []);
      setLotesHorneado(r4.data || []);
      setCargando(false);
    });
  }, []);

  // ── Revertir lote horneado — revierte TODO lo del ciclo ──
  async function revertirHorneado(lote) {
    if (!window.confirm(
      `¿Revertir lote ${lote.lote_id}?\n\n` +
      `Se devolverá al inventario:\n` +
      `• Mostaza descontada\n• Rub descontado\n• Sub-productos devueltos\n• Pastrame sacado del stock\n\n` +
      `El lote volverá a la cola de maduración.`
    )) return;
    setGuardandoH(true);
    try {
      // Buscar TODOS los movimientos relacionados con este lote_id
      const { data: movs } = await supabase.from('inventario_movimientos')
        .select('materia_prima_id, kg, tipo')
        .ilike('motivo', `%Lote ${lote.lote_id}%`);

      // Revertir cada movimiento: SALIDA→devolver, ENTRADA→descontar
      for (const mov of (movs || [])) {
        if (!mov.materia_prima_id || parseFloat(mov.kg) <= 0) continue;
        const { data: inv } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', mov.materia_prima_id).maybeSingle();
        if (!inv) continue;
        const delta = mov.tipo === 'salida'
          ? parseFloat(mov.kg)      // salida → devolver
          : -parseFloat(mov.kg);    // entrada → quitar
        await supabase.from('inventario_mp').update({
          stock_kg: Math.max(0, parseFloat(inv.stock_kg) + delta)
        }).eq('id', inv.id);
      }

      // Regresar lotes_maduracion a 'madurando'
      await supabase.from('lotes_maduracion')
        .update({ estado: 'madurando' })
        .eq('id', lote.lote_id);

      // Eliminar registro horneado
      await supabase.from('produccion_horneado_lotes').delete().eq('id', lote.id);

      setLotesHorneado(prev => prev.filter(l => l.id !== lote.id));
    } catch (e) {
      alert('Error al revertir: ' + e.message);
    }
    setGuardandoH(false);
  }

  // ── Editar lote horneado (kg_entrada + kg_post → recalcula todo) ──
  async function guardarEdicionHorneado() {
    const nuevoKgEntrada = parseFloat(kgEntradaEdit);
    const nuevoKgPost    = parseFloat(kgHornoEdit);
    if (!nuevoKgPost || nuevoKgPost <= 0) { setErrorH('Ingresa un kg final válido'); return; }
    if (!nuevoKgEntrada || nuevoKgEntrada <= 0) { setErrorH('Ingresa un kg de entrada válido'); return; }
    if (nuevoKgPost > nuevoKgEntrada) { setErrorH('El kg final no puede ser mayor al kg de entrada'); return; }
    if (!editandoHorneado) return;
    setGuardandoH(true);
    setErrorH('');
    try {
      const lote       = editandoHorneado;
      const kgViejoPost = parseFloat(lote.kg_post_horno);
      const diffPost   = nuevoKgPost - kgViejoPost;

      // Preservar costo total — solo cambian los kg
      const costoTotal    = parseFloat(lote.c_final_kg) * kgViejoPost;
      const nuevoCFinalKg = costoTotal / nuevoKgPost;

      // Recalcular mermas
      const nuevaMermaKg  = nuevoKgEntrada - nuevoKgPost;
      const nuevaMermaPct = nuevoKgEntrada > 0 ? (nuevaMermaKg / nuevoKgEntrada) * 100 : 0;

      // Ajustar inventario Pastrame por la diferencia de kg_post
      const { data: movPast } = await supabase.from('inventario_movimientos')
        .select('materia_prima_id')
        .ilike('motivo', `%Horneado Pastrame%Lote ${lote.lote_id}%`)
        .maybeSingle();
      if (movPast?.materia_prima_id) {
        const { data: inv } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', movPast.materia_prima_id).maybeSingle();
        if (inv) {
          await supabase.from('inventario_mp').update({
            stock_kg: Math.max(0, parseFloat(inv.stock_kg) + diffPost)
          }).eq('id', inv.id);
        }
      }

      // Actualizar registro
      await supabase.from('produccion_horneado_lotes').update({
        kg_entrada_horno: nuevoKgEntrada,
        kg_post_horno:    nuevoKgPost,
        kg_post_reposo:   nuevoKgPost,
        merma_horno_kg:   nuevaMermaKg,
        merma_horno_pct:  nuevaMermaPct,
        c_final_kg:       nuevoCFinalKg,
      }).eq('id', lote.id);

      // Actualizar precio_kg en materias_primas
      await supabase.from('materias_primas')
        .update({ precio_kg: nuevoCFinalKg })
        .ilike('nombre', '%Pastrame Horneado%');

      // Refrescar lista local
      const { data } = await supabase.from('produccion_horneado_lotes')
        .select('*').order('fecha', { ascending: false }).limit(60);
      setLotesHorneado(data || []);
      setEditandoHorneado(null);
    } catch (e) {
      setErrorH('Error: ' + e.message);
    }
    setGuardandoH(false);
  }

  // ── Editar nota produccion_diaria ─────────────────────────
  async function guardarNota() {
    if (!editandoRegistro) return;
    setGuardandoReg(true);
    await supabase.from('produccion_diaria').update({
      nota:       notaEdit,
      editado:    true,
      editado_at: new Date().toISOString(),
    }).eq('id', editandoRegistro.id);
    if (recargarHistorial) await recargarHistorial();
    setEditandoRegistro(null);
    setGuardandoReg(false);
  }

  async function recalcularFase4(fechaDia, cierrePayload) {
    const { data: retazos } = await supabase.from('materias_primas')
      .select('nombre, precio_kg')
      .in('nombre', ['Aserrín Cortes', 'Retazo Carnudo']);
    const precioAserrin = parseFloat(retazos?.find(r => r.nombre === 'Aserrín Cortes')?.precio_kg || 0);
    const precioCarnudo = parseFloat(retazos?.find(r => r.nombre === 'Retazo Carnudo')?.precio_kg || 0);

    const { data: cortes } = await supabase.from('despacho_cortes')
      .select('*').eq('fecha', fechaDia);
    if (!cortes || cortes.length === 0) return;

    const corteNombres = [...new Set(cortes.map(r => r.corte_nombre).filter(Boolean))];
    const { data: lotesStock } = await supabase.from('stock_lotes_inyectados')
      .select('lote_id, corte_nombre, costo_mad_kg')
      .in('corte_nombre', corteNombres)
      .gt('costo_mad_kg', 0);

    const porLoteId = {};
    const porCorte  = {};
    (lotesStock || []).forEach(l => {
      porLoteId[l.lote_id] = parseFloat(l.costo_mad_kg);
      if (!porCorte[l.corte_nombre]) porCorte[l.corte_nombre] = parseFloat(l.costo_mad_kg);
    });

    const cortesM = cortes.map(r => ({
      ...r,
      merma: Math.max(0, (r.peso_antes||0) - (r.peso_funda||0) - (r.peso_remanente||0)),
      c_mad_real: (r.lote_ref && porLoteId[r.lote_ref])
                  || porCorte[r.corte_nombre]
                  || parseFloat(r.c_mad_kg || 0),
    }));

    const mermaTotal = cortesM.reduce((s, r) => s + r.merma, 0);
    if (mermaTotal <= 0) return;

    const pesoH = parseFloat(cierrePayload.peso_hueso   || 0);
    const pesoA = parseFloat(cierrePayload.peso_aserrin || 0);
    const pesoC = parseFloat(cierrePayload.peso_carnudo || 0);
    const mermaMaquina = Math.max(0, mermaTotal - pesoH - pesoA - pesoC);

    for (const r of cortesM) {
      const prop            = r.merma / mermaTotal;
      const kg_aserrin_asig = pesoA * prop;
      const kg_carnudo_asig = pesoC * prop;
      const kg_hueso_asig   = pesoH * prop;
      const kg_maq_asig     = mermaMaquina * prop;
      const credito_retazos = (kg_aserrin_asig * precioAserrin) + (kg_carnudo_asig * precioCarnudo);
      const c_mad      = r.c_mad_real;
      const peso_antes = parseFloat(r.peso_antes || 0);
      const peso_neto  = Math.max(0, peso_antes - kg_maq_asig - kg_hueso_asig);
      const c_final_kg = peso_neto > 0 ? ((peso_antes * c_mad) - credito_retazos) / peso_neto : 0;

      await supabase.from('despacho_cortes').update({
        kg_aserrin_asig, kg_carnudo_asig, kg_hueso_asig,
        kg_maq_asig, credito_retazos, c_final_kg,
        c_mad_kg: c_mad,
      }).eq('id', r.id);
    }
  }

  async function guardarEdicionCierre() {
    if (!editandoCierre) return;
    setGuardandoCierre(true);
    const payload = {
      peso_hueso:   parseFloat(formCierre.hueso   || 0),
      peso_aserrin: parseFloat(formCierre.aserrin || 0),
      peso_carnudo: parseFloat(formCierre.carnudo || 0),
    };
    if (editandoCierre.cierre) {
      await supabase.from('despacho_cierre_dia').update(payload).eq('id', editandoCierre.cierre.id);
    } else {
      await supabase.from('despacho_cierre_dia').insert({ ...payload, fecha: editandoCierre.fecha, usuario_nombre: '' });
    }
    await recalcularFase4(editandoCierre.fecha, payload);

    const { data } = await supabase.from('despacho_cierre_dia').select('*').order('fecha', { ascending: false }).limit(60);
    setCierresDespacho(data || []);
    const { data: dc } = await supabase.from('despacho_cortes').select('*').order('fecha', { ascending: false }).limit(300);
    setCortesDespacho(dc || []);
    setEditandoCierre(null);
    setGuardandoCierre(false);
  }

  // ── Agrupaciones ──────────────────────────────────────────
  const inyeccionPorFecha = {};
  lotesInyeccion.forEach(l => {
    if (!inyeccionPorFecha[l.fecha]) inyeccionPorFecha[l.fecha] = [];
    inyeccionPorFecha[l.fecha].push(l);
  });

  const cierrePorFecha = {};
  cierresDespacho.forEach(c => { cierrePorFecha[c.fecha] = c; });

  const cortesPorFecha = {};
  cortesDespacho.forEach(r => {
    if (!cortesPorFecha[r.fecha]) cortesPorFecha[r.fecha] = [];
    cortesPorFecha[r.fecha].push(r);
  });

  const horneadoPorFecha = {};
  lotesHorneado.forEach(l => {
    if (!horneadoPorFecha[l.fecha]) horneadoPorFecha[l.fecha] = [];
    horneadoPorFecha[l.fecha].push(l);
  });

  const todasFechas = Array.from(new Set([
    ...Object.keys(historialAgrupado),
    ...Object.keys(inyeccionPorFecha),
    ...Object.keys(cierrePorFecha),
    ...Object.keys(horneadoPorFecha),
  ])).sort((a, b) => b.localeCompare(a));

  function recargarLocal() {
    setCargando(true);
    Promise.all([
      supabase.from('produccion_inyeccion').select('*, produccion_inyeccion_cortes(*)').eq('estado', 'cerrado').order('fecha', { ascending: false }).limit(60),
      supabase.from('despacho_cierre_dia').select('*').order('fecha', { ascending: false }).limit(60),
      supabase.from('despacho_cortes').select('*').order('fecha', { ascending: false }).limit(300),
      supabase.from('produccion_horneado_lotes').select('*').order('fecha', { ascending: false }).limit(60),
    ]).then(([r1, r2, r3, r4]) => {
      setLotesInyeccion(r1.data || []);
      setCierresDespacho(r2.data || []);
      setCortesDespacho(r3.data || []);
      setLotesHorneado(r4.data || []);
      setCargando(false);
    });
    if (recargarHistorial) recargarHistorial();
  }

  if (cargando) {
    return (
      <div style={{ textAlign:'center', padding:'60px', color:'#aaa' }}>
        <div style={{ fontSize:'32px', marginBottom:'12px' }}>⏳</div>
        <div>Cargando historial...</div>
      </div>
    );
  }

  if (todasFechas.length === 0) {
    return (
      <div style={{ textAlign:'center', padding:'60px', color:'#aaa' }}>
        <div style={{ fontSize:'48px', marginBottom:'12px' }}>📋</div>
        <div style={{ marginBottom:16 }}>Sin registros de producción</div>
        <button onClick={recargarLocal} style={{
          background:'#f0f2f5', border:'1px solid #ddd', borderRadius:8,
          padding:'8px 20px', cursor:'pointer', fontSize:13, color:'#555'
        }}>🔄 Recargar</button>
      </div>
    );
  }

  // Botones disponibles para admin siempre, o para cualquier usuario dentro de 24 h
  function puedeEditar(registro) {
    if (esAdmin) return true;
    const ts = registro.created_at || registro.fecha + 'T23:59:59';
    return (Date.now() - new Date(ts).getTime()) < 24 * 60 * 60 * 1000;
  }

  const btnSm = {
    border:'none', borderRadius:'7px', padding:'6px 11px',
    cursor:'pointer', fontSize:'11px', fontWeight:'bold',
    whiteSpace:'nowrap', marginLeft:'6px'
  };

  return (
    <div>
      {todasFechas.map(fecha => {
        const registros  = historialAgrupado[fecha] || [];
        const inyecs     = inyeccionPorFecha[fecha]  || [];
        const horneados  = horneadoPorFecha[fecha]   || [];
        const kgDia      = registros.reduce((s, r) => s + parseFloat(r.kg_producidos || 0), 0)
                         + horneados.reduce((s, l) => s + parseFloat(l.kg_post_horno || 0), 0);
        const costoDia   = registros.reduce((s, r) => s + parseFloat(r.costo_total    || 0), 0)
                         + horneados.reduce((s, l) => s + parseFloat(l.c_final_kg || 0) * parseFloat(l.kg_post_horno || 0), 0);

        return (
          <div key={fecha} style={{ marginBottom:'16px' }}>

            {/* ── Encabezado fecha ── */}
            <div style={{
              display:'flex', justifyContent:'space-between',
              alignItems:'center', marginBottom:'8px'
            }}>
              <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'14px' }}>
                📅 {new Date(fecha + 'T12:00:00').toLocaleDateString('es-EC', {
                  weekday:'long', year:'numeric', month:'long', day:'numeric'
                })}
              </div>
              <div style={{ fontSize:'12px', color:'#888' }}>
                Total:{' '}
                <strong style={{ color:'#27ae60' }}>{kgDia.toFixed(1)} kg</strong>
                {' · '}
                <strong style={{ color:'#f39c12' }}>${costoDia.toFixed(2)}</strong>
              </div>
            </div>

            {/* ── Lotes inyección ── */}
            {inyecs.map(lote => (
              <div key={'inj-'+lote.id} style={{
                background:'white', borderRadius:'10px',
                padding:'14px', marginBottom:'8px',
                boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                border:'1.5px solid #2980b9'
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:'bold', color:'#1a3a5c', fontSize:'14px' }}>
                        💉 {lote.formula_salmuera}
                      </span>
                      <span style={{ background:'#eaf4fb', color:'#1a3a5c', padding:'2px 8px', borderRadius:'6px', fontSize:'10px', fontWeight:700 }}>
                        inyección
                      </span>
                    </div>
                  </div>
                  {puedeEditar(lote) && (
                    <button
                      onClick={async () => {
                        if (!window.confirm('¿Revertir este lote? Se restaurará el inventario.')) return;
                        try {
                          const { data: invActual } = await supabase.from('inventario_mp').select('materia_prima_id,stock_kg');
                          for (const ing of (lote.produccion_inyeccion_ingredientes || [])) {
                            if (!ing.materia_prima_id || parseFloat(ing.kg_usados) <= 0) continue;
                            const inv = (invActual || []).find(i => i.materia_prima_id === ing.materia_prima_id);
                            if (inv) await supabase.from('inventario_mp').update({ stock_kg: parseFloat(inv.stock_kg) + parseFloat(ing.kg_usados) }).eq('materia_prima_id', ing.materia_prima_id);
                          }
                          for (const c of (lote.produccion_inyeccion_cortes || [])) {
                            if (!c.materia_prima_id || parseFloat(c.kg_carne_cruda) <= 0) continue;
                            const inv = (invActual || []).find(i => i.materia_prima_id === c.materia_prima_id);
                            if (inv) await supabase.from('inventario_mp').update({ stock_kg: parseFloat(inv.stock_kg) + parseFloat(c.kg_carne_cruda) }).eq('materia_prima_id', c.materia_prima_id);
                          }
                          await supabase.from('produccion_inyeccion').update({ estado: 'revertido' }).eq('id', lote.id);
                          setLotesInyeccion(prev => prev.filter(l => l.id !== lote.id));
                        } catch(e) { alert('Error al revertir: ' + e.message); }
                      }}
                      style={{ ...btnSm, background:'#f8d7da', color:'#721c24', border:'1px solid #f5c6c6' }}>
                      ↩️ Revertir
                    </button>
                  )}
                </div>
                <div style={{ display:'flex', gap:'16px', fontSize:'12px', color:'#555', flexWrap:'wrap', marginTop:6 }}>
                  <span>🥩 <strong>{parseFloat(lote.kg_carne_total).toFixed(2)} kg</strong> carne</span>
                  <span>🧂 <strong>{parseFloat(lote.kg_salmuera_requerida).toFixed(3)} kg</strong> salmuera preparada</span>
                  <span>👤 {lote.usuario_nombre}</span>
                </div>
                {(lote.produccion_inyeccion_cortes || []).length > 0 && (
                  <details style={{ marginTop:8 }}>
                    <summary style={{ fontSize:'11px', color:'#2980b9', cursor:'pointer' }}>
                      Ver cortes ({lote.produccion_inyeccion_cortes.length})
                    </summary>
                    <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                      {(() => {
                        const mermas = lote.produccion_inyeccion_cortes.map(c => {
                          const inj  = parseFloat(c.kg_carne_limpia || 0) + parseFloat(c.kg_retazos || 0);
                          const post = parseFloat(c.kg_carne_limpia || 0);
                          return inj > 0 ? ((inj - post) / inj) * 100 : 0;
                        });
                        const maxMerma = Math.max(...mermas);
                        return lote.produccion_inyeccion_cortes.map((c, i) => {
                          const pct = mermas[i];
                          const esMayor = pct > 0 && pct === maxMerma;
                          return (
                            <span key={i} style={{
                              background: esMayor ? '#fdecea' : '#f0f2f5',
                              padding:'3px 10px', borderRadius:6, fontSize:10,
                              color: esMayor ? '#c0392b' : '#555',
                              fontWeight: esMayor ? 'bold' : 'normal',
                              border: esMayor ? '1px solid #e74c3c' : '1px solid transparent'
                            }}>
                              {c.corte_nombre}: {esMayor && '↑'}{pct > 0 ? ` ${pct.toFixed(1)}% merma` : ' sin datos'}
                            </span>
                          );
                        });
                      })()}
                    </div>
                  </details>
                )}
                {lote.notas && <div style={{ marginTop:6, fontSize:12, color:'#888', fontStyle:'italic' }}>📝 {lote.notas}</div>}
              </div>
            ))}

            {/* ── Lotes horneado ── */}
            {horneados.map(lote => (
              <div key={'hrn-'+lote.id} style={{
                background:'white', borderRadius:'10px',
                padding:'14px', marginBottom:'8px',
                boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                border:'1.5px solid #e74c3c'
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:6 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
                      <span style={{ fontWeight:'bold', color:'#7b241c', fontSize:'14px' }}>
                        🔥 {lote.producto_nombre || 'Horneado'}
                      </span>
                      <span style={{ background:'#fdecea', color:'#7b241c', padding:'2px 8px', borderRadius:'6px', fontSize:'10px', fontWeight:700 }}>
                        horneado
                      </span>
                      <span style={{ fontSize:'11px', color:'#aaa' }}>Lote {lote.lote_id}</span>
                    </div>
                    <div style={{ display:'flex', gap:'16px', fontSize:'12px', color:'#555', flexWrap:'wrap' }}>
                      <span>⚖️ <strong style={{ color:'#27ae60' }}>{parseFloat(lote.kg_post_horno || 0).toFixed(3)} kg</strong> finales</span>
                      <span>💰 <strong style={{ color:'#e74c3c' }}>${parseFloat(lote.c_final_kg || 0).toFixed(4)}/kg</strong></span>
                      <span>🔥 merma {parseFloat(lote.merma_horno_pct || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                  {puedeEditar(lote) && (
                    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                      <button
                        onClick={() => {
                          setEditandoHorneado(lote);
                          setKgEntradaEdit(String(parseFloat(lote.kg_entrada_horno || 0)));
                          setKgHornoEdit(String(parseFloat(lote.kg_post_horno || 0)));
                          setErrorH('');
                        }}
                        style={{ ...btnSm, background:'#fff3cd', color:'#856404', border:'1px solid #f0c040' }}>
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => revertirHorneado(lote)}
                        disabled={guardandoH}
                        style={{ ...btnSm, background:'#f8d7da', color:'#721c24', border:'1px solid #f5c6c6' }}>
                        ↩️ Revertir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* ── Cierre de despacho del día ── */}
            {(() => {
              const cierre   = cierrePorFecha[fecha];
              const cortesD  = cortesPorFecha[fecha] || [];
              const mermaDia = cortesD.reduce((s, r) => s + Math.max(0, (r.peso_antes||0)-(r.peso_funda||0)-(r.peso_remanente||0)), 0);
              if (!cierre && cortesD.length === 0) return null;

              const totalIdent = cierre ? (parseFloat(cierre.peso_hueso||0) + parseFloat(cierre.peso_aserrin||0) + parseFloat(cierre.peso_carnudo||0)) : 0;
              const mermaEnMaq = mermaDia - totalIdent;

              const porCorte = {};
              cortesD.forEach(r => {
                const m = Math.max(0, (r.peso_antes||0)-(r.peso_funda||0)-(r.peso_remanente||0));
                if (!porCorte[r.corte_nombre]) porCorte[r.corte_nombre] = { n:0, merma:0 };
                porCorte[r.corte_nombre].n++;
                porCorte[r.corte_nombre].merma += m;
              });

              return (
                <div style={{ background:'white', borderRadius:10, padding:14, marginBottom:8, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', border:'1.5px solid #e67e22' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontWeight:'bold', color:'#d35400', fontSize:14 }}>📦 Despacho y Fraccionamiento</span>
                    <button onClick={() => {
                      setFormCierre({ hueso: String(cierre?.peso_hueso||''), aserrin: String(cierre?.peso_aserrin||''), carnudo: String(cierre?.peso_carnudo||'') });
                      setEditandoCierre({ cierre, fecha });
                    }} style={{ background:'#fff3cd', border:'1px solid #f39c12', borderRadius:7, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:'bold', color:'#856404' }}>
                      ✏️ Editar cierre
                    </button>
                  </div>
                  {Object.entries(porCorte).map(([nombre, d]) => (
                    <div key={nombre} style={{ fontSize:12, color:'#555', marginBottom:3, display:'flex', gap:10 }}>
                      <span>🥩 {nombre} <span style={{ color:'#888' }}>({d.n} corte{d.n!==1?'s':''})</span></span>
                      <span style={{ color:'#e74c3c', fontWeight:'bold' }}>merma: {d.merma.toFixed(3)} kg</span>
                    </div>
                  ))}
                  {mermaDia > 0 && (
                    <div style={{ borderTop:'1px solid #f0f0f0', marginTop:8, paddingTop:8, display:'flex', flexWrap:'wrap', gap:14, fontSize:12 }}>
                      <span style={{ color:'#e74c3c', fontWeight:'bold' }}>Total merma: {mermaDia.toFixed(3)} kg</span>
                      {cierre ? (<>
                        <span style={{ color:'#555' }}>🦴 Hueso: <b>{parseFloat(cierre.peso_hueso||0).toFixed(3)} kg</b></span>
                        <span style={{ color:'#856404' }}>🪵 Aserrín: <b>{parseFloat(cierre.peso_aserrin||0).toFixed(3)} kg</b></span>
                        <span style={{ color:'#155724' }}>🥩 Carnudo: <b>{parseFloat(cierre.peso_carnudo||0).toFixed(3)} kg</b></span>
                        <span style={{ color:'#8e44ad', fontWeight:'bold' }}>🔧 En máquina: {mermaEnMaq.toFixed(3)} kg</span>
                      </>) : (
                        <span style={{ color:'#aaa', fontStyle:'italic' }}>Sin cierre registrado</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Registros produccion_diaria ── */}
            {registros.map(r => (
              <div key={r.id} style={{
                background:'white', borderRadius:'10px',
                padding:'14px', marginBottom:'8px',
                boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                border:'1px solid #f0f0f0'
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'6px', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:'14px' }}>
                        {r.producto_nombre}
                      </span>
                      <span style={{
                        background:
                          r.turno === 'mañana' ? '#fff3cd' :
                          r.turno === 'tarde'  ? '#fde8e8' : '#e8f4fd',
                        color:
                          r.turno === 'mañana' ? '#856404' :
                          r.turno === 'tarde'  ? '#721c24' : '#1a5276',
                        padding:'2px 8px', borderRadius:'6px',
                        fontSize:'10px', fontWeight:'700'
                      }}>
                        {r.turno === 'mañana' ? '🌅' :
                         r.turno === 'tarde'  ? '🌇' : '🌙'} {r.turno}
                      </span>
                      {r.editado && (
                        <span style={{ background:'#f3e5f5', color:'#6c3483', padding:'2px 8px', borderRadius:'6px', fontSize:'10px' }}>editado</span>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:'16px', fontSize:'12px', color:'#555', flexWrap:'wrap' }}>
                      <span>🔢 <strong>{r.num_paradas}</strong> paradas</span>
                      <span>⚖️ <strong style={{ color:'#27ae60' }}>{parseFloat(r.kg_producidos || 0).toFixed(1)} kg</strong></span>
                      <span>💰 <strong style={{ color:'#f39c12' }}>${parseFloat(r.costo_total || 0).toFixed(2)}</strong></span>
                      <span>👤 {r.usuario_nombre}</span>
                    </div>
                    {r.nota && (
                      <div style={{ marginTop:'6px', fontSize:'12px', color:'#888', fontStyle:'italic' }}>📝 {r.nota}</div>
                    )}
                    {r.ingredientes_usados && r.ingredientes_usados.length > 0 && (
                      <details style={{ marginTop:'8px' }}>
                        <summary style={{ fontSize:'11px', color:'#3498db', cursor:'pointer' }}>
                          Ver ingredientes usados ({r.ingredientes_usados.length})
                        </summary>
                        <div style={{ marginTop:'6px', display:'flex', flexWrap:'wrap', gap:'4px' }}>
                          {r.ingredientes_usados.map((ing, i) => (
                            <span key={i} style={{ background:'#f0f2f5', padding:'2px 8px', borderRadius:'6px', fontSize:'10px', color:'#555' }}>
                              {ing.ingrediente_nombre}: {parseFloat(ing.kg_usados).toFixed(2)} kg
                            </span>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Botones admin / ventana 24h */}
                  {puedeEditar(r) && (
                    <div style={{ display:'flex', gap:4, flexShrink:0, marginLeft:8 }}>
                      <button
                        onClick={() => { setEditandoRegistro(r); setNotaEdit(r.nota || ''); }}
                        style={{ ...btnSm, background:'#fff3cd', color:'#856404', border:'1px solid #f0c040' }}>
                        ✏️ Nota
                      </button>
                      <button
                        onClick={() => setModalRevertir(r)}
                        style={{ ...btnSm, background:'#f8d7da', color:'#721c24', border:'1px solid #f5c6c6' }}>
                        ↩️ Revertir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* ══ Modal editar lote horneado ══ */}
      {editandoHorneado && (() => {
        const lote        = editandoHorneado;
        const costoTotal  = parseFloat(lote.c_final_kg) * parseFloat(lote.kg_post_horno);
        const kgEnt       = parseFloat(kgEntradaEdit) || 0;
        const kgPost      = parseFloat(kgHornoEdit)   || 0;
        const mermaKg     = Math.max(0, kgEnt - kgPost);
        const mermaPct    = kgEnt > 0 ? (mermaKg / kgEnt) * 100 : 0;
        const nuevoCFinal = kgPost > 0 ? costoTotal / kgPost : 0;
        const valido      = kgPost > 0 && kgEnt > 0 && kgPost <= kgEnt;

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:440, boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
              <div style={{ fontWeight:'bold', fontSize:16, color:'#1a1a2e', marginBottom:2 }}>
                ✏️ Editar lote — {lote.lote_id}
              </div>
              <div style={{ fontSize:11, color:'#aaa', marginBottom:16 }}>
                Costo total del batch: <strong>${costoTotal.toFixed(4)}</strong> (se preserva)
              </div>

              {/* Kg entrada */}
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'#2980b9', display:'block', marginBottom:4 }}>
                  🔥 Kg de entrada al horno
                </label>
                <input
                  type="number" min="0.001" step="0.001"
                  value={kgEntradaEdit}
                  onChange={e => setKgEntradaEdit(e.target.value)}
                  placeholder="0.000"
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #2980b9', fontSize:15, textAlign:'right', outline:'none', boxSizing:'border-box' }}
                />
              </div>

              {/* Kg post-horno */}
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'#27ae60', display:'block', marginBottom:4 }}>
                  ⚖️ Kg finales (post-horno)
                </label>
                <input
                  type="number" min="0.001" step="0.001"
                  value={kgHornoEdit}
                  onChange={e => setKgHornoEdit(e.target.value)}
                  placeholder="0.000"
                  style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #27ae60', fontSize:15, textAlign:'right', outline:'none', boxSizing:'border-box' }}
                />
              </div>

              {/* Preview recalculate */}
              {kgEnt > 0 && kgPost > 0 && (
                <div style={{ background: kgPost > kgEnt ? '#fdecea' : '#eafaf1', borderRadius:10, padding:'12px 14px', marginBottom:12, fontSize:12, border:`1.5px solid ${kgPost > kgEnt ? '#f5b7b1' : '#a9dfbf'}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ color:'#555' }}>Merma horneado</span>
                    <span style={{ fontWeight:700, color:'#e74c3c' }}>
                      {mermaKg.toFixed(3)} kg ({mermaPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ color:'#555' }}>Costo total batch</span>
                    <strong>${costoTotal.toFixed(4)}</strong>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', borderTop:'1px solid #ddd', paddingTop:6, marginTop:2 }}>
                    <span style={{ color: nuevoCFinal > 0 ? '#27ae60' : '#e74c3c' }}>Nuevo C_final/kg</span>
                    <span style={{ color: nuevoCFinal > 0 ? '#27ae60' : '#e74c3c', fontSize:16 }}>
                      ${nuevoCFinal.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}

              {errorH && (
                <div style={{ background:'#fdecea', color:'#c0392b', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:10 }}>
                  {errorH}
                </div>
              )}

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setEditandoHorneado(null)} style={{ background:'#f0f2f5', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>
                  Cancelar
                </button>
                <button
                  onClick={guardarEdicionHorneado}
                  disabled={guardandoH || !valido}
                  style={{ background: (guardandoH || !valido) ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)', color:'white', border:'none', borderRadius:8, padding:'10px 24px', cursor: (guardandoH || !valido) ? 'default' : 'pointer', fontSize:13, fontWeight:'bold' }}>
                  {guardandoH ? 'Guardando...' : '✅ Guardar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Modal editar nota registro ══ */}
      {editandoRegistro && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight:'bold', fontSize:16, color:'#1a1a2e', marginBottom:4 }}>
              ✏️ Editar — {editandoRegistro.producto_nombre}
            </div>
            <div style={{ fontSize:12, color:'#888', marginBottom:16 }}>
              {editandoRegistro.fecha} · {editandoRegistro.num_paradas} paradas · {parseFloat(editandoRegistro.kg_producidos).toFixed(1)} kg
            </div>

            <label style={{ fontSize:12, fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>
              Nota / observación
            </label>
            <textarea
              value={notaEdit}
              onChange={e => setNotaEdit(e.target.value)}
              rows={3}
              placeholder="Agrega una nota o corrección..."
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12 }}
            />

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setEditandoRegistro(null)} style={{ background:'#f0f2f5', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>
                Cancelar
              </button>
              <button
                onClick={guardarNota}
                disabled={guardandoReg}
                style={{ background: guardandoReg ? '#aaa' : 'linear-gradient(135deg,#2980b9,#1a5276)', color:'white', border:'none', borderRadius:8, padding:'10px 24px', cursor: guardandoReg ? 'default' : 'pointer', fontSize:13, fontWeight:'bold' }}>
                {guardandoReg ? 'Guardando...' : '✅ Guardar nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal editar cierre despacho ══ */}
      {editandoCierre && (() => {
        const cortesD  = cortesPorFecha[editandoCierre.fecha] || [];
        const mermaDia = cortesD.reduce((s, r) => s + Math.max(0, (r.peso_antes||0)-(r.peso_funda||0)-(r.peso_remanente||0)), 0);
        const totalIdent = parseFloat(formCierre.hueso||0) + parseFloat(formCierre.aserrin||0) + parseFloat(formCierre.carnudo||0);
        const mermaEnMaq = mermaDia - totalIdent;
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'white', borderRadius:16, padding:24, width:'100%', maxWidth:460, boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}>
              <div style={{ fontWeight:'bold', fontSize:16, color:'#1a1a2e', marginBottom:4 }}>✏️ Editar cierre — {editandoCierre.fecha}</div>
              <div style={{ fontSize:12, color:'#888', marginBottom:16 }}>Merma total del día: <strong style={{ color:'#e74c3c' }}>{mermaDia.toFixed(3)} kg</strong></div>

              {[
                { label:'🦴 Peso hueso / no reutilizable (kg)', key:'hueso',   color:'#555'    },
                { label:'🪵 Peso aserrín (kg)',                  key:'aserrin', color:'#856404' },
                { label:'🥩 Peso carnudo (kg)',                  key:'carnudo', color:'#155724' },
              ].map(({ label, key, color }) => (
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={{ fontSize:12, fontWeight:600, color, display:'block', marginBottom:4 }}>{label}</label>
                  <input type="number" min="0" step="0.001"
                    value={formCierre[key]}
                    onChange={e => setFormCierre(p => ({ ...p, [key]: e.target.value }))}
                    placeholder="0.000"
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14, textAlign:'right', outline:'none', boxSizing:'border-box' }} />
                </div>
              ))}

              {mermaDia > 0 && (
                <div style={{ background: mermaEnMaq < 0 ? '#fdecea' : '#f0f8ff', borderRadius:10, padding:'10px 14px', marginBottom:16, border:`1.5px solid ${mermaEnMaq < 0 ? '#e74c3c' : '#aed6f1'}`, fontSize:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span>Merma total registrada</span><span style={{ fontWeight:'bold', color:'#e74c3c' }}>{mermaDia.toFixed(3)} kg</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span>Identificado (hueso+aserrín+carnudo)</span><span style={{ fontWeight:'bold', color:'#27ae60' }}>{totalIdent.toFixed(3)} kg</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:'bold', borderTop:'1px solid #ddd', paddingTop:6, marginTop:4 }}>
                    <span>🔧 Merma en máquina/utensilios</span>
                    <span style={{ color: mermaEnMaq < 0 ? '#e74c3c' : '#8e44ad' }}>{mermaEnMaq.toFixed(3)} kg</span>
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setEditandoCierre(null)} style={{ background:'#f0f2f5', border:'none', borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancelar</button>
                <button onClick={guardarEdicionCierre} disabled={guardandoCierre} style={{ background: guardandoCierre ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)', color:'white', border:'none', borderRadius:8, padding:'10px 24px', cursor: guardandoCierre?'default':'pointer', fontSize:13, fontWeight:'bold' }}>
                  {guardandoCierre ? 'Guardando...' : '✅ Guardar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
