import React from 'react';

export default function DispositivoBloqueado({ estado, onReverificar }) {
  const esPendiente = estado === 'pendiente';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0d1b2a,#1a2a3a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${esPendiente ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)'}`,
        borderRadius: '16px',
        padding: '48px 36px',
        textAlign: 'center',
        maxWidth: '380px',
        width: '100%',
      }}>
        <div style={{ fontSize: '56px', marginBottom: '20px' }}>
          {esPendiente ? '⏳' : '🚫'}
        </div>

        <div style={{
          color: 'white', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px',
        }}>
          {esPendiente ? 'Dispositivo pendiente de aprobación' : 'Acceso denegado'}
        </div>

        <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.6', marginBottom: '28px' }}>
          {esPendiente
            ? 'Tu solicitud fue enviada al administrador. Espera la aprobación.'
            : 'Este dispositivo no tiene acceso. Contacta al administrador.'}
        </div>

        {esPendiente && (
          <button
            onClick={onReverificar}
            style={{
              background: 'rgba(59,130,246,0.2)',
              border: '1.5px solid rgba(59,130,246,0.5)',
              color: '#60a5fa',
              borderRadius: '10px',
              padding: '10px 24px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            Verificar de nuevo
          </button>
        )}
      </div>
    </div>
  );
}
