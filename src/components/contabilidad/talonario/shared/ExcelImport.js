// src/components/contabilidad/talonario/shared/ExcelImport.js
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { parseTodasLasHojas, verificarMesNoImportado, ejecutarImport } from '../../../../utils/importExcelHistorial';

export default function ExcelImport({ onClose, onImportado }) {
  const [estado, setEstado] = useState('upload'); // upload | procesando | error | exito
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setEstado('procesando');
    setError('');

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });

      const datos = parseTodasLasHojas(wb);
      await verificarMesNoImportado(datos.mes, datos.año);
      const conteos = await ejecutarImport(datos);

      setResultado({ mes: datos.mes, año: datos.año, conteos });
      setEstado('exito');
      onImportado?.(datos.mes, datos.año);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setEstado('error');
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 480,
        maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>📤 Subir Historial Excel</h3>
          <button onClick={estado === 'procesando' ? undefined : onClose} disabled={estado === 'procesando'}
            style={{ background: 'none', border: 'none', fontSize: 20, color: '#999',
              cursor: estado === 'procesando' ? 'default' : 'pointer',
              opacity: estado === 'procesando' ? 0.4 : 1 }}>×</button>
        </div>

        {estado === 'upload' && (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              Selecciona el Excel mensual de la contadora. El sistema detecta el mes automáticamente
              y reparte cada hoja en la pestaña correcta del Talonario. Si algo falla, no se guarda nada.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'block' }} />
          </div>
        )}

        {estado === 'procesando' && (
          <div style={{ padding: 24, textAlign: 'center', color: '#2980b9' }}>⏳ Procesando...</div>
        )}

        {estado === 'error' && (
          <div>
            <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: 8,
              padding: 14, color: '#c0392b', fontSize: 13, marginBottom: 16 }}>
              ⚠️ {error}
            </div>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>No se guardó nada en el sistema. Corrige el archivo e intenta de nuevo.</p>
            <button onClick={() => setEstado('upload')} style={{ padding: '8px 16px', borderRadius: 6,
              border: 'none', background: '#2980b9', color: 'white', cursor: 'pointer', fontSize: 13 }}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {estado === 'exito' && resultado && (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12 }}>
              Importado {resultado.mes}/{resultado.año}
            </div>
            <div style={{ textAlign: 'left', fontSize: 13, color: '#555', marginBottom: 16 }}>
              <div>Gastos: {resultado.conteos.gastos}</div>
              <div>Cobros: {resultado.conteos.cobros}</div>
              <div>Pagos del mes: {resultado.conteos.pagosDelMes}</div>
              <div>Pagos personales: {resultado.conteos.pagosPersonales}</div>
              <div>Compras empresa: {resultado.conteos.comprasEmpresa}</div>
              <div>Facturas personales: {resultado.conteos.comprasPersonal}</div>
              {resultado.conteos.saldoBancoReal !== undefined && (
                <div>Saldo banco real: ${resultado.conteos.saldoBancoReal.toFixed(2)}</div>
              )}
            </div>
            <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 6, border: 'none',
              background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 14 }}>
              Cerrar y revisar el mes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
