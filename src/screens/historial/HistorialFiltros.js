// ============================================
// HISTORIAL — Bloque de filtros
// Usado por: PantallaHistorial.js
// ============================================

import React from 'react';

function HistorialFiltros({
  histFechaDes, setHistFechaDes,
  histFechaHas, setHistFechaHas,
  histProducto, setHistProducto,
  histSeccion,  setHistSeccion,
  histCargando, cargarHistorial,
  limpiarFiltros
}) {
  return (
    <div style={{
      background:'white', padding:14, borderRadius:10,
      marginBottom:14, display:'flex', gap:10,
      flexWrap:'wrap', alignItems:'flex-end',
      boxShadow:'0 1px 4px rgba(0,0,0,0.08)'
    }}>

      {/* Desde */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Desde</label>
        <input type="date" value={histFechaDes}
          onChange={e => setHistFechaDes(e.target.value)}
          style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}
        />
      </div>

      {/* Hasta */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Hasta</label>
        <input type="date" value={histFechaHas}
          onChange={e => setHistFechaHas(e.target.value)}
          style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}
        />
      </div>

      {/* Producto */}
      <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1, minWidth:150 }}>
        <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Producto</label>
        <input
          placeholder="Buscar producto..." value={histProducto}
          onChange={e => setHistProducto(e.target.value)}
          style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}
        />
      </div>

      {/* Sección */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <label style={{ fontSize:'11px', fontWeight:'bold', color:'#555' }}>Sección</label>
        <select value={histSeccion} onChange={e => setHistSeccion(e.target.value)}
          style={{ padding:'8px', borderRadius:8, border:'1px solid #ddd', fontSize:'13px' }}
        >
          <option value="TODAS">Todas</option>
          <option value="MATERIAS PRIMAS">Materias Primas</option>
          <option value="CONDIMENTOS Y ADITIVOS">Condimentos y Aditivos</option>
        </select>
      </div>

      {/* Buscar */}
      <button onClick={cargarHistorial} disabled={histCargando} style={{
        padding:'9px 20px', background:'#2980b9', color:'white',
        border:'none', borderRadius:8, cursor:'pointer',
        fontWeight:'bold', fontSize:'13px'
      }}>
        {histCargando ? 'Buscando...' : '🔍 Buscar'}
      </button>

      {/* Limpiar */}
      <button onClick={limpiarFiltros} style={{
        padding:'9px 16px', background:'#95a5a6', color:'white',
        border:'none', borderRadius:8, cursor:'pointer', fontSize:'13px'
      }}>✕ Limpiar</button>

    </div>
  );
}

export default HistorialFiltros;