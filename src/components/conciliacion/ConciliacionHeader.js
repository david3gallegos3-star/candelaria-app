// ============================================
// ConciliacionHeader.js
// Header sticky del módulo de conciliación
// ============================================
import React from 'react';

const TABS = [
  { key: 'inventario',  emoji: '📦', label: 'Inventario'  },
  { key: 'precios',     emoji: '💰', label: 'Precios'     },
  { key: 'produccion',  emoji: '🏭', label: 'Producción'  },
  { key: 'ia',          emoji: '🤖', label: 'Análisis IA' },
];

export default function ConciliacionHeader({
  mobile, tabActiva, setTabActiva,
  onVolver, onVolverMenu
}) {
  const btnBase = {
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: '13px',
    minHeight: mobile ? 40 : 0
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
      padding: mobile ? '10px 12px' : '12px 20px',
      position: 'sticky', top: 0, zIndex: 100,
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)'
    }}>
      {/* Fila superior */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : 8 }}>
          <button onClick={onVolverMenu} style={{
            ...btnBase,
            background: 'rgba(255,200,0,0.25)', color: '#ffd700',
            padding: mobile ? '8px 10px' : '7px 12px',
            border: '1px solid rgba(255,200,0,0.4)', fontSize: '12px'
          }}>🏠 Menú</button>

          <button onClick={onVolver} style={{
            ...btnBase,
            background: 'rgba(255,255,255,0.15)', color: 'white',
            padding: mobile ? '8px 12px' : '7px 14px',
            border: '1px solid rgba(255,255,255,0.25)'
          }}>← Volver</button>

          <div style={{
            color: 'white', fontWeight: 'bold',
            fontSize: mobile ? '14px' : '17px'
          }}>
            🔍 Conciliación
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '10px', padding: '4px'
      }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setTabActiva(t.key)}
            style={{
              flex: 1,
              padding: mobile ? '8px 4px' : '9px 8px',
              border: 'none', borderRadius: '7px', cursor: 'pointer',
              fontSize: mobile ? '11px' : '12px', fontWeight: 'bold',
              background: tabActiva === t.key
                ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: tabActiva === t.key ? 'white' : '#aaa',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}>
            {t.emoji} {mobile ? t.label.split(' ')[0] : t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
