// ============================================
// TabDespacho.js
// Despacho y Fraccionamiento de cortes
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy = new Date().toISOString().split('T')[0];

export default function TabDespacho({ mobile, currentUser }) {
  const [fecha,          setFecha]          = useState(hoy);
  const [stockCongelado, setStockCongelado] = useState([]);
  const [registros,      setRegistros]      = useState([]);
  const [cierre,         setCierre]         = useState(null);
  const [cargando,       setCargando]       = useState(true);

  // Modal nuevo / editar registro
  const [modal,          setModal]          = useState(false);
  const [editando,       setEditando]       = useState(null);
  const [mpSelec,        setMpSelec]        = useState('');
  const [pesoAntes,      setPesoAntes]      = useState('');
  const [pesoFunda,      setPesoFunda]      = useState('');
  const [pesoRemanente,  setPesoRemanente]  = useState('');
  const [guardando,      setGuardando]      = useState(false);
  const [errorModal,     setErrorModal]     = useState('');

  // Modal cierre del día
  const [modalCierre,    setModalCierre]    = useState(false);
  const [pesoHueso,      setPesoHueso]      = useState('');
  const [pesoAserrin,    setPesoAserrin]    = useState('');
  const [pesoCarnudo,    setPesoCarnudo]    = useState('');
  const [guardandoCierre,setGuardandoCierre]= useState(false);

  const [exito,          setExito]          = useState('');
  const [error,          setError]          = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: stock }, { data: regs }, { data: cierreData }] = await Promise.all([
      supabase.from('inventario_mp')
        .select('*, materias_primas(id, nombre, nombre_producto, categoria, precio_kg)')
        .gt('stock_kg', 0),
      supabase.from('despacho_cortes')
        .select('*')
        .eq('fecha', fecha)
        .order('created_at', { ascending: false }),
      supabase.from('despacho_cierre_dia')
        .select('*')
        .eq('fecha', fecha)
        .maybeSingle(),
    ]);

    // Solo mostrar stock de categoría Congelación
    const congelados = (stock || []).filter(s =>
      s.materias_primas?.categoria === 'Congelación' && s.stock_kg > 0
    );
    setStockCongelado(congelados);
    setRegistros(regs || []);
    setCierre(cierreData || null);
    setCargando(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Abrir modal nuevo ──────────────────────────────────────
  function abrirNuevo() {
    setEditando(null);
    setMpSelec('');
    setPesoAntes(''); setPesoFunda(''); setPesoRemanente('');
    setErrorModal('');
    setModal(true);
  }

  // ── Abrir modal editar ─────────────────────────────────────
  function abrirEditar(reg) {
    setEditando(reg);
    setMpSelec(reg.materia_prima_id || '');
    setPesoAntes(String(reg.peso_antes   || ''));
    setPesoFunda(String(reg.peso_funda   || ''));
    setPesoRemanente(String(reg.peso_remanente || ''));
    setErrorModal('');
    setModal(true);
  }

  // ── Guardar registro ───────────────────────────────────────
  async function guardarRegistro() {
    const antes     = parseFloat(pesoAntes);
    const funda     = parseFloat(pesoFunda);
    const remanente = parseFloat(pesoRemanente);

    if (!mpSelec)          { setErrorModal('Selecciona un corte'); return; }
    if (!antes || antes <= 0) { setErrorModal('Ingresa el peso antes de cortar'); return; }
    if (!funda || funda <= 0) { setErrorModal('Ingresa el peso de la funda'); return; }
    if (remanente < 0)     { setErrorModal('El remanente no puede ser negativo'); return; }
    if (funda + remanente > antes + 0.01) {
      setErrorModal(`Funda + Remanente (${(funda+remanente).toFixed(3)}) no puede superar el Peso Antes (${antes.toFixed(3)})`);
      return;
    }

    const mp = stockCongelado.find(s => s.materia_prima_id === mpSelec || s.materias_primas?.id === mpSelec);
    const corteName = mp?.materias_primas?.nombre_producto || mp?.materias_primas?.nombre || '';

    setGuardando(true); setErrorModal('');
    try {
      const payload = {
        fecha,
        corte_nombre:     corteName,
        materia_prima_id: mpSelec,
        peso_antes:       antes,
        peso_funda:       funda,
        peso_remanente:   remanente,
        usuario_nombre:   currentUser?.email || '',
        user_id:          currentUser?.id    || null,
      };

      if (editando) {
        // Restaurar stock anterior antes de descontar el nuevo
        const diffAntes  = editando.peso_antes    - (editando.peso_funda + editando.peso_remanente);
        const diffNuevo  = antes - (funda + remanente);
        const diffStock  = diffAntes - diffNuevo; // + = devolver, - = descontar más

        await supabase.from('despacho_cortes').update(payload).eq('id', editando.id);

        // Ajustar stock
        const invReg = stockCongelado.find(s => s.materia_prima_id === mpSelec);
        if (invReg) {
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, invReg.stock_kg + diffStock) })
            .eq('id', invReg.id);
        }
      } else {
        await supabase.from('despacho_cortes').insert(payload);

        // Descontar del stock: lo que salió = peso_antes - remanente (la funda + merma)
        const usado   = antes - remanente;
        const invReg  = stockCongelado.find(s => s.materia_prima_id === mpSelec);
        if (invReg) {
          await supabase.from('inventario_mp')
            .update({ stock_kg: Math.max(0, invReg.stock_kg - usado) })
            .eq('id', invReg.id);
        }
      }

      setModal(false);
      mostrarExito(editando ? '✅ Registro actualizado' : '✅ Corte registrado');
      await cargar();
    } catch (e) { setErrorModal('Error: ' + e.message); }
    setGuardando(false);
  }

  // ── Eliminar registro ──────────────────────────────────────
  async function eliminarRegistro(reg) {
    if (!window.confirm(`¿Eliminar el registro de "${reg.corte_nombre}"?`)) return;
    // Devolver stock
    const usado  = reg.peso_antes - reg.peso_remanente;
    const invReg = stockCongelado.find(s => s.materia_prima_id === reg.materia_prima_id);
    if (invReg) {
      await supabase.from('inventario_mp')
        .update({ stock_kg: invReg.stock_kg + usado })
        .eq('id', invReg.id);
    }
    await supabase.from('despacho_cortes').delete().eq('id', reg.id);
    mostrarExito('🗑️ Registro eliminado');
    await cargar();
  }

  // ── Cierre del día ─────────────────────────────────────────
  async function guardarCierre() {
    setGuardandoCierre(true);
    try {
      const payload = {
        fecha,
        peso_hueso:    parseFloat(pesoHueso    || 0),
        peso_aserrin:  parseFloat(pesoAserrin  || 0),
        peso_carnudo:  parseFloat(pesoCarnudo  || 0),
        usuario_nombre: currentUser?.email || '',
      };
      if (cierre) {
        await supabase.from('despacho_cierre_dia').update(payload).eq('id', cierre.id);
      } else {
        await supabase.from('despacho_cierre_dia').insert(payload);
      }
      setModalCierre(false);
      mostrarExito('✅ Cierre del día registrado');
      await cargar();
    } catch (e) { setError('Error: ' + e.message); }
    setGuardandoCierre(false);
  }

  function abrirCierre() {
    setPesoHueso(String(cierre?.peso_hueso   || ''));
    setPesoAserrin(String(cierre?.peso_aserrin || ''));
    setPesoCarnudo(String(cierre?.peso_carnudo || ''));
    setModalCierre(true);
  }

  function mostrarExito(msg) {
    setExito(msg); setTimeout(() => setExito(''), 5000);
  }

  // ── Cálculos resumen ───────────────────────────────────────
  const totalFunda     = registros.reduce((s, r) => s + (r.peso_funda     || 0), 0);
  const totalRemanente = registros.reduce((s, r) => s + (r.peso_remanente || 0), 0);
  const totalAntes     = registros.reduce((s, r) => s + (r.peso_antes     || 0), 0);
  const totalMerma     = registros.reduce((s, r) => s + (r.merma          || r.peso_antes - r.peso_funda - r.peso_remanente || 0), 0);

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid #ddd', fontSize: 13, outline: 'none'
  };

  return (
    <div>
      {exito && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '12px 16px', borderRadius: 10, marginBottom: 14, fontWeight: 'bold', fontSize: 13 }}>
          {exito}
        </div>
      )}
      {error && (
        <div style={{ background: '#ffeaea', color: '#e74c3c', padding: '12px 16px', borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Barra superior ── */}
      <div style={{
        background: 'white', borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#777', marginBottom: 3, fontWeight: 600 }}>Fecha</div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={abrirNuevo} style={{
          background: 'linear-gradient(135deg,#1a1a2e,#2c3e50)',
          color: 'white', border: 'none', borderRadius: 8,
          padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold'
        }}>+ Registrar corte</button>
        <button onClick={abrirCierre} style={{
          background: cierre
            ? 'linear-gradient(135deg,#27ae60,#1e8449)'
            : 'linear-gradient(135deg,#e67e22,#d35400)',
          color: 'white', border: 'none', borderRadius: 8,
          padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold'
        }}>
          {cierre ? '✅ Ver cierre del día' : '🔒 Cierre del día'}
        </button>
      </div>

      {/* ── Stock disponible ── */}
      {stockCongelado.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          padding: '12px 16px', marginBottom: 14
        }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#888', marginBottom: 8, textTransform: 'uppercase' }}>
            🧊 Stock en Congelación disponible
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stockCongelado.map(s => (
              <div key={s.id} style={{
                background: '#eaf4fd', borderRadius: 8,
                padding: '6px 12px', fontSize: 12
              }}>
                <b>{s.materias_primas?.nombre_producto || s.materias_primas?.nombre}</b>
                <span style={{ color: '#2980b9', marginLeft: 6, fontWeight: 'bold' }}>
                  {parseFloat(s.stock_kg).toFixed(3)} kg
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Resumen del día ── */}
      {registros.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 10, marginBottom: 14
        }}>
          {[
            { label: 'PESO ANTES',    val: `${totalAntes.toFixed(3)} kg`,     color: '#1a3a5c', bg: '#e8f4fd' },
            { label: 'EN FUNDAS',     val: `${totalFunda.toFixed(3)} kg`,     color: '#155724', bg: '#d4edda' },
            { label: 'REMANENTE',     val: `${totalRemanente.toFixed(3)} kg`, color: '#856404', bg: '#fff3cd' },
            { label: 'MERMA CORTE',   val: `${totalMerma.toFixed(3)} kg`,     color: '#721c24', bg: '#fde8e8' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: s.color, fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: mobile ? 16 : 20, fontWeight: 'bold', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lista registros ── */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>
      ) : registros.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'white', borderRadius: 12, color: '#aaa'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
          <div style={{ fontWeight: 'bold' }}>Sin registros para esta fecha</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Presiona "+ Registrar corte" para comenzar</div>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {/* Header tabla */}
          {!mobile && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 100px 90px',
              gap: 8, padding: '10px 16px',
              background: '#f0f2f5', fontSize: 10, fontWeight: 'bold', color: '#888'
            }}>
              {['CORTE', 'ANTES', 'FUNDA', 'REMANENTE', 'MERMA', 'ACCIONES'].map(h => (
                <div key={h} style={{ textAlign: h !== 'CORTE' ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>
          )}

          {registros.map((reg, idx) => {
            const merma   = reg.peso_antes - reg.peso_funda - reg.peso_remanente;
            const pctMerma = reg.peso_antes > 0 ? ((merma / reg.peso_antes) * 100).toFixed(1) : 0;
            return (
              <div key={reg.id} style={{
                display: mobile ? 'block' : 'grid',
                gridTemplateColumns: '1fr 100px 100px 100px 100px 90px',
                gap: 8, padding: mobile ? 14 : '11px 16px',
                background: idx % 2 === 0 ? 'white' : '#fafafa',
                borderBottom: '1px solid #f0f0f0', alignItems: 'center'
              }}>
                {/* Corte */}
                <div style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e', marginBottom: mobile ? 6 : 0 }}>
                  🥩 {reg.corte_nombre}
                </div>
                {/* Antes */}
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize: 13, color: '#555' }}>
                  {mobile && <span style={{ fontSize: 10, color: '#888', fontWeight: 'bold' }}>ANTES: </span>}
                  {parseFloat(reg.peso_antes).toFixed(3)} kg
                </div>
                {/* Funda */}
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize: 13, color: '#27ae60', fontWeight: 'bold' }}>
                  {mobile && <span style={{ fontSize: 10, color: '#888', fontWeight: 'bold' }}>FUNDA: </span>}
                  {parseFloat(reg.peso_funda).toFixed(3)} kg
                </div>
                {/* Remanente */}
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize: 13, color: '#e67e22' }}>
                  {mobile && <span style={{ fontSize: 10, color: '#888', fontWeight: 'bold' }}>REMANENTE: </span>}
                  {parseFloat(reg.peso_remanente).toFixed(3)} kg
                </div>
                {/* Merma */}
                <div style={{ textAlign: mobile ? 'left' : 'right', fontSize: 13, color: merma > 0 ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>
                  {mobile && <span style={{ fontSize: 10, color: '#888', fontWeight: 'bold' }}>MERMA: </span>}
                  {merma.toFixed(3)} kg
                  <span style={{ fontSize: 10, marginLeft: 4, color: '#aaa' }}>({pctMerma}%)</span>
                </div>
                {/* Acciones */}
                <div style={{ display: 'flex', gap: 6, justifyContent: mobile ? 'flex-start' : 'flex-end', marginTop: mobile ? 8 : 0 }}>
                  <button onClick={() => abrirEditar(reg)} style={{
                    background: '#f0f2f5', border: 'none', borderRadius: 7,
                    padding: '6px 10px', cursor: 'pointer', fontSize: 12
                  }}>✏️</button>
                  <button onClick={() => eliminarRegistro(reg)} style={{
                    background: '#fde8e8', border: 'none', borderRadius: 7,
                    padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#e74c3c'
                  }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cierre registrado */}
      {cierre && (
        <div style={{
          background: '#d4edda', borderRadius: 12, padding: '14px 18px', marginTop: 14,
          display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 'bold', color: '#155724' }}>✅ Cierre del día registrado</span>
          <span style={{ fontSize: 13, color: '#1a5276' }}>🦴 Hueso: <b>{cierre.peso_hueso} kg</b></span>
          <span style={{ fontSize: 13, color: '#856404' }}>🪵 Aserrín: <b>{cierre.peso_aserrin} kg</b></span>
          <span style={{ fontSize: 13, color: '#155724' }}>🥩 Carnudo: <b>{cierre.peso_carnudo} kg</b></span>
        </div>
      )}

      {/* ══ Modal Registrar / Editar corte ══ */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 480,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e', marginBottom: 18 }}>
              {editando ? '✏️ Editar registro' : '📦 Registrar corte'}
            </div>

            {/* Selección de corte */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                Corte del stock de congelación *
              </label>
              <select value={mpSelec} onChange={e => setMpSelec(e.target.value)} style={inputStyle}>
                <option value="">— Selecciona un corte —</option>
                {stockCongelado.map(s => (
                  <option key={s.materia_prima_id} value={s.materia_prima_id}>
                    {s.materias_primas?.nombre_producto || s.materias_primas?.nombre}
                    {' · '}{parseFloat(s.stock_kg).toFixed(3)} kg disponibles
                  </option>
                ))}
              </select>
            </div>

            {/* Pesos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Peso antes de cortar (kg) *', val: pesoAntes,     set: setPesoAntes,     color: '#1a3a5c' },
                { label: 'Peso de la funda (kg) *',     val: pesoFunda,     set: setPesoFunda,     color: '#155724' },
                { label: 'Peso del remanente (kg)',      val: pesoRemanente, set: setPesoRemanente, color: '#856404' },
              ].map(({ label, val, set, color }) => (
                <div key={label}>
                  <label style={{ fontSize: 11, fontWeight: 600, color, display: 'block', marginBottom: 4 }}>{label}</label>
                  <input type="number" min="0" step="0.001" value={val}
                    onChange={e => set(e.target.value)}
                    style={{ ...inputStyle, borderColor: color, textAlign: 'right' }} />
                </div>
              ))}
            </div>

            {/* Comparación en tiempo real */}
            {pesoAntes && pesoFunda && (
              <div style={{
                background: '#f0f4f8', borderRadius: 10, padding: '12px 14px', marginBottom: 16
              }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 8 }}>
                  📊 Comparación
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ color: '#888', marginBottom: 2 }}>Antes</div>
                    <div style={{ fontWeight: 'bold', color: '#1a3a5c', fontSize: 14 }}>
                      {parseFloat(pesoAntes || 0).toFixed(3)} kg
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#888', marginBottom: 2 }}>Funda + Remanente</div>
                    <div style={{ fontWeight: 'bold', color: '#27ae60', fontSize: 14 }}>
                      {(parseFloat(pesoFunda||0) + parseFloat(pesoRemanente||0)).toFixed(3)} kg
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#888', marginBottom: 2 }}>Merma corte</div>
                    <div style={{ fontWeight: 'bold', fontSize: 14, color: parseFloat(pesoAntes||0) - parseFloat(pesoFunda||0) - parseFloat(pesoRemanente||0) > 0.001 ? '#e74c3c' : '#27ae60' }}>
                      {(parseFloat(pesoAntes||0) - parseFloat(pesoFunda||0) - parseFloat(pesoRemanente||0)).toFixed(3)} kg
                    </div>
                  </div>
                </div>
              </div>
            )}

            {errorModal && (
              <div style={{
                background: '#ffeaea', border: '1px solid #e74c3c',
                borderRadius: 8, padding: '10px 14px', color: '#e74c3c',
                fontSize: 13, marginBottom: 14
              }}>{errorModal}</div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer', fontSize: 13
              }}>Cancelar</button>
              <button onClick={guardarRegistro} disabled={guardando} style={{
                background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a1a2e,#2c3e50)',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '10px 24px', cursor: guardando ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 'bold'
              }}>
                {guardando ? 'Guardando...' : editando ? '💾 Actualizar' : '✅ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal Cierre del día ══ */}
      {modalCierre && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 24,
            width: '100%', maxWidth: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: 16, color: '#1a1a2e', marginBottom: 6 }}>
              🔒 Cierre del día — {fecha}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
              Registra los pesos de subproductos del día
            </div>

            {[
              { label: '🦴 Peso hueso / no reutilizable (kg)', val: pesoHueso,   set: setPesoHueso,   color: '#555'   },
              { label: '🪵 Peso aserrín (kg)',                  val: pesoAserrin, set: setPesoAserrin, color: '#856404'},
              { label: '🥩 Peso carnudo (kg)',                  val: pesoCarnudo, set: setPesoCarnudo, color: '#155724'},
            ].map(({ label, val, set, color }) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color, display: 'block', marginBottom: 4 }}>{label}</label>
                <input type="number" min="0" step="0.001" value={val}
                  onChange={e => set(e.target.value)}
                  placeholder="0.000"
                  style={{ ...inputStyle, borderColor: '#ddd', textAlign: 'right', fontSize: 15 }} />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={() => setModalCierre(false)} style={{
                background: '#f0f2f5', border: 'none', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer', fontSize: 13
              }}>Cancelar</button>
              <button onClick={guardarCierre} disabled={guardandoCierre} style={{
                background: guardandoCierre ? '#aaa' : 'linear-gradient(135deg,#27ae60,#1e8449)',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '10px 24px', cursor: guardandoCierre ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 'bold'
              }}>
                {guardandoCierre ? 'Guardando...' : '✅ Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
