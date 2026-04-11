// ============================================
// AuditoriaStats.js
// Tarjetas resumen de auditoría
// ============================================
import React from 'react';

export default function AuditoriaStats({
  mobile,
  registros,
  registrosHoy,
  cambiosPrecios,
  producciones,
  noLeidas,
}) {
  const stats = [
    {
      label: 'TOTAL REGISTROS',
      val:   registros.length,
      color: '#1a5276',
      bg:    '#e8f4fd',
    },
    {
      label: 'HOY',
      val:   registrosHoy,
      color: '#155724',
      bg:    '#d4edda',
    },
    {
      label: 'CAMBIOS PRECIO',
      val:   cambiosPrecios,
      color: '#721c24',
      bg:    '#f8d7da',
    },
    {
      label: 'PRODUCCIONES',
      val:   producciones,
      color: '#856404',
      bg:    '#fff3cd',
    },
  ];

  return (
    <div style={{
      display:'grid',
      gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)',
      gap:'10px', marginBottom:'14px'
    }}>
      {stats.map(s => (
        <div key={s.label} style={{
          background:s.bg, borderRadius:'10px', padding:'10px 14px'
        }}>
          <div style={{
            fontSize:'10px', color:s.color,
            fontWeight:'700', marginBottom:'4px'
          }}>{s.label}</div>
          <div style={{
            fontSize: mobile ? '18px' : '22px',
            fontWeight:'700', color:s.color
          }}>{s.val}</div>
        </div>
      ))}
    </div>
  );
}