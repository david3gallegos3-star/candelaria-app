// ============================================
// Clientes.js — Solo render
// Versión modular — abril 2026
// ============================================
import React from 'react';
import { useClientes }    from './components/clientes/useClientes';
import ClientesHeader     from './components/clientes/ClientesHeader';
import TabClientes        from './components/clientes/TabClientes';
import TabPrecios         from './components/clientes/TabPrecios';
import TabAlertas         from './components/clientes/TabAlertas';
import ModalCliente       from './components/clientes/ModalCliente';
import ModalPrecio        from './components/clientes/ModalPrecio';

function Clientes({ onVolver, onVolverMenu, userRol, currentUser }) {

  const c = useClientes({ userRol, currentUser });

  return (
    <div style={{
      minHeight:'100vh', background:'#f0f2f5',
      fontFamily:'Arial, sans-serif'
    }}>

      {/* ── Header + Tabs ── */}
      <ClientesHeader
        mobile={c.mobile}
        clientes={c.clientes}
        alertas={c.alertas}
        tab={c.tab}               setTab={c.setTab}
        esAdmin={c.esAdmin}
        abrirModalCliente={c.abrirModalCliente}
        abrirModalPrecio={c.abrirModalPrecio}
        onVolverMenu={onVolverMenu}
      />

      {/* Mensaje éxito */}
      {c.msgExito && (
        <div style={{
          background:'#d4edda', color:'#155724',
          padding:'10px 20px', fontWeight:'bold',
          fontSize:'13px', textAlign:'center'
        }}>{c.msgExito}</div>
      )}

      <div style={{ padding: c.mobile ? '10px' : '16px 24px' }}>

        {/* ── Tarjetas resumen ── */}
        <div style={{
          display:'grid',
          gridTemplateColumns: c.mobile ? '1fr 1fr' : 'repeat(4,1fr)',
          gap:'10px', marginBottom:'14px'
        }}>
          {[
            {
              label:'CLIENTES',
              val:   c.clientes.length,
              color:'#1a5276', bg:'#e8f4fd'
            },
            {
              label:'ACTIVOS',
              val:   c.clientes.filter(x => x.activo).length,
              color:'#155724', bg:'#d4edda'
            },
            {
              label:'PRECIOS CONFIG.',
              val:   c.precios.length,
              color:'#6c3483', bg:'#f3e5f5'
            },
            {
              label:'ALERTAS MARGEN',
              val:   c.alertas.length,
              color: c.alertas.length > 0 ? '#721c24' : '#155724',
              bg:    c.alertas.length > 0 ? '#f8d7da' : '#d4edda'
            },
          ].map(s => (
            <div key={s.label} style={{
              background:s.bg, borderRadius:'10px', padding:'10px 14px'
            }}>
              <div style={{
                fontSize:'10px', color:s.color,
                fontWeight:'700', marginBottom:'4px'
              }}>{s.label}</div>
              <div style={{
                fontSize: c.mobile ? '18px' : '22px',
                fontWeight:'700', color:s.color
              }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── Loading ── */}
        {c.loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#aaa' }}>
            ⏳ Cargando clientes...
          </div>
        ) : (
          <>
            {/* ── Tab clientes ── */}
            {c.tab === 'clientes' && (
              <TabClientes
                mobile={c.mobile}
                esAdmin={c.esAdmin}
                clientesFiltrados={c.clientesFiltrados}
                buscar={c.buscar}         setBuscar={c.setBuscar}
                clienteSel={c.clienteSel} setClienteSel={c.setClienteSel}
                preciosFiltrados={c.preciosFiltrados}
                precios={c.precios}
                abrirModalCliente={c.abrirModalCliente}
                abrirModalPrecio={c.abrirModalPrecio}
                eliminarCliente={c.eliminarCliente}
                toggleActivoCliente={c.toggleActivoCliente}
                setTab={c.setTab}
                cargarTodo={c.cargarTodo}
              />
            )}

            {/* ── Tab precios ── */}
            {c.tab === 'precios' && (
              <TabPrecios
                mobile={c.mobile}
                esAdmin={c.esAdmin}
                preciosFiltrados={c.preciosFiltrados}
                clienteSel={c.clienteSel}
                setClienteSel={c.setClienteSel}
                clientes={c.clientes}
                abrirModalPrecio={c.abrirModalPrecio}
                eliminarPrecio={c.eliminarPrecio}
                getPrecioSistema={c.getPrecioSistema}
                getCostoSistema={c.getCostoSistema}
              />
            )}

            {/* ── Tab alertas ── */}
            {c.tab === 'alertas' && (
              <TabAlertas
                mobile={c.mobile}
                esAdmin={c.esAdmin}
                alertas={c.alertas}
                precios={c.precios}
                abrirModalPrecio={c.abrirModalPrecio}
              />
            )}
          </>
        )}
      </div>

      {/* ── Modales ── */}
      <ModalCliente
        mobile={c.mobile}
        modalCliente={c.modalCliente}
        setModalCliente={c.setModalCliente}
        editandoCliente={c.editandoCliente}
        formCliente={c.formCliente}
        setFormCliente={c.setFormCliente}
        guardando={c.guardando}
        guardarCliente={c.guardarCliente}
      />

      <ModalPrecio
        mobile={c.mobile}
        modalPrecio={c.modalPrecio}
        setModalPrecio={c.setModalPrecio}
        editandoPrecio={c.editandoPrecio}
        formPrecio={c.formPrecio}
        setFormPrecio={c.setFormPrecio}
        clientes={c.clientes}
        productos={c.productos}
        guardando={c.guardando}
        guardarPrecio={c.guardarPrecio}
        getPrecioSistema={c.getPrecioSistema}
        getCostoSistema={c.getCostoSistema}
      />
    </div>
  );
}

export default Clientes;