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
  const [simPeso,        setSimPeso]        = useState('1.000');
  const [simPctInj,      setSimPctInj]      = useState('');
  const [simPctMad,      setSimPctMad]      = useState('');
  const [simPctSie,      setSimPctSie]      = useState('');
  const [simPctAs,       setSimPctAs]       = useState('');
  const [simPctCa,       setSimPctCa]       = useState('');
  const [simPctHu,       setSimPctHu]       = useState('');
  const [simFunda,       setSimFunda]       = useState('');
  const [simEmpSel,      setSimEmpSel]      = useState('');
  const [simEtiSel,      setSimEtiSel]      = useState('');
  const [precioRetazo,   setPrecioRetazo]   = useState(0);
  const [kgSalmueraX1kg, setKgSalmueraX1kg] = useState(0);
  const [tabActivo,      setTabActivo]      = useState('costos');
  const [todosCortes,    setTodosCortes]    = useState([]);
  const [facturas,       setFacturas]       = useState([]);
  const [precioAserrin,  setPrecioAserrin]  = useState(0);
  const [precioCarnudo,  setPrecioCarnudo]  = useState(0);

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
      // Precio retazo para simulación (aserrín como referencia principal)
      const { data: ret } = await supabase.from('materias_primas')
        .select('nombre, precio_kg')
        .in('nombre', ['Aserrín Cortes', 'Retazo Carnudo']);
      if (ret) {
        const as = ret.find(r => r.nombre === 'Aserrín Cortes');
        const ca = ret.find(r => r.nombre === 'Retazo Carnudo');
        setPrecioRetazo(parseFloat(as?.precio_kg || 0));
        setPrecioAserrin(parseFloat(as?.precio_kg || 0));
        setPrecioCarnudo(parseFloat(ca?.precio_kg || 0));
      }

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

  const [lotesStock,      setLotesStock]      = useState([]);
  const [despachoCortes,  setDespachoCortes]  = useState([]);  // Fase 3: todos los registros
  const [cFinalHistorial, setCFinalHistorial] = useState([]);  // Fase 4: registros con c_final
  const [mpsEmpaque,      setMpsEmpaque]      = useState([]);
  const [mpsEtiqueta,     setMpsEtiqueta]     = useState([]);
  const [fase5Funda,      setFase5Funda]      = useState('0.4');
  const [fase5Empaque,    setFase5Empaque]    = useState('');
  const [fase5Etiqueta,   setFase5Etiqueta]   = useState('');

  useEffect(() => {
    supabase.from('stock_lotes_inyectados')
      .select('*')
      .ilike('corte_nombre', `%${producto.nombre}%`)
      .order('fecha_entrada', { ascending: false })
      .limit(10)
      .then(({ data }) => setLotesStock(data || []));

    // Fase 3: todos los registros de despacho (con o sin c_final)
    supabase.from('despacho_cortes')
      .select('*')
      .ilike('corte_nombre', `%${producto.nombre}%`)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setDespachoCortes(data || []);
        // Auto-llenar peso funda con el último peso_funda registrado
        const ultimo = (data || []).find(r => parseFloat(r.peso_funda || 0) > 0);
        if (ultimo) setFase5Funda(String(parseFloat(ultimo.peso_funda).toFixed(3)));
      });

    // Fase 4: registros con c_final calculado (después del cierre)
    supabase.from('despacho_cortes')
      .select('fecha, c_final_kg, c_mad_kg, peso_funda, peso_antes, lote_ref, credito_retazos, kg_aserrin_asig, kg_carnudo_asig, kg_hueso_asig, kg_maq_asig')
      .ilike('corte_nombre', `%${producto.nombre}%`)
      .gt('c_final_kg', 0)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setCFinalHistorial(data || []));

    // Materias primas de empaque y etiqueta (búsqueda flexible por nombre de categoría)
    supabase.from('materias_primas')
      .select('id, nombre, nombre_producto, precio_kg, categoria')
      .or('categoria.ilike.%empaque%,categoria.ilike.%etiqueta%,categoria.ilike.%envase%,categoria.ilike.%funda%')
      .eq('eliminado', false)
      .then(({ data }) => {
        const mps = data || [];
        setMpsEmpaque(mps.filter(m => {
          const cat = m.categoria?.toUpperCase() || '';
          return cat.includes('EMPAQUE') || cat.includes('ENVASE') || cat.includes('FUNDA');
        }));
        setMpsEtiqueta(mps.filter(m => m.categoria?.toUpperCase().includes('ETIQUETA')));
      });
  }, [producto.nombre]);

  // Cargar facturas que coincidan con este corte
  useEffect(() => {
    async function cargarFacturas() {
      const { data: fd } = await supabase
        .from('facturas_detalle')
        .select('*, facturas(numero, created_at, estado)')
        .ilike('producto_nombre', `%${producto.nombre}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      setFacturas(fd || []);
    }
    cargarFacturas();
  }, [producto.nombre]);

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

  // Calcular C_iny desde los campos crudos (no depende de costo_final_kg que puede ser 0 en DB)
  const calcCiny = h => {
    const kgInj  = parseFloat(h.kg_carne_cruda||0) + parseFloat(h.kg_salmuera_asignada||0);
    const costoT = parseFloat(h.costo_carne||0)    + parseFloat(h.costo_salmuera_asignado||0);
    return kgInj > 0 ? costoT / kgInj : 0;
  };
  const historico_costos = historial.map(h => calcCiny(h)).filter(v => v > 0);
  const costoPromedio = historico_costos.length > 0
    ? historico_costos.reduce((a, b) => a + b, 0) / historico_costos.length
    : 0;
  const ultimoCosto = historial.length > 0 ? calcCiny(historial[0]) : 0;

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
        {[['costos', '📐 Costos'], ['pruebas', '🧪 Pruebas'], ['comparador', '📊 Rentabilidad'], ['mermas', '📉 Mermas']].map(([key, label]) => (
          <button key={key} onClick={() => setTabActivo(key)} style={{
            flex: 1, padding: '9px 12px', border: 'none', borderRadius: 7, cursor: 'pointer',
            fontSize: 13, fontWeight: 'bold',
            background: tabActivo === key ? '#6c3483' : 'transparent',
            color:      tabActivo === key ? 'white'   : '#666',
            transition: 'all 0.2s'
          }}>{label}</button>
        ))}
      </div>

      {/* ── Tab Rentabilidad: Comparador Costo vs Factura ── */}
      {tabActivo === 'comparador' && (() => {
        // Para cada factura, buscar el costo de producción más cercano anterior a esa fecha
        const facturasConCosto = facturas.map(f => {
          const fechaFact = f.facturas?.created_at?.split('T')[0] || '';
          const prodRef = historial.find(h => {
            const fp = h.produccion_inyeccion?.fecha || '';
            return parseFloat(h.costo_final_kg) > 0 && fp <= fechaFact;
          });
          const costoRef = parseFloat(prodRef?.costo_final_kg || 0);
          const precioF  = parseFloat(f.precio_unitario || 0);
          const margen   = costoRef > 0 && precioF > 0
            ? ((precioF - costoRef) / precioF) * 100 : null;
          return { ...f, costoRef, precioF, margen, fechaFact };
        });

        const validas    = facturasConCosto.filter(f => f.precioF > 0 && f.costoRef > 0);
        const margenProm = validas.length > 0
          ? validas.reduce((s, f) => s + f.margen, 0) / validas.length : null;
        const precioProm = validas.length > 0
          ? validas.reduce((s, f) => s + f.precioF, 0) / validas.length : 0;

        const semColor = m => m === null ? '#aaa' : m >= 30 ? '#27ae60' : m >= 15 ? '#e67e22' : '#e74c3c';
        const semIcon  = m => m === null ? '—' : m >= 30 ? '🟢' : m >= 15 ? '🟡' : '🔴';

        return (
          <div>
            {/* Tarjetas resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
              <div style={{ background: '#1a3a5c', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Costo prom/kg</div>
                <div style={{ fontWeight: 'bold', color: '#f39c12', fontSize: 20 }}>
                  {costoPromedio > 0 ? `$${costoPromedio.toFixed(4)}` : '—'}
                </div>
              </div>
              <div style={{ background: '#2980b9', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Precio prom facturado</div>
                <div style={{ fontWeight: 'bold', color: 'white', fontSize: 20 }}>
                  {precioProm > 0 ? `$${precioProm.toFixed(4)}` : '—'}
                </div>
              </div>
              <div style={{ background: semColor(margenProm), borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Margen promedio</div>
                <div style={{ fontWeight: 'bold', color: 'white', fontSize: 20 }}>
                  {margenProm !== null ? `${margenProm.toFixed(1)}%` : '—'}
                </div>
                {margenProm !== null && margenProm < 30 && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                    ⚠️ Bajo el 30% mínimo
                  </div>
                )}
              </div>
            </div>

            {/* Fórmula de costo real */}
            <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: '#555', border: '1px solid #e0e0e0' }}>
              <div style={{ fontWeight: 'bold', color: '#1a1a2e', marginBottom: 6 }}>📐 Costo Real/kg incluye</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', lineHeight: 2 }}>
                <span>🥩 Carne</span>
                <span>+ 🧂 Salmuera</span>
                <span>− 💰 Crédito Aserrín (<strong>${precioAserrin.toFixed(2)}/kg</strong>)</span>
                <span>− 💰 Crédito Carnudo (<strong>${precioCarnudo.toFixed(2)}/kg</strong>)</span>
                <span style={{ color: '#e74c3c' }}>🦴 Hueso = pérdida (sin crédito)</span>
              </div>
            </div>

            {/* Tabla comparador */}
            {facturas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, background: 'white', borderRadius: 12, color: '#aaa', fontSize: 13 }}>
                Sin facturas encontradas para "{producto.nombre}".<br/>
                <span style={{ fontSize: 11 }}>Las facturas aparecen cuando el nombre del producto coincide.</span>
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ background: '#1a3a5c', padding: '8px 14px' }}>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📊 Facturas vs Costo Real</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginLeft: 10 }}>{facturas.length} registro(s)</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        {['Fecha', 'N° Factura', 'Producto facturado', 'Cant.', 'Precio cobrado', 'Costo ref/kg', 'Margen', '🚦'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: ['Fecha','N° Factura','Producto facturado'].includes(h) ? 'left' : 'right', color: '#555', fontWeight: 700, borderBottom: '1px solid #e0e0e0', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facturasConCosto.map((f, i) => (
                        <tr key={f.id} style={{ background: i%2===0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{f.fechaFact || '—'}</td>
                          <td style={{ padding: '8px 10px', fontSize: 11, color: '#555' }}>{f.facturas?.numero || '—'}</td>
                          <td style={{ padding: '8px 10px', fontSize: 11, color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.producto_nombre}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{parseFloat(f.cantidad||0).toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#2980b9' }}>
                            {f.precioF > 0 ? `$${f.precioF.toFixed(4)}` : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#e67e22' }}>
                            {f.costoRef > 0 ? `$${f.costoRef.toFixed(4)}` : <span style={{ color: '#ccc', fontSize: 10 }}>sin prod.</span>}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: semColor(f.margen) }}>
                            {f.margen !== null ? `${f.margen.toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 16 }}>
                            {semIcon(f.margen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 14px', fontSize: 10, color: '#aaa', borderTop: '1px solid #f0f0f0' }}>
                  * Costo ref/kg = costo de la producción más reciente antes de esa factura. Precio cobrado = precio_unitario de la factura.
                </div>
              </div>
            )}

            {/* Simulador rentabilidad */}
            {costoPromedio > 0 && (
              <div style={{ marginTop: 12, background: '#f0f8ff', borderRadius: 10, padding: '12px 16px', border: '1px solid #aed6f1' }}>
                <div style={{ fontWeight: 'bold', color: '#1a5276', marginBottom: 8, fontSize: 13 }}>🎯 Precio de venta sugerido (sobre costo promedio)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, fontSize: 12 }}>
                  {[['30%', 0.70], ['35%', 0.65], ['40%', 0.60]].map(([label, div]) => (
                    <div key={label} style={{ background: 'white', borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: '1px solid #d6eaf8' }}>
                      <div style={{ color: '#888', fontSize: 10, marginBottom: 2 }}>Margen {label}</div>
                      <div style={{ fontWeight: 'bold', color: '#1a5276', fontSize: 15 }}>${(costoPromedio / div).toFixed(4)}/kg</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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

      {/* ── Tab Pruebas: Simulador paso a paso ── */}
      {tabActivo === 'pruebas' && (() => {
        const base    = parseFloat(simPeso)   || 0;
        const pctInj  = parseFloat(simPctInj) || 0;
        const pctMad  = parseFloat(simPctMad) || 0;
        const pctSie  = parseFloat(simPctSie) || 0;
        const pctAs   = parseFloat(simPctAs)  || 0;
        const pctCa   = parseFloat(simPctCa)  || 0;
        const pctHu   = parseFloat(simPctHu)  || 0;
        const pctMa   = Math.max(0, pctSie - pctAs - pctCa - pctHu);
        const funda   = parseFloat(simFunda)  || 0;

        const kgSal   = base * pctInj / 100;
        const kgInj   = base + kgSal;
        const kgLost  = kgInj * pctMad / 100;
        const kgMad   = kgInj - kgLost;
        const kgAs    = kgMad * pctAs / 100;
        const kgCa    = kgMad * pctCa / 100;
        const kgHu    = kgMad * pctHu / 100;
        const kgMaq   = kgMad * pctMa / 100;
        const kgNet   = kgMad - kgHu - kgMaq;
        const credito = kgAs * precioAserrin + kgCa * precioCarnudo;

        const precioCarne = parseFloat(mpVinculada?.precio_kg || 0);
        const salRef      = refH ? parseFloat(refH.costo_salmuera_asignado || 0) / Math.max(parseFloat(refH.kg_carne_cruda || 1), 0.001) : 0;
        const costoInj    = base * precioCarne + base * salRef;
        const cIny        = kgInj  > 0 ? costoInj / kgInj  : 0;
        const cMad        = kgMad  > 0 ? costoInj / kgMad  : 0;
        const cFinal      = kgNet  > 0 ? (kgMad * cMad - credito) / kgNet : 0;

        const empaqueMp   = mpsEmpaque.find(m => String(m.id) === simEmpSel);
        const etiquetaMp  = mpsEtiqueta.find(m => String(m.id) === simEtiSel);
        const costoEmp    = parseFloat(empaqueMp?.precio_kg  || 0);
        const costoEti    = parseFloat(etiquetaMp?.precio_kg || 0);
        const costoFunda  = funda > 0 && cFinal > 0 ? funda * cFinal + costoEmp + costoEti : null;

        const subExcede   = (pctAs + pctCa + pctHu) > pctSie && pctSie > 0;
        const tieneBase   = base > 0 && pctInj > 0 && precioCarne > 0;

        return (
          <div>
            <div style={{ fontWeight: 700, color: '#1a5276', marginBottom: 14, fontSize: 15 }}>
              Simulador de Costo
              <span style={{ fontWeight: 400, fontSize: 11, color: '#888', marginLeft: 8 }}>sin afectar datos reales</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>

              {/* ── PASO 1 ── */}
              <div style={{ background: '#f0f8ff', borderRadius: 12, padding: 16, border: '1.5px solid #aed6f1' }}>
                <div style={{ fontWeight: 700, color: '#1a5276', marginBottom: 12, fontSize: 13 }}>Paso 1 — Variables</div>

                {/* Peso base */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Peso Base del Corte (kg crudo)</label>
                  <input
                    type="number" min="0" step="0.001"
                    value={simPeso}
                    onChange={e => setSimPeso(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #2980b9', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }}
                  />
                  {precioCarne > 0 && base > 0 && (
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Costo carne: ${(base * precioCarne).toFixed(4)}</div>
                  )}
                </div>

                {/* % Inyección */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>% Inyección</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    placeholder="ej: 20"
                    value={simPctInj}
                    onChange={e => setSimPctInj(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #2980b9', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }}
                  />
                  {pctInj > 0 && base > 0 && (
                    <div style={{ fontSize: 10, color: '#2980b9', marginTop: 2 }}>
                      + {kgSal.toFixed(3)} kg de salmuera → {kgInj.toFixed(3)} kg inyectado
                    </div>
                  )}
                </div>

                {/* % Merma Maduración */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>% Merma Maduración</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    placeholder="ej: 3.5"
                    value={simPctMad}
                    onChange={e => setSimPctMad(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #e67e22', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }}
                  />
                  {pctMad > 0 && kgInj > 0 && (
                    <div style={{ fontSize: 10, color: '#e74c3c', marginTop: 2 }}>
                      − {kgLost.toFixed(3)} kg perdidos → {kgMad.toFixed(3)} kg post-mad
                    </div>
                  )}
                </div>

                {/* % Merma Sierra */}
                <div>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>% Merma Sierra (Total)</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    placeholder="ej: 10"
                    value={simPctSie}
                    onChange={e => setSimPctSie(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #8e44ad', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }}
                  />
                  {pctSie > 0 && (
                    <div style={{ marginTop: 8, background: 'white', borderRadius: 8, padding: '10px 12px', border: '1px solid #d7bde2' }}>
                      <div style={{ fontSize: 10, color: '#8e44ad', fontWeight: 700, marginBottom: 8 }}>DESGLOSE (editable)</div>
                      {[
                        ['Aserrín', simPctAs, setSimPctAs, kgAs,  '#7f8c8d'],
                        ['Carnudo', simPctCa, setSimPctCa, kgCa,  '#e67e22'],
                        ['Hueso',   simPctHu, setSimPctHu, kgHu,  '#e74c3c'],
                      ].map(([lbl, val, setter, kg, col]) => (
                        <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ width: 52, fontSize: 11, color: col, fontWeight: 600 }}>{lbl}</span>
                          <input
                            type="number" min="0" max={pctSie} step="0.1"
                            placeholder="0"
                            value={val}
                            onChange={e => setter(e.target.value)}
                            style={{ width: 52, padding: '4px 6px', borderRadius: 6, border: `1.5px solid ${col}`, fontSize: 12, textAlign: 'right', fontWeight: 'bold' }}
                          />
                          <span style={{ fontSize: 10, color: '#888' }}>%</span>
                          {kgMad > 0 && <span style={{ fontSize: 10, color: col, marginLeft: 2 }}>{kg.toFixed(3)} kg</span>}
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6, borderTop: '1px solid #f0e6ff' }}>
                        <span style={{ width: 52, fontSize: 11, color: '#95a5a6', fontWeight: 600 }}>Máquina</span>
                        <span style={{ width: 52, padding: '4px 6px', textAlign: 'right', fontSize: 12, fontWeight: 'bold', color: '#95a5a6' }}>{pctMa.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: '#888' }}>%</span>
                        {kgMad > 0 && <span style={{ fontSize: 10, color: '#95a5a6', marginLeft: 2 }}>{kgMaq.toFixed(3)} kg</span>}
                      </div>
                      {subExcede && (
                        <div style={{ fontSize: 10, color: '#e74c3c', marginTop: 6, fontWeight: 600 }}>⚠ Sub-% exceden el total sierra</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── PASO 2 ── */}
              <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 16, border: '1.5px solid #ddd' }}>
                <div style={{ fontWeight: 700, color: '#444', marginBottom: 12, fontSize: 13 }}>Paso 2 — Insumos por Funda</div>

                {/* Peso funda */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Peso por Funda (kg)</label>
                  <input
                    type="number" min="0" step="0.001"
                    placeholder="ej: 0.400"
                    value={simFunda}
                    onChange={e => setSimFunda(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid #27ae60', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }}
                  />
                  {funda > 0 && cFinal > 0 && (
                    <div style={{ fontSize: 10, color: '#27ae60', marginTop: 2 }}>Costo carne/funda: ${(funda * cFinal).toFixed(4)}</div>
                  )}
                </div>

                {/* Empaque */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Empaque / Funda</label>
                  <select
                    value={simEmpSel}
                    onChange={e => setSimEmpSel(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #bbb', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="">— sin empaque —</option>
                    {mpsEmpaque.map(m => (
                      <option key={m.id} value={String(m.id)}>
                        {m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/u
                      </option>
                    ))}
                  </select>
                  {empaqueMp && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>${costoEmp.toFixed(4)} por unidad</div>}
                </div>

                {/* Etiqueta */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Etiqueta</label>
                  <select
                    value={simEtiSel}
                    onChange={e => setSimEtiSel(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #bbb', fontSize: 13, background: 'white', boxSizing: 'border-box' }}
                  >
                    <option value="">— sin etiqueta —</option>
                    {mpsEtiqueta.map(m => (
                      <option key={m.id} value={String(m.id)}>
                        {m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/u
                      </option>
                    ))}
                  </select>
                  {etiquetaMp && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>${costoEti.toFixed(4)} por unidad</div>}
                </div>

                {/* Precios referencia */}
                <div style={{ background: '#f0fff4', borderRadius: 8, padding: '10px 12px', border: '1px solid #a9dfbf', fontSize: 11, color: '#555' }}>
                  <div style={{ fontWeight: 700, color: '#27ae60', marginBottom: 6, fontSize: 11 }}>PRECIOS DE MP</div>
                  <div>Carne: <strong>${precioCarne.toFixed(4)}/kg</strong></div>
                  <div>Aserrín: <strong>${precioAserrin.toFixed(4)}/kg</strong></div>
                  <div>Carnudo: <strong>${precioCarnudo.toFixed(4)}/kg</strong></div>
                  {salRef > 0 && <div>Salmuera/kg carne: <strong>${salRef.toFixed(4)}</strong></div>}
                </div>
              </div>
            </div>

            {/* ── RESULTADO ── */}
            {tieneBase ? (
              <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '2px solid #2980b9' }}>
                <div style={{ fontWeight: 700, color: '#1a5276', marginBottom: 14, fontSize: 14 }}>Resultado Simulado</div>

                {/* Cadena de pesos */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {[
                    { label: `${base.toFixed(3)} kg`, sub: 'Crudo',         color: '#7f8c8d' },
                    '→',
                    { label: `${kgInj.toFixed(3)} kg`, sub: `+${kgSal.toFixed(3)} sal`, color: '#2980b9' },
                    ...(pctMad > 0 ? ['→', { label: `${kgMad.toFixed(3)} kg`, sub: `−${kgLost.toFixed(3)} mad`, color: '#e67e22' }] : []),
                    ...(pctSie > 0 && kgNet > 0 ? ['→', { label: `${kgNet.toFixed(3)} kg`, sub: 'Neto fundas', color: '#27ae60' }] : []),
                  ].map((n, i) =>
                    n === '→'
                      ? <span key={i} style={{ color: '#bbb', fontSize: 16 }}>→</span>
                      : <div key={i} style={{ textAlign: 'center', background: '#f8f9fa', borderRadius: 8, padding: '6px 10px', border: `1.5px solid ${n.color}` }}>
                          <div style={{ fontWeight: 700, color: n.color, fontSize: 13 }}>{n.label}</div>
                          <div style={{ fontSize: 9, color: '#888' }}>{n.sub}</div>
                        </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : costoFunda !== null ? 'repeat(2,1fr)' : '1fr', gap: 10 }}>

                  {/* Desglose costo/kg */}
                  <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 8 }}>DESGLOSE COSTO/KG</div>
                    <div style={{ fontSize: 12, lineHeight: 2.2 }}>
                      <div>C_iny: <strong style={{ color: '#2980b9' }}>${cIny.toFixed(4)}/kg</strong></div>
                      {pctMad > 0 && <div>C_mad: <strong style={{ color: '#e67e22' }}>${cMad.toFixed(4)}/kg</strong></div>}
                      {pctSie > 0 && credito > 0 && (
                        <div>Crédito retazos: <strong style={{ color: '#27ae60' }}>−${credito.toFixed(4)}</strong></div>
                      )}
                      {pctSie > 0 && kgNet > 0 && (
                        <div style={{ marginTop: 4, fontSize: 14, fontWeight: 'bold', borderTop: '1px solid #eee', paddingTop: 6 }}>
                          C_final: <span style={{ color: '#1a5276' }}>${cFinal.toFixed(4)}/kg</span>
                        </div>
                      )}
                      {pctSie === 0 && (
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Ingresa % Sierra para ver C_final</div>
                      )}
                    </div>
                  </div>

                  {/* Costo por funda + precios sugeridos */}
                  {costoFunda !== null && (
                    <div style={{ background: '#f0fff4', borderRadius: 10, padding: '12px 14px', border: '1px solid #a9dfbf' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 8 }}>COSTO POR FUNDA ({funda.toFixed(3)} kg)</div>
                      <div style={{ fontSize: 12, lineHeight: 2 }}>
                        <div>Carne: <strong>${(funda * cFinal).toFixed(4)}</strong></div>
                        {costoEmp > 0 && <div>Empaque: <strong>${costoEmp.toFixed(4)}</strong></div>}
                        {costoEti > 0 && <div>Etiqueta: <strong>${costoEti.toFixed(4)}</strong></div>}
                        <div style={{ marginTop: 4, fontSize: 15, fontWeight: 'bold', borderTop: '1px solid #a9dfbf', paddingTop: 6 }}>
                          Total: <span style={{ color: '#27ae60' }}>${costoFunda.toFixed(4)}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: '#888', marginBottom: 6, fontWeight: 700 }}>PRECIO VENTA SUGERIDO</div>
                        {[['30%', 0.70, '#27ae60'], ['35%', 0.65, '#2980b9'], ['40%', 0.60, '#8e44ad']].map(([pct, div, color]) => (
                          <div key={pct} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderRadius: 6, padding: '5px 8px', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: '#555' }}>Margen <strong>{pct}</strong></span>
                            <span style={{ fontSize: 13, fontWeight: 'bold', color }}>${(costoFunda / div).toFixed(4)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: '#aaa', fontSize: 13, background: 'white', borderRadius: 12, border: '1px dashed #ddd' }}>
                Ingresa Peso Base y % Inyección para ver el resultado simulado
              </div>
            )}
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

      {/* ── Fase 1: Inyección ── */}
      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
        <div style={{ background: 'linear-gradient(135deg,#1a3a5c,#2980b9)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>💉 Fase 1 — Inyección</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>C_iny = (Carne + Salmuera) ÷ kg Total inyectado</span>
        </div>
        <div style={{ padding: '14px 16px' }}>
          {historial.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '16px 0' }}>
              Sin producciones registradas — registra desde Producción › Inyección
            </div>
          ) : (
            <>
              {/* Tarjetas C_iny */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#1a3a5c', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Último C_iny/kg</div>
                  <div style={{ fontWeight: 'bold', color: '#f39c12', fontSize: 20 }}>
                    {ultimoCosto > 0 ? `$${ultimoCosto.toFixed(4)}` : '—'}
                  </div>
                </div>
                <div style={{ background: '#27ae60', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>C_iny promedio</div>
                  <div style={{ fontWeight: 'bold', color: 'white', fontSize: 20 }}>
                    {costoPromedio > 0 ? `$${costoPromedio.toFixed(4)}` : '—'}
                  </div>
                </div>
                <div style={{ background: mpVinculada ? '#f8f9fa' : '#f8f9fa', borderRadius: 10, padding: '12px 14px', border: '1px solid #e0e0e0' }}>
                  <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Precio carne ref.</div>
                  <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: 20 }}>
                    {mpVinculada ? `$${parseFloat(mpVinculada.precio_kg||0).toFixed(4)}` : '—'}
                  </div>
                </div>
              </div>

              {/* Último desglose C_iny */}
              {historial[0] && (() => {
                const h = historial[0];
                const kgCarne = parseFloat(h.kg_carne_cruda || 0);
                const kgSal   = parseFloat(h.kg_salmuera_asignada || 0);
                const kgTotal = kgCarne + kgSal;
                const cCarne  = parseFloat(h.costo_carne || 0);
                const cSal    = parseFloat(h.costo_salmuera_asignado || 0);
                const ciny    = parseFloat(h.costo_final_kg || 0);
                return (
                  <div style={{ background: '#f0f4f8', borderRadius: 10, padding: '12px 14px', fontSize: 12 }}>
                    <div style={{ fontWeight: 'bold', color: '#1a3a5c', marginBottom: 8, fontSize: 12 }}>
                      Último lote — {h.produccion_inyeccion?.fecha || '—'} · {h.produccion_inyeccion?.formula_salmuera || '—'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '6px 20px', color: '#555', lineHeight: 2 }}>
                      <div>🥩 Carne: <strong>{kgCarne.toFixed(3)} kg</strong> × ${parseFloat(h.precio_kg_carne||0).toFixed(4)} = <strong style={{ color: '#e74c3c' }}>${cCarne.toFixed(4)}</strong></div>
                      <div>🧂 Salmuera: <strong>{kgSal.toFixed(3)} kg</strong> → <strong style={{ color: '#2980b9' }}>${cSal.toFixed(4)}</strong></div>
                      <div>⚖️ Total inyectado: <strong>{kgTotal.toFixed(3)} kg</strong></div>
                      <div>💰 Costo total: <strong>${(cCarne + cSal).toFixed(4)}</strong></div>
                    </div>
                    <div style={{ marginTop: 8, borderTop: '1px solid #dde3ea', paddingTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#555' }}>C_iny =</span>
                      <span style={{ fontSize: 12, color: '#555' }}>${(cCarne+cSal).toFixed(4)} ÷ {kgTotal.toFixed(3)} kg =</span>
                      <span style={{ fontWeight: 'bold', fontSize: 16, color: '#1a3a5c' }}>${ciny > 0 ? ciny.toFixed(4) : ((cCarne+cSal)/kgTotal).toFixed(4)}/kg</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#27ae60', fontWeight: 'bold' }}>→ viaja a Fase 2 (Maduración)</span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* ── Fase 2: Maduración ── */}
      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
        <div style={{ background: 'linear-gradient(135deg,#1a6b3c,#27ae60)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🧊 Fase 2 — Maduración</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>C_mad = Costo Total ÷ KG pesados hoy</span>
        </div>
        <div style={{ padding: '14px 16px' }}>
          {lotesStock.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '16px 0' }}>
              Sin lotes madurados — confirma el pesaje en Producción › Maduración
            </div>
          ) : (
            <>
              {/* C_mad último y promedio */}
              {(() => {
                const lotesConCosto = lotesStock.filter(l => parseFloat(l.costo_mad_kg||0) > 0);
                const ultimoCMad   = lotesConCosto[0] ? parseFloat(lotesConCosto[0].costo_mad_kg) : 0;
                const promCMad     = lotesConCosto.length > 0
                  ? lotesConCosto.reduce((s, l) => s + parseFloat(l.costo_mad_kg||0), 0) / lotesConCosto.length : 0;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div style={{ background: '#1a6b3c', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Último C_mad/kg</div>
                      <div style={{ fontWeight: 'bold', color: '#a9dfbf', fontSize: 20 }}>
                        {ultimoCMad > 0 ? `$${ultimoCMad.toFixed(4)}` : '—'}
                      </div>
                    </div>
                    <div style={{ background: '#27ae60', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>C_mad promedio</div>
                      <div style={{ fontWeight: 'bold', color: 'white', fontSize: 20 }}>
                        {promCMad > 0 ? `$${promCMad.toFixed(4)}` : '—'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Historial de lotes madurados */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      {['Lote', 'Fecha', 'KG Inyectado', 'KG Madurado', 'Merma', 'Costo Total', 'C_iny/kg', 'C_mad/kg'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Lote' || h === 'Fecha' ? 'left' : 'right', color: '#555', fontWeight: 700, borderBottom: '1px solid #e0e0e0', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lotesStock.map((l, i) => {
                      const kgInj   = parseFloat(l.kg_inyectado  || 0);
                      const kgMad   = parseFloat(l.kg_inicial     || 0);
                      const mermaKg = kgInj > 0 ? kgInj - kgMad : 0;
                      const mermaP  = kgInj > 0 ? ((mermaKg / kgInj) * 100).toFixed(2) : '—';
                      const cTotal  = parseFloat(l.costo_total    || 0);
                      const cIny    = parseFloat(l.costo_iny_kg   || 0);
                      const cMad    = parseFloat(l.costo_mad_kg   || 0);
                      return (
                        <tr key={l.id} style={{ background: i%2===0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 'bold', color: '#1a1a2e' }}>{l.lote_id}</td>
                          <td style={{ padding: '7px 10px', color: '#555' }}>{l.fecha_entrada}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2980b9' }}>{kgInj > 0 ? `${kgInj.toFixed(3)} kg` : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{kgMad.toFixed(3)} kg</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e74c3c', fontWeight: 'bold' }}>
                            {kgInj > 0 ? <>{mermaKg.toFixed(3)} kg <span style={{ fontSize: 10, color: '#aaa' }}>({mermaP}%)</span></> : '—'}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{cTotal > 0 ? `$${cTotal.toFixed(4)}` : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2980b9' }}>{cIny > 0 ? `$${cIny.toFixed(4)}` : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: '#1a6b3c' }}>
                            {cMad > 0 ? `$${cMad.toFixed(4)}` : '—'}
                            {cMad > 0 && cIny > 0 && (
                              <div style={{ fontSize: 10, color: '#e74c3c', fontWeight: 'normal' }}>
                                +${(cMad - cIny).toFixed(4)} vs C_iny
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {lotesStock.length > 0 && (
                <div style={{ fontSize: 11, color: '#27ae60', marginTop: 8, fontWeight: 'bold' }}>
                  → C_mad viaja a Fase 3 (Despacho/Fraccionamiento)
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Fase 3: Despacho / Fraccionamiento ── */}
      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
        <div style={{ background: 'linear-gradient(135deg,#e67e22,#d35400)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>🔪 Fase 3 — Despacho / Fraccionamiento</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Registros de sierra por lote</span>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {despachoCortes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, padding: '20px 0' }}>
              Sin registros de despacho — ve a Producción › Despacho para registrar cortes
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#fef9f0' }}>
                    {['Fecha', 'Lote', 'Antes (kg)', 'Fundas (kg)', 'Remanente', 'Merma sierra', 'C_mad/kg', 'C_final/kg'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Fecha' || h === 'Lote' ? 'left' : 'right', color: '#d35400', fontWeight: 700, borderBottom: '2px solid #fdebd0', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {despachoCortes.map((r, i) => {
                    const merma    = Math.max(0, (r.peso_antes||0) - (r.peso_funda||0) - (r.peso_remanente||0));
                    const pctMerma = r.peso_antes > 0 ? ((merma / r.peso_antes) * 100).toFixed(1) : '0';
                    const cFinal   = parseFloat(r.c_final_kg || 0);
                    const cMad     = parseFloat(r.c_mad_kg   || 0);
                    return (
                      <tr key={r.id} style={{ background: i%2===0 ? 'white' : '#fffaf5', borderBottom: '1px solid #fdebd0' }}>
                        <td style={{ padding: '7px 10px' }}>{r.fecha}</td>
                        <td style={{ padding: '7px 10px', fontSize: 11, color: '#888' }}>{r.lote_ref || '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{parseFloat(r.peso_antes||0).toFixed(3)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#27ae60', fontWeight: 600 }}>{parseFloat(r.peso_funda||0).toFixed(3)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2980b9' }}>{parseFloat(r.peso_remanente||0).toFixed(3)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e74c3c', fontWeight: 600 }}>
                          {merma.toFixed(3)} <span style={{ fontSize: 10, color: '#aaa' }}>({pctMerma}%)</span>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e67e22' }}>{cMad > 0 ? `$${cMad.toFixed(4)}` : '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: cFinal > 0 ? '#6c3483' : '#ccc' }}>
                          {cFinal > 0 ? `$${cFinal.toFixed(4)}` : <span style={{ fontSize: 10 }}>pendiente cierre</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Fase 4: C_final después del Cierre ── */}
      {cFinalHistorial.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
          <div style={{ background: 'linear-gradient(135deg,#8e44ad,#6c3483)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>⚙️ Fase 4 — Distribución Merma y C_final</span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Resultado del Cierre del Día</span>
          </div>
          <div style={{ padding: '12px 16px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f5eef8' }}>
                  {['Fecha', 'Antes (kg)', 'Aserrín', 'Carnudo', 'Hueso', 'Máquina', 'Crédito', 'Peso neto', 'C_mad', 'C_final'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Fecha' ? 'left' : 'right', color: '#6c3483', fontWeight: 700, borderBottom: '2px solid #e8daef', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cFinalHistorial.map((r, i) => {
                  const pesoNeto = Math.max(0, (r.peso_antes||0) - (r.kg_maq_asig||0) - (r.kg_hueso_asig||0));
                  return (
                    <tr key={i} style={{ background: i%2===0 ? 'white' : '#fdf2ff', borderBottom: '1px solid #f0e6f6' }}>
                      <td style={{ padding: '7px 10px' }}>{r.fecha}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{parseFloat(r.peso_antes||0).toFixed(3)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#27ae60' }}>{parseFloat(r.kg_aserrin_asig||0).toFixed(3)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#27ae60' }}>{parseFloat(r.kg_carnudo_asig||0).toFixed(3)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e74c3c' }}>{parseFloat(r.kg_hueso_asig||0).toFixed(3)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e74c3c' }}>{parseFloat(r.kg_maq_asig||0).toFixed(3)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#27ae60', fontWeight: 'bold' }}>${parseFloat(r.credito_retazos||0).toFixed(4)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{pesoNeto.toFixed(3)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e67e22' }}>${parseFloat(r.c_mad_kg||0).toFixed(4)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: '#6c3483', fontSize: 13 }}>${parseFloat(r.c_final_kg||0).toFixed(4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* ── Fase 5: Producto Terminado ── */}
      {(() => {
        const ultimoCFinal = cFinalHistorial[0] ? parseFloat(cFinalHistorial[0].c_final_kg || 0) : 0;
        const ultimoCMad   = cFinalHistorial[0] ? parseFloat(cFinalHistorial[0].c_mad_kg   || 0) : 0;
        const factorSierra = ultimoCFinal > 0 && ultimoCMad > 0 ? ultimoCFinal - ultimoCMad : 0;

        const kgFunda    = parseFloat(fase5Funda || 0);
        const mpEmpaque  = mpsEmpaque.find(m => m.id === fase5Empaque);
        const mpEtiqueta = mpsEtiqueta.find(m => m.id === fase5Etiqueta);

        // Usar C_final si existe, si no usar C_mad como referencia provisional
        const costoBase     = ultimoCFinal > 0 ? ultimoCFinal
                            : (lotesStock[0] ? parseFloat(lotesStock[0].costo_mad_kg || 0) : 0);
        const esCFinal      = ultimoCFinal > 0;
        const costoCarne    = costoBase > 0 ? kgFunda * costoBase : 0;
        const costoEmpaque  = mpEmpaque  ? parseFloat(mpEmpaque.precio_kg  || 0) : 0;
        const costoEtiqueta = mpEtiqueta ? parseFloat(mpEtiqueta.precio_kg || 0) : 0;
        const costoTotal    = costoCarne + costoEmpaque + costoEtiqueta;

        return (
          <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
            <div style={{ background: 'linear-gradient(135deg,#6c3483,#8e44ad)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📦 Fase 5 — Producto Terminado</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Costo final por funda = carne + empaque + etiqueta</span>
            </div>
            <div style={{ padding: '14px 16px' }}>

              {/* Resumen cadena de costos */}
              {ultimoCFinal > 0 && (
                <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 'bold', color: '#555', marginBottom: 8 }}>📊 Cadena de costos (último lote)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { label: 'C_iny', val: ultimoCosto > 0 ? `$${ultimoCosto.toFixed(4)}` : '—', color: '#2980b9', tip: 'Fase 1' },
                      { label: '→ C_mad', val: ultimoCMad > 0 ? `$${ultimoCMad.toFixed(4)}` : '—', color: '#27ae60', tip: 'Fase 2' },
                      { label: '→ +sierra', val: factorSierra > 0 ? `+$${factorSierra.toFixed(4)}` : '—', color: '#e67e22', tip: 'Fase 4' },
                      { label: '= C_final', val: ultimoCFinal > 0 ? `$${ultimoCFinal.toFixed(4)}/kg` : '—', color: '#6c3483', tip: 'Fase 4' },
                    ].map(({ label, val, color, tip }) => (
                      <div key={label} style={{ background: 'white', borderRadius: 8, padding: '6px 12px', border: `1.5px solid ${color}20`, textAlign: 'center', minWidth: 90 }}>
                        <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{tip}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
                        <div style={{ fontWeight: 'bold', color, fontSize: 13 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Calculadora Fase 5 */}
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                {/* Peso funda */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6c3483', display: 'block', marginBottom: 4 }}>Peso de la funda (kg)</label>
                  <input
                    type="number" min="0" step="0.001"
                    value={fase5Funda}
                    onChange={e => setFase5Funda(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #8e44ad', fontSize: 14, textAlign: 'right', outline: 'none', boxSizing: 'border-box', fontWeight: 'bold' }}
                  />
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>ej: 0.4 = 400g</div>
                </div>

                {/* Empaque */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#2980b9', display: 'block', marginBottom: 4 }}>📦 Empaque / Funda</label>
                  <select value={fase5Empaque} onChange={e => setFase5Empaque(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #2980b9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">— Sin empaque —</option>
                    {mpsEmpaque.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg||0).toFixed(4)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Etiqueta */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#27ae60', display: 'block', marginBottom: 4 }}>🏷️ Etiqueta</label>
                  <select value={fase5Etiqueta} onChange={e => setFase5Etiqueta(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #27ae60', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">— Sin etiqueta —</option>
                    {mpsEtiqueta.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg||0).toFixed(4)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Resultado */}
              {kgFunda > 0 && (
                <div style={{ background: costoTotal > 0 ? 'linear-gradient(135deg,#6c3483,#8e44ad)' : '#f8f9fa', borderRadius: 12, padding: '14px 18px' }}>
                  <div style={{ fontSize: 12, color: costoTotal > 0 ? 'rgba(255,255,255,0.7)' : '#888', marginBottom: 8, fontWeight: 'bold' }}>
                    COSTO TOTAL — funda de {(kgFunda * 1000).toFixed(0)}g
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: costoTotal > 0 ? 'rgba(255,255,255,0.85)' : '#555' }}>
                      <span>🥩 Carne ({kgFunda} kg × ${costoBase > 0 ? costoBase.toFixed(4) : '?'}/kg{!esCFinal && costoBase > 0 ? ' ≈C_mad' : ''})</span>
                      <span style={{ fontWeight: 'bold' }}>{costoBase > 0 ? `$${costoCarne.toFixed(4)}` : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: costoTotal > 0 ? 'rgba(255,255,255,0.85)' : '#555' }}>
                      <span>📦 {mpEmpaque ? (mpEmpaque.nombre_producto || mpEmpaque.nombre) : 'Empaque'}</span>
                      <span style={{ fontWeight: 'bold' }}>{mpEmpaque ? `$${costoEmpaque.toFixed(4)}` : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: costoTotal > 0 ? 'rgba(255,255,255,0.85)' : '#555' }}>
                      <span>🏷️ {mpEtiqueta ? (mpEtiqueta.nombre_producto || mpEtiqueta.nombre) : 'Etiqueta'}</span>
                      <span style={{ fontWeight: 'bold' }}>{mpEtiqueta ? `$${costoEtiqueta.toFixed(4)}` : '—'}</span>
                    </div>
                    <div style={{ borderTop: `1px solid ${costoTotal > 0 ? 'rgba(255,255,255,0.3)' : '#ddd'}`, paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', fontSize: 14, color: costoTotal > 0 ? 'white' : '#333' }}>TOTAL FUNDA</span>
                      <span style={{ fontWeight: 'bold', fontSize: 22, color: costoTotal > 0 ? '#f9e79f' : '#6c3483' }}>
                        {costoTotal > 0 ? `$${costoTotal.toFixed(4)}` : '—'}
                      </span>
                    </div>
                    {costoTotal > 0 && kgFunda > 0 && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
                        = ${(costoTotal / kgFunda).toFixed(4)}/kg
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!esCFinal && costoBase > 0 && (
                <div style={{ background: '#fff3cd', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#856404', marginTop: 8 }}>
                  ⚠️ Usando C_mad como referencia — el C_final real se calcula al hacer el Cierre del Día en Despacho
                </div>
              )}
              {costoBase === 0 && (
                <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, padding: '10px 0' }}>
                  Sin datos de costo — confirma el pesaje en Maduración primero
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Historial de Producciones (Inyección) ── */}
      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
        <div style={{ background: '#555', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>📋 Historial de Inyecciones</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>datos de la fase de salmuera</span>
        </div>
        {historial.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#aaa', fontSize: 13 }}>
            Sin producciones registradas para este corte.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {['Fecha', 'Salmuera', 'Kg Carne', 'Kg Salmuera', 'Total Inyectado', 'C_iny/kg', 'Estado'].map(col => (
                    <th key={col} style={{ padding: '7px 10px', textAlign: col === 'Fecha' || col === 'Salmuera' ? 'left' : 'right', color: '#555', fontWeight: 700, borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap', fontSize: 11 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => {
                  const prod    = h.produccion_inyeccion;
                  const cIny    = calcCiny(h);
                  const kgCarne = parseFloat(h.kg_carne_cruda || 0);
                  const kgSal   = parseFloat(h.kg_salmuera_asignada || 0);
                  const kgTotal = kgCarne + kgSal;
                  return (
                    <tr key={h.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>{prod?.fecha || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#555', fontSize: 11 }}>{prod?.formula_salmuera || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{kgCarne.toFixed(3)} kg</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#2980b9' }}>{kgSal.toFixed(3)} kg</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#8e44ad', fontWeight: 600 }}>{kgTotal > 0 ? `${kgTotal.toFixed(3)} kg` : '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', color: cIny > 0 ? '#1a3a5c' : '#aaa' }}>
                        {cIny > 0 ? `$${cIny.toFixed(4)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        <span style={{
                          background: { abierto: '#fff3cd', cerrado: '#cce5ff', revertido: '#fdecea' }[prod?.estado] || '#f5f5f5',
                          color:      { abierto: '#856404', cerrado: '#004085', revertido: '#721c24' }[prod?.estado] || '#555',
                          borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 'bold'
                        }}>
                          {prod?.estado || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '6px 14px', fontSize: 10, color: '#aaa', borderTop: '1px solid #f0f0f0' }}>
              "abierto" = lote activo — normal en el flujo de cortes. La merma de sierra se registra en Fase 3 (Despacho).
            </div>
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
