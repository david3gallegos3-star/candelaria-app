// ============================================
// TabCierre.js
// Cierre del día — kg reales + fundas + merma
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function TabCierre({ mobile, userRol, currentUser, produccionDiaria }) {

  const [fecha,          setFecha]          = useState(new Date().toISOString().split('T')[0]);
  const [cierres,        setCierres]        = useState([]);
  const [prodDelDia,     setProdDelDia]     = useState([]);
  const [editandoIdx,    setEditandoIdx]    = useState(null);
  const [guardando,      setGuardando]      = useState(false);
  const [msgExito,       setMsgExito]       = useState('');

  // Estado del formulario activo
  const [formActivo, setFormActivo] = useState(null);

  // ── Inyección ──
  const [lotesInyeccion,   setLotesInyeccion]   = useState([]);
  const [formInyec,        setFormInyec]         = useState(null);
  const [guardandoInyec,   setGuardandoInyec]    = useState(false);
  const [precioRetazoMP,   setPrecioRetazoMP]    = useState(0);
  // {
  //   produccion_id, producto_nombre, kg_crudos_estimados,
  //   kg_producidos_reales, kg_en_fundas, kg_picaditas,
  //   merma_estimada, fundas: [{nombre_funda, kg_por_funda, cantidad}]
  // }

  useEffect(() => { cargarDatos(); cargarLotesInyeccion(); }, [fecha]);

  useEffect(() => {
    supabase.from('materias_primas')
      .select('precio_kg').eq('nombre', 'Retazos Cortes').eq('eliminado', false).limit(1)
      .then(({ data }) => { if (data?.[0]) setPrecioRetazoMP(parseFloat(data[0].precio_kg) || 0); });
  }, []);

  const [configsProductos, setConfigsProductos] = useState({});

  async function cargarLotesInyeccion() {
    const { data } = await supabase
      .from('produccion_inyeccion')
      .select('*, produccion_inyeccion_cortes(*), produccion_inyeccion_ingredientes(*)')
      .eq('fecha', fecha)
      .eq('estado', 'abierto')
      .order('created_at', { ascending: false });
    setLotesInyeccion(data || []);
  }

  function abrirCierreInyeccion(lote) {
    setFormInyec({
      lote,
      filas: (lote.produccion_inyeccion_cortes || []).map(c => ({
        id: c.id,
        nombre: c.corte_nombre,
        kg_crudo: parseFloat(c.kg_carne_cruda || 0),
        costo_carne: parseFloat(c.costo_carne || 0),
        peso_inyectado: '',
        peso_post_corte: '',
      })),
      virutas_total: '',
    });
  }

  async function guardarCierreInyeccion() {
    if (!formInyec) return;
    setGuardandoInyec(true);
    try {
      const { lote, filas, virutas_total } = formInyec;
      const kgTotalCarne       = parseFloat(lote.kg_carne_total || 0);
      const costoSalmueraTotal = parseFloat(lote.costo_salmuera_total || 0);
      const precioRetazo       = precioRetazoMP;

      // Calcular pesos finales
      const filasConPesos = filas.map(f => {
        const pesoInj  = parseFloat(f.peso_inyectado)  > 0 ? parseFloat(f.peso_inyectado)  : f.kg_crudo;
        const pesoPost = parseFloat(f.peso_post_corte) > 0 ? parseFloat(f.peso_post_corte) : f.kg_crudo;
        return { ...f, pesoInj, pesoPost, kgRetazos: Math.max(0, pesoInj - pesoPost) };
      });

      const kgTotalRetazos       = filasConPesos.reduce((s, f) => s + f.kgRetazos, 0);
      const ingresoRetazosTotal  = kgTotalRetazos * precioRetazo;

      // Actualizar cada corte con costo_final_kg proporcional
      for (const f of filasConPesos) {
        const proporcion        = kgTotalCarne > 0 ? f.kg_crudo / kgTotalCarne : 0;
        const costoSalmueraProp = costoSalmueraTotal * proporcion;
        const creditoRetazos    = ingresoRetazosTotal * proporcion;
        const costoFinalKg      = f.pesoPost > 0
          ? (f.costo_carne + costoSalmueraProp - creditoRetazos) / f.pesoPost
          : 0;

        await supabase.from('produccion_inyeccion_cortes').update({
          kg_carne_limpia:        f.pesoPost,
          kg_retazos:             f.kgRetazos,
          precio_venta_retazo_kg: precioRetazo,
          ingreso_retazos:        ingresoRetazosTotal * proporcion,
          costo_salmuera_asignado: costoSalmueraProp,
          costo_final_kg:         costoFinalKg,
        }).eq('id', f.id);
      }

      // Debitar inventario de ingredientes de salmuera
      const { data: invActual } = await supabase.from('inventario_mp').select('materia_prima_id,stock_kg');
      for (const ing of (lote.produccion_inyeccion_ingredientes || [])) {
        if (!ing.materia_prima_id || parseFloat(ing.kg_usados) <= 0) continue;
        const invReg = (invActual || []).find(i => i.materia_prima_id === ing.materia_prima_id);
        if (invReg) {
          await supabase.from('inventario_mp').update({
            stock_kg: Math.max(0, parseFloat(invReg.stock_kg) - parseFloat(ing.kg_usados))
          }).eq('materia_prima_id', ing.materia_prima_id);
        }
      }
      // Debitar inventario de cortes (carne)
      for (const corte of (lote.produccion_inyeccion_cortes || [])) {
        if (!corte.materia_prima_id || parseFloat(corte.kg_carne_cruda) <= 0) continue;
        const invReg = (invActual || []).find(i => i.materia_prima_id === corte.materia_prima_id);
        if (invReg) {
          await supabase.from('inventario_mp').update({
            stock_kg: Math.max(0, parseFloat(invReg.stock_kg) - parseFloat(corte.kg_carne_cruda))
          }).eq('materia_prima_id', corte.materia_prima_id);
        }
      }

      // Cerrar lote
      await supabase.from('produccion_inyeccion').update({
        estado: 'cerrado',
        fecha_cierre: fecha,
        notas: [lote.notas, virutas_total ? `Virutas: ${virutas_total} kg` : ''].filter(Boolean).join(' | ') || null,
      }).eq('id', lote.id);

      setFormInyec(null);
      mostrarExito('✅ Cierre de inyección registrado — inventario debitado');
      await cargarLotesInyeccion();
    } catch (e) { alert('Error: ' + e.message); }
    setGuardandoInyec(false);
  }

  async function cargarDatos() {
    const { data: prods } = await supabase
      .from('produccion_diaria')
      .select('*')
      .eq('fecha', fecha)
      .eq('revertida', false);

    const { data: cierresData } = await supabase
      .from('cierres_produccion')
      .select('*')
      .eq('fecha', fecha);

    // Cargar configs con fundas
    const nombres = (prods || []).map(p => p.producto_nombre);
    if (nombres.length > 0) {
      const { data: configs } = await supabase
        .from('config_productos')
        .select('producto_nombre, fundas, precio_venta_kg')
        .in('producto_nombre', nombres);
      const map = {};
      (configs || []).forEach(c => { map[c.producto_nombre] = c; });
      setConfigsProductos(map);
    }

    setProdDelDia(prods || []);
    setCierres(cierresData || []);
  }

  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 5000);
  }

  // Verificar si un producto ya tiene cierre
  function tieneCierre(prod) {
    return cierres.some(c => c.producto_nombre === prod.producto_nombre);
  }

  function getCierre(prod) {
    return cierres.find(c => c.producto_nombre === prod.producto_nombre);
  }

  // Abrir formulario nuevo cierre
  function abrirFormNuevo(prod) {
    const config = configsProductos[prod.producto_nombre];
    const fundasConfig = (config?.fundas || []).map(f => ({
      nombre_funda: f.nombre_funda || '',
      kg_por_funda: parseFloat(f.kg_por_funda) || 1,
      cantidad:     0,
      precio_venta_unitario: parseFloat(config?.precio_venta_kg || 0) * (parseFloat(f.kg_por_funda) || 1)
    }));
    setFormActivo({
      produccion_id:        prod.id,
      producto_nombre:      prod.producto_nombre,
      kg_crudos_estimados:  parseFloat(prod.kg_total_crudo || 0),
      merma_estimada:       parseFloat(prod.porcentaje_merma || 0),
      kg_producidos_reales: '',
      kg_en_fundas:         '',
      kg_picaditas:         '',
      fundas:               fundasConfig,
      esEdicion:            false,
      cierreId:             null,
    });
    setEditandoIdx(null);
  }

  // Abrir formulario editar cierre
function abrirFormEditar(cierre) {
  const config = configsProductos[cierre.producto_nombre];
  const fundasConfig = (config?.fundas || []).map(f => {
    const fundaGuardada = (cierre.fundas || []).find(fg =>
      fg.nombre_funda === f.nombre_funda &&
      parseFloat(fg.kg_por_funda) === parseFloat(f.kg_por_funda)
    );
    return {
      nombre_funda: f.nombre_funda || '',
      kg_por_funda: parseFloat(f.kg_por_funda) || 1,
      cantidad:     fundaGuardada ? parseInt(fundaGuardada.cantidad) || 0 : 0,
      precio_venta_unitario: parseFloat(config?.precio_venta_kg || 0) * (parseFloat(f.kg_por_funda) || 1)
    };
  });
  
  setFormActivo({
    produccion_id:        cierre.produccion_id,
    producto_nombre:      cierre.producto_nombre,
    kg_crudos_estimados:  parseFloat(cierre.kg_crudos_estimados || 0),
    merma_estimada:       parseFloat(cierre.merma_estimada || 0),
    kg_producidos_reales: cierre.kg_producidos_reales,
    kg_en_fundas:         cierre.kg_en_fundas,
    kg_picaditas:         cierre.kg_picaditas,
    fundas:               fundasConfig,
    esEdicion:            true,
    cierreId:             cierre.id,
  });
}

  // Agregar funda al formulario
  function agregarFunda() {
    setFormActivo(prev => ({
      ...prev,
      fundas: [...prev.fundas, { nombre_funda: '', kg_por_funda: 1, cantidad: 0 }]
    }));
  }

  // Eliminar funda
  function eliminarFunda(idx) {
    setFormActivo(prev => ({
      ...prev,
      fundas: prev.fundas.filter((_, i) => i !== idx)
    }));
  }

  // Actualizar funda
  function actualizarFunda(idx, campo, valor) {
    setFormActivo(prev => {
      const f = [...prev.fundas];
      f[idx] = { ...f[idx], [campo]: valor };
      return { ...prev, fundas: f };
    });
  }

  // Calculos automaticos
  function calcularMermaReal() {
    if (!formActivo) return null;
    const crudo   = parseFloat(formActivo.kg_crudos_estimados) || 0;
    const fundas  = parseFloat(formActivo.kg_en_fundas)        || 0;
    if (crudo === 0) return null;
    const mermaReal = (crudo - fundas) / crudo;
    return Math.max(0, mermaReal);
  }

  function totalKgFundas() {
    if (!formActivo) return 0;
    return formActivo.fundas.reduce((s, f) =>
      s + (parseFloat(f.kg_por_funda) || 0) * (parseFloat(f.cantidad) || 0), 0
    );
  }

  function totalFundas() {
    if (!formActivo) return 0;
    return formActivo.fundas.reduce((s, f) => s + (parseInt(f.cantidad) || 0), 0);
  }

  function validarFundas() {
    const totalF = totalKgFundas();
    const kgEnF  = parseFloat(formActivo?.kg_en_fundas) || 0;
    if (kgEnF === 0) return true;
    return Math.abs(totalF - kgEnF) < 0.1;
  }
  // Guardar cierre
  async function guardarCierre() {
    if (!formActivo) return;
    const mermaReal = calcularMermaReal();
    setGuardando(true);
    try {
      if (formActivo.esEdicion) {
        // Revertir movimientos anteriores en inventario_produccion
        await supabase.from('inventario_produccion')
          .delete().eq('cierre_id', formActivo.cierreId);

        // Actualizar cierre
        await supabase.from('cierres_produccion').update({
          kg_producidos_reales: parseFloat(formActivo.kg_producidos_reales) || 0,
          kg_en_fundas:         parseFloat(formActivo.kg_en_fundas)         || 0,
          kg_picaditas:         parseFloat(formActivo.kg_picaditas)         || 0,
          merma_real:           mermaReal || 0,
          fundas:               formActivo.fundas,
          editado:              true,
          editado_por:          userRol?.nombre || 'Usuario',
          editado_at:           new Date().toISOString(),
        }).eq('id', formActivo.cierreId);

        // Reinsertar inventario corregido
        await insertarInventario(formActivo.cierreId);
        mostrarExito('✅ Cierre corregido y inventario actualizado');

      } else {
        // Nuevo cierre
        const { data: nuevoCierre } = await supabase
          .from('cierres_produccion').insert([{
            fecha:                fecha,
            produccion_id:        formActivo.produccion_id,
            producto_nombre:      formActivo.producto_nombre,
            kg_crudos_estimados:  formActivo.kg_crudos_estimados,
            kg_producidos_reales: parseFloat(formActivo.kg_producidos_reales) || 0,
            kg_en_fundas:         parseFloat(formActivo.kg_en_fundas)         || 0,
            kg_picaditas:         parseFloat(formActivo.kg_picaditas)         || 0,
            merma_estimada:       formActivo.merma_estimada,
            merma_real:           mermaReal || 0,
            fundas:               formActivo.fundas,
            usuario_nombre:       userRol?.nombre || 'Usuario',
            user_id:              currentUser?.id,
          }]).select().single();

        // Actualizar merma en config_productos
        if (mermaReal !== null) {
          await supabase.from('config_productos')
            .update({ merma: mermaReal })
            .eq('producto_nombre', formActivo.producto_nombre);
        }

        await insertarInventario(nuevoCierre.id);
        mostrarExito('✅ Cierre guardado y merma actualizada');
      }

      setFormActivo(null);
      await cargarDatos();
    } catch(err) {
      alert('Error: ' + err.message);
    }
    setGuardando(false);
  }

  async function insertarInventario(cierreId) {
    for (const f of formActivo.fundas) {
      if (!f.nombre_funda || !f.cantidad) continue;
      const kgTotal = (parseFloat(f.kg_por_funda) || 0) * (parseInt(f.cantidad) || 0);
      await supabase.from('inventario_produccion').insert([{
        fecha,
        producto_nombre:       formActivo.producto_nombre,
        nombre_funda:          f.nombre_funda,
        kg_por_funda:          parseFloat(f.kg_por_funda) || 0,
        cantidad:              parseInt(f.cantidad) || 0,
        kg_total:              kgTotal,
        tipo:                  'entrada',
        referencia:            'Cierre produccion',
        cierre_id:             cierreId,
      }]);
    }
  }

  const mermaReal    = calcularMermaReal();
  const mermaEstim   = formActivo ? (formActivo.merma_estimada * 100).toFixed(1) : 0;
  const mermaRealPct = mermaReal !== null ? (mermaReal * 100).toFixed(1) : null;
  const difMerma     = mermaReal !== null
    ? (parseFloat(mermaRealPct) - parseFloat(mermaEstim)).toFixed(1)
    : null;

  return (
    <div>
      {msgExito && (
        <div style={{
          background:'#d4edda', color:'#155724',
          padding:'10px 16px', borderRadius:'8px',
          marginBottom:'12px', fontWeight:'bold', fontSize:'13px'
        }}>{msgExito}</div>
      )}

      {/* Selector fecha */}
      <div style={{
        background:'white', borderRadius:'12px',
        padding:'12px 16px', marginBottom:'12px',
        border:'0.5px solid #e0e0e0',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <span style={{ fontSize:'13px', color:'#555' }}>Fecha de cierre</span>
        <input type="date" value={fecha}
          onChange={e => setFecha(e.target.value)}
          style={{
            padding:'6px 10px', border:'0.5px solid #ddd',
            borderRadius:'8px', fontSize:'13px'
          }}
        />
      </div>

      {/* Lista productos del día */}
      {prodDelDia.length === 0 ? (
        <div style={{
          textAlign:'center', padding:'40px', color:'#aaa',
          background:'white', borderRadius:'12px'
        }}>
          <div style={{ fontSize:'36px', marginBottom:'10px' }}>📋</div>
          <div>No hay producción registrada para esta fecha</div>
        </div>
      ) : (
        prodDelDia.map((prod, idx) => {
          const cierre     = getCierre(prod);
          const yaHayCierre = !!cierre;
          const esFormAbierto = formActivo?.produccion_id === prod.id ||
            formActivo?.producto_nombre === prod.producto_nombre;

          return (
            <div key={idx} style={{
              background:'white', borderRadius:'12px',
              border: yaHayCierre
                ? '1.5px solid #27ae60'
                : '0.5px solid #e0e0e0',
              marginBottom:'12px', overflow:'hidden'
            }}>
              {/* Header producto */}
              <div style={{
                background: yaHayCierre ? '#EAF3DE' : '#1a5276',
                padding:'10px 16px',
                display:'flex', justifyContent:'space-between', alignItems:'center'
              }}>
                <div>
                  <div style={{
                    fontWeight:'bold', fontSize:'13px',
                    color: yaHayCierre ? '#27500A' : 'white'
                  }}>
                    {prod.producto_nombre}
                  </div>
                  <div style={{
                    fontSize:'11px', marginTop:'2px',
                    color: yaHayCierre ? '#3B6D11' : '#aed6f1'
                  }}>
                    {prod.num_paradas} paradas ·
                    {parseFloat(prod.kg_total_crudo || 0).toFixed(2)} kg estimados
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  {yaHayCierre && (
                    <span style={{
                      background:'#27ae60', color:'white',
                      padding:'2px 8px', borderRadius:'20px', fontSize:'10px'
                    }}>cerrado</span>
                  )}
                  {!yaHayCierre && !esFormAbierto && (
                    <button onClick={() => abrirFormNuevo(prod)} style={{
                      padding:'6px 14px', background:'white',
                      color:'#1a5276', border:'none',
                      borderRadius:'7px', cursor:'pointer',
                      fontSize:'12px', fontWeight:'bold'
                    }}>+ Registrar cierre</button>
                  )}
                  {yaHayCierre && (
                    <button onClick={() => abrirFormEditar(cierre)} style={{
                      padding:'6px 14px', background:'white',
                      color:'#27500A', border:'1px solid #27ae60',
                      borderRadius:'7px', cursor:'pointer', fontSize:'12px'
                    }}>✏️ Editar</button>
                  )}
                </div>
              </div>

              {/* Resumen cierre guardado */}
              {yaHayCierre && !esFormAbierto && (
                <div style={{ padding:'12px 16px' }}>
                  <div style={{
                    display:'grid',
                    gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)',
                    gap:'8px', marginBottom:'10px'
                  }}>
                    {[
                      ['Kg producidos', parseFloat(cierre.kg_producidos_reales).toFixed(2) + ' kg', '#185FA5'],
                      ['Kg en fundas',  parseFloat(cierre.kg_en_fundas).toFixed(2) + ' kg',         '#27500A'],
                      ['Kg picaditas',  parseFloat(cierre.kg_picaditas).toFixed(2) + ' kg',          '#854F0B'],
                      ['Merma real',    (parseFloat(cierre.merma_real)*100).toFixed(1) + '%',         '#A32D2D'],
                    ].map(([l,v,c]) => (
                      <div key={l} style={{
                        background:'#f8f9fa', borderRadius:'8px',
                        padding:'8px 10px', textAlign:'center'
                      }}>
                        <div style={{ fontSize:'10px', color:'#888' }}>{l}</div>
                        <div style={{ fontSize:'15px', fontWeight:'bold', color:c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {/* Fundas guardadas */}
                  {cierre.fundas && cierre.fundas.length > 0 && (
                    <div style={{
                      fontSize:'12px', color:'#555',
                      background:'#f8f9fa', borderRadius:'8px', padding:'8px 10px'
                    }}>
                      <strong>Fundas:</strong>{' '}
                      {cierre.fundas.map((f,i) => (
                        <span key={i} style={{ marginRight:'12px' }}>
                          {f.nombre_funda} {f.kg_por_funda}kg × {f.cantidad} und
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Formulario cierre */}
              {esFormAbierto && (
                <div style={{ padding:'14px 16px' }}>

                  {/* Inputs principales */}
                  <div style={{ marginBottom:'12px' }}>
                    <div style={{
                      fontSize:'11px', fontWeight:'bold',
                      color:'#555', marginBottom:'8px'
                    }}>DATOS REALES</div>
                    {[
                      ['Kg producidos reales', 'kg_producidos_reales'],
                      ['Kg en fundas (total empacado)', 'kg_en_fundas'],
                      ['Kg picaditas (venta aparte)', 'kg_picaditas'],
                    ].map(([label, campo]) => (
                      <div key={campo} style={{
                        display:'flex', justifyContent:'space-between',
                        alignItems:'center', padding:'7px 0',
                        borderBottom:'0.5px solid #f0f0f0', fontSize:'13px'
                      }}>
                        <span style={{ color:'#555' }}>{label}</span>
                        <input
                          type="number" step="0.01"
                          value={formActivo[campo]}
                          onChange={e => setFormActivo(p => ({
                            ...p, [campo]: e.target.value
                          }))}
                          style={{
                            width:'90px', padding:'5px 8px', textAlign:'right',
                            border:'0.5px solid #ddd', borderRadius:'7px',
                            fontSize:'13px'
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Fundas */}
                  <div style={{ marginBottom:'12px' }}>
                    <div style={{
                      display:'flex', justifyContent:'space-between',
                      alignItems:'center', marginBottom:'8px'
                    }}>
                      <div style={{
                        fontSize:'11px', fontWeight:'bold', color:'#555'
                      }}>FUNDAS</div>
                      <span style={{
                        fontSize:'11px', color:'#888', fontStyle:'italic'
                      }}>
                        Para nuevas presentaciones agrega fundas en la fórmula del producto
                      </span>
                    </div>

                    {formActivo.fundas.length === 0 ? (
                      <div style={{
                        textAlign:'center', padding:'16px',
                        color:'#aaa', fontSize:'12px',
                        border:'0.5px dashed #ddd', borderRadius:'8px'
                      }}>
                        Sin fundas — presiona "+ Agregar funda"
                      </div>
                    ) : (
                      <div style={{
                        border:'0.5px solid #e0e0e0',
                        borderRadius:'8px', overflow:'hidden'
                      }}>
                        <div style={{
                          display:'grid',
                          gridTemplateColumns:'1fr 80px 80px 70px 32px',
                          gap:'6px', padding:'6px 10px',
                          background:'#f8f9fa',
                          fontSize:'10px', color:'#888', fontWeight:'600'
                        }}>
                          <span>Nombre funda</span>
                          <span style={{textAlign:'right'}}>Kg/funda</span>
                          <span style={{textAlign:'right'}}>Cantidad</span>
                          <span style={{textAlign:'right'}}>Kg total</span>
                          <span></span>
                        </div>
                        {formActivo.fundas.map((f, i) => (
                          <div key={i} style={{
                            display:'grid',
                            gridTemplateColumns:'1fr 80px 80px 70px 32px',
                            gap:'6px', padding:'7px 10px',
                            alignItems:'center',
                            borderTop:'0.5px solid #f0f0f0'
                          }}>
                            <span style={{
                                padding:'5px 7px', fontSize:'12px',
                                color:'#1a1a2e', fontWeight:'500'
                              }}>
                                {f.nombre_funda || '—'}
                              </span>
                            <input type="number" step="0.1"
                              value={f.kg_por_funda}
                              onChange={e => actualizarFunda(i,'kg_por_funda',e.target.value)}
                              style={{
                                width:'100%', padding:'5px', textAlign:'right',
                                border:'0.5px solid #ddd', borderRadius:'6px', fontSize:'12px'
                              }}
                            />
                            <input type="number"
                              value={f.cantidad}
                              onChange={e => actualizarFunda(i,'cantidad',e.target.value)}
                              style={{
                                width:'100%', padding:'5px', textAlign:'right',
                                border:'0.5px solid #ddd', borderRadius:'6px', fontSize:'12px'
                              }}
                            />
                            <span style={{
                              textAlign:'right', fontSize:'12px',
                              fontWeight:'bold', color:'#27500A'
                            }}>
                              {((parseFloat(f.kg_por_funda)||0)*(parseInt(f.cantidad)||0)).toFixed(1)} kg
                            </span>
                            <button onClick={() => eliminarFunda(i)} style={{
                              background:'#FCEBEB', color:'#A32D2D',
                              border:'0.5px solid #F09595',
                              borderRadius:'6px', cursor:'pointer',
                              fontSize:'11px', padding:'4px 6px'
                            }}>✕</button>
                          </div>
                        ))}
                        <div style={{
                          display:'grid',
                          gridTemplateColumns:'1fr 80px 80px 70px 32px',
                          gap:'6px', padding:'7px 10px',
                          background:'#f8f9fa',
                          borderTop:'0.5px solid #e0e0e0'
                        }}>
                          <span style={{fontWeight:'bold',fontSize:'12px'}}>Total</span>
                          <span></span>
                          <span style={{
                            textAlign:'right',fontWeight:'bold',
                            color:'#185FA5',fontSize:'12px'
                          }}>{totalFundas()} und</span>
                          <span style={{
                            textAlign:'right',fontWeight:'bold',
                            color:'#27500A',fontSize:'12px'
                          }}>{totalKgFundas().toFixed(1)} kg</span>
                          <span></span>
                        </div>
                      </div>
                    )}

                    {/* Validacion */}
                    {formActivo.fundas.length > 0 && formActivo.kg_en_fundas && (
                      <div style={{
                        marginTop:'6px', fontSize:'11px', padding:'5px 10px',
                        borderRadius:'7px',
                        background: validarFundas() ? '#EAF3DE' : '#FCEBEB',
                        color: validarFundas() ? '#27500A' : '#A32D2D'
                      }}>
                        {validarFundas()
                          ? `✅ Total fundas (${totalKgFundas().toFixed(1)} kg) coincide con kg en fundas`
                          : `⚠️ Total fundas (${totalKgFundas().toFixed(1)} kg) no coincide con kg en fundas (${formActivo.kg_en_fundas} kg)`
                        }
                      </div>
                    )}
                  </div>

                  {/* Merma calculada */}
                  {mermaRealPct !== null && (
                    <div style={{
                      background:'#EAF3DE', borderRadius:'8px',
                      padding:'10px 14px', marginBottom:'12px'
                    }}>
                      <div style={{
                        fontSize:'10px', fontWeight:'bold',
                        color:'#3B6D11', marginBottom:'6px'
                      }}>MERMA CALCULADA</div>
                      <div style={{
                        display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px'
                      }}>
                        {[
                          ['Estimada', mermaEstim + '%', '#555'],
                          ['Real',     mermaRealPct + '%', '#27500A'],
                          ['Diferencia', (difMerma > 0 ? '+' : '') + difMerma + '%',
                            parseFloat(difMerma) > 0 ? '#A32D2D' : '#27500A'],
                        ].map(([l,v,c]) => (
                          <div key={l} style={{ textAlign:'center' }}>
                            <div style={{ fontSize:'10px', color:'#3B6D11' }}>{l}</div>
                            <div style={{ fontSize:'16px', fontWeight:'bold', color:c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{
                        marginTop:'8px', fontSize:'11px', color:'#3B6D11',
                        background:'#C0DD97', borderRadius:'6px', padding:'5px 8px'
                      }}>
                        Al guardar se actualizará la merma del producto a {mermaRealPct}%
                      </div>
                    </div>
                  )}

                  {/* Botones */}
                  <div style={{ display:'flex', gap:'8px' }}>
                    <button onClick={() => setFormActivo(null)} style={{
                      flex:1, padding:'10px',
                      background:'white', border:'0.5px solid #ddd',
                      borderRadius:'8px', cursor:'pointer',
                      fontSize:'13px', color:'#555'
                    }}>Cancelar</button>
                    <button
                      onClick={guardarCierre}
                      disabled={guardando}
                      style={{
                        flex:2, padding:'10px',
                        background: formActivo.esEdicion ? '#E24B4A' : '#27ae60',
                        color:'white', border:'none',
                        borderRadius:'8px', cursor:'pointer',
                        fontSize:'13px', fontWeight:'bold'
                      }}>
                      {guardando ? 'Guardando...' :
                        formActivo.esEdicion ? '✅ Guardar corrección' : '✅ Guardar cierre'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}