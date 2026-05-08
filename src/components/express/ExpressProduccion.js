// ============================================
// ExpressProduccion.js
// Pantalla express para rol producción
// Registra producción del día rápidamente
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

const hoy = new Date().toISOString().split('T')[0];

export default function ExpressProduccion({ userRol, currentUser, onLogout }) {
  const [productos,   setProductos]   = useState([]);
  const [registros,   setRegistros]   = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [modal,       setModal]       = useState(false);
  const [productoId,  setProductoId]  = useState('');
  const [kg,          setKg]          = useState('');
  const [nota,        setNota]        = useState('');
  const [guardando,   setGuardando]   = useState(false);
  const [exito,         setExito]         = useState('');
  const [error,         setError]         = useState('');
  const [lotesListos,   setLotesListos]   = useState([]);

  useEffect(() => { cargar(); }, []);
  useRealtime(['productos', 'produccion_diaria', 'lotes_maduracion'], cargar);

  async function cargar() {
    setCargando(true);
    const [rProd, rHoy, rLotes] = await Promise.all([
      supabase.from('productos').select('id,nombre').eq('eliminado', false).order('nombre'),
      supabase.from('produccion_diaria')
        .select('*').eq('fecha', hoy).eq('revertida', false)
        .order('created_at', { ascending: false }),
      supabase.from('lotes_maduracion')
        .select('lote_id, fecha_salida')
        .neq('estado', 'completado')
        .lte('fecha_salida', hoy)
    ]);
    setProductos(rProd.data || []);
    setRegistros(rHoy.data || []);
    setLotesListos(rLotes.data || []);
    setCargando(false);
  }

  async function guardar() {
    setError('');
    if (!productoId) return setError('Selecciona un producto');
    const kgNum = parseFloat(kg);
    if (!kgNum || kgNum <= 0) return setError('Ingresa los kg producidos');

    setGuardando(true);
    try {
      const prod = productos.find(p => p.id === productoId);
      await supabase.from('produccion_diaria').insert({
        fecha:           hoy,
        turno:           'mañana',
        producto_nombre: prod.nombre,
        num_paradas:     1,
        kg_total_crudo:  kgNum,
        porcentaje_merma:0,
        kg_producidos:   kgNum,
        costo_total:     0,
        usuario_nombre:  userRol?.nombre || 'Producción',
        user_id:         currentUser?.id,
        nota:            nota || null,
        revertida:       false
      });

      setExito(`✅ Registrado: ${prod.nombre} — ${kgNum} kg`);
      setTimeout(() => setExito(''), 5000);
      setModal(false);
      setProductoId('');
      setKg('');
      setNota('');
      cargar();
    } catch(e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  const totalKgHoy = registros.reduce((s, r) => s + (r.kg_producidos || 0), 0);

  const fechaFormato = new Date(hoy + 'T12:00:00').toLocaleDateString('es-EC', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg,#fff3e0 0%,#fafafa 100%)',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#e65100,#f57c00)',
        padding: '14px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div>
          <div style={{ color: 'white', fontWeight: 'bold', fontSize: '17px' }}>
            🏭 Producción Express
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px' }}>
            {userRol?.nombre || 'Producción'} · {fechaFormato}
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
            background: '#fff3e0', color: '#e65100',
            padding: '12px 16px', borderRadius: 10,
            marginBottom: 12, fontWeight: 'bold', fontSize: '13px'
          }}>{exito}</div>
        )}

        {/* ── Alerta lotes maduración listos ── */}
        {lotesListos.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg,#e74c3c,#c0392b)',
            borderRadius: 12, padding: '14px 16px', marginBottom: 14,
            boxShadow: '0 4px 12px rgba(231,76,60,0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>🚨</span>
              <div>
                <div style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>
                  Pesaje de maduración pendiente
                </div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>
                  {lotesListos.map(l => `Lote ${l.lote_id}`).join(' · ')} — ve a Producción › Maduración
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Resumen del día */}
        <div style={{
          background: 'white', borderRadius: 14,
          padding: '16px', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          borderTop: '4px solid #f57c00'
        }}>
          <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 }}>
            Total producido hoy
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#e65100' }}>
            {totalKgHoy.toFixed(1)} kg
          </div>
          <div style={{ fontSize: '12px', color: '#aaa' }}>
            {registros.length} registro{registros.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Botón registrar */}
        <button onClick={() => { setModal(true); setProductoId(''); setKg(''); setNota(''); setError(''); }} style={{
          width: '100%', background: '#f57c00', color: 'white',
          border: 'none', borderRadius: 12, padding: '16px',
          fontSize: '17px', fontWeight: 'bold', cursor: 'pointer',
          marginBottom: 14,
          boxShadow: '0 4px 14px rgba(245,124,0,0.4)'
        }}>
          + Registrar producción
        </button>

        {/* Registros de hoy */}
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            ⏳ Cargando...
          </div>
        ) : registros.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40,
            background: 'white', borderRadius: 12, color: '#aaa'
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏭</div>
            <div>Sin registros hoy — toca el botón para agregar</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', marginBottom: 8, textTransform: 'uppercase' }}>
              Registros de hoy
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {registros.map(r => (
                <div key={r.id} style={{
                  background: 'white', borderRadius: 12,
                  padding: '14px 16px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a1a2e' }}>
                      {r.producto_nombre}
                    </div>
                    {r.nota && (
                      <div style={{ fontSize: '12px', color: '#888', marginTop: 2 }}>
                        📝 {r.nota}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: 2 }}>
                      {r.usuario_nombre}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '20px', fontWeight: 'bold', color: '#f57c00'
                  }}>
                    {parseFloat(r.kg_producidos).toFixed(1)} kg
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal registrar */}
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
            <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: 20, color: '#e65100' }}>
              🏭 Registrar producción
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
                Producto *
              </label>
              <select
                value={productoId}
                onChange={e => setProductoId(e.target.value)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  border: '2px solid #ddd', fontSize: '15px',
                  boxSizing: 'border-box', outline: 'none'
                }}>
                <option value=''>— Selecciona el producto —</option>
                {productos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: '13px', color: '#555' }}>
                Kg producidos *
              </label>
              <input
                type="number"
                value={kg}
                onChange={e => setKg(e.target.value)}
                placeholder="0.00"
                min="0.001" step="0.001"
                style={{
                  width: '100%', padding: '14px', borderRadius: 10,
                  border: '2px solid #ddd', fontSize: '22px', fontWeight: 'bold',
                  textAlign: 'center', boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: '13px', color: '#555' }}>
                Nota (opcional)
              </label>
              <input
                type="text"
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="Ej: Turno mañana, lote especial..."
                style={{
                  width: '100%', padding: '12px', borderRadius: 10,
                  border: '2px solid #ddd', fontSize: '14px',
                  boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(false)} style={{
                flex: 1, background: '#f0f2f5', color: '#555',
                border: 'none', borderRadius: 10, padding: '14px',
                cursor: 'pointer', fontWeight: 'bold', fontSize: '15px'
              }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                flex: 2, background: guardando ? '#aaa' : '#f57c00',
                color: 'white', border: 'none', borderRadius: 10, padding: '14px',
                cursor: guardando ? 'not-allowed' : 'pointer',
                fontWeight: 'bold', fontSize: '15px'
              }}>
                {guardando ? '⏳ Guardando...' : '✅ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
