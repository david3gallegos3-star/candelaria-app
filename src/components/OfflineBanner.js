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

function getMeta(table) {
  return MODULE_META[table] || { label: table, warn: null, link: null };
}

export default function OfflineBanner({
  isOnline, queueCount, syncErrors, isSyncing, lastSynced,
  onRetry, onDiscard, onNavigate,
  borradoresCount = 0, isSyncingBorradores = false, lastBorradorSync = null,
}) {
  const [expanded,          setExpanded]          = useState(false);
  const [showSuccess,       setShowSuccess]       = useState(false);
  const [showBorrSuccess,   setShowBorrSuccess]   = useState(false);

  React.useEffect(() => {
    if (lastSynced) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [lastSynced]);

  React.useEffect(() => {
    if (lastBorradorSync) {
      setShowBorrSuccess(true);
      const t = setTimeout(() => setShowBorrSuccess(false), 6000);
      return () => clearTimeout(t);
    }
  }, [lastBorradorSync]);

  const hasActivity = !isOnline || queueCount > 0 || syncErrors.length > 0
    || isSyncing || borradoresCount > 0 || isSyncingBorradores
    || showSuccess || showBorrSuccess;

  if (!hasActivity) return null;

  const bgColor = !isOnline
    ? '#991b1b'
    : (isSyncing || isSyncingBorradores)
      ? '#92400e'
      : syncErrors.length > 0
        ? '#7c2d12'
        : '#14532d';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, fontFamily: 'Arial, sans-serif' }}>

      {/* ── Barra principal ────────────────────────────── */}
      <div style={{
        background: bgColor, color: 'white',
        padding: '8px 16px', fontSize: '13px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>
          {!isOnline && (
            <>
              🔴 Sin conexión
              {queueCount > 0 && ` · ${queueCount} operación${queueCount > 1 ? 'es' : ''} pendiente${queueCount > 1 ? 's' : ''}`}
              {borradoresCount > 0 && ` · ${borradoresCount} factura${borradoresCount > 1 ? 's' : ''} sin emitir al SRI`}
            </>
          )}
          {isOnline && isSyncingBorradores && `🟡 Emitiendo ${borradoresCount} factura${borradoresCount > 1 ? 's' : ''} al SRI...`}
          {isOnline && !isSyncingBorradores && isSyncing && `🟡 Sincronizando...`}
          {isOnline && !isSyncing && !isSyncingBorradores && syncErrors.length > 0 && `⚠️ ${syncErrors.length} error${syncErrors.length > 1 ? 'es' : ''} al sincronizar`}
          {isOnline && !isSyncing && !isSyncingBorradores && syncErrors.length === 0 && showBorrSuccess && `🟢 ${lastBorradorSync?.count} factura${lastBorradorSync?.count > 1 ? 's' : ''} emitida${lastBorradorSync?.count > 1 ? 's' : ''} al SRI`}
          {isOnline && !isSyncing && !isSyncingBorradores && syncErrors.length === 0 && !showBorrSuccess && showSuccess && `🟢 Sincronizado · ${lastSynced?.count} operación${lastSynced?.count > 1 ? 'es' : ''} enviada${lastSynced?.count > 1 ? 's' : ''}`}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {syncErrors.length > 0 && (
            <button onClick={() => setExpanded(e => !e)} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
              borderRadius: '6px', padding: '2px 10px', cursor: 'pointer', fontSize: '12px',
            }}>
              {expanded ? 'Ocultar' : 'Ver errores'}
            </button>
          )}
        </div>
      </div>

      {/* ── Panel de errores ────────────────────────────── */}
      {expanded && syncErrors.length > 0 && (
        <div style={{
          background: '#1c1917', borderBottom: '1px solid #44403c',
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          {syncErrors.map(item => {
            const meta = getMeta(item.table);
            return (
              <div key={item.id} style={{
                background: '#292524', borderRadius: '8px', padding: '10px 12px',
                border: '1px solid #57534e', fontSize: '12px', color: '#e7e5e4',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#fb923c' }}>❌ {meta.label}</span>
                    <span style={{ color: '#a8a29e', marginLeft: '8px' }}>
                      {item.operation} · {new Date(item.timestamp).toLocaleTimeString('es-EC')}
                    </span>
                  </div>
                  <button onClick={() => onDiscard(item.id)} style={{
                    background: 'none', border: 'none', color: '#a8a29e',
                    cursor: 'pointer', fontSize: '16px', lineHeight: 1,
                  }} title="Descartar">×</button>
                </div>

                <div style={{ color: '#f87171', fontSize: '11px', marginBottom: '6px' }}>
                  {item.error}
                </div>

                {meta.warn && (
                  <div style={{ color: '#fbbf24', fontSize: '11px', marginBottom: '8px' }}>
                    ⚠️ {meta.warn}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => onRetry(item.id)} style={{
                    background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)',
                    color: '#60a5fa', borderRadius: '6px', padding: '3px 10px',
                    cursor: 'pointer', fontSize: '11px',
                  }}>🔁 Reintentar</button>

                  {meta.link && onNavigate && (
                    <button onClick={() => onNavigate(meta.link)} style={{
                      background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                      color: '#fbbf24', borderRadius: '6px', padding: '3px 10px',
                      cursor: 'pointer', fontSize: '11px',
                    }}>📦 Ir a {meta.label}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
