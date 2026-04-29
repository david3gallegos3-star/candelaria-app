// ============================================
// VistaHorneado.js  — AHUMADOS / HORNEADOS
// 4 pestañas: Costos 1kg | Pruebas | Producción | Historial
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const TABS = [
  { k: 'costos',     label: '💰 Costos 1 kg'  },
  { k: 'pruebas',    label: '🧪 Pruebas'       },
  { k: 'produccion', label: '🏭 Producción'    },
  { k: 'historial',  label: '📋 Historial'     },
];

const NUM_STYLE = (color = '#1a1a2e') => ({
  padding: '7px 10px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
  border: `1.5px solid ${color}`, textAlign: 'right', outline: 'none',
  boxSizing: 'border-box', width: '100%',
});

export default function VistaHorneado({ producto, mobile }) {
  const [tab,        setTab]        = useState('costos');
  const [lotes,      setLotes]      = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [mps,        setMps]        = useState([]);
  const [formulas,   setFormulas]   = useState([]);   // todos los productos (para salmuera/rub)
  const [guardando,  setGuardando]  = useState(false);

  // ── Config editable ──────────────────────────────────────
  const [cfg, setCfg] = useState({
    horas_mad:       72,
    minutos_mad:     0,
    gramos_mostaza:  150,
    formula_salmuera:'',
    kg_sal_base:     1,       // la fórmula de salmuera es para X kg de carne
    mp_carne_id:     '',
    mp_mostaza_id:   '',
    formula_rub:     '',
    kg_rub_base:     1,       // la fórmula de rub es para X kg de carne
    merma_mad_pct:   3,
    merma_horno_pct: 30,
    margen:          15,
  });

  // Costos cargados de DB según selecciones
  const [costoSalmuera, setCostoSalmuera] = useState(0);  // costo total de la fórmula salmuera
  const [costoRub,      setCostoRub]      = useState(0);  // costo total de la fórmula rub
  const [pctSalmuera,   setPctSalmuera]   = useState(15); // % inyección de la salmuera seleccionada

  // ── Carga inicial ─────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: mpData }, { data: frmData }, { data: horneados }, { data: cfgDB }] = await Promise.all([
      supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg,categoria').eq('eliminado', false).order('nombre'),
      supabase.from('productos').select('id,nombre,categoria').eq('estado','ACTIVO').order('nombre'),
      supabase.from('produccion_horneado_lotes').select('*').ilike('producto_nombre',`%${producto.nombre}%`).order('created_at',{ascending:false}).limit(15),
      supabase.from('config_productos').select('config_horneado,mp_vinculado_id').eq('producto_nombre', producto.nombre).maybeSingle(),
    ]);
    setMps(mpData || []);
    setFormulas(frmData || []);
    setLotes(horneados || []);

    // Cargar config guardada
    const saved = cfgDB?.config_horneado;
    if (saved && Object.keys(saved).length > 0) {
      setCfg(prev => ({ ...prev, ...saved }));
    } else if (cfgDB?.mp_vinculado_id) {
      // Prellenar carne con la MP vinculada
      setCfg(prev => ({ ...prev, mp_carne_id: cfgDB.mp_vinculado_id }));
    }
    setCargando(false);
  }, [producto.nombre]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Cargar costo salmuera cuando cambia la selección ─────
  useEffect(() => {
    if (!cfg.formula_salmuera || mps.length === 0) return;
    async function load() {
      const { data: filas } = await supabase.from('formulaciones')
        .select('gramos,materia_prima_id').eq('producto_nombre', cfg.formula_salmuera);
      const { data: cfgSal } = await supabase.from('config_productos')
        .select('porcentaje_salmuera').eq('producto_nombre', cfg.formula_salmuera).maybeSingle();
      const costo = (filas || []).reduce((s, f) => {
        const mp = mps.find(m => m.id === f.materia_prima_id);
        return s + (parseFloat(f.gramos || 0) / 1000) * parseFloat(mp?.precio_kg || 0);
      }, 0);
      setCostoSalmuera(costo);
      setPctSalmuera(parseFloat(cfgSal?.porcentaje_salmuera) || 15);
    }
    load();
  }, [cfg.formula_salmuera, mps]);

  // ── Cargar costo Rub cuando cambia la selección ──────────
  useEffect(() => {
    if (!cfg.formula_rub || mps.length === 0) return;
    async function load() {
      const { data: filas } = await supabase.from('formulaciones')
        .select('gramos,materia_prima_id').eq('producto_nombre', cfg.formula_rub);
      const costo = (filas || []).reduce((s, f) => {
        const mp = mps.find(m => m.id === f.materia_prima_id);
        return s + (parseFloat(f.gramos || 0) / 1000) * parseFloat(mp?.precio_kg || 0);
      }, 0);
      setCostoRub(costo);
    }
    load();
  }, [cfg.formula_rub, mps]);

  // ── Guardar config ────────────────────────────────────────
  async function guardarConfig() {
    setGuardando(true);
    await supabase.from('config_productos').upsert(
      { producto_nombre: producto.nombre, producto_id: producto.id, config_horneado: cfg },
      { onConflict: 'producto_nombre' }
    );
    setGuardando(false);
  }

  // ── Cálculos derivados ────────────────────────────────────
  const upd = (field, val) => setCfg(prev => ({ ...prev, [field]: val }));

  const mpCarne      = mps.find(m => m.id === cfg.mp_carne_id);
  const mpMostaza    = mps.find(m => m.id === cfg.mp_mostaza_id);
  const precioCarne  = parseFloat(mpCarne?.precio_kg  || 0);
  const precioMost   = parseFloat(mpMostaza?.precio_kg || 0);

  const costoSalKg   = cfg.kg_sal_base > 0 ? costoSalmuera / cfg.kg_sal_base : 0;
  const costoMostKg  = (parseFloat(cfg.gramos_mostaza) / 1000) * precioMost;
  const costoRubKg   = cfg.kg_rub_base > 0 ? costoRub / cfg.kg_rub_base : 0;
  const costoInput   = precioCarne + costoSalKg + costoMostKg + costoRubKg;

  // Peso: 1kg carne → inyeccion → merma mad → merma horno
  const kgSalInj     = 1 * (pctSalmuera / 100);
  const kgInyectado  = 1 + kgSalInj;
  const mermaGrMad   = kgInyectado * (cfg.merma_mad_pct / 100) * 1000;
  const kgPostMad    = kgInyectado * (1 - cfg.merma_mad_pct / 100);
  const mermaGrHorno = kgPostMad * (cfg.merma_horno_pct / 100) * 1000;
  const kgFinal      = kgPostMad * (1 - cfg.merma_horno_pct / 100);
  const cFinal       = kgFinal > 0 ? costoInput / kgFinal : 0;
  const precioVenta  = cfg.margen < 100 ? cFinal / (1 - cfg.margen / 100) : 0;

  if (cargando) return <div style={{ textAlign:'center', padding:40, color:'#aaa' }}>⏳ Cargando...</div>;

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'white', borderRadius:10, padding:4, marginBottom:14, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding:'8px 16px', borderRadius:7, border:'none', cursor:'pointer',
            fontSize:12, fontWeight:'bold', whiteSpace:'nowrap',
            background: tab === t.k ? '#1a1a2e' : 'transparent',
            color:      tab === t.k ? 'white'   : '#666',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══════════════ TAB COSTOS 1KG ══════════════ */}
      {tab === 'costos' && (
        <div>

          {/* — Configuración superior — */}
          <div style={{ background:'white', borderRadius:12, padding:'16px 18px', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#555', marginBottom:12 }}>CONFIGURACIÓN DEL PROCESO</div>
            <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap:14 }}>

              {/* Maduración en horas */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#8e44ad', display:'block', marginBottom:6 }}>⏱ Maduración</label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>Horas</div>
                    <input type="number" min="0" step="1"
                      value={cfg.horas_mad}
                      onChange={e => upd('horas_mad', Math.max(0, parseFloat(e.target.value)||0))}
                      style={NUM_STYLE('#8e44ad')} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>Minutos</div>
                    <input type="number" min="0" max="59" step="1"
                      value={cfg.minutos_mad}
                      onChange={e => upd('minutos_mad', Math.min(59, Math.max(0, parseFloat(e.target.value)||0)))}
                      style={NUM_STYLE('#8e44ad')} />
                  </div>
                  <div style={{ fontSize:11, color:'#8e44ad', fontWeight:700, marginTop:16 }}>
                    = {(parseFloat(cfg.horas_mad||0) + parseFloat(cfg.minutos_mad||0)/60).toFixed(1)}h
                  </div>
                </div>
              </div>

              {/* Mostaza */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#f39c12', display:'block', marginBottom:6 }}>🟡 Mostaza por kg de carne</label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'#888', marginBottom:2 }}>Gramos</div>
                    <input type="number" min="0" step="1"
                      value={cfg.gramos_mostaza}
                      onChange={e => upd('gramos_mostaza', Math.max(0, parseFloat(e.target.value)||0))}
                      style={NUM_STYLE('#f39c12')} />
                  </div>
                  <div style={{ fontSize:11, color:'#f39c12', fontWeight:700, marginTop:16, whiteSpace:'nowrap' }}>
                    = {(parseFloat(cfg.gramos_mostaza||0)/1000).toFixed(3)} kg
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* — Costos por ingrediente — */}
          <div style={{ background:'white', borderRadius:12, padding:'16px 18px', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#555', marginBottom:14 }}>COSTOS PARA 1 KG DE CARNE</div>

            {/* Salmuera */}
            <FilaCosto
              icon="💉" titulo="Salmuera de inyección"
              color="#2980b9"
              selector={
                <select value={cfg.formula_salmuera} onChange={e => upd('formula_salmuera', e.target.value)}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1.5px solid #2980b9', fontSize:13, background:'white', boxSizing:'border-box' }}>
                  <option value="">— seleccionar —</option>
                  {formulas.filter(f => f.categoria === 'SALMUERAS' || f.nombre.toLowerCase().includes('salmuera')).map(f => (
                    <option key={f.id} value={f.nombre}>{f.nombre}</option>
                  ))}
                </select>
              }
              extraLabel="Esta fórmula es para"
              extraVal={cfg.kg_sal_base}
              extraUnit="kg de carne"
              onExtra={v => upd('kg_sal_base', Math.max(0.1, parseFloat(v)||1))}
              costoFormula={costoSalmuera}
              costoKg={costoSalKg}
              nota={cfg.formula_salmuera ? `Inyección: ${pctSalmuera}% del peso de carne` : ''}
            />

            {/* Carne */}
            <FilaCosto
              icon="🥩" titulo="Materia prima (carne)"
              color="#e74c3c"
              selector={
                <select value={cfg.mp_carne_id} onChange={e => upd('mp_carne_id', e.target.value)}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1.5px solid #e74c3c', fontSize:13, background:'white', boxSizing:'border-box' }}>
                  <option value="">— seleccionar —</option>
                  {mps.filter(m => m.categoria?.toLowerCase().includes('carne') || m.categoria?.toLowerCase().includes('res') || m.categoria?.toLowerCase().includes('cerdo')).map(m => (
                    <option key={m.id} value={m.id}>{m.nombre_producto||m.nombre} — ${parseFloat(m.precio_kg||0).toFixed(4)}/kg</option>
                  ))}
                </select>
              }
              costoKg={precioCarne}
              nota={mpCarne ? `${mpCarne.nombre_producto||mpCarne.nombre} · $${precioCarne.toFixed(4)}/kg` : ''}
            />

            {/* Mostaza */}
            <FilaCosto
              icon="🟡" titulo="Mostaza"
              color="#f39c12"
              selector={
                <select value={cfg.mp_mostaza_id} onChange={e => upd('mp_mostaza_id', e.target.value)}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1.5px solid #f39c12', fontSize:13, background:'white', boxSizing:'border-box' }}>
                  <option value="">— seleccionar —</option>
                  {mps.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre_producto||m.nombre} — ${parseFloat(m.precio_kg||0).toFixed(4)}/kg</option>
                  ))}
                </select>
              }
              costoKg={costoMostKg}
              nota={mpMostaza && cfg.gramos_mostaza > 0
                ? `${cfg.gramos_mostaza}g × $${precioMost.toFixed(4)}/kg = $${costoMostKg.toFixed(4)} por kg carne`
                : 'Selecciona la MP de mostaza'}
            />

            {/* Rub / Especias */}
            <FilaCosto
              icon="🌶️" titulo="Rub / Especias (costra)"
              color="#6c3483"
              selector={
                <select value={cfg.formula_rub} onChange={e => upd('formula_rub', e.target.value)}
                  style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1.5px solid #6c3483', fontSize:13, background:'white', boxSizing:'border-box' }}>
                  <option value="">— seleccionar —</option>
                  {formulas.filter(f => f.nombre.toLowerCase().includes('rub') || f.nombre.toLowerCase().includes('especia') || f.nombre.toLowerCase().includes('costra')).map(f => (
                    <option key={f.id} value={f.nombre}>{f.nombre}</option>
                  ))}
                </select>
              }
              extraLabel="Esta fórmula es para"
              extraVal={cfg.kg_rub_base}
              extraUnit="kg de carne"
              onExtra={v => upd('kg_rub_base', Math.max(0.1, parseFloat(v)||1))}
              costoFormula={costoRub}
              costoKg={costoRubKg}
            />
          </div>

          {/* — Mermas — */}
          <div style={{ background:'white', borderRadius:12, padding:'16px 18px', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#555', marginBottom:14 }}>MERMAS (base 1 kg carne)</div>
            <div style={{ display:'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap:14 }}>

              {[
                { label:'📉 Merma Maduración', field:'merma_mad_pct', gramos: mermaGrMad, color:'#8e44ad',
                  nota:`${(kgInyectado*1000).toFixed(0)}g inyectado → pierde ${mermaGrMad.toFixed(0)}g → quedan ${(kgPostMad*1000).toFixed(0)}g` },
                { label:'📉 Merma Horneado',   field:'merma_horno_pct', gramos: mermaGrHorno, color:'#e74c3c',
                  nota:`${(kgPostMad*1000).toFixed(0)}g post-mad → pierde ${mermaGrHorno.toFixed(0)}g → quedan ${(kgFinal*1000).toFixed(0)}g` },
              ].map(m => (
                <div key={m.field}>
                  <label style={{ fontSize:11, fontWeight:700, color:m.color, display:'block', marginBottom:6 }}>{m.label}</label>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <div style={{ flex:1 }}>
                      <input type="number" min="0" max="100" step="0.1"
                        value={cfg[m.field]}
                        onChange={e => upd(m.field, Math.min(99, Math.max(0, parseFloat(e.target.value)||0)))}
                        style={NUM_STYLE(m.color)} />
                    </div>
                    <span style={{ fontSize:13, color:m.color, fontWeight:700 }}>%</span>
                    <div style={{ background:'#f8f9fa', borderRadius:8, padding:'6px 10px', fontSize:12, color:m.color, fontWeight:700, whiteSpace:'nowrap' }}>
                      − {m.gramos.toFixed(0)} g
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>{m.nota}</div>
                </div>
              ))}
            </div>
          </div>

          {/* — Resultado final — */}
          <div style={{ background:'#1a1a2e', borderRadius:12, padding:'18px 20px', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#aaa', marginBottom:14 }}>CÁLCULO FINAL — 1 KG CARNE INPUT</div>

            {[
              { label:'Carne',    val:`$${precioCarne.toFixed(4)}`, color:'#e74c3c' },
              { label:'Salmuera', val:`$${costoSalKg.toFixed(4)}`,  color:'#2980b9' },
              { label:'Mostaza',  val:`$${costoMostKg.toFixed(4)}`, color:'#f39c12' },
              { label:'Rub',      val:`$${costoRubKg.toFixed(4)}`,  color:'#c39bd3' },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5 }}>
                <span style={{ color:'#888' }}>{r.label}</span>
                <span style={{ color:r.color, fontWeight:700 }}>{r.val}</span>
              </div>
            ))}

            <div style={{ borderTop:'1px solid #333', margin:'10px 0', paddingTop:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                <span style={{ color:'#aaa' }}>Costo total input</span>
                <span style={{ color:'white', fontWeight:700 }}>${costoInput.toFixed(4)}/kg</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                <span style={{ color:'#aaa' }}>Rendimiento final</span>
                <span style={{ color:'#a9dfbf' }}>{(kgFinal*1000).toFixed(0)}g por cada 1kg carne ({(kgFinal*100).toFixed(1)}%)</span>
              </div>
            </div>

            <div style={{ background:'rgba(39,174,96,0.15)', borderRadius:10, padding:'12px 16px', marginTop:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, color:'#a9dfbf' }}>C_final (con mermas)</span>
                <span style={{ fontSize:24, fontWeight:'bold', color:'#27ae60' }}>${cFinal.toFixed(4)}/kg</span>
              </div>
            </div>

            {/* Margen */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:14 }}>
              <label style={{ fontSize:12, color:'#aaa', fontWeight:700, whiteSpace:'nowrap' }}>Margen ganancia</label>
              <input type="number" min="0" max="99" step="1"
                value={cfg.margen}
                onChange={e => upd('margen', Math.min(99, Math.max(0, parseFloat(e.target.value)||0)))}
                style={{ width:70, padding:'6px 8px', borderRadius:8, border:'1.5px solid #27ae60', fontSize:14, fontWeight:'bold', textAlign:'center', background:'rgba(255,255,255,0.1)', color:'white' }} />
              <span style={{ fontSize:13, color:'#aaa' }}>%</span>
              {cfg.margen > 0 && (
                <div style={{ marginLeft:'auto', textAlign:'right' }}>
                  <div style={{ fontSize:10, color:'#aaa' }}>Precio de venta</div>
                  <div style={{ fontSize:18, fontWeight:'bold', color:'#f39c12' }}>${precioVenta.toFixed(4)}/kg</div>
                </div>
              )}
            </div>
          </div>

          {/* Guardar */}
          <button onClick={guardarConfig} disabled={guardando} style={{
            width:'100%', padding:'12px', borderRadius:10, border:'none',
            background: guardando ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)',
            color:'white', fontWeight:'bold', fontSize:14, cursor: guardando ? 'default' : 'pointer',
          }}>
            {guardando ? 'Guardando...' : '💾 Guardar configuración'}
          </button>
        </div>
      )}

      {/* ══════════════ TAB PRUEBAS ══════════════ */}
      {tab === 'pruebas' && (
        <Pruebas cfg={cfg} mps={mps} cFinal={cFinal} precioVenta={precioVenta}
          costoInput={costoInput} kgFinal={kgFinal} kgInyectado={kgInyectado}
          kgPostMad={kgPostMad} mermaGrMad={mermaGrMad} mermaGrHorno={mermaGrHorno}
          costoSalKg={costoSalKg} costoMostKg={costoMostKg} costoRubKg={costoRubKg}
          precioCarne={parseFloat(mps.find(m=>m.id===cfg.mp_carne_id)?.precio_kg||0)} />
      )}

      {/* ══════════════ TAB PRODUCCIÓN ══════════════ */}
      {tab === 'produccion' && (
        <div style={{ background:'white', borderRadius:12, padding:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', textAlign:'center', color:'#555' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏭</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>Flujo de producción</div>
          <div style={{ fontSize:13, color:'#888', lineHeight:1.8, marginBottom:16 }}>
            1. Registrar producción → selecciona <b>Salmuera Pastrame</b> + <b>Salón de res</b><br/>
            2. Lote pasa a <b>Maduración {cfg.horas_mad}h {cfg.minutos_mad > 0 ? `${cfg.minutos_mad}m`:''}</b><br/>
            3. Al confirmar pesaje → modal <b>🔥 Horneado</b>:<br/>
            &nbsp;&nbsp;· Mostaza → Rub → Horno → Reposo<br/>
            4. Stock creado en <b>AHUMADOS - HORNEADOS</b>
          </div>
          <div style={{ background:'#f0fff4', borderRadius:10, padding:'14px 16px', fontSize:12, color:'#27ae60', border:'1px solid #a9dfbf' }}>
            {lotes.length > 0
              ? `${lotes.length} producción(es) registrada(s) · Última: ${lotes[0].fecha}`
              : 'Sin producciones aún — registra desde Producción › Registrar producción'}
          </div>
        </div>
      )}

      {/* ══════════════ TAB HISTORIAL ══════════════ */}
      {tab === 'historial' && (
        <div style={{ background:'white', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          {lotes.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'#aaa' }}>Sin producciones registradas</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:'#1a1a2e' }}>
                    {['Fecha','Lote','Kg Carne','Kg Final','M.Mad%','M.Horno%','M.Rep%','C_final'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', color:'#aaa', fontWeight:700, textAlign:'right', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l, i) => (
                    <tr key={l.id} style={{ background: i%2===0?'white':'#fafafa', borderBottom:'1px solid #f0f0f0' }}>
                      {[
                        l.fecha,
                        l.lote_id || '—',
                        `${parseFloat(l.kg_entrada_horno||0).toFixed(2)} kg`,
                        `${parseFloat(l.kg_post_reposo||0).toFixed(2)} kg`,
                        `${parseFloat(l.merma_horno_pct||0).toFixed(1)}%`,
                        `${parseFloat(l.merma_horno_pct||0).toFixed(1)}%`,
                        `${parseFloat(l.merma_reposo_pct||0).toFixed(1)}%`,
                        `$${parseFloat(l.c_final_kg||0).toFixed(4)}`,
                      ].map((v, j) => (
                        <td key={j} style={{ padding:'8px 10px', textAlign:'right', fontWeight: j===7?'bold':'normal', color: j===7?'#27ae60':'#333' }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente FilaCosto ──────────────────────────────────────
function FilaCosto({ icon, titulo, color, selector, extraLabel, extraVal, extraUnit, onExtra, costoFormula, costoKg, nota }) {
  return (
    <div style={{ borderBottom:'1px solid #f0f0f0', paddingBottom:14, marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:700, color, marginBottom:8 }}>{icon} {titulo}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {selector}
        {extraLabel && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
            <span style={{ color:'#888' }}>{extraLabel}</span>
            <input type="number" min="0.1" step="0.1"
              value={extraVal}
              onChange={e => onExtra(e.target.value)}
              style={{ width:70, padding:'4px 8px', borderRadius:6, border:`1.5px solid ${color}`, fontSize:12, textAlign:'right', fontWeight:'bold' }} />
            <span style={{ color:'#888' }}>{extraUnit}</span>
            {costoFormula > 0 && <span style={{ marginLeft:'auto', color, fontWeight:700 }}>Costo fórmula: ${costoFormula.toFixed(4)}</span>}
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          {nota && <span style={{ fontSize:10, color:'#aaa' }}>{nota}</span>}
          <span style={{ marginLeft:'auto', fontWeight:700, fontSize:13, color }}>
            → ${costoKg.toFixed(4)}/kg carne
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Tab Pruebas ───────────────────────────────────────────────
function Pruebas({ cfg, mps, cFinal, precioVenta, costoInput, kgFinal, kgInyectado, kgPostMad, mermaGrMad, mermaGrHorno, costoSalKg, costoMostKg, costoRubKg, precioCarne }) {
  const [kgSim, setKgSim] = useState('1');
  const kg = parseFloat(kgSim) || 1;

  return (
    <div>
      <div style={{ background:'white', borderRadius:12, padding:'16px 18px', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#555', marginBottom:12 }}>SIMULADOR — escala los costos a X kg de carne</div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <label style={{ fontSize:12, color:'#555', fontWeight:700 }}>Kg de carne a procesar:</label>
          <input type="number" min="0.1" step="0.1" value={kgSim}
            onChange={e => setKgSim(e.target.value)}
            style={{ width:90, padding:'8px 10px', borderRadius:8, border:'2px solid #2980b9', fontSize:15, fontWeight:'bold', textAlign:'right' }} />
          <span style={{ fontSize:13, color:'#555' }}>kg</span>
        </div>

        {[
          { label:'Carne',    costo: precioCarne * kg,   color:'#e74c3c' },
          { label:'Salmuera', costo: costoSalKg  * kg,   color:'#2980b9' },
          { label:'Mostaza',  costo: costoMostKg * kg,   color:'#f39c12' },
          { label:'Rub',      costo: costoRubKg  * kg,   color:'#6c3483' },
        ].map(r => (
          <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f5f5f5', fontSize:13 }}>
            <span style={{ color:'#555' }}>{r.label}</span>
            <span style={{ color:r.color, fontWeight:700 }}>${r.costo.toFixed(4)}</span>
          </div>
        ))}

        <div style={{ marginTop:12, padding:'12px 14px', background:'#f8f9fa', borderRadius:10, fontSize:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ color:'#888' }}>Costo total input</span>
            <span style={{ fontWeight:700 }}>${(costoInput * kg).toFixed(4)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ color:'#888' }}>Kg inyectado</span>
            <span style={{ color:'#2980b9', fontWeight:700 }}>{(kgInyectado * kg).toFixed(3)} kg</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ color:'#888' }}>Merma maduración</span>
            <span style={{ color:'#8e44ad', fontWeight:700 }}>−{(mermaGrMad * kg / 1000).toFixed(3)} kg ({cfg.merma_mad_pct}%)</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ color:'#888' }}>Merma horneado</span>
            <span style={{ color:'#e74c3c', fontWeight:700 }}>−{(mermaGrHorno * kg / 1000).toFixed(3)} kg ({cfg.merma_horno_pct}%)</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ color:'#888' }}>Kg final</span>
            <span style={{ color:'#27ae60', fontWeight:700 }}>{(kgFinal * kg).toFixed(3)} kg</span>
          </div>
          <div style={{ borderTop:'2px solid #ddd', paddingTop:10, marginTop:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, color:'#555' }}>C_final</span>
            <span style={{ fontSize:20, fontWeight:'bold', color:'#27ae60' }}>${cFinal.toFixed(4)}/kg</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
            <span style={{ color:'#888' }}>Precio venta ({cfg.margen}% margen)</span>
            <span style={{ fontSize:16, fontWeight:'bold', color:'#f39c12' }}>${precioVenta.toFixed(4)}/kg</span>
          </div>
        </div>
      </div>
    </div>
  );
}
