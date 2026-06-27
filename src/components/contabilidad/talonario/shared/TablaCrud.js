// src/components/contabilidad/talonario/shared/TablaCrud.js
import React from 'react';

const FORMAS_PAGO = [
  { value: '01', label: 'Efectivo (01)' },
  { value: '16', label: 'Débito (16)' },
  { value: '19', label: 'Crédito (19)' },
  { value: '20', label: 'Transf./Cheque/Depósito (20)' },
];

export { FORMAS_PAGO };

export function TablaCrud({
  titulo,
  filas,
  columnas,
  campoMonto,
  cargando,
  esAdminContador,
  onAgregar,
  onEditar,
  onEliminar,
  filaStyle,
}) {
  const total = filas.reduce((s, f) => s + parseFloat(f[campoMonto] || 0), 0);

  return (
    <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: '#1a2a4a' }}>{titulo}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: 14 }}>
            Total: ${total.toFixed(2)}
          </span>
          {esAdminContador && (
            <button onClick={onAgregar}
              style={{ background: '#27ae60', color: 'white', border: 'none',
                borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
              + Agregar
            </button>
          )}
        </div>
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
                {esAdminContador && <th style={{ padding: '8px 10px', borderBottom: '2px solid #e0e0e0' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.id || i} style={{ borderBottom: '1px solid #f0f0f0', ...(filaStyle ? filaStyle(f) : {}) }}>
                  {columnas.map(c => (
                    <td key={c.key} style={{ padding: '7px 10px', textAlign: c.align || 'left' }}>
                      {c.render ? c.render(f) : (f[c.key] || '—')}
                    </td>
                  ))}
                  {esAdminContador && (
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => onEditar(f)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: '#2980b9', fontSize: 13, marginRight: 8 }}>✏️</button>
                      <button onClick={() => { if(window.confirm('¿Eliminar este registro?')) onEliminar(f.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: '#e74c3c', fontSize: 13 }}>🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
