// ============================================
// VistaCorte.js
// Vista de fórmula para productos CORTES
// Muestra historial de costos de inyección
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function VistaCorte({ producto, mobile, onAbrirInyeccion }) {
  const [historial,      setHistorial]      = useState([]);
  const [cargando,       setCargando]       = useState(true);
  const [mpVinculada,    setMpVinculada]    = useState(null);
  const [mermaSimPct,    setMermaSimPct]    = useState('');
  const [precioRetazo,   setPrecioRetazo]   = useState(0);
  const [kgSalmueraX1kg, setKgSalmueraX1kg] = useState(0);
  const [tabActivo,      setTabActivo]      = useState('costos');
  const [todosCortes,    setTodosCortes]    = useState([]);

  useEffect(() => {
    supabase
      .from('produccion_inyeccion_cortes')
      .select('*, produccion_inyeccion ( fecha, formula_salmuera, estado )')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const filtrados = (data || []).filter(r =>
          r.produccion_inyeccion?.estado === 'cerrado' &&
          parseFloat(r.kg_carne_limpia) > 0
        );
        setTodosCortes(filtrados);
      });
  }, []);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      // Últimas 10 producciones de inyección para este corte
      // Preferir match por materia_prima_id (vínculo exacto), fallback por nombre
      let q = supabase
        .from('produccion_inyeccion_cortes')
        .select('*, produccion_inyeccion ( fecha, formula_salmuera, porcentaje_inyeccion, estado, kg_carne_total, kg_salmuera_requerida )')
        .order('created_at', { ascending: false })
        .limit(10);
      q = producto.mp_vinculado_id
        ? q.eq('materia_prima_id', producto.mp_vinculado_id)
        : q.eq('corte_nombre', producto.nombre);
      const { data } = await q;
      setHistorial(data || []);

      // MP vinculada (para precio de referencia)
      if (producto.mp_vinculado_id) {
        const { data: mp } = await supabase
          .from('materias_primas').select('*').eq('id', producto.mp_vinculado_id).single();
        setMpVinculada(mp);
      } else {
        // buscar por nombre
        const { data: mps } = await supabase
          .from('materias_primas').select('*')
          .ilike('nombre_producto', `%${producto.nombre}%`).limit(1);
        if (mps && mps.length > 0) setMpVinculada(mps[0]);
      }
      // Precio retazo para simulación
      const { data: ret } = await supabase.from('materias_primas')
        .select('precio_kg').eq('nombre', 'Retazos Cortes').limit(1);
      if (ret?.[0]) setPrecioRetazo(parseFloat(ret[0].precio_kg) || 0);

      // Kg de salmuera para 1 kg: leer total de la fórmula usada en el último lote
      const ultimaFormula = (data || [])[0]?.produccion_inyeccion?.formula_salmuera;
      if (ultimaFormula) {
        const { data: ings } = await supabase.from('formulaciones')
          .select('kilos').eq('producto_nombre', ultimaFormula);
        const totalKg = (ings || []).reduce((s, r) => s + (parseFloat(r.kilos) || 0), 0);
        setKgSalmueraX1kg(totalKg);
      }

      setCargando(false);
    }
    cargar();
  }, [producto.nombre, producto.mp_vinculado_id]);

  // Referencia: primer registro con datos reales
  const refH = historial.find(h => parseFloat(h.kg_carne_cruda) > 0 && parseFloat(h.kg_carne_limpia) > 0);
  const injRef  = refH ? parseFloat(refH.kg_carne_limpia) + parseFloat(refH.kg_retazos || 0) : 0;
  const pctActual = refH && injRef > 0 ? ((injRef - parseFloat(refH.kg_carne_limpia)) / injRef) * 100 : 0;

  // Simulación para 1 kg con merma personalizada
  const simPct = parseFloat(mermaSimPct) > 0 ? parseFloat(mermaSimPct) : pctActual;
  const simResult = (() => {
    if (!refH || !mpVinculada) return null;
    const salmueraPerKg  = parseFloat(refH.costo_salmuera_asignado || 0) / parseFloat(refH.kg_carne_cruda);
    const costoCarne     = parseFloat(mpVinculada.precio_kg || 0);
    const costoSalmuera  = salmueraPerKg;
    const pesoInj        = 1 + kgSalmueraX1kg;                           // 1 kg carne + kg salmuera de la fórmula para 1 kg
    const mermaKg        = pesoInj * (simPct / 100);
    const pesoPost       = pesoInj - mermaKg;
    const credito        = mermaKg * precioRetazo;
    if (pesoPost <= 0) return null;
    return {
      pesoInj: pesoInj.toFixed(3),
      pesoPost: pesoPost.toFixed(3),
      mermaKg: mermaKg.toFixed(3),
      credito: credito.toFixed(4),
      costoFinal: ((costoCarne + costoSalmuera - credito) / pesoPost).toFixed(4),
    };
  })();

  const historico_costos = historial
    .filter(h => parseFloat(h.costo_final_kg) > 0)
    .map(h => parseFloat(h.costo_final_kg));
  const costoPromedio = historico_costos.length > 0
    ? historico_costos.reduce((a, b) => a + b, 0) / historico_costos.length
    : 0;
  const ultimoCosto = historial.length > 0 ? parseFloat(historial[0]?.costo_final_kg || 0) : 0;

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando historial...</div>
  );

  // Mermas cerradas para tab historial mermas
  const mermasHistorial = historial.filter(h => {
    const inj = parseFloat(h.kg_carne_limpia || 0) + parseFloat(h.kg_retazos || 0);
    return h.produccion_inyeccion?.estado === 'cerrado' && inj > 0;
  }).map(h => {
    const inj     = parseFloat(h.kg_carne_limpia) + parseFloat(h.kg_retazos || 0);
    const post    = parseFloat(h.kg_carne_limpia);
    const mermaKg = inj - post;
    const pct     = (mermaKg / inj) * 100;
    return { ...h, inj, post, mermaKg, pct };
  });
  const maxPctMerma = mermasHistorial.length > 0 ? Math.max(...mermasHistorial.map(m => m.pct)) : 0;
  const minPctMerma = mermasHistorial.length > 0 ? Math.min(...mermasHistorial.map(m => m.pct)) : 0;

  return (
    <div style={{ padding: mobile ? '10px' : '0' }}>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', background: 'white', borderRadius: 10, padding: 4, marginBottom: 14, gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {[['costos', '📐 Costos e Inyección'], ['mermas', '📉 Historial Mermas']].map(([key, label]) => (
          <button key={key} onClick={() => setTabActivo(key)} style={{
            flex: 1, padding: '9px 12px', border: 'none', borderRadius: 7, cursor: 'pointer',
            fontSize: 13, fontWeight: 'bold',
            background: tabActivo === key ? '#6c3483' : 'transparent',
            color:      tabActivo === key ? 'white'   : '#666',
            transition: 'all 0.2s'
          }}>{label}</button>
        ))}
      </div>

      {/* ── Tab Historial Mermas (todos los cortes, agrupados por fecha) ── */}
      {tabActivo === 'mermas' && (() => {
        // Calcular merma para cada registro
        const conM = todosCortes.map(r => {
          const inj     = parseFloat(r.kg_carne_limpia || 0) + parseFloat(r.kg_retazos || 0);
          const post    = parseFloat(r.kg_carne_limpia || 0);
          const mermaKg = Math.max(0, inj - post);
          const pct     = inj > 0 ? (mermaKg / inj) * 100 : 0;
          return { ...r, inj, post, mermaKg, pct };
        });
        // Agrupar por produccion_id para tendencia por corte
        const porCorteNombre = {};
        conM.forEach(r => {
          if (!porCorteNombre[r.corte_nombre]) porCorteNombre[r.corte_nombre] = [];
          porCorteNombre[r.corte_nombre].push(r);
        });
        // Agrupar por fecha
        const porFecha = {};
        conM.forEach(r => {
          const f = r.produccion_inyeccion?.fecha || '—';
          if (!porFecha[f]) porFecha[f] = [];
          porFecha[f].push(r);
        });
        const fechas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a));

        if (fechas.length === 0) return (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', background: 'white', borderRadius: 12 }}>
            Sin cierres registrados aún.
          </div>
        );

        return (
          <div>
            {fechas.map(fecha => {
              const filas = porFecha[fecha];
              const maxPct = Math.max(...filas.map(f => f.pct));
              return (
                <div key={fecha} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 8 }}>
                    📅 {fecha} — {filas[0]?.produccion_inyeccion?.formula_salmuera} · {filas.length} corte(s)
                  </div>
                  <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ background: '#6c3483', padding: '8px 14px' }}>
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📉 Mermas del lote</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                          {['Corte', 'Kg Carne', 'Inyectado', 'Post-Corte', 'Merma kg', '% Merma', 'Tendencia'].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Corte' ? 'left' : 'right', color: '#555', fontWeight: 700, borderBottom: '1px solid #e0e0e0', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((m, i) => {
                          const lista = porCorteNombre[m.corte_nombre] || [];
                          const idxEnLista = lista.indexOf(m);
                          const prev = lista[idxEnLista + 1];
                          const esMayor = m.pct > 0 && m.pct === maxPct;
                          let tIcon = null, tColor = '#888';
                          if (prev) {
                            if (m.pct > prev.pct + 0.5)      { tIcon = '↑'; tColor = '#e74c3c'; }
                            else if (m.pct < prev.pct - 0.5) { tIcon = '↓'; tColor = '#27ae60'; }
                            else                              { tIcon = '='; tColor = '#aaa'; }
                          }
                          return (
                            <tr key={m.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '9px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>🥩 {m.corte_nombre}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#555' }}>{parseFloat(m.kg_carne_cruda || 0).toFixed(2)}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#2980b9' }}>{m.inj.toFixed(3)}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right' }}>{m.post.toFixed(3)}</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', color: '#e67e22', fontWeight: 'bold' }}>{m.mermaKg.toFixed(3)} kg</td>
                              <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                                <span style={{ fontWeight: 'bold', fontSize: 13, color: esMayor ? '#e74c3c' : '#e67e22' }}>
                                  {esMayor ? '↑ ' : ''}{m.pct.toFixed(1)}%
                                </span>
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                                {tIcon ? (
                                  <span style={{ fontWeight: 'bold', fontSize: 16, color: tColor }}>{tIcon}</span>
                                ) : (
                                  <span style={{ color: '#ccc', fontSize: 10 }}>primera</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Tab Costos ── */}
      {tabActivo === 'costos' && <>

      {/* Precio de referencia MP */}
      {mpVinculada && (
        <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Materia prima vinculada</div>
            <div style={{ fontWeight: 'bold', color: '#1a1a2e' }}>{mpVinculada.nombre_producto || mpVinculada.nombre}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#888' }}>Precio referencia</div>
            <div style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 16 }}>${parseFloat(mpVinculada.precio_kg || 0).toFixed(4)}/kg</div>
          </div>
        </div>
      )}

      {/* Resumen costos */}
      {historial.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ background: '#1a3a5c', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Último costo/kg</div>
            <div style={{ fontWeight: 'bold', color: '#f39c12', fontSize: 22 }}>
              {ultimoCosto > 0 ? `$${ultimoCosto.toFixed(4)}` : '—'}
            </div>
          </div>
          <div style={{ background: '#27ae60', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Costo promedio ({historico_costos.length} prod.)</div>
            <div style={{ fontWeight: 'bold', color: 'white', fontSize: 22 }}>
              {costoPromedio > 0 ? `$${costoPromedio.toFixed(4)}` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Fórmula de costo */}
      <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: '#555', border: '1px solid #e0e0e0' }}>
        <div style={{ fontWeight: 'bold', color: '#1a1a2e', marginBottom: 6, fontSize: 13 }}>📐 Fórmula de costo (Inyección)</div>
        <div style={{ lineHeight: 1.8 }}>
          Costo Final/kg = <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>[(Costo Carne + Costo Salmuera) − Ingreso Retazos]</span>
          {' ÷ '}
          <span style={{ color: '#27ae60', fontWeight: 'bold' }}>kg Carne Limpia</span>
        </div>
      </div>

      {/* Merma: fórmula + % actual + simulador */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.4fr 0.8fr 1.4fr', gap: 10, marginBottom: 12 }}>

        {/* Fórmula */}
        <div style={{ background: '#fff8f0', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#555', border: '1px solid #f5cba7' }}>
          <div style={{ fontWeight: 'bold', color: '#784212', marginBottom: 6, fontSize: 13 }}>📉 Fórmula de Merma</div>
          <div style={{ lineHeight: 2 }}>
            Merma kg = <span style={{ color: '#2980b9', fontWeight: 'bold' }}>Inyectado</span> − <span style={{ color: '#27ae60', fontWeight: 'bold' }}>Post-Corte</span>
          </div>
          <div style={{ lineHeight: 2 }}>
            % Merma = (<span style={{ color: '#e74c3c', fontWeight: 'bold' }}>Merma ÷ Inyectado</span>) × 100
          </div>
        </div>

        {/* % Actual */}
        <div style={{ background: pctActual > 15 ? '#fdecea' : '#fff8f0', borderRadius: 10, padding: '12px 14px', border: `1px solid ${pctActual > 15 ? '#e74c3c' : '#f5cba7'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>% Merma actual</div>
          <div style={{ fontSize: 30, fontWeight: 'bold', color: pctActual > 15 ? '#e74c3c' : '#e67e22', lineHeight: 1 }}>
            {pctActual > 0 ? `${pctActual.toFixed(1)}%` : '—'}
          </div>
          {pctActual > 15 && <div style={{ fontSize: 10, color: '#e74c3c', marginTop: 4 }}>↑ Alta</div>}
        </div>

        {/* Simulador */}
        <div style={{ background: '#f0f8ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #aed6f1' }}>
          <div style={{ fontWeight: 'bold', color: '#1a5276', marginBottom: 8, fontSize: 13 }}>🧪 Prueba (1 kg)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input
              type="number" min="0" max="100" step="0.1"
              placeholder={pctActual > 0 ? pctActual.toFixed(1) : '0.0'}
              value={mermaSimPct}
              onChange={e => setMermaSimPct(e.target.value)}
              style={{ width: '70px', padding: '6px 8px', borderRadius: 7, border: '1.5px solid #2980b9', fontSize: 14, textAlign: 'right', fontWeight: 'bold' }}
            />
            <span style={{ fontSize: 13, color: '#555' }}>% merma</span>
          </div>
          {simResult ? (
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
              <div>Inyectado: <strong>{simResult.pesoInj} kg</strong></div>
              <div>Post-corte: <strong>{simResult.pesoPost} kg</strong></div>
              <div>Merma: <strong style={{ color: '#e74c3c' }}>{simResult.mermaKg} kg</strong></div>
              <div>Crédito retazo: <strong style={{ color: '#27ae60' }}>${simResult.credito}</strong></div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 'bold', color: '#1a5276' }}>
                Costo/kg: ${simResult.costoFinal}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#aaa' }}>Sin datos de referencia</div>
          )}
        </div>
      </div>

      {/* Historial producciones */}
      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
        <div style={{ background: '#6c3483', padding: '8px 14px' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📋 Historial de Producciones</span>
        </div>
        {historial.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#aaa', fontSize: 13 }}>
            Sin producciones registradas para este corte.<br/>
            <span style={{ fontSize: 12 }}>Registra producciones desde el módulo de Inyección.</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {(() => {
              const mermas = historial.map(h => {
                const inj  = parseFloat(h.kg_carne_limpia || 0) + parseFloat(h.kg_retazos || 0);
                const post = parseFloat(h.kg_carne_limpia || 0);
                return inj > 0 ? ((inj - post) / inj) * 100 : 0;
              });
              const maxMerma = Math.max(...mermas);
              return (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {['Fecha', 'Salmuera', 'Kg Carne', 'Peso Inyectado (kg)', 'Peso Post-Corte (kg)', 'Kg Retazo', 'Costo kg/Retazo', 'Costo/kg', '% Merma', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Fecha' || h === 'Salmuera' ? 'left' : 'right', color: '#555', fontWeight: 700, borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => {
                  const prod = h.produccion_inyeccion;
                  const costoFinal = parseFloat(h.costo_final_kg || 0);
                  const pctMerma = mermas[i];
                  const esMayorMerma = pctMerma > 0 && pctMerma === maxMerma;
                  return (
                    <tr key={h.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>{prod?.fecha || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#555', fontSize: 11 }}>{prod?.formula_salmuera || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 600 }}>{parseFloat(h.kg_carne_cruda || 0).toFixed(2)}</div>
                        {prod?.kg_carne_total > 0 && (
                          <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>Lote: {parseFloat(prod.kg_carne_total).toFixed(2)}</div>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2980b9' }}>
                        <div style={{ fontWeight: 600 }}>{(parseFloat(h.kg_carne_limpia || 0) + parseFloat(h.kg_retazos || 0)).toFixed(2)}</div>
                        {parseFloat(h.costo_salmuera_asignado || 0) > 0 && (
                          <div style={{ fontSize: 10, color: '#8e44ad', marginTop: 1 }}>Salmuera: ${parseFloat(h.costo_salmuera_asignado).toFixed(4)}</div>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{parseFloat(h.kg_carne_limpia || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e67e22' }}>
                        <div style={{ fontWeight: 600 }}>{parseFloat(h.kg_retazos || 0).toFixed(2)}</div>
                        {parseFloat(h.ingreso_retazos || 0) > 0 && (
                          <div style={{ fontSize: 10, color: '#27ae60', marginTop: 1 }}>Crédito: ${parseFloat(h.ingreso_retazos).toFixed(4)}</div>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#8e44ad' }}>
                        {parseFloat(h.precio_venta_retazo_kg || 0) > 0 ? `$${parseFloat(h.precio_venta_retazo_kg).toFixed(4)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: costoFinal > 0 ? '#27ae60' : '#aaa' }}>
                        {costoFinal > 0 ? `$${costoFinal.toFixed(4)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        {pctMerma > 0 ? (
                          <span style={{ fontWeight: 'bold', color: esMayorMerma ? '#e74c3c' : '#e67e22' }}>
                            {esMayorMerma && <span style={{ marginRight: 2 }}>↑</span>}
                            {pctMerma.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        <span style={{ background: { abierto: '#d4edda', cerrado: '#cce5ff', revertido: '#fdecea' }[prod?.estado] || '#f5f5f5', color: { abierto: '#155724', cerrado: '#004085', revertido: '#721c24' }[prod?.estado] || '#555', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 'bold' }}>
                          {prod?.estado || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              );
            })()}
          </div>
        )}
      </div>

      {/* Botón ir a inyección */}
      {onAbrirInyeccion && (
        <button onClick={onAbrirInyeccion} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>
          💉 Ir a Producción — Inyección de Salmuera
        </button>
      )}

      </>}
    </div>
  );
}
