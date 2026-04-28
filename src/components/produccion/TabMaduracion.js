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

  // ── Modal Horneado (Pastrame) ──
  const [modalHorneado,  setModalHorneado]  = useState(null); // {loteId, kgMad, costoTotal, cMadKg}
  const [hrnMostazaKg,   setHrnMostazaKg]   = useState('');
  const [hrnRubKg,       setHrnRubKg]       = useState('');
  const [hrnHornoKg,     setHrnHornoKg]     = useState('');
  const [hrnReposoKg,    setHrnReposoKg]    = useState('');
  const [guardHorneado,  setGuardHorneado]  = useState(false);
  const [errorHorneado,  setErrorHorneado]  = useState('');
  const [mpMostaza,      setMpMostaza]      = useState(null);
  const [rubCostoKg,     setRubCostoKg]     = useState(0);

  // ── Modal Deshuese (dinámico desde deshuese_config) ──
  const [modalDeshuese,  setModalDeshuese]  = useState(null);
  const [dshData,        setDshData]        = useState({});
  const [guardDeshuese,  setGuardDeshuese]  = useState(false);
  const [errorDeshuese,  setErrorDeshuese]  = useState('');
  const [mpDeshuese,     setMpDeshuese]     = useState({ resS: null, puntas: null });
  const [deshueseMap,    setDeshueseMap]    = useState({}); // { corte_padre: corte_hijo }

  function setDsh(corte, field, val) {
    setDshData(prev => ({ ...prev, [corte]: { ...prev[corte], [field]: val } }));
  }

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
    // Precios subproductos deshuese
    supabase.from('materias_primas')
      .select('id, nombre, precio_kg')
      .in('id', ['C031', 'RET002'])
      .then(({ data }) => {
        setMpDeshuese({
          resS:   (data || []).find(m => m.id === 'C031')   || null,
          puntas: (data || []).find(m => m.id === 'RET002') || null,
        });
      });
    // Mostaza para Pastrame
    supabase.from('materias_primas').select('id,nombre,precio_kg')
      .ilike('nombre', '%mostaza%').limit(1)
      .then(({ data }) => setMpMostaza(data?.[0] || null));
    // Costo Rub Pastrame por kg
    supabase.from('formulaciones').select('gramos,materia_prima_id')
      .eq('producto_nombre', 'Rub Pastrame')
      .then(async ({ data: rubFilas }) => {
        if (!rubFilas?.length) return;
        const ids = rubFilas.map(f => f.materia_prima_id).filter(Boolean);
        const { data: mpRub } = await supabase.from('materias_primas').select('id,precio_kg').in('id', ids);
        const totalGr  = rubFilas.reduce((s, f) => s + parseFloat(f.gramos || 0), 0);
        const totalCosto = rubFilas.reduce((s, f) => {
          const mp = (mpRub || []).find(m => m.id === f.materia_prima_id);
          return s + (parseFloat(f.gramos || 0) / 1000) * parseFloat(mp?.precio_kg || 0);
        }, 0);
        setRubCostoKg(totalGr > 0 ? totalCosto / (totalGr / 1000) : 0);
      });
    // Mapa deshuese dinámico desde DB
    supabase.from('deshuese_config')
      .select('corte_padre, corte_hijo')
      .eq('activo', true)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.corte_padre] = r.corte_hijo; });
        setDeshueseMap(map);
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
      const deshueseEntries = [];
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

          // Si es un corte con deshuese configurado, guardar para modal
          if (deshueseMap[p.corte_nombre] && stockEntry) {
            deshueseEntries.push({
              corteNombre: p.corte_nombre,
              nombreHijo:  deshueseMap[p.corte_nombre],
              stockId:     stockEntry.id,
              kgMad,
              cMadKg:      costoMadKg,
              costoTotal,
              loteId:      modalPesaje.lote_id,
            });
          }
        }
      }

      // Marcar lote completado
      await supabase.from('lotes_maduracion')
        .update({ estado: 'completado' }).eq('id', modalPesaje.id);

      const loteIdGuardado = modalPesaje.lote_id;
      setModalPesaje(null);
      await cargar();

      // Detectar Pastrame (por nombre de salmuera) → flujo horneado
      const esPastrame = (modalPesaje.produccion_inyeccion?.formula_salmuera || '').toLowerCase().includes('pastrame');
      if (esPastrame) {
        const p0 = picortes[0];
        const kgMad0    = parseFloat(pesajes[p0?.corte_nombre]);
        const costoTot0 = parseFloat(p0?.costo_carne || 0) + parseFloat(p0?.costo_salmuera_asignado || 0);
        setHrnMostazaKg(''); setHrnRubKg(''); setHrnHornoKg(''); setHrnReposoKg('');
        setErrorHorneado('');
        setModalHorneado({ loteId: loteIdGuardado, kgMad: kgMad0, costoTotal: costoTot0, cMadKg: kgMad0 > 0 ? costoTot0 / kgMad0 : 0 });
      // Si hay cortes con deshuese, abrir modal
      } else if (deshueseEntries.length > 0) {
        const initData = {};
        deshueseEntries.forEach(e => {
          initData[e.corteNombre] = { kgEntrada: '', kgResS: '', kgPuntas: '', kgDesecho: '' };
        });
        setDshData(initData);
        setErrorDeshuese('');
        setModalDeshuese(deshueseEntries);
      } else {
        setExito(`✅ Lote ${loteIdGuardado} pasó a Stock de Congelación`);
        setTimeout(() => setExito(''), 6000);
      }
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  async function confirmarHorneado() {
    const kgMostaza = parseFloat(hrnMostazaKg) || 0;
    const kgRub     = parseFloat(hrnRubKg)     || 0;
    const kgHorno   = parseFloat(hrnHornoKg)   || 0;
    const kgReposo  = parseFloat(hrnReposoKg)  || 0;

    if (kgHorno  <= 0) { setErrorHorneado('Ingresa el peso después del horno'); return; }
    if (kgReposo <= 0) { setErrorHorneado('Ingresa el peso antes de rebanar'); return; }
    if (kgReposo > kgHorno) { setErrorHorneado('Peso reposo no puede ser mayor que peso horno'); return; }

    const costoMostaza   = kgMostaza * parseFloat(mpMostaza?.precio_kg || 0);
    const costoRub       = kgRub * rubCostoKg;
    const mermaHornoKg   = modalHorneado.kgMad - kgHorno;
    const mermaHornoPct  = modalHorneado.kgMad > 0 ? mermaHornoKg / modalHorneado.kgMad * 100 : 0;
    const mermaReposoKg  = kgHorno - kgReposo;
    const mermaReposoPct = kgHorno > 0 ? mermaReposoKg / kgHorno * 100 : 0;
    const costoFinalTotal = modalHorneado.costoTotal + costoMostaza + costoRub;
    const cFinalKg        = kgReposo > 0 ? costoFinalTotal / kgReposo : 0;

    setGuardHorneado(true);
    setErrorHorneado('');
    try {
      const hoy     = new Date().toISOString().split('T')[0];
      const mpNombre = 'Pastrame Horneado';

      // 1. Guardar produccion_horneado_lotes
      await supabase.from('produccion_horneado_lotes').insert({
        lote_id:          modalHorneado.loteId,
        fecha:            hoy,
        producto_nombre:  mpNombre,
        kg_mostaza:       kgMostaza,
        costo_mostaza:    costoMostaza,
        kg_rub:           kgRub,
        costo_rub:        costoRub,
        kg_entrada_horno: modalHorneado.kgMad,
        kg_post_horno:    kgHorno,
        merma_horno_kg:   mermaHornoKg,
        merma_horno_pct:  mermaHornoPct,
        kg_post_reposo:   kgReposo,
        merma_reposo_kg:  mermaReposoKg,
        merma_reposo_pct: mermaReposoPct,
        c_final_kg:       cFinalKg,
      });

      // 2. Buscar o crear MP Pastrame Horneado en AHUMADOS-HORNEADOS
      const { data: mpExist } = await supabase.from('materias_primas')
        .select('id').ilike('nombre', '%Pastrame Horneado%').maybeSingle();
      let mpPastrameId;
      if (mpExist) {
        mpPastrameId = mpExist.id;
        await supabase.from('materias_primas').update({ precio_kg: cFinalKg }).eq('id', mpPastrameId);
      } else {
        const { data: nueva } = await supabase.from('materias_primas').insert({
          id: 'AHU001', nombre: mpNombre, nombre_producto: mpNombre,
          categoria: 'AHUMADOS - HORNEADOS', precio_kg: cFinalKg,
          tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
        }).select('id').single();
        mpPastrameId = nueva?.id || 'AHU001';
      }

      // 3. Sumar a inventario_mp
      const { data: inv } = await supabase.from('inventario_mp')
        .select('id,stock_kg').eq('materia_prima_id', mpPastrameId).maybeSingle();
      if (inv) {
        await supabase.from('inventario_mp').update({ stock_kg: (inv.stock_kg || 0) + kgReposo }).eq('id', inv.id);
      } else {
        await supabase.from('inventario_mp').insert({ materia_prima_id: mpPastrameId, stock_kg: kgReposo, nombre: mpNombre });
      }

      // 4. Movimiento ENTRADA Pastrame
      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: mpPastrameId, nombre_mp: mpNombre,
        tipo: 'entrada', kg: kgReposo,
        motivo: `Horneado Pastrame — Lote ${modalHorneado.loteId} · $${cFinalKg.toFixed(4)}/kg`,
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
      });

      // 5. Descontar Rub Pastrame del inventario si se usó
      if (kgRub > 0) {
        const { data: rubFilas } = await supabase.from('formulaciones')
          .select('materia_prima_id,gramos').eq('producto_nombre', 'Rub Pastrame');
        const totalGrRub = (rubFilas || []).reduce((s, f) => s + parseFloat(f.gramos || 0), 0);
        for (const f of (rubFilas || [])) {
          if (!f.materia_prima_id) continue;
          const propKg = totalGrRub > 0 ? (parseFloat(f.gramos || 0) / 1000) * (kgRub / (totalGrRub / 1000)) : 0;
          const { data: invRub } = await supabase.from('inventario_mp')
            .select('id,stock_kg').eq('materia_prima_id', f.materia_prima_id).maybeSingle();
          if (invRub) {
            await supabase.from('inventario_mp')
              .update({ stock_kg: Math.max(0, (invRub.stock_kg || 0) - propKg) }).eq('id', invRub.id);
          }
        }
      }

      setModalHorneado(null);
      setExito(`✅ Pastrame Horneado — ${kgReposo.toFixed(3)} kg · C_final $${cFinalKg.toFixed(4)}/kg → Stock AHUMADOS`);
      setTimeout(() => setExito(''), 10000);
    } catch (e) {
      setErrorHorneado('Error: ' + e.message);
    }
    setGuardHorneado(false);
  }

  async function confirmarDeshuese() {
    const entries = modalDeshuese || [];
    const precioResS   = parseFloat(mpDeshuese.resS?.precio_kg  || 0);
    const precioPuntas = parseFloat(mpDeshuese.puntas?.precio_kg || 0);
    const hoy          = new Date().toISOString().split('T')[0];

    // Validar todos los entries
    for (const entry of entries) {
      const d        = dshData[entry.corteNombre] || {};
      const kgEnt    = parseFloat(d.kgEntrada || 0);
      const kgResS   = parseFloat(d.kgResS    || 0);
      const kgPuntas = parseFloat(d.kgPuntas  || 0);
      const kgDesecho= parseFloat(d.kgDesecho || 0);
      const kgHijo   = kgEnt - kgResS - kgPuntas - kgDesecho;
      if (kgEnt <= 0) { setErrorDeshuese(`Ingresa kg para ${entry.nombreHijo} (${entry.corteNombre})`); return; }
      if (kgEnt > entry.kgMad) { setErrorDeshuese(`${entry.corteNombre}: máximo ${entry.kgMad.toFixed(3)} kg`); return; }
      if (kgHijo <= 0) { setErrorDeshuese(`${entry.corteNombre}: los subproductos superan los kg de entrada`); return; }
    }

    setGuardDeshuese(true);
    setErrorDeshuese('');

    try {
      const resumenExito = [];

      for (const entry of entries) {
        const d         = dshData[entry.corteNombre] || {};
        const kgEntrada = parseFloat(d.kgEntrada || 0);
        const kgResS    = parseFloat(d.kgResS    || 0);
        const kgPuntas  = parseFloat(d.kgPuntas  || 0);
        const kgDesecho = parseFloat(d.kgDesecho || 0);
        const kgHijo    = kgEntrada - kgResS - kgPuntas - kgDesecho;
        const valorResS    = kgResS   * precioResS;
        const valorPuntas  = kgPuntas * precioPuntas;
        const costoEntrada = kgEntrada * entry.cMadKg;
        const cLimpio      = (costoEntrada - valorResS - valorPuntas) / kgHijo;

        // ── 1. Buscar o crear MP hijo en Inyectados ──
        const { data: mpHijoExist } = await supabase.from('materias_primas')
          .select('id').eq('nombre', entry.nombreHijo).eq('categoria', 'Inyectados').maybeSingle();
        let mpHijoId;
        if (mpHijoExist) {
          mpHijoId = mpHijoExist.id;
        } else {
          const { data: existIds } = await supabase.from('materias_primas').select('id').eq('categoria', 'Inyectados');
          const nums = (existIds || []).map(m => parseInt((m.id || '').replace(/\D/g, '') || '0')).filter(n => !isNaN(n));
          const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
          const { data: nueva } = await supabase.from('materias_primas').insert({
            id: 'INY' + String(nextNum).padStart(3, '0'),
            nombre: entry.nombreHijo, nombre_producto: entry.nombreHijo,
            categoria: 'Inyectados', precio_kg: 0,
            tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
          }).select('id').single();
          mpHijoId = nueva?.id;
        }

        // ── 2. Sumar hijo a inventario_mp ──
        const { data: invHijo } = await supabase.from('inventario_mp')
          .select('id, stock_kg').eq('materia_prima_id', mpHijoId).maybeSingle();
        if (invHijo) {
          await supabase.from('inventario_mp').update({ stock_kg: (invHijo.stock_kg || 0) + kgHijo }).eq('id', invHijo.id);
        } else {
          await supabase.from('inventario_mp').insert({ materia_prima_id: mpHijoId, stock_kg: kgHijo, nombre: entry.nombreHijo });
        }
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id: mpHijoId, nombre_mp: entry.nombreHijo, tipo: 'entrada', kg: kgHijo,
          motivo: `Deshuese Lote ${entry.loteId} — ${kgEntrada.toFixed(3)} kg ${entry.corteNombre} → ${kgHijo.toFixed(3)} kg ${entry.nombreHijo}`,
          usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
        });

        // ── 3. Registrar hijo en stock_lotes_inyectados ──
        await supabase.from('stock_lotes_inyectados').insert({
          lote_id:          entry.loteId,
          corte_nombre:     entry.nombreHijo,
          materia_prima_id: mpHijoId,
          kg_inicial:       kgHijo,
          kg_disponible:    kgHijo,
          fecha_entrada:    hoy,
          kg_inyectado:     kgEntrada,
          costo_total:      costoEntrada - valorResS - valorPuntas,
          costo_iny_kg:     entry.cMadKg,
          costo_mad_kg:     cLimpio,
        });

        // ── 4. Reducir kg_disponible del padre en stock_lotes_inyectados ──
        const { data: padreStock } = await supabase.from('stock_lotes_inyectados')
          .select('kg_disponible').eq('id', entry.stockId).single();
        await supabase.from('stock_lotes_inyectados')
          .update({ kg_disponible: Math.max(0, (padreStock?.kg_disponible || 0) - kgEntrada) })
          .eq('id', entry.stockId);

        // ── 5. Res Segunda (C031) ──
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
            motivo: `Deshuese ${entry.corteNombre} — Lote ${entry.loteId}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });
        }

        // ── 6. Puntas Cortes Especiales (RET002) ──
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
            motivo: `Deshuese ${entry.corteNombre} — Lote ${entry.loteId}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });
        }

        // ── 7. Guardar deshuese_registros ──
        await supabase.from('deshuese_registros').insert({
          fecha:                hoy,
          lote_id:              entry.loteId,
          stock_lotes_id_ny:    entry.stockId,
          kg_entrada:           kgEntrada,
          kg_res_segunda:       kgResS,
          kg_puntas_especiales: kgPuntas,
          kg_desecho:           kgDesecho,
          kg_lomo_limpio:       kgHijo,
          costo_entrada_kg:     entry.cMadKg,
          valor_res_segunda:    valorResS,
          valor_puntas:         valorPuntas,
          c_limpio_kg:          cLimpio,
        });

        resumenExito.push(`${entry.nombreHijo}: ${kgHijo.toFixed(3)} kg · $${cLimpio.toFixed(4)}/kg`);
      }

      const loteId = entries[0]?.loteId || '';
      setModalDeshuese(null);
      setExito(`✅ Lote ${loteId} — Deshuese registrado: ${resumenExito.join(' | ')}`);
      setTimeout(() => setExito(''), 10000);
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

      {/* ══ Modal Horneado — Pastrame ══ */}
      {modalHorneado && (() => {
        const kgMostaza  = parseFloat(hrnMostazaKg) || 0;
        const kgRub      = parseFloat(hrnRubKg)     || 0;
        const kgHorno    = parseFloat(hrnHornoKg)   || 0;
        const kgReposo   = parseFloat(hrnReposoKg)  || 0;
        const costoMos   = kgMostaza * parseFloat(mpMostaza?.precio_kg || 0);
        const costoRub   = kgRub * rubCostoKg;
        const costoFinal = modalHorneado.costoTotal + costoMos + costoRub;
        const cFinal     = kgReposo > 0 ? costoFinal / kgReposo : 0;
        const mHorno     = modalHorneado.kgMad > 0 ? ((modalHorneado.kgMad - kgHorno) / modalHorneado.kgMad * 100) : 0;
        const mReposo    = kgHorno > 0 ? ((kgHorno - kgReposo) / kgHorno * 100) : 0;
        const listo      = kgHorno > 0 && kgReposo > 0 && kgReposo <= kgHorno;

        const fila = (label, value, color = '#333', bold = false) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#666' }}>{label}</span>
            <span style={{ color, fontWeight: bold ? 'bold' : 'normal' }}>{value}</span>
          </div>
        );

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '94vh', overflowY: 'auto' }}>

              <div style={{ fontWeight: 'bold', fontSize: 17, color: '#1a1a2e', marginBottom: 2 }}>🔥 Pastrame Horneado</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
                Lote {modalHorneado.loteId} · <b>{modalHorneado.kgMad.toFixed(3)} kg</b> post-maduración · C_mad <b>${modalHorneado.cMadKg.toFixed(4)}/kg</b>
              </div>

              {/* Fase 3: Mostaza */}
              <div style={{ background: '#fffbf0', borderRadius: 10, padding: '14px', marginBottom: 12, border: '1.5px solid #f39c12' }}>
                <div style={{ fontWeight: 700, color: '#e67e22', fontSize: 12, marginBottom: 8 }}>FASE 3 — MOSTAZA (agente de adherencia)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>Kg de mostaza aplicada</label>
                    <input type="number" min="0" step="0.001" placeholder="ej: 0.150" value={hrnMostazaKg}
                      onChange={e => setHrnMostazaKg(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #f39c12', fontSize: 13, fontWeight: 'bold', boxSizing: 'border-box', marginTop: 4 }} />
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 100 }}>
                    {mpMostaza && <div style={{ fontSize: 10, color: '#888' }}>{mpMostaza.nombre} · ${parseFloat(mpMostaza.precio_kg||0).toFixed(4)}/kg</div>}
                    {kgMostaza > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#e67e22' }}>+${costoMos.toFixed(4)}</div>}
                  </div>
                </div>
              </div>

              {/* Fase 4: Rub */}
              <div style={{ background: '#f5f0ff', borderRadius: 10, padding: '14px', marginBottom: 12, border: '1.5px solid #8e44ad' }}>
                <div style={{ fontWeight: 700, color: '#8e44ad', fontSize: 12, marginBottom: 8 }}>FASE 4 — RUB PASTRAME (costra de especias)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>Kg de Rub Pastrame aplicado</label>
                    <input type="number" min="0" step="0.001" placeholder="ej: 0.105" value={hrnRubKg}
                      onChange={e => setHrnRubKg(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #8e44ad', fontSize: 13, fontWeight: 'bold', boxSizing: 'border-box', marginTop: 4 }} />
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 100 }}>
                    {rubCostoKg > 0 && <div style={{ fontSize: 10, color: '#888' }}>Rub · ${rubCostoKg.toFixed(4)}/kg</div>}
                    {kgRub > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#8e44ad' }}>+${costoRub.toFixed(4)}</div>}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>Fórmula: ~105g por pieza · descuenta ingredientes del inventario</div>
              </div>

              {/* Fase 5: Horneado */}
              <div style={{ background: '#fff3f0', borderRadius: 10, padding: '14px', marginBottom: 12, border: '1.5px solid #e74c3c' }}>
                <div style={{ fontWeight: 700, color: '#e74c3c', fontSize: 12, marginBottom: 8 }}>FASE 5 — HORNEADO (110°C → 70°C → 92°C internos)</div>
                <label style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>Kg después del horno *</label>
                <input type="number" min="0" step="0.001" placeholder={`máx ${modalHorneado.kgMad.toFixed(3)}`} value={hrnHornoKg}
                  onChange={e => setHrnHornoKg(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid #e74c3c', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box', marginTop: 4 }} />
                {kgHorno > 0 && (
                  <div style={{ fontSize: 11, color: '#e74c3c', marginTop: 4 }}>
                    Merma horno: <b>{(modalHorneado.kgMad - kgHorno).toFixed(3)} kg ({mHorno.toFixed(1)}%)</b>
                  </div>
                )}
              </div>

              {/* Fase 6: Reposo */}
              <div style={{ background: '#f0fff4', borderRadius: 10, padding: '14px', marginBottom: 14, border: '1.5px solid #27ae60' }}>
                <div style={{ fontWeight: 700, color: '#27ae60', fontSize: 12, marginBottom: 8 }}>FASE 6 — REPOSO / ANTES DE REBANAR</div>
                <label style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>Kg antes de rebanar *</label>
                <input type="number" min="0" step="0.001" placeholder="peso final" value={hrnReposoKg}
                  onChange={e => setHrnReposoKg(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid #27ae60', fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box', marginTop: 4 }} />
                {kgReposo > 0 && kgHorno > 0 && (
                  <div style={{ fontSize: 11, color: '#27ae60', marginTop: 4 }}>
                    Merma reposo: <b>{(kgHorno - kgReposo).toFixed(3)} kg ({mReposo.toFixed(1)}%)</b>
                  </div>
                )}
              </div>

              {/* Resultado */}
              {kgHorno > 0 && kgReposo > 0 && (
                <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, marginBottom: 8 }}>RESUMEN DE COSTOS</div>
                  {fila('Carne + Salmuera (C_mad)', `$${modalHorneado.costoTotal.toFixed(4)}`, '#7ec8f7')}
                  {kgMostaza > 0 && fila('Mostaza', `+$${costoMos.toFixed(4)}`, '#f39c12')}
                  {kgRub     > 0 && fila('Rub Pastrame', `+$${costoRub.toFixed(4)}`, '#c39bd3')}
                  {fila('Merma horno', `${mHorno.toFixed(1)}%`, '#e74c3c')}
                  {fila('Merma reposo', `${mReposo.toFixed(1)}%`, '#e74c3c')}
                  <div style={{ borderTop: '1px solid #333', marginTop: 8, paddingTop: 8 }}>
                    {fila(`Peso final (${kgReposo.toFixed(3)} kg)`, `C_final = $${cFinal.toFixed(4)}/kg`, '#a9dfbf', true)}
                  </div>
                </div>
              )}

              {errorHorneado && (
                <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', color: '#e74c3c', fontSize: 13, marginBottom: 14 }}>{errorHorneado}</div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => { setModalHorneado(null); setExito(`✅ Lote ${modalHorneado.loteId} pasó a maduración (horneado pendiente)`); setTimeout(() => setExito(''), 6000); }}
                  style={{ background: '#f0f2f5', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13 }}>
                  Registrar después
                </button>
                <button onClick={confirmarHorneado} disabled={!listo || guardHorneado} style={{
                  background: !listo || guardHorneado ? '#aaa' : 'linear-gradient(135deg,#e74c3c,#8e44ad)',
                  color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px',
                  cursor: !listo || guardHorneado ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold'
                }}>
                  {guardHorneado ? 'Guardando...' : '🔥 Confirmar Horneado'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ Modal Deshuese (NY → Lomo Bife / Rib Eye → Ojo de Bife) ══ */}
      {modalDeshuese && (() => {
        const entries      = modalDeshuese;
        const precioResS   = parseFloat(mpDeshuese.resS?.precio_kg  || 0);
        const precioPuntas = parseFloat(mpDeshuese.puntas?.precio_kg || 0);
        const loteId       = entries[0]?.loteId || '';

        // Calcular resultado por entry para mostrar en UI
        const calcEntry = (entry) => {
          const d         = dshData[entry.corteNombre] || {};
          const kgEntrada = parseFloat(d.kgEntrada || 0);
          const kgResS    = parseFloat(d.kgResS    || 0);
          const kgPuntas  = parseFloat(d.kgPuntas  || 0);
          const kgDesecho = parseFloat(d.kgDesecho || 0);
          const kgHijo    = kgEntrada - kgResS - kgPuntas - kgDesecho;
          const valorResS    = kgResS   * precioResS;
          const valorPuntas  = kgPuntas * precioPuntas;
          const costoEntrada = kgEntrada * entry.cMadKg;
          const cLimpio      = kgHijo > 0 ? (costoEntrada - valorResS - valorPuntas) / kgHijo : 0;
          const kgResto      = entry.kgMad - kgEntrada;
          return { kgEntrada, kgResS, kgPuntas, kgDesecho, kgHijo, valorResS, valorPuntas, costoEntrada, cLimpio, kgResto };
        };

        const todoValido = entries.every(entry => {
          const c = calcEntry(entry);
          return c.kgEntrada > 0 && c.kgHijo > 0 && c.kgEntrada <= entry.kgMad;
        });

        const colorEntry = { 'New York Steak': '#1a5276', 'Rib eye steack': '#6c3483' };

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '94vh', overflowY: 'auto' }}>

              <div style={{ fontWeight: 'bold', fontSize: 17, color: '#1a1a2e', marginBottom: 2 }}>🦴 Deshuese — Lote {loteId}</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 18 }}>
                {entries.map(e => `${e.corteNombre} → ${e.nombreHijo} (${e.kgMad.toFixed(3)} kg disponibles)`).join(' · ')}
              </div>

              {/* Una sección por cada corte padre */}
              {entries.map(entry => {
                const c    = calcEntry(entry);
                const col  = colorEntry[entry.corteNombre] || '#333';
                const d    = dshData[entry.corteNombre] || {};
                return (
                  <div key={entry.corteNombre} style={{ border: `2px solid ${col}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, color: col, fontSize: 14, marginBottom: 10 }}>
                      {entry.corteNombre} → <span style={{ color: '#27ae60' }}>{entry.nombreHijo}</span>
                      <span style={{ fontWeight: 400, fontSize: 11, color: '#888', marginLeft: 8 }}>C_mad ${entry.cMadKg.toFixed(4)}/kg</span>
                    </div>

                    {/* Kg que van al hijo */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 4 }}>
                        Kg de {entry.corteNombre} que van a {entry.nombreHijo} *
                      </label>
                      <input
                        type="number" min="0" max={entry.kgMad} step="0.001"
                        placeholder={`máx ${entry.kgMad.toFixed(3)}`}
                        value={d.kgEntrada || ''}
                        onChange={e => setDsh(entry.corteNombre, 'kgEntrada', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `2px solid ${col}`, fontSize: 14, fontWeight: 'bold', boxSizing: 'border-box' }}
                      />
                      {c.kgEntrada > 0 && c.kgResto >= 0 && (
                        <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
                          Quedan como {entry.corteNombre} directo a congelación: <b>{c.kgResto.toFixed(3)} kg</b>
                        </div>
                      )}
                    </div>

                    {/* Subproductos */}
                    <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#777', marginBottom: 8 }}>SUBPRODUCTOS</div>
                      {[
                        { label: 'Res Segunda',        id: 'C031',   precio: precioResS,   valor: c.valorResS,   key: 'kgResS',   color: '#e67e22' },
                        { label: 'Puntas Cortes Esp.', id: 'RET002', precio: precioPuntas, valor: c.valorPuntas, key: 'kgPuntas', color: '#8e44ad' },
                        { label: 'Desecho / Hueso blanco', id: null, precio: 0, valor: 0, key: 'kgDesecho', color: '#95a5a6' },
                      ].map(({ label, id, precio, valor, key, color }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ width: 130, fontSize: 11, color, fontWeight: 600 }}>
                            {label}{id && <span style={{ color: '#aaa', fontWeight: 400 }}> · ${precio.toFixed(2)}/kg</span>}
                          </span>
                          <input
                            type="number" min="0" step="0.001" placeholder="0.000"
                            value={d[key] || ''}
                            onChange={e => setDsh(entry.corteNombre, key, e.target.value)}
                            style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: `1.5px solid ${color}`, fontSize: 12, fontWeight: 'bold', textAlign: 'right' }}
                          />
                          <span style={{ fontSize: 10, color: '#888' }}>kg</span>
                          {id && parseFloat(d[key]) > 0 && (
                            <span style={{ fontSize: 10, color: '#27ae60', fontWeight: 700 }}>−${valor.toFixed(4)} crédito · sube stock</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Resultado */}
                    {c.kgEntrada > 0 && (
                      <div style={{ background: c.kgHijo > 0 ? '#f0fff4' : '#ffeaea', borderRadius: 8, padding: '8px 12px', border: `1px solid ${c.kgHijo > 0 ? '#a9dfbf' : '#e74c3c'}`, fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: c.kgHijo > 0 ? '#1a5276' : '#e74c3c' }}>
                          {entry.nombreHijo}: {c.kgHijo > 0 ? `${c.kgHijo.toFixed(3)} kg` : '⚠ revisar'}
                        </span>
                        {c.kgHijo > 0 && (
                          <span style={{ color: '#2980b9', marginLeft: 10 }}>C_limpio: ${c.cLimpio.toFixed(4)}/kg</span>
                        )}
                        {(c.valorResS + c.valorPuntas) > 0 && (
                          <span style={{ color: '#27ae60', marginLeft: 10 }}>crédito: −${(c.valorResS + c.valorPuntas).toFixed(4)}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {errorDeshuese && (
                <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', color: '#e74c3c', fontSize: 13, marginBottom: 14 }}>{errorDeshuese}</div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => {
                  setModalDeshuese(null);
                  setExito(`✅ Lote ${loteId} pasó a Stock de Congelación (sin deshuese)`);
                  setTimeout(() => setExito(''), 6000);
                }} style={{ background: '#f0f2f5', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13 }}>
                  Omitir
                </button>
                <button onClick={confirmarDeshuese} disabled={!todoValido || guardDeshuese} style={{
                  background: !todoValido || guardDeshuese ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)',
                  color: 'white', border: 'none', borderRadius: 8,
                  padding: '10px 24px', cursor: !todoValido || guardDeshuese ? 'default' : 'pointer',
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
