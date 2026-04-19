// ============================================
// PantallaCortes.js
// Catálogo de cortes de res
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

export default function PantallaCortes({ onVolver, onVolverMenu }) {
  const [cortes,      setCortes]      = useState([]);
  const [mps,         setMps]         = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [modal,       setModal]       = useState(null); // null | { mode:'new'|'edit', data:{} }
  const [guardando,   setGuardando]   = useState(false);
  const [error,       setError]       = useState('');
  const [exito,       setExito]       = useState('');
  const [historial,   setHistorial]   = useState({}); // corte_nombre → últimas 3 prod
  const [buscadorMP,  setBuscadorMP]  = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('cortes_catalogo').select('*').order('orden').order('nombre'),
      supabase.from('materias_primas').select('id,nombre,nombre_producto,precio_kg,categoria').order('nombre'),
    ]);
    setCortes(c || []);
    setMps(m || []);

    // Últimas 3 producciones por corte
    const { data: hist } = await supabase
      .from('produccion_inyeccion_cortes')
      .select(`
        corte_nombre, kg_carne_cruda, kg_retazos, costo_final_kg,
        produccion_inyeccion ( fecha, porcentaje_inyeccion, estado )
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (hist) {
      const byCorte = {};
      hist.forEach(h => {
        if (!byCorte[h.corte_nombre]) byCorte[h.corte_nombre] = [];
        if (byCorte[h.corte_nombre].length < 3) byCorte[h.corte_nombre].push(h);
      });
      setHistorial(byCorte);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNuevo = () => setModal({ mode: 'new', data: { nombre: '', descripcion: '', materia_prima_id: '', orden: 0 } });
  const abrirEditar = (c) => setModal({ mode: 'edit', data: { ...c } });

  async function guardar() {
    setError('');
    if (!modal.data.nombre.trim()) { setError('El nombre es requerido'); return; }
    setGuardando(true);
    try {
      if (modal.mode === 'new') {
        const { error: e } = await supabase.from('cortes_catalogo').insert({
          nombre:           modal.data.nombre.trim(),
          descripcion:      modal.data.descripcion?.trim() || null,
          materia_prima_id: modal.data.materia_prima_id || null,
          orden:            parseInt(modal.data.orden) || 0,
          activo:           true,
        });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('cortes_catalogo').update({
          nombre:           modal.data.nombre.trim(),
          descripcion:      modal.data.descripcion?.trim() || null,
          materia_prima_id: modal.data.materia_prima_id || null,
          orden:            parseInt(modal.data.orden) || 0,
          updated_at:       new Date().toISOString(),
        }).eq('id', modal.data.id);
        if (e) throw e;
      }
      setModal(null);
      setExito('✅ Corte guardado'); setTimeout(() => setExito(''), 3000);
      await cargar();
    } catch (e) { setError(e.message); }
    setGuardando(false);
  }

  async function toggleActivo(corte) {
    await supabase.from('cortes_catalogo')
      .update({ activo: !corte.activo, updated_at: new Date().toISOString() })
      .eq('id', corte.id);
    await cargar();
  }

  const mpNombre = (id) => {
    const mp = mps.find(m => m.id === id);
    return mp ? (mp.nombre_producto || mp.nombre) : '—';
  };

  const mpsFiltrados = mps.filter(m => {
    const txt = buscadorMP.toLowerCase();
    return !txt || (m.nombre || '').toLowerCase().includes(txt) ||
      (m.nombre_producto || '').toLowerCase().includes(txt);
  });

  if (cargando) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ fontSize: 32 }}>🥩</div>
      <div style={{ marginLeft: 12, color: '#555' }}>Cargando cortes...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#6c3483,#4a2c7a)', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onVolver} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>← Volver</button>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>🥩 Catálogo de Cortes</div>
          </div>
          <button onClick={abrirNuevo} style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
            + Nuevo Corte
          </button>
        </div>
      </div>

      {exito && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '10px 20px', fontWeight: 'bold', fontSize: 13, textAlign: 'center' }}>{exito}</div>
      )}

      <div style={{ padding: '16px 20px' }}>
        {cortes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🥩</div>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Sin cortes registrados</div>
            <div style={{ fontSize: 13 }}>Agrega tu primer corte con el botón "Nuevo Corte"</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {cortes.map(c => {
              const hist3 = historial[c.nombre] || [];
              return (
                <div key={c.id} style={{
                  background: 'white', borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                  overflow: 'hidden',
                  opacity: c.activo ? 1 : 0.55,
                  border: c.activo ? '2px solid transparent' : '2px solid #e74c3c22',
                }}>
                  <div style={{ background: c.activo ? '#6c3483' : '#95a5a6', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>🥩 {c.nombre}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '2px 8px' }}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    {c.descripcion && (
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{c.descripcion}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                      📦 MP vinculada: <span style={{ color: '#1a1a2e', fontWeight: 'bold' }}>{mpNombre(c.materia_prima_id)}</span>
                    </div>
                    {c.materia_prima_id && (
                      <div style={{ fontSize: 12, color: '#27ae60', marginBottom: 8 }}>
                        💰 ${(mps.find(m => m.id === c.materia_prima_id)?.precio_kg || 0).toFixed(2)}/kg
                      </div>
                    )}

                    {/* Historial últimas 3 producciones */}
                    {hist3.length > 0 && (
                      <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 'bold', color: '#888', marginBottom: 6, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          Últimas producciones
                        </div>
                        {hist3.map((h, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: '#555' }}>
                            <span>{h.produccion_inyeccion?.fecha || '—'}</span>
                            <span>{parseFloat(h.kg_carne_cruda || 0).toFixed(1)} kg</span>
                            {h.costo_final_kg > 0
                              ? <span style={{ color: '#27ae60', fontWeight: 'bold' }}>${parseFloat(h.costo_final_kg).toFixed(4)}/kg</span>
                              : <span style={{ color: '#aaa' }}>pendiente</span>
                            }
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => abrirEditar(c)} style={{ flex: 1, padding: '8px', background: '#eaf0fb', color: '#2980b9', border: '1px solid #aed6f1', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                        ✏️ Editar
                      </button>
                      <button onClick={() => toggleActivo(c)} style={{ flex: 1, padding: '8px', background: c.activo ? '#fdf2f8' : '#eafaf1', color: c.activo ? '#e74c3c' : '#27ae60', border: `1px solid ${c.activo ? '#f5b7b1' : '#a9dfbf'}`, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                        {c.activo ? '🔴 Desactivar' : '🟢 Activar'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal nuevo/editar */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 20, color: '#1a1a2e' }}>
              {modal.mode === 'new' ? '+ Nuevo Corte' : '✏️ Editar Corte'}
            </div>

            {error && (
              <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 8, padding: '10px 14px', color: '#721c24', fontSize: 13, marginBottom: 14 }}>
                ⚠️ {error}
              </div>
            )}

            {[
              ['Nombre del corte *', 'nombre', 'text', 'Ej: Bife, T-Bone, Lomo Fino...'],
              ['Descripción', 'descripcion', 'text', 'Descripción opcional'],
              ['Orden de aparición', 'orden', 'number', '0'],
            ].map(([label, key, type, placeholder]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 6 }}>{label}</label>
                <input
                  type={type} placeholder={placeholder}
                  value={modal.data[key] || ''}
                  onChange={e => setModal(prev => ({ ...prev, data: { ...prev.data, [key]: e.target.value } }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            ))}

            {/* Selector Materia Prima */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 6 }}>Materia Prima vinculada (para precio y stock)</label>
              <input
                placeholder="🔍 Buscar materia prima..."
                value={buscadorMP}
                onChange={e => setBuscadorMP(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', marginBottom: 6, outline: 'none' }}
              />
              {modal.data.materia_prima_id && (
                <div style={{ fontSize: 12, color: '#27ae60', marginBottom: 6, fontWeight: 'bold' }}>
                  ✅ {mpNombre(modal.data.materia_prima_id)}
                  <button onClick={() => setModal(p => ({ ...p, data: { ...p.data, materia_prima_id: '' } }))}
                    style={{ marginLeft: 8, background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 12 }}>✕ Quitar</button>
                </div>
              )}
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8 }}>
                {mpsFiltrados.slice(0, 50).map(mp => (
                  <div key={mp.id}
                    onClick={() => { setModal(p => ({ ...p, data: { ...p.data, materia_prima_id: mp.id } })); setBuscadorMP(''); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', fontSize: 13, background: modal.data.materia_prima_id === mp.id ? '#eafaf1' : 'white', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{mp.nombre_producto || mp.nombre}</span>
                    <span style={{ color: '#888', fontSize: 11 }}>${parseFloat(mp.precio_kg || 0).toFixed(2)}/kg</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setModal(null); setError(''); setBuscadorMP(''); }} style={{ flex: 1, padding: '12px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontWeight: 'bold' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando} style={{ flex: 2, padding: '12px', background: guardando ? '#95a5a6' : '#6c3483', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 'bold', cursor: guardando ? 'default' : 'pointer' }}>
                {guardando ? '⏳ Guardando...' : '💾 Guardar Corte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
