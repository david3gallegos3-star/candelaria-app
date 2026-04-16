// ============================================
// ExpressBodeguero.js
// Pantalla express para rol bodeguero
// Solo entrada/salida rápida de inventario
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function ExpressBodeguero({ userRol, currentUser, onLogout }) {
  const [materias,   setMaterias]   = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [modal,      setModal]      = useState(null); // { mp, tipo: 'entrada'|'salida' }
  const [kg,         setKg]         = useState('');
  const [motivo,     setMotivo]     = useState('');
  const [guardando,  setGuardando]  = useState(false);
  const [exito,      setExito]      = useState('');
  const [error,      setError]      = useState('');
  const [busqueda,   setBusqueda]   = useState('');

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    const { data: mps } = await supabase
      .from('materias_primas').select('*').eq('eliminado', false).order('nombre_producto');
    const { data: inv } = await supabase.from('inventario_mp').select('*');
    const invMap = {};
    (inv || []).forEach(i => { invMap[i.materia_prima_id] = i; });
    setMaterias((mps || []).map(mp => ({
      ...mp,
      stock_kg: invMap[mp.id]?.stock_kg || 0,
      stock_minimo: invMap[mp.id]?.stock_minimo || 0,
      inv_id: invMap[mp.id]?.id || null,
    })));
    setCargando(false);
  }

  async function guardar() {
    setError('');
    const kgNum = parseFloat(kg);
    if (!kgNum || kgNum <= 0) return setError('Ingresa una cantidad válida');
    if (!motivo.trim()) return setError('Ingresa el motivo');

    const mp = modal.mp;
    const tipo = modal.tipo;

    if (tipo === 'salida' && kgNum > mp.stock_kg) {
      return setError(`Stock insuficiente (disponible: ${mp.stock_kg.toFixed(2)} kg)`);
    }

    setGuardando(true);
    try {
      const nuevoStock = tipo === 'entrada'
        ? mp.stock_kg + kgNum
        : Math.max(0, mp.stock_kg - kgNum);

      if (mp.inv_id) {
        await supabase.from('inventario_mp')
          .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
          .eq('id', mp.inv_id);
      } else {
        await supabase.from('inventario_mp').insert({
          materia_prima_id: mp.id, stock_kg: nuevoStock, stock_minimo: 0
        });
      }

      await supabase.from('inventario_movimientos').insert({
        materia_prima_id: mp.id,
        nombre_mp:        mp.nombre_producto || mp.nombre,
        tipo,
        kg:               kgNum,
        motivo,
        usuario_nombre:   userRol?.nombre || 'Bodeguero',
        user_id:          currentUser?.id,
        via:              'express',
        fecha:            new Date().toISOString().split('T')[0]
      });

      setExito(`✅ ${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada — ${mp.nombre_producto || mp.nombre} · ${kgNum} kg`);
      setTimeout(() => setExito(''), 5000);
      setModal(null);
      setKg('');
      setMotivo('');
      cargar();
    } catch(e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  const materiasFiltradas = materias.filter(m =>
    !busqueda || (m.nombre_producto || m.nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg,#e8f5e9 0%,#f1f8e9 100%)',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#1b5e20,#2e7d32)',
        padding: '14px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div>
          <div style={{ color: 'white', fontWeight: 'bold', fontSize: '17px' }}>
            📦 Inventario Express
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px' }}>
            {userRol?.nombre || 'Bodeguero'}
          </div>
        </div>
        <button onClick={onLogout} style={{
          background: 'rgba(255,255,255,0.15)', color: 'white',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 8, padding: '8px 14px',
          cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
        }}>Salir</button>
      </div>

      <div style={{ padding: '14px 12px', maxWidth: 600, margin: '0 auto' }}>
        {exito && (
          <div style={{
            background: '#d4edda', color: '#155724',
            padding: '12px 16px', borderRadius: 10,
            marginBottom: 12, fontWeight: 'bold', fontSize: '13px'
          }}>{exito}</div>
        )}

        {/* Buscador */}
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar materia prima..."
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 10,
            border: '1.5px solid #ddd', fontSize: '14px', outline: 'none',
            marginBottom: 12, boxSizing: 'border-box',
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
          }}
        />

        {cargando ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
            ⏳ Cargando inventario...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {materiasFiltradas.map(mp => {
              const bajo = mp.stock_kg <= mp.stock_minimo && mp.stock_minimo > 0;
              return (
                <div key={mp.id} style={{
                  background: 'white', borderRadius: 12,
                  padding: '14px 16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: bajo ? '2px solid #e74c3c' : '2px solid transparent'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a1a2e' }}>
                        {mp.nombre_producto || mp.nombre}
                      </div>
                      <div style={{ fontSize: '13px', marginTop: 2 }}>
                        <span style={{
                          color: bajo ? '#e74c3c' : '#27ae60',
                          fontWeight: 'bold', fontSize: '16px'
                        }}>
                          {parseFloat(mp.stock_kg).toFixed(2)} kg
                        </span>
                        {bajo && (
                          <span style={{
                            marginLeft: 8, fontSize: '11px',
                            background: '#fde8e8', color: '#c0392b',
                            padding: '2px 8px', borderRadius: 10
                          }}>⚠️ Stock bajo</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setModal({ mp, tipo: 'entrada' }); setKg(''); setMotivo(''); setError(''); }} style={{
                        background: '#e8f5e9', color: '#2e7d32',
                        border: '2px solid #2e7d32',
                        borderRadius: 10, padding: '10px 16px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
                      }}>📥 Entrada</button>
                      <button onClick={() => { setModal({ mp, tipo: 'salida' }); setKg(''); setMotivo(''); setError(''); }} style={{
                        background: '#fde8e8', color: '#c0392b',
                        border: '2px solid #c0392b',
                        borderRadius: 10, padding: '10px 16px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
                      }}>📤 Salida</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal entrada/salida */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px',
            width: '100%', maxWidth: 500,
            boxShadow: '0 -4px 30px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              fontWeight: 'bold', fontSize: '18px', marginBottom: 4,
              color: modal.tipo === 'entrada' ? '#2e7d32' : '#c0392b'
            }}>
              {modal.tipo === 'entrada' ? '📥 Entrada' : '📤 Salida'} — {modal.mp.nombre_producto || modal.mp.nombre}
            </div>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: 20 }}>
              Stock actual: <b>{parseFloat(modal.mp.stock_kg).toFixed(2)} kg</b>
            </div>

            {error && (
              <div style={{
                background: '#fde8e8', color: '#c0392b',
                padding: '10px', borderRadius: 8, marginBottom: 12,
                fontWeight: 'bold', fontSize: '13px'
              }}>{error}</div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: '13px', color: '#555' }}>
                Cantidad (kg) *
              </label>
              <input
                type="number"
                value={kg}
                onChange={e => setKg(e.target.value)}
                placeholder="0.00"
                min="0.001" step="0.001"
                autoFocus
                style={{
                  width: '100%', padding: '14px', borderRadius: 10,
                  border: '2px solid #ddd', fontSize: '20px', fontWeight: 'bold',
                  textAlign: 'center', boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: '13px', color: '#555' }}>
                Motivo *
              </label>
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: Compra a proveedor / Consumo producción"
                style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  border: '2px solid #ddd', fontSize: '14px',
                  boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setModal(null); setError(''); }} style={{
                flex: 1, background: '#f0f2f5', color: '#555',
                border: 'none', borderRadius: 10, padding: '14px',
                cursor: 'pointer', fontWeight: 'bold', fontSize: '15px'
              }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                flex: 2,
                background: guardando ? '#aaa' : (modal.tipo === 'entrada' ? '#2e7d32' : '#c0392b'),
                color: 'white', border: 'none', borderRadius: 10, padding: '14px',
                cursor: guardando ? 'not-allowed' : 'pointer',
                fontWeight: 'bold', fontSize: '15px'
              }}>
                {guardando ? '⏳ Guardando...' : `✅ Confirmar ${modal.tipo}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
