import React, { useState } from 'react';

const MODULE_META = {
  produccion_inyeccion:      { label: 'Producción',  warn: 'Verifica inventario MP — posible desface',          link: 'inventario'   },
  produccion_diaria:         { label: 'Producción',  warn: 'Verifica inventario MP — posible desface',          link: 'inventario'   },
  lotes_maduracion:          { label: 'Maduración',  warn: 'Verifica stock de lotes',                           link: 'inventario'   },
  inventario_mp:             { label: 'Inventario',  warn: 'Stock puede estar incorrecto',                      link: 'inventario'   },
  inventario_movimientos:    { label: 'Inventario',  warn: 'Stock puede estar incorrecto',                      link: 'inventario'   },
  facturas:                  { label: 'Facturación', warn: 'Factura no emitida al SRI — re-emitir manualmente', link: 'facturacion'  },
  facturas_detalle:          { label: 'Facturación', warn: 'Factura no emitida al SRI — re-emitir manualmente', link: 'facturacion'  },
  compras:                   { label: 'Compras',     warn: 'Ingreso de MP puede no haberse registrado',         link: 'compras'      },
  compras_detalle:           { label: 'Compras',     warn: 'Ingreso de MP puede no haberse registrado',         link: 'compras'      },
  nomina:                    { label: 'RRHH',        warn: 'Sin riesgo inmediato',                              link: null           },
  empleados:                 { label: 'RRHH',        warn: 'Sin riesgo inmediato',                              link: null           },
};

export default function OfflineBanner({
  isOnline, queueCount, syncErrors, isSyncing, lastSynced,
  onRetry, onDiscard, onNavigate,
  borradoresCount = 0, isSyncingBorradores = false, lastBorradorSync = null,
}) {
  const [expanded, setExpanded] = useState(false);

  const isActive   = isSyncing || isSyncingBorradores;
  const hasErrors  = syncErrors.length > 0;

  const dotColor = !isOnline
    ? '#ef4444'
    : hasErrors
      ? '#f59e0b'
      : isActive
        ? '#facc15'
        : '#22c55e';

  const label = !isOnline ? 'Sin conexión' : 'Conectado';

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

      {/* ── Indicador pequeño fijo ── */}
      <div style={{
        position: 'fixed',
        top: 10,
        left: 14,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(0,0,0,0.52)',
        borderRadius: 20,
        padding: '4px 10px 4px 8px',
        fontSize: 11,
        color: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        cursor: hasErrors ? 'pointer' : 'default',
        userSelect: 'none',
      }} onClick={() => hasErrors && setExpanded(e => !e)}>

        <div style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: dotColor,
          boxShadow: `0 0 5px ${dotColor}`,
          flexShrink: 0,
          animation: isActive ? 'pulse-dot 1s ease-in-out infinite' : 'none',
        }} />

        <span style={{ fontWeight: 500 }}>{label}</span>

        {hasErrors && (
          <span style={{
            background: '#ef4444',
            borderRadius: 10,
            padding: '1px 5px',
            fontSize: 10,
            fontWeight: 700,
            marginLeft: 2,
          }}>
            {syncErrors.length}
          </span>
        )}
      </div>

      {/* ── Panel de errores (solo si hay y el usuario lo abre) ── */}
      {expanded && hasErrors && (
        <div style={{
          position: 'fixed',
          top: 36,
          left: 14,
          zIndex: 9998,
          width: 320,
          background: '#1c1917',
          border: '1px solid #44403c',
          borderRadius: 10,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 12 }}>
              ⚠️ {syncErrors.length} error{syncErrors.length > 1 ? 'es' : ''} al sincronizar
            </span>
            <button onClick={() => setExpanded(false)} style={{
              background: 'none', border: 'none', color: '#a8a29e',
              cursor: 'pointer', fontSize: 16, lineHeight: 1,
            }}>×</button>
          </div>

          {syncErrors.map(item => {
            const meta = MODULE_META[item.table] || { label: item.table, warn: null, link: null };
            return (
              <div key={item.id} style={{
                background: '#292524', borderRadius: 8, padding: '8px 10px',
                border: '1px solid #57534e', fontSize: 11, color: '#e7e5e4',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, color: '#fb923c' }}>❌ {meta.label}</span>
                  <button onClick={() => onDiscard(item.id)} style={{
                    background: 'none', border: 'none', color: '#a8a29e',
                    cursor: 'pointer', fontSize: 15, lineHeight: 1,
                  }}>×</button>
                </div>
                <div style={{ color: '#f87171', fontSize: 10, marginBottom: 5 }}>{item.error}</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={() => onRetry(item.id)} style={{
                    background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)',
                    color: '#60a5fa', borderRadius: 5, padding: '2px 8px',
                    cursor: 'pointer', fontSize: 10,
                  }}>🔁 Reintentar</button>
                  {meta.link && onNavigate && (
                    <button onClick={() => onNavigate(meta.link)} style={{
                      background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                      color: '#fbbf24', borderRadius: 5, padding: '2px 8px',
                      cursor: 'pointer', fontSize: 10,
                    }}>📦 Ir a {meta.label}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
