// ============================================
// Formulacion.js — Solo render
// Versión modular — abril 2026
// ============================================
import React, { useState, useEffect } from 'react';
import { useFormulacion }      from './components/formulacion/useFormulacion';
import { norm }                from './components/formulacion/FormulacionInputs';
import FormulacionHeader       from './components/formulacion/FormulacionHeader';
import VistaFormulador         from './components/formulacion/VistaFormulador';
import VistaLimpia             from './components/formulacion/VistaLimpia';
import SeccionIngredientes     from './components/formulacion/SeccionIngredientes';
import PanelCostos             from './components/formulacion/PanelCostos';
import PanelComparador         from './components/formulacion/PanelComparador';
import FormulaVersiones        from './components/formulacion/FormulaVersiones';
import ModalBuscador           from './components/formulacion/ModalBuscador';
import ModalNota               from './components/formulacion/ModalNota';

function Formulacion({ producto, onVolver, onVolverMenu, onAbrirMaterias, userRol, currentUser, onContextoFormula, onDescargaFn }) {

  const f = useFormulacion({ producto, userRol, currentUser });
  const esFormulador = userRol?.rol === 'formulador';
  const [versionesAbierto, setVersionesAbierto] = useState(false);
  const [tabVersiones,     setTabVersiones]     = useState('versiones');

  // ── Pasa función de descarga al chat flotante ──────────────────────────────
  useEffect(() => {
    if (onDescargaFn) onDescargaFn(f.descargarExcel);
  }, [f.descargarExcel]);

  // ── Envía contexto de fórmula al chat flotante ─────────────────────────────
  useEffect(() => {
    if (!onContextoFormula) return;
    if (f.ingredientesMP.length === 0 && f.ingredientesAD.length === 0) return;
    const toLinea = i => `${i.ingrediente_nombre} ${parseFloat(i.gramos)||0}g`;
    const mpText  = f.ingredientesMP.filter(i => i.ingrediente_nombre).map(toLinea).join(', ');
    const adText  = f.ingredientesAD.filter(i => i.ingrediente_nombre).map(toLinea).join(', ');
    onContextoFormula(
      `FÓRMULA ACTIVA EN PANTALLA: ${producto.nombre}\n` +
      `Materias Primas: ${mpText || 'ninguna'}\n` +
      `Condimentos/Aditivos: ${adText || 'ninguno'}\n` +
      `Total crudo: ${f.totalCrudoG.toLocaleString()}g | ` +
      `Costo/kg: $${f.costoTotalKg.toFixed(4)} | ` +
      `Precio venta/kg: $${f.precioVentaKg.toFixed(4)}`
    );
    return () => { if (onContextoFormula) onContextoFormula(null); };
  }, [f.ingredientesMP, f.ingredientesAD, f.costoTotalKg]);

  // ── Vista formulador ──────────────────────────────────────
  if (esFormulador) return (
    <VistaFormulador
      producto={producto}         mobile={f.mobile}
      ingredientesMP={f.ingredientesMP}
      ingredientesAD={f.ingredientesAD}
      totMP={f.totMP}             totAD={f.totAD}
      totalCrudoG={f.totalCrudoG} totalCrudoKg={f.totalCrudoKg}
      modalNota={f.modalNota}     setModalNota={f.setModalNota}
      textoNota={f.textoNota}     setTextoNota={f.setTextoNota}
      enviandoNota={f.enviandoNota} enviarNota={f.enviarNota}
      msgExito={f.msgExito}
      onVolver={onVolver}         onVolverMenu={onVolverMenu}
    />
  );

  // ── Vista admin / producción ──────────────────────────────
  return (
    <div style={{
      minHeight:'100vh', background:'#f0f2f5',
      fontFamily:'"Segoe UI", system-ui, sans-serif'
    }}>

      {/* Header */}
      <FormulacionHeader
        producto={producto}
        mobile={f.mobile}
        modoEdicion={f.modoEdicion}
        autoGuardando={f.autoGuardando}
        guardando={f.guardando}
        guardandoHistorial={f.guardandoHistorial}
        config={f.config}           setConfig={f.setConfig}
        userRol={userRol}
        totalCrudoG={f.totalCrudoG}
        totalCostoMP={f.totalCostoMP}
        costoMPkg={f.costoMPkg}
        precioVentaKg={f.precioVentaKg}
        comparadorAbierto={f.comparadorAbierto}
        setComparadorAbierto={f.setComparadorAbierto}
        versionesAbierto={versionesAbierto}
        setVersionesAbierto={setVersionesAbierto}
        seccionActiva={f.seccionActiva}
        setSeccionActiva={f.setSeccionActiva}
        programarAutoGuardado={f.programarAutoGuardado}
        guardar={f.guardar}
        guardarHistorial={f.guardarHistorial}
        setModoEdicion={f.setModoEdicion}
        setModalNota={f.setModalNota}
        imprimir={f.imprimir}
        descargarExcel={f.descargarExcel}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
        onAbrirMaterias={onAbrirMaterias}
      />

      {/* ── Tabs desktop (Fórmula | Materias Primas) ── */}
      {!f.mobile && (
        <div style={{
          display:'flex', background:'white',
          borderBottom:'2px solid #e0e0e0',
          boxShadow:'0 2px 6px rgba(0,0,0,0.06)'
        }}>
          {/* Tab Fórmula — siempre activo */}
          <div style={{
            padding:'12px 24px', fontWeight:'bold', fontSize:'14px',
            color:'#1a1a2e', borderBottom:'3px solid #1a3a5c',
            cursor:'default'
          }}>🧪 Fórmula</div>

          {/* Tab Materias Primas — navega */}
          {onAbrirMaterias && (
            <button
              onClick={onAbrirMaterias}
              style={{
                padding:'12px 24px', fontWeight:'bold', fontSize:'14px',
                color:'#27ae60', border:'none', borderBottom:'3px solid transparent',
                background:'transparent', cursor:'pointer',
                transition:'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderBottomColor = '#27ae60';
                e.currentTarget.style.background = '#f0faf4';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderBottomColor = 'transparent';
                e.currentTarget.style.background = 'transparent';
              }}
            >📦 Materias Primas</button>
          )}
        </div>
      )}

      {/* Mensaje éxito */}
      {f.msgExito && (
        <div style={{
          background:'#d4edda', color:'#155724',
          padding:'10px 16px', fontWeight:'bold',
          fontSize:'13px', textAlign:'center'
        }}>{f.msgExito}</div>
      )}

      <div style={{ padding: f.mobile ? '10px' : '16px 20px' }}>

        {/* Panel Versiones + Comparar — con tabs */}
        {(versionesAbierto || (f.mobile && f.seccionActiva === 'versiones')) && (
          <div>
            {/* Barra de tabs */}
            <div style={{
              display: 'flex', background: 'white',
              borderRadius: '12px 12px 0 0',
              borderBottom: '2px solid #e0e0e0',
              overflow: 'hidden', marginBottom: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              {[
                ['versiones', '🔄 Versiones'],
                ['comparar',  '🔍 Comparar' ],
              ].map(([key, label]) => (
                <button key={key}
                  onClick={() => setTabVersiones(key)}
                  style={{
                    flex: 1, padding: '11px 8px', border: 'none',
                    cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
                    background: tabVersiones === key ? '#1a3a5c' : 'white',
                    color:      tabVersiones === key ? 'white'   : '#555',
                    borderBottom: tabVersiones === key ? '3px solid #2980b9' : '3px solid transparent',
                    transition: 'all 0.2s'
                  }}>{label}</button>
              ))}
            </div>

            {tabVersiones === 'versiones' && (
              <FormulaVersiones
                producto={producto}
                mobile={f.mobile}
                materiasPrimas={f.materiasPrimas}
                ingredientesMP={f.ingredientesMP}
                ingredientesAD={f.ingredientesAD}
                config={f.config}
                costoTotalKg={f.costoTotalKg}
                precioVentaKg={f.precioVentaKg}
                obtenerPrecioLive={f.obtenerPrecioLive}
                onRevertida={f.cargarDatos}
                onCerrar={() => setVersionesAbierto(false)}
              />
            )}

            {tabVersiones === 'comparar' && (
              <PanelComparador
                producto={producto}         mobile={f.mobile}
                ingredientesMP={f.ingredientesMP}
                ingredientesAD={f.ingredientesAD}
                totalCrudoG={f.totalCrudoG}
                fechasDisponibles={f.fechasDisponibles}
                fechaComparar={f.fechaComparar}
                setFechaComparar={f.setFechaComparar}
                formulaAnterior={f.formulaAnterior}
                setFormulaAnterior={f.setFormulaAnterior}
                cargandoCompar={f.cargandoCompar}
                cargarFormulaAnterior={f.cargarFormulaAnterior}
                setComparadorAbierto={() => setVersionesAbierto(false)}
                norm={norm}
              />
            )}
          </div>
        )}

        {/* Vista limpia o edición */}
        {(!f.mobile || f.seccionActiva === 'formula') && (
          <>
            {/* Vista solo lectura */}
            {!f.modoEdicion && (
              <VistaLimpia
                mobile={f.mobile}
                ingredientesMP={f.ingredientesMP}
                ingredientesAD={f.ingredientesAD}
                totMP={f.totMP}             totAD={f.totAD}
                totalCrudoG={f.totalCrudoG} totalCrudoKg={f.totalCrudoKg}
                totalCostoMP={f.totalCostoMP}
                costoMPkg={f.costoMPkg}     costoConMerma={f.costoConMerma}
                costoEmpaqueKg={f.costoEmpaqueKg}
                costoAmarreKg={f.costoAmarreKg}
                costoTotalKg={f.costoTotalKg}
                precioVentaKg={f.precioVentaKg}
                config={f.config}
                materiasPrimas={f.materiasPrimas}
                obtenerPrecioLive={f.obtenerPrecioLive}
                precioFunda={f.precioFunda}
                merma={f.merma}     margen={f.margen}   modCif={f.modCif}
                empPrecio={f.empPrecio} empCantidad={f.empCantidad}
                hiloPrecio={f.hiloPrecio} hiloKg={f.hiloKg}
              />
            )}

            {/* Vista edición */}
            {f.modoEdicion && (
              <>
                <SeccionIngredientes
                  lista={f.ingredientesMP} seccion="MP" colorH="#1a5276"
                  mobile={f.mobile}        modoEdicion={f.modoEdicion}
                  totalCrudoG={f.totalCrudoG}
                  materiasPrimas={f.materiasPrimas}
                  obtenerPrecioLive={f.obtenerPrecioLive}
                  actualizarIng={f.actualizarIng}
                  eliminarFila={f.eliminarFila}
                  agregarFila={f.agregarFila}
                  dragIdx={f.dragIdx}       dragSec={f.dragSec}
                  dragOverIdx={f.dragOverIdx}
                  handleDragStart={f.handleDragStart}
                  handleDragOver={f.handleDragOver}
                  handleDrop={f.handleDrop}
                  setBuscador={f.setBuscador}
                />

                <SeccionIngredientes
                  lista={f.ingredientesAD} seccion="AD" colorH="#6c3483"
                  mobile={f.mobile}        modoEdicion={f.modoEdicion}
                  totalCrudoG={f.totalCrudoG}
                  materiasPrimas={f.materiasPrimas}
                  obtenerPrecioLive={f.obtenerPrecioLive}
                  actualizarIng={f.actualizarIng}
                  eliminarFila={f.eliminarFila}
                  agregarFila={f.agregarFila}
                  dragIdx={f.dragIdx}       dragSec={f.dragSec}
                  dragOverIdx={f.dragOverIdx}
                  handleDragStart={f.handleDragStart}
                  handleDragOver={f.handleDragOver}
                  handleDrop={f.handleDrop}
                  setBuscador={f.setBuscador}
                />

                {/* Total crudo */}
                <div style={{
                  background:'#1a5276', borderRadius:'12px',
                  padding: f.mobile ? '12px 14px' : '12px 20px',
                  marginBottom:'12px',
                  display:'flex', justifyContent:'space-between',
                  alignItems:'center', flexWrap:'wrap', gap:8
                }}>
                  <span style={{
                    color:'white', fontWeight:'bold',
                    fontSize: f.mobile ? '13px' : '15px'
                  }}>TOTAL CRUDO</span>
                  <div style={{ display:'flex', gap: f.mobile ? 14 : 24 }}>
                    {[
                      ['GRAMOS', f.totalCrudoG.toLocaleString(), 'white'   ],
                      ['KILOS',  f.totalCrudoKg.toFixed(3),      'white'   ],
                      ['COSTO',  `$${f.totalCostoMP.toFixed(3)}`, '#f39c12'],
                    ].map(([l, v, col]) => (
                      <div key={l} style={{ textAlign:'center' }}>
                        <div style={{ color:'#aaa', fontSize:'9px', fontWeight:700 }}>{l}</div>
                        <div style={{
                          color:col, fontWeight:'bold',
                          fontSize: f.mobile ? '14px' : '15px'
                        }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Panel costos */}
        {f.modoEdicion && (!f.mobile || f.seccionActiva === 'costos' || f.seccionActiva === 'empaques') && (
          <PanelCostos
            mobile={f.mobile}       modoEdicion={f.modoEdicion}
            config={f.config}       setConfig={f.setConfig}
            costoMPkg={f.costoMPkg}
            costoConMerma={f.costoConMerma}
            costoEmpaqueKg={f.costoEmpaqueKg}
            costoAmarreKg={f.costoAmarreKg}
            costoTotalKg={f.costoTotalKg}
            precioVentaKg={f.precioVentaKg}
            merma={f.merma}         margen={f.margen}     modCif={f.modCif}
            empPrecio={f.empPrecio} empCantidad={f.empCantidad}
            hiloPrecio={f.hiloPrecio} hiloKg={f.hiloKg}
            totalCrudoKg={f.totalCrudoKg}
            precioFunda={f.precioFunda}
            programarAutoGuardado={f.programarAutoGuardado}
            setBuscador={f.setBuscador}
          />
        )}
      </div>

      {/* Modal buscador */}
      <ModalBuscador
        mobile={f.mobile}
        buscador={f.buscador}
        setBuscador={f.setBuscador}
        mpFiltradas={f.mpFiltradas}
        seleccionarMP={f.seleccionarMP}
        getPrecioAgua={f.getPrecioAgua}
      />

      {/* Modal nota */}
      <ModalNota
        mobile={f.mobile}
        producto={producto}
        modalNota={f.modalNota}     setModalNota={f.setModalNota}
        textoNota={f.textoNota}     setTextoNota={f.setTextoNota}
        enviandoNota={f.enviandoNota}
        enviarNota={f.enviarNota}
      />
    </div>
  );
}

export default Formulacion;