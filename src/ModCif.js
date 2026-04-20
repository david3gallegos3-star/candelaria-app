import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const isMobile = () => window.innerWidth < 700;

// Normalizar: quita tildes y pasa a minúsculas
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export default function ModCif({ onVolver, onVolverMenu, mostrarExito }) {
  const [produccionKg, setProduccionKg] = useState(13600);
  const [modDirecta, setModDirecta]     = useState([]);
  const [modIndirecta, setModIndirecta] = useState([]);
  const [cifItems, setCifItems]         = useState([]);
  const [cargando, setCargando]         = useState(true);
  const [guardando, setGuardando]       = useState(false);
  const [modalFila, setModalFila]       = useState(null);
  const [mobile, setMobile]             = useState(isMobile());
  const [tabMobile, setTabMobile]       = useState('directa');

  useEffect(() => {
    cargar();
    const onResize = () => setMobile(isMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function cargar() {
    setCargando(true);
    const [{ data: cfg }, { data: md }, { data: mi }, { data: ci }] = await Promise.all([
      supabase.from('costos_mod_cif').select('*').single(),
      supabase.from('mod_directa').select('*').order('orden'),
      supabase.from('mod_indirecta').select('*').order('orden'),
      supabase.from('cif_items').select('*').order('orden'),
    ]);
    if (cfg) setProduccionKg(cfg.produccion_kg || 13600);
    setModDirecta(md || []);
    setModIndirecta(mi || []);
    setCifItems(ci || []);
    setCargando(false);
  }

  const calcKg = (sueldo, prod) => prod > 0 ? (parseFloat(sueldo) || 0) / prod : 0;

  const totalMOD_mes  = modDirecta.reduce((s, r) => s + (parseFloat(r.sueldo_mes) || 0), 0);
  const totalMOI_mes  = modIndirecta.reduce((s, r) => s + (parseFloat(r.sueldo_mes) || 0), 0);
  const totalMO_mes   = totalMOD_mes + totalMOI_mes;
  const totalMO_kg    = produccionKg > 0 ? totalMO_mes / produccionKg : 0;
  const totalCIF_mes  = cifItems.reduce((s, r) => s + (parseFloat(r.valor_mes) || 0), 0);
  const totalCIF_kg   = produccionKg > 0 ? totalCIF_mes / produccionKg : 0;
  const costoMOCIF_kg = totalMO_kg + totalCIF_kg;

  async function guardarTodo() {
    setGuardando(true);
    await supabase.from('costos_mod_cif').update({
      produccion_kg: parseFloat(produccionKg) || 0,
      updated_at: new Date().toISOString()
    }).eq('id', 1);

    for (const r of modDirecta) {
      if (r.id) await supabase.from('mod_directa').update({
        nombre: r.nombre, horas_mes: parseFloat(r.horas_mes)||0,
        sueldo_mes: parseFloat(r.sueldo_mes)||0,
        costo_kg: calcKg(r.sueldo_mes, produccionKg)
      }).eq('id', r.id);
    }
    for (const r of modIndirecta) {
      if (r.id) await supabase.from('mod_indirecta').update({
        nombre: r.nombre, horas_mes: parseFloat(r.horas_mes)||0,
        sueldo_mes: parseFloat(r.sueldo_mes)||0,
        costo_kg: calcKg(r.sueldo_mes, produccionKg)
      }).eq('id', r.id);
    }
    for (const r of cifItems) {
      if (r.id) await supabase.from('cif_items').update({
        detalle: r.detalle, valor_mes: parseFloat(r.valor_mes)||0,
        porcentaje_merma: parseFloat(r.porcentaje_merma)||0,
        costo_kg: produccionKg > 0 ? (parseFloat(r.valor_mes)||0) / produccionKg : 0
      }).eq('id', r.id);
    }

    await supabase.from('config_productos').update({ mod_cif_kg: costoMOCIF_kg });

    // Sincronizar precio_kg de Agua/hielo y Hielo con el costo calculado del CIF de agua
    const itemAgua = cifItems.find(c => norm(c.detalle) === 'agua');
    if (itemAgua && produccionKg > 0) {
      const precioAgua = (parseFloat(itemAgua.valor_mes) || 0) / produccionKg;
      await supabase.from('materias_primas')
        .update({ precio_kg: precioAgua })
        .in('id', ['AG01', 'AG03']);
    }

    setGuardando(false);
    if (mostrarExito) mostrarExito(`✅ MOD+CIF = $${costoMOCIF_kg.toFixed(4)}/kg sincronizado en todas las fórmulas`);
  }

  // ── CORREGIDO: guardarFila con manejo explícito de errores ──
  async function guardarFila() {
    const d = modalFila.data;
    const tabla = modalFila.tipo === 'directa' ? 'mod_directa'
      : modalFila.tipo === 'indirecta' ? 'mod_indirecta'
      : 'cif_items';

    try {
      if (modalFila.modo === 'nuevo') {
        let payload;
        if (modalFila.tipo === 'cif') {
          // Calcular el siguiente orden
          const maxOrden = cifItems.length > 0 ? Math.max(...cifItems.map(c => c.orden || 0)) + 1 : 0;
          payload = {
            detalle: d.detalle || '',
            valor_mes: parseFloat(d.valor_mes) || 0,
            porcentaje_merma: parseFloat(d.porcentaje_merma) || 0,
            costo_kg: produccionKg > 0 ? (parseFloat(d.valor_mes) || 0) / produccionKg : 0,
            orden: maxOrden
          };
        } else {
          const lista = modalFila.tipo === 'directa' ? modDirecta : modIndirecta;
          const maxOrden = lista.length > 0 ? Math.max(...lista.map(c => c.orden || 0)) + 1 : 0;
          payload = {
            nombre: d.nombre || '',
            horas_mes: parseFloat(d.horas_mes) || 240,
            sueldo_mes: parseFloat(d.sueldo_mes) || 0,
            costo_kg: calcKg(d.sueldo_mes, produccionKg),
            orden: maxOrden
          };
        }

        const { error } = await supabase.from(tabla).insert([payload]);
        if (error) {
          console.error('Error insertando:', error);
          alert('Error al guardar: ' + error.message);
          return;
        }
      } else {
        // Modo editar
        let payload;
        if (modalFila.tipo === 'cif') {
          payload = {
            detalle: d.detalle,
            valor_mes: parseFloat(d.valor_mes) || 0,
            porcentaje_merma: parseFloat(d.porcentaje_merma) || 0,
            costo_kg: produccionKg > 0 ? (parseFloat(d.valor_mes) || 0) / produccionKg : 0
          };
        } else {
          payload = {
            nombre: d.nombre,
            horas_mes: parseFloat(d.horas_mes) || 0,
            sueldo_mes: parseFloat(d.sueldo_mes) || 0,
            costo_kg: calcKg(d.sueldo_mes, produccionKg)
          };
        }
        const { error } = await supabase.from(tabla).update(payload).eq('id', d.id);
        if (error) {
          console.error('Error actualizando:', error);
          alert('Error al actualizar: ' + error.message);
          return;
        }
      }
    } catch (e) {
      console.error('Error en guardarFila:', e);
      alert('Error inesperado: ' + e.message);
      return;
    }

    setModalFila(null);
    await cargar();
    if (mostrarExito) mostrarExito('✅ Guardado correctamente');
  }

  async function eliminarFila(tipo, id) {
    if (!window.confirm('¿Eliminar esta fila?')) return;
    const tabla = tipo === 'directa' ? 'mod_directa' : tipo === 'indirecta' ? 'mod_indirecta' : 'cif_items';
    const { error } = await supabase.from(tabla).delete().eq('id', id);
    if (error) { alert('Error al eliminar: ' + error.message); return; }
    await cargar();
  }

  const inp  = { padding: mobile ? '10px' : '8px', borderRadius:7, border:'1.5px solid #ddd', fontSize:13, width:'100%', boxSizing:'border-box' };
  const btnS = { border:'none', borderRadius:7, cursor:'pointer', fontWeight:'bold', fontSize:13 };

  const TablaPersonal = ({ titulo, color, lista, tipo }) => (
    <div style={{ background:'white', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 6px rgba(0,0,0,0.08)', marginBottom:14 }}>
      <div style={{ background:color, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ color:'white', fontWeight:'bold', fontSize:mobile?13:14 }}>{titulo}</span>
        <button onClick={() => setModalFila({ tipo, modo:'nuevo', data:{ nombre:'', horas_mes:240, sueldo_mes:0 } })}
          style={{ ...btnS, background:'#27ae60', color:'white', padding:mobile?'7px 12px':'6px 14px', fontSize:12 }}>
          + Agregar
        </button>
      </div>

      {mobile ? (
        <div style={{ padding:'8px 10px' }}>
          {lista.length === 0 && <div style={{ textAlign:'center', color:'#aaa', padding:20, fontSize:13 }}>Sin registros. Presiona + Agregar</div>}
          {lista.map((r, i) => (
            <div key={r.id} style={{ background:i%2===0?'#f8f9fa':'white', borderRadius:8, padding:'10px 12px', marginBottom:6, border:'1px solid #eee' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <span style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:13 }}>{r.nombre}</span>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setModalFila({ tipo, modo:'editar', data:{...r} })} style={{ ...btnS, background:'#3498db', color:'white', padding:'4px 10px', fontSize:11 }}>✏️</button>
                  <button onClick={() => eliminarFila(tipo, r.id)} style={{ ...btnS, background:'#e74c3c', color:'white', padding:'4px 10px', fontSize:11 }}>🗑️</button>
                </div>
              </div>
              <div style={{ display:'flex', gap:12, fontSize:12, color:'#555' }}>
                <span>⏱ {r.horas_mes} h/mes</span>
                <span style={{ color:'#27ae60', fontWeight:'bold' }}>💰 ${parseFloat(r.sueldo_mes||0).toFixed(2)}/mes</span>
                <span style={{ color:'#e74c3c' }}>📦 ${calcKg(r.sueldo_mes, produccionKg).toFixed(4)}/kg</span>
              </div>
            </div>
          ))}
          <div style={{ background:'#e8f5e9', borderRadius:8, padding:'8px 12px', marginTop:4, display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontWeight:'bold', fontSize:12 }}>TOTAL</span>
            <div style={{ display:'flex', gap:12 }}>
              <span style={{ color:'#27ae60', fontWeight:'bold', fontSize:12 }}>${lista.reduce((s,r)=>s+(parseFloat(r.sueldo_mes)||0),0).toFixed(2)}/mes</span>
              <span style={{ color:'#e74c3c', fontWeight:'bold', fontSize:12 }}>${(lista.reduce((s,r)=>s+(parseFloat(r.sueldo_mes)||0),0)/(produccionKg||1)).toFixed(4)}/kg</span>
            </div>
          </div>
        </div>
      ) : (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:color+'cc' }}>
            {['N°','NOMBRE / ROL','H/MES','$/MES','$/KG','ACCIONES'].map(h=>(
              <th key={h} style={{ padding:'8px 10px', color:'white', fontSize:11, fontWeight:'bold', textAlign:'left' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {lista.map((r,i)=>(
              <tr key={r.id} style={{ background:i%2===0?'#fafafa':'white', borderBottom:'1px solid #f0f0f0' }}>
                <td style={{ padding:'7px 10px', fontSize:12 }}>{r.numero||i+1}</td>
                <td style={{ padding:'7px 10px', fontSize:12 }}>{r.nombre}</td>
                <td style={{ padding:'7px 10px', fontSize:12 }}>{r.horas_mes}</td>
                <td style={{ padding:'7px 10px', fontSize:12, color:'#27ae60', fontWeight:'bold' }}>${parseFloat(r.sueldo_mes||0).toFixed(2)}</td>
                <td style={{ padding:'7px 10px', fontSize:12, color:'#e74c3c', fontWeight:'bold' }}>${calcKg(r.sueldo_mes, produccionKg).toFixed(4)}</td>
                <td style={{ padding:'7px 10px' }}>
                  <button onClick={()=>setModalFila({tipo,modo:'editar',data:{...r}})} style={{ ...btnS, background:'#3498db', color:'white', padding:'4px 10px', fontSize:11, marginRight:6 }}>✏️</button>
                  <button onClick={()=>eliminarFila(tipo,r.id)} style={{ ...btnS, background:'#e74c3c', color:'white', padding:'4px 10px', fontSize:11 }}>🗑️</button>
                </td>
              </tr>
            ))}
            <tr style={{ background:'#e8f5e9', fontWeight:'bold' }}>
              <td colSpan={3} style={{ padding:'7px 10px', fontSize:12 }}>TOTAL</td>
              <td style={{ padding:'7px 10px', fontSize:12, color:'#27ae60', fontWeight:'bold' }}>${lista.reduce((s,r)=>s+(parseFloat(r.sueldo_mes)||0),0).toFixed(2)}</td>
              <td style={{ padding:'7px 10px', fontSize:12, color:'#e74c3c', fontWeight:'bold' }}>${(lista.reduce((s,r)=>s+(parseFloat(r.sueldo_mes)||0),0)/(produccionKg||1)).toFixed(4)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );

  const TablaCIF = () => (
    <div style={{ background:'white', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 6px rgba(0,0,0,0.08)', marginBottom:14 }}>
      <div style={{ background:'#c0392b', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'nowrap', gap:8 }}>
        <span style={{ color:'white', fontWeight:'bold', fontSize:mobile?12:14, flex:1, minWidth:0 }}>
          🏭 {mobile ? 'CIF' : 'Costos Indirectos de Fabricación (CIF)'}
        </span>
        <button onClick={()=>setModalFila({tipo:'cif',modo:'nuevo',data:{detalle:'',valor_mes:0,porcentaje_merma:0}})}
          style={{ ...btnS, background:'#27ae60', color:'white', padding:mobile?'7px 12px':'6px 14px', fontSize:12, flexShrink:0 }}>
          + Agregar
        </button>
      </div>

      {mobile ? (
        <div style={{ padding:'8px 10px' }}>
          {cifItems.length === 0 && <div style={{ textAlign:'center', color:'#aaa', padding:20, fontSize:13 }}>Sin ítems CIF. Presiona + Agregar</div>}
          {cifItems.map((r,i)=>(
            <div key={r.id} style={{ background:i%2===0?'#fdf2f2':'white', borderRadius:8, padding:'10px 12px', marginBottom:6, border:'1px solid #f5c6c6' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:13, flex:1, minWidth:0 }}>{r.detalle}</span>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={()=>setModalFila({tipo:'cif',modo:'editar',data:{...r}})} style={{ ...btnS, background:'#3498db', color:'white', padding:'4px 10px', fontSize:11 }}>✏️</button>
                  <button onClick={()=>eliminarFila('cif',r.id)} style={{ ...btnS, background:'#e74c3c', color:'white', padding:'4px 10px', fontSize:11 }}>🗑️</button>
                </div>
              </div>
              <div style={{ fontSize:12, color:'#e67e22', fontWeight:'bold', marginTop:3 }}>
                ${parseFloat(r.valor_mes||0).toFixed(2)}/mes · {r.porcentaje_merma}% merma · ${(parseFloat(r.valor_mes||0)/(produccionKg||1)).toFixed(4)}/kg
              </div>
            </div>
          ))}
          <div style={{ background:'#fde8e8', borderRadius:8, padding:'8px 12px', marginTop:4, display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontWeight:'bold', fontSize:12 }}>TOTAL CIF</span>
            <div style={{ display:'flex', gap:12 }}>
              <span style={{ color:'#c0392b', fontWeight:'bold', fontSize:12 }}>${totalCIF_mes.toFixed(2)}/mes</span>
              <span style={{ color:'#e74c3c', fontWeight:'bold', fontSize:12 }}>${totalCIF_kg.toFixed(4)}/kg</span>
            </div>
          </div>
        </div>
      ) : (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'#c0392bcc' }}>
            {['DETALLE / CONCEPTO','$/MES','% MERMA','$/KG','ACCIONES'].map(h=>(
              <th key={h} style={{ padding:'8px 10px', color:'white', fontSize:11, fontWeight:'bold', textAlign:'left' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {cifItems.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:30, color:'#aaa', fontSize:13 }}>Sin ítems CIF. Presiona + Agregar para agregar el primero.</td></tr>
            )}
            {cifItems.map((r,i)=>(
              <tr key={r.id} style={{ background:i%2===0?'#fdf2f2':'white', borderBottom:'1px solid #f0f0f0' }}>
                <td style={{ padding:'7px 10px', fontSize:12 }}>{r.detalle}</td>
                <td style={{ padding:'7px 10px', fontSize:12, color:'#e67e22', fontWeight:'bold' }}>${parseFloat(r.valor_mes||0).toFixed(2)}</td>
                <td style={{ padding:'7px 10px', fontSize:12 }}>{r.porcentaje_merma}%</td>
                <td style={{ padding:'7px 10px', fontSize:12, color:'#c0392b', fontWeight:'bold' }}>${(parseFloat(r.valor_mes||0)/(produccionKg||1)).toFixed(4)}</td>
                <td style={{ padding:'7px 10px' }}>
                  <button onClick={()=>setModalFila({tipo:'cif',modo:'editar',data:{...r}})} style={{ ...btnS, background:'#3498db', color:'white', padding:'4px 10px', fontSize:11, marginRight:6 }}>✏️</button>
                  <button onClick={()=>eliminarFila('cif',r.id)} style={{ ...btnS, background:'#e74c3c', color:'white', padding:'4px 10px', fontSize:11 }}>🗑️</button>
                </td>
              </tr>
            ))}
            <tr style={{ background:'#fde8e8', fontWeight:'bold' }}>
              <td style={{ padding:'7px 10px', fontSize:12 }}>TOTAL CIF</td>
              <td style={{ padding:'7px 10px', fontSize:12, color:'#c0392b', fontWeight:'bold' }}>${totalCIF_mes.toFixed(2)}</td>
              <td></td>
              <td style={{ padding:'7px 10px', fontSize:12, color:'#c0392b', fontWeight:'bold' }}>${totalCIF_kg.toFixed(4)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );

  if (cargando) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f2f5' }}>
      <div style={{ textAlign:'center', color:'#888' }}>⏳ Cargando...</div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial' }}>
      <div style={{ background:'linear-gradient(135deg,#1a1a2e,#16213e)', padding:mobile?'10px 12px':'14px 24px', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap' }}>
          <button onClick={onVolverMenu} style={{ ...btnS, background:'rgba(255,200,0,0.3)', border:'1px solid rgba(255,200,0,0.5)', color:'#ffd700', padding:mobile?'8px 10px':'7px 14px', fontSize:mobile?11:13, flexShrink:0 }}>
            🏠{mobile?'':' Menú'}
          </button>
          <button onClick={onVolver} style={{ ...btnS, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'white', padding:mobile?'8px 10px':'7px 14px', fontSize:mobile?11:13, flexShrink:0 }}>
            ←{mobile?'':' Volver'}
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'white', fontWeight:'bold', fontSize:mobile?13:17, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>⚙️ Costos MOD + CIF</div>
            {!mobile&&<div style={{ color:'#aaa', fontSize:11 }}>Mano de Obra + Costos Indirectos</div>}
          </div>
          <button onClick={guardarTodo} disabled={guardando} style={{ ...btnS, padding:mobile?'8px 10px':'9px 18px', background:'#27ae60', color:'white', fontSize:mobile?11:14, flexShrink:0 }}>
            {guardando?'⏳':(mobile?'💾':'💾 Guardar y Sincronizar')}
          </button>
        </div>
      </div>

      <div style={{ padding:mobile?'10px':'20px 24px' }}>
        <div style={{ background:'linear-gradient(135deg,#1a1a2e,#16213e)', borderRadius:12, padding:mobile?12:16, marginBottom:14, boxShadow:'0 2px 10px rgba(0,0,0,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <label style={{ color:'#aaa', fontSize:12, whiteSpace:'nowrap' }}>🏭 Producción (kg/mes):</label>
            <input type="number" value={produccionKg} onChange={e=>setProduccionKg(e.target.value)}
              style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'none', fontSize:mobile?16:18, fontWeight:'bold', textAlign:'center', color:'#1a1a2e', maxWidth:200 }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:mobile?'1fr 1fr':'repeat(4,1fr)', gap:8 }}>
            {[
              ['MO $/mes',  `$${totalMO_mes.toFixed(2)}`,  '#3498db'],
              ['MO $/kg',   `$${totalMO_kg.toFixed(4)}`,   '#9b59b6'],
              ['CIF $/mes', `$${totalCIF_mes.toFixed(2)}`,  '#e67e22'],
              ['CIF $/kg',  `$${totalCIF_kg.toFixed(4)}`,   '#e74c3c'],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:'rgba(255,255,255,0.08)', borderRadius:8, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'#aaa', fontWeight:700 }}>{l}</div>
                <div style={{ fontSize:mobile?14:16, fontWeight:'bold', color:c }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ background:'#27ae60', borderRadius:10, padding:mobile?'10px 12px':'12px 16px', marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'white', fontWeight:'bold', fontSize:mobile?12:14 }}>💰 COSTO MO+CIF/KG → se sincroniza en todas las fórmulas</span>
            <span style={{ color:'white', fontWeight:'bold', fontSize:mobile?18:22 }}>${costoMOCIF_kg.toFixed(4)}</span>
          </div>
        </div>

        {mobile && (
          <div style={{ display:'flex', background:'white', borderRadius:10, padding:4, marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', gap:4 }}>
            {[['directa','👷 MOD'],['indirecta','👔 MOI'],['cif','🏭 CIF']].map(([key,label])=>(
              <button key={key} onClick={()=>setTabMobile(key)}
                style={{ flex:1, padding:'9px 4px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:'bold',
                  background: tabMobile===key ? '#1a1a2e' : 'transparent',
                  color: tabMobile===key ? 'white' : '#666', transition:'all 0.2s' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {mobile ? (
          <>
            {tabMobile === 'directa'   && <TablaPersonal titulo="👷 Mano de Obra Directa"   color="#1a5276" lista={modDirecta}   tipo="directa"/>}
            {tabMobile === 'indirecta' && <TablaPersonal titulo="👔 Mano de Obra Indirecta" color="#6c3483" lista={modIndirecta} tipo="indirecta"/>}
            {tabMobile === 'cif'       && <TablaCIF/>}
          </>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <TablaPersonal titulo="👷 Mano de Obra Directa"   color="#1a5276" lista={modDirecta}   tipo="directa"/>
              <TablaPersonal titulo="👔 Mano de Obra Indirecta" color="#6c3483" lista={modIndirecta} tipo="indirecta"/>
            </div>
            <div>
              <TablaCIF/>
            </div>
          </div>
        )}
      </div>

      {/* MODAL AGREGAR/EDITAR */}
      {modalFila && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:mobile?'flex-end':'center', justifyContent:'center', zIndex:3000 }}>
          <div style={{ background:'white', padding:24, borderRadius:mobile?'16px 16px 0 0':14, width:mobile?'100%':420, boxShadow:'0 -4px 30px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin:'0 0 16px', color:'#1a1a2e', fontSize:15 }}>
              {modalFila.modo==='nuevo'?'➕':'✏️'} {modalFila.tipo==='cif'?'Item CIF':'Personal'}
            </h3>
            {modalFila.tipo === 'cif' ? (
              <>
                <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:4 }}>Detalle / Concepto *</label>
                <input
                  value={modalFila.data.detalle}
                  onChange={e=>setModalFila(p=>({...p,data:{...p.data,detalle:e.target.value}}))}
                  placeholder="Ej: Electricidad, Gas, Agua..."
                  style={{ ...inp, marginBottom:12, border: '1.5px solid #3498db' }}
                  autoFocus
                />
                <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:4 }}>$ / Mes *</label>
                <input type="number" value={modalFila.data.valor_mes}
                  onChange={e=>setModalFila(p=>({...p,data:{...p.data,valor_mes:e.target.value}}))}
                  style={{ ...inp, marginBottom:12 }}/>
                <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:4 }}>% Merma</label>
                <input type="number" value={modalFila.data.porcentaje_merma}
                  onChange={e=>setModalFila(p=>({...p,data:{...p.data,porcentaje_merma:e.target.value}}))}
                  style={inp}/>
                {modalFila.data.valor_mes > 0 && (
                  <div style={{ marginTop:10, padding:10, background:'#fde8e8', borderRadius:8, fontSize:12, color:'#c0392b' }}>
                    $/KG calculado: <strong>${(parseFloat(modalFila.data.valor_mes) / (produccionKg||1)).toFixed(4)}</strong>
                  </div>
                )}
              </>
            ) : (
              <>
                <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:4 }}>Nombre / Rol *</label>
                <input value={modalFila.data.nombre}
                  onChange={e=>setModalFila(p=>({...p,data:{...p.data,nombre:e.target.value}}))}
                  placeholder="Ej: Operario de producción"
                  style={{ ...inp, marginBottom:12, border:'1.5px solid #3498db' }}
                  autoFocus
                />
                <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:4 }}>Horas/mes</label>
                <input type="number" value={modalFila.data.horas_mes}
                  onChange={e=>setModalFila(p=>({...p,data:{...p.data,horas_mes:e.target.value}}))}
                  style={{ ...inp, marginBottom:12 }}/>
                <label style={{ fontSize:12, fontWeight:'bold', color:'#555', display:'block', marginBottom:4 }}>$ / Mes</label>
                <input type="number" value={modalFila.data.sueldo_mes}
                  onChange={e=>setModalFila(p=>({...p,data:{...p.data,sueldo_mes:e.target.value}}))}
                  style={inp}/>
                <div style={{ marginTop:10, padding:10, background:'#e8f5e9', borderRadius:8, fontSize:12, color:'#27ae60' }}>
                  $/KG calculado: <strong>${calcKg(modalFila.data.sueldo_mes, produccionKg).toFixed(4)}</strong>
                </div>
              </>
            )}
            <div style={{ display:'flex', gap:10, marginTop:18, justifyContent:'flex-end' }}>
              <button onClick={()=>setModalFila(null)} style={{ ...btnS, padding:'10px 20px', background:'#95a5a6', color:'white' }}>Cancelar</button>
              <button onClick={guardarFila} style={{ ...btnS, padding:'10px 20px', background:'#27ae60', color:'white' }}>
                {modalFila.modo === 'nuevo' ? '✅ Agregar' : '✅ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
