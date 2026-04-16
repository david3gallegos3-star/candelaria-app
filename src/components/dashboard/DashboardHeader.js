// ============================================
// DashboardHeader.js
// Header del Dashboard Ejecutivo con tabs
// ============================================
import React from 'react';

const TABS = [
  { k: 'kpis',     label: '📊 KPIs'    },
  { k: 'alertas',  label: '🚨 Alertas' },
  { k: 'graficas', label: '📈 Gráficas' },
];

export default function DashboardHeader({ tabActiva, setTabActiva, onVolver, onVolverMenu, mobile }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
      color: 'white',
      padding: mobile ? '12px' : '16px 24px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)'
    }}>
      {/* Fila superior */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onVolver} style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            color: 'white', borderRadius: '8px', padding: '6px 12px',
            cursor: 'pointer', fontSize: '12px'
          }}>← Volver</button>
          <div>
            <div style={{ fontSize: mobile ? '16px' : '20px', fontWeight: 'bold' }}>
              📊 Dashboard Ejecutivo
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
              Vista consolidada del negocio
            </div>
          </div>
        </div>
        <button onClick={onVolverMenu} style={{
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          color: 'white', borderRadius: '8px', padding: '6px 12px',
          cursor: 'pointer', fontSize: '12px'
        }}>🏠 Menú</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTabActiva(t.k)} style={{
            padding: '8px 18px', borderRadius: '20px',
            fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
            border: tabActiva === t.k ? 'none' : '1px solid rgba(255,255,255,0.3)',
            background: tabActiva === t.k ? 'rgba(255,255,255,0.25)' : 'transparent',
            color: 'white',
            transition: 'all 0.2s'
          }}>{t.label}</button>
        ))}
      </div>
    </div>
  );
}
