// ============================================
// TabMaduracion.js
// Stock en maduración + pesaje final
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

function diasParaSalida(fechaSalida) {
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const sal  = new Date(fechaSalida + 'T00:00:00');
  return Math.round((sal - hoy) / 86400000);
}

export default function TabMaduracion({ mobile, currentUser }) {
  const [lotes,          setLotes]          = useState([]);
  const [historial,      setHistorial]      = useState([]);
  const [cargando,       setCargando]       = useState(true);
  const [vistaHist,      setVistaHist]      = useState(false);
  const [expandidos,     setExpandidos]     = useState({});    // {loteId: bool}
  const [modalPesaje,    setModalPesaje]    = useState(null);
  const [pesajes,        setPesajes]        = useState({});
  const [guardando,      setGuardando]      = useState(false);
  const [error,          setError]          = useState('');
  const [exito,          setExito]          = useState('');

  // ── Modal editar cortes ──
  const [modalEditar,    setModalEditar]    = useState(null);  // lote
  const [editKgs,        setEditKgs]        = useState({});    // {idx: kg}
  const [guardandoEdit,  setGuardandoEdit]  = useState(false);
  const [errorEdit,      setErrorEdit]      = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: activos }, { data: completados }] = await Promise.all([
      supabase.from('lotes_maduracion')
        .select(`*, lotes_maduracion_cortes(*),
          produccion_inyeccion ( formula_salmuera, porcentaje_inyeccion, kg_carne_total, kg_salmuera_requerida,
            produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_salmuera_asignada )
          )`)
        .neq('estado', 'completado')
        .order('fecha_entrada', { ascending: true }),
      supabase.from('lotes_maduracion')
        .select(`*, lotes_maduracion_cortes(*),
          produccion_inyeccion ( formula_salmuera, porcentaje_inyeccion, kg_carne_total, kg_salmuera_requerida,
            produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_salmuera_asignada )
          )`)
        .eq('estado', 'completado')
        .order('fecha_entrada', { ascending: false })
        .limit(30),
    ]);
    setLotes(activos   || []);
    setHistorial(completados || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function toggleExpandido(id) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function abrirEditar(lote) {
    const picortes = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    const init = {};
    picortes.forEach((p, i) => { init[i] = String(p.kg_carne_cruda || ''); });
    setEditKgs(init);
    setErrorEdit('');
    setModalEditar(lote);
  }

  async function guardarEdicion() {
    const picortes = modalEditar.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    for (let i = 0; i < picortes.length; i++) {
      if (!editKgs[i] || parseFloat(editKgs[i]) <= 0) {
        setErrorEdit(`Ingresa kg válidos para "${picortes[i].corte_nombre}"`);
        return;
      }
    }
    setGuardandoEdit(true);
    setErrorEdit('');
    try {
      const totalCarne = picortes.reduce((s, _, i) => s + parseFloat(editKgs[i] || 0), 0);
      const kgSalTotal = parseFloat(modalEditar.produccion_inyeccion?.kg_salmuera_requerida || 0);
      // Recalcular salmuera proporcional y actualizar cada corte
      for (let i = 0; i < picortes.length; i++) {
        const p        = picortes[i];
        const kgCarne  = parseFloat(editKgs[i]);
        const kgSal    = totalCarne > 0 ? kgSalTotal * (kgCarne / totalCarne) : 0;
        await supabase.from('produccion_inyeccion_cortes').update({
          kg_carne_cruda:       kgCarne,
          kg_salmuera_asignada: kgSal,
          kg_carne_limpia:      kgCarne,
        }).eq('id', p.id);
      }
      // Actualizar total en produccion_inyeccion
      await supabase.from('produccion_inyeccion').update({
        kg_carne_total: totalCarne,
      }).eq('id', modalEditar.produccion_id);

      setModalEditar(null);
      setExito('✅ Cortes actualizados correctamente');
      setTimeout(() => setExito(''), 5000);
      await cargar();
    } catch (e) {
      setErrorEdit('Error: ' + e.message);
    }
    setGuardandoEdit(false);
  }

  function abrirPesaje(lote) {
    const init = {};
    (lote.lotes_maduracion_cortes || []).forEach(c => { init[c.id] = ''; });
    setPesajes(init);
    setError('');
    setModalPesaje(lote);
  }

  async function confirmarPesaje() {
    const cortes = modalPesaje.lotes_maduracion_cortes || [];
    for (const c of cortes) {
      if (!pesajes[c.id] || parseFloat(pesajes[c.id]) <= 0) {
        setError(`Ingresa el peso de "${c.corte_nombre}"`);
        return;
      }
    }
    setGuardando(true);
    setError('');
    try {
      // 1. Actualizar cada corte con kg_madurado y costo ajustado
      for (const c of cortes) {
        const kgMad  = parseFloat(pesajes[c.id]);
        const costoAdj = c.kg_inyectado > 0
          ? (c.costo_kg_original * c.kg_inyectado) / kgMad
          : c.costo_kg_original;

        await supabase.from('lotes_maduracion_cortes').update({
          kg_madurado:       kgMad,
          costo_kg_ajustado: costoAdj,
        }).eq('id', c.id);

        // 2. Buscar o crear materia prima con categoría Congelación
        let mpId = c.materia_prima_id;

        const { data: mpExist } = await supabase
          .from('materias_primas')
          .select('id')
          .eq('nombre', c.corte_nombre)
          .eq('categoria', 'Congelación')
          .maybeSingle();

        if (mpExist) {
          mpId = mpExist.id;
          // Actualizar precio con costo ajustado
          await supabase.from('materias_primas')
            .update({ precio_kg: costoAdj })
            .eq('id', mpId);
        } else {
          // Crear nueva MP en categoría Congelación
          const { data: nuevaMp } = await supabase.from('materias_primas').insert({
            nombre:           c.corte_nombre,
            nombre_producto:  c.corte_nombre,
            categoria:        'Congelación',
            precio_kg:        costoAdj,
            eliminado:        false,
          }).select('id').single();
          mpId = nuevaMp?.id;
        }

        // 3. Actualizar stock en inventario_mp
        if (mpId) {
          const { data: invExist } = await supabase
            .from('inventario_mp')
            .select('id, stock_kg')
            .eq('materia_prima_id', mpId)
            .maybeSingle();

          if (invExist) {
            await supabase.from('inventario_mp')
              .update({ stock_kg: (invExist.stock_kg || 0) + kgMad })
              .eq('id', invExist.id);
          } else {
            await supabase.from('inventario_mp').insert({
              materia_prima_id: mpId,
              stock_kg:         kgMad,
              nombre:           c.corte_nombre,
            });
          }
        }
      }

      // 4. Marcar lote como completado
      await supabase.from('lotes_maduracion')
        .update({ estado: 'completado' })
        .eq('id', modalPesaje.id);

      setModalPesaje(null);
      setExito(`✅ Lote ${modalPesaje.lote_id} pasó a Stock de Congelación`);
      setTimeout(() => setExito(''), 6000);
      await cargar();
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  const inputStyle = {
    padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #ddd', fontSize: '13px',
    width: '100%', boxSizing: 'border-box', outline: 'none'
  };

  const lotesActivos  = lotes;
  const lotesListos   = lotes.filter(l => diasParaSalida(l.fecha_salida) <= 0);

  return (
    <div>
      {exito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '12px 16px', borderRadius: 10,
          marginBottom: 14, fontWeight: 'bold', fontSize: '13px'
        }}>{exito}</div>
      )}

      {/* ── Alerta lotes listos ── */}
      {lotesListos.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg,#e74c3c,#c0392b)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: 28 }}>🚨</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>
              {lotesListos.length} lote{lotesListos.length > 1 ? 's' : ''} listo{lotesListos.length > 1 ? 's' : ''} para pesaje de maduración
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
              {lotesListos.map(l => l.lote_id).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs vista ── */}
      <div style={{
        display: 'flex', gap: 4, background: 'white',
        borderRadius: 10, padding: 4, marginBottom: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', width: 'fit-content'
      }}>
        {[
          { k: false, label: `🧊 En maduración (${lotesActivos.length})` },
          { k: true,  label: '📋 Historial' },
        ].map(v => (
          <button key={String(v.k)} onClick={() => setVistaHist(v.k)} style={{
            padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 'bold',
            background: vistaHist === v.k ? '#1a1a2e' : 'transparent',
            color:      vistaHist === v.k ? 'white'   : '#666',
          }}>{v.label}</button>
        ))}
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando lotes...</div>
      ) : !vistaHist ? (
        /* ── Lista activos ── */
        lotesActivos.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40,
            background: 'white', borderRadius: 12, color: '#aaa'
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧊</div>
            <div style={{ fontWeight: 'bold' }}>No hay lotes en maduración</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Los lotes aparecen al registrar una inyección</div>
          </div>
        ) : (
          lotesActivos.map(lote => {
            const dias      = diasParaSalida(lote.fecha_salida);
            const listo     = dias <= 0;
            const picortes  = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
            const totalCarne = picortes.reduce((s, p) => s + parseFloat(p.kg_carne_cruda || 0), 0);
            const totalSal   = picortes.reduce((s, p) => s + parseFloat(p.kg_salmuera_asignada || 0), 0);
            const totalInj   = totalCarne + totalSal;
            const expandido  = !!expandidos[lote.id];

            return (
              <div key={lote.id} style={{
                background: 'white', borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                padding: mobile ? 14 : 18, marginBottom: 12,
                borderLeft: `5px solid ${listo ? '#e74c3c' : '#2980b9'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    {/* Header lote */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e' }}>
                        🧊 Lote {lote.lote_id}
                      </span>
                      {listo ? (
                        <span style={{ background: '#e74c3c', color: 'white', borderRadius: 12, padding: '3px 12px', fontSize: 11, fontWeight: 'bold' }}>
                          🚨 LISTO PARA PESAJE
                        </span>
                      ) : (
                        <span style={{ background: '#eaf4fd', color: '#2980b9', borderRadius: 12, padding: '3px 12px', fontSize: 11, fontWeight: 'bold' }}>
                          ⏳ {dias} día{dias !== 1 ? 's' : ''} restante{dias !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Fechas + totales en una línea */}
                    <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>📅 <b>{lote.fecha_entrada}</b> → <b>{lote.fecha_salida}</b></span>
                      <span>🥩 <b>{totalCarne.toFixed(3)} kg</b> carne</span>
                      <span>🧂 <b>{totalSal.toFixed(3)} kg</b> salmuera</span>
                      <span style={{ color: '#1a3a5c', fontWeight: 'bold' }}>⚖️ {totalInj.toFixed(3)} kg total</span>
                      {lote.produccion_inyeccion?.formula_salmuera && (
                        <span style={{ color: '#888' }}>{lote.produccion_inyeccion.formula_salmuera}</span>
                      )}
                      {/* Toggle tabla */}
                      <button onClick={() => toggleExpandido(lote.id)} style={{
                        background: 'none', border: '1px solid #ddd', borderRadius: 6,
                        padding: '2px 10px', fontSize: 11, cursor: 'pointer', color: '#555'
                      }}>
                        {expandido ? '▲ Ocultar detalle' : '▼ Ver detalle'}
                      </button>
                    </div>

                    {/* Tabla colapsable */}
                    {expandido && picortes.length > 0 && (
                      <div style={{ background: '#f0f4f8', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px',
                          gap: 6, padding: '6px 12px',
                          background: '#1a1a2e', fontSize: 10, fontWeight: 'bold', color: '#aaa'
                        }}>
                          <div>CORTE</div>
                          <div style={{ textAlign: 'right' }}>CARNE (kg)</div>
                          <div style={{ textAlign: 'right' }}>SALMUERA (kg)</div>
                          <div style={{ textAlign: 'right' }}>TOTAL INYECT.</div>
                        </div>
                        {picortes.map((p, idx) => {
                          const kgCarne = parseFloat(p.kg_carne_cruda       || 0);
                          const kgSal   = parseFloat(p.kg_salmuera_asignada || 0);
                          const kgInj   = kgCarne + kgSal;
                          const pctSal  = kgCarne > 0 ? ((kgSal / kgCarne) * 100).toFixed(1) : '0.0';
                          return (
                            <div key={idx} style={{
                              display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px',
                              gap: 6, padding: '9px 12px',
                              borderTop: '1px solid #e0e7ef', alignItems: 'center',
                              background: idx % 2 === 0 ? 'white' : '#f8fafc'
                            }}>
                              <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e' }}>🥩 {p.corte_nombre}</div>
                              <div style={{ textAlign: 'right', fontSize: 13, color: '#333' }}>{kgCarne.toFixed(3)}</div>
                              <div style={{ textAlign: 'right', fontSize: 13, color: '#2980b9' }}>
                                {kgSal.toFixed(3)}
                                <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>({pctSal}%)</span>
                              </div>
                              <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 'bold', color: '#1a3a5c' }}>
                                {kgInj.toFixed(3)} kg
                              </div>
                            </div>
                          );
                        })}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 90px 110px 110px',
                          gap: 6, padding: '8px 12px',
                          background: '#1a3a5c', borderTop: '2px solid #2980b9',
                          fontSize: 12, fontWeight: 'bold', color: 'white'
                        }}>
                          <div>TOTAL</div>
                          <div style={{ textAlign: 'right' }}>{totalCarne.toFixed(3)}</div>
                          <div style={{ textAlign: 'right', color: '#7ec8f7' }}>{totalSal.toFixed(3)}</div>
                          <div style={{ textAlign: 'right', color: '#a9dfbf' }}>{totalInj.toFixed(3)} kg</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botones derecha */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => abrirEditar(lote)} style={{
                      background: '#f0f2f5', border: '1px solid #ddd', borderRadius: 8,
                      padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', color: '#333'
                    }}>✏️ Editar kg</button>
                    {listo && (
                      <button onClick={() => abrirPesaje(lote)} style={{
                        background: 'linear-gradient(135deg,#e74c3c,#c0392b)',
                        color: 'white', border: 'none', borderRadius: 8,
                        padding: '8px 14px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap'
                      }}>⚖️ Registrar pesaje</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )
      ) : (
        /* ── Historial completados ── */
        historial.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            No hay lotes completados aún.
          </div>
        ) : (
          historial.map(lote => {
            const cortes  = lote.lotes_maduracion_cortes || [];
            const kgIn    = cortes.reduce((s, c) => s + (c.kg_inyectado  || 0), 0);
            const kgMad   = cortes.reduce((s, c) => s + (c.kg_madurado   || 0), 0);
            const perdida = kgIn - kgMad;

            return (
              <div key={lote.id} style={{
                background: 'white', borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: mobile ? 12 : 16, marginBottom: 10,
                borderLeft: '5px solid #27ae60'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 14, color: '#1a1a2e', marginBottom: 4 }}>
                      ✅ Lote {lote.lote_id}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>📅 {lote.fecha_entrada} → {lote.fecha_salida}</span>
                      <span>⬇️ Inyectado: <b>{kgIn.toFixed(3)} kg</b></span>
                      {kgMad > 0 && <span>⬆️ Madurado: <b>{kgMad.toFixed(3)} kg</b></span>}
                      {perdida > 0 && (
                        <span style={{ color: '#e74c3c' }}>
                          📉 Pérdida: <b>{perdida.toFixed(3)} kg</b>
                          ({kgIn > 0 ? ((perdida / kgIn) * 100).toFixed(1) : 0}%)
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {cortes.map(c => (
                        <div key={c.id} style={{
                          background: '#e8f5e9', borderRadius: 8,
                          padding: '5px 10px', fontSize: 11
                        }}>
                          <b>{c.corte_nombre}</b>
                          <span style={{ color: '#555', marginLeft: 4 }}>
                            {(c.kg_inyectado||0).toFixed(3)} → {(c.kg_madurado||0).toFixed(3)} kg
                          </span>
                          {c.costo_kg_ajustado > 0 && (
                            <span style={{ color: '#1a5276', marginLeft: 4 }}>
                              · ${c.costo_kg_ajustado.toFixed(4)}/kg
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )
      )}

      {/* ══ Modal Editar kg cortes ══ */}
      {modalEditar && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 460,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e', marginBottom: 4 }}>
              ✏️ Editar kg — Lote {modalEditar.lote_id}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
              La salmuera se recalcula automáticamente en proporción a los kg de cada corte.
            </div>

            {(() => {
              const picortes  = modalEditar.produccion_inyeccion?.produccion_inyeccion_cortes || [];
              const totalNuevo = picortes.reduce((s, _, i) => s + parseFloat(editKgs[i] || 0), 0);
              const kgSalTotal = parseFloat(modalEditar.produccion_inyeccion?.kg_salmuera_requerida || 0);
              return (
                <>
                  {picortes.map((p, i) => {
                    const kgCarne = parseFloat(editKgs[i] || 0);
                    const kgSal   = totalNuevo > 0 ? kgSalTotal * (kgCarne / totalNuevo) : 0;
                    return (
                      <div key={i} style={{
                        background: '#f8fafc', borderRadius: 10,
                        padding: '12px 14px', marginBottom: 10
                      }}>
                        <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e', marginBottom: 8 }}>
                          🥩 {p.corte_nombre}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>Kg carne *</div>
                            <input
                              type="number" min="0" step="0.001"
                              value={editKgs[i]}
                              onChange={e => setEditKgs(prev => ({ ...prev, [i]: e.target.value }))}
                              style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '8px 10px', borderRadius: 8,
                                border: '1.5px solid #2980b9', fontSize: 14,
                                textAlign: 'right', outline: 'none'
                              }}
                            />
                          </div>
                          <div style={{ textAlign: 'center', color: '#888', fontSize: 12 }}>→</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: '#2980b9', marginBottom: 3 }}>Salmuera (calculada)</div>
                            <div style={{
                              padding: '8px 10px', borderRadius: 8,
                              background: '#eaf4fd', fontSize: 14,
                              textAlign: 'right', color: '#1a3a5c', fontWeight: 'bold'
                            }}>
                              {kgSal.toFixed(3)} kg
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: '#27ae60', marginBottom: 3 }}>Total inyect.</div>
                            <div style={{
                              padding: '8px 10px', borderRadius: 8,
                              background: '#e8f5e9', fontSize: 14,
                              textAlign: 'right', color: '#1a5276', fontWeight: 'bold'
                            }}>
                              {(kgCarne + kgSal).toFixed(3)} kg
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{
                    background: '#1a1a2e', borderRadius: 10, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', color: 'white',
                    fontSize: 13, fontWeight: 'bold', marginBottom: 16
                  }}>
                    <span>TOTAL</span>
                    <span>{(totalNuevo + kgSalTotal).toFixed(3)} kg</span>
                  </div>
                </>
              );
            })()}

            {errorEdit && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: 8, padding: '10px 14px', color: '#e74c3c',
                fontSize: 13, marginBottom: 14
              }}>{errorEdit}</div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalEditar(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer', fontSize: 13
              }}>Cancelar</button>
              <button onClick={guardarEdicion} disabled={guardandoEdit} style={{
                background: guardandoEdit ? '#aaa' : 'linear-gradient(135deg,#1a1a2e,#2c3e50)',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '10px 24px', cursor: guardandoEdit ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 'bold'
              }}>
                {guardandoEdit ? 'Guardando...' : '💾 Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal Pesaje ══ */}
      {modalPesaje && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: 17, color: '#1a1a2e', marginBottom: 4 }}>
              ⚖️ Pesaje de maduración
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
              Lote {modalPesaje.lote_id} · ingresó {modalPesaje.fecha_entrada}
            </div>

            {/* Tabla de cortes */}
            <div style={{
              background: '#f0f4f8', borderRadius: 10,
              overflow: 'hidden', marginBottom: 16
            }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px',
                gap: 8, padding: '8px 12px',
                background: '#1a1a2e', fontSize: 10, fontWeight: 'bold', color: '#aaa'
              }}>
                <div>CORTE</div>
                <div style={{ textAlign: 'right' }}>KG INYECT.</div>
                <div style={{ textAlign: 'right' }}>KG HOY *</div>
                <div style={{ textAlign: 'right' }}>DIFERENCIA</div>
              </div>

              {(modalPesaje.lotes_maduracion_cortes || []).map(c => {
                const kgHoy  = parseFloat(pesajes[c.id] || 0);
                const diff   = kgHoy > 0 ? kgHoy - c.kg_inyectado : null;
                return (
                  <div key={c.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px',
                    gap: 8, padding: '10px 12px',
                    borderTop: '1px solid #e0e0e0', alignItems: 'center'
                  }}>
                    <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e' }}>
                      {c.corte_nombre}
                      <div style={{ fontSize: 10, color: '#888', fontWeight: 'normal' }}>
                        Costo orig: ${(c.costo_kg_original||0).toFixed(4)}/kg
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: '#555' }}>
                      {(c.kg_inyectado||0).toFixed(3)}
                    </div>
                    <div>
                      <input
                        type="number" min="0" step="0.001"
                        value={pesajes[c.id]}
                        onChange={e => setPesajes(prev => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="0.000"
                        style={{ ...inputStyle, textAlign: 'right', borderColor: pesajes[c.id] ? '#27ae60' : '#ddd' }}
                      />
                    </div>
                    <div style={{
                      textAlign: 'right', fontSize: 12, fontWeight: 'bold',
                      color: diff === null ? '#ccc' : diff < 0 ? '#e74c3c' : '#27ae60'
                    }}>
                      {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(3)}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen costo ajustado */}
            {(modalPesaje.lotes_maduracion_cortes || []).some(c => parseFloat(pesajes[c.id]) > 0) && (
              <div style={{
                background: '#fff3e0', borderRadius: 10,
                padding: '10px 14px', marginBottom: 16, fontSize: 12
              }}>
                <div style={{ fontWeight: 'bold', color: '#e65100', marginBottom: 6 }}>
                  💡 Costo ajustado por pérdida:
                </div>
                {(modalPesaje.lotes_maduracion_cortes || []).map(c => {
                  const kgMad = parseFloat(pesajes[c.id] || 0);
                  if (!kgMad) return null;
                  const costoAdj = c.kg_inyectado > 0
                    ? (c.costo_kg_original * c.kg_inyectado) / kgMad
                    : c.costo_kg_original;
                  return (
                    <div key={c.id} style={{ color: '#555', marginBottom: 2 }}>
                      <b>{c.corte_nombre}</b>: ${(c.costo_kg_original||0).toFixed(4)} →{' '}
                      <span style={{ color: '#e65100', fontWeight: 'bold' }}>
                        ${costoAdj.toFixed(4)}/kg
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: 8, padding: '10px 14px', color: '#e74c3c',
                fontSize: 13, marginBottom: 14
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalPesaje(null)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer', fontSize: 13
              }}>Cancelar</button>
              <button onClick={confirmarPesaje} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a1a2e,#2c3e50)',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 'bold'
              }}>
                {guardando ? 'Guardando...' : '✅ Confirmar pesaje → Stock Congelación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
