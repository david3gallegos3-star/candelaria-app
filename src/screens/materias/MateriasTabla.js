// ============================================
// MATERIAS PRIMAS — Tabla principal
// Usado por: PantallaMaterias.js
// ============================================

import React from 'react';

function MateriasTabla({
  materiasFiltradas,
  buscar, setBuscar,
  catFiltro, setCatFiltro,
  estadoFiltro, setEstadoFiltro,
  categoriasMp,
  onEditar, onEliminar
}) {
  return (
    <div>

      {/* Filtros */}
      <div style={{
        background:'white', padding:14, borderRadius:10,
        marginBottom:14, display:'flex', gap:12,
        flexWrap:'wrap', boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
      }}>
        <input
          placeholder="🔍 Buscar..." value={buscar}
          onChange={e => setBuscar(e.target.value)}
          style={{
            flex:1, minWidth:200, padding:'8px 12px',
            borderRadius:8, border:'1px solid #ddd', fontSize:'13px'
          }}
        />
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
          style={{
            padding:'8px 12px', borderRadius:8,
            border:'1px solid #ddd', fontSize:'13px', minWidth:200
          }}
        >
          <option value="TODAS">Todas las categorías</option>
          {categoriasMp.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
          style={{
            padding:'8px 12px', borderRadius:8,
            border:'1px solid #ddd', fontSize:'13px'
          }}
        >
          <option value="TODOS">Todos los estados</option>
          <option>ACTIVO</option>
          <option>INACTIVO</option>
        </select>
        <span style={{
          padding:'8px 12px', background:'#f0f2f5',
          borderRadius:8, fontSize:'13px', color:'#666'
        }}>
          {materiasFiltradas.length} registros
        </span>
      </div>

      {/* Tabla */}
      <div style={{
        background:'white', borderRadius:10,
        boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden'
      }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>

            {/* Encabezados */}
            <thead>
              <tr style={{ background:'#1a1a2e', color:'white' }}>
                {['ID','CATEGORÍA','NOMBRE','NOMBRE EN PRODUCTO',
                  'PROVEEDOR','$/KG','$/LB','$/GR',
                  'TIPO','ESTADO','NOTAS','ACCIONES'
                ].map(h => (
                  <th key={h} style={{
                    padding:'12px 10px', textAlign:'left',
                    whiteSpace:'nowrap', fontSize:'12px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>

            {/* Filas */}
            <tbody>
              {materiasFiltradas.map((m, i) => (
                <tr key={m.id+i} style={{
                  background: i%2===0 ? '#fafafa' : 'white',
                  borderBottom:'1px solid #f0f0f0'
                }}>
                  <td style={{ padding:'10px', fontWeight:'bold', color:'#2c3e50' }}>
                    {m.id}
                  </td>
                  <td style={{ padding:'10px' }}>
                    <span style={{
                      background:'#e8f4fd', color:'#1a5276',
                      padding:'3px 8px', borderRadius:12,
                      fontSize:'11px', fontWeight:'bold'
                    }}>{m.categoria}</span>
                  </td>
                  <td style={{ padding:'10px' }}>{m.nombre}</td>
                  <td style={{ padding:'10px', color:'#555' }}>{m.nombre_producto}</td>
                  <td style={{ padding:'10px', color:'#555' }}>{m.proveedor}</td>
                  <td style={{
                    padding:'10px', textAlign:'right',
                    fontWeight:'bold', color:'#27ae60'
                  }}>
                    ${parseFloat(m.precio_kg||0).toFixed(2)}
                  </td>
                  <td style={{ padding:'10px', textAlign:'right', color:'#555' }}>
                    ${parseFloat(m.precio_lb||0).toFixed(4)}
                  </td>
                  <td style={{ padding:'10px', textAlign:'right', color:'#555' }}>
                    ${parseFloat(m.precio_gr||0).toFixed(6)}
                  </td>
                  <td style={{ padding:'10px' }}>
                    <span style={{
                      background: m.tipo==='CONDIMENTOS Y ADITIVOS' ? '#f3e5f5'
                        : m.tipo==='NINGUNO' ? '#f5f5f5' : '#e8f5e9',
                      color: m.tipo==='CONDIMENTOS Y ADITIVOS' ? '#6c3483'
                        : m.tipo==='NINGUNO' ? '#888' : '#1e8449',
                      padding:'3px 8px', borderRadius:12,
                      fontSize:'10px', fontWeight:'bold'
                    }}>{m.tipo||'MP'}</span>
                  </td>
                  <td style={{ padding:'10px' }}>
                    <span style={{
                      background: m.estado==='ACTIVO' ? '#d4edda' : '#f8d7da',
                      color:      m.estado==='ACTIVO' ? '#155724' : '#721c24',
                      padding:'3px 10px', borderRadius:12,
                      fontSize:'11px', fontWeight:'bold'
                    }}>{m.estado}</span>
                  </td>
                  <td style={{ padding:'10px', color:'#888', fontSize:'12px' }}>
                    {m.notas}
                  </td>
                  <td style={{ padding:'10px', whiteSpace:'nowrap' }}>
                    <button onClick={() => onEditar(m)} style={{
                      padding:'5px 10px', background:'#3498db', color:'white',
                      border:'none', borderRadius:6, cursor:'pointer',
                      fontSize:'12px', marginRight:6
                    }}>✏️</button>
                    <button onClick={() => onEliminar(m.id)} style={{
                      padding:'5px 10px', background:'#e74c3c', color:'white',
                      border:'none', borderRadius:6, cursor:'pointer', fontSize:'12px'
                    }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Vacío */}
          {materiasFiltradas.length === 0 && (
            <div style={{ textAlign:'center', padding:40, color:'#888' }}>
              No se encontraron registros
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MateriasTabla;