// src/components/contabilidad/talonario/TabTalonario.js
import React, { useState } from 'react';
import { useTalonario } from './TalonarioContext';
import ResumenTalonario      from './ResumenTalonario';
import CobrosEfectivo        from './ingresos/CobrosEfectivo';
import CobrosTransferencia   from './ingresos/CobrosTransferencia';
import CobrosCheques         from './ingresos/CobrosCheques';
import OtrosIngresos         from './ingresos/OtrosIngresos';
import GastosEfectivo        from './egresos/GastosEfectivo';
import PagosDelMes           from './egresos/PagosDelMes';
import PagosPersonales       from './egresos/PagosPersonales';
import ServiciosBasicos      from './egresos/ServiciosBasicos';
import ComprasTalonario      from './compras/ComprasTalonario';
import FacturasPersonales    from './compras/FacturasPersonales';
import ExcelExport           from './shared/ExcelExport';
import ExcelImport           from './shared/ExcelImport';
import MovimientosBanco      from './banco/MovimientosBanco';

const GRUPOS = [
  { id: 'resumen',  label: '📊 RESUMEN',   subs: null },
  { id: 'banco',    label: '🏦 BANCO',     subs: null },
  { id: 'ingresos', label: '💵 INGRESOS',   subs: [
    { id: 'cobros_efectivo',       label: 'Cobros Efectivo' },
    { id: 'cobros_transferencia',  label: 'Cobros Transf./Depósito' },
    { id: 'cobros_cheques',        label: 'Cobros Cheques' },
    { id: 'otros_ingresos',        label: 'Otros Ingresos' },
  ]},
  { id: 'egresos',  label: '💸 EGRESOS',   subs: [
    { id: 'gastos_efectivo',    label: 'Gastos Efectivo' },
    { id: 'pagos_mes',          label: 'Pagos del Mes' },
    { id: 'pagos_personales',   label: 'Pagos Personales' },
    { id: 'servicios_basicos',  label: 'Servicios Básicos' },
  ]},
  { id: 'compras',  label: '🛒 COMPRAS',   subs: [
    { id: 'compras_tab',        label: 'Compras' },
    { id: 'facturas_personales',label: 'Facturas Personales' },
  ]},
];

export default function TabTalonario({ onVolver, onVolverMenu }) {
  const { mes, setMes, año, setAño, MESES, esAdminContador } = useTalonario();
  const [seccion,         setSeccion]         = useState('resumen');
  const [grupoAbierto,    setGrupoAbierto]    = useState(null);
  const [showImport,      setShowImport]      = useState(false);

  function seleccionar(id) {
    setSeccion(id);
    setGrupoAbierto(null);
  }

  function toggleGrupo(id) {
    setGrupoAbierto(prev => prev === id ? null : id);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '"Segoe UI",system-ui,sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1a2a4a', color: 'white', padding: '10px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onVolverMenu} style={{
          background:'rgba(255,200,0,0.25)', border:'1px solid rgba(255,200,0,0.4)',
          color:'#ffd700', padding:'7px 12px', borderRadius:8, cursor:'pointer',
          fontSize:12, fontWeight:'bold'
        }}>🏠 Menú</button>
        <button onClick={onVolver} style={{
          background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
          color:'white', padding:'7px 14px', borderRadius:8, cursor:'pointer', fontSize:12
        }}>← Volver</button>
        <span style={{ fontWeight: 'bold', fontSize: 15 }}>📒 TALONARIO</span>

        {/* Selector mes/año */}
        <select value={mes} onChange={e => setMes(Number(e.target.value))}
          style={{ padding: '4px 8px', borderRadius: 6, border: 'none', fontSize: 13 }}>
          {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={año} onChange={e => setAño(Number(e.target.value))}
          style={{ padding: '4px 8px', borderRadius: 6, border: 'none', fontSize: 13 }}>
          {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExcelExport />
          {esAdminContador && (
            <button onClick={() => setShowImport(true)}
              style={{ background: '#2980b9', color: 'white', border: 'none',
                borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}>
              📤 Subir Historial Excel
            </button>
          )}
        </div>
      </div>

      {/* Pestañas grupos */}
      <div style={{ display: 'flex', background: 'white', borderBottom: '2px solid #1a2a4a',
                    fontSize: 12, position: 'relative' }}>
        {GRUPOS.map(g => (
          <div key={g.id} style={{ position: 'relative' }}>
            <button
              onClick={() => g.subs ? toggleGrupo(g.id) : seleccionar(g.id)}
              style={{
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 12,
                background: seccion === g.id || (g.subs && g.subs.some(s => s.id === seccion))
                  ? '#1a2a4a' : 'transparent',
                color: seccion === g.id || (g.subs && g.subs.some(s => s.id === seccion))
                  ? 'white' : '#333',
              }}>
              {g.label}{g.subs ? ' ▾' : ''}
            </button>
            {/* Submenú desplegable */}
            {g.subs && grupoAbierto === g.id && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 100,
                background: 'white', border: '1px solid #ddd', borderRadius: '0 0 8px 8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 200,
              }}>
                {g.subs.map(s => (
                  <button key={s.id} onClick={() => seleccionar(s.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 16px', border: 'none', cursor: 'pointer',
                      background: seccion === s.id ? '#eaf4ff' : 'transparent',
                      color: seccion === s.id ? '#1a2a4a' : '#333',
                      fontWeight: seccion === s.id ? 'bold' : 'normal',
                      fontSize: 12,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ padding: 16 }}>
        {seccion === 'resumen'              && <ResumenTalonario />}
        {seccion === 'banco'                && <MovimientosBanco />}
        {seccion === 'cobros_efectivo'      && <CobrosEfectivo />}
        {seccion === 'cobros_transferencia' && <CobrosTransferencia />}
        {seccion === 'cobros_cheques'       && <CobrosCheques />}
        {seccion === 'otros_ingresos'       && <OtrosIngresos />}
        {seccion === 'gastos_efectivo'      && <GastosEfectivo />}
        {seccion === 'pagos_mes'            && <PagosDelMes />}
        {seccion === 'pagos_personales'     && <PagosPersonales />}
        {seccion === 'servicios_basicos'    && <ServiciosBasicos />}
        {seccion === 'compras_tab'          && <ComprasTalonario />}
        {seccion === 'facturas_personales'  && <FacturasPersonales />}
      </div>

      {showImport && (
        <ExcelImport
          onClose={() => setShowImport(false)}
          onImportado={(mesImportado, añoImportado) => {
            setMes(mesImportado);
            setAño(añoImportado);
          }}
        />
      )}
    </div>
  );
}
