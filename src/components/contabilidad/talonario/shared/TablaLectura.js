// src/components/contabilidad/talonario/shared/TablaLectura.js
import React from 'react';

const SRI_LABELS = { '01': 'Efectivo', '16': 'Débito', '19': 'Crédito', '20': 'Transf./Cheque/Depósito' };

export function SriLabel({ codigo }) {
  return <span>{SRI_LABELS[codigo] || codigo || '—'} {codigo ? `(${codigo})` : ''}</span>;
}

export function TablaLectura({ titulo, filas, columnas, cargando, campoMonto }) {
  const total = filas.reduce((s, f) => s + parseFloat(f[campoMonto] || 0), 0);

  return (
    <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: '#1a2a4a' }}>{titulo}</h3>
        <span style={{ color: '#27ae60', fontWeight: 'bold', fontSize: 14 }}>
          Total: ${total.toFixed(2)}
        </span>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Cargando...</div>
      ) : filas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>
          Sin registros para este mes
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {columnas.map(c => (
                  <th key={c.key} style={{
                    padding: '8px 10px', textAlign: c.align || 'left',
                    borderBottom: '2px solid #e0e0e0', color: '#555', fontWeight: 'bold',
                  }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.id || i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  {columnas.map(c => (
                    <td key={c.key} style={{ padding: '7px 10px', textAlign: c.align || 'left' }}>
                      {c.render ? c.render(f) : (f[c.key] || '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
