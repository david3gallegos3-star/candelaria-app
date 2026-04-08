import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

const isMobile = () => window.innerWidth < 700;

export default function HistorialMP({ onVolver, onVolverMenu, mostrarExito }) {
  const [historial, setHistorial]         = useState([]);
  const [cargando, setCargando]           = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [editandoId, setEditandoId]       = useState(null);
  const [editData, setEditData]           = useState({});
  const [categoriasMp, setCategoriasMp]   = useState([]);
  const [importando, setImportando]       = useState(false);
  const [mobile, setMobile]               = useState(isMobile());
  const [filtros, setFiltros] = useState({ fechaDes:'', fechaHas:'', categoria:'TODAS', texto:'' });
  const fileRef = useRef();

  useEffect(() => {
    cargarCategorias();
    buscar();
    const onResize = () => setMobile(isMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function cargarCategorias() {
    const { data } = await supabase.from('categorias_mp').select('nombre').order('orden');
    setCategoriasMp((data||[]).map(c=>c.nombre));
  }

  async function buscar() {
    setCargando(true);
    let q = supabase.from('historial_materias_primas').select('*').order('created_at', { ascending:false });
    if (filtros.fechaDes) q = q.gte('fecha', filtros.fechaDes);
    if (filtros.fechaHas) q = q.lte('fecha', filtros.fechaHas);
    if (filtros.categoria !== 'TODAS') q = q.eq('categoria', filtros.categoria);
    if (filtros.texto) q = q.or(`nombre.ilike.%${filtros.texto}%,proveedor.ilike.%${filtros.texto}%,mp_id.ilike.%${filtros.texto}%`);
    const { data } = await q.limit(1000);
    setHistorial(data||[]);
    setSeleccionados(new Set());
    setCargando(false);
  }

  function toggleSel(id) { setSeleccionados(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function toggleTodos() { if(seleccionados.size===historial.length) setSeleccionados(new Set()); else setSeleccionados(new Set(historial.map(h=>h.id))); }

  async function eliminarSeleccionados() {
    if (seleccionados.size===0) return;
    if (!window.confirm(`Eliminar ${seleccionados.size} registros?`)) return;
    await supabase.from('historial_materias_primas').delete().in('id',[...seleccionados]);
    mostrarExito(`Eliminados ${seleccionados.size} registros`);
    await buscar();
  }

  async function guardarEdicion() {
    await supabase.from('historial_materias_primas').update({
      fecha:editData.fecha, mp_id:editData.mp_id, categoria:editData.categoria,
      nombre:editData.nombre, proveedor:editData.proveedor,
      precio_kg:parseFloat(editData.precio_kg)||0,
      precio_gr:parseFloat(editData.precio_gr)||0,
      notas:editData.notas
    }).eq('id',editandoId);
    setEditandoId(null);
    mostrarExito('Registro actualizado');
    await buscar();
  }

  async function descargarExcel() {
    const XLSX = await import('xlsx');
    const datos = historial.map(h=>({ 'Fecha':h.fecha,'ID':h.mp_id,'Categoria':h.categoria,'Nombre':h.nombre,'Proveedor':h.proveedor,'$/KG':parseFloat(h.precio_kg||0).toFixed(4),'$/GR':parseFloat(h.precio_gr||0).toFixed(6),'Notas':h.notas }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial MP');
    XLSX.writeFile(wb, `historial_mp_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  async function subirDesdeExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportando(true);
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const nombreHoja = wb.SheetNames.find(s => s.toUpperCase().includes('HISTORIAL') || s.toUpperCase().includes('MATER') || s.toUpperCase().includes('COSTOS')) || wb.SheetNames[0];
      const ws = wb.Sheets[nombreHoja];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
      let headerRow = 0;
      for (let i=0; i<Math.min(rows.length,15); i++) {
        const r = rows[i];
        if (r && r.some(c => String(c||'').toUpperCase().trim() === 'ID' || String(c||'').toUpperCase().includes('NOMBRE'))) { headerRow = i; break; }
      }
      const headers = (rows[headerRow]||[]).map(h=>String(h||'').toUpperCase().trim());
      const ci = (name) => headers.findIndex(h=>h.includes(name));
      const idxId=ci('ID'), idxCat=ci('CATEG'), idxNombre=ci('NOMBRE'), idxProv=ci('PROVEED'), idxKg=ci('/KG'), idxNotas=ci('NOTA');
      const registros = [];
      const hoy = new Date().toISOString().split('T')[0];
      for (let i=headerRow+1; i<rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const nombre = idxNombre>=0 ? String(r[idxNombre]||'').trim() : '';
        if (!nombre || nombre.toUpperCase()==='NOMBRE') continue;
        const kg = idxKg>=0 ? parseFloat(r[idxKg])||0 : 0;
        registros.push({ fecha:hoy, mp_id:idxId>=0?String(r[idxId]||'').trim():'', categoria:idxCat>=0?String(r[idxCat]||'').trim():'', nombre, proveedor:idxProv>=0?String(r[idxProv]||'').trim():'', precio_kg:kg, precio_gr:kg>0?kg/1000:0, notas:idxNotas>=0?String(r[idxNotas]||'').trim():'' });
      }
      if (registros.length > 0) {
        for (let i=0; i<registros.length; i+=50) await supabase.from('historial_materias_primas').insert(registros.slice(i,i+50));
        mostrarExito(`${registros.length} registros importados al historial MP`);
      } else { alert('No se encontraron registros validos'); }
      await buscar();
    } catch(err) { alert('Error: ' + err.message); }
    setImportando(false);
    e.target.value = '';
  }

  /* ── estilos ── */
  const thS = { padding:mobile?'8px 6px':'10px 8px', color:'white', fontSize:mobile?10:11, fontWeight:'bold', textAlign:'left', whiteSpace:'nowrap' };
  const tdS = { padding:mobile?'7px 6px':'8px', fontSize:mobile?11:12, borderBottom:'1px solid #f0f0f0' };
  const inp = { padding:'8px', borderRadius:7, border:'1px solid #ddd', fontSize:'13px' };
  const btnS = { border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold', fontSize:'13px' };

  /* ── botón nav reutilizable ── */
  const NavBtn = ({ onClick, children, color, border, bg }) => (
    <button onClick={onClick} style={{
      ...btnS,
      padding: mobile ? '9px 12px' : '8px 14px',
      background: bg || 'rgba(255,255,255,0.15)',
      color: color || 'white',
      border: border || '1px solid rgba(255,255,255,0.3)',
      fontSize: mobile ? 12 : 13,
      display: 'flex', alignItems: 'center', gap: 4,
      flexShrink: 0
    }}>{children}</button>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial' }}>

      {/* ══ HEADER ══ */}
      <div style={{ background:'linear-gradient(135deg,#1a1a2e,#16213e)', padding: mobile?'10px 12px':'14px 24px', boxShadow:'0 2px 10px rgba(0,0,0,0.3)' }}>

        {/* Fila 1: botones + título */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: mobile?8:0, flexWrap:'nowrap' }}>
          {/* 🏠 IR AL MENÚ PRINCIPAL */}
          <NavBtn onClick={onVolverMenu} bg='rgba(255,200,0,0.3)' color='#ffd700' border='1px solid rgba(255,200,0,0.5)'>
            🏠{mobile ? '' : ' Menú'}
          </NavBtn>
          {/* ← VOLVER A PANTALLA ANTERIOR */}
          <NavBtn onClick={onVolver}>
            ←{mobile ? '' : ' Volver'}
          </NavBtn>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'white', fontWeight:'bold', fontSize:mobile?13:18, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              📦 Historial de Materias Primas
            </div>
            <div style={{ color:'#aaa', fontSize:11 }}>{historial.length} registros</div>
          </div>

          {/* Acciones derecha */}
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={()=>fileRef.current.click()} disabled={importando}
              style={{ ...btnS, padding:mobile?'8px 10px':'8px 14px', background:'#8e44ad', color:'white', fontSize:mobile?11:13 }}>
              {importando ? '...' : (mobile ? '📤' : '📤 Subir Excel')}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" style={{ display:'none' }} onChange={subirDesdeExcel}/>
            <button onClick={descargarExcel}
              style={{ ...btnS, padding:mobile?'8px 10px':'8px 14px', background:'#27ae60', color:'white', fontSize:mobile?11:13 }}>
              {mobile ? '📥' : '📥 Excel'}
            </button>
          </div>
        </div>
      </div>

      {/* ══ CONTENIDO ══ */}
      <div style={{ padding: mobile?'10px 8px':'20px 24px' }}>

        {/* FILTROS */}
        <div style={{ background:'white', padding:mobile?10:14, borderRadius:10, marginBottom:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Desde</label>
            <input type="date" value={filtros.fechaDes} onChange={e=>setFiltros(p=>({...p,fechaDes:e.target.value}))} style={inp}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Hasta</label>
            <input type="date" value={filtros.fechaHas} onChange={e=>setFiltros(p=>({...p,fechaHas:e.target.value}))} style={inp}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Categoría</label>
            <select value={filtros.categoria} onChange={e=>setFiltros(p=>({...p,categoria:e.target.value}))} style={inp}>
              <option value="TODAS">Todas</option>
              {categoriasMp.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:130 }}>
            <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Buscar</label>
            <input placeholder="Nombre, ID, proveedor..." value={filtros.texto} onChange={e=>setFiltros(p=>({...p,texto:e.target.value}))} style={inp}/>
          </div>
          <button onClick={buscar} disabled={cargando} style={{ ...btnS, padding:'9px 18px', background:'#2980b9', color:'white' }}>{cargando?'...':'🔍 Buscar'}</button>
          <button onClick={()=>setFiltros({fechaDes:'',fechaHas:'',categoria:'TODAS',texto:''})} style={{ ...btnS, padding:'9px 14px', background:'#95a5a6', color:'white' }}>✕</button>
        </div>

        {/* Barra selección */}
        {seleccionados.size>0&&(
          <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'10px 14px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:'bold', color:'#856404', fontSize:13 }}>{seleccionados.size} seleccionado(s)</span>
            <button onClick={eliminarSeleccionados} style={{ ...btnS, padding:'7px 16px', background:'#e74c3c', color:'white', fontSize:12 }}>🗑️ Eliminar</button>
          </div>
        )}

        {/* TABLA */}
        <div style={{ background:'white', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#1a1a2e' }}>
                  <th style={{ ...thS, width:36 }}>
                    <input type="checkbox" checked={seleccionados.size===historial.length&&historial.length>0} onChange={toggleTodos} style={{ cursor:'pointer' }}/>
                  </th>
                  {['FECHA','ID','CATEGORIA','NOMBRE','PROVEEDOR','$/KG','$/GR','NOTAS','ACCIONES'].map(h=><th key={h} style={thS}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {historial.map((h,i)=>(
                  editandoId===h.id?(
                    <tr key={h.id} style={{ background:'#e8f4fd' }}>
                      <td style={tdS}><input type="checkbox" checked={seleccionados.has(h.id)} onChange={()=>toggleSel(h.id)}/></td>
                      <td style={tdS}><input type="date" value={editData.fecha||''} onChange={e=>setEditData(p=>({...p,fecha:e.target.value}))} style={{ ...inp, width:110 }}/></td>
                      <td style={tdS}><input value={editData.mp_id||''} onChange={e=>setEditData(p=>({...p,mp_id:e.target.value}))} style={{ ...inp, width:70 }}/></td>
                      <td style={tdS}><input value={editData.categoria||''} onChange={e=>setEditData(p=>({...p,categoria:e.target.value}))} style={{ ...inp, width:120 }}/></td>
                      <td style={tdS}><input value={editData.nombre||''} onChange={e=>setEditData(p=>({...p,nombre:e.target.value}))} style={{ ...inp, width:130 }}/></td>
                      <td style={tdS}><input value={editData.proveedor||''} onChange={e=>setEditData(p=>({...p,proveedor:e.target.value}))} style={{ ...inp, width:100 }}/></td>
                      <td style={tdS}><input type="number" value={editData.precio_kg||''} onChange={e=>setEditData(p=>({...p,precio_kg:e.target.value}))} style={{ ...inp, width:80 }}/></td>
                      <td style={tdS}><span style={{ color:'#aaa', fontSize:11 }}>auto</span></td>
                      <td style={tdS}><input value={editData.notas||''} onChange={e=>setEditData(p=>({...p,notas:e.target.value}))} style={{ ...inp, width:90 }}/></td>
                      <td style={tdS}>
                        <button onClick={guardarEdicion} style={{ padding:'4px 10px', background:'#27ae60', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px', marginRight:4 }}>ok</button>
                        <button onClick={()=>setEditandoId(null)} style={{ padding:'4px 10px', background:'#95a5a6', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px' }}>X</button>
                      </td>
                    </tr>
                  ):(
                    <tr key={h.id} style={{ background:i%2===0?'#fafafa':'white' }}>
                      <td style={tdS}><input type="checkbox" checked={seleccionados.has(h.id)} onChange={()=>toggleSel(h.id)} style={{ cursor:'pointer' }}/></td>
                      <td style={{ ...tdS, whiteSpace:'nowrap', color:'#555' }}>{h.fecha}</td>
                      <td style={{ ...tdS, fontWeight:'bold', color:'#1a5276' }}>{h.mp_id}</td>
                      <td style={tdS}><span style={{ background:'#e8f4fd', color:'#1a5276', padding:'2px 6px', borderRadius:10, fontSize:'10px', fontWeight:'bold' }}>{h.categoria}</span></td>
                      <td style={{ ...tdS, fontWeight:'bold' }}>{h.nombre}</td>
                      <td style={tdS}>{h.proveedor}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#27ae60', fontWeight:'bold' }}>${parseFloat(h.precio_kg||0).toFixed(4)}</td>
                      <td style={{ ...tdS, textAlign:'right', color:'#555' }}>${parseFloat(h.precio_gr||0).toFixed(6)}</td>
                      <td style={{ ...tdS, color:'#888', fontSize:'11px' }}>{h.notas}</td>
                      <td style={{ ...tdS, whiteSpace:'nowrap' }}>
                        <button onClick={()=>{ setEditandoId(h.id); setEditData({...h}); }} style={{ padding:'4px 9px', background:'#3498db', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px', marginRight:4 }}>✏️</button>
                        <button onClick={async()=>{ if(!window.confirm('Eliminar?'))return; await supabase.from('historial_materias_primas').delete().eq('id',h.id); mostrarExito('Eliminado'); buscar(); }} style={{ padding:'4px 9px', background:'#e74c3c', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px' }}>🗑️</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
            {historial.length===0&&!cargando&&(
              <div style={{ textAlign:'center', padding:50, color:'#aaa' }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📦</div>
                <div>Usa los filtros y presiona Buscar, o sube un Excel</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
