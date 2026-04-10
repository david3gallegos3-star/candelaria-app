// ============================================
// Produccion.js — Solo render
// Versión modular — abril 2026
// ============================================
import React from 'react';
import { useProduccion }   from './components/produccion/useProduccion';
import ProduccionHeader    from './components/produccion/ProduccionHeader';
import TabRegistrar        from './components/produccion/TabRegistrar';
import TabHistorial        from './components/produccion/TabHistorial';
import ModalRevertir       from './components/produccion/ModalRevertir';
import ModalNotaProd       from './components/produccion/ModalNotaProd';

function Produccion({ onVolver, onVolverMenu, userRol, currentUser }) {

  const p = useProduccion({ userRol, currentUser });
  const resumen = p.calcularResumen();

  return (
    <div style={{
      minHeight:'100vh', background:'#f0f2f5',
      fontFamily:'Arial, sans-serif'
    }}>

      {/* ── Header ── */}
      <ProduccionHeader
        mobile={p.mobile}
        kgHoy={p.kgHoy}       costoHoy={p.costoHoy}
        kgMes={p.kgMes}       costoMes={p.costoMes}
        setModalNota={p.setModalNota}
        onVolverMenu={onVolverMenu}
      />

      {/* Mensaje éxito */}
      {p.msgExito && (
        <div style={{
          background:'#d4edda', color:'#155724',
          padding:'10px 20px', fontWeight:'bold',
          fontSize:'13px', textAlign:'center'
        }}>{p.msgExito}</div>
      )}

      <div style={{ padding: p.mobile ? '10px' : '16px 24px' }}>

        {/* ── Tarjetas stats ── */}
        <div style={{
          display:'grid',
          gridTemplateColumns: p.mobile ? '1fr 1fr' : 'repeat(4,1fr)',
          gap:'10px', marginBottom:'14px'
        }}>
          {[
            { label:'KG HOY',      val: p.kgHoy.toFixed(1)   + ' kg', color:'#155724', bg:'#d4edda' },
            { label:'COSTO HOY',   val: '$' + p.costoHoy.toFixed(2),  color:'#1a5276', bg:'#e8f4fd' },
            { label:'KG ESTE MES', val: p.kgMes.toFixed(1)   + ' kg', color:'#856404', bg:'#fff3cd' },
            { label:'COSTO MES',   val: '$' + p.costoMes.toFixed(2),  color:'#6c3483', bg:'#f3e5f5' },
          ].map(s => (
            <div key={s.label} style={{
              background:s.bg, borderRadius:'10px', padding:'10px 14px'
            }}>
              <div style={{
                fontSize:'10px', color:s.color,
                fontWeight:'700', marginBottom:'4px'
              }}>{s.label}</div>
              <div style={{
                fontSize: p.mobile ? '16px' : '20px',
                fontWeight:'700', color:s.color
              }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display:'flex', background:'white',
          borderRadius:'10px', padding:'4px',
          marginBottom:'14px', gap:4,
          boxShadow:'0 1px 4px rgba(0,0,0,0.06)'
        }}>
          {[
            ['registrar', '🏭 Registrar producción'],
            ['historial', '📋 Historial'           ],
          ].map(([key, label]) => (
            <button key={key}
              onClick={() => p.setTab(key)}
              style={{
                flex:1,
                padding: p.mobile ? '8px 4px' : '9px 12px',
                border:'none', borderRadius:'7px', cursor:'pointer',
                fontSize: p.mobile ? '11px' : '13px',
                fontWeight:'bold',
                background: p.tab === key ? '#1a1a2e' : 'transparent',
                color:      p.tab === key ? 'white'   : '#666',
                transition:'all 0.2s'
              }}>{label}</button>
          ))}
        </div>

        {/* ── Tab registrar ── */}
        {p.tab === 'registrar' && (
          <TabRegistrar
            mobile={p.mobile}
            productoSel={p.productoSel}
            setProductoSel={p.setProductoSel}
            buscarProd={p.buscarProd}
            setBuscarProd={p.setBuscarProd}
            prodsFiltrados={p.prodsFiltrados}
            formulacion={p.formulacion}
            configProd={p.configProd}
            seleccionarProducto={p.seleccionarProducto}
            fecha={p.fecha}           setFecha={p.setFecha}
            turno={p.turno}           setTurno={p.setTurno}
            numParadas={p.numParadas} setNumParadas={p.setNumParadas}
            nota={p.nota}             setNota={p.setNota}
            resumen={resumen}
            guardando={p.guardando}
            guardarProduccion={p.guardarProduccion}
          />
        )}

        {/* ── Tab historial ── */}
        {p.tab === 'historial' && (
          <TabHistorial
            historialAgrupado={p.historialAgrupado}
            produccionDiaria={p.produccionDiaria}
            esAdmin={p.esAdmin}
            setModalRevertir={p.setModalRevertir}
          />
        )}
      </div>

      {/* ── Modales ── */}
      <ModalRevertir
        mobile={p.mobile}
        modalRevertir={p.modalRevertir}
        setModalRevertir={p.setModalRevertir}
        guardando={p.guardando}
        revertirProduccion={p.revertirProduccion}
      />

      <ModalNotaProd
        mobile={p.mobile}
        modalNota={p.modalNota}   setModalNota={p.setModalNota}
        textoNota={p.textoNota}   setTextoNota={p.setTextoNota}
        enviarNota={p.enviarNota}
      />
    </div>
  );
}

export default Produccion;