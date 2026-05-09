// ============================================
// TabInyeccion.js — Selección de producto + wizard de producción
// ============================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabase';
import WizardProduccionDinamica from './WizardProduccionDinamica';

export default function TabInyeccion({ currentUser }) {
  const [productos,    setProductos]    = useState([]); // {producto_nombre, config}
  const [productoSelec, setProductoSelec] = useState(null);
  const [mpCarne,      setMpCarne]      = useState(null);
  const [kgCarne,      setKgCarne]      = useState('');
  const [precioCarne,  setPrecioCarne]  = useState('');
  const [notas,        setNotas]        = useState('');
  const [mps,          setMps]          = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [guardando,    setGuardando]    = useState(false);
  const [error,        setError]        = useState('');
  const [exito,        setExito]        = useState('');
  const [wizard,       setWizard]       = useState(null);
  const inicializado = useRef(false);

  const cargarInicial = useCallback(async () => {
    if (!inicializado.current) setCargando(true);
    const [{ data: cfgs }, { data: mpsData }, { data: deshData }] = await Promise.all([
      supabase.from('vista_horneado_config').select('producto_nombre,config'),
      supabase.from('materias_primas')
        .select('id,nombre,nombre_producto,precio_kg,categoria')
        .eq('eliminado', false).eq('estado', 'ACTIVO'),
      supabase.from('deshuese_config').select('corte_padre,corte_hijo'),
    ]);

    // Excluir tipo 'hijo' (no se producen directamente)
    // Deduplicar case-insensitive: preferir el que tiene más bloques activos
    const sinHijos = (cfgs || []).filter(c => c.config?.tipo !== 'hijo');
    const porNombre = {};
    for (const c of sinHijos) {
      const key = c.producto_nombre.toLowerCase();
      if (!porNombre[key]) { porNombre[key] = c; continue; }
      const existente = (porNombre[key].config?.bloques || []).filter(b => b.activo).length;
      const nuevo     = (c.config?.bloques || []).filter(b => b.activo).length;
      if (nuevo > existente) porNombre[key] = c;
    }
    // Añadir nombre del hijo desde deshuese_config
    // Usa matching parcial: "New York" encuentra "New York Steak" y viceversa
    const deshMap = {};
    for (const d of (deshData || [])) {
      if (d.corte_padre) deshMap[d.corte_padre.toLowerCase()] = d.corte_hijo;
    }
    const prods = Object.values(porNombre).map(c => {
      const nombre = c.producto_nombre.toLowerCase();
      let hijoNombre = deshMap[nombre] || null;
      if (!hijoNombre) {
        for (const [padre, hijo] of Object.entries(deshMap)) {
          if (padre.includes(nombre) || nombre.includes(padre)) {
            hijoNombre = hijo;
            break;
          }
        }
      }
      return { ...c, _hijoNombre: hijoNombre };
    });

    setProductos(prods);
    setMps(mpsData || []);
    inicializado.current = true;
    setCargando(false);
  }, []);

  useEffect(() => { cargarInicial(); }, [cargarInicial]);

  function seleccionarProducto(prod) {
    setProductoSelec(prod);
    const mpId = prod.config?.mp_carne_id;
    if (mpId) {
      const mp = (mps || []).find(m => String(m.id) === String(mpId));
      setMpCarne(mp || null);
      setPrecioCarne(mp?.precio_kg != null ? String(mp.precio_kg) : '');
    } else {
      setMpCarne(null);
      setPrecioCarne('');
    }
    setKgCarne('');
    setError('');
  }

  function detectarEsBano(cfg) {
    const cat = (cfg._categoria || '').toUpperCase().replace(/[ÓÒÔÖ]/g, 'O');
    return cat.includes('INMERSION') || cat.includes('MARINAD');
  }

  async function iniciarProduccion() {
    const kg = parseFloat(kgCarne);
    if (!productoSelec || kg <= 0) {
      setError('Ingresa los kg de carne');
      return;
    }
    const precio = parseFloat(precioCarne) || 0;
    const cfg = productoSelec.config || {};
    const bloques = (cfg.bloques || []).filter(b => b.activo);
    setGuardando(true);
    setError('');
    try {
      const saved = await guardarPreSave(kg, precio);
      if (!saved) return;
      if (bloques.length > 0) {
        setWizard({
          bloques:          cfg.bloques || [],
          bloquesHijo:      cfg.bloques_hijo || [],
          cfg,
          kgInicial:        kg,
          precioCarne:      precio,
          esBano:           detectarEsBano(cfg),
          prodNombre:       productoSelec.producto_nombre,
          savedLoteId:      saved.loteId,
          savedFechaSalida: saved.fechaSalida,
        });
      } else {
        // Sin bloques → flujo directo, ya está guardado
        limpiarFormulario();
        setExito(`✅ Producción registrada — lote ${saved.loteId} en maduración hasta ${saved.fechaSalida}`);
        setTimeout(() => setExito(''), 10000);
      }
    } catch (e) {
      setError('Error al guardar: ' + e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarPreSave(kg, precio) {
    const fecha = new Date().toISOString().split('T')[0];
    const cfg = productoSelec.config;

    // Bloque inyección para obtener fórmula y porcentaje
    const injBlock = (cfg.bloques || []).find(b => b.tipo === 'inyeccion');
    const formulaSal = injBlock?.formula_salmuera || cfg.formula_salmuera || '';
    const pctInj = parseFloat(injBlock?.pct_inj || cfg.pct_inj || 0);
    const kgSal = kg * (pctInj / 100);

    // Guardar produccion_inyeccion
    const { data: prod, error: e1 } = await supabase.from('produccion_inyeccion').insert({
      fecha,
      formula_salmuera:     formulaSal,
      porcentaje_inyeccion: pctInj,
      kg_carne_total:       kg,
      kg_salmuera_requerida: kgSal,
      costo_carne_total:    kg * precio,
      costo_salmuera_total: 0,
      costo_total:          kg * precio,
      estado:               'abierto',
      usuario_nombre:       currentUser?.email || '',
      user_id:              currentUser?.id || null,
      notas:                notas || null,
    }).select().single();
    if (e1) throw e1;

    // Guardar corte
    if (mpCarne) {
      const { error: e2 } = await supabase.from('produccion_inyeccion_cortes').insert({
        produccion_id:        prod.id,
        corte_nombre:         mpCarne.nombre_producto || mpCarne.nombre,
        materia_prima_id:     mpCarne.id,
        kg_carne_cruda:       kg,
        precio_kg_carne:      precio,
        costo_carne:          kg * precio,
        kg_salmuera_asignada: kgSal,
        costo_salmuera_asignado: 0,
        kg_retazos:           0,
        kg_carne_limpia:      kg,
        costo_final_kg:       precio,
      });
      if (e2) throw e2;

      // Descontar carne del inventario
      const { data: inv } = await supabase.from('inventario_mp')
        .select('id,stock_kg').eq('materia_prima_id', mpCarne.id).maybeSingle();
      if (inv) {
        await supabase.from('inventario_mp')
          .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) - kg) })
          .eq('id', inv.id);
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id: mpCarne.id,
          nombre_mp:        mpCarne.nombre_producto || mpCarne.nombre,
          tipo:             'salida',
          kg,
          motivo:           `Producción — ${productoSelec.producto_nombre}`,
          usuario_nombre:   currentUser?.email || '',
          user_id:          currentUser?.id || null,
          fecha,
        });
      }
    }

    // Crear lote en maduración
    const bloquesMad = (cfg.bloques || []).find(b => b.tipo === 'maduracion');
    const horas = parseFloat(bloquesMad?.horas_mad || cfg.horas_mad || 72);
    const min   = parseFloat(bloquesMad?.minutos_mad || cfg.minutos_mad || 0);
    const fechaSalidaObj = new Date(fecha + 'T12:00:00');
    fechaSalidaObj.setTime(fechaSalidaObj.getTime() + (horas * 60 + min) * 60 * 1000);
    const fechaSalida = fechaSalidaObj.toISOString().split('T')[0];

    const [yy, mm, dd] = fecha.split('-');
    const fechaStr = `${dd}/${mm}/${yy.slice(2)}`;
    const { count: lotesHoy } = await supabase
      .from('lotes_maduracion')
      .select('id', { count: 'exact', head: true })
      .eq('fecha_entrada', fecha);
    const loteId = (lotesHoy || 0) === 0 ? fechaStr : `${fechaStr}/${lotesHoy}`;

    const { error: e3 } = await supabase.from('lotes_maduracion').insert({
      lote_id:       loteId,
      produccion_id: prod.id,
      fecha_entrada: fecha,
      fecha_salida:  fechaSalida,
      estado:        'madurando',
    });
    if (e3) throw e3;

    return { loteId, fechaSalida };
  }

  function limpiarFormulario() {
    setProductoSelec(null);
    setMpCarne(null);
    setKgCarne('');
    setPrecioCarne('');
    setNotas('');
    setError('');
  }

  if (cargando) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 32 }}>💉</div>
      <div style={{ color: '#555', fontSize: 13 }}>Cargando...</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {exito && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '10px 16px', fontWeight: 'bold', fontSize: 13, textAlign: 'center', borderRadius: 8, marginBottom: 12 }}>
          {exito}
        </div>
      )}
      {error && (
        <div style={{ background: '#fdecea', color: '#721c24', padding: '10px 16px', fontSize: 13, textAlign: 'center', borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'center', gap: 10 }}>
          ⚠️ {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#721c24', fontWeight: 'bold' }}>✕</button>
        </div>
      )}

      {/* Selector de producto */}
      <div style={{ background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 14 }}>
        <h4 style={{ margin: '0 0 12px', color: '#1a3a5c', fontSize: 14, borderBottom: '2px solid #1a3a5c', paddingBottom: 6 }}>
          🥩 ¿Qué vamos a producir?
        </h4>
        {productos.length === 0 ? (
          <div style={{ color: '#e74c3c', fontSize: 13 }}>⚠️ No hay productos en vista_horneado_config.</div>
        ) : (
          <select
            value={productoSelec ? JSON.stringify({ nombre: productoSelec.producto_nombre }) : ''}
            onChange={e => {
              if (!e.target.value) { setProductoSelec(null); setMpCarne(null); return; }
              const { nombre } = JSON.parse(e.target.value);
              const found = productos.find(p => p.producto_nombre === nombre);
              if (found) seleccionarProducto(found);
            }}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #1a3a5c', fontSize: 14, color: productoSelec ? '#1a3a5c' : '#999', background: 'white', outline: 'none', cursor: 'pointer' }}>
            <option value="">— Selecciona un producto —</option>
            {productos.map((p, i) => {
              const cfg = p.config || {};
              const tieneBif = (cfg.bloques || []).some(b => b.tipo === 'bifurcacion' && b.activo);
              const esPadre  = cfg.tipo === 'padre';
              const hijoNombre = p._hijoNombre;
              const sufijo = (tieneBif || esPadre) && hijoNombre
                ? ` / ${hijoNombre}`
                : '';
              return (
                <option key={i} value={JSON.stringify({ nombre: p.producto_nombre })}>
                  {p.producto_nombre}{sufijo}
                </option>
              );
            })}
          </select>
        )}

        {productoSelec && (
          <div style={{ marginTop: 10, background: '#1a3a5c', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Producto seleccionado</div>
              <div style={{ fontSize: 14, fontWeight: 'bold', color: 'white' }}>{productoSelec.producto_nombre}</div>
              {(() => {
                const cfg = productoSelec.config || {};
                const pasos = (cfg.bloques || []).filter(b => b.activo).length;
                const hijoNombre = productoSelec._hijoNombre;
                return (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                    {cfg._categoria || ''}{pasos > 0 ? ` · ${pasos} pasos` : ''}
                    {hijoNombre ? ` · Hijo: ${hijoNombre}` : ''}
                  </div>
                );
              })()}
            </div>
            <button onClick={limpiarFormulario} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12, padding: '4px 10px' }}>
              Cambiar
            </button>
          </div>
        )}
      </div>

      {/* Materia prima + kg + precio */}
      {productoSelec && (
        <div style={{ background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 12px', color: '#6c3483', fontSize: 14, borderBottom: '2px solid #6c3483', paddingBottom: 6 }}>
            📦 Materia prima y cantidad
          </h4>

          {mpCarne ? (
            <div style={{ background: '#f8f0ff', border: '1.5px solid #d7bde2', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6c3483' }}>
                🥩 {mpCarne.nombre_producto || mpCarne.nombre}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                Precio referencia: ${parseFloat(mpCarne.precio_kg || 0).toFixed(2)}/kg
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff8e8', border: '1px solid #f9ca74', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#856404' }}>
              ⚠️ Este producto no tiene materia prima vinculada en Costos 1kg. Configúrala primero.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Kg de carne *</label>
              <input
                type="number" min="0" step="0.1"
                value={kgCarne}
                onChange={e => setKgCarne(e.target.value)}
                placeholder="0.000"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #6c3483', fontSize: 16, fontWeight: 'bold', textAlign: 'right', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Precio $/kg</label>
              <input
                type="number" min="0" step="0.01"
                value={precioCarne}
                onChange={e => setPrecioCarne(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 16, fontWeight: 'bold', textAlign: 'right', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>

          {/* Vista previa de pasos */}
          {(() => {
            const pasos = (productoSelec.config?.bloques || []).filter(b => b.activo);
            if (!pasos.length) return null;
            const ICONS = { merma: '✂️', inyeccion: '💉', maduracion: '🧊', rub: '🧂', adicional: '🍋', bifurcacion: '🔀', horneado: '🔥' };
            return (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fa', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Pasos configurados:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {pasos.map((b, i) => (
                    <span key={i} style={{ background: '#1a3a5c', color: 'white', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 12 }}>
                      {ICONS[b.tipo] || '●'} {b.tipo === 'merma' ? (b.nombre_merma || `Merma T${b.merma_tipo}`) : b.tipo}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Notas */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>📝 Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, resize: 'none', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <button
            disabled={guardando || !productoSelec || !(parseFloat(kgCarne) > 0)}
            onClick={iniciarProduccion}
            style={{
              marginTop: 14, width: '100%', padding: '16px',
              background: guardando || !(parseFloat(kgCarne) > 0)
                ? '#95a5a6'
                : 'linear-gradient(135deg,#1a3a5c,#2980b9)',
              color: 'white', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 'bold',
              cursor: guardando || !(parseFloat(kgCarne) > 0) ? 'default' : 'pointer',
            }}>
            {guardando ? '⏳ Guardando...' : '🚀 Iniciar Producción'}
          </button>
        </div>
      )}

      {/* Wizard overlay */}
      {wizard && (
        <WizardProduccionDinamica
          modo="momento1"
          bloques={wizard.bloques}
          bloquesHijo={wizard.bloquesHijo}
          cfg={wizard.cfg}
          lote={null}
          kgInicial={wizard.kgInicial}
          precioCarne={wizard.precioCarne}
          currentUser={currentUser}
          mpsFormula={mps}
          esBano={wizard.esBano}
          savedLoteId={wizard.savedLoteId}
          onComplete={() => {
            const loteId = wizard.savedLoteId;
            const fechaSalida = wizard.savedFechaSalida;
            setWizard(null);
            limpiarFormulario();
            setExito(`✅ Producción registrada — lote ${loteId} en maduración hasta ${fechaSalida}`);
            setTimeout(() => setExito(''), 10000);
          }}
          onCancel={() => setWizard(null)}
        />
      )}
    </div>
  );
}
