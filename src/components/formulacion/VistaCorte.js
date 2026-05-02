// VistaCorte.js — CORTES: Costos 1 kg | Pruebas | Producción | Historial
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function VistaCorte({ producto, mobile, onAbrirInyeccion }) {
  const [tabActivo,       setTabActivo]       = useState('costos');
  const [cargando,        setCargando]        = useState(true);

  // Data
  const [mpVinculada,     setMpVinculada]     = useState(null);
  const [lotesStock,      setLotesStock]      = useState([]);
  const [historialInj,    setHistorialInj]    = useState([]);
  const [mpsEmpaque,      setMpsEmpaque]      = useState([]);
  const [mpsEtiqueta,     setMpsEtiqueta]     = useState([]);

  // Padre/Hijo
  const [tipo,            setTipo]            = useState(null); // 'padre' | 'hijo' | 'independiente'
  const [deshueseConfig,  setDeshueseConfig]  = useState(null);
  const [padreInfo,       setPadreInfo]       = useState(null);

  // Precios subproductos
  const [precioResSegunda, setPrecioResSegunda] = useState(0);
  const [precioPuntas,     setPrecioPuntas]     = useState(0);

  // Config persistida
  const [versiones,   setVersiones]   = useState([]);
  const [guardando,   setGuardando]   = useState(false);

  // Config inputs — padre
  const [pctInj, setPctInj] = useState('');
  const [pctMad, setPctMad] = useState('');

  // Config inputs — hijo
  const [costoMadPadre,  setCostoMadPadre]  = useState('');
  const [kgEntrada,      setKgEntrada]      = useState('100');
  const [pctResSegunda,  setPctResSegunda]  = useState('');
  const [pctPuntas,      setPctPuntas]      = useState('');
  const [pctDesecho,     setPctDesecho]     = useState('');

  // Pruebas
  const [pruebaGramos,  setPruebaGramos]  = useState('');
  const [pruebaEmpSel,  setPruebaEmpSel]  = useState('');
  const [pruebaEtiSel,  setPruebaEtiSel]  = useState('');

  useEffect(() => { cargarTodo(); }, [producto.nombre, producto.mp_vinculado_id]);

  async function cargarTodo() {
    setCargando(true);
    try {
      // 1. Detectar padre/hijo
      const [{ data: asPadre }, { data: asHijo }] = await Promise.all([
        supabase.from('deshuese_config').select('*').eq('corte_padre', producto.nombre).eq('activo', true).limit(3),
        supabase.from('deshuese_config').select('*').eq('corte_hijo',  producto.nombre).eq('activo', true).limit(3),
      ]);
      const esPadre = (asPadre || []).length > 0;
      const esHijo  = (asHijo  || []).length > 0;
      const tipoDetectado = esPadre ? 'padre' : esHijo ? 'hijo' : 'independiente';
      setTipo(tipoDetectado);
      const cfgEntry = esPadre ? (asPadre || [])[0] : (asHijo || [])[0];
      setDeshueseConfig(cfgEntry || null);

      // 2. MP vinculada
      if (producto.mp_vinculado_id) {
        const { data: mp } = await supabase.from('materias_primas').select('*').eq('id', producto.mp_vinculado_id).single();
        setMpVinculada(mp || null);
      } else {
        const { data: mps } = await supabase.from('materias_primas').select('*').ilike('nombre_producto', `%${producto.nombre}%`).limit(1);
        setMpVinculada((mps || [])[0] || null);
      }

      // 3. Lotes stock
      const { data: lotes } = await supabase
        .from('stock_lotes_inyectados').select('*')
        .ilike('corte_nombre', `%${producto.nombre}%`)
        .order('fecha_entrada', { ascending: false }).limit(30);
      setLotesStock(lotes || []);

      // 4. Historial inyección
      let qInj = supabase
        .from('produccion_inyeccion_cortes')
        .select('*, produccion_inyeccion(fecha, formula_salmuera, estado, porcentaje_inyeccion)')
        .order('created_at', { ascending: false }).limit(20);
      qInj = producto.mp_vinculado_id
        ? qInj.eq('materia_prima_id', producto.mp_vinculado_id)
        : qInj.eq('corte_nombre', producto.nombre);
      const { data: injData } = await qInj;
      setHistorialInj(injData || []);

      // 5. Si es hijo → buscar costo_mad_kg del padre
      let encontroPadreReal = false;
      if (esHijo && cfgEntry?.corte_padre) {
        const { data: padreL } = await supabase
          .from('stock_lotes_inyectados').select('costo_mad_kg, lote_id, fecha_entrada')
          .ilike('corte_nombre', `%${cfgEntry.corte_padre}%`)
          .gt('costo_mad_kg', 0)
          .order('fecha_entrada', { ascending: false }).limit(1);
        if ((padreL || []).length > 0) {
          encontroPadreReal = true;
          setPadreInfo(padreL[0]);
          setCostoMadPadre(parseFloat(padreL[0].costo_mad_kg).toFixed(4));
        }
      }

      // 6. Precios Res Segunda + Puntas
      const { data: mpSubp } = await supabase.from('materias_primas')
        .select('nombre, nombre_producto, precio_kg, codigo')
        .or('nombre_producto.ilike.%res segunda%,nombre.ilike.%res segunda%,nombre_producto.ilike.%puntas%,nombre.ilike.%puntas%')
        .limit(6);
      if (mpSubp) {
        const resS = (mpSubp || []).find(m => (m.nombre_producto || m.nombre || '').toLowerCase().includes('segunda'));
        const punt = (mpSubp || []).find(m => (m.nombre_producto || m.nombre || '').toLowerCase().includes('punt'));
        if (resS) setPrecioResSegunda(parseFloat(resS.precio_kg || 0));
        if (punt) setPrecioPuntas(parseFloat(punt.precio_kg || 0));
      }

      // 7. Empaque / Etiqueta
      const { data: mpsAll } = await supabase.from('materias_primas')
        .select('id, nombre, nombre_producto, precio_kg, categoria')
        .or('categoria.ilike.%empaque%,categoria.ilike.%etiqueta%,categoria.ilike.%funda%')
        .eq('eliminado', false);
      if (mpsAll) {
        setMpsEmpaque((mpsAll || []).filter(m => {
          const cat = (m.categoria || '').toUpperCase();
          return cat.includes('EMPAQUE') || cat.includes('ENVASE') || cat.includes('FUNDA');
        }));
        setMpsEtiqueta((mpsAll || []).filter(m => (m.categoria || '').toUpperCase().includes('ETIQUETA')));
      }

      // 8. Config guardada
      const { data: cfg } = await supabase
        .from('vista_horneado_config').select('*')
        .eq('producto_nombre', producto.nombre).maybeSingle();
      if (cfg) {
        setVersiones(cfg.versiones || []);
        const c = cfg.config || {};
        if (c.pct_inj)        setPctInj(String(c.pct_inj));
        if (c.pct_mad)        setPctMad(String(c.pct_mad));
        if (c.pct_res_segunda) setPctResSegunda(String(c.pct_res_segunda));
        if (c.pct_puntas)     setPctPuntas(String(c.pct_puntas));
        if (c.pct_desecho)    setPctDesecho(String(c.pct_desecho));
        // costo_mad_padre: solo usar si no encontramos info real del padre
        if (c.costo_mad_padre && !encontroPadreReal) setCostoMadPadre(String(c.costo_mad_padre));
      }
    } catch (e) {
      console.error('VistaCorte cargarTodo:', e);
    }
    setCargando(false);
  }

  async function guardarConfig() {
    setGuardando(true);
    const newConfig = {
      pct_inj:         parseFloat(pctInj)         || 0,
      pct_mad:         parseFloat(pctMad)          || 0,
      pct_res_segunda: parseFloat(pctResSegunda)   || 0,
      pct_puntas:      parseFloat(pctPuntas)        || 0,
      pct_desecho:     parseFloat(pctDesecho)       || 0,
      costo_mad_padre: parseFloat(costoMadPadre)   || 0,
      tipo,
      _updated: new Date().toISOString(),
    };
    const { data: existing } = await supabase
      .from('vista_horneado_config').select('id, versiones')
      .eq('producto_nombre', producto.nombre).maybeSingle();
    if (existing) {
      await supabase.from('vista_horneado_config')
        .update({ config: newConfig, versiones: existing.versiones || versiones })
        .eq('id', existing.id);
    } else {
      await supabase.from('vista_horneado_config')
        .insert({ producto_nombre: producto.nombre, producto_id: producto.id, config: newConfig, versiones: [] });
    }
    setGuardando(false);
  }

  async function guardarVersionPrueba() {
    const gramos = parseFloat(pruebaGramos) || 0;
    if (!gramos) return;
    const cBase = getCFinal();
    const empMp = mpsEmpaque.find(m => String(m.id) === pruebaEmpSel);
    const etiMp = mpsEtiqueta.find(m => String(m.id) === pruebaEtiSel);
    const costoEmp = parseFloat(empMp?.precio_kg || 0);
    const costoEti = parseFloat(etiMp?.precio_kg || 0);
    const nuevaVer = {
      tipo: 'prueba',
      gramos_funda: gramos,
      emp_id: pruebaEmpSel || null,
      emp_nombre: empMp ? (empMp.nombre_producto || empMp.nombre) : null,
      eti_id: pruebaEtiSel || null,
      eti_nombre: etiMp ? (etiMp.nombre_producto || etiMp.nombre) : null,
      c_base: cBase,
      c_total: gramos * cBase + costoEmp + costoEti,
      fecha: new Date().toISOString().split('T')[0],
    };
    const nuevasVersiones = [nuevaVer, ...versiones].slice(0, 10);
    const { data: existing } = await supabase
      .from('vista_horneado_config').select('id')
      .eq('producto_nombre', producto.nombre).maybeSingle();
    if (existing) {
      await supabase.from('vista_horneado_config').update({ versiones: nuevasVersiones }).eq('id', existing.id);
    } else {
      await supabase.from('vista_horneado_config')
        .insert({ producto_nombre: producto.nombre, producto_id: producto.id, config: {}, versiones: nuevasVersiones });
    }
    setVersiones(nuevasVersiones);
  }

  function computeCLimpio() {
    const cMadP  = parseFloat(costoMadPadre) || 0;
    const kgEnt  = parseFloat(kgEntrada)     || 0;
    const pctRS  = parseFloat(pctResSegunda) || 0;
    const pctPu  = parseFloat(pctPuntas)     || 0;
    const pctDe  = parseFloat(pctDesecho)    || 0;
    const kgResS = kgEnt * pctRS / 100;
    const kgPun  = kgEnt * pctPu / 100;
    const kgDes  = kgEnt * pctDe / 100;
    const kgHijo = kgEnt - kgResS - kgPun - kgDes;
    const costoEntrada = kgEnt * cMadP;
    const valorResS    = kgResS * precioResSegunda;
    const valorPun     = kgPun  * precioPuntas;
    const cLimpio      = kgHijo > 0 ? (costoEntrada - valorResS - valorPun) / kgHijo : 0;
    return { kgEnt, kgResS, kgPun, kgDes, kgHijo, costoEntrada, valorResS, valorPun, cLimpio };
  }

  function getCFinal() {
    if (tipo === 'hijo') return computeCLimpio().cLimpio;
    const lotesConCosto = lotesStock.filter(l => parseFloat(l.costo_mad_kg || 0) > 0);
    return lotesConCosto.length > 0 ? parseFloat(lotesConCosto[0].costo_mad_kg) : 0;
  }

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>⏳ Cargando...</div>
  );

  const cFinalActual   = getCFinal();
  const pruebaGramosN  = parseFloat(pruebaGramos)  || 0;
  const pruebaEmpMp    = mpsEmpaque.find(m => String(m.id) === pruebaEmpSel);
  const pruebaEtiMp    = mpsEtiqueta.find(m => String(m.id) === pruebaEtiSel);
  const pruebaEmp      = parseFloat(pruebaEmpMp?.precio_kg || 0);
  const pruebaEti      = parseFloat(pruebaEtiMp?.precio_kg || 0);
  const pruebaCarne    = pruebaGramosN * cFinalActual;
  const pruebaTotal    = pruebaCarne + pruebaEmp + pruebaEti;
  const versionesPruebas = versiones.filter(v => v.tipo === 'prueba');

  const refH = historialInj.find(h => parseFloat(h.kg_carne_cruda) > 0);
  const costoSalPorKg = refH
    ? parseFloat(refH.costo_salmuera_asignado || 0) / Math.max(parseFloat(refH.kg_carne_cruda || 1), 0.001)
    : 0;
  const precioCarne = parseFloat(mpVinculada?.precio_kg || 0);

  // ── render ──
  const tabs = [
    ['costos',    '📐 Costos 1 kg'],
    ['pruebas',   '🧪 Pruebas'],
    ['produccion','📦 Producción'],
    ['historial', '📋 Historial'],
  ];

  return (
    <div style={{ padding: mobile ? '10px' : '0' }}>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'white', borderRadius: 10, padding: 4, marginBottom: 14, gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTabActivo(key)} style={{
            flex: 1, padding: '9px 4px', border: 'none', borderRadius: 7, cursor: 'pointer',
            fontSize: mobile ? 11 : 13, fontWeight: 'bold',
            background: tabActivo === key ? '#6c3483' : 'transparent',
            color:      tabActivo === key ? 'white'   : '#666',
            transition: 'all 0.2s',
          }}>{label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          TAB COSTOS 1 KG
      ══════════════════════════════════════════ */}
      {tabActivo === 'costos' && (
        <div>
          {/* Badge tipo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {tipo === 'padre' && (
              <span style={{ background: '#1a3a5c', color: 'white', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>👑 Corte Padre</span>
            )}
            {tipo === 'hijo' && (
              <span style={{ background: '#6c3483', color: 'white', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>🔀 Corte Hijo</span>
            )}
            {tipo === 'independiente' && (
              <span style={{ background: '#e67e22', color: 'white', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>🥩 Corte</span>
            )}
            {deshueseConfig && tipo === 'padre' && (
              <span style={{ fontSize: 11, color: '#888' }}>→ genera <strong>{deshueseConfig.corte_hijo}</strong></span>
            )}
            {deshueseConfig && tipo === 'hijo' && (
              <span style={{ fontSize: 11, color: '#888' }}>← derivado de <strong>{deshueseConfig.corte_padre}</strong></span>
            )}
          </div>

          {/* MP Vinculada */}
          {mpVinculada && (
            <div style={{ background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>MP Vinculada</div>
                <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: 13 }}>{mpVinculada.nombre_producto || mpVinculada.nombre}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#888' }}>Precio actual</div>
                <div style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 15 }}>${parseFloat(mpVinculada.precio_kg || 0).toFixed(4)}/kg</div>
              </div>
            </div>
          )}

          {/* ── PADRE / INDEPENDIENTE ── */}
          {(tipo === 'padre' || tipo === 'independiente') && (() => {
            const pctInjN = parseFloat(pctInj) || 0;
            const pctMadN = parseFloat(pctMad) || 0;
            const kgSal1  = pctInjN / 100;
            const kgInj1  = 1 + kgSal1;
            const kgLost  = kgInj1 * pctMadN / 100;
            const kgMad1  = kgInj1 - kgLost;
            const cIny    = kgInj1 > 0 ? (precioCarne + costoSalPorKg) / kgInj1 : 0;
            const cMadSim = kgMad1 > 0 ? (precioCarne + costoSalPorKg) / kgMad1 : 0;
            const lotesConCMad = lotesStock.filter(l => parseFloat(l.costo_mad_kg || 0) > 0);
            const ultimoCMad   = lotesConCMad[0] ? parseFloat(lotesConCMad[0].costo_mad_kg) : 0;

            return (
              <>
                {/* Fase 1: Inyección */}
                <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                  <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', padding: '10px 16px' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>💉 Fase 1 — Inyección de Salmuera</span>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>% Inyección configurado</label>
                        <input type="number" min="0" max="100" step="0.1"
                          placeholder={refH ? `Último real: ${parseFloat(refH.produccion_inyeccion?.porcentaje_inyeccion || 0).toFixed(1)}%` : 'ej: 20'}
                          value={pctInj} onChange={e => setPctInj(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #2980b9', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ background: '#f0f8ff', borderRadius: 8, padding: '10px 12px', border: '1px solid #aed6f1' }}>
                        <div style={{ fontSize: 10, color: '#888' }}>Costo salmuera/kg carne</div>
                        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#2980b9' }}>
                          {costoSalPorKg > 0 ? `$${costoSalPorKg.toFixed(4)}` : '—'}
                        </div>
                        <div style={{ fontSize: 9, color: '#aaa' }}>del último lote real</div>
                      </div>
                    </div>

                    {pctInjN > 0 && precioCarne > 0 && (
                      <div style={{ background: '#f0f8ff', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 }}>Para 1 kg de carne:</div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          {[
                            { label: '1.000 kg', sub: 'Carne cruda', color: '#7f8c8d' },
                            '→',
                            { label: `+${kgSal1.toFixed(3)} kg`, sub: 'Salmuera', color: '#2980b9' },
                            '→',
                            { label: `${kgInj1.toFixed(3)} kg`, sub: 'Total inj.', color: '#1a3a5c' },
                          ].map((n, i) => n === '→'
                            ? <span key={i} style={{ color: '#bbb' }}>→</span>
                            : <div key={i} style={{ textAlign: 'center', background: 'white', borderRadius: 8, padding: '6px 10px', border: `1.5px solid ${n.color}30` }}>
                                <div style={{ fontWeight: 700, color: n.color, fontSize: 12 }}>{n.label}</div>
                                <div style={{ fontSize: 9, color: '#888' }}>{n.sub}</div>
                              </div>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#555', borderTop: '1px solid #dde3ea', paddingTop: 8 }}>
                          C_iny = (${precioCarne.toFixed(4)} + ${costoSalPorKg.toFixed(4)}) ÷ {kgInj1.toFixed(3)} kg =&nbsp;
                          <strong style={{ color: '#1a3a5c', fontSize: 14 }}>${cIny.toFixed(4)}/kg</strong>
                          <span style={{ color: '#27ae60', marginLeft: 8, fontSize: 11 }}>→ viaja a Maduración</span>
                        </div>
                      </div>
                    )}

                    {refH && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#888', background: '#f8f9fa', borderRadius: 8, padding: '7px 10px' }}>
                        Último lote real: {refH.produccion_inyeccion?.fecha} · {parseFloat(refH.kg_carne_cruda||0).toFixed(2)} kg · {refH.produccion_inyeccion?.formula_salmuera}
                      </div>
                    )}
                  </div>
                </div>

                {/* Fase 2: Maduración */}
                <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                  <div style={{ background: 'linear-gradient(135deg,#1a6b3c,#27ae60)', padding: '10px 16px' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🧊 Fase 2 — Maduración</span>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>% Merma Maduración</label>
                        <input type="number" min="0" max="100" step="0.1"
                          placeholder="ej: 3.5"
                          value={pctMad} onChange={e => setPctMad(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #27ae60', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ background: '#f0fff4', borderRadius: 8, padding: '10px 12px', border: '1px solid #a9dfbf' }}>
                        <div style={{ fontSize: 10, color: '#888' }}>Último C_mad real/kg</div>
                        <div style={{ fontSize: 15, fontWeight: 'bold', color: '#27ae60' }}>
                          {ultimoCMad > 0 ? `$${ultimoCMad.toFixed(4)}` : '—'}
                        </div>
                        {lotesConCMad[0] && <div style={{ fontSize: 9, color: '#aaa' }}>Lote {lotesConCMad[0].lote_id}</div>}
                      </div>
                    </div>

                    {pctMadN > 0 && pctInjN > 0 && precioCarne > 0 && (
                      <div style={{ background: '#f0fff4', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1a6b3c', marginBottom: 8 }}>Para 1 kg de carne → post maduración:</div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          {[
                            { label: `${kgInj1.toFixed(3)} kg`, sub: 'Inyectado', color: '#2980b9' },
                            '→',
                            { label: `−${kgLost.toFixed(3)} kg`, sub: `Merma ${pctMadN}%`, color: '#e74c3c' },
                            '→',
                            { label: `${kgMad1.toFixed(3)} kg`, sub: 'Post-mad', color: '#27ae60' },
                          ].map((n, i) => n === '→'
                            ? <span key={i} style={{ color: '#bbb' }}>→</span>
                            : <div key={i} style={{ textAlign: 'center', background: 'white', borderRadius: 8, padding: '6px 10px', border: `1.5px solid ${n.color}30` }}>
                                <div style={{ fontWeight: 700, color: n.color, fontSize: 12 }}>{n.label}</div>
                                <div style={{ fontSize: 9, color: '#888' }}>{n.sub}</div>
                              </div>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#555', borderTop: '1px solid #c8e6c9', paddingTop: 8 }}>
                          C_mad simulado = ${(precioCarne + costoSalPorKg).toFixed(4)} ÷ {kgMad1.toFixed(3)} kg =&nbsp;
                          <strong style={{ color: '#1a6b3c', fontSize: 14 }}>${cMadSim.toFixed(4)}/kg</strong>
                        </div>
                      </div>
                    )}

                    {/* Resultado costo_mad_kg */}
                    <div style={{ background: ultimoCMad > 0 ? 'linear-gradient(135deg,#1a6b3c,#27ae60)' : '#f8f9fa', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: ultimoCMad > 0 ? 'rgba(255,255,255,0.7)' : '#888', marginBottom: 4 }}>
                        costo_mad_kg — referencia para Pruebas y para el Hijo
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 'bold', color: ultimoCMad > 0 ? '#f9e79f' : '#ccc' }}>
                        {ultimoCMad > 0 ? `$${ultimoCMad.toFixed(4)}/kg` : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: ultimoCMad > 0 ? 'rgba(255,255,255,0.6)' : '#aaa', marginTop: 4 }}>
                        {ultimoCMad > 0 ? `Último lote real · ${lotesConCMad[0]?.fecha_entrada}` : 'Confirma el pesaje en Producción › Maduración'}
                      </div>
                    </div>
                  </div>
                </div>

                <button onClick={guardarConfig} disabled={guardando} style={{
                  width: '100%', padding: '12px', background: guardando ? '#aaa' : '#6c3483',
                  color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold',
                  cursor: guardando ? 'default' : 'pointer', marginBottom: 12,
                }}>
                  {guardando ? '⏳ Guardando...' : '💾 Guardar configuración'}
                </button>
              </>
            );
          })()}

          {/* ── HIJO ── */}
          {tipo === 'hijo' && (() => {
            const { kgEnt, kgResS, kgPun, kgDes, kgHijo, costoEntrada, valorResS, valorPun, cLimpio } = computeCLimpio();
            return (
              <>
                {/* Costo de entrada del padre */}
                <div style={{ background: '#f0f8ff', borderRadius: 10, padding: '12px 16px', marginBottom: 12, border: '1px solid #aed6f1' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 }}>
                    👑 Costo entrada — desde {deshueseConfig?.corte_padre || 'producto padre'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>costo_mad_kg del padre ($/kg)</label>
                      <input type="number" min="0" step="0.0001"
                        placeholder="ej: 4.5000"
                        value={costoMadPadre} onChange={e => setCostoMadPadre(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #2980b9', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
                      {padreInfo && (
                        <div style={{ fontSize: 10, color: '#27ae60', marginTop: 2 }}>
                          Último real del padre: ${parseFloat(padreInfo.costo_mad_kg).toFixed(4)}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>kg entrada a deshuese</label>
                      <input type="number" min="0" step="0.001"
                        placeholder="ej: 100"
                        value={kgEntrada} onChange={e => setKgEntrada(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #e67e22', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Base de simulación</div>
                    </div>
                  </div>
                </div>

                {/* Deshuese config */}
                <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
                  <div style={{ background: 'linear-gradient(135deg,#8e44ad,#6c3483)', padding: '10px 16px' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🔪 Deshuese — Distribución</span>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
                      {[
                        ['% Res Segunda', pctResSegunda, setPctResSegunda, '#27ae60', precioResSegunda],
                        ['% Puntas',      pctPuntas,     setPctPuntas,     '#e67e22', precioPuntas],
                        ['% Desecho',     pctDesecho,    setPctDesecho,    '#e74c3c', 0],
                      ].map(([label, val, setter, color, precio]) => (
                        <div key={label}>
                          <label style={{ fontSize: 10, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>{label}</label>
                          <input type="number" min="0" max="100" step="0.1"
                            placeholder="0" value={val} onChange={e => setter(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: 8, border: `2px solid ${color}`, fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box', textAlign: 'right' }} />
                          {precio > 0 && <div style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>Precio: ${precio.toFixed(4)}/kg</div>}
                        </div>
                      ))}
                    </div>

                    {kgEnt > 0 && (
                      <>
                        <div style={{ background: '#f9f5ff', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6c3483', marginBottom: 8 }}>Para {kgEnt} kg entrada:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px 16px', fontSize: 12, lineHeight: 2.2 }}>
                            <div>🟢 Res Segunda: <strong style={{ color: '#27ae60' }}>{kgResS.toFixed(3)} kg</strong></div>
                            <div>🟡 Puntas: <strong style={{ color: '#e67e22' }}>{kgPun.toFixed(3)} kg</strong></div>
                            <div>🔴 Desecho: <strong style={{ color: '#e74c3c' }}>{kgDes.toFixed(3)} kg</strong></div>
                            <div>🥩 <strong>{producto.nombre}</strong>: <strong style={{ color: '#6c3483', fontSize: 14 }}>{kgHijo.toFixed(3)} kg</strong></div>
                          </div>
                        </div>

                        {parseFloat(costoMadPadre) > 0 && kgHijo > 0 && (
                          <div style={{ background: '#f0f4f8', borderRadius: 10, padding: '12px 14px', marginBottom: 10, fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: '#1a3a5c', marginBottom: 6 }}>Cálculo C_limpio:</div>
                            <div style={{ color: '#555', lineHeight: 2 }}>
                              <div>Costo entrada: <strong>${costoEntrada.toFixed(4)}</strong></div>
                              <div style={{ color: '#27ae60' }}>− Crédito Res Segunda: <strong>${valorResS.toFixed(4)}</strong></div>
                              <div style={{ color: '#27ae60' }}>− Crédito Puntas: <strong>${valorPun.toFixed(4)}</strong></div>
                              <div style={{ color: '#888', fontSize: 11 }}>÷ {kgHijo.toFixed(3)} kg ({producto.nombre})</div>
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #dde3ea' }}>
                                <span style={{ fontWeight: 'bold', fontSize: 16, color: '#6c3483' }}>C_limpio = ${cLimpio.toFixed(4)}/kg</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {cLimpio > 0 && (
                          <div style={{ background: 'linear-gradient(135deg,#6c3483,#8e44ad)', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Costo de {producto.nombre}</div>
                            <div style={{ fontSize: 26, fontWeight: 'bold', color: '#f9e79f' }}>${cLimpio.toFixed(4)}/kg</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <button onClick={guardarConfig} disabled={guardando} style={{
                  width: '100%', padding: '12px', background: guardando ? '#aaa' : '#6c3483',
                  color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold',
                  cursor: guardando ? 'default' : 'pointer', marginBottom: 12,
                }}>
                  {guardando ? '⏳ Guardando...' : '💾 Guardar configuración'}
                </button>
              </>
            );
          })()}

          {onAbrirInyeccion && (
            <button onClick={onAbrirInyeccion} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              💉 Ir a Producción — Inyección
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB PRUEBAS
      ══════════════════════════════════════════ */}
      {tabActivo === 'pruebas' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#1a5276', fontSize: 15 }}>Simulador — Costo por Funda</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                Costo base: {cFinalActual > 0 ? <strong style={{ color: '#27ae60' }}>${cFinalActual.toFixed(4)}/kg</strong> : <span style={{ color: '#e74c3c' }}>sin datos — configura Costos 1 kg</span>}
              </div>
            </div>
            {pruebaGramosN > 0 && pruebaTotal > 0 && (
              <button onClick={guardarVersionPrueba} style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                💾 Guardar versión
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Peso por funda (kg)</label>
              <input type="number" min="0" step="0.001"
                placeholder="ej: 0.400"
                value={pruebaGramos} onChange={e => setPruebaGramos(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #27ae60', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }} />
              {pruebaGramosN > 0 && cFinalActual > 0 && (
                <div style={{ fontSize: 10, color: '#27ae60', marginTop: 2 }}>Carne/funda: ${pruebaCarne.toFixed(4)}</div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#2980b9', display: 'block', marginBottom: 4 }}>Empaque / Funda</label>
              <select value={pruebaEmpSel} onChange={e => setPruebaEmpSel(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #2980b9', fontSize: 13, background: 'white', boxSizing: 'border-box' }}>
                <option value="">— sin empaque —</option>
                {mpsEmpaque.map(m => (
                  <option key={m.id} value={String(m.id)}>{m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/u</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#8e44ad', display: 'block', marginBottom: 4 }}>Etiqueta</label>
              <select value={pruebaEtiSel} onChange={e => setPruebaEtiSel(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #8e44ad', fontSize: 13, background: 'white', boxSizing: 'border-box' }}>
                <option value="">— sin etiqueta —</option>
                {mpsEtiqueta.map(m => (
                  <option key={m.id} value={String(m.id)}>{m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/u</option>
                ))}
              </select>
            </div>
          </div>

          {pruebaGramosN > 0 && cFinalActual > 0 ? (
            <div style={{ background: 'linear-gradient(135deg,#6c3483,#8e44ad)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8, fontWeight: 'bold' }}>
                COSTO — funda de {(pruebaGramosN * 1000).toFixed(0)}g
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)' }}>
                  <span>🥩 Carne ({pruebaGramosN} kg × ${cFinalActual.toFixed(4)}/kg)</span>
                  <span style={{ fontWeight: 'bold' }}>${pruebaCarne.toFixed(4)}</span>
                </div>
                {pruebaEmp > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)' }}>
                    <span>📦 {pruebaEmpMp?.nombre_producto || pruebaEmpMp?.nombre}</span>
                    <span style={{ fontWeight: 'bold' }}>${pruebaEmp.toFixed(4)}</span>
                  </div>
                )}
                {pruebaEti > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.85)' }}>
                    <span>🏷️ {pruebaEtiMp?.nombre_producto || pruebaEtiMp?.nombre}</span>
                    <span style={{ fontWeight: 'bold' }}>${pruebaEti.toFixed(4)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 14, color: 'white' }}>TOTAL FUNDA</span>
                  <span style={{ fontWeight: 'bold', fontSize: 22, color: '#f9e79f' }}>${pruebaTotal.toFixed(4)}</span>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {[['30%', 0.70], ['35%', 0.65], ['40%', 0.60]].map(([pct, div]) => (
                  <div key={pct} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>Margen {pct}</div>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: '#f9e79f' }}>${(pruebaTotal / div).toFixed(4)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 20px', color: '#aaa', fontSize: 13, background: 'white', borderRadius: 12, border: '1px dashed #ddd', marginBottom: 14 }}>
              Ingresa el peso por funda para ver el costo
            </div>
          )}

          {versionesPruebas.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>📚 Versiones guardadas</div>
              {versionesPruebas.map((v, i) => (
                <div key={i} onClick={() => {
                  setPruebaGramos(String(v.gramos_funda));
                  if (v.emp_id) setPruebaEmpSel(String(v.emp_id));
                  if (v.eti_id) setPruebaEtiSel(String(v.eti_id));
                }} style={{ background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 8, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#333', fontSize: 12 }}>{(v.gramos_funda * 1000).toFixed(0)}g por funda</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {v.fecha} · ${v.c_total?.toFixed(4) || '—'}/funda
                      {v.emp_nombre && ` · ${v.emp_nombre}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#aaa' }}>cargar →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB PRODUCCIÓN
      ══════════════════════════════════════════ */}
      {tabActivo === 'produccion' && (
        <div>
          {lotesStock.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', background: 'white', borderRadius: 12 }}>
              Sin lotes madurados registrados
            </div>
          ) : (() => {
            const l = lotesStock[0];
            const kgInj  = parseFloat(l.kg_inyectado  || 0);
            const kgMad  = parseFloat(l.kg_inicial     || 0);
            const kgDisp = parseFloat(l.kg_disponible  || l.kg_inicial || 0);
            const mermaP = kgInj > 0 ? ((kgInj - kgMad) / kgInj * 100).toFixed(1) : null;
            const cIny   = parseFloat(l.costo_iny_kg  || 0);
            const cMad   = parseFloat(l.costo_mad_kg  || 0);
            const cTotal = parseFloat(l.costo_total   || 0);
            return (
              <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <div style={{ background: 'linear-gradient(135deg,#1a6b3c,#27ae60)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📦 Último Lote en Stock</span>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 'bold' }}>{l.lote_id}</span>
                </div>
                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 12 }}>
                    {[
                      ['Fecha entrada',  l.fecha_entrada, '#1a6b3c'],
                      ['KG disponible',  `${kgDisp.toFixed(3)} kg`, '#27ae60'],
                      ['KG inyectado',   kgInj > 0 ? `${kgInj.toFixed(3)} kg` : '—', '#2980b9'],
                      ['KG madurado',    `${kgMad.toFixed(3)} kg`, '#1a6b3c'],
                      ['Merma',          mermaP !== null ? `${mermaP}%` : '—', '#e74c3c'],
                      ['C_mad/kg',       cMad > 0 ? `$${cMad.toFixed(4)}` : '—', '#27ae60'],
                      ['C_iny/kg',       cIny > 0 ? `$${cIny.toFixed(4)}` : '—', '#2980b9'],
                      ['Costo total',    cTotal > 0 ? `$${cTotal.toFixed(4)}` : '—', '#555'],
                    ].map(([lbl, val, color]) => (
                      <div key={lbl} style={{ background: '#f8f9fa', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontWeight: 'bold', color, fontSize: 14 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {l.formula_salmuera && (
                    <div style={{ fontSize: 11, color: '#888', background: '#f8f9fa', borderRadius: 8, padding: '7px 10px' }}>
                      Fórmula salmuera: <strong>{l.formula_salmuera}</strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB HISTORIAL
      ══════════════════════════════════════════ */}
      {tabActivo === 'historial' && (
        <div>
          {lotesStock.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa', background: 'white', borderRadius: 12 }}>
              Sin historial de producción
            </div>
          ) : (
            lotesStock.map((l, i) => {
              const kgInj  = parseFloat(l.kg_inyectado  || 0);
              const kgMad  = parseFloat(l.kg_inicial     || 0);
              const kgDisp = parseFloat(l.kg_disponible  || l.kg_inicial || 0);
              const mermaP = kgInj > 0 ? ((kgInj - kgMad) / kgInj * 100).toFixed(1) : null;
              const cIny   = parseFloat(l.costo_iny_kg  || 0);
              const cMad   = parseFloat(l.costo_mad_kg  || 0);
              const cTotal = parseFloat(l.costo_total   || 0);
              return (
                <details key={l.id || i} style={{ background: 'white', borderRadius: 10, marginBottom: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <summary style={{ padding: '12px 16px', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: '#1a1a2e', marginRight: 10 }}>{l.lote_id}</span>
                      <span style={{ fontSize: 11, color: '#888' }}>{l.fecha_entrada}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {cMad > 0 && <span style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 13 }}>${cMad.toFixed(4)}/kg</span>}
                      <span style={{ fontWeight: 'bold', color: '#555' }}>{kgDisp.toFixed(2)} kg</span>
                      <span style={{ color: '#bbb' }}>▼</span>
                    </div>
                  </summary>
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px 20px', fontSize: 12, lineHeight: 2.2, color: '#555' }}>
                      <div>💉 KG Inyectado: <strong>{kgInj > 0 ? `${kgInj.toFixed(3)} kg` : '—'}</strong></div>
                      <div>🧊 KG Madurado: <strong>{kgMad.toFixed(3)} kg</strong></div>
                      {mermaP !== null && <div>📉 Merma: <strong style={{ color: '#e74c3c' }}>{mermaP}%</strong></div>}
                      <div>📦 KG disponible: <strong>{kgDisp.toFixed(3)} kg</strong></div>
                      {cTotal > 0 && <div>💰 Costo total: <strong>${cTotal.toFixed(4)}</strong></div>}
                      {cIny > 0 && <div>📊 C_iny/kg: <strong style={{ color: '#2980b9' }}>${cIny.toFixed(4)}</strong></div>}
                      {cMad > 0 && <div>📊 C_mad/kg: <strong style={{ color: '#27ae60' }}>${cMad.toFixed(4)}</strong></div>}
                      {l.formula_salmuera && <div>🧂 Fórmula: <strong>{l.formula_salmuera}</strong></div>}
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
