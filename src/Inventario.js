// ============================================
// Inventario.js — Solo render
// Versión modular — abril 2026
// ============================================
import React from 'react';
import { useInventario }    from './components/inventario/useInventario';
import InventarioHeader     from './components/inventario/InventarioHeader';
import TabStock             from './components/inventario/TabStock';
import TabMovimientos       from './components/inventario/TabMovimientos';
import TabMermas            from './components/inventario/TabMermas';
import ModalEntrada         from './components/inventario/ModalEntrada';
import ModalMinimo          from './components/inventario/ModalMinimo';
import ModalMerma           from './components/inventario/ModalMerma';
import ModalCamara          from './components/inventario/ModalCamara';
import ModalNotaInv         from './components/inventario/ModalNotaInv';

function Inventario({ onVolver, onVolverMenu, userRol, currentUser }) {

  const inv = useInventario({ userRol, currentUser });
  function abrirPDF() { inv.fileRefPDF.current.click(); }

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', fontFamily:'Arial, sans-serif' }}>

      {/* ── Header ── */}
      <InventarioHeader
        mobile={inv.mobile}
        inventario={inv.inventario}
        alertas={inv.alertas}
        puedeEditar={inv.puedeEditar}
        setModalNota={inv.setModalNota}
        setModalMerma={inv.setModalMerma}
        abrirCamara={inv.abrirCamara}
        abrirPDF={abrirPDF}
        onVolverMenu={onVolverMenu}
      />

      {/* Input oculto cámara */}
      <input
        ref={inv.fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display:'none' }}
        onChange={inv.procesarImagen}
      />

      <input
        ref={inv.fileRefPDF}
        type="file"
        accept="application/pdf"
        style={{ display:'none' }}
        onChange={inv.procesarPDF}
      />

      {/* Mensaje éxito */}
      {inv.msgExito && (
        <div style={{
          background:'#d4edda', color:'#155724',
          padding:'10px 20px', fontWeight:'bold',
          fontSize:'13px', textAlign:'center'
        }}>{inv.msgExito}</div>
      )}

      <div style={{ padding: inv.mobile ? '10px' : '16px 24px' }}>

        {/* ── Tarjetas resumen ── */}
        <div style={{
          display:'grid',
          gridTemplateColumns: inv.mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap:'10px', marginBottom:'14px'
        }}>
          {[
            { label:'MATERIAS PRIMAS', val: inv.inventario.length,              color:'#1a5276', bg:'#e8f4fd' },
            { label:'EN STOCK',        val: `${inv.totalStock.toFixed(1)} kg`,  color:'#155724', bg:'#d4edda' },
            { label:'ALERTAS STOCK',   val: inv.alertas,                        color:'#856404', bg:'#fff3cd' },
            { label:'CRÍTICOS',        val: inv.criticos,                       color:'#721c24', bg:'#f8d7da' },
          ].map(s => (
            <div key={s.label} style={{
              background:s.bg, borderRadius:'10px', padding:'10px 14px'
            }}>
              <div style={{
                fontSize:'10px', color:s.color,
                fontWeight:'700', marginBottom:'4px'
              }}>{s.label}</div>
              <div style={{
                fontSize: inv.mobile ? '18px' : '22px',
                fontWeight:'700', color:s.color
              }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display:'flex', background:'white',
          borderRadius:'10px', padding:'4px',
          marginBottom:'12px', gap:4,
          boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          {[
            ['stock',       '📦 Stock actual' ],
            ['movimientos', '📋 Movimientos'  ],
            ['mermas',      '🗑️ Pérdidas'     ],
          ].map(([key, label]) => (
            <button key={key}
              onClick={() => inv.setTab(key)}
              style={{
                flex:1,
                padding: inv.mobile ? '8px 4px' : '9px 12px',
                border:'none', borderRadius:'7px', cursor:'pointer',
                fontSize: inv.mobile ? '11px' : '13px',
                fontWeight:'bold',
                background: inv.tab === key ? '#1a1a2e' : 'transparent',
                color:      inv.tab === key ? 'white'   : '#666',
                transition:'all 0.2s'
              }}>{label}</button>
          ))}
        </div>

        {/* ── Contenido tabs ── */}
        {inv.tab === 'stock' && (
          <TabStock
            mobile={inv.mobile}
            loading={inv.loading}
            puedeEditar={inv.puedeEditar}
            inventarioFiltrado={inv.inventarioFiltrado}
            categorias={inv.categorias}
            catFiltro={inv.catFiltro}       setCatFiltro={inv.setCatFiltro}
            estadoFiltro={inv.estadoFiltro} setEstadoFiltro={inv.setEstadoFiltro}
            buscar={inv.buscar}             setBuscar={inv.setBuscar}
            badgeStock={inv.badgeStock}
            guardarStockInicial={inv.guardarStockInicial}
            setModalEntrada={inv.setModalEntrada}
            setEntradaKg={inv.setEntradaKg}
            setEntradaPrecio={inv.setEntradaPrecio}
            setEntradaNota={inv.setEntradaNota}
            setModalMinimo={inv.setModalMinimo}
            setMinimoKg={inv.setMinimoKg}
          />
        )}

        {inv.tab === 'movimientos' && (
          <TabMovimientos movimientos={inv.movimientos} />
        )}

        {inv.tab === 'mermas' && (
          <TabMermas
            mermas={inv.mermas}
            puedeEditar={inv.puedeEditar}
            setModalMerma={inv.setModalMerma}
          />
        )}
      </div>

      {/* ── Modales ── */}
      <ModalEntrada
        mobile={inv.mobile}
        modalEntrada={inv.modalEntrada}
        setModalEntrada={inv.setModalEntrada}
        entradaKg={inv.entradaKg}         setEntradaKg={inv.setEntradaKg}
        entradaPrecio={inv.entradaPrecio} setEntradaPrecio={inv.setEntradaPrecio}
        entradaNota={inv.entradaNota}     setEntradaNota={inv.setEntradaNota}
        guardando={inv.guardando}
        guardarEntrada={inv.guardarEntrada}
      />

      <ModalMinimo
        modalMinimo={inv.modalMinimo}
        setModalMinimo={inv.setModalMinimo}
        minimoKg={inv.minimoKg}
        setMinimoKg={inv.setMinimoKg}
        guardarMinimo={inv.guardarMinimo}
      />

      <ModalMerma
        mobile={inv.mobile}
        modalMerma={inv.modalMerma}
        setModalMerma={inv.setModalMerma}
        mermaForm={inv.mermaForm}
        setMermaForm={inv.setMermaForm}
        inventario={inv.inventario}
        guardando={inv.guardando}
        guardarMerma={inv.guardarMerma}
      />

      <ModalCamara
        mobile={inv.mobile}
        modalCamara={inv.modalCamara}
        setModalCamara={inv.setModalCamara}
        analizandoIA={inv.analizandoIA}
        imagenBase64={inv.imagenBase64}
        resultadosIA={inv.resultadosIA}
        setResultadosIA={inv.setResultadosIA}
        materiasPrimas={inv.materiasPrimas}
        guardando={inv.guardando}
        getPrecioSistema={inv.getPrecioSistema}
        actualizarNombreIA={inv.actualizarNombreIA}
        confirmarResultadosIA={inv.confirmarResultadosIA}
        categoriasMp={inv.categorias}
        generarIdPorCategoria={inv.generarIdPorCategoria}

      />

      <ModalNotaInv
        mobile={inv.mobile}
        modalNota={inv.modalNota}     setModalNota={inv.setModalNota}
        textoNota={inv.textoNota}     setTextoNota={inv.setTextoNota}
        enviandoNota={inv.enviandoNota}
        enviarNota={inv.enviarNota}
      />
    </div>
  );
}

export default Inventario;