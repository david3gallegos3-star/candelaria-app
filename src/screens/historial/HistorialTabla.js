// ============================================
// HISTORIAL — Tabla con edición inline
// Usado por: PantallaHistorial.js
// ============================================

import React from 'react';
import { supabase } from '../../supabase';

function HistorialTabla({
  historial, histSeleccionados,
  histEditandoId, histEditData,
  setHistEditandoId, setHistEditData,
  toggleHistSel, toggleHistTodos,
  eliminarHistSeleccionados,
  guardarHistEdicion, mostrarExito,
  cargarHistorial
}) {
  return (
    <div>

      {/* Barra seleccionados */}
      {histSeleccionados.size > 0 && (
        <div style={{
          background:'#fff3cd', border:'1px solid #ffc107',
          borderRadius:8, padding:'10px 16px',
          marginBottom:12, display:'flex',
          justifyContent:'space-between', alignItems:'center'
        }}>
          <span style={{ fontWeight:'bold', color:'#856404' }}>
            {histSeleccionados.size} registro(s) seleccionado(s)
          </span>
          <button onClick={eliminarHistSeleccionados} style={{
            padding:'7px 18px', background:'#e74c3c', color:'white',
            border:'none', borderRadius:7, cursor:'pointer',
            fontWeight:'bold', fontSize:'13px'
          }}>🗑️ Eliminar seleccionados</button>
        </div>
      )}

      {/* Tabla */}
      <div style={{
        background:'white', borderRadius:10,
        boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden'
      }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>

            {/* Encabezados */}
            <thead>
              <tr style={{ background:'#1a1a2e', color:'white' }}>
                <th style={{ padding:'10px 8px', width:40 }}>
                  <input type="checkbox"
                    checked={histSeleccionados.size === historial.length && historial.length > 0}
                    onChange={toggleHistTodos}
                    style={{ cursor:'pointer' }}
                  />
                </th>
                {['FECHA','PRODUCTO','INGREDIENTE / MATERIA PRIMA',
                  'GRAMOS','KILOS','NOTA DE CAMBIO','SECCIÓN','ACCIONES'
                ].map(h => (
                  <th key={h} style={{
                    padding:'10px 8px', textAlign:'left',
                    whiteSpace:'nowrap', fontSize:'11px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>

            {/* Filas */}
            <tbody>
              {historial.map((h, i) => (
                histEditandoId === h.id ? (

                  // ── Fila en edición ──
                  <tr key={h.id} style={{ background:'#e8f4fd' }}>
                    <td style={{ padding:6 }}>
                      <input type="checkbox"
                        checked={histSeleccionados.has(h.id)}
                        onChange={() => toggleHistSel(h.id)}
                      />
                    </td>
                    <td style={{ padding:6 }}>
                      <input type="date" value={histEditData.fecha||''}
                        onChange={e => setHistEditData(p => ({...p, fecha: e.target.value}))}
                        style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:120 }}
                      />
                    </td>
                    <td style={{ padding:6 }}>
                      <input value={histEditData.producto_nombre||''}
                        onChange={e => setHistEditData(p => ({...p, producto_nombre: e.target.value}))}
                        style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:130 }}
                      />
                    </td>
                    <td style={{ padding:6 }}>
                      <input value={histEditData.ingrediente_nombre||''}
                        onChange={e => setHistEditData(p => ({...p, ingrediente_nombre: e.target.value}))}
                        style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:150 }}
                      />
                    </td>
                    <td style={{ padding:6 }}>
                      <input type="number" value={histEditData.gramos||''}
                        onChange={e => setHistEditData(p => ({...p, gramos: e.target.value}))}
                        style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:80 }}
                      />
                    </td>
                    <td style={{ padding:6, color:'#aaa', fontSize:11 }}>auto</td>
                    <td style={{ padding:6 }}>
                      <input value={histEditData.nota_cambio||''}
                        onChange={e => setHistEditData(p => ({...p, nota_cambio: e.target.value}))}
                        style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'12px', width:110 }}
                      />
                    </td>
                    <td style={{ padding:6 }}>
                      <select value={histEditData.seccion||'MATERIAS PRIMAS'}
                        onChange={e => setHistEditData(p => ({...p, seccion: e.target.value}))}
                        style={{ padding:'5px', borderRadius:6, border:'1px solid #ddd', fontSize:'11px' }}
                      >
                        <option value="MATERIAS PRIMAS">Materias Primas</option>
                        <option value="CONDIMENTOS Y ADITIVOS">Condimentos y Aditivos</option>
                      </select>
                    </td>
                    <td style={{ padding:6 }}>
                      <button onClick={guardarHistEdicion} style={{
                        padding:'4px 10px', background:'#27ae60', color:'white',
                        border:'none', borderRadius:6, cursor:'pointer',
                        fontSize:'11px', marginRight:4
                      }}>✓</button>
                      <button onClick={() => setHistEditandoId(null)} style={{
                        padding:'4px 10px', background:'#95a5a6', color:'white',
                        border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px'
                      }}>✕</button>
                    </td>
                  </tr>

                ) : (

                  // ── Fila normal ──
                  <tr key={h.id} style={{
                    background: i%2===0 ? '#fafafa' : 'white',
                    borderBottom:'1px solid #f0f0f0'
                  }}>
                    <td style={{ padding:'8px' }}>
                      <input type="checkbox"
                        checked={histSeleccionados.has(h.id)}
                        onChange={() => toggleHistSel(h.id)}
                        style={{ cursor:'pointer' }}
                      />
                    </td>
                    <td style={{ padding:'8px', whiteSpace:'nowrap', color:'#555' }}>
                      {h.fecha}
                    </td>
                    <td style={{ padding:'8px', fontWeight:'bold', color:'#1a1a2e' }}>
                      {h.producto_nombre}
                    </td>
                    <td style={{ padding:'8px' }}>{h.ingrediente_nombre}</td>
                    <td style={{ padding:'8px', textAlign:'right', fontWeight:'bold' }}>
                      {parseFloat(h.gramos||0).toLocaleString()}
                    </td>
                    <td style={{ padding:'8px', textAlign:'right', color:'#555' }}>
                      {parseFloat(h.kilos||0).toFixed(3)}
                    </td>
                    <td style={{ padding:'8px', color:'#888', fontSize:'11px' }}>
                      {h.nota_cambio}
                    </td>
                    <td style={{ padding:'8px' }}>
                      <span style={{
                        background: h.seccion==='MATERIAS PRIMAS' ? '#e8f4fd' : '#f3e5f5',
                        color:      h.seccion==='MATERIAS PRIMAS' ? '#1a5276' : '#6c3483',
                        padding:'2px 8px', borderRadius:10,
                        fontSize:'10px', fontWeight:'bold'
                      }}>
                        {h.seccion}
                      </span>
                    </td>
                    <td style={{ padding:'8px', whiteSpace:'nowrap' }}>
                      <button onClick={() => {
                        setHistEditandoId(h.id);
                        setHistEditData({...h});
                      }} style={{
                        padding:'4px 9px', background:'#3498db', color:'white',
                        border:'none', borderRadius:6, cursor:'pointer',
                        fontSize:'11px', marginRight:4
                      }}>✏️</button>
                      <button onClick={async () => {
                        if (!window.confirm('¿Eliminar?')) return;
                        await supabase.from('historial_general').delete().eq('id', h.id);
                        mostrarExito('🗑️ Eliminado');
                        cargarHistorial();
                      }} style={{
                        padding:'4px 9px', background:'#e74c3c', color:'white',
                        border:'none', borderRadius:6, cursor:'pointer', fontSize:'11px'
                      }}>🗑️</button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>

          {/* Vacío */}
          {historial.length === 0 && (
            <div style={{ textAlign:'center', padding:50, color:'#aaa' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
              <div>Usa los filtros y presiona Buscar</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HistorialTabla;