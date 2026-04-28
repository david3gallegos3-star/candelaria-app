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

  // ── Modal Deshuese Lomo Bife ──
  const [modalDeshuese,  setModalDeshuese]  = useState(null); // {stockId, kgMad, cMadKg, costoTotal, loteId}
  const [dshKgEntrada,   setDshKgEntrada]   = useState('');
  const [dshKgResS,      setDshKgResS]      = useState('');
  const [dshKgPuntas,    setDshKgPuntas]    = useState('');
  const [dshKgDesecho,   setDshKgDesecho]   = useState('');
  const [guardDeshuese,  setGuardDeshuese]  = useState(false);
  const [errorDeshuese,  setErrorDeshuese]  = useState('');
  const [mpDeshuese,     setMpDeshuese]     = useState({ resS: null, puntas: null });

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
            produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_salmuera_asignada, costo_carne, costo_salmuera_asignado, costo_final_kg )
          )`)
        .neq('estado', 'completado')
        .order('fecha_entrada', { ascending: true }),
      supabase.from('lotes_maduracion')
        .select(`*, lotes_maduracion_cortes(*),
          produccion_inyeccion ( formula_salmuera, porcentaje_inyeccion, kg_carne_total, kg_salmuera_requerida,
            produccion_inyeccion_cortes ( corte_nombre, materia_prima_id, kg_carne_cruda, kg_salmuera_asignada, costo_carne, costo_salmuera_asignado, costo_final_kg )
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

  useEffect(() => {
    supabase.from('materias_primas')
      .select('id, nombre, precio_kg')
      .in('id', ['C031', 'RET002'])
      .then(({ data }) => {
        setMpDeshuese({
          resS:   (data || []).find(m => m.id === 'C031')   || null,
          puntas: (data || []).find(m => m.id === 'RET002') || null,
        });
      });
  }, []);

  function toggleExpandido(id) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function forzarListo(lote) {
    const d = new Date();
    const fechaLocal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    await supabase.from('lotes_maduracion')
      .update({ fecha_salida: fechaLocal })
      .eq('id', lote.id);
    await cargar();
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
    const picortes = lote.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    const init = {};
    picortes.forEach(p => { init[p.corte_nombre] = ''; });
    setPesajes(init);
    setError('');
    setModalPesaje(lote);
  }

  async function confirmarPesaje() {
    const picortes = modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || [];
    for (const p of picortes) {
      if (!pesajes[p.corte_nombre] || parseFloat(pesajes[p.corte_nombre]) <= 0) {
        setError(`Ingresa el peso actual de "${p.corte_nombre}"`);
        return;
      }
    }
    setGuardando(true);
    setError('');
    try {
      let nyEntryParaDeshuese = null;
      const hoy = new Date().toISOString().split('T')[0];

      for (const p of picortes) {
        const kgMad      = parseFloat(pesajes[p.corte_nombre]);
        const kgInj      = parseFloat(p.kg_carne_cruda || 0) + parseFloat(p.kg_salmuera_asignada || 0);
        const costoTotal = parseFloat(p.costo_carne || 0) + parseFloat(p.costo_salmuera_asignado || 0);
        const costoInyKg = kgInj > 0 ? costoTotal / kgInj : 0;
        const costoMadKg = kgMad > 0 ? costoTotal / kgMad : 0;

        // Buscar o crear MP en Inyectados
        const { data: mpExist } = await supabase
          .from('materias_primas').select('id')
          .eq('nombre', p.corte_nombre).eq('categoria', 'Inyectados').maybeSingle();

        let mpId;
        if (mpExist) {
          mpId = mpExist.id;
        } else {
          const { data: existIds } = await supabase.from('materias_primas')
            .select('id').eq('categoria', 'Inyectados');
          const nums = (existIds || [])
            .map(m => parseInt((m.id || '').replace(/\D/g, '') || '0'))
            .filter(n => !isNaN(n));
          const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
          const newId = 'INY' + String(nextNum).padStart(3, '0');
          const { data: nuevaMp, error: errMp } = await supabase.from('materias_primas').insert({
            id: newId,
            nombre: p.corte_nombre, nombre_producto: p.corte_nombre,
            categoria: 'Inyectados', precio_kg: 0,
            tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
          }).select('id').single();
          if (errMp) throw new Error('Error creando MP: ' + errMp.message);
          mpId = nuevaMp?.id;
        }

        if (mpId) {
          const { data: inv } = await supabase.from('inventario_mp')
            .select('id, stock_kg').eq('materia_prima_id', mpId).maybeSingle();
          if (inv) {
            await supabase.from('inventario_mp')
              .update({ stock_kg: (inv.stock_kg || 0) + kgMad }).eq('id', inv.id);
          } else {
            await supabase.from('inventario_mp').insert({
              materia_prima_id: mpId, stock_kg: kgMad, nombre: p.corte_nombre,
            });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: mpId, nombre_mp: p.corte_nombre,
            tipo: 'entrada', kg: kgMad,
            motivo: `Pesaje maduración — Lote ${modalPesaje.lote_id}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });

          // Insertar en stock_lotes_inyectados y capturar ID para NY
          const { data: stockEntry } = await supabase.from('stock_lotes_inyectados').insert({
            lote_id:            modalPesaje.lote_id,
            lote_maduracion_id: modalPesaje.id,
            corte_nombre:       p.corte_nombre,
            materia_prima_id:   mpId,
            kg_inicial:         kgMad,
            kg_disponible:      kgMad,
            fecha_entrada:      hoy,
            kg_inyectado:       kgInj,
            costo_total:        costoTotal,
            costo_iny_kg:       costoInyKg,
            costo_mad_kg:       costoMadKg,
          }).select('id').single();

          // Si es New York Steak, guardar referencia para deshuese
          if (p.corte_nombre === 'New York Steak' && stockEntry) {
            nyEntryParaDeshuese = {
              stockId:   stockEntry.id,
              kgMad,
              cMadKg:    costoMadKg,
              costoTotal,
              loteId:    modalPesaje.lote_id,
            };
          }
        }
      }

      // Marcar lote completado
      await supabase.from('lotes_maduracion')
        .update({ estado: 'completado' }).eq('id', modalPesaje.id);

      const loteIdGuardado = modalPesaje.lote_id;
      setModalPesaje(null);
      await cargar();

      // Si hay NY, abrir modal de deshuese automáticamente
      if (nyEntryParaDeshuese) {
        setDshKgEntrada('');
        setDshKgResS('');
        setDshKgPuntas('');
        setDshKgDesecho('');
        setErrorDeshuese('');
        setModalDeshuese(nyEntryParaDeshuese);
      } else {
        setExito(`✅ Lote ${loteIdGuardado} pasó a Stock de Congelación`);
        setTimeout(() => setExito(''), 6000);
      }
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  async function confirmarDeshuese() {
    const kgEntrada = parseFloat(dshKgEntrada) || 0;
    const kgResS    = parseFloat(dshKgResS)    || 0;
    const kgPuntas  = parseFloat(dshKgPuntas)  || 0;
    const kgDesecho = parseFloat(dshKgDesecho) || 0;
    const kgLomo    = kgEntrada - kgResS - kgPuntas - kgDesecho;

    if (kgEntrada <= 0) { setErrorDeshuese('Ingresa los kg de New York que van a Lomo Bife'); return; }
    if (kgEntrada > modalDeshuese.kgMad) { setErrorDeshuese(`Máximo ${modalDeshuese.kgMad.toFixed(3)} kg disponibles`); return; }
    if (kgLomo <= 0) { setErrorDeshuese('Los subproductos superan los kg de entrada'); return; }

    setGuardDeshuese(true);
    setErrorDeshuese('');
    try {
      const precioResS   = parseFloat(mpDeshuese.resS?.precio_kg  || 0);
      const precioPuntas = parseFloat(mpDeshuese.puntas?.precio_kg || 0);
      const valorResS    = kgResS   * precioResS;
      const valorPuntas  = kgPuntas * precioPuntas;
      const costoEntrada = kgEntrada * modalDeshuese.cMadKg;
      const cLimpio      = (costoEntrada - valorResS - valorPuntas) / kgLomo;
      const hoy          = new Date().toISOString().split('T')[0];

      // ── 1. Buscar o crear MP Lomo Bife en Inyectados ──
      const { data: mpLomoExist } = await supabase.from('materias_primas')
        .select('id').eq('nombre', 'Lomo Bife').eq('categoria', 'Inyectados').maybeSingle();
      let mpLomoId;
      if (mpLomoExist) {
        mpLomoId = mpLomoExist.id;
      } else {
        const { data: existIds } = await supabase.from('materias_primas').select('id').eq('categoria', 'Inyectados');
        const nums = (existIds || []).map(m => parseInt((m.id || '').replace(/\D/g, '') || '0')).filter(n => !isNaN(n));
        const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        const newId = 'INY' + String(nextNum).padStart(3, '0');
        const { data: nueva } = await supabase.from('materias_primas').insert({
          id: newId, nombre: 'Lomo Bife', nombre_producto: 'Lomo Bife',
          categoria: 'Inyectados', precio_kg: 0,
          tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
        }).select('id').single();
        mpLomoId = nueva?.id;
      }

      // ── 2. Sumar Lomo Bife a inventario_mp ──
      const { data: invLomo } = await supabase.from('inventario_mp')
        .select('id, stock_kg').eq('materia_prima_id', mpLomoId).maybeSingle();
      if (invLomo) {
        await supabase.from('inventario_mp').update({ stock_kg: (invLomo.stock_kg || 0) + kgLomo }).eq('id', invLomo.id);
      } else {
        await supabase.from('inventario_mp').insert({ materia_prima_id: mpLomoId, stock_kg: kgLomo, nombre: 'Lomo Bife' });
      }
      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: mpLomoId, nombre_mp: 'Lomo Bife', tipo: 'entrada', kg: kgLomo,
        motivo: `Deshuese Lote ${modalDeshuese.loteId} — ${kgEntrada.toFixed(3)} kg NY → ${kgLomo.toFixed(3)} kg Lomo`,
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
      });

      // ── 3. Registrar Lomo Bife en stock_lotes_inyectados ──
      await supabase.from('stock_lotes_inyectados').insert({
        lote_id:          modalDeshuese.loteId,
        corte_nombre:     'Lomo Bife',
        materia_prima_id: mpLomoId,
        kg_inicial:       kgLomo,
        kg_disponible:    kgLomo,
        fecha_entrada:    hoy,
        kg_inyectado:     kgEntrada,
        costo_total:      costoEntrada - valorResS - valorPuntas,
        costo_iny_kg:     modalDeshuese.cMadKg,
        costo_mad_kg:     cLimpio,
      });

      // ── 4. Reducir kg_disponible del NY en stock_lotes_inyectados ──
      const { data: nyStock } = await supabase.from('stock_lotes_inyectados')
        .select('kg_disponible').eq('id', modalDeshuese.stockId).single();
      await supabase.from('stock_lotes_inyectados')
        .update({ kg_disponible: Math.max(0, (nyStock?.kg_disponible || 0) - kgEntrada) })
        .eq('id', modalDeshuese.stockId);

      // ── 5. Sumar Res Segunda (C031) al stock ──
      if (kgResS > 0) {
        const { data: invRes } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', 'C031').maybeSingle();
        if (invRes) {
          await supabase.from('inventario_mp').update({ stock_kg: (invRes.stock_kg || 0) + kgResS }).eq('id', invRes.id);
        } else {
          await supabase.from('inventario_mp').insert({ materia_prima_id: 'C031', stock_kg: kgResS, nombre: 'Res Segunda' });
        }
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id: 'C031', nombre_mp: 'Res Segunda', tipo: 'entrada', kg: kgResS,
          motivo: `Deshuese New York — Lote ${modalDeshuese.loteId}`,
          usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
        });
      }

      // ── 6. Sumar Puntas Cortes Especiales (RET002) al stock ──
      if (kgPuntas > 0) {
        const { data: invPun } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', 'RET002').maybeSingle();
        if (invPun) {
          await supabase.from('inventario_mp').update({ stock_kg: (invPun.stock_kg || 0) + kgPuntas }).eq('id', invPun.id);
        } else {
          await supabase.from('inventario_mp').insert({ materia_prima_id: 'RET002', stock_kg: kgPuntas, nombre: 'Puntas de cortes especiales' });
        }
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id: 'RET002', nombre_mp: 'Puntas de cortes especiales', tipo: 'entrada', kg: kgPuntas,
          motivo: `Deshuese New York — Lote ${modalDeshuese.loteId}`,
          usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
        });
      }

      // ── 7. Guardar registro de deshuese ──
      await supabase.from('deshuese_registros').insert({
        fecha:                hoy,
        lote_id:              modalDeshuese.loteId,
        stock_lotes_id_ny:    modalDeshuese.stockId,
        kg_entrada:           kgEntrada,
        kg_res_segunda:       kgResS,
        kg_puntas_especiales: kgPuntas,
        kg_desecho:           kgDesecho,
        kg_lomo_limpio:       kgLomo,
        costo_entrada_kg:     modalDeshuese.cMadKg,
        valor_res_segunda:    valorResS,
        valor_puntas:         valorPuntas,
        c_limpio_kg:          cLimpio,
      });

      const loteId = modalDeshuese.loteId;
      setModalDeshuese(null);
      setExito(`✅ Lote ${loteId} — ${kgLomo.toFixed(3)} kg Lomo Bife registrado · C_limpio $${cLimpio.toFixed(4)}/kg · Res Segunda +${kgResS.toFixed(3)} kg`);
      setTimeout(() => setExito(''), 9000);
    } catch (e) {
      setErrorDeshuese('Error: ' + e.message);
    }
    setGuardDeshuese(false);
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
                    {!listo && (
                      <button onClick={() => {
                        if (window.confirm('¿Marcar este lote como listo ahora? (modo prueba)')) forzarListo(lote);
                      }} style={{
                        background: '#fff3cd', border: '1px solid #f39c12', borderRadius: 8,
                        padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold', color: '#856404'
                      }}>🧪 Prueba</button>
                    )}
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

      {/* ══ Modal Deshuese Lomo Bife ══ */}
      {modalDeshuese && (() => {
        const kgEntrada = parseFloat(dshKgEntrada) || 0;
        const kgResS    = parseFloat(dshKgResS)    || 0;
        const kgPuntas  = parseFloat(dshKgPuntas)  || 0;
        const kgDesecho = parseFloat(dshKgDesecho) || 0;
        const kgLomo    = kgEntrada - kgResS - kgPuntas - kgDesecho;
        const precioResS   = parseFloat(mpDeshuese.resS?.precio_kg  || 0);
        const precioPuntas = parseFloat(mpDeshuese.puntas?.precio_kg || 0);
        const valorResS    = kgResS   * precioResS;
        const valorPuntas  = kgPuntas * precioPuntas;
        const costoEntrada = kgEntrada * modalDeshuese.cMadKg;
        const cLimpio      = kgLomo > 0 ? (costoEntrada - valorResS - valorPuntas) / kgLomo : 0;
        const valido       = kgEntrada > 0 && kgLomo > 0 && kgEntrada <= modalDeshuese.kgMad;

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '92vh', overflowY: 'auto' }}>

              <div style={{ fontWeight: 'bold', fontSize: 17, color: '#1a1a2e', marginBottom: 2 }}>🦴 Deshuese de Lomo Bife</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
                Lote {modalDeshuese.loteId} · <b>{modalDeshuese.kgMad.toFixed(3)} kg</b> New York madurado · C_mad <b>${modalDeshuese.cMadKg.toFixed(4)}/kg</b>
              </div>

              {/* Kg entrada */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 4 }}>Kg de New York que van a Lomo Bife *</label>
                <input
                  type="number" min="0" max={modalDeshuese.kgMad} step="0.001"
                  placeholder={`máx ${modalDeshuese.kgMad.toFixed(3)}`}
                  value={dshKgEntrada}
                  onChange={e => setDshKgEntrada(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '2px solid #1a1a2e', fontSize: 15, fontWeight: 'bold', boxSizing: 'border-box' }}
                />
                {kgEntrada > 0 && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Costo entrada: ${costoEntrada.toFixed(4)}</div>}
              </div>

              {/* Subproductos */}
              <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10 }}>SUBPRODUCTOS DEL DESHUESE</div>

                {[
                  { label: 'Res Segunda', id: 'C031', precio: precioResS,   valor: valorResS,   val: dshKgResS,   set: setDshKgResS,   color: '#e67e22' },
                  { label: 'Puntas Cortes Esp.', id: 'RET002', precio: precioPuntas, valor: valorPuntas, val: dshKgPuntas, set: setDshKgPuntas, color: '#8e44ad' },
                ].map(({ label, id, precio, valor, val, set, color }) => (
                  <div key={id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color }}>{label} <span style={{ color: '#888', fontWeight: 400 }}>({id} · ${precio.toFixed(4)}/kg)</span></label>
                      {parseFloat(val) > 0 && <span style={{ fontSize: 11, color: '#27ae60', fontWeight: 700 }}>crédito −${valor.toFixed(4)}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number" min="0" step="0.001" placeholder="0.000"
                        value={val}
                        onChange={e => set(e.target.value)}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${color}`, fontSize: 13, fontWeight: 'bold', textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 11, color: '#888' }}>kg → sube a stock</span>
                    </div>
                  </div>
                ))}

                <div style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>Desecho / Hueso blanco <span style={{ fontWeight: 400 }}>(sin valor)</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number" min="0" step="0.001" placeholder="0.000"
                      value={dshKgDesecho}
                      onChange={e => setDshKgDesecho(e.target.value)}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #bbb', fontSize: 13, fontWeight: 'bold', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 11, color: '#888' }}>kg</span>
                  </div>
                </div>
              </div>

              {/* Resultado calculado */}
              {kgEntrada > 0 && (
                <div style={{ background: kgLomo > 0 ? '#f0fff4' : '#ffeaea', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: `1px solid ${kgLomo > 0 ? '#a9dfbf' : '#e74c3c'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 8 }}>RESULTADO DESHUESE</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                    <div>Entrada NY: <b>{kgEntrada.toFixed(3)} kg</b></div>
                    <div style={{ color: '#27ae60' }}>Crédito total: <b>−${(valorResS + valorPuntas).toFixed(4)}</b></div>
                    <div>Subproductos: <b>{(kgResS + kgPuntas + kgDesecho).toFixed(3)} kg</b></div>
                    <div style={{ color: kgLomo > 0 ? '#1a5276' : '#e74c3c', fontWeight: 'bold', fontSize: 14, gridColumn: '1/-1', borderTop: '1px solid #ddd', paddingTop: 6, marginTop: 4 }}>
                      Lomo Bife Limpio: {kgLomo > 0 ? `${kgLomo.toFixed(3)} kg` : '⚠ revisar kg'}
                      {kgLomo > 0 && <span style={{ marginLeft: 10, color: '#2980b9' }}>C_limpio: ${cLimpio.toFixed(4)}/kg</span>}
                    </div>
                  </div>
                </div>
              )}

              {errorDeshuese && (
                <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', color: '#e74c3c', fontSize: 13, marginBottom: 14 }}>{errorDeshuese}</div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => {
                  setModalDeshuese(null);
                  setExito(`✅ Lote ${modalDeshuese.loteId} pasó a Stock de Congelación (sin deshuese)`);
                  setTimeout(() => setExito(''), 6000);
                }} style={{ background: '#f0f2f5', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13 }}>
                  Omitir
                </button>
                <button onClick={confirmarDeshuese} disabled={!valido || guardDeshuese} style={{
                  background: !valido || guardDeshuese ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)',
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '10px 24px', cursor: !valido || guardDeshuese ? 'default' : 'pointer',
                  fontSize: 13, fontWeight: 'bold'
                }}>
                  {guardDeshuese ? 'Guardando...' : '🦴 Registrar Deshuese'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

              {(modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || []).map(p => {
                const kgInj  = parseFloat(p.kg_carne_cruda || 0) + parseFloat(p.kg_salmuera_asignada || 0);
                const kgHoy  = parseFloat(pesajes[p.corte_nombre] || 0);
                const diff   = kgHoy > 0 ? kgInj - kgHoy : null;
                return (
                  <div key={p.corte_nombre} style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px',
                    gap: 8, padding: '10px 12px',
                    borderTop: '1px solid #e0e0e0', alignItems: 'center'
                  }}>
                    <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e' }}>
                      🥩 {p.corte_nombre}
                      <div style={{ fontSize: 10, color: '#888', fontWeight: 'normal' }}>
                        {parseFloat(p.kg_carne_cruda||0).toFixed(3)} carne + {parseFloat(p.kg_salmuera_asignada||0).toFixed(3)} sal
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: '#2980b9', fontWeight: 'bold' }}>
                      {kgInj.toFixed(3)}
                    </div>
                    <div>
                      <input
                        type="number" min="0" step="0.001"
                        value={pesajes[p.corte_nombre] ?? ''}
                        onChange={e => setPesajes(prev => ({ ...prev, [p.corte_nombre]: e.target.value }))}
                        placeholder="0.000"
                        style={{ ...inputStyle, textAlign: 'right', borderColor: pesajes[p.corte_nombre] ? '#27ae60' : '#ddd' }}
                      />
                    </div>
                    <div style={{
                      textAlign: 'right', fontSize: 12, fontWeight: 'bold',
                      color: diff === null ? '#ccc' : diff > 0 ? '#e74c3c' : '#27ae60'
                    }}>
                      {diff === null ? '—' : `-${diff.toFixed(3)}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen merma */}
            {(modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || []).some(p => parseFloat(pesajes[p.corte_nombre]) > 0) && (
              <div style={{
                background: '#fff3e0', borderRadius: 10,
                padding: '10px 14px', marginBottom: 16, fontSize: 12
              }}>
                <div style={{ fontWeight: 'bold', color: '#e65100', marginBottom: 6 }}>
                  📉 Merma de maduración:
                </div>
                {(modalPesaje.produccion_inyeccion?.produccion_inyeccion_cortes || []).map(p => {
                  const kgMad = parseFloat(pesajes[p.corte_nombre] || 0);
                  if (!kgMad) return null;
                  const kgInj  = parseFloat(p.kg_carne_cruda || 0) + parseFloat(p.kg_salmuera_asignada || 0);
                  const merma  = kgInj - kgMad;
                  const pctM   = kgInj > 0 ? (merma / kgInj * 100).toFixed(1) : '0.0';
                  return (
                    <div key={p.corte_nombre} style={{ color: '#555', marginBottom: 2 }}>
                      <b>{p.corte_nombre}</b>: {kgInj.toFixed(3)} → {kgMad.toFixed(3)} kg{' '}
                      <span style={{ color: merma > 0 ? '#e65100' : '#27ae60', fontWeight: 'bold' }}>
                        ({merma > 0 ? '-' : '+'}{Math.abs(merma).toFixed(3)} kg · {pctM}%)
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
