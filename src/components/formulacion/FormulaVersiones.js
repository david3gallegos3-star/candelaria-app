// ============================================
// FormulaVersiones.js — Historial y Revertir
// Ver · Revertir · Borrar versiones guardadas
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtime } from '../../hooks/useRealtime';

export default function FormulaVersiones({ producto, mobile, onRevertida, onCerrar }) {

  const [historial,    setHistorial]    = useState([]);  // fechas únicas
  const [cargando,     setCargando]     = useState(true);
  const [revirtiendo,  setRevirtiendo]  = useState(null);
  const [borrando,     setBorrando]     = useState(null);
  const [msgExito,     setMsgExito]     = useState('');

  // ── Estado para "Ver versión"
  const [viendo,        setViendo]        = useState(null); // fecha expandida
  const [datosVista,    setDatosVista]    = useState([]);   // filas cargadas
  const [cargandoVista, setCargandoVista] = useState(false);

  useEffect(() => { cargarHistorial(); }, [producto.id]);
  useRealtime(['historial_general'], cargarHistorial);

  // ── Cargar fechas del historial ───────────────────────────────────────────
  async function cargarHistorial() {
    setCargando(true);
    const { data } = await supabase.from('historial_general')
      .select('fecha')
      .eq('producto_nombre', producto.nombre)
      .order('fecha', { ascending: false });
    if (data) setHistorial([...new Set(data.map(d => d.fecha))]);
    setCargando(false);
  }

  // ── Ver / cerrar versión ──────────────────────────────────────────────────
  async function toggleVer(fecha) {
    if (viendo === fecha) { setViendo(null); setDatosVista([]); return; }
    setCargandoVista(true);
    setViendo(fecha);
    setDatosVista([]);
    const { data } = await supabase.from('historial_general').select('*')
      .eq('producto_nombre', producto.nombre).eq('fecha', fecha)
      .order('seccion').order('id');
    setDatosVista(data || []);
    setCargandoVista(false);
  }

  // ── Borrar versión del historial ──────────────────────────────────────────
  async function borrarVersion(fecha) {
    if (!window.confirm(
      `¿Borrar la versión del ${fecha} del historial de "${producto.nombre}"?\n\n` +
      `Esta acción no se puede deshacer.`
    )) return;
    setBorrando(fecha);
    await supabase.from('historial_general')
      .delete()
      .eq('producto_nombre', producto.nombre)
      .eq('fecha', fecha);
    if (viendo === fecha) { setViendo(null); setDatosVista([]); }
    setBorrando(null);
    mostrarExito(`🗑️ Versión del ${fecha} eliminada del historial`);
    await cargarHistorial();
  }

  // ── Revertir a una versión ────────────────────────────────────────────────
  async function revertirDirecto(fecha) {
    if (!window.confirm(
      `¿Revertir "${producto.nombre}" a la versión del ${fecha}?\n\n` +
      `La fórmula actual quedará guardada en el historial antes de ser reemplazada.`
    )) return;

    setRevirtiendo(fecha);
    const fechaHoy = new Date().toISOString().split('T')[0];
    const hora     = new Date().toTimeString().slice(0, 5);

    // Usar los datos ya cargados si están disponibles, sino leer de DB
    let hist = datosVista.length > 0 && viendo === fecha ? datosVista : null;
    if (!hist) {
      const { data } = await supabase.from('historial_general').select('*')
        .eq('producto_nombre', producto.nombre).eq('fecha', fecha)
        .order('seccion').order('id');
      hist = data;
    }

    if (!hist || hist.length === 0) {
      alert('No se encontraron datos para esa fecha');
      setRevirtiendo(null); return;
    }

    // 1. Backup de la fórmula activa (solo si no hay historial hoy)
    const { data: yaHoyHist } = await supabase.from('historial_general')
      .select('id').eq('producto_nombre', producto.nombre)
      .like('fecha', `${fechaHoy}%`).limit(1);
    if (!yaHoyHist || yaHoyHist.length === 0) {
      const { data: actual } = await supabase.from('formulaciones').select('*')
        .eq('producto_nombre', producto.nombre).order('orden');
      if (actual && actual.length > 0) {
        const backup = actual.filter(f => f.ingrediente_nombre).map(f => ({
          fecha:              fechaHoy,
          producto_nombre:    f.producto_nombre,
          ingrediente_nombre: f.ingrediente_nombre,
          materia_prima_id:   f.materia_prima_id || null,
          gramos:             parseFloat(f.gramos) || 0,
          kilos:              (parseFloat(f.gramos) || 0) / 1000,
          nota_cambio:        `Backup antes de revertir a ${fecha} (${hora})`,
          seccion:            f.seccion === 'MP' ? 'MATERIAS PRIMAS' : 'CONDIMENTOS Y ADITIVOS',
        }));
        if (backup.length > 0) await supabase.from('historial_general').insert(backup);
      }
    }

    // 2. Borrar fórmula activa
    await supabase.from('formulaciones').delete()
      .eq('producto_nombre', producto.nombre);

    // 3. Insertar la versión del historial como fórmula activa
    const filasNuevas = hist.map((f, i) => ({
      producto_nombre:    producto.nombre,
      producto_id:        producto.id,
      seccion:            f.seccion === 'MATERIAS PRIMAS' ? 'MP' : 'AD',
      orden:              i,
      ingrediente_nombre: f.ingrediente_nombre,
      materia_prima_id:   f.materia_prima_id || null,
      gramos:             parseFloat(f.gramos) || 0,
      kilos:              (parseFloat(f.gramos) || 0) / 1000,
      nota_cambio:        '',
      especificacion:     f.especificacion || '',
    }));
    await supabase.from('formulaciones').insert(filasNuevas);

    setViendo(null);
    setDatosVista([]);
    setRevirtiendo(null);
    mostrarExito(`✅ Fórmula revertida a la versión del ${fecha} — recargando...`);
    await cargarHistorial();
    onRevertida();
  }

  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 5000);
  }

  // ── Sub-componente: tabla de vista previa ─────────────────────────────────
  function VistaPrevia({ fecha }) {
    const mp  = datosVista.filter(f => f.seccion === 'MATERIAS PRIMAS');
    const ad  = datosVista.filter(f => f.seccion === 'CONDIMENTOS Y ADITIVOS');
    const totalG = datosVista.reduce((s, f) => s + (parseFloat(f.gramos) || 0), 0);

    const TablaVista = ({ lista, titulo, colorH }) => (
      <div style={{ marginBottom: 10 }}>
        <div style={{
          background: colorH, color: 'white',
          padding: '5px 12px', fontWeight: 'bold',
          fontSize: '12px', borderRadius: '6px 6px 0 0',
        }}>{titulo}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f0f2f5' }}>
              <th style={{ padding: '5px 10px', textAlign: 'left', fontSize: '11px', color: '#555' }}>INGREDIENTE</th>
              <th style={{ padding: '5px 10px', textAlign: 'right', fontSize: '11px', color: '#555', width: 90 }}>GRAMOS</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '5px 10px', color: '#1a1a2e', fontWeight: 'bold' }}>
                  {f.ingrediente_nombre}
                  {f.especificacion?.trim() ? ` (${f.especificacion.trim()})` : ''}
                  {f.nota_cambio?.includes('Backup') ? (
                    <span style={{ marginLeft: 4, fontSize: '9px', color: '#aaa' }}>(auto-backup)</span>
                  ) : null}
                </td>
                <td style={{ padding: '5px 10px', textAlign: 'right', color: '#1a5276', fontWeight: 'bold' }}>
                  {parseFloat(f.gramos || 0).toLocaleString()}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={2} style={{ padding: 8, textAlign: 'center', color: '#aaa', fontSize: '12px' }}>Sin ingredientes</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );

    return (
      <div style={{
        margin: '8px 0 4px',
        border: '2px solid #3498db',
        borderRadius: 10,
        overflow: 'hidden',
        background: '#f8fcff',
      }}>
        {/* Header vista previa */}
        <div style={{
          background: '#2980b9', color: 'white',
          padding: '8px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
            👁 Vista previa — {fecha.slice(0, 10)}
            {fecha.length > 10 && (
              <span style={{
                marginLeft: 6, fontSize: '11px',
                background: 'rgba(255,255,255,0.25)',
                padding: '2px 8px', borderRadius: 8,
              }}>🕐 {fecha.slice(11, 16)}</span>
            )}
          </span>
          <span style={{ fontSize: '12px', color: '#aed6f1' }}>
            Total: {totalG.toLocaleString()} g
          </span>
        </div>

        <div style={{ padding: '10px 12px' }}>
          {cargandoVista ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#888', fontSize: '13px' }}>
              ⏳ Cargando...
            </div>
          ) : (
            <>
              <TablaVista lista={mp} titulo="🥩 MATERIAS PRIMAS"       colorH="#1a5276" />
              <TablaVista lista={ad} titulo="🧂 CONDIMENTOS Y ADITIVOS" colorH="#6c3483" />

              {/* Total y botón revertir dentro de la vista */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#1a5276', borderRadius: 8,
                padding: '8px 12px', marginTop: 4,
              }}>
                <span style={{ color: 'white', fontWeight: 'bold', fontSize: '13px' }}>
                  TOTAL: {totalG.toLocaleString()} g &nbsp;·&nbsp; {(totalG / 1000).toFixed(3)} kg
                </span>
                <button
                  onClick={() => revertirDirecto(fecha)}
                  disabled={!!revirtiendo}
                  style={{
                    background: '#e74c3c', color: 'white', border: 'none',
                    borderRadius: 7, padding: '7px 14px',
                    cursor: revirtiendo ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold', fontSize: '12px',
                  }}>
                  {revirtiendo === fecha ? '⏳...' : '⚡ Revertir a esta versión'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'white', borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      marginBottom: 16, overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#1a3a5c,#2980b9)',
        padding: mobile ? '12px 14px' : '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ color: 'white', fontWeight: 'bold', fontSize: mobile ? '14px' : '16px' }}>
            🔄 Historial de versiones
          </div>
          <div style={{ color: '#aed6f1', fontSize: '11px', marginTop: 2 }}>
            {producto.nombre} — Ver · Revertir · Borrar
          </div>
        </div>
        <button onClick={onCerrar} style={{
          background: 'rgba(255,255,255,0.15)', color: 'white',
          border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
          padding: '7px 14px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
        }}>✕ Cerrar</button>
      </div>

      {/* Mensaje éxito */}
      {msgExito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '10px 16px', fontSize: '13px', fontWeight: 'bold',
        }}>{msgExito}</div>
      )}

      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>

        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: '#e8f4fd', borderRadius: 10,
          border: '1.5px solid #3498db', fontSize: '13px', color: '#1a5276',
        }}>
          💡 Usa <b>📋 Guardar Historial</b> en el editor para guardar versiones.
          Aquí puedes verlas, revertir o borrar las que ya no necesites.
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>
            ⏳ Cargando historial...
          </div>
        ) : historial.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#aaa' }}>
            <div style={{ fontSize: '40px', marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Sin versiones guardadas aún</div>
            <div style={{ fontSize: '12px' }}>
              Usa <b>📋 Guardar Historial</b> en el editor para guardar la versión actual.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {historial.map((fecha, idx) => (
              <div key={fecha}>
                {/* Fila de la versión */}
                <div style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                  background: idx === 0 ? '#e8f4fd' : '#f8f9fa',
                  borderRadius: viendo === fecha ? '10px 10px 0 0' : 10,
                  padding: '10px 14px',
                  border: `1.5px solid ${viendo === fecha ? '#3498db' : idx === 0 ? '#3498db' : '#e0e0e0'}`,
                  borderBottom: viendo === fecha ? 'none' : undefined,
                }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      📅 {fecha.slice(0, 10)}
                      {fecha.length > 10 && (
                        <span style={{
                          fontSize: '11px', background: '#f39c12', color: 'white',
                          padding: '2px 8px', borderRadius: 8, fontWeight: 'bold',
                        }}>🕐 {fecha.slice(11, 16)}</span>
                      )}
                      {idx === 0 && (
                        <span style={{
                          fontSize: '10px',
                          background: '#3498db', color: 'white',
                          padding: '2px 8px', borderRadius: 8,
                        }}>MÁS RECIENTE</span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: '11px', marginTop: 2 }}>
                      Versión guardada en historial
                    </div>
                  </div>

                  {/* Botones */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {/* Ver */}
                    <button
                      onClick={() => toggleVer(fecha)}
                      style={{
                        background: viendo === fecha ? '#2980b9' : 'white',
                        color:      viendo === fecha ? 'white'   : '#2980b9',
                        border:     `1.5px solid #2980b9`,
                        borderRadius: 7, padding: '7px 12px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '12px',
                        whiteSpace: 'nowrap',
                      }}>
                      {viendo === fecha ? '▲ Ocultar' : '👁 Ver'}
                    </button>

                    {/* Revertir */}
                    <button
                      onClick={() => revertirDirecto(fecha)}
                      disabled={!!revirtiendo || !!borrando}
                      style={{
                        background: revirtiendo === fecha ? '#95a5a6' : '#27ae60',
                        color: 'white', border: 'none',
                        borderRadius: 7, padding: '7px 12px',
                        cursor: (revirtiendo || borrando) ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold', fontSize: '12px',
                        whiteSpace: 'nowrap',
                      }}>
                      {revirtiendo === fecha ? '⏳...' : '⚡ Revertir'}
                    </button>

                    {/* Borrar */}
                    <button
                      onClick={() => borrarVersion(fecha)}
                      disabled={!!revirtiendo || !!borrando}
                      style={{
                        background: borrando === fecha ? '#95a5a6' : 'white',
                        color:      borrando === fecha ? 'white'   : '#e74c3c',
                        border:     '1.5px solid #e74c3c',
                        borderRadius: 7, padding: '7px 10px',
                        cursor: (revirtiendo || borrando) ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold', fontSize: '12px',
                        whiteSpace: 'nowrap',
                      }}>
                      {borrando === fecha ? '⏳...' : '🗑️'}
                    </button>
                  </div>
                </div>

                {/* Vista previa expandida */}
                {viendo === fecha && (
                  <VistaPrevia fecha={fecha} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
