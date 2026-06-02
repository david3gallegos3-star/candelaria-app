// src/components/contabilidad/talonario/shared/ExcelImport.js
import React, { useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';

const TABLA_MAP = {
  'GASTOS EFECTIVO':        { tabla: null, nota: 'Solo lectura — proviene de Caja Chica' },
  'COBROS EFECTIVO':        { tabla: null, nota: 'Solo lectura — proviene de Cobros' },
  'COBROS TRANSF-DEP':      { tabla: null, nota: 'Solo lectura — proviene de Cobros' },
  'COBROS CHEQUES':         { tabla: null, nota: 'Solo lectura — proviene de Cobros' },
  'COMPRAS':                { tabla: null, nota: 'Solo lectura — proviene de Compras' },
  'PAGOS MES':              { tabla: 'talonario_pagos_banco' },
  'OTROS PAGOS PERSONALES': { tabla: 'talonario_pagos_personales' },
  'COMPRAS PERSONAL':       { tabla: 'talonario_facturas_personales' },
};

export default function ExcelImport({ onClose }) {
  const { mes, año } = useTalonario();
  const [paso,       setPaso]       = useState('upload');
  const [analisis,   setAnalisis]   = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAnalizando(true);

    try {
      const XLSX = await import('xlsx');
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });

      const hojas = wb.SheetNames.map(nombre => {
        const ws   = wb.Sheets[nombre];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        return { nombre, rows };
      });

      const hojasTxt = hojas.map(h =>
        `=== HOJA: ${h.nombre} ===\n` + h.rows.map(r => r.join('\t')).join('\n')
      ).join('\n\n');

      const resp = await supabase.functions.invoke('analizar-talonario', {
        body: { contenido: hojasTxt, mes, año }
      });

      if (resp.error) throw new Error(resp.error.message);
      setAnalisis(resp.data);
      setPaso('preview');
    } catch (err) {
      alert('Error al analizar: ' + err.message);
    }
    setAnalizando(false);
  }

  async function importarSeleccionados(modo) {
    setImportando(true);
    try {
      for (const hoja of analisis.hojas || []) {
        const info = TABLA_MAP[hoja.nombre];
        if (!info?.tabla || !hoja.filas?.length) continue;

        let filasAInsertar = hoja.filas;
        if (modo === 'new') {
          const { data: exist } = await supabase
            .from(info.tabla).select('fecha,monto').eq('mes', mes).eq('año', año);
          const claves = new Set((exist||[]).map(r => `${r.fecha}_${r.monto}`));
          filasAInsertar = hoja.filas.filter(f => !claves.has(`${f.fecha}_${f.monto}`));
        }

        if (filasAInsertar.length > 0) {
          const payload = filasAInsertar.map(f => ({ ...f, mes, año }));
          await supabase.from(info.tabla).insert(payload);
        }
      }
      setPaso('done');
    } catch (err) {
      alert('Error al importar: ' + err.message);
    }
    setImportando(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 520,
        maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>📤 Subir Excel histórico</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        {paso === 'upload' && (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              Selecciona el archivo Excel del talonario para cargarlo como datos históricos de {mes}/{año}.
              Las secciones de solo lectura (Cobros, Compras, Gastos) serán ignoradas.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile}
              style={{ display: 'block', marginBottom: 12 }} />
            {analizando && (
              <div style={{ padding: 16, textAlign: 'center', color: '#2980b9' }}>
                ⏳ Analizando con IA...
              </div>
            )}
          </div>
        )}

        {paso === 'preview' && analisis && (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              La IA encontró los siguientes datos para importar:
            </p>
            {(analisis.hojas || []).map(hoja => {
              const info = TABLA_MAP[hoja.nombre];
              return (
                <div key={hoja.nombre} style={{ marginBottom: 12, padding: '10px 14px',
                  background: '#f8f9fa', borderRadius: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                    {hoja.nombre}
                    {!info?.tabla && <span style={{ color: '#e74c3c', fontWeight: 'normal', marginLeft: 8, fontSize: 12 }}>(solo lectura — no se importará)</span>}
                  </div>
                  {info?.tabla && (
                    <div style={{ color: '#555' }}>
                      {hoja.filas?.length || 0} filas encontradas
                      {typeof hoja.nuevas === 'number' && ` · ${hoja.nuevas} nuevas`}
                    </div>
                  )}
                  {info?.nota && <div style={{ color: '#888', fontSize: 12 }}>{info.nota}</div>}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6,
                border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={() => importarSeleccionados('new')} disabled={importando}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: '#2980b9', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {importando ? '⏳ Importando...' : 'Solo las nuevas'}
              </button>
              <button onClick={() => importarSeleccionados('all')} disabled={importando}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 13 }}>
                {importando ? '⏳ Importando...' : 'Importar todo'}
              </button>
            </div>
          </div>
        )}

        {paso === 'done' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 8 }}>¡Importación completada!</div>
            <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 6, border: 'none',
              background: '#27ae60', color: 'white', cursor: 'pointer', fontSize: 14 }}>
              Cerrar
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
