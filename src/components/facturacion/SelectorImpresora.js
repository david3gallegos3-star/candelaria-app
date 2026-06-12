import React, { useEffect, useState } from 'react';
import { listarImpresorasQz, QZ_PRINTER_KEY } from '../../utils/imprimirTicket';

export default function SelectorImpresora({ onClose }) {
  const [impresoras, setImpresoras] = useState(null);
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState(null);
  const [seleccion,  setSeleccion]  = useState('');

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const lista = await listarImpresorasQz();
      const impresorasArr = Array.isArray(lista) ? lista : [lista];
      setImpresoras(impresorasArr);
      const guardada = localStorage.getItem(QZ_PRINTER_KEY) || '';
      setSeleccion(impresorasArr.includes(guardada) ? guardada : '');
    } catch (e) {
      setError(e.message || 'No se pudo conectar con QZ Tray');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function guardar() {
    if (seleccion) localStorage.setItem(QZ_PRINTER_KEY, seleccion);
    else localStorage.removeItem(QZ_PRINTER_KEY);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, width: 380, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>🖨️ Impresora de tickets</h3>

        {cargando && (
          <p style={{ fontSize: 13, color: '#555' }}>Buscando impresoras...</p>
        )}

        {!cargando && error && (
          <>
            <p style={{ fontSize: 13, color: '#e74c3c', marginBottom: 12 }}>
              No se pudo conectar con QZ Tray. Verifica que esté abierto.
            </p>
            <button onClick={cargar}
              style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                background: 'white', cursor: 'pointer', fontSize: 13, marginBottom: 12 }}>
              Reintentar
            </button>
          </>
        )}

        {!cargando && !error && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
              Impresora a usar en esta PC
            </label>
            <select value={seleccion} onChange={e => setSeleccion(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
              <option value="">Predeterminada del sistema</option>
              {impresoras.map(nombre => (
                <option key={nombre} value={nombre}>{nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
          {!cargando && !error && (
            <button onClick={guardar}
              style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                background: '#8e44ad', color: 'white', cursor: 'pointer', fontSize: 13 }}>
              Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
