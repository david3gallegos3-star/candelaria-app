// ============================================
// FORMULARIO DE MATERIAS PRIMAS
// Campos: ID auto, categoría, nombre, precios
// Usado por: screens/PantallaMaterias.js
// ============================================

import React from 'react';

function MateriasForm({ data, setData, categoriasMp, generarSiguienteId }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>

      {/* CATEGORÍA — va primero para que el ID se genere */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          Categoría
        </label>
        <select
          value={data.categoria}
          onChange={e => {
            const nuevaCat = e.target.value;
            const idSugerido = generarSiguienteId(nuevaCat);
            setData({ ...data, categoria: nuevaCat, id: idSugerido || data.id });
          }}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        >
          {categoriasMp.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* ID — se sugiere automáticamente */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          ID
          {generarSiguienteId(data.categoria) ? (
            <span style={{
              marginLeft:6, fontSize:'10px',
              color:'#27ae60', fontWeight:'normal'
            }}>
              ✓ sugerido: {generarSiguienteId(data.categoria)}
            </span>
          ) : (
            <span style={{
              marginLeft:6, fontSize:'10px',
              color:'#f39c12', fontWeight:'normal'
            }}>
              ⚠ categoría nueva — define el primer ID
            </span>
          )}
        </label>
        <input
          type="text"
          value={data.id}
          onChange={e => setData({ ...data, id: e.target.value.toUpperCase() })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1.5px solid #3498db',
            fontSize:'13px', fontWeight:'bold'
          }}
        />
      </div>

      {/* NOMBRE INGREDIENTE */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          Nombre Ingrediente
        </label>
        <input
          type="text"
          value={data.nombre}
          onChange={e => setData({ ...data, nombre: e.target.value })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        />
      </div>

      {/* NOMBRE EN PRODUCTO */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          Nombre en Producto
        </label>
        <input
          type="text"
          value={data.nombre_producto}
          onChange={e => setData({ ...data, nombre_producto: e.target.value })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        />
      </div>

      {/* PROVEEDOR */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          Proveedor
        </label>
        <input
          type="text"
          value={data.proveedor}
          onChange={e => setData({ ...data, proveedor: e.target.value })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        />
      </div>

      {/* PRECIO KG */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#3498db' }}>
          $ / KG
        </label>
        <input
          type="number"
          value={data.precio_kg}
          onChange={e => setData({ ...data, precio_kg: e.target.value })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1.5px solid #3498db',
            fontSize:'13px', fontWeight:'bold'
          }}
        />
      </div>

      {/* PRECIO LB — automático */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#27ae60' }}>
          $ / LB (auto)
        </label>
        <input
          readOnly
          value={
            parseFloat(data.precio_kg) > 0
              ? (parseFloat(data.precio_kg) / 2.20462).toFixed(4)
              : '—'
          }
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #c8e6c9', fontSize:'13px',
            background:'#f1f8f1', color:'#27ae60', fontWeight:'bold'
          }}
        />
      </div>

      {/* PRECIO GR — automático */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#27ae60' }}>
          $ / GR (auto)
        </label>
        <input
          readOnly
          value={
            parseFloat(data.precio_kg) > 0
              ? (parseFloat(data.precio_kg) / 1000).toFixed(6)
              : '—'
          }
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #c8e6c9', fontSize:'13px',
            background:'#f1f8f1', color:'#27ae60', fontWeight:'bold'
          }}
        />
      </div>

      {/* ESTADO */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          Estado
        </label>
        <select
          value={data.estado}
          onChange={e => setData({ ...data, estado: e.target.value })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        >
          <option>ACTIVO</option>
          <option>INACTIVO</option>
        </select>
      </div>

      {/* TIPO */}
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          Tipo
        </label>
        <select
          value={data.tipo || 'MATERIAS PRIMAS'}
          onChange={e => setData({ ...data, tipo: e.target.value })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        >
          <option value="MATERIAS PRIMAS">MATERIAS PRIMAS</option>
          <option value="CONDIMENTOS Y ADITIVOS">CONDIMENTOS Y ADITIVOS</option>
          <option value="NINGUNO">NINGUNO</option>
        </select>
      </div>

      {/* NOTAS — ocupa toda la fila */}
      <div style={{
        display:'flex', flexDirection:'column',
        gap:'4px', gridColumn:'1/-1'
      }}>
        <label style={{ fontSize:'12px', fontWeight:'bold', color:'#555' }}>
          Notas
        </label>
        <input
          type="text"
          value={data.notas}
          onChange={e => setData({ ...data, notas: e.target.value })}
          style={{
            padding:'7px', borderRadius:'6px',
            border:'1px solid #ddd', fontSize:'13px'
          }}
        />
      </div>

    </div>
  );
}

export default MateriasForm;