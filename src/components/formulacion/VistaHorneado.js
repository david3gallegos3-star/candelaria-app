// ============================================
// VistaHorneado.js  — AHUMADOS / HORNEADOS
// Header propio con Editar / Fijar / Versiones
// 4 pestañas: Costos 1kg | Pruebas | Producción | Historial
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const TABS = [
  { k: 'costos',     label: '💰 Costos 1 kg' },
  { k: 'pruebas',    label: '🧪 Pruebas'      },
  { k: 'produccion', label: '🏭 Producción'   },
  { k: 'historial',  label: '📋 Historial'    },
];

const CFG_DEF = {
  horas_mad: 72, minutos_mad: 0, gramos_mostaza: 150,
  formula_salmuera: '', kg_sal_base: 1,
  mp_carne_id: '', mp_mostaza_id: '',
  formula_rub: '', kg_rub_base: 1,
  merma_mad_pct: 3, merma_horno_pct: 30, margen: 15,
};

export default function VistaHorneado({ producto, mobile, onVolver }) {
  const [tab,          setTab]          = useState('costos');
  const [lotes,        setLotes]        = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [mps,          setMps]          = useState([]);
  const [formulas,     setFormulas]     = useState([]);
  const [modoEdicion,  setModoEdicion]  = useState(false);
  const [guardando,    setGuardando]    = useState(false);
  const [autoGuardando,setAutoGuardando]= useState(false);
  const [versiones,    setVersiones]    = useState([]);
  const [modalVer,     setModalVer]     = useState(false);
  const [verDetalle,   setVerDetalle]   = useState(null); // índice de versión expandida
  const [cfg,          setCfg]          = useState(CFG_DEF);

  const [costoSalmuera, setCostoSalmuera] = useState(0);
  const [costoRub,      setCostoRub]      = useState(0);
  const [pctSalmuera,   setPctSalmuera]   = useState(15);

  // ── Carga inicial ──────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: mpData }, { data: frmData }, { data: horneados }, { data: cfgDB }, { data: mpVinc }] = await Promise.all([
      supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg,categoria').eq('eliminado', false).order('nombre'),
      supabase.from('productos').select('id,nombre,categoria').eq('estado', 'ACTIVO').order('nombre'),
      supabase.from('produccion_horneado_lotes').select('*').ilike('producto_nombre', `%${producto.nombre}%`).order('created_at', { ascending: false }).limit(15),
      supabase.from('vista_horneado_config').select('config,versiones').eq('producto_nombre', producto.nombre).maybeSingle(),
      supabase.from('config_productos').select('mp_vinculado_id').eq('producto_nombre', producto.nombre).maybeSingle(),
    ]);
    setMps(mpData || []);
    setFormulas(frmData || []);
    setLotes(horneados || []);
    if (cfgDB?.config && Object.keys(cfgDB.config).length > 0) {
      setCfg(prev => ({ ...prev, ...cfgDB.config }));
      setVersiones(cfgDB.versiones || []);
    } else if (mpVinc?.mp_vinculado_id) {
      setCfg(prev => ({ ...prev, mp_carne_id: mpVinc.mp_vinculado_id }));
    }
    setCargando(false);
  }, [producto.nombre]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Cargar costo salmuera ──────────────────────────────────
  useEffect(() => {
    if (!cfg.formula_salmuera || !mps.length) return;
    (async () => {
      const [{ data: filas }, { data: cfgSal }] = await Promise.all([
        supabase.from('formulaciones').select('gramos,materia_prima_id').eq('producto_nombre', cfg.formula_salmuera),
        supabase.from('config_productos').select('porcentaje_salmuera').eq('producto_nombre', cfg.formula_salmuera).maybeSingle(),
      ]);
      setCostoSalmuera((filas || []).reduce((s, f) => {
        const mp = mps.find(m => m.id === f.materia_prima_id);
        return s + (parseFloat(f.gramos || 0) / 1000) * parseFloat(mp?.precio_kg || 0);
      }, 0));
      setPctSalmuera(parseFloat(cfgSal?.porcentaje_salmuera) || 15);
    })();
  }, [cfg.formula_salmuera, mps]);

  // ── Cargar costo Rub ───────────────────────────────────────
  useEffect(() => {
    if (!cfg.formula_rub || !mps.length) return;
    (async () => {
      const { data: filas } = await supabase.from('formulaciones').select('gramos,materia_prima_id').eq('producto_nombre', cfg.formula_rub);
      setCostoRub((filas || []).reduce((s, f) => {
        const mp = mps.find(m => m.id === f.materia_prima_id);
        return s + (parseFloat(f.gramos || 0) / 1000) * parseFloat(mp?.precio_kg || 0);
      }, 0));
    })();
  }, [cfg.formula_rub, mps]);

  // ── Helper: guarda en vista_horneado_config ───────────────
  async function saveConfigHorneado(cfgToSave, versionesToSave) {
    const { error } = await supabase
      .from('vista_horneado_config')
      .upsert(
        { producto_nombre: producto.nombre, config: cfgToSave, versiones: versionesToSave, updated_at: new Date().toISOString() },
        { onConflict: 'producto_nombre' }
      );
    if (error) throw error;
  }

  // ── Guardar config (Fijar cambios) ─────────────────────────
  async function fijarCambios() {
    setGuardando(true);
    try {
      await saveConfigHorneado(cfg, versiones);
      setModoEdicion(false);
    } catch (e) {
      alert('Error al fijar: ' + e.message);
    }
    setGuardando(false);
  }

  // ── Guardar historial (versión) ────────────────────────────
  async function guardarHistorial() {
    setAutoGuardando(true);
    try {
      const snap      = { fecha: new Date().toISOString().split('T')[0], ...cfg };
      const nuevasVer = [snap, ...versiones].slice(0, 20);
      await saveConfigHorneado(cfg, nuevasVer);
      setVersiones(nuevasVer);
    } catch (e) {
      alert('Error al guardar historial: ' + e.message);
    }
    setAutoGuardando(false);
  }

  // ── Restaurar versión ──────────────────────────────────────
  function restaurarVersion(v) {
    const { fecha: _f, versiones: _vv, ...rest } = v;
    setCfg(prev => ({ ...prev, ...rest }));
    setModalVer(false);
    setModoEdicion(true);
  }

  const upd = (field, val) => setCfg(prev => ({ ...prev, [field]: val }));

  // ── Cálculos ───────────────────────────────────────────────
  const mpCarne     = mps.find(m => m.id === cfg.mp_carne_id);
  const mpMostaza   = mps.find(m => m.id === cfg.mp_mostaza_id);
  const precioCarne = parseFloat(mpCarne?.precio_kg  || 0);
  const precioMost  = parseFloat(mpMostaza?.precio_kg || 0);
  const costoSalKg  = cfg.kg_sal_base > 0 ? costoSalmuera / cfg.kg_sal_base : 0;
  const costoMostKg = (parseFloat(cfg.gramos_mostaza) / 1000) * precioMost;
  const costoRubKg  = cfg.kg_rub_base > 0 ? costoRub / cfg.kg_rub_base : 0;
  const costoInput  = precioCarne + costoSalKg + costoMostKg + costoRubKg;
  const kgSalInj    = 1 * (pctSalmuera / 100);
  const kgInyectado = 1 + kgSalInj;
  const mermaGrMad  = kgInyectado * (cfg.merma_mad_pct / 100) * 1000;
  const kgPostMad   = kgInyectado * (1 - cfg.merma_mad_pct / 100);
  const mermaGrHorno= kgPostMad * (cfg.merma_horno_pct / 100) * 1000;
  const kgFinal     = kgPostMad * (1 - cfg.merma_horno_pct / 100);
  const cFinal      = kgFinal > 0 ? costoInput / kgFinal : 0;
  const precioVenta = cfg.margen < 100 ? cFinal / (1 - cfg.margen / 100) : 0;

  if (cargando) return <div style={{ textAlign: 'center', padding: 60, color: '#aaa', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>⏳ Cargando...</div>;

  const btnStyle = (bg, color = 'white') => ({
    padding: mobile ? '7px 10px' : '8px 16px', borderRadius: 8, border: 'none',
    background: bg, color, cursor: 'pointer', fontWeight: 'bold',
    fontSize: mobile ? 11 : 13, whiteSpace: 'nowrap',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>

      {/* ── Header sticky ── */}
      <div style={{ background: 'linear-gradient(135deg,#922b21,#6e2517)', padding: mobile ? '10px 12px' : '12px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>

          {/* Izquierda: volver + título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onVolver} style={btnStyle('rgba(255,255,255,0.15)')}>← Volver</button>
            <div>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? 14 : 17 }}>🔥 {producto.nombre}</div>
              <div style={{ color: modoEdicion ? '#f9ca74' : 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 1 }}>
                {modoEdicion ? '✏️ Modo edición' : '🔒 Fijada — presiona Editar'}
              </div>
            </div>
          </div>

          {/* Derecha: botones */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setModalVer(true)} style={btnStyle('#8e44ad')}>
              🔄 Versiones {versiones.length > 0 && `(${versiones.length})`}
            </button>
            {!modoEdicion ? (
              <button onClick={() => setModoEdicion(true)} style={btnStyle('#f39c12')}>
                ✏️ Editar
              </button>
            ) : (
              <>
                <button onClick={fijarCambios} disabled={guardando} style={btnStyle(guardando ? '#aaa' : '#27ae60')}>
                  {guardando ? 'Fijando...' : '🔒 Fijar cambios'}
                </button>
                <button onClick={guardarHistorial} disabled={autoGuardando} style={btnStyle(autoGuardando ? '#aaa' : '#e67e22')}>
                  {autoGuardando ? 'Guardando...' : '📋 Guardar Historial'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div style={{ padding: mobile ? '10px' : '16px 24px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'white', borderRadius: 10, padding: 4, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap',
              background: tab === t.k ? '#1a1a2e' : 'transparent',
              color:      tab === t.k ? 'white'   : '#666',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ═══ TAB COSTOS 1KG ═══ */}
        {tab === 'costos' && (
          <div>
            {/* Configuración */}
            <Seccion titulo="CONFIGURACIÓN DEL PROCESO">
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                {/* Maduración */}
                <div>
                  <Label color="#8e44ad">⏱ Maduración</Label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <CampoNum label="Horas" color="#8e44ad" value={cfg.horas_mad} disabled={!modoEdicion}
                      onChange={v => upd('horas_mad', Math.max(0, v))} />
                    <CampoNum label="Minutos" color="#8e44ad" value={cfg.minutos_mad} disabled={!modoEdicion}
                      onChange={v => upd('minutos_mad', Math.min(59, Math.max(0, v)))} max={59} />
                    <div style={{ fontSize: 11, color: '#8e44ad', fontWeight: 700, marginTop: 16, whiteSpace: 'nowrap' }}>
                      = {(parseFloat(cfg.horas_mad || 0) + parseFloat(cfg.minutos_mad || 0) / 60).toFixed(1)}h
                    </div>
                  </div>
                </div>
                {/* Mostaza */}
                <div>
                  <Label color="#f39c12">🟡 Mostaza por kg de carne</Label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <CampoNum label="Gramos" color="#f39c12" value={cfg.gramos_mostaza} disabled={!modoEdicion}
                      onChange={v => upd('gramos_mostaza', Math.max(0, v))} />
                    <div style={{ fontSize: 11, color: '#f39c12', fontWeight: 700, marginTop: 16, whiteSpace: 'nowrap' }}>
                      = {(parseFloat(cfg.gramos_mostaza || 0) / 1000).toFixed(3)} kg
                    </div>
                  </div>
                </div>
              </div>
            </Seccion>

            {/* Costos ingredientes */}
            <Seccion titulo="COSTOS PARA 1 KG DE CARNE">
              {/* Salmuera */}
              <FilaCosto icon="💉" titulo="Salmuera de inyección" color="#2980b9" costoKg={costoSalKg}
                nota={cfg.formula_salmuera ? `Inyección ${pctSalmuera}% · fórmula $${costoSalmuera.toFixed(4)}` : ''}>
                <CampoSelect disabled={!modoEdicion} color="#2980b9"
                  value={cfg.formula_salmuera} onChange={v => upd('formula_salmuera', v)}
                  options={formulas.filter(f => f.categoria === 'SALMUERAS' || f.nombre.toLowerCase().includes('salmuera')).map(f => ({ value: f.nombre, label: f.nombre }))}
                  placeholder="— seleccionar salmuera —" />
                <CampoBaseKg label="Fórmula para" disabled={!modoEdicion}
                  value={cfg.kg_sal_base} onChange={v => upd('kg_sal_base', Math.max(0.1, v))} />
              </FilaCosto>

              {/* Carne */}
              <FilaCosto icon="🥩" titulo="Materia prima (carne)" color="#e74c3c" costoKg={precioCarne}
                nota={mpCarne ? `${mpCarne.nombre_producto || mpCarne.nombre} · $${precioCarne.toFixed(4)}/kg` : ''}>
                <CampoSelect disabled={!modoEdicion} color="#e74c3c"
                  value={cfg.mp_carne_id} onChange={v => upd('mp_carne_id', v)}
                  options={mps.filter(m => m.categoria?.toLowerCase().includes('carne') || m.categoria?.toLowerCase().includes('res') || m.categoria?.toLowerCase().includes('cerdo')).map(m => ({ value: m.id, label: `${m.nombre_producto || m.nombre} — $${parseFloat(m.precio_kg || 0).toFixed(4)}/kg` }))}
                  placeholder="— seleccionar carne —" />
              </FilaCosto>

              {/* Mostaza */}
              <FilaCosto icon="🟡" titulo="Mostaza" color="#f39c12" costoKg={costoMostKg}
                nota={mpMostaza && cfg.gramos_mostaza > 0 ? `${cfg.gramos_mostaza}g × $${precioMost.toFixed(4)}/kg = $${costoMostKg.toFixed(4)}` : 'Selecciona la MP de mostaza'}>
                <CampoSelect disabled={!modoEdicion} color="#f39c12"
                  value={cfg.mp_mostaza_id} onChange={v => upd('mp_mostaza_id', v)}
                  options={mps.map(m => ({ value: m.id, label: `${m.nombre_producto || m.nombre} — $${parseFloat(m.precio_kg || 0).toFixed(4)}/kg` }))}
                  placeholder="— seleccionar mostaza —" />
              </FilaCosto>

              {/* Rub */}
              <FilaCosto icon="🌶️" titulo="Rub / Especias (costra)" color="#6c3483" costoKg={costoRubKg}
                nota={cfg.formula_rub ? `Fórmula $${costoRub.toFixed(4)} total` : ''}>
                <CampoSelect disabled={!modoEdicion} color="#6c3483"
                  value={cfg.formula_rub} onChange={v => upd('formula_rub', v)}
                  options={formulas.filter(f => f.nombre.toLowerCase().includes('rub') || f.nombre.toLowerCase().includes('especia') || f.nombre.toLowerCase().includes('costra')).map(f => ({ value: f.nombre, label: f.nombre }))}
                  placeholder="— seleccionar rub/especias —" />
                <CampoBaseKg label="Fórmula para" disabled={!modoEdicion}
                  value={cfg.kg_rub_base} onChange={v => upd('kg_rub_base', Math.max(0.1, v))} />
              </FilaCosto>
            </Seccion>

            {/* Mermas */}
            <Seccion titulo="MERMAS (base 1 kg carne)">
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                {[
                  { label: '📉 Merma Maduración', field: 'merma_mad_pct',   gramos: mermaGrMad,   color: '#8e44ad',
                    nota: `${(kgInyectado*1000).toFixed(0)}g → pierde ${mermaGrMad.toFixed(0)}g → quedan ${(kgPostMad*1000).toFixed(0)}g` },
                  { label: '📉 Merma Horneado',   field: 'merma_horno_pct', gramos: mermaGrHorno, color: '#e74c3c',
                    nota: `${(kgPostMad*1000).toFixed(0)}g → pierde ${mermaGrHorno.toFixed(0)}g → quedan ${(kgFinal*1000).toFixed(0)}g` },
                ].map(m => (
                  <div key={m.field}>
                    <Label color={m.color}>{m.label}</Label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <input type="number" min="0" max="99" step="0.1"
                          disabled={!modoEdicion}
                          value={cfg[m.field]}
                          onChange={e => upd(m.field, Math.min(99, Math.max(0, parseFloat(e.target.value) || 0)))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 14, fontWeight: 'bold', textAlign: 'right', boxSizing: 'border-box', outline: 'none', border: `1.5px solid ${modoEdicion ? m.color : '#ddd'}`, background: modoEdicion ? 'white' : '#f8f9fa', color: modoEdicion ? '#333' : '#888' }} />
                      </div>
                      <span style={{ fontSize: 13, color: m.color, fontWeight: 700 }}>%</span>
                      <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: m.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        −{m.gramos.toFixed(0)} g
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>{m.nota}</div>
                  </div>
                ))}
              </div>
            </Seccion>

            {/* Resultado */}
            <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '18px 20px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#aaa', marginBottom: 14 }}>CÁLCULO FINAL — 1 KG CARNE INPUT</div>
              {[
                { label: 'Carne',    val: precioCarne, color: '#e74c3c' },
                { label: 'Salmuera', val: costoSalKg,  color: '#2980b9' },
                { label: 'Mostaza',  val: costoMostKg, color: '#f39c12' },
                { label: 'Rub',      val: costoRubKg,  color: '#c39bd3' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: '#888' }}>{r.label}</span>
                  <span style={{ color: r.color, fontWeight: 700 }}>${r.val.toFixed(4)}/kg</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #333', margin: '10px 0', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#aaa' }}>Costo total input</span>
                  <span style={{ color: 'white', fontWeight: 700 }}>${costoInput.toFixed(4)}/kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#aaa' }}>Rendimiento final</span>
                  <span style={{ color: '#a9dfbf' }}>{(kgFinal * 1000).toFixed(0)}g por kg carne ({(kgFinal * 100).toFixed(1)}%)</span>
                </div>
              </div>
              {/* C_final con fórmula */}
              <div style={{ background: 'rgba(39,174,96,0.15)', borderRadius: 10, padding: '12px 16px', marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#a9dfbf' }}>C_final (con mermas)</span>
                  <span style={{ fontSize: 24, fontWeight: 'bold', color: '#27ae60' }}>${cFinal.toFixed(4)}/kg</span>
                </div>
                {/* Fórmula C_final */}
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#a9dfbf', lineHeight: 1.8 }}>
                  <div style={{ color: '#fff', fontWeight: 700, marginBottom: 4, fontSize: 10, letterSpacing: 1 }}>FÓRMULA:</div>
                  <div>
                    C_final = Costo total ÷ Rendimiento final
                  </div>
                  <div style={{ color: '#7dcea0' }}>
                    = (${precioCarne.toFixed(4)} + ${costoSalKg.toFixed(4)} + ${costoMostKg.toFixed(4)} + ${costoRubKg.toFixed(4)}) ÷ {(kgFinal).toFixed(4)} kg
                  </div>
                  <div style={{ color: '#a9dfbf' }}>
                    = ${costoInput.toFixed(4)} ÷ [(1 − {cfg.merma_mad_pct}%) × (1 − {cfg.merma_horno_pct}%) × {kgInyectado.toFixed(3)}]
                  </div>
                  <div style={{ color: '#27ae60', fontWeight: 700 }}>
                    = ${costoInput.toFixed(4)} ÷ {kgFinal.toFixed(4)} = <span style={{ fontSize: 13 }}>${cFinal.toFixed(4)}/kg</span>
                  </div>
                </div>
              </div>

              {/* Margen */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <label style={{ fontSize: 12, color: '#aaa', fontWeight: 700, whiteSpace: 'nowrap' }}>Margen ganancia</label>
                <input type="number" min="0" max="99" step="1" disabled={!modoEdicion}
                  value={cfg.margen}
                  onChange={e => upd('margen', Math.min(99, Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={{ width: 70, padding: '6px 8px', borderRadius: 8, fontSize: 14, fontWeight: 'bold', textAlign: 'center', border: `1.5px solid ${modoEdicion ? '#27ae60' : '#444'}`, background: 'rgba(255,255,255,0.1)', color: 'white', outline: 'none' }} />
                <span style={{ fontSize: 13, color: '#aaa' }}>%</span>
                {cfg.margen > 0 && (
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#aaa' }}>Precio de venta</div>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: '#f39c12' }}>${precioVenta.toFixed(4)}/kg</div>
                  </div>
                )}
              </div>

              {/* Fórmula precio de venta */}
              {cfg.margen > 0 && (
                <div style={{ background: 'rgba(243,156,18,0.1)', borderRadius: 8, padding: '10px 12px', marginTop: 10, fontSize: 11, color: '#f9ca74', lineHeight: 1.8 }}>
                  <div style={{ color: '#fff', fontWeight: 700, marginBottom: 4, fontSize: 10, letterSpacing: 1 }}>FÓRMULA PRECIO DE VENTA:</div>
                  <div>Precio = C_final ÷ (1 − Margen)</div>
                  <div style={{ color: '#f0b429' }}>
                    = ${cFinal.toFixed(4)} ÷ (1 − {cfg.margen}%)
                  </div>
                  <div style={{ color: '#f0b429' }}>
                    = ${cFinal.toFixed(4)} ÷ {((100 - cfg.margen) / 100).toFixed(2)}
                  </div>
                  <div style={{ color: '#f39c12', fontWeight: 700 }}>
                    = <span style={{ fontSize: 13 }}>${precioVenta.toFixed(4)}/kg</span>
                    <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>(el {cfg.margen}% restante = ganancia)</span>
                  </div>
                </div>
              )}
            </div>

            {!modoEdicion && (
              <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 6 }}>
                Presiona <b>✏️ Editar</b> en la barra superior para modificar los valores
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB PRUEBAS ═══ */}
        {tab === 'pruebas' && (
          <Pruebas cfg={cfg} mps={mps} cFinal={cFinal} precioVenta={precioVenta}
            costoInput={costoInput} kgFinal={kgFinal} kgInyectado={kgInyectado}
            kgPostMad={kgPostMad} mermaGrMad={mermaGrMad} mermaGrHorno={mermaGrHorno}
            costoSalKg={costoSalKg} costoMostKg={costoMostKg} costoRubKg={costoRubKg}
            precioCarne={precioCarne} />
        )}

        {/* ═══ TAB PRODUCCIÓN ═══ */}
        {tab === 'produccion' && (
          <div style={{ background: 'white', borderRadius: 12, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center', color: '#555' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Flujo de producción</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.9, marginBottom: 16, textAlign: 'left', maxWidth: 400, margin: '0 auto 16px' }}>
              1. Registrar producción → <b>Salmuera Pastrame</b> + <b>Salón de res</b><br />
              2. Lote pasa a <b>Maduración {cfg.horas_mad}h {cfg.minutos_mad > 0 ? `${cfg.minutos_mad}m` : ''}</b><br />
              3. Al confirmar pesaje → modal <b>🔥 Horneado</b>:<br />
              &nbsp;&nbsp;· Mostaza → Rub → Horno → Reposo<br />
              4. Stock creado en <b>AHUMADOS - HORNEADOS</b>
            </div>
            <div style={{ background: '#f0fff4', borderRadius: 10, padding: '14px 16px', fontSize: 12, color: '#27ae60', border: '1px solid #a9dfbf' }}>
              {lotes.length > 0
                ? `${lotes.length} producción(es) registrada(s) · Última: ${lotes[0].fecha}`
                : 'Sin producciones aún — registra desde Producción › Registrar producción'}
            </div>
          </div>
        )}

        {/* ═══ TAB HISTORIAL ═══ */}
        {tab === 'historial' && (
          <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {lotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Sin producciones registradas</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#1a1a2e' }}>
                      {['Fecha', 'Lote', 'Kg Entrada', 'Kg Final', 'M.Mad%', 'M.Horno%', 'M.Rep%', 'C_final'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', color: '#aaa', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lotes.map((l, i) => (
                      <tr key={l.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        {[l.fecha, l.lote_id || '—',
                          `${parseFloat(l.kg_entrada_horno || 0).toFixed(2)} kg`,
                          `${parseFloat(l.kg_post_reposo || 0).toFixed(2)} kg`,
                          `${parseFloat(l.merma_horno_pct || 0).toFixed(1)}%`,
                          `${parseFloat(l.merma_horno_pct || 0).toFixed(1)}%`,
                          `${parseFloat(l.merma_reposo_pct || 0).toFixed(1)}%`,
                          `$${parseFloat(l.c_final_kg || 0).toFixed(4)}`,
                        ].map((v, j) => (
                          <td key={j} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: j === 7 ? 'bold' : 'normal', color: j === 7 ? '#27ae60' : '#333' }}>{v}</td>
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

      {/* ══ Modal Versiones ══ */}
      {modalVer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 580, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e' }}>🔄 Versiones guardadas</div>
              <button onClick={() => { setModalVer(false); setVerDetalle(null); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            {versiones.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>Sin versiones — usa "Guardar Historial" para guardar una versión</div>
            ) : (
              versiones.map((v, i) => {
                const expandido = verDetalle === i;
                const mpCarneV   = mps.find(m => m.id === v.mp_carne_id);
                const mpMostazaV = mps.find(m => m.id === v.mp_mostaza_id);

                // calcular C_final de esta versión para mostrar
                const costoSalV   = v.kg_sal_base > 0 ? costoSalmuera / v.kg_sal_base : 0;
                const costoMostV  = (parseFloat(v.gramos_mostaza || 0) / 1000) * parseFloat(mpMostazaV?.precio_kg || 0);
                const costoRubV   = v.kg_rub_base > 0 ? costoRub / v.kg_rub_base : 0;
                const precioCarneV= parseFloat(mpCarneV?.precio_kg || 0);
                const costoInputV = precioCarneV + costoSalV + costoMostV + costoRubV;
                const kgInjV      = 1 + 1 * (pctSalmuera / 100);
                const kgPostMadV  = kgInjV * (1 - (v.merma_mad_pct || 0) / 100);
                const kgFinalV    = kgPostMadV * (1 - (v.merma_horno_pct || 0) / 100);
                const cFinalV     = kgFinalV > 0 ? costoInputV / kgFinalV : 0;
                const pvV         = v.margen < 100 ? cFinalV / (1 - (v.margen || 15) / 100) : 0;

                return (
                  <div key={i} style={{ background: '#f8f9fa', borderRadius: 12, marginBottom: 10, overflow: 'hidden', border: expandido ? '2px solid #8e44ad' : '1px solid #e0e0e0' }}>
                    {/* Cabecera de versión */}
                    <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Versión {versiones.length - i} — {v.fecha}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          Merma mad {v.merma_mad_pct}% · Horno {v.merma_horno_pct}% · Margen {v.margen}%
                          {cFinalV > 0 && <span style={{ color: '#27ae60', fontWeight: 700, marginLeft: 8 }}>· C_final ${cFinalV.toFixed(4)}/kg</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setVerDetalle(expandido ? null : i)}
                          style={{ background: expandido ? '#f0e6ff' : 'white', color: '#8e44ad', border: '1.5px solid #8e44ad', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                          {expandido ? '▲ Ocultar' : '▼ Ver'}
                        </button>
                        <button onClick={() => restaurarVersion(v)}
                          style={{ background: '#8e44ad', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                          Restaurar
                        </button>
                      </div>
                    </div>

                    {/* Detalle expandido */}
                    {expandido && (
                      <div style={{ borderTop: '1px solid #e0e0e0', padding: '14px 16px', background: 'white' }}>
                        {/* Configuración */}
                        <div style={{ fontWeight: 700, fontSize: 11, color: '#888', marginBottom: 10, letterSpacing: 1 }}>CONFIGURACIÓN</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                          <DetalleItem label="⏱ Maduración" valor={`${v.horas_mad || 0}h ${v.minutos_mad || 0}m`} />
                          <DetalleItem label="🟡 Mostaza" valor={`${v.gramos_mostaza || 0}g = ${((v.gramos_mostaza || 0)/1000).toFixed(3)} kg`} />
                        </div>

                        {/* Ingredientes */}
                        <div style={{ fontWeight: 700, fontSize: 11, color: '#888', marginBottom: 10, letterSpacing: 1 }}>INGREDIENTES Y COSTOS</div>
                        {[
                          { label: '💉 Salmuera',  val: v.formula_salmuera || '—', extra: v.kg_sal_base  ? `para ${v.kg_sal_base} kg carne` : '', costo: costoSalV,   color: '#2980b9' },
                          { label: '🥩 Carne',     val: mpCarneV ? (mpCarneV.nombre_producto || mpCarneV.nombre) : (v.mp_carne_id ? '(MP no encontrada)' : '—'), costo: precioCarneV, color: '#e74c3c' },
                          { label: '🟡 Mostaza',   val: mpMostazaV ? (mpMostazaV.nombre_producto || mpMostazaV.nombre) : (v.mp_mostaza_id ? '(MP no encontrada)' : '—'), costo: costoMostV,  color: '#f39c12' },
                          { label: '🌶️ Rub',       val: v.formula_rub || '—',      extra: v.kg_rub_base  ? `para ${v.kg_rub_base} kg carne` : '', costo: costoRubV,   color: '#6c3483' },
                        ].map(r => (
                          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                            <div>
                              <span style={{ fontWeight: 700, color: r.color }}>{r.label}</span>
                              <span style={{ color: '#555', marginLeft: 6 }}>{r.val}</span>
                              {r.extra && <span style={{ color: '#aaa', fontSize: 10, marginLeft: 6 }}>{r.extra}</span>}
                            </div>
                            <span style={{ fontWeight: 700, color: r.color, whiteSpace: 'nowrap', marginLeft: 10 }}>${r.costo.toFixed(4)}/kg</span>
                          </div>
                        ))}

                        {/* Mermas */}
                        <div style={{ fontWeight: 700, fontSize: 11, color: '#888', margin: '14px 0 10px', letterSpacing: 1 }}>MERMAS Y RESULTADO</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          <DetalleItem label="📉 Merma Maduración" valor={`${v.merma_mad_pct || 0}%`} color="#8e44ad" />
                          <DetalleItem label="📉 Merma Horneado"   valor={`${v.merma_horno_pct || 0}%`} color="#e74c3c" />
                        </div>

                        {/* Resultado */}
                        <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#aaa' }}>C_final</div>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#27ae60' }}>${cFinalV.toFixed(4)}/kg</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#aaa' }}>Precio venta ({v.margen}%)</div>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#f39c12' }}>${pvV.toFixed(4)}/kg</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────
function Seccion({ titulo, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#888', marginBottom: 14, letterSpacing: 1 }}>{titulo}</div>
      {children}
    </div>
  );
}

function Label({ color, children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6 }}>{children}</div>;
}

function CampoNum({ label, color, value, onChange, disabled, max }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{label}</div>
      <input type="number" min="0" step="1" max={max}
        disabled={disabled}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 14, fontWeight: 'bold', textAlign: 'right', boxSizing: 'border-box', outline: 'none', border: `1.5px solid ${disabled ? '#ddd' : color}`, background: disabled ? '#f8f9fa' : 'white', color: disabled ? '#888' : '#333' }} />
    </div>
  );
}

function CampoSelect({ value, onChange, options, placeholder, color, disabled }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${disabled ? '#ddd' : color}`, fontSize: 13, background: disabled ? '#f8f9fa' : 'white', color: disabled ? '#888' : '#333', boxSizing: 'border-box' }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function CampoBaseKg({ label, value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <input type="number" min="0.1" step="0.1" disabled={disabled}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 1)}
        style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: `1.5px solid ${disabled ? '#ddd' : '#555'}`, fontSize: 12, textAlign: 'right', fontWeight: 'bold', background: disabled ? '#f8f9fa' : 'white' }} />
      <span style={{ color: '#888' }}>kg de carne</span>
    </div>
  );
}

function FilaCosto({ icon, titulo, color, costoKg, nota, children }) {
  return (
    <div style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{icon} {titulo}</span>
        <span style={{ fontSize: 14, fontWeight: 'bold', color }}>${costoKg.toFixed(4)}/kg</span>
      </div>
      {children}
      {nota && <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>{nota}</div>}
    </div>
  );
}

function DetalleItem({ label, valor, color = '#333' }) {
  return (
    <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '7px 10px' }}>
      <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{valor}</div>
    </div>
  );
}

function Pruebas({ cfg, cFinal, precioVenta, costoInput, kgFinal, kgInyectado, kgPostMad, mermaGrMad, mermaGrHorno, costoSalKg, costoMostKg, costoRubKg, precioCarne }) {
  const [kgSim, setKgSim] = useState('1');
  const kg = parseFloat(kgSim) || 1;

  // Totales escalados para el lote completo
  const costoTotalLote   = costoInput * kg;           // dinero total invertido
  const kgProductoFinal  = kgFinal * kg;              // kg de producto que salen
  const ingresoTotalLote = precioVenta * kgProductoFinal; // dinero que entra al vender todo
  const gananciaLote     = ingresoTotalLote - costoTotalLote;

  const FilaSim = ({ label, valor, color, bold, grande }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: bold ? '#333' : '#666', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: grande ? 16 : 13, color, fontWeight: 700 }}>{valor}</span>
    </div>
  );

  return (
    <div>
      {/* Input kg */}
      <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#555', marginBottom: 12 }}>¿Cuántos kg de carne vas a procesar?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="number" min="0.1" step="0.1" value={kgSim}
            onChange={e => setKgSim(e.target.value)}
            style={{ width: 110, padding: '10px 12px', borderRadius: 8, border: '2px solid #2980b9', fontSize: 18, fontWeight: 'bold', textAlign: 'right' }} />
          <span style={{ fontSize: 15, color: '#555', fontWeight: 700 }}>kg de carne cruda</span>
        </div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
          Todo escala proporcionalmente — costos, mermas y rendimiento
        </div>
      </div>

      {/* Costos del lote */}
      <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#888', marginBottom: 10, letterSpacing: 1 }}>COSTO DE INGREDIENTES PARA {kg} KG</div>
        {[
          { label: `🥩 Carne (${kg} kg × $${precioCarne.toFixed(4)}/kg)`,       val: precioCarne * kg, color: '#e74c3c' },
          { label: `💉 Salmuera (${kg} kg × $${costoSalKg.toFixed(4)}/kg)`,    val: costoSalKg  * kg, color: '#2980b9' },
          { label: `🟡 Mostaza (${kg} kg × $${costoMostKg.toFixed(4)}/kg)`,    val: costoMostKg * kg, color: '#f39c12' },
          { label: `🌶️ Rub (${kg} kg × $${costoRubKg.toFixed(4)}/kg)`,         val: costoRubKg  * kg, color: '#6c3483' },
        ].map(r => (
          <FilaSim key={r.label} label={r.label} valor={`$${r.val.toFixed(4)}`} color={r.color} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', alignItems: 'center', borderTop: '2px solid #eee', marginTop: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>TOTAL INVERTIDO</span>
          <span style={{ fontWeight: 'bold', fontSize: 18, color: '#e74c3c' }}>${costoTotalLote.toFixed(4)}</span>
        </div>
      </div>

      {/* Rendimiento */}
      <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#888', marginBottom: 10, letterSpacing: 1 }}>RENDIMIENTO DEL LOTE</div>
        <FilaSim label={`Kg inyectado (carne + salmuera)`} valor={`${(kgInyectado * kg).toFixed(3)} kg`} color="#2980b9" />
        <FilaSim label={`Merma maduración ${cfg.merma_mad_pct}%`} valor={`−${(mermaGrMad * kg / 1000).toFixed(3)} kg`} color="#8e44ad" />
        <FilaSim label={`Merma horneado ${cfg.merma_horno_pct}%`} valor={`−${(mermaGrHorno * kg / 1000).toFixed(3)} kg`} color="#e74c3c" />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', alignItems: 'center', borderTop: '2px solid #eee', marginTop: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>KG PRODUCTO FINAL</span>
          <span style={{ fontWeight: 'bold', fontSize: 18, color: '#27ae60' }}>{kgProductoFinal.toFixed(3)} kg</span>
        </div>
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
          De {kg} kg de carne → {kgProductoFinal.toFixed(3)} kg de Pastrame terminado ({(kgProductoFinal/kg*100).toFixed(1)}% rendimiento)
        </div>
      </div>

      {/* Resultado económico */}
      <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#aaa', marginBottom: 14, letterSpacing: 1 }}>RESULTADO ECONÓMICO DEL LOTE</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: '#888' }}>C_final por kg de producto <span style={{ fontSize: 10 }}>(constante)</span></span>
          <span style={{ color: '#27ae60', fontWeight: 700 }}>${cFinal.toFixed(4)}/kg</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: '#888' }}>Precio venta por kg <span style={{ fontSize: 10 }}>({cfg.margen}% margen)</span></span>
          <span style={{ color: '#f39c12', fontWeight: 700 }}>${precioVenta.toFixed(4)}/kg</span>
        </div>

        <div style={{ borderTop: '1px solid #333', marginTop: 10, paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#aaa' }}>Costo total del lote</span>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: '#e74c3c' }}>${costoTotalLote.toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#aaa' }}>Ingreso total ({kgProductoFinal.toFixed(3)} kg × ${precioVenta.toFixed(4)})</span>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: '#f39c12' }}>${ingresoTotalLote.toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: gananciaLote >= 0 ? 'rgba(39,174,96,0.15)' : 'rgba(231,76,60,0.15)', borderRadius: 8, padding: '10px 14px', marginTop: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: gananciaLote >= 0 ? '#a9dfbf' : '#f1948a' }}>
              GANANCIA DEL LOTE ({cfg.margen}%)
            </span>
            <span style={{ fontSize: 20, fontWeight: 'bold', color: gananciaLote >= 0 ? '#27ae60' : '#e74c3c' }}>
              ${gananciaLote.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
