// ============================================
// TabCalidad.js
// Registro de controles de calidad por lote
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

const hoy = new Date().toISOString().slice(0, 10);
const PARAMETROS = [
  'pH', 'Temperatura', 'Peso neto', 'Color', 'Textura',
  'Olor', 'Empaque', 'Etiquetado', 'Otro'
];
const RESULTADOS = ['Aprobado', 'Rechazado', 'Observado'];

export default function TabCalidad({ mobile }) {
  const [registros,  setRegistros]  = useState([]);
  const [lotes,      setLotes]      = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [modal,      setModal]      = useState(false);
  const [expandido,  setExpandido]  = useState(null);
  const [form, setForm] = useState({
    lote_id: '', parametro: 'pH', valor_obtenido: '',
    valor_minimo: '', valor_maximo: '', resultado: 'Aprobado',
    responsable: '', observaciones: ''
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: regs }, { data: ls }] = await Promise.all([
      supabase.from('controles_calidad')
        .select('*, lotes_produccion(codigo_lote, producto_nombre)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('lotes_produccion')
        .select('id, codigo_lote, producto_nombre, estado')
        .eq('estado', 'activo')
        .order('fecha_produccion', { ascending: false })
        .limit(50)
    ]);
    setRegistros(regs || []);
    setLotes(ls || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['controles_calidad', 'lotes_produccion'], cargar);

  async function guardar() {
    if (!form.lote_id)             { setError('Selecciona un lote.'); return; }
    if (!form.valor_obtenido.trim()){ setError('El valor obtenido es obligatorio.'); return; }
    setGuardando(true); setError('');

    const lote = lotes.find(l => l.id === form.lote_id);
    const { error: err } = await supabase.from('controles_calidad').insert({
      lote_id:         form.lote_id,
      codigo_lote:     lote?.codigo_lote || '',
      producto_nombre: lote?.producto_nombre || '',
      parametro:       form.parametro,
      valor_obtenido:  form.valor_obtenido.trim(),
      valor_minimo:    form.valor_minimo.trim() || null,
      valor_maximo:    form.valor_maximo.trim() || null,
      resultado:       form.resultado,
      responsable:     form.responsable.trim() || null,
      observaciones:   form.observaciones.trim() || null,
      fecha:           hoy
    });
    if (err) { setError(err.message); setGuardando(false); return; }

    // Si rechazado → retener lote automáticamente
    if (form.resultado === 'Rechazado') {
      await supabase.from('lotes_produccion')
        .update({ estado: 'retenido' }).eq('id', form.lote_id);
    }

    await cargar();
    setModal(false);
    setGuardando(false);
  }

  // Agrupar por lote
  const porLote = registros.reduce((acc, r) => {
    const key = r.codigo_lote || r.lote_id;
    if (!acc[key]) acc[key] = { codigo: key, producto: r.producto_nombre, items: [] };
    acc[key].items.push(r);
    return acc;
  }, {});

  const resumenGlobal = {
    total:      registros.length,
    aprobados:  registros.filter(r => r.resultado === 'Aprobado').length,
    rechazados: registros.filter(r => r.resultado === 'Rechazado').length,
    observados: registros.filter(r => r.resultado === 'Observado').length,
  };

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px',
    boxSizing: 'border-box', outline: 'none'
  };

  return (
    <div>
      {/* Resumen */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)',
        gap: '8px', marginBottom: '12px'
      }}>
        {[
          { label: 'Total controles', valor: resumenGlobal.total,      color: '#2980b9', esCant: true },
          { label: 'Aprobados',       valor: resumenGlobal.aprobados,   color: '#27ae60', esCant: true },
          { label: 'Observados',      valor: resumenGlobal.observados,  color: '#f39c12', esCant: true },
          { label: 'Rechazados',      valor: resumenGlobal.rechazados,  color: '#e74c3c', esCant: true },
        ].map(r => (
          <div key={r.label} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
            <div style={{ fontSize: mobile ? '18px' : '22px', fontWeight: 'bold', color: r.color }}>{r.valor}</div>
          </div>
        ))}
      </div>

      {/* Botón agregar */}
      <div style={{ ...card, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => { setForm({ lote_id:'', parametro:'pH', valor_obtenido:'', valor_minimo:'', valor_maximo:'', resultado:'Aprobado', responsable:'', observaciones:'' }); setError(''); setModal(true); }} style={{
          background: 'linear-gradient(135deg,#1a3a1a,#2d5a1b)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'
        }}>+ Registrar control</button>
      </div>

      {/* Por lote */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando controles...</div>
      ) : Object.keys(porLote).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay controles de calidad registrados.
        </div>
      ) : (
        Object.values(porLote).map(grupo => {
          const aprobados  = grupo.items.filter(i => i.resultado === 'Aprobado').length;
          const rechazados = grupo.items.filter(i => i.resultado === 'Rechazado').length;
          return (
            <div key={grupo.codigo} style={card}>
              <div
                onClick={() => setExpandido(expandido === grupo.codigo ? null : grupo.codigo)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a1a', fontFamily: 'monospace' }}>
                      🏷️ {grupo.codigo}
                    </span>
                    <span style={{ background: '#2d5a1b', color: 'white', borderRadius: '12px', padding: '2px 10px', fontSize: '11px' }}>
                      {grupo.producto}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                    <span style={{ color: '#27ae60' }}>✅ {aprobados} aprobados</span>
                    {rechazados > 0 && <span style={{ color: '#e74c3c' }}>❌ {rechazados} rechazados</span>}
                    <span style={{ color: '#888' }}>{grupo.items.length} controles total</span>
                  </div>
                </div>
                <span style={{ color: '#aaa', fontSize: '12px' }}>{expandido === grupo.codigo ? '▲' : '▼'}</span>
              </div>

              {expandido === grupo.codigo && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f2f5' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        {['Parámetro', 'Valor', 'Mín/Máx', 'Resultado', 'Responsable', 'Fecha'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#555', fontWeight: '600' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.items.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 'bold', color: '#333' }}>{item.parametro}</td>
                          <td style={{ padding: '7px 10px' }}>{item.valor_obtenido}</td>
                          <td style={{ padding: '7px 10px', color: '#888' }}>
                            {item.valor_minimo || '—'} / {item.valor_maximo || '—'}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{
                              background: item.resultado === 'Aprobado' ? '#27ae60' : item.resultado === 'Rechazado' ? '#e74c3c' : '#f39c12',
                              color: 'white', borderRadius: '10px', padding: '2px 8px', fontSize: '11px'
                            }}>{item.resultado}</span>
                          </td>
                          <td style={{ padding: '7px 10px', color: '#555' }}>{item.responsable || '—'}</td>
                          <td style={{ padding: '7px 10px', color: '#888' }}>{item.fecha}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 20px', color: '#1a3a1a' }}>✅ Registrar control de calidad</h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Lote *</label>
              <select value={form.lote_id} onChange={e => setForm(f => ({ ...f, lote_id: e.target.value }))} style={inputStyle}>
                <option value="">— Selecciona lote activo —</option>
                {lotes.map(l => <option key={l.id} value={l.id}>{l.codigo_lote} · {l.producto_nombre}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Parámetro</label>
                <select value={form.parametro} onChange={e => setForm(f => ({ ...f, parametro: e.target.value }))} style={inputStyle}>
                  {PARAMETROS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Valor obtenido *</label>
                <input value={form.valor_obtenido} onChange={e => setForm(f => ({ ...f, valor_obtenido: e.target.value }))}
                  style={inputStyle} placeholder="Ej. 6.2" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Mínimo</label>
                <input value={form.valor_minimo} onChange={e => setForm(f => ({ ...f, valor_minimo: e.target.value }))}
                  style={inputStyle} placeholder="5.5" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Máximo</label>
                <input value={form.valor_maximo} onChange={e => setForm(f => ({ ...f, valor_maximo: e.target.value }))}
                  style={inputStyle} placeholder="7.0" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Resultado</label>
                <select value={form.resultado} onChange={e => setForm(f => ({ ...f, resultado: e.target.value }))} style={inputStyle}>
                  {RESULTADOS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Responsable</label>
              <input value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))}
                style={inputStyle} placeholder="Nombre del analista" />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px', fontWeight: '600' }}>Observaciones</label>
              <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} placeholder="Notas adicionales..." />
            </div>

            {form.resultado === 'Rechazado' && (
              <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#e74c3c', marginBottom: '14px' }}>
                ⚠️ Al marcar "Rechazado" el lote cambiará automáticamente a estado <b>Retenido</b>.
              </div>
            )}

            {error && (
              <div style={{ background: '#ffeaea', border: '1px solid #e74c3c', borderRadius: '8px', padding: '10px', color: '#e74c3c', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '13px'
              }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a3a1a,#2d5a1b)',
                color: 'white', border: 'none', borderRadius: '8px',
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: '13px', fontWeight: 'bold'
              }}>{guardando ? 'Guardando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
