// ============================================
// ModalNuevoProducto.js
// Modal para crear un producto nuevo
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function ModalNuevoProducto({
  nuevoNombre, setNuevoNombre,
  nuevaCategoria, setNuevaCategoria,
  nuevoMpVinculado, setNuevoMpVinculado,
  categoriasConfig,
  onCrear,
  onCerrar
}) {
  const [mps,       setMps]       = useState([]);
  const [buscador,  setBuscador]  = useState('');

  const esCorte = nuevaCategoria === 'Cortes' || nuevaCategoria === 'CORTES';

  useEffect(() => {
    if (!esCorte) return;
    supabase.from('materias_primas')
      .select('id,nombre,nombre_producto,precio_kg,categoria')
      .eq('eliminado', false).order('nombre')
      .then(({ data }) => setMps(data || []));
  }, [esCorte]);

  const mpsFiltradas = mps.filter(m => {
    const txt = buscador.toLowerCase();
    return !txt || (m.nombre || '').toLowerCase().includes(txt) ||
      (m.nombre_producto || '').toLowerCase().includes(txt);
  }).slice(0, 50);

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000,
      padding:16
    }}>
      <div style={{
        background:'white', padding:28, borderRadius:12,
        width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h3 style={{ margin:'0 0 20px', color:'#1a1a2e' }}>➕ Nuevo Producto</h3>

        <label style={{ fontSize:'13px', fontWeight:'bold', color:'#555' }}>
          Nombre del producto
        </label>
        <input
          value={nuevoNombre}
          onChange={e => setNuevoNombre(e.target.value)}
          placeholder="Ej: Salchicha Cocktail"
          style={{
            width:'100%', padding:10, borderRadius:8,
            border:'1px solid #ddd', fontSize:'14px',
            marginTop:6, marginBottom:14, boxSizing:'border-box'
          }}
        />

        <label style={{ fontSize:'13px', fontWeight:'bold', color:'#555' }}>
          Categoría
        </label>
        <select
          value={nuevaCategoria}
          onChange={e => { setNuevaCategoria(e.target.value); setNuevoMpVinculado(null); setBuscador(''); }}
          style={{
            width:'100%', padding:10, borderRadius:8,
            border:'1px solid #ddd', fontSize:'14px',
            marginTop:6, boxSizing:'border-box'
          }}
        >
          {Object.keys(categoriasConfig).map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>

        {/* Selector de MP — solo para categoría Cortes */}
        {esCorte && (
          <div style={{ marginTop:16 }}>
            <label style={{ fontSize:'13px', fontWeight:'bold', color:'#6c3483', display:'block', marginBottom:6 }}>
              🥩 Materia prima vinculada *
            </label>
            <div style={{ fontSize:11, color:'#888', marginBottom:8 }}>
              Selecciona el corte en materias primas para vincular precio y stock
            </div>
            {nuevoMpVinculado ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#eafaf1', border:'1.5px solid #27ae60', borderRadius:8, padding:'10px 14px', marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:'bold', color:'#1a1a2e', fontSize:13 }}>✅ {nuevoMpVinculado.nombre}</div>
                  <div style={{ fontSize:11, color:'#27ae60' }}>${parseFloat(nuevoMpVinculado.precio_kg || 0).toFixed(2)}/kg</div>
                </div>
                <button onClick={() => { setNuevoMpVinculado(null); setBuscador(''); }}
                  style={{ background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
            ) : (
              <>
                <input
                  placeholder="🔍 Buscar materia prima..."
                  value={buscador}
                  onChange={e => setBuscador(e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #6c3483', fontSize:13, boxSizing:'border-box', marginBottom:6, outline:'none' }}
                />
                {buscador && (
                  <div style={{ maxHeight:180, overflowY:'auto', border:'1px solid #e0e0e0', borderRadius:8 }}>
                    {mpsFiltradas.length === 0
                      ? <div style={{ padding:'12px', color:'#aaa', fontSize:12, textAlign:'center' }}>Sin resultados</div>
                      : mpsFiltradas.map(mp => (
                          <div key={mp.id}
                            onClick={() => { setNuevoMpVinculado({ id: mp.id, nombre: mp.nombre_producto || mp.nombre, precio_kg: mp.precio_kg }); setBuscador(''); }}
                            style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #f5f5f5', fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span>{mp.nombre_producto || mp.nombre}</span>
                            <span style={{ color:'#888', fontSize:11 }}>${parseFloat(mp.precio_kg || 0).toFixed(2)}/kg</span>
                          </div>
                        ))
                    }
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onCerrar} style={{
            padding:'10px 20px', background:'#95a5a6', color:'white',
            border:'none', borderRadius:8, cursor:'pointer'
          }}>Cancelar</button>
          <button onClick={onCrear} style={{
            padding:'10px 20px', background:'#27ae60', color:'white',
            border:'none', borderRadius:8, cursor:'pointer', fontWeight:'bold'
          }}>Crear y abrir</button>
        </div>
      </div>
    </div>
  );
}