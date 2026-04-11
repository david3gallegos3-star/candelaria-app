// ============================================
// Auditoria.js — Solo render
// Versión modular — abril 2026
// ============================================
import React from 'react';
import { useAuditoria }    from './components/auditoria/useAuditoria';
import AuditoriaHeader     from './components/auditoria/AuditoriaHeader';
import AuditoriaStats      from './components/auditoria/AuditoriaStats';
import AuditoriaFiltros    from './components/auditoria/AuditoriaFiltros';
import AuditoriaTabla      from './components/auditoria/AuditoriaTabla';

function Auditoria({ onVolver, onVolverMenu, userRol }) {

  const a = useAuditoria({ userRol });

  return (
    <div style={{
      minHeight:'100vh', background:'#f0f2f5',
      fontFamily:'Arial, sans-serif'
    }}>

      {/* ── Header ── */}
      <AuditoriaHeader
        mobile={a.mobile}
        registros={a.registros}
        noLeidas={a.noLeidas}
        cargando={a.cargando}
        onVolverMenu={onVolverMenu}
        exportarExcel={a.exportarExcel}
      />

      {/* Mensaje éxito */}
      {a.msgExito && (
        <div style={{
          background:'#d4edda', color:'#155724',
          padding:'10px 20px', fontWeight:'bold',
          fontSize:'13px', textAlign:'center'
        }}>{a.msgExito}</div>
      )}

      <div style={{ padding: a.mobile ? '10px' : '16px 24px' }}>

        {/* ── Stats ── */}
        <AuditoriaStats
          mobile={a.mobile}
          registros={a.registros}
          registrosHoy={a.registrosHoy}
          cambiosPrecios={a.cambiosPrecios}
          producciones={a.producciones}
          noLeidas={a.noLeidas}
        />

        {/* ── Filtros ── */}
        <AuditoriaFiltros
          mobile={a.mobile}
          fechaDesde={a.fechaDesde}       setFechaDesde={a.setFechaDesde}
          fechaHasta={a.fechaHasta}       setFechaHasta={a.setFechaHasta}
          tipoFiltro={a.tipoFiltro}       setTipoFiltro={a.setTipoFiltro}
          usuarioFiltro={a.usuarioFiltro} setUsuarioFiltro={a.setUsuarioFiltro}
          productoFiltro={a.productoFiltro} setProductoFiltro={a.setProductoFiltro}
          soloNoLeidas={a.soloNoLeidas}   setSoloNoLeidas={a.setSoloNoLeidas}
          usuariosUnicos={a.usuariosUnicos}
          TIPOS={a.TIPOS}
          cargando={a.cargando}
          buscar={a.buscar}
          limpiarFiltros={a.limpiarFiltros}
          registros={a.registros}
        />

        {/* ── Tabla ── */}
        {a.loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#aaa' }}>
            ⏳ Cargando auditoría...
          </div>
        ) : (
          <AuditoriaTabla
            mobile={a.mobile}
            registrosPagina={a.registrosPagina}
            registros={a.registros}
            pagina={a.pagina}         setPagina={a.setPagina}
            totalPaginas={a.totalPaginas}
            POR_PAGINA={a.POR_PAGINA}
            colorTipo={a.colorTipo}
            iconTipo={a.iconTipo}
            labelTipo={a.labelTipo}
          />
        )}
      </div>
    </div>
  );
}

export default Auditoria;