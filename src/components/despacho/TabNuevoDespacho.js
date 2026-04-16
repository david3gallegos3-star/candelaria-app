// ============================================
// TabNuevoDespacho.js
// Crea un despacho vinculado a una factura
// Selecciona lotes de producción a incluir
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const hoy = new Date().toISOString().slice(0, 10);

const ESTADO_COLOR = {
  autorizada: '#27ae60',
  borrador:   '#f39c12',
  anulada:    '#e74c3c',
};

export default function TabNuevoDespacho({ mobile, onDespachoCreado }) {
  const [facturas,     setFacturas]     = useState([]);
  const [lotes,        setLotes]        = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [guardando,    setGuardando]    = useState(false);
  const [error,        setError]        = useState('');
  const [exito,        setExito]        = useState('');

  const [facturaId,    setFacturaId]    = useState('');
  const [fecha,        setFecha]        = useState(hoy);
  const [transportista,setTransportista]= useState('');
  const [rucTransp,    setRucTransp]    = useState('');
  const [placa,        setPlaca]        = useState('');
  const [destino,      setDestino]      = useState('');
  const [observaciones,setObservaciones]= useState('');
  const [lotesSelec,   setLotesSelec]   = useState({}); // { lote_id: kg }

  useEffect(() => { cargarDatos(); }, []);

  async function cargarDatos() {
    setCargando(true);
    const [rFact, rLotes] = await Promise.all([
      supabase.from('facturas')
        .select('id,numero,cliente_nombre,total,estado,fecha')
        .is('deleted_at', null)
        .neq('estado', 'anulada')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('lotes_produccion')
        .select('id,codigo_lote,producto_nombre,fecha_produccion,fecha_vencimiento,cantidad_kg,estado')
        .eq('estado', 'activo')
        .order('fecha_produccion', { ascending: false })
    ]);
    setFacturas(rFact.data || []);
    setLotes(rLotes.data || []);
    setCargando(false);
  }

  function toggleLote(loteId, kgDisponibles) {
    setLotesSelec(prev => {
      const n = { ...prev };
      if (n[loteId] !== undefined) {
        delete n[loteId];
      } else {
        n[loteId] = kgDisponibles;
      }
      return n;
    });
  }

  function setKgLote(loteId, kg) {
    setLotesSelec(prev => ({ ...prev, [loteId]: kg }));
  }

  async function guardar() {
    setError('');
    if (!fecha) return setError('Selecciona la fecha de despacho');
    if (!destino.trim()) return setError('Ingresa el destino');
    if (Object.keys(lotesSelec).length === 0) return setError('Selecciona al menos un lote');

    setGuardando(true);
    try {
      // Generar número de despacho
      const { count } = await supabase.from('despachos').select('*', { count: 'exact', head: true });
      const numero = `DSP-${fecha.replace(/-/g,'')}-${String((count||0)+1).padStart(4,'0')}`;

      // Insertar despacho
      const { data: despacho, error: errD } = await supabase.from('despachos').insert({
        factura_id:    facturaId || null,
        numero,
        fecha,
        transportista: transportista || null,
        ruc_transp:    rucTransp || null,
        placa:         placa || null,
        origen:        'Ibarra, Imbabura, Ecuador',
        destino,
        estado:        'preparando',
        observaciones: observaciones || null,
      }).select().single();

      if (errD) throw new Error(errD.message);

      // Insertar lotes del despacho
      const factura = facturas.find(f => f.id === facturaId);
      const lotesRows = Object.entries(lotesSelec).map(([lote_id, kg]) => {
        const lote = lotes.find(l => l.id === lote_id);
        return {
          despacho_id:    despacho.id,
          lote_id,
          producto:       lote?.producto_nombre || '',
          kg_despachados: parseFloat(kg) || 0,
        };
      });
      await supabase.from('despacho_lotes').insert(lotesRows);

      // Cambiar estado de los lotes seleccionados a "despachado"
      await supabase.from('lotes_produccion')
        .update({ estado: 'despachado' })
        .in('id', Object.keys(lotesSelec));

      // Resetear formulario
      setFacturaId('');
      setFecha(hoy);
      setTransportista('');
      setRucTransp('');
      setPlaca('');
      setDestino('');
      setObservaciones('');
      setLotesSelec({});
      setExito(`✅ Despacho ${numero} creado correctamente`);
      setTimeout(() => setExito(''), 5000);
      cargarDatos();
      if (onDespachoCreado) onDespachoCreado();
    } catch (e) {
      setError('Error: ' + e.message);
    }
    setGuardando(false);
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box'
  };
  const labelStyle = {
    fontSize: '11px', fontWeight: 'bold', color: '#555',
    textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4,
    display: 'block'
  };

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
      ⏳ Cargando datos...
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {exito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '10px 14px', borderRadius: 8,
          fontWeight: 'bold', fontSize: '13px'
        }}>{exito}</div>
      )}
      {error && (
        <div style={{
          background: '#fde8e8', color: '#c0392b',
          padding: '10px 14px', borderRadius: 8,
          fontWeight: 'bold', fontSize: '13px'
        }}>{error}</div>
      )}

      {/* Datos del despacho */}
      <div style={{
        background: 'white', borderRadius: 12,
        padding: mobile ? 14 : 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ fontWeight: 'bold', color: '#1a3a2a', marginBottom: 14, fontSize: '14px' }}>
          📋 Datos del despacho
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
          gap: 12
        }}>
          {/* Factura vinculada (opcional) */}
          <div style={{ gridColumn: mobile ? '1' : '1 / -1' }}>
            <label style={labelStyle}>Factura vinculada (opcional)</label>
            <select
              value={facturaId}
              onChange={e => setFacturaId(e.target.value)}
              style={inputStyle}
            >
              <option value=''>— Sin factura vinculada —</option>
              {facturas.map(f => (
                <option key={f.id} value={f.id}>
                  {f.numero} — {f.cliente_nombre || 'CONSUMIDOR FINAL'} — ${parseFloat(f.total).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Fecha de despacho *</label>
            <input type="date" value={fecha}
              onChange={e => setFecha(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Destino *</label>
            <input type="text" value={destino}
              onChange={e => setDestino(e.target.value)}
              placeholder="Ej: Quito, Pichincha"
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Transportista</label>
            <input type="text" value={transportista}
              onChange={e => setTransportista(e.target.value)}
              placeholder="Nombre del transportista"
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>RUC / Cédula transportista</label>
            <input type="text" value={rucTransp}
              onChange={e => setRucTransp(e.target.value)}
              placeholder="1004007884001"
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Placa del vehículo</label>
            <input type="text" value={placa}
              onChange={e => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC-1234"
              style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Observaciones</label>
            <input type="text" value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas adicionales..."
              style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Selección de lotes */}
      <div style={{
        background: 'white', borderRadius: 12,
        padding: mobile ? 14 : 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <div style={{ fontWeight: 'bold', color: '#1a3a2a', marginBottom: 14, fontSize: '14px' }}>
          📦 Lotes a despachar *
          <span style={{ fontSize: '12px', color: '#888', fontWeight: 'normal', marginLeft: 8 }}>
            Solo lotes con estado "activo"
          </span>
        </div>

        {lotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>
            <div style={{ fontSize: 32 }}>📦</div>
            <div>No hay lotes activos disponibles</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lotes.map(l => {
              const seleccionado = lotesSelec[l.id] !== undefined;
              return (
                <div key={l.id} style={{
                  border: seleccionado ? '2px solid #27ae60' : '1.5px solid #e0e0e0',
                  borderRadius: 10, padding: '10px 14px',
                  background: seleccionado ? '#f0fdf4' : '#fafafa',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
                }} onClick={() => toggleLote(l.id, l.cantidad_kg)}>
                  <input type="checkbox" readOnly checked={seleccionado}
                    style={{ cursor: 'pointer', width: 16, height: 16 }} />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a1a2e' }}>
                      {l.codigo_lote}
                    </div>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                      {l.producto_nombre}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888' }}>
                      Prod: {l.fecha_produccion} · Vence: {l.fecha_vencimiento || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '13px' }}>
                    <div style={{ color: '#2980b9', fontWeight: 'bold' }}>
                      {parseFloat(l.cantidad_kg).toFixed(2)} kg disponibles
                    </div>
                  </div>
                  {seleccionado && (
                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap' }}>kg a despachar:</label>
                      <input
                        type="number"
                        value={lotesSelec[l.id]}
                        onChange={e => setKgLote(l.id, e.target.value)}
                        min="0.001"
                        max={l.cantidad_kg}
                        step="0.001"
                        style={{
                          width: 80, padding: '4px 8px', borderRadius: 6,
                          border: '1.5px solid #27ae60', fontSize: '13px',
                          fontWeight: 'bold', textAlign: 'right'
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Botón guardar */}
      <button
        onClick={guardar}
        disabled={guardando}
        style={{
          background: guardando ? '#95a5a6' : '#2d6a4f',
          color: 'white', border: 'none', borderRadius: 10,
          padding: '14px', fontSize: '14px', fontWeight: 'bold',
          cursor: guardando ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 8px rgba(45,106,79,0.3)'
        }}>
        {guardando ? '⏳ Guardando...' : '🚚 Crear despacho'}
      </button>
    </div>
  );
}
