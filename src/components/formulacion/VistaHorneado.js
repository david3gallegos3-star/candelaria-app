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
  subproductos: {},
};

const SP_TIPOS = ['perdida', 'nueva_mp', 'mp_existente'];
const SP_TYPE_DEF = {
  perdida:      { activo: false, kg: 0 },
  nueva_mp:     { activo: false, kg: 0, nombre: '', precio_kg: 0 },
  mp_existente: { activo: false, kg: 0, mp_id: '' },
};
function migrarFaseSP(val) {
  if (!val || typeof val !== 'object') return {};
  if ('perdida' in val || 'nueva_mp' in val || 'mp_existente' in val) return val;
  const tipo = val.tipo || 'perdida';
  return Object.fromEntries(SP_TIPOS.map(t => {
    const base = { ...SP_TYPE_DEF[t], activo: tipo === t ? !!val.activo : false, kg: tipo === t ? (val.kg || 0) : 0 };
    if (t === 'nueva_mp'     && tipo === t) { base.nombre = val.nombre || ''; base.precio_kg = val.precio_kg || 0; }
    if (t === 'mp_existente' && tipo === t) { base.mp_id = val.mp_id || ''; }
    return [t, base];
  }));
}
function getSPFase(cfg, fase) {
  const m = migrarFaseSP((cfg.subproductos || {})[fase] || {});
  return {
    perdida:      { ...SP_TYPE_DEF.perdida,      ...(m.perdida      || {}) },
    nueva_mp:     { ...SP_TYPE_DEF.nueva_mp,     ...(m.nueva_mp     || {}) },
    mp_existente: { ...SP_TYPE_DEF.mp_existente, ...(m.mp_existente || {}) },
  };
}

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
  const [totalSalKg,    setTotalSalKg]    = useState(0);
  const [costoRub,      setCostoRub]      = useState(0);
  const [rubFilas,      setRubFilas]      = useState([]);
  const [pctSalmuera,   setPctSalmuera]   = useState(15);
  const [spRealesLote,  setSpRealesLote]  = useState({});

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
    const spInit = {};
    (horneados || []).forEach(l => { if (l.subproductos_real) spInit[l.id] = l.subproductos_real; });
    setSpRealesLote(spInit);
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
      const totalCosto = (filas || []).reduce((s, f) => {
        const mp = mps.find(m => m.id === f.materia_prima_id);
        return s + (parseFloat(f.gramos || 0) / 1000) * parseFloat(mp?.precio_kg || 0);
      }, 0);
      const totalKg = (filas || []).reduce((s, f) => s + parseFloat(f.gramos || 0) / 1000, 0);
      setCostoSalmuera(totalCosto);
      setTotalSalKg(totalKg);
      setPctSalmuera(parseFloat(cfgSal?.porcentaje_salmuera) || 15);
    })();
  }, [cfg.formula_salmuera, mps]);

  // ── Cargar costo Rub ───────────────────────────────────────
  useEffect(() => {
    if (!cfg.formula_rub || !mps.length) return;
    (async () => {
      const { data: filas } = await supabase.from('formulaciones').select('gramos,materia_prima_id').eq('producto_nombre', cfg.formula_rub);
      setRubFilas(filas || []);
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

  async function guardarSpLote(loteId, spData) {
    try { await supabase.from('produccion_horneado_lotes').update({ subproductos_real: spData }).eq('id', loteId); }
    catch (_) {}
  }

  // ── Cálculos ───────────────────────────────────────────────
  const mpCarne     = mps.find(m => m.id === cfg.mp_carne_id);
  const mpMostaza   = mps.find(m => m.id === cfg.mp_mostaza_id);
  const precioCarne = parseFloat(mpCarne?.precio_kg  || 0);
  const precioMost  = parseFloat(mpMostaza?.precio_kg || 0);
  // precio por kg de salmuera líquida × kg inyectados por kg de carne
  const precioKgSal    = totalSalKg > 0 ? costoSalmuera / totalSalKg : 0;
  const costoSalKg     = precioKgSal * (pctSalmuera / 100);
  // kg de salmuera inyectados por cada kg de carne (según fórmula)
  const kgSalPorKgCarne = cfg.kg_sal_base > 0 ? totalSalKg / cfg.kg_sal_base : 0;
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

  // Sub-productos: todos reducen peso final; créditos (nueva_mp/mp_existente) también reducen costo
  const spActivosAll = [];
  Object.entries(cfg.subproductos || {}).forEach(([fase, faseData]) => {
    const fd = getSPFase({ subproductos: { [fase]: faseData } }, fase);
    SP_TIPOS.forEach(tipo => {
      const sp = fd[tipo];
      if (!sp?.activo || parseFloat(sp.kg || 0) <= 0) return;
      const mp = tipo === 'mp_existente' ? mps.find(m => m.id === sp.mp_id) : null;
      const precio = tipo === 'mp_existente' ? parseFloat(mp?.precio_kg || 0) : parseFloat(sp.precio_kg || 0);
      const kg = parseFloat(sp.kg || 0);
      const nombre = tipo === 'nueva_mp' ? sp.nombre : tipo === 'mp_existente' ? (mp?.nombre_producto || mp?.nombre || '—') : 'Merma';
      spActivosAll.push({ fase, tipo, sp, kg, precio, valor: tipo !== 'perdida' ? kg * precio : 0, nombre });
    });
  });
  const spActivos          = spActivosAll.filter(x => x.tipo !== 'perdida');
  const totalSubprodKg     = spActivosAll.reduce((s, x) => s + x.kg, 0);
  const totalRecuperado    = spActivos.reduce((s, x) => s + x.valor, 0);
  const kgFinalAjustado    = Math.max(0, kgFinal - totalSubprodKg);
  const costoNeto          = costoInput - totalRecuperado;
  const cFinalAjustado     = kgFinalAjustado > 0 ? costoNeto / kgFinalAjustado : 0;
  const precioVentaAjustado= cfg.margen < 100 ? cFinalAjustado / (1 - cfg.margen / 100) : 0;
  const haySP              = spActivos.length > 0;

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
                nota={cfg.formula_salmuera ? `Batch $${costoSalmuera.toFixed(4)} ÷ ${totalSalKg.toFixed(3)} kg = $${precioKgSal.toFixed(4)}/kg` : ''}>
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

            {/* ── Sub-productos por proceso ── */}
            <Seccion titulo="SUB-PRODUCTOS / CO-PRODUCTOS POR PROCESO">
              <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                Si en alguna fase obtienes un producto secundario (recortes, grasa, jugo, etc.), actívalo. Su valor se <b>descuenta del costo final</b>.
              </div>
              {[
                { fase: 'inyeccion',  icon: '💉', titulo: 'Sub-producto Inyección', kgRef: kgSalInj },
                { fase: 'maduracion', icon: '🧊', titulo: 'Merma Maduración',       kgRef: mermaGrMad   / 1000 },
                { fase: 'horneado',   icon: '🔥', titulo: 'Merma Horneado',         kgRef: mermaGrHorno / 1000 },
                { fase: 'mostaza',    icon: '🟡', titulo: 'Sub-producto Mostaza',   kgRef: parseFloat(cfg.gramos_mostaza || 0) / 1000 },
                { fase: 'rub',        icon: '🌶️', titulo: 'Sub-producto Rub',       kgRef: 0 },
              ].map(({ fase, icon, titulo, kgRef }) => (
                <SubprodFasePanel key={fase}
                  fase={fase} icon={icon} titulo={titulo} kgRef={kgRef}
                  cfg={cfg} setCfg={setCfg} mps={mps} disabled={!modoEdicion} />
              ))}
              {haySP && (
                <div style={{ background: '#eafaf1', borderRadius: 10, padding: '10px 14px', border: '1.5px solid #a9dfbf', marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#27ae60' }}>
                    <span>💰 Total recuperado por sub-productos</span>
                    <span>−${totalRecuperado.toFixed(4)} / kg carne</span>
                  </div>
                </div>
              )}
            </Seccion>

            {/* ── RESULTADO A: Inversión Total ── */}
            <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '18px 20px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>

              {/* Bloque A */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ background: '#e74c3c', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: 'white' }}>A</div>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#ddd', letterSpacing: 1 }}>ENTRADA DE INSUMOS (por 1 kg de carne)</span>
                </div>
                {[
                  { label: 'Carne',    val: precioCarne, color: '#e74c3c' },
                  { label: 'Salmuera', val: costoSalKg,  color: '#2980b9' },
                  { label: 'Mostaza',  val: costoMostKg, color: '#f39c12' },
                  { label: 'Rub',      val: costoRubKg,  color: '#c39bd3' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, paddingLeft: 8 }}>
                    <span style={{ color: '#888' }}>+ {r.label}</span>
                    <span style={{ color: r.color, fontWeight: 700 }}>${r.val.toFixed(4)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #333', paddingTop: 8, marginTop: 4 }}>
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>= Inversión Total (Resultado A)</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>${costoInput.toFixed(4)}</span>
                </div>
              </div>

              {/* Bloque B */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ background: '#8e44ad', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: 'white' }}>B</div>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#ddd', letterSpacing: 1 }}>PROCESO DE MERMAS</span>
                </div>
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: '#888' }}>Kg inyectado (carne + salmuera)</span>
                    <span style={{ color: '#7ec8f7', fontWeight: 700 }}>{kgInyectado.toFixed(4)} kg</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: '#888' }}>− Merma maduración ({cfg.merma_mad_pct}%)</span>
                    <span style={{ color: '#c39bd3', fontWeight: 700 }}>−{mermaGrMad.toFixed(0)} g</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: haySP ? 5 : 8 }}>
                    <span style={{ color: '#888' }}>− Merma horneado ({cfg.merma_horno_pct}%)</span>
                    <span style={{ color: '#e74c3c', fontWeight: 700 }}>−{mermaGrHorno.toFixed(0)} g</span>
                  </div>
                  {haySP && spActivos.map(x => (
                    <div key={x.fase} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: '#27ae60' }}>− Sub-producto: {x.nombre || x.fase} ({(x.kg * 1000).toFixed(0)} g)</span>
                      <span style={{ color: '#27ae60', fontWeight: 700 }}>−{(x.kg * 1000).toFixed(0)} g</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #333', paddingTop: 8 }}>
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>= Peso Total de Salida (Resultado B)</span>
                  <span style={{ color: haySP ? '#f39c12' : 'white', fontWeight: 'bold', fontSize: 16 }}>
                    {haySP
                      ? `${(kgFinalAjustado * 1000).toFixed(0)} g · ${kgFinalAjustado.toFixed(4)} kg`
                      : `${(kgFinal * 1000).toFixed(0)} g · ${kgFinal.toFixed(4)} kg`}
                  </span>
                </div>
              </div>

              {/* Costo Real = A / B (con sub-productos si aplica) */}
              <div style={{ background: 'rgba(39,174,96,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                {haySP ? (
                  <>
                    <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
                      Sin sub-productos: ${costoInput.toFixed(4)} ÷ {kgFinal.toFixed(4)} kg = ${cFinal.toFixed(4)}/kg
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: '#a9dfbf' }}>Costo total (A)</span>
                      <span style={{ color: 'white', fontWeight: 700 }}>${costoInput.toFixed(4)}</span>
                    </div>
                    {spActivos.map(x => (
                      <div key={x.fase} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: '#2ecc71' }}>− {x.nombre || x.fase} ({(x.kg * 1000).toFixed(0)} g × ${x.precio.toFixed(4)}/kg)</span>
                        <span style={{ color: '#2ecc71', fontWeight: 700 }}>−${x.valor.toFixed(4)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid #2ecc7155', paddingTop: 6, marginTop: 4, marginBottom: 6 }}>
                      <span style={{ color: '#a9dfbf' }}>= Costo neto ÷ {kgFinalAjustado.toFixed(4)} kg (Resultado B ajustado)</span>
                      <span style={{ color: '#a9dfbf', fontWeight: 700 }}>${costoNeto.toFixed(4)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#a9dfbf' }}>COSTO AJUSTADO POR KG</span>
                      <span style={{ fontSize: 26, fontWeight: 'bold', color: '#27ae60' }}>${cFinalAjustado.toFixed(4)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: '#a9dfbf', marginBottom: 6 }}>Costo Real/kg = Resultado A ÷ Resultado B</div>
                    <div style={{ fontSize: 12, color: '#7dcea0', marginBottom: 6 }}>= ${costoInput.toFixed(4)} ÷ {kgFinal.toFixed(4)} kg</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#a9dfbf' }}>COSTO REAL POR KG</span>
                      <span style={{ fontSize: 26, fontWeight: 'bold', color: '#27ae60' }}>${cFinal.toFixed(4)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Margen → Precio de venta */}
              <div style={{ background: 'rgba(243,156,18,0.12)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#f9ca74', fontWeight: 700 }}>Margen de ganancia</span>
                  <input type="number" min="0" max="99" step="1" disabled={!modoEdicion}
                    value={cfg.margen}
                    onChange={e => upd('margen', Math.min(99, Math.max(0, parseFloat(e.target.value) || 0)))}
                    style={{ width: 60, padding: '5px 8px', borderRadius: 8, fontSize: 14, fontWeight: 'bold', textAlign: 'center', border: `1.5px solid ${modoEdicion ? '#f39c12' : '#555'}`, background: 'rgba(255,255,255,0.08)', color: 'white', outline: 'none' }} />
                  <span style={{ fontSize: 13, color: '#f9ca74' }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: '#f0b429', marginBottom: 6 }}>
                  Precio = ${(haySP ? cFinalAjustado : cFinal).toFixed(4)} ÷ (1 − {cfg.margen}%) = ${(haySP ? cFinalAjustado : cFinal).toFixed(4)} ÷ {((100 - cfg.margen) / 100).toFixed(2)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#f9ca74' }}>PRECIO DE VENTA/KG</span>
                  <span style={{ fontSize: 26, fontWeight: 'bold', color: '#f39c12' }}>${(haySP ? precioVentaAjustado : precioVenta).toFixed(4)}</span>
                </div>
              </div>
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
          <Pruebas cfg={cfg} mps={mps} cFinal={cFinal}
            costoSalKg={costoSalKg} costoMostKg={costoMostKg} costoRubKg={costoRubKg}
            precioCarne={precioCarne} />
        )}

        {/* ═══ TAB PRODUCCIÓN ═══ */}
        {tab === 'produccion' && (
          <div>
            {lotes.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: '#aaa', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏭</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: '#888' }}>Sin producciones registradas</div>
                <div style={{ fontSize: 12 }}>Registra desde el módulo Producción › Registrar.</div>
              </div>
            ) : lotes.map((lote, idx) => {
              const kgFinalL    = parseFloat(lote.kg_post_horno || lote.kg_post_reposo || 0);
              const cFinalL     = parseFloat(lote.c_final_kg || 0);
              const costoMostL  = parseFloat(lote.costo_mostaza || 0);
              const costoRubL   = parseFloat(lote.costo_rub || 0);
              const costoTotL   = cFinalL * kgFinalL;
              const costoCarSal = Math.max(0, costoTotL - costoMostL - costoRubL);
              const kgEntL      = parseFloat(lote.kg_entrada_horno || 0);
              const mermaHPct   = parseFloat(lote.merma_horno_pct || 0);
              const mermaHKg    = parseFloat(lote.merma_horno_kg || Math.max(0, kgEntL - kgFinalL));
              const precVentaL  = cfg.margen < 100 ? cFinalL / (1 - cfg.margen / 100) : 0;
              const gananciaL   = precVentaL - cFinalL;

              // Estimar kg de carne a partir del costo (carne+sal total / costo por kg de carne)
              const costoPorKgCarne = precioCarne + costoSalKg;
              const kgCarneEst  = costoPorKgCarne > 0 ? costoCarSal / costoPorKgCarne : 0;
              const kgSalEst    = kgCarneEst * kgSalPorKgCarne;
              const kgInjEst    = kgCarneEst + kgSalEst;
              const merMadKg    = Math.max(0, kgInjEst - kgEntL);
              const merMadPct   = kgInjEst > 0 ? (merMadKg / kgInjEst * 100) : 0;

              // Escalar ingredientes del rub al kg_rub real del lote
              const totalRubFormKg = rubFilas.reduce((s, f) => s + parseFloat(f.gramos || 0) / 1000, 0);
              const rubScale    = totalRubFormKg > 0 ? parseFloat(lote.kg_rub || 0) / totalRubFormKg : 0;

              // Sub-productos reales para este lote (incluye perdida para mostrar merma real)
              const spRealesL = spRealesLote[lote.id] || {};
              const spPorFaseTipo = [];
              Object.entries(cfg.subproductos || {}).forEach(([fase, faseData]) => {
                const fd = getSPFase({ subproductos: { [fase]: faseData } }, fase);
                SP_TIPOS.forEach(tipo => {
                  const sp = fd[tipo];
                  if (!sp?.activo) return;
                  const mp = tipo === 'mp_existente' ? mps.find(m => m.id === sp.mp_id) : null;
                  const precio = tipo === 'perdida' ? 0 : tipo === 'mp_existente' ? parseFloat(mp?.precio_kg || 0) : parseFloat(sp.precio_kg || 0);
                  const nombre = tipo === 'nueva_mp' ? sp.nombre : tipo === 'mp_existente' ? (mp?.nombre_producto || mp?.nombre || '—') : 'Merma';
                  spPorFaseTipo.push({ fase, tipo, sp, precio, nombre, key: `${fase}_${tipo}` });
                });
              });
              const haySpConf = spPorFaseTipo.length > 0;
              const totalSpRealKg    = spPorFaseTipo.reduce((s, x) => s + parseFloat(spRealesL[x.key] || 0), 0);
              const totalSpRealValor = spPorFaseTipo.reduce((s, x) => s + parseFloat(spRealesL[x.key] || 0) * x.precio, 0);
              const kgFinLAjust      = haySpConf && totalSpRealKg > 0 ? Math.max(0, kgFinalL - totalSpRealKg) : kgFinalL;
              const costoNetoL       = costoTotL - totalSpRealValor;
              const cFinalLAjust     = haySpConf && totalSpRealKg > 0 && kgFinLAjust > 0 ? costoNetoL / kgFinLAjust : cFinalL;
              const precVentaLAjust  = cfg.margen < 100 ? cFinalLAjust / (1 - cfg.margen / 100) : 0;
              const haySpReal        = haySpConf && totalSpRealKg > 0;

              const renderSpDisplay = (fase) => {
                const items = spPorFaseTipo.filter(x => x.fase === fase);
                if (items.length === 0) return null;
                return items.map(x => {
                  const kgReal    = parseFloat(spRealesL[x.key] || 0);
                  const valorReal = kgReal * x.precio;
                  const esPerdida = x.tipo === 'perdida';
                  const bg     = kgReal > 0 ? (esPerdida ? '#fff5f5' : '#eafaf1') : '#f8f8f8';
                  const border = kgReal > 0 ? (esPerdida ? '#f5b7b1' : '#a9dfbf') : '#e0e0e0';
                  const color  = kgReal > 0 ? (esPerdida ? '#e74c3c' : '#27ae60') : '#aaa';
                  return (
                    <div key={x.key} style={{ marginLeft: 30, background: bg, borderRadius: 8, padding: '7px 12px', border: `1.5px solid ${border}`, marginTop: 4, marginBottom: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>
                          {esPerdida ? '❌' : '📦'} {x.nombre || fase}
                        </span>
                        {kgReal > 0 ? (
                          esPerdida
                            ? <span style={{ fontSize: 12, color: '#e74c3c', fontWeight: 700 }}>{kgReal.toFixed(3)} kg merma real</span>
                            : <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 700 }}>{kgReal.toFixed(3)} kg · −${valorReal.toFixed(4)} recuperado</span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#bbb' }}>Sin datos</span>
                        )}
                      </div>
                    </div>
                  );
                });
              };

              return (
                <div key={lote.id || idx} style={{ background: 'white', borderRadius: 12, padding: mobile ? 14 : 20, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: idx === 0 ? '2px solid #27ae60' : '1px solid #f0f0f0' }}>

                  {/* Cabecera */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      {idx === 0 && <div style={{ fontSize: 10, fontWeight: 700, color: '#27ae60', letterSpacing: 1, marginBottom: 3 }}>ÚLTIMA PRODUCCIÓN</div>}
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e' }}>📦 Lote {lote.lote_id || '—'}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>📅 {lote.fecha || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#27ae60' }}>${cFinalL.toFixed(4)}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>por kg · {kgFinalL.toFixed(3)} kg finales</div>
                    </div>
                  </div>

                  {/* Fase 1: Inyección + Maduración */}
                  <FaseProd num={1} color="#2980b9" icon="💉" titulo="INYECCIÓN + MADURACIÓN">
                    {kgCarneEst > 0 && <>
                      <FilaProd label={`🥩 Carne (${mpCarne ? (mpCarne.nombre_producto || mpCarne.nombre) : '—'})`} valor={`${kgCarneEst.toFixed(3)} kg · $${(kgCarneEst * precioCarne).toFixed(4)}`} color="#e74c3c" />
                      <FilaProd label={`💧 Salmuera inyectada (${cfg.formula_salmuera || '—'})`} valor={`${kgSalEst.toFixed(3)} kg · $${(kgCarneEst * costoSalKg).toFixed(4)}`} color="#2980b9" />
                      <div style={{ borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6 }}>
                        <FilaProd label="→ Kg inyectado" valor={`${kgInjEst.toFixed(3)} kg`} color="#2980b9" bold />
                      </div>
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #eee' }}>
                        <FilaProd label={`⏱ Maduración ${cfg.horas_mad}h — merma (${merMadPct.toFixed(1)}%)`} valor={`−${merMadKg.toFixed(3)} kg`} color="#8e44ad" />
                        <FilaProd label="→ Kg salida maduración" valor={`${kgEntL.toFixed(3)} kg`} color="#8e44ad" bold />
                      </div>
                    </>}
                    {kgCarneEst <= 0 && <FilaProd label="Kg salida maduración" valor={`${kgEntL.toFixed(3)} kg`} color="#2980b9" bold />}
                    <div style={{ marginTop: 4, fontSize: 10, color: '#bbb' }}>* Carne y salmuera estimadas a partir del costo registrado</div>
                  </FaseProd>
                  {renderSpDisplay('maduracion')}
                  {renderSpDisplay('inyeccion')}

                  <div style={{ textAlign: 'center', color: '#ddd', fontSize: 14, margin: '2px 0 2px 28px' }}>↓</div>

                  {/* Fase 2: Mostaza */}
                  <FaseProd num={2} color="#e67e22" icon="🟡" titulo="MOSTAZA">
                    <FilaProd
                      label={`${mpMostaza ? (mpMostaza.nombre_producto || mpMostaza.nombre) : 'Mostaza'}`}
                      valor={`${((lote.kg_mostaza || 0) * 1000).toFixed(0)} g · $${costoMostL.toFixed(4)}`}
                      color="#e67e22" bold />
                  </FaseProd>
                  {renderSpDisplay('mostaza')}

                  <div style={{ textAlign: 'center', color: '#ddd', fontSize: 14, margin: '2px 0 2px 28px' }}>↓</div>

                  {/* Fase 3: Rub — desglose por ingrediente */}
                  <FaseProd num={3} color="#6c3483" icon="🌶️" titulo={`RUB${cfg.formula_rub ? ` — ${cfg.formula_rub}` : ''}`}>
                    {rubFilas.length > 0 && rubScale > 0
                      ? rubFilas.map((f, i) => {
                          const mp        = mps.find(m => m.id === f.materia_prima_id);
                          const gActual   = (parseFloat(f.gramos || 0) * rubScale);
                          const costoF    = (gActual / 1000) * parseFloat(mp?.precio_kg || 0);
                          return (
                            <FilaProd key={i}
                              label={mp ? (mp.nombre_producto || mp.nombre) : `MP ${f.materia_prima_id}`}
                              valor={`${gActual.toFixed(1)} g · $${costoF.toFixed(4)}`}
                              color="#6c3483" />
                          );
                        })
                      : <FilaProd label="Rub aplicado" valor={`${parseFloat(lote.kg_rub || 0).toFixed(3)} kg`} color="#6c3483" />
                    }
                    <div style={{ borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6 }}>
                      <FilaProd label="Total rub" valor={`${(parseFloat(lote.kg_rub || 0) * 1000).toFixed(0)} g · $${costoRubL.toFixed(4)}`} color="#6c3483" bold />
                    </div>
                  </FaseProd>
                  {renderSpDisplay('rub')}

                  <div style={{ textAlign: 'center', color: '#ddd', fontSize: 14, margin: '2px 0 2px 28px' }}>↓</div>

                  {/* Fase 4: Horneado */}
                  <FaseProd num={4} color="#e74c3c" icon="🔥" titulo="HORNEADO">
                    <FilaProd label="Kg entrada al horno" valor={`${kgEntL.toFixed(3)} kg`} />
                    <FilaProd label={`− Merma horneado (${mermaHPct.toFixed(1)}%)`} valor={`−${mermaHKg.toFixed(3)} kg`} color="#e74c3c" />
                    <div style={{ borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6 }}>
                      <FilaProd label="→ Kg finales" valor={`${kgFinalL.toFixed(3)} kg`} color="#27ae60" bold />
                    </div>
                  </FaseProd>
                  {renderSpDisplay('horneado')}


                  {/* Resultado */}
                  <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '14px 16px', marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 10, letterSpacing: 1 }}>RESULTADO — LOTE {lote.lote_id || ''}</div>
                    {[
                      ['Carne + Salmuera', costoCarSal, '#7ec8f7'],
                      ['+ Mostaza',        costoMostL,  '#f5c842'],
                      ['+ Rub',            costoRubL,   '#c39bd3'],
                    ].map(([lbl, v, col]) => (
                      <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#888' }}>{lbl}</span>
                        <span style={{ color: col, fontWeight: 700 }}>${v.toFixed(4)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(126,200,247,0.12)', borderRadius: 8, padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
                      <span style={{ color: '#7ec8f7', fontWeight: 700, fontSize: 13 }}>COSTO TOTAL BATCH</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#7ec8f7' }}>${costoTotL.toFixed(4)}</span>
                    </div>

                    {/* Sub-productos reales: ajuste de costo */}
                    {haySpReal && (
                      <div style={{ background: 'rgba(39,174,96,0.08)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, border: '1px solid #a9dfbf44' }}>
                        {spPorFaseTipo.map(x => {
                          const kgR      = parseFloat(spRealesL[x.key] || 0);
                          const valR     = kgR * x.precio;
                          const esPerd   = x.tipo === 'perdida';
                          if (kgR <= 0) return null;
                          return (
                            <div key={x.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                              {esPerd
                                ? <span style={{ color: '#e74c3c' }}>❌ Merma real: {x.nombre || x.fase} ({kgR.toFixed(3)} kg)</span>
                                : <span style={{ color: '#2ecc71' }}>− {x.nombre || x.fase} ({kgR.toFixed(3)} kg × ${x.precio.toFixed(4)}/kg)</span>}
                              {esPerd
                                ? <span style={{ color: '#e74c3c', fontWeight: 700 }}>−{kgR.toFixed(3)} kg</span>
                                : <span style={{ color: '#2ecc71', fontWeight: 700 }}>−${valR.toFixed(4)}</span>}
                            </div>
                          );
                        })}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid #2ecc7144', paddingTop: 6, marginTop: 4 }}>
                          <span style={{ color: '#a9dfbf' }}>= Costo neto ÷ {kgFinLAjust.toFixed(3)} kg ajustados</span>
                          <span style={{ color: '#a9dfbf', fontWeight: 700 }}>${costoNetoL.toFixed(4)}</span>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: '#555', marginBottom: 10, textAlign: 'right' }}>
                      ÷ {haySpReal ? kgFinLAjust.toFixed(3) : kgFinalL.toFixed(3)} kg {haySpReal ? 'ajustados' : 'finales'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(39,174,96,0.15)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                      <span style={{ color: '#a9dfbf', fontWeight: 700, fontSize: 13 }}>C_FINAL / KG</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#2ecc71' }}>${(haySpReal ? cFinalLAjust : cFinalL).toFixed(4)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(243,156,18,0.12)', borderRadius: 8, padding: '10px 12px', marginBottom: 6 }}>
                      <span style={{ color: '#f9ca74', fontWeight: 700, fontSize: 13 }}>PRECIO VENTA ({cfg.margen}%)</span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#f39c12' }}>${(haySpReal ? precVentaLAjust : precVentaL).toFixed(4)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                      <span>Ganancia por kg</span>
                      <span style={{ color: '#f39c12' }}>+${((haySpReal ? precVentaLAjust : precVentaL) - (haySpReal ? cFinalLAjust : cFinalL)).toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
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

function SubprodFasePanel({ fase, icon, titulo, kgRef, cfg, setCfg, mps, disabled }) {
  const spFase = getSPFase(cfg, fase);

  const updTipo = (tipo, patch) => setCfg(prev => {
    const prevFase = getSPFase(prev, fase);
    return {
      ...prev,
      subproductos: {
        ...(prev.subproductos || {}),
        [fase]: { ...prevFase, [tipo]: { ...prevFase[tipo], ...patch } },
      },
    };
  });

  const inStyle = (color) => ({
    padding: '6px 10px', borderRadius: 7, fontSize: 13, outline: 'none',
    border: `1.5px solid ${disabled ? '#ddd' : color}`,
    background: disabled ? '#f8f9fa' : 'white',
  });

  const TIPO_CFG = [
    { tipo: 'perdida',      tIcon: '❌', label: 'Pérdida total', color: '#e74c3c', bg: '#fff5f5', border: '#f5b7b1' },
    { tipo: 'nueva_mp',     tIcon: '🆕', label: 'Nueva MP',      color: '#27ae60', bg: '#f0fff4', border: '#a9dfbf' },
    { tipo: 'mp_existente', tIcon: '📦', label: 'MP existente',  color: '#2980b9', bg: '#eff8ff', border: '#7ec8f7' },
  ];

  return (
    <div style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>{icon} {titulo}</span>
        {kgRef > 0 && <span style={{ fontSize: 11, color: '#bbb' }}>({(kgRef * 1000).toFixed(0)} g disponibles por 1 kg carne)</span>}
      </div>

      {TIPO_CFG.map(({ tipo, tIcon, label, color, bg, border }) => {
        const sp = spFase[tipo];
        const mpSel = tipo === 'mp_existente' ? mps.find(m => m.id === sp.mp_id) : null;
        const precioSP = tipo === 'mp_existente' ? parseFloat(mpSel?.precio_kg || 0) : parseFloat(sp.precio_kg || 0);
        const valorRec = tipo !== 'perdida' && sp.activo && parseFloat(sp.kg || 0) > 0 ? parseFloat(sp.kg) * precioSP : 0;

        return (
          <div key={tipo} style={{
            background: sp.activo ? bg : '#fafafa',
            borderRadius: 8, border: `1.5px solid ${sp.activo ? border : '#e8e8e8'}`,
            padding: '8px 12px', marginBottom: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => !disabled && updTipo(tipo, { activo: !sp.activo })}
                style={{
                  background: sp.activo ? color : '#e0e0e0',
                  color: sp.activo ? 'white' : '#888',
                  border: 'none', borderRadius: 20, padding: '3px 12px',
                  fontSize: 11, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
                }}>
                {sp.activo ? '✅ ON' : '○ OFF'}
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: sp.activo ? color : '#999' }}>{tIcon} {label}</span>
              {valorRec > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color }}>−${valorRec.toFixed(4)} del costo</span>
              )}
            </div>

            {sp.activo && (
              <div style={{ marginTop: 8, paddingLeft: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>Kg por 1 kg carne:</span>
                  <input type="number" min="0" step="0.001" value={sp.kg}
                    onChange={e => !disabled && updTipo(tipo, { kg: parseFloat(e.target.value) || 0 })}
                    disabled={disabled}
                    style={{ ...inStyle(color), width: 90, textAlign: 'right', fontWeight: 'bold' }} />
                  <span style={{ fontSize: 12, color: '#888' }}>kg</span>
                  {parseFloat(sp.kg || 0) > 0 && <span style={{ fontSize: 11, color: '#bbb' }}>= {(parseFloat(sp.kg) * 1000).toFixed(0)} g</span>}
                </div>

                {tipo === 'nueva_mp' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <input placeholder="Nombre (ej: Jugo de Maduración)"
                      value={sp.nombre}
                      onChange={e => !disabled && updTipo(tipo, { nombre: e.target.value })}
                      disabled={disabled}
                      style={{ ...inStyle('#27ae60'), flex: 2, minWidth: 160 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 110 }}>
                      <span style={{ fontSize: 12, color: '#888' }}>$</span>
                      <input type="number" min="0" step="0.01" placeholder="Precio/kg"
                        value={sp.precio_kg}
                        onChange={e => !disabled && updTipo(tipo, { precio_kg: parseFloat(e.target.value) || 0 })}
                        disabled={disabled}
                        style={{ ...inStyle('#27ae60'), flex: 1, fontWeight: 'bold' }} />
                      <span style={{ fontSize: 12, color: '#888' }}>/kg</span>
                    </div>
                  </div>
                )}

                {tipo === 'mp_existente' && (
                  <select value={sp.mp_id}
                    onChange={e => !disabled && updTipo(tipo, { mp_id: e.target.value })}
                    disabled={disabled}
                    style={{ ...inStyle('#2980b9'), width: '100%', marginBottom: 6, boxSizing: 'border-box' }}>
                    <option value="">— seleccionar MP del inventario —</option>
                    {mps.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/kg</option>
                    ))}
                  </select>
                )}

                <div style={{ fontSize: 11, marginTop: 2 }}>
                  {tipo === 'perdida' && parseFloat(sp.kg || 0) > 0 && (
                    <span style={{ color: '#e74c3c' }}>❌ {(parseFloat(sp.kg) * 1000).toFixed(0)} g de merma — sin valor recuperable</span>
                  )}
                  {tipo === 'nueva_mp' && valorRec > 0 && (
                    <span style={{ color: '#27ae60' }}>✅ <b>{sp.nombre}</b>: {(parseFloat(sp.kg)*1000).toFixed(0)} g × ${precioSP.toFixed(4)}/kg = −${valorRec.toFixed(4)}</span>
                  )}
                  {tipo === 'nueva_mp' && sp.activo && (parseFloat(sp.kg || 0) <= 0 || parseFloat(sp.precio_kg || 0) <= 0) && (
                    <span style={{ color: '#f39c12' }}>⚠️ Completa kg y precio</span>
                  )}
                  {tipo === 'mp_existente' && valorRec > 0 && (
                    <span style={{ color: '#27ae60' }}>✅ <b>{mpSel?.nombre_producto || mpSel?.nombre}</b>: {(parseFloat(sp.kg)*1000).toFixed(0)} g × ${precioSP.toFixed(4)}/kg = −${valorRec.toFixed(4)}</span>
                  )}
                  {tipo === 'mp_existente' && sp.activo && (!sp.mp_id || !mpSel) && (
                    <span style={{ color: '#f39c12' }}>⚠️ Selecciona una MP del inventario</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FaseProd({ num, color, icon, titulo, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ background: color, color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>{num}</div>
        <span style={{ fontWeight: 700, fontSize: 12, color }}>{icon} {titulo}</span>
      </div>
      <div style={{ marginLeft: 30, background: '#fafafa', borderRadius: 8, padding: '8px 12px', border: `1px solid ${color}22` }}>
        {children}
      </div>
    </div>
  );
}

function FilaProd({ label, valor, color = '#555', bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 400 }}>{valor}</span>
    </div>
  );
}

function Pruebas({ cfg, mps, cFinal, costoSalKg, costoMostKg, costoRubKg }) {
  const [gramos,  setGramos]  = useState('200');
  const [empSel,  setEmpSel]  = useState('');
  const [etiSel,  setEtiSel]  = useState('');

  const kgPorcion   = parseFloat(gramos || 0) / 1000;
  const costoPorcion = cFinal * kgPorcion;

  const mpsEmp = mps.filter(m => {
    const cat = (m.categoria || '').toUpperCase();
    return cat.includes('EMPAQUE') || cat.includes('FUNDA') || cat.includes('ENVASE') || cat.includes('RETAZOS');
  });
  const mpsEti = mps.filter(m => (m.categoria || '').toUpperCase().includes('ETIQUETA'));

  const mpEmp = mpsEmp.find(m => String(m.id) === empSel);
  const mpEti = mpsEti.find(m => String(m.id) === etiSel);
  const costoEmp = parseFloat(mpEmp?.precio_kg || 0);
  const costoEti = parseFloat(mpEti?.precio_kg || 0);
  const costoTotal  = costoPorcion + costoEmp + costoEti;
  const precioFunda = cfg.margen < 100 ? costoTotal / (1 - cfg.margen / 100) : 0;
  const ganancia    = precioFunda - costoTotal;

  const sel = (val, set, opts, placeholder, color) => (
    <select value={val} onChange={e => set(e.target.value)}
      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${color}`, fontSize: 13, background: 'white', boxSizing: 'border-box' }}>
      <option value="">{placeholder}</option>
      {opts.map(m => <option key={m.id} value={String(m.id)}>{m.nombre_producto || m.nombre} — ${parseFloat(m.precio_kg || 0).toFixed(4)}/u</option>)}
    </select>
  );

  return (
    <div>
      {/* Info C_final de referencia */}
      <div style={{ background: '#eafaf1', borderRadius: 10, padding: '10px 14px', marginBottom: 14, border: '1px solid #a9dfbf', fontSize: 12, color: '#555', display: 'flex', justifyContent: 'space-between' }}>
        <span>Costo Real por kg de producto (de Costos 1kg)</span>
        <span style={{ fontWeight: 700, color: '#27ae60', fontSize: 14 }}>${cFinal.toFixed(4)}/kg</span>
      </div>

      {/* Porción */}
      <div style={{ background: 'white', borderRadius: 12, padding: '18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a2e', marginBottom: 14 }}>¿Cuántos gramos lleva cada funda?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="number" min="1" step="10" value={gramos}
            onChange={e => setGramos(e.target.value)}
            style={{ width: 120, padding: '12px 14px', borderRadius: 10, border: '2px solid #27ae60', fontSize: 22, fontWeight: 'bold', textAlign: 'right' }} />
          <div>
            <div style={{ fontSize: 14, color: '#555', fontWeight: 700 }}>gramos</div>
            <div style={{ fontSize: 11, color: '#888' }}>= {kgPorcion.toFixed(3)} kg de producto</div>
          </div>
        </div>
        {kgPorcion > 0 && (
          <div style={{ marginTop: 10, background: '#f0fff4', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#27ae60' }}>
            Costo del producto en esta funda: ${cFinal.toFixed(4)}/kg × {kgPorcion.toFixed(3)} kg = <b>${costoPorcion.toFixed(4)}</b>
          </div>
        )}
      </div>

      {/* Funda y etiqueta */}
      <div style={{ background: 'white', borderRadius: 12, padding: '18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a2e', marginBottom: 14 }}>Insumos de empaque</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#2980b9', display: 'block', marginBottom: 5 }}>📦 Funda / Empaque</label>
          {sel(empSel, setEmpSel, mpsEmp, '— sin empaque —', '#2980b9')}
          {mpEmp && <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>Costo: ${costoEmp.toFixed(4)} por unidad</div>}
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#8e44ad', display: 'block', marginBottom: 5 }}>🏷️ Etiqueta</label>
          {sel(etiSel, setEtiSel, mpsEti, '— sin etiqueta —', '#8e44ad')}
          {mpEti && <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>Costo: ${costoEti.toFixed(4)} por unidad</div>}
        </div>
      </div>

      {/* Resultado */}
      {kgPorcion > 0 && (
        <div style={{ background: '#1a1a2e', borderRadius: 12, padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#aaa', marginBottom: 14, letterSpacing: 1 }}>COSTO POR FUNDA ({gramos}g)</div>

          {[
            { label: `🥩 Producto (${gramos}g × $${cFinal.toFixed(4)}/kg)`, val: costoPorcion, color: '#27ae60' },
            { label: `📦 Funda/Empaque`,  val: costoEmp, color: '#2980b9' },
            { label: `🏷️ Etiqueta`,       val: costoEti, color: '#8e44ad' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: '#888' }}>{r.label}</span>
              <span style={{ color: r.color, fontWeight: 700 }}>${r.val.toFixed(4)}</span>
            </div>
          ))}

          <div style={{ borderTop: '1px solid #333', marginTop: 10, paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: 'white', fontWeight: 700 }}>COSTO TOTAL POR FUNDA</span>
              <span style={{ fontSize: 24, fontWeight: 'bold', color: '#e74c3c' }}>${costoTotal.toFixed(4)}</span>
            </div>

            <div style={{ background: 'rgba(243,156,18,0.12)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#f9ca74', marginBottom: 4 }}>
                Precio = ${costoTotal.toFixed(4)} ÷ (1 − {cfg.margen}%) = ${costoTotal.toFixed(4)} ÷ {((100 - cfg.margen) / 100).toFixed(2)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#f9ca74', fontWeight: 700 }}>PRECIO DE VENTA/FUNDA ({cfg.margen}%)</span>
                <span style={{ fontSize: 24, fontWeight: 'bold', color: '#f39c12' }}>${precioFunda.toFixed(4)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(39,174,96,0.12)', borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ fontSize: 13, color: '#a9dfbf', fontWeight: 700 }}>GANANCIA POR FUNDA</span>
              <span style={{ fontSize: 18, fontWeight: 'bold', color: '#27ae60' }}>${ganancia.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
