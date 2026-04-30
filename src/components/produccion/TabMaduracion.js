// ============================================
// TabMaduracion.js
// Stock en maduración + pesaje final
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { crearNotificacion } from '../../utils/helpers';

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

  // ── Modal Horneado (Pastrame) — wizard 3 pasos ──
  const [modalHorneado,  setModalHorneado]  = useState(null); // {loteId,kgMad,kgCarne,costoTotal,cMadKg,cfg}
  const [horneadoPaso,   setHorneadoPaso]   = useState(1);    // 1=mostaza 2=rub 3=horno
  const [hrnHornoKg,     setHrnHornoKg]     = useState('');
  const [hrnReposoKg,    setHrnReposoKg]    = useState('');
  const [guardHorneado,  setGuardHorneado]  = useState(false);
  const [errorHorneado,  setErrorHorneado]  = useState('');
  const [mpMostaza,      setMpMostaza]      = useState(null);
  const [rubCostoKg,     setRubCostoKg]     = useState(0);
  const [rubFilas,       setRubFilas]       = useState([]); // ingredientes del Rub escalados
  const [paso1Listo,     setPaso1Listo]     = useState(false); // mostaza ya descontada
  const [paso2Listo,     setPaso2Listo]     = useState(false); // rub ya descontado
  const [imprevisto,     setImprevisto]     = useState({ activo: false, kgDaniado: '', motivo: '' });
  const [horneadoCfgs,   setHorneadoCfgs]   = useState([]); // configs de vista_horneado_config

  // ── Modal Sub-productos post-pesaje ──
  const [modalSpPost,    setModalSpPost]    = useState(null); // {subproductos, loteId, totalKgMad, pendingFlow, horneadoData, deshueseData}
  const [spPostKgs,      setSpPostKgs]      = useState({});   // {fase: kg}
  const [guardSpPost,    setGuardSpPost]    = useState(false);
  const [spPostMps,      setSpPostMps]      = useState({});   // mp_id → {nombre, precio_kg}
  const [spRealesData,   setSpRealesData]   = useState({});   // para pasar a confirmarHorneado

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
    // Configs de productos horneados (para wizard)
    supabase.from('vista_horneado_config').select('producto_nombre,config')
      .then(({ data }) => setHorneadoCfgs(data || []));
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

      // Detectar config del producto horneado
      const formulaSal   = (modalPesaje.produccion_inyeccion?.formula_salmuera || '').toLowerCase();
      const esPastrame   = formulaSal.includes('pastrame');
      const cfgHorn      = (horneadoCfgs.find(hc =>
        (hc.config?.formula_salmuera || '').toLowerCase().includes('pastrame') ||
        (hc.producto_nombre || '').toLowerCase().includes('pastrame')
      )?.config) || {};

      // Sub-productos activos en la config del producto (excluye inyeccion — ya se maneja en TabInyeccion)
      const spActivosConf = Object.entries(cfgHorn.subproductos || {})
        .filter(([fase, sp]) => sp?.activo && fase !== 'inyeccion')
        .map(([fase, sp]) => ({ fase, sp }));

      // Preparar datos para wizard horneado si aplica
      let horneadoWizardData = null;
      if (esPastrame) {
        const p0        = picortes[0];
        const kgMad0    = parseFloat(pesajes[p0?.corte_nombre]);
        const kgCarne0  = parseFloat(p0?.kg_carne_cruda || 0);
        const costoTot0 = parseFloat(p0?.costo_carne || 0) + parseFloat(p0?.costo_salmuera_asignado || 0);

        if (cfgHorn.mp_mostaza_id) {
          const { data: mpMos } = await supabase.from('materias_primas')
            .select('id,nombre,precio_kg').eq('id', cfgHorn.mp_mostaza_id).maybeSingle();
          setMpMostaza(mpMos || null);
        }
        let rubF = [];
        if (cfgHorn.formula_rub) {
          const { data: rubRows } = await supabase.from('formulaciones')
            .select('ingrediente_nombre,gramos,materia_prima_id')
            .eq('producto_nombre', cfgHorn.formula_rub);
          const ids = (rubRows || []).map(r => r.materia_prima_id).filter(Boolean);
          const { data: rubMps } = ids.length
            ? await supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg').in('id', ids)
            : { data: [] };
          rubF = (rubRows || []).map(r => {
            const mp = (rubMps || []).find(m => m.id === r.materia_prima_id);
            return { ...r, mp, precioKg: parseFloat(mp?.precio_kg || 0) };
          });
        }
        setRubFilas(rubF);
        setHrnHornoKg(''); setErrorHorneado('');
        setPaso1Listo(false); setPaso2Listo(false);
        setImprevisto({ activo: false, kgDaniado: '', motivo: '' });
        setHorneadoPaso(1);
        horneadoWizardData = {
          loteId: loteIdGuardado, kgMad: kgMad0, kgCarne: kgCarne0,
          costoTotal: costoTot0, cMadKg: kgMad0 > 0 ? costoTot0 / kgMad0 : 0,
          cfg: cfgHorn,
        };
      }

      // Si hay sub-productos configurados → mostrar modal SP antes del siguiente paso
      if (spActivosConf.length > 0) {
        const mpIds = spActivosConf.filter(x => x.sp.tipo === 'mp_existente' && x.sp.mp_id).map(x => x.sp.mp_id);
        let mpMap = {};
        if (mpIds.length > 0) {
          const { data: mpData } = await supabase.from('materias_primas')
            .select('id,nombre,nombre_producto,precio_kg').in('id', mpIds);
          (mpData || []).forEach(m => { mpMap[m.id] = m; });
        }
        setSpPostMps(mpMap);
        const totalKgMad = picortes.reduce((s, p) => s + parseFloat(pesajes[p.corte_nombre] || 0), 0);
        setSpPostKgs({});
        setModalSpPost({
          subproductos: spActivosConf,
          loteId: loteIdGuardado,
          totalKgMad,
          pendingFlow: esPastrame ? 'horneado' : deshueseEntries.length > 0 ? 'deshuese' : 'exito',
          horneadoData: horneadoWizardData,
          deshueseData: deshueseEntries.length > 0 ? deshueseEntries : null,
        });
      } else if (esPastrame && horneadoWizardData) {
        setModalHorneado(horneadoWizardData);
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

  // ── Confirmar sub-productos post-pesaje ───────────────────
  async function confirmarSpPost() {
    setGuardSpPost(true);
    const hoy = new Date().toISOString().split('T')[0];
    try {
      for (const { fase, sp } of modalSpPost.subproductos) {
        const kgReal = parseFloat(spPostKgs[fase] || 0);
        if (kgReal <= 0) continue;

        let mpTargetId   = null;
        let mpNombreTarget = sp.nombre || fase;

        if (sp.tipo === 'mp_existente' && sp.mp_id) {
          mpTargetId     = sp.mp_id;
          mpNombreTarget = spPostMps[sp.mp_id]?.nombre_producto || spPostMps[sp.mp_id]?.nombre || sp.mp_id;
        } else if (sp.tipo === 'nueva_mp' && sp.nombre) {
          const { data: mpEx } = await supabase.from('materias_primas')
            .select('id').ilike('nombre', sp.nombre).maybeSingle();
          if (mpEx) {
            mpTargetId = mpEx.id;
          } else {
            const { data: nueva } = await supabase.from('materias_primas').insert({
              nombre: sp.nombre, nombre_producto: sp.nombre,
              categoria: 'SUB-PRODUCTOS',
              precio_kg: parseFloat(sp.precio_kg || 0),
              tipo: 'MATERIAS PRIMAS', estado: 'ACTIVO', eliminado: false,
            }).select('id').single();
            mpTargetId = nueva?.id;
          }
          mpNombreTarget = sp.nombre;
        }

        if (mpTargetId) {
          const { data: inv } = await supabase.from('inventario_mp')
            .select('id,stock_kg').eq('materia_prima_id', mpTargetId).maybeSingle();
          if (inv) {
            await supabase.from('inventario_mp')
              .update({ stock_kg: (inv.stock_kg || 0) + kgReal }).eq('id', inv.id);
          } else {
            await supabase.from('inventario_mp')
              .insert({ materia_prima_id: mpTargetId, stock_kg: kgReal, nombre: mpNombreTarget });
          }
          await supabase.from('inventario_movimientos').insert({
            materia_prima_id: mpTargetId, nombre_mp: mpNombreTarget,
            tipo: 'entrada', kg: kgReal,
            motivo: `Sub-producto ${mpNombreTarget} (${fase}) — Lote ${modalSpPost.loteId}`,
            usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
          });
        }
      }

      // Guardar para que confirmarHorneado lo incluya en produccion_horneado_lotes
      setSpRealesData({ ...spPostKgs });

      const pending = { ...modalSpPost };
      setModalSpPost(null);

      if (pending.pendingFlow === 'horneado' && pending.horneadoData) {
        setModalHorneado(pending.horneadoData);
      } else if (pending.pendingFlow === 'deshuese' && pending.deshueseData) {
        const initData = {};
        pending.deshueseData.forEach(e => {
          initData[e.corteNombre] = { kgEntrada: '', kgResS: '', kgPuntas: '', kgDesecho: '' };
        });
        setDshData(initData); setErrorDeshuese('');
        setModalDeshuese(pending.deshueseData);
      } else {
        setExito(`✅ Lote ${pending.loteId} pasó a Stock de Congelación`);
        setTimeout(() => setExito(''), 6000);
      }
    } catch (e) {
      alert('Error al registrar sub-productos: ' + e.message);
    }
    setGuardSpPost(false);
  }

  // ── Paso 1: descontar Mostaza y avanzar ───────────────────
  async function registrarMostaza() {
    if (paso1Listo) { setHorneadoPaso(2); return; }
    const cfg     = modalHorneado?.cfg || {};
    const kgCarne = modalHorneado?.kgCarne || 0;
    const kgMos   = (parseFloat(cfg.gramos_mostaza || 0) / 1000) * kgCarne;
    if (!mpMostaza || kgMos <= 0) { setPaso1Listo(true); setHorneadoPaso(2); return; }
    setGuardHorneado(true);
    const hoy = new Date().toISOString().split('T')[0];
    try {
      const { data: inv } = await supabase.from('inventario_mp')
        .select('id,stock_kg').eq('materia_prima_id', mpMostaza.id).maybeSingle();
      const stockActual = parseFloat(inv?.stock_kg || 0);
      if (stockActual < kgMos) {
        const ok = window.confirm(
          `⚠️ Stock insuficiente de ${mpMostaza.nombre}.\n` +
          `Disponible: ${stockActual.toFixed(3)} kg\n` +
          `Necesario: ${kgMos.toFixed(3)} kg\n\n¿Continuar de todas formas?`
        );
        if (!ok) { setGuardHorneado(false); return; }
      }
      if (inv) {
        await supabase.from('inventario_mp')
          .update({ stock_kg: Math.max(0, stockActual - kgMos) }).eq('id', inv.id);
      }
      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: mpMostaza.id,
        nombre_mp: mpMostaza.nombre,
        tipo: 'salida', kg: kgMos,
        motivo: `Mostaza Pastrame — Lote ${modalHorneado.loteId} (${kgCarne.toFixed(3)} kg carne)`,
        fecha: hoy,
      });
      setPaso1Listo(true);
      setHorneadoPaso(2);
    } catch (e) {
      alert('Error al descontar mostaza: ' + e.message);
    }
    setGuardHorneado(false);
  }

  // ── Paso 2: descontar Rub y avanzar ───────────────────────
  async function registrarRub() {
    if (paso2Listo) { setHorneadoPaso(3); return; }
    if (!modalHorneado?.cfg?.formula_rub || rubFilas.length === 0) {
      setPaso2Listo(true); setHorneadoPaso(3); return;
    }
    const kgCarne   = modalHorneado.kgCarne || 0;
    const kgRubBase = parseFloat(modalHorneado.cfg.kg_rub_base || 1);
    const escala    = kgRubBase > 0 ? kgCarne / kgRubBase : 1;
    const hoy       = new Date().toISOString().split('T')[0];
    setGuardHorneado(true);
    try {
      // Verificar si algún ingrediente tiene stock insuficiente
      const bajos = [];
      for (const f of rubFilas) {
        if (!f.materia_prima_id) continue;
        const kgUsar = (parseFloat(f.gramos || 0) / 1000) * escala;
        const { data: inv } = await supabase.from('inventario_mp')
          .select('stock_kg').eq('materia_prima_id', f.materia_prima_id).maybeSingle();
        if (parseFloat(inv?.stock_kg || 0) < kgUsar) {
          bajos.push(`• ${f.ingrediente_nombre}: hay ${parseFloat(inv?.stock_kg||0).toFixed(3)} kg, necesario ${kgUsar.toFixed(3)} kg`);
        }
      }
      if (bajos.length > 0) {
        const ok = window.confirm(`⚠️ Stock insuficiente en:\n${bajos.join('\n')}\n\n¿Continuar de todas formas?`);
        if (!ok) { setGuardHorneado(false); return; }
      }
      for (const f of rubFilas) {
        if (!f.materia_prima_id) continue;
        const kgUsar = (parseFloat(f.gramos || 0) / 1000) * escala;
        const { data: inv } = await supabase.from('inventario_mp')
          .select('id,stock_kg').eq('materia_prima_id', f.materia_prima_id).maybeSingle();
        if (inv) {
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, parseFloat(inv.stock_kg || 0) - kgUsar) }).eq('id', inv.id);
        }
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id: f.materia_prima_id,
          nombre_mp: f.ingrediente_nombre,
          tipo: 'salida', kg: kgUsar,
          motivo: `Rub Pastrame — Lote ${modalHorneado.loteId} (${kgCarne.toFixed(3)} kg carne)`,
          fecha: hoy,
        });
      }
      setPaso2Listo(true);
      setHorneadoPaso(3);
    } catch (e) {
      alert('Error al descontar Rub: ' + e.message);
    }
    setGuardHorneado(false);
  }

  // ── Paso 2 (legacy): descontar Rub del inventario ─────────
  async function descontarRub() {
    if (!modalHorneado?.cfg?.formula_rub || rubFilas.length === 0) { setPaso2Listo(true); return; }
    const kgCarne   = modalHorneado.kgCarne || 0;
    const kgRubBase = parseFloat(modalHorneado.cfg.kg_rub_base || 1);
    const escala    = kgRubBase > 0 ? kgCarne / kgRubBase : 1;
    const hoy       = new Date().toISOString().split('T')[0];
    try {
      for (const f of rubFilas) {
        if (!f.materia_prima_id) continue;
        const kgUsar = (parseFloat(f.gramos || 0) / 1000) * escala;
        const { data: inv } = await supabase.from('inventario_mp')
          .select('id,stock_kg').eq('materia_prima_id', f.materia_prima_id).maybeSingle();
        if (inv) {
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, (inv.stock_kg || 0) - kgUsar) }).eq('id', inv.id);
        }
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id: f.materia_prima_id,
          nombre_mp: f.ingrediente_nombre,
          tipo: 'salida', kg: kgUsar,
          motivo: `Rub Pastrame — Lote ${modalHorneado.loteId} (${kgCarne.toFixed(3)} kg carne)`,
          fecha: hoy,
        });
      }
      setPaso2Listo(true);
    } catch (e) {
      alert('Error al descontar Rub: ' + e.message);
    }
  }

  // ── Imprimir receta Rub ───────────────────────────────────
  function imprimirRub() {
    if (!modalHorneado) return;
    const { kgCarne, cfg } = modalHorneado;
    const kgRubBase = parseFloat(cfg.kg_rub_base || 1);
    const escala    = kgRubBase > 0 ? kgCarne / kgRubBase : 1;
    const html = `<!DOCTYPE html><html><head><title>${cfg.formula_rub}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;max-width:600px;}
    h2{color:#6c3483;} table{width:100%;border-collapse:collapse;margin-top:16px;}
    th{background:#6c3483;color:white;padding:8px 12px;text-align:left;}
    td{padding:8px 12px;border-bottom:1px solid #eee;}
    .total{font-weight:bold;background:#f5eef8;}
    .nota{color:#888;font-size:12px;margin-top:12px;}</style>
    </head><body>
    <h2>🌶️ ${cfg.formula_rub || 'Rub'}</h2>
    <p><strong>Lote:</strong> ${modalHorneado.loteId} &nbsp;|&nbsp;
       <strong>Carne:</strong> ${kgCarne.toFixed(3)} kg &nbsp;|&nbsp;
       <strong>Fecha:</strong> ${new Date().toLocaleDateString()}</p>
    <table>
      <tr><th>Ingrediente</th><th>Base (${kgRubBase}kg)</th><th>Para ${kgCarne.toFixed(2)}kg</th></tr>
      ${rubFilas.map(f => {
        const gr = parseFloat(f.gramos || 0);
        return `<tr><td>${f.ingrediente_nombre}</td><td>${gr.toFixed(1)} g</td><td><strong>${(gr * escala).toFixed(1)} g</strong></td></tr>`;
      }).join('')}
      <tr class="total"><td>TOTAL</td>
        <td>${rubFilas.reduce((s,f)=>s+parseFloat(f.gramos||0),0).toFixed(1)} g</td>
        <td>${(rubFilas.reduce((s,f)=>s+parseFloat(f.gramos||0),0)*escala).toFixed(1)} g</td>
      </tr>
    </table>
    <p class="nota">Fórmula base para ${kgRubBase} kg de carne → multiplicada × ${escala.toFixed(2)} para ${kgCarne.toFixed(2)} kg</p>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  async function confirmarHorneado() {
    const cfg       = modalHorneado?.cfg || {};
    const kgCarne   = modalHorneado?.kgCarne || 0;
    const kgMadLote = modalHorneado?.kgMad || 0;
    const kgRubBase = parseFloat(cfg.kg_rub_base || 1);
    const kgMostaza = (parseFloat(cfg.gramos_mostaza || 0) / 1000) * kgCarne;
    const kgRub     = (rubFilas.reduce((s, f) => s + parseFloat(f.gramos || 0), 0) / 1000) * (kgRubBase > 0 ? kgCarne / kgRubBase : 1);
    const kgHorno   = parseFloat(hrnHornoKg) || 0; // peso real medido → inventario

    if (kgHorno <= 0) { setErrorHorneado('Ingresa el peso final listo para rebanar'); return; }
    if (kgHorno > kgMadLote) { setErrorHorneado('El peso no puede ser mayor al que entró al horno'); return; }

    const costoMostaza    = kgMostaza * parseFloat(mpMostaza?.precio_kg || 0);
    const costoRub        = kgRub * rubCostoKg;
    const costoFinalTotal = modalHorneado.costoTotal + costoMostaza + costoRub;

    const cFinalKg        = kgHorno > 0 ? costoFinalTotal / kgHorno : 0;

    // Merma real
    const mermaHornoKg    = kgMadLote - kgHorno;
    const mermaHornoReal  = kgMadLote > 0 ? mermaHornoKg / kgMadLote * 100 : 0;

    setGuardHorneado(true);
    setErrorHorneado('');
    try {
      const hoy      = new Date().toISOString().split('T')[0];
      const mpNombre = 'Pastrame Horneado';

      // 1. Guardar produccion_horneado_lotes
      await supabase.from('produccion_horneado_lotes').insert({
        lote_id:           modalHorneado.loteId,
        fecha:             hoy,
        producto_nombre:   mpNombre,
        kg_mostaza:        kgMostaza,
        costo_mostaza:     costoMostaza,
        kg_rub:            kgRub,
        costo_rub:         costoRub,
        kg_entrada_horno:  kgMadLote,
        kg_post_horno:     kgHorno,
        merma_horno_kg:    mermaHornoKg,
        merma_horno_pct:   mermaHornoReal,
        kg_post_reposo:    kgHorno,
        merma_reposo_kg:   0,
        merma_reposo_pct:  0,
        c_final_kg:        cFinalKg,
        subproductos_real: Object.keys(spRealesData).length > 0 ? spRealesData : null,
      });
      setSpRealesData({});

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

      // 3. Sumar a inventario_mp (kg real medido)
      const { data: inv } = await supabase.from('inventario_mp')
        .select('id,stock_kg').eq('materia_prima_id', mpPastrameId).maybeSingle();
      if (inv) {
        await supabase.from('inventario_mp').update({ stock_kg: (inv.stock_kg || 0) + kgHorno }).eq('id', inv.id);
      } else {
        await supabase.from('inventario_mp').insert({ materia_prima_id: mpPastrameId, stock_kg: kgHorno, nombre: mpNombre });
      }

      // 4. Movimiento ENTRADA Pastrame
      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: mpPastrameId, nombre_mp: mpNombre,
        tipo: 'entrada', kg: kgHorno,
        motivo: `Horneado Pastrame — Lote ${modalHorneado.loteId} · $${cFinalKg.toFixed(4)}/kg`,
        usuario_nombre: currentUser?.email || '', user_id: currentUser?.id || null, fecha: hoy,
      });

      // 5. Notificación imprevisto al admin
      if (imprevisto.activo && imprevisto.motivo.trim()) {
        const kgDan = parseFloat(imprevisto.kgDaniado) || 0;
        await crearNotificacion({
          tipo:           'imprevisto_horneado',
          origen:         'produccion',
          usuario_nombre: currentUser?.email || 'Producción',
          user_id:        currentUser?.id || null,
          producto_nombre: mpNombre,
          mensaje: `⚠️ IMPREVISTO — Lote ${modalHorneado.loteId} · Pastrame Horneado\n` +
                   (kgDan > 0 ? `Kg dañados: ${kgDan.toFixed(3)} kg\n` : '') +
                   `Motivo: ${imprevisto.motivo.trim()}`,
        });
      }

      setModalHorneado(null);
      setImprevisto({ activo: false, kgDaniado: '', motivo: '' });
      setExito(`✅ Pastrame Horneado — ${kgHorno.toFixed(3)} kg · C_final $${cFinalKg.toFixed(4)}/kg → Stock AHUMADOS`);
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

      {/* ══ Modal Horneado — Pastrame — Wizard 3 pasos ══ */}
      {modalHorneado && (() => {
        const { loteId, kgMad, kgCarne, costoTotal, cMadKg, cfg } = modalHorneado;
        const kgRubBase   = parseFloat(cfg.kg_rub_base || 1);
        const escala      = kgRubBase > 0 ? kgCarne / kgRubBase : 1;
        const kgMostazaAuto = (parseFloat(cfg.gramos_mostaza || 0) / 1000) * kgCarne;
        const costoMosAuto  = kgMostazaAuto * parseFloat(mpMostaza?.precio_kg || 0);
        const totalRubGr    = rubFilas.reduce((s, f) => s + parseFloat(f.gramos || 0), 0);
        const kgRubAuto     = (totalRubGr / 1000) * escala;
        const costoRubAuto  = kgRubAuto * rubCostoKg;

        // Paso 3 derived
        const kgHorno         = parseFloat(hrnHornoKg) || 0;
        const costoFinalTotal = costoTotal + costoMosAuto + costoRubAuto;
        const cFinal          = kgHorno > 0 ? costoFinalTotal / kgHorno : 0;
        const mHorno          = kgMad > 0 ? ((kgMad - kgHorno) / kgMad * 100) : 0;
        const listo3          = kgHorno > 0 && kgHorno <= kgMad;

        const pasoColor = ['', '#e67e22', '#8e44ad', '#e74c3c'][horneadoPaso];

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 18, padding: 24, width: '100%', maxWidth: 500, boxShadow: '0 8px 36px rgba(0,0,0,0.35)', maxHeight: '94vh', overflowY: 'auto' }}>

              {/* Encabezado */}
              <div style={{ fontWeight: 'bold', fontSize: 17, color: '#1a1a2e', marginBottom: 2 }}>🔥 Pastrame Horneado</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                Lote <b>{loteId}</b> · <b>{kgMad.toFixed(3)} kg</b> · <b>{kgCarne.toFixed(3)} kg carne</b> · C_mad <b>${cMadKg.toFixed(4)}/kg</b>
              </div>

              {/* Indicador de pasos */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {[1,2,3].map(n => (
                  <div key={n} style={{
                    flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: horneadoPaso === n ? pasoColor : horneadoPaso > n ? '#d5f5e3' : '#f0f2f5',
                    color: horneadoPaso === n ? 'white' : horneadoPaso > n ? '#1e8449' : '#aaa',
                    border: horneadoPaso === n ? `2px solid ${pasoColor}` : '2px solid transparent',
                  }}>
                    {n === 1 ? '1 · Mostaza' : n === 2 ? '2 · Rub' : '3 · Horno'}
                    {horneadoPaso > n && ' ✓'}
                  </div>
                ))}
              </div>

              {/* ───── PASO 1: Mostaza ───── */}
              {horneadoPaso === 1 && (
                <div>
                  <div style={{ background: '#fffbf0', borderRadius: 12, padding: 16, border: '2px solid #f39c12', marginBottom: 18 }}>
                    <div style={{ fontWeight: 700, color: '#e67e22', fontSize: 12, marginBottom: 12 }}>FASE 3 — MOSTAZA (agente de adherencia)</div>

                    {/* Proporción calculada */}
                    <div style={{ background: 'white', borderRadius: 8, padding: '12px 14px', border: '1px solid #f8c471' }}>
                      <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>PROPORCIÓN AUTOMÁTICA</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#555' }}>Tasa</span>
                        <span style={{ fontWeight: 700, color: '#e67e22' }}>{parseFloat(cfg.gramos_mostaza || 0).toFixed(0)} g / kg carne</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#555' }}>Kg de carne</span>
                        <span style={{ fontWeight: 700 }}>{kgCarne.toFixed(3)} kg</span>
                      </div>
                      <div style={{ borderTop: '1px dashed #f8c471', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#e67e22' }}>Mostaza a aplicar</span>
                        <span style={{ fontSize: 22, fontWeight: 900, color: '#e67e22' }}>{(kgMostazaAuto * 1000).toFixed(0)} g</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', textAlign: 'right', marginTop: 2 }}>= {kgMostazaAuto.toFixed(3)} kg</div>
                    </div>

                    {mpMostaza && (
                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#888' }}>{mpMostaza.nombre} · ${parseFloat(mpMostaza.precio_kg||0).toFixed(4)}/kg</span>
                        <span style={{ fontWeight: 700, color: '#e67e22' }}>Costo: ${costoMosAuto.toFixed(4)}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={registrarMostaza} disabled={guardHorneado} style={{
                      background: guardHorneado ? '#aaa' : 'linear-gradient(135deg,#e67e22,#f39c12)',
                      color: 'white', border: 'none', borderRadius: 8,
                      padding: '11px 26px', cursor: guardHorneado ? 'default' : 'pointer',
                      fontSize: 14, fontWeight: 'bold'
                    }}>{guardHorneado ? 'Registrando...' : '✅ Registrar y continuar'}</button>
                  </div>
                </div>
              )}

              {/* ───── PASO 2: Rub ───── */}
              {horneadoPaso === 2 && (
                <div>
                  <div style={{ background: '#f5f0ff', borderRadius: 12, padding: 16, border: '2px solid #8e44ad', marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, color: '#8e44ad', fontSize: 12 }}>FASE 4 — {cfg.formula_rub || 'Rub Pastrame'}</div>
                      <button onClick={imprimirRub} style={{
                        background: '#8e44ad', color: 'white', border: 'none', borderRadius: 6,
                        padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 700
                      }}>🖨️ Imprimir</button>
                    </div>

                    {/* Encabezado tabla */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 12px', fontSize: 10, fontWeight: 700, color: '#9b59b6', borderBottom: '1.5px solid #d7bde2', paddingBottom: 4, marginBottom: 6 }}>
                      <span>INGREDIENTE</span>
                      <span style={{ textAlign: 'right' }}>BASE ({kgRubBase}kg)</span>
                      <span style={{ textAlign: 'right' }}>PARA {kgCarne.toFixed(2)}kg</span>
                    </div>

                    {rubFilas.length === 0 && (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '10px 0' }}>Sin fórmula Rub cargada</div>
                    )}

                    {rubFilas.map((f, i) => {
                      const grBase   = parseFloat(f.gramos || 0);
                      const grEscala = grBase * escala;
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px 12px', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #e8daef' }}>
                          <span style={{ color: '#333' }}>{f.ingrediente_nombre}</span>
                          <span style={{ textAlign: 'right', color: '#888' }}>{grBase.toFixed(1)} g</span>
                          <span style={{ textAlign: 'right', fontWeight: 700, color: '#6c3483' }}>{grEscala.toFixed(1)} g</span>
                        </div>
                      );
                    })}

                    {/* Total */}
                    {rubFilas.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px 12px', fontSize: 13, padding: '8px 0 0', fontWeight: 700, borderTop: '1.5px solid #d7bde2', marginTop: 4 }}>
                        <span style={{ color: '#6c3483' }}>TOTAL</span>
                        <span style={{ textAlign: 'right', color: '#9b59b6' }}>{totalRubGr.toFixed(1)} g</span>
                        <span style={{ textAlign: 'right', color: '#6c3483' }}>{(totalRubGr * escala).toFixed(1)} g</span>
                      </div>
                    )}

                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: '#888' }}>Costo Rub: ${rubCostoKg.toFixed(4)}/kg</span>
                      <span style={{ fontWeight: 700, color: '#8e44ad' }}>Total: ${costoRubAuto.toFixed(4)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setHorneadoPaso(1)} style={{ background: '#f0f2f5', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}>← Atrás</button>
                    <button onClick={registrarRub} disabled={guardHorneado} style={{
                      background: guardHorneado ? '#aaa' : 'linear-gradient(135deg,#8e44ad,#6c3483)',
                      color: 'white', border: 'none', borderRadius: 8,
                      padding: '11px 26px', cursor: guardHorneado ? 'default' : 'pointer',
                      fontSize: 14, fontWeight: 'bold'
                    }}>{guardHorneado ? 'Registrando...' : '✅ Registrar y continuar'}</button>
                  </div>
                </div>
              )}

              {/* ───── PASO 3: Horno ───── */}
              {horneadoPaso === 3 && (
                <div>
                  {/* Input peso real */}
                  <div style={{ background: '#fff3f0', borderRadius: 12, padding: 20, border: '2px solid #e74c3c', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, color: '#e74c3c', fontSize: 12, marginBottom: 12 }}>FASE 5 — HORNEADO (110°C → 70°C int → 92°C int)</div>
                    <label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>Kg listo para rebanar (post-horno + reposo) *</label>
                    <input type="number" min="0" step="0.001" placeholder={`máx ${kgMad.toFixed(3)}`} value={hrnHornoKg}
                      onChange={e => setHrnHornoKg(e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '2px solid #e74c3c', fontSize: 18, fontWeight: 'bold', boxSizing: 'border-box', marginTop: 6 }} />
                    {kgHorno > 0 && (
                      <div style={{ fontSize: 12, color: kgHorno > kgMad ? '#e74c3c' : '#888', marginTop: 6 }}>
                        Merma real: <b>{(kgMad - kgHorno).toFixed(3)} kg ({mHorno.toFixed(1)}%)</b>
                        {kgHorno > kgMad && ' ⚠️ Excede peso de entrada'}
                      </div>
                    )}
                  </div>

                  {/* Resumen costos */}
                  {kgHorno > 0 && (
                    <div style={{ background: '#1a1a2e', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, marginBottom: 8 }}>RESUMEN DE COSTOS</div>
                      {[
                        ['Carne + Salmuera (C_mad)', `$${costoTotal.toFixed(4)}`, '#7ec8f7'],
                        ['Mostaza', `+$${costoMosAuto.toFixed(4)}`, '#f39c12'],
                        ['Rub Pastrame', `+$${costoRubAuto.toFixed(4)}`, '#c39bd3'],
                        ['Merma total', `${mHorno.toFixed(1)}%`, '#e74c3c'],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: '#888' }}>{l}</span>
                          <span style={{ color: c, fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ borderTop: '1px solid #333', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#a9dfbf' }}>Peso final ({kgHorno.toFixed(3)} kg)</span>
                        <span style={{ fontSize: 14, fontWeight: 900, color: '#a9dfbf' }}>C_final = ${cFinal.toFixed(4)}/kg</span>
                      </div>
                    </div>
                  )}

                  {/* Imprevistos — sección desplegable */}
                  <div style={{ marginBottom: 14 }}>
                    <button
                      onClick={() => setImprevisto(p => ({ ...p, activo: !p.activo }))}
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 14px',
                        background: imprevisto.activo ? '#fff3e0' : '#f8f8f8',
                        border: imprevisto.activo ? '1.5px solid #e67e22' : '1.5px solid #ddd',
                        borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        color: imprevisto.activo ? '#e67e22' : '#555',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                      <span>⚠️ ¿Ocurrió algún imprevisto?</span>
                      <span style={{ fontSize: 16 }}>{imprevisto.activo ? '▲' : '▼'}</span>
                    </button>

                    {imprevisto.activo && (
                      <div style={{ border: '1.5px solid #e67e22', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '14px', background: '#fffbf5' }}>
                        <p style={{ fontSize: 12, color: '#7d6608', margin: '0 0 10px' }}>
                          Si algo salió mal (daño en producto, falla de equipo, etc.) registralo aquí. Se enviará un aviso al administrador.
                        </p>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                          <label style={{ fontSize: 12, color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>Kg dañados:</label>
                          <input
                            type="number" min="0" step="0.001" placeholder="0.000"
                            value={imprevisto.kgDaniado}
                            onChange={e => setImprevisto(p => ({ ...p, kgDaniado: e.target.value }))}
                            style={{ width: 100, padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e67e22', fontSize: 13, fontWeight: 'bold' }}
                          />
                          <span style={{ fontSize: 11, color: '#999' }}>(dejar en 0 si no hay pérdida de kg)</span>
                        </div>
                        <textarea
                          placeholder="Describe el imprevisto: qué pasó, por qué, consecuencias..."
                          value={imprevisto.motivo}
                          onChange={e => setImprevisto(p => ({ ...p, motivo: e.target.value }))}
                          rows={3}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e67e22', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'Arial' }}
                        />
                      </div>
                    )}
                  </div>

                  {errorHorneado && (
                    <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', color: '#e74c3c', fontSize: 13, marginBottom: 14 }}>{errorHorneado}</div>
                  )}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setHorneadoPaso(2)} style={{ background: '#f0f2f5', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}>← Atrás</button>
                    <button onClick={confirmarHorneado} disabled={!listo3 || guardHorneado} style={{
                      background: !listo3 || guardHorneado ? '#aaa' : 'linear-gradient(135deg,#e74c3c,#8e44ad)',
                      color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px',
                      cursor: !listo3 || guardHorneado ? 'default' : 'pointer', fontSize: 13, fontWeight: 'bold'
                    }}>
                      {guardHorneado ? 'Guardando...' : '🔥 Confirmar Horneado'}
                    </button>
                  </div>
                </div>
              )}

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

      {/* ══ Modal Sub-productos post-pesaje ══ */}
      {modalSpPost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Sub-productos — uno por tarjeta */}
            {modalSpPost.subproductos.map(({ fase, sp }) => {
              const mpInfo   = sp.tipo === 'mp_existente' ? spPostMps[sp.mp_id] : null;
              const nombre   = sp.tipo === 'nueva_mp' ? sp.nombre : (mpInfo?.nombre_producto || mpInfo?.nombre || sp.mp_id || fase);
              const precio   = sp.tipo === 'nueva_mp' ? parseFloat(sp.precio_kg || 0) : parseFloat(mpInfo?.precio_kg || 0);
              const kgReal   = parseFloat(spPostKgs[fase] || 0);
              const valorRec = kgReal * precio;
              const tipoLabel = sp.tipo === 'mp_existente' ? '📦 MP existente → entra a inventario'
                              : sp.tipo === 'nueva_mp'     ? '🆕 Nueva MP → entra a inventario'
                              : '❌ Pérdida total';
              const tipoColor = sp.tipo === 'perdida' ? '#e74c3c' : '#2980b9';
              return (
                <div key={fase} style={{ marginBottom: 20 }}>
                  {/* Título: nombre del sub-producto */}
                  <div style={{ fontWeight: 900, fontSize: 18, color: '#1a1a2e', marginBottom: 2 }}>
                    {nombre}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: tipoColor, fontWeight: 700, background: tipoColor + '18', borderRadius: 6, padding: '2px 10px' }}>
                      {tipoLabel}
                    </span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>Lote {modalSpPost.loteId} · {modalSpPost.totalKgMad.toFixed(3)} kg post-maduración</span>
                  </div>

                  {/* Input kg */}
                  <div style={{ background: sp.tipo === 'perdida' ? '#fff5f5' : '#f0fff8', border: `2px solid ${sp.tipo === 'perdida' ? '#f5b7b1' : '#a9dfbf'}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
                      {sp.tipo === 'perdida'
                        ? <>¿Cuántos kg de merma real de <b>{nombre}</b> hubo en este lote?</>
                        : <>¿Cuántos kg de <b>{nombre}</b> obtuviste en este lote?</>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" min="0" step="0.001"
                        value={spPostKgs[fase] ?? ''}
                        onChange={e => setSpPostKgs(prev => ({ ...prev, [fase]: e.target.value }))}
                        placeholder="0.000"
                        style={{ flex: 1, padding: '12px 14px', borderRadius: 8, border: `2px solid ${sp.tipo === 'perdida' ? '#e74c3c' : '#27ae60'}`, fontSize: 18, fontWeight: 'bold', textAlign: 'right' }} />
                      <span style={{ fontSize: 15, color: '#555', fontWeight: 700 }}>kg</span>
                    </div>
                    {sp.tipo === 'perdida' && kgReal > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#e74c3c', fontWeight: 700 }}>
                        ❌ {kgReal.toFixed(3)} kg de merma — sin valor recuperable, sube el costo/kg
                      </div>
                    )}
                    {sp.tipo !== 'perdida' && valorRec > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#27ae60', fontWeight: 700 }}>
                        💰 Valor recuperado: {kgReal.toFixed(3)} kg × ${precio.toFixed(4)}/kg = ${valorRec.toFixed(4)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Botón confirmar */}
            <div style={{ marginTop: 8 }}>
              <button onClick={confirmarSpPost} disabled={guardSpPost}
                style={{ width: '100%', padding: '12px', background: guardSpPost ? '#aaa' : '#27ae60', color: 'white', border: 'none', borderRadius: 8, cursor: guardSpPost ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {guardSpPost ? 'Guardando...' : '💾 Confirmar sub-productos → Siguiente'}
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
