import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import EstadoResultados    from './EstadoResultados';
import BalanceGeneral      from './BalanceGeneral';
import LibroMayor          from './LibroMayor';
import BalanceComprobacion from './BalanceComprobacion';

const EMPRESA = 'Embutidos y Jamones Candelaria';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const REPORTES = [
  { id: 'estado_resultados',    label: '📊 Estado de Resultados' },
  { id: 'balance_general',      label: '⚖️ Balance General' },
  { id: 'libro_mayor',          label: '📒 Libro Mayor' },
  { id: 'balance_comprobacion', label: '✅ Balance de Comprobación' },
];

function ultimoDiaMes(mes, año) {
  return new Date(año, mes, 0).toISOString().split('T')[0];
}

export default function TabReportes({ onVolver, onVolverMenu }) {
  const hoy = new Date();
  const [reporteActivo, setReporteActivo] = useState('estado_resultados');
  const [modoFiltro,    setModoFiltro]    = useState('mes');
  const [mes,           setMes]           = useState(hoy.getMonth() + 1);
  const [año,           setAño]           = useState(hoy.getFullYear());
  const [desde,         setDesde]         = useState('');
  const [hasta,         setHasta]         = useState('');

  const fechaDesde = modoFiltro === 'mes'
    ? `${año}-${String(mes).padStart(2,'0')}-01`
    : desde;
  const fechaHasta = modoFiltro === 'mes'
    ? ultimoDiaMes(mes, año)
    : hasta;

  function exportarPDF() {
    window.print();
  }

  function exportarExcel() {
    const tabla = document.querySelector('#reporte-imprimible table');
    if (!tabla) { alert('No hay tabla para exportar en este reporte'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(tabla);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `reporte_${reporteActivo}_${fechaDesde}_${fechaHasta}.xlsx`);
  }

  const componenteProps = { fechaDesde, fechaHasta, empresa: EMPRESA };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          #reporte-imprimible { margin: 0; padding: 0; }
          body { font-size: 11px; }
        }
      `}</style>

      <div className="no-print">
        <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
          {onVolverMenu && (
            <button onClick={onVolverMenu} style={{ background:'#1a2a4a', color:'#ffd700',
              border:'1px solid rgba(255,200,0,0.4)', borderRadius:8,
              padding:'8px 14px', cursor:'pointer', fontSize:13, fontWeight:'bold' }}>
              🏠 Menú
            </button>
          )}
          {onVolver && (
            <button onClick={onVolver} style={{ background:'#f0f2f5', border:'none',
              borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13 }}>
              ← Volver
            </button>
          )}
          <div style={{ fontWeight:'bold', fontSize:16, color:'#1a2a4a', flex:1 }}>
            📊 Reportes Contables
          </div>
          <button onClick={exportarPDF} style={{ background:'#e74c3c', color:'white',
            border:'none', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:12 }}>
            📄 PDF
          </button>
          <button onClick={exportarExcel} style={{ background:'#27ae60', color:'white',
            border:'none', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:12 }}>
            📊 Excel
          </button>
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {REPORTES.map(r => (
            <button key={r.id} onClick={() => setReporteActivo(r.id)} style={{
              padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer',
              background: reporteActivo === r.id ? '#1a2a4a' : '#f0f2f5',
              color: reporteActivo === r.id ? 'white' : '#555',
              fontWeight: reporteActivo === r.id ? 'bold' : 'normal', fontSize:12,
            }}>{r.label}</button>
          ))}
        </div>

        <div style={{ background:'white', borderRadius:10, padding:'14px 16px',
          boxShadow:'0 1px 4px rgba(0,0,0,0.08)', marginBottom:20, display:'flex',
          gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:4 }}>
            {['mes','rango'].map(m => (
              <button key={m} onClick={() => setModoFiltro(m)} style={{
                padding:'6px 12px', borderRadius:6, border:'none', cursor:'pointer',
                background: modoFiltro === m ? '#1a2a4a' : '#f0f2f5',
                color: modoFiltro === m ? 'white' : '#555', fontSize:12,
              }}>{m === 'mes' ? 'Por mes' : 'Rango libre'}</button>
            ))}
          </div>
          {modoFiltro === 'mes' ? (
            <>
              <select value={mes} onChange={e => setMes(Number(e.target.value))}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }}>
                {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={año} onChange={e => setAño(Number(e.target.value))}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }} />
              <span style={{ color:'#888', fontSize:13 }}>al</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', fontSize:13 }} />
            </>
          )}
        </div>
      </div>

      <div style={{ background:'white', borderRadius:10, padding:20, boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
        {reporteActivo === 'estado_resultados'    && <EstadoResultados    {...componenteProps} />}
        {reporteActivo === 'balance_general'      && <BalanceGeneral      {...componenteProps} />}
        {reporteActivo === 'libro_mayor'          && <LibroMayor          {...componenteProps} />}
        {reporteActivo === 'balance_comprobacion' && <BalanceComprobacion {...componenteProps} />}
      </div>
    </>
  );
}
