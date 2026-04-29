// ============================================
// VistaHorneado.js
// Vista de costos por fases para productos
// categoría AHUMADOS - HORNEADOS (Pastrame, etc.)
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function VistaHorneado({ producto, mobile }) {
  const [lotes,     setLotes]     = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [tabActivo, setTabActivo] = useState('costos');

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      // Cargar registros de horneado para este producto
      const { data: horneados } = await supabase
        .from('produccion_horneado_lotes')
        .select('*')
        .ilike('producto_nombre', `%${producto.nombre}%`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!horneados?.length) { setLotes([]); setCargando(false); return; }

      // Para cada lote de horneado, cargar datos de inyección y maduración
      const enriquecidos = await Promise.all(horneados.map(async h => {
        // Buscar lote_maduracion por lote_id
        const { data: loteMad } = await supabase
          .from('lotes_maduracion')
          .select('*, produccion_inyeccion(fecha, formula_salmuera, kg_carne_total, kg_salmuera_requerida, costo_carne_total, costo_salmuera_total, produccion_inyeccion_cortes(corte_nombre, kg_carne_cruda, kg_salmuera_asignada, costo_carne, costo_salmuera_asignado))')
          .eq('lote_id', h.lote_id)
          .maybeSingle();

        const prod     = loteMad?.produccion_inyeccion;
        const cortes   = prod?.produccion_inyeccion_cortes || [];
        const kgCarne  = cortes.reduce((s, c) => s + parseFloat(c.kg_carne_cruda || 0), 0);
        const kgSal    = cortes.reduce((s, c) => s + parseFloat(c.kg_salmuera_asignada || 0), 0);
        const costoCarne = cortes.reduce((s, c) => s + parseFloat(c.costo_carne || 0), 0);
        const costoSal   = cortes.reduce((s, c) => s + parseFloat(c.costo_salmuera_asignado || 0), 0);
        const kgInj    = kgCarne + kgSal;
        const costoInj = costoCarne + costoSal;
        const cIny     = kgInj > 0 ? costoInj / kgInj : 0;

        const kgMad    = parseFloat(h.kg_entrada_horno || 0);
        const cMad     = kgMad > 0 ? costoInj / kgMad : 0;
        const merma1Kg  = kgInj - kgMad;
        const merma1Pct = kgInj > 0 ? merma1Kg / kgInj * 100 : 0;

        return { ...h, kgCarne, kgSal, kgInj, costoInj, cIny, kgMad, cMad, merma1Kg, merma1Pct, prod, loteMad };
      }));

      setLotes(enriquecidos);
      setCargando(false);
    }
    cargar();
  }, [producto.nombre]);

  const ultimo = lotes[0];

  const TABS = [
    { k: 'costos',  label: '💰 Costos' },
    { k: 'historial', label: '📋 Historial' },
  ];

  if (cargando) return <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>⏳ Cargando...</div>;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'white', borderRadius: 10, padding: 4, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTabActivo(t.k)} style={{
            padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 'bold',
            background: tabActivo === t.k ? '#1a1a2e' : 'transparent',
            color:      tabActivo === t.k ? 'white'   : '#666',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab Costos ── */}
      {tabActivo === 'costos' && (
        <>
          {!ultimo ? (
            <div style={{ textAlign: 'center', padding: 40, background: 'white', borderRadius: 12, color: '#aaa', fontSize: 13 }}>
              Sin producciones registradas — registra desde Producción › Inyección con Salmuera Pastrame
            </div>
          ) : (
            <>
              {/* Encabezado lote */}
              <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#888' }}>Último lote</div>
                  <div style={{ fontWeight: 'bold', color: '#1a1a2e' }}>{ultimo.lote_id} · {ultimo.fecha}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{ultimo.prod?.formula_salmuera || 'Salmuera Pastrame'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#888' }}>C_final</div>
                  <div style={{ fontWeight: 'bold', fontSize: 20, color: '#27ae60' }}>${parseFloat(ultimo.c_final_kg || 0).toFixed(4)}/kg</div>
                </div>
              </div>

              {/* FASE 1 — Inyección */}
              <FaseCard titulo="Fase 1 — Inyección" color="#2980b9" icon="💉">
                <LineaCosto label="🥩 Carne" valor={`${ultimo.kgCarne.toFixed(3)} kg`} />
                <LineaCosto label="🧂 Salmuera inyectada" valor={`${ultimo.kgSal.toFixed(3)} kg`} color="#2980b9" />
                <LineaCosto label="⚖️ Total inyectado" valor={`${ultimo.kgInj.toFixed(3)} kg`} bold />
                <LineaCosto label="💰 Costo total" valor={`$${ultimo.costoInj.toFixed(4)}`} color="#e74c3c" />
                <div style={{ marginTop: 8, background: '#eaf4fd', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>C_iny = </span>
                  <span style={{ fontWeight: 'bold', color: '#2980b9', fontSize: 15 }}>${ultimo.cIny.toFixed(4)}/kg</span>
                  <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>→ viaja a Fase 2</span>
                </div>
              </FaseCard>

              {/* FASE 2 — Maduración */}
              <FaseCard titulo="Fase 2 — Maduración (72h)" color="#8e44ad" icon="🧊">
                <LineaCosto label="Kg post-curado" valor={`${ultimo.kgMad.toFixed(3)} kg`} />
                <LineaCosto label="Merma 1"
                  valor={`${ultimo.merma1Kg.toFixed(3)} kg (${ultimo.merma1Pct.toFixed(1)}%)`}
                  color={ultimo.merma1Pct > 5 ? '#e74c3c' : '#e67e22'} />
                <div style={{ marginTop: 8, background: '#f5eef8', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>C_mad = </span>
                  <span style={{ fontWeight: 'bold', color: '#8e44ad', fontSize: 15 }}>${ultimo.cMad.toFixed(4)}/kg</span>
                  <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>→ viaja a Fase 3</span>
                </div>
              </FaseCard>

              {/* FASE 3 — Mostaza */}
              <FaseCard titulo="Fase 3 — Mostaza (adherencia)" color="#f39c12" icon="🟡">
                <LineaCosto label="Kg mostaza aplicada" valor={`${parseFloat(ultimo.kg_mostaza || 0).toFixed(3)} kg`} />
                <LineaCosto label="Costo mostaza" valor={`+$${parseFloat(ultimo.costo_mostaza || 0).toFixed(4)}`} color="#f39c12" />
                {parseFloat(ultimo.kg_mostaza || 0) === 0 && (
                  <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>No registrada — aplicación manual</div>
                )}
              </FaseCard>

              {/* FASE 4 — Rub */}
              <FaseCard titulo="Fase 4 — Rub Pastrame (costra)" color="#6c3483" icon="🌶️">
                <LineaCosto label="Kg Rub aplicado" valor={`${parseFloat(ultimo.kg_rub || 0).toFixed(3)} kg`} />
                <LineaCosto label="Costo Rub" valor={`+$${parseFloat(ultimo.costo_rub || 0).toFixed(4)}`} color="#6c3483" />
              </FaseCard>

              {/* FASE 5 — Horneado */}
              <FaseCard titulo="Fase 5 — Horneado (110°C → 92°C)" color="#e74c3c" icon="🔥">
                <LineaCosto label="Kg entrada al horno" valor={`${parseFloat(ultimo.kg_entrada_horno || 0).toFixed(3)} kg`} />
                <LineaCosto label="Kg post-horno" valor={`${parseFloat(ultimo.kg_post_horno || 0).toFixed(3)} kg`} bold />
                <LineaCosto label="Merma 2 (cocción)"
                  valor={`${parseFloat(ultimo.merma_horno_kg || 0).toFixed(3)} kg (${parseFloat(ultimo.merma_horno_pct || 0).toFixed(1)}%)`}
                  color={parseFloat(ultimo.merma_horno_pct || 0) > 35 ? '#e74c3c' : '#e67e22'} />
              </FaseCard>

              {/* FASE 6 — Reposo */}
              <FaseCard titulo="Fase 6 — Reposo / Antes de rebanar" color="#27ae60" icon="❄️">
                <LineaCosto label="Kg post-horno" valor={`${parseFloat(ultimo.kg_post_horno || 0).toFixed(3)} kg`} />
                <LineaCosto label="Kg antes de rebanar" valor={`${parseFloat(ultimo.kg_post_reposo || 0).toFixed(3)} kg`} bold />
                <LineaCosto label="Merma 3 (reposo)"
                  valor={`${parseFloat(ultimo.merma_reposo_kg || 0).toFixed(3)} kg (${parseFloat(ultimo.merma_reposo_pct || 0).toFixed(1)}%)`}
                  color="#e67e22" />
                <div style={{ marginTop: 8, background: '#e8f8f5', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>C_FINAL (con 3 mermas + mostaza + rub)</div>
                  <div style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 22 }}>${parseFloat(ultimo.c_final_kg || 0).toFixed(4)}/kg</div>
                </div>
              </FaseCard>

              {/* Resumen de mermas */}
              <div style={{ background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#555', marginBottom: 10 }}>RESUMEN DE MERMAS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, textAlign: 'center' }}>
                  {[
                    { label: 'Merma 1\nMaduración', pct: ultimo.merma1Pct, color: '#8e44ad' },
                    { label: 'Merma 2\nHorneado',   pct: parseFloat(ultimo.merma_horno_pct  || 0), color: '#e74c3c' },
                    { label: 'Merma 3\nReposo',      pct: parseFloat(ultimo.merma_reposo_pct || 0), color: '#e67e22' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#f8f9fa', borderRadius: 8, padding: '10px 6px' }}>
                      <div style={{ fontSize: 10, color: '#888', marginBottom: 4, whiteSpace: 'pre-line' }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: m.color }}>{m.pct.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#555' }}>
                  Merma total acumulada: <b style={{ color: '#e74c3c' }}>
                    {(100 - (parseFloat(ultimo.kg_post_reposo || 0) / (parseFloat(ultimo.kgInj) || 1) * 100)).toFixed(1)}%
                  </b>
                  {' '}({(ultimo.kgInj - parseFloat(ultimo.kg_post_reposo || 0)).toFixed(3)} kg de {ultimo.kgInj.toFixed(3)} kg inyectados)
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Tab Historial ── */}
      {tabActivo === 'historial' && (
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {lotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Sin producciones</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1a1a2e' }}>
                  {['Fecha','Lote','Kg Carne','Kg Final','M1 %','M2 %','M3 %','C_iny','C_mad','C_final'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', color: '#aaa', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lotes.map((l, i) => (
                  <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{l.fecha}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#888' }}>{l.lote_id}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{l.kgCarne.toFixed(2)} kg</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>{parseFloat(l.kg_post_reposo || 0).toFixed(2)} kg</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#8e44ad' }}>{l.merma1Pct.toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#e74c3c' }}>{parseFloat(l.merma_horno_pct  || 0).toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#e67e22' }}>{parseFloat(l.merma_reposo_pct || 0).toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#2980b9' }}>${l.cIny.toFixed(4)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#8e44ad' }}>${l.cMad.toFixed(4)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>${parseFloat(l.c_final_kg || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function FaseCard({ titulo, color, icon, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 10 }}>
      <div style={{ background: color, padding: '8px 14px' }}>
        <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>{icon} {titulo}</span>
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
    </div>
  );
}

function LineaCosto({ label, valor, color = '#333', bold = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, alignItems: 'center' }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 'bold' : 'normal', fontSize: bold ? 14 : 12 }}>{valor}</span>
    </div>
  );
}
