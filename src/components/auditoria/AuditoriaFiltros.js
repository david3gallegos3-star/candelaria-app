// ============================================
// AuditoriaFiltros.js
// Panel de filtros de auditoría
// ============================================
import React from 'react';

export default function AuditoriaFiltros({
  mobile,
  fechaDesde,    setFechaDesde,
  fechaHasta,    setFechaHasta,
  tipoFiltro,    setTipoFiltro,
  usuarioFiltro, setUsuarioFiltro,
  productoFiltro,setProductoFiltro,
  soloNoLeidas,  setSoloNoLeidas,
  usuariosUnicos, TIPOS,
  cargando,
  buscar,
  limpiarFiltros,
  registros,
}) {
  return (
    <div style={{
      background:'white', padding:'14px 16px',
      borderRadius:'10px', marginBottom:'12px',
      boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
    }}>

      {/* ── Fila 1: fechas + tipo ── */}
      <div style={{
        display:'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
        gap:'10px', marginBottom:'10px'
      }}>
        <div>
          <label style={{
            fontSize:'11px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            style={{
              width:'100%', padding:'8px',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px', boxSizing:'border-box'
            }}
          />
        </div>

        <div>
          <label style={{
            fontSize:'11px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
            style={{
              width:'100%', padding:'8px',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px', boxSizing:'border-box'
            }}
          />
        </div>

        <div>
          <label style={{
            fontSize:'11px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Tipo de evento</label>
          <select
            value={tipoFiltro}
            onChange={e => setTipoFiltro(e.target.value)}
            style={{
              width:'100%', padding:'8px',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px'
            }}
          >
            <option value="TODOS">Todos los tipos</option>
            {TIPOS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{
            fontSize:'11px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Usuario</label>
          <select
            value={usuarioFiltro}
            onChange={e => setUsuarioFiltro(e.target.value)}
            style={{
              width:'100%', padding:'8px',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px'
            }}
          >
            <option value="">Todos los usuarios</option>
            {usuariosUnicos.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Fila 2: producto + solo no leidas + botones ── */}
      <div style={{
        display:'flex', gap:'10px',
        flexWrap:'wrap', alignItems:'flex-end'
      }}>
        <div style={{ flex:1, minWidth:160 }}>
          <label style={{
            fontSize:'11px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Producto</label>
          <input
            placeholder="Buscar por producto..."
            value={productoFiltro}
            onChange={e => setProductoFiltro(e.target.value)}
            style={{
              width:'100%', padding:'8px 12px',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px', boxSizing:'border-box'
            }}
          />
        </div>

        {/* Checkbox solo no leídas */}
        <label style={{
          display:'flex', alignItems:'center', gap:6,
          cursor:'pointer', fontSize:'13px', color:'#555',
          padding:'8px 12px', background:'#f8f9fa',
          borderRadius:'8px', border:'1px solid #ddd',
          whiteSpace:'nowrap'
        }}>
          <input
            type="checkbox"
            checked={soloNoLeidas}
            onChange={e => setSoloNoLeidas(e.target.checked)}
            style={{ cursor:'pointer' }}
          />
          Solo no leídas
        </label>

        {/* Contador */}
        <span style={{
          padding:'8px 12px', background:'#f0f2f5',
          borderRadius:'8px', fontSize:'13px',
          color:'#666', whiteSpace:'nowrap'
        }}>
          {registros.length} registros
        </span>

        {/* Botón limpiar */}
        <button
          onClick={limpiarFiltros}
          style={{
            padding:'8px 14px', background:'#95a5a6',
            color:'white', border:'none',
            borderRadius:'8px', cursor:'pointer',
            fontSize:'13px', whiteSpace:'nowrap'
          }}>✕ Limpiar</button>

        {/* Botón buscar */}
        <button
          onClick={buscar}
          disabled={cargando}
          style={{
            padding:'8px 18px',
            background: cargando ? '#95a5a6' : '#2980b9',
            color:'white', border:'none',
            borderRadius:'8px', cursor: cargando ? 'not-allowed' : 'pointer',
            fontSize:'13px', fontWeight:'bold',
            whiteSpace:'nowrap',
            opacity: cargando ? 0.7 : 1
          }}>
          {cargando ? '⏳ Buscando...' : '🔍 Buscar'}
        </button>
      </div>
    </div>
  );
}