// ============================================
// ModalNuevoProducto.js
// Modal para crear un producto nuevo
// ============================================
import React from 'react';

export default function ModalNuevoProducto({
  nuevoNombre, setNuevoNombre,
  nuevaCategoria, setNuevaCategoria,
  categoriasConfig,
  onCrear,
  onCerrar
}) {
  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000
    }}>
      <div style={{
        background:'white', padding:28, borderRadius:12,
        width:420, boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
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
          onChange={e => setNuevaCategoria(e.target.value)}
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