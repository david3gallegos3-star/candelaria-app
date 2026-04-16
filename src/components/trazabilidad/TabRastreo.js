// ============================================
// TabRastreo.js
// Rastreo completo de un lote:
// MP usada → producción → controles → despacho
// ============================================
import React, { useState } from 'react';
import { supabase } from '../../supabase';

export default function TabRastreo({ mobile }) {
  const [busqueda,  setBusqueda]  = useState('');
  const [resultado, setResultado] = useState(null);
  const [cargando,  setCargando]  = useState(false);
  const [error,     setError]     = useState('');

  async function rastrear() {
    if (!busqueda.trim()) { setError('Ingresa un código de lote.'); return; }
    setCargando(true); setError(''); setResultado(null);

    // 1. Buscar el lote
    const { data: lotes } = await supabase
      .from('lotes_produccion')
      .select('*, produccion_diaria(id, fecha, kg_producidos, producto_nombre, productos(id))')
      .ilike('codigo_lote', `%${busqueda.trim()}%`)
      .limit(1);

    if (!lotes || lotes.length === 0) {
      setError(`No se encontró ningún lote con código "${busqueda}".`);
      setCargando(false); return;
    }

    const lote = lotes[0];
    const produccion = lote.produccion_diaria;

    // 2. Controles de calidad del lote
    const { data: controles } = await supabase
      .from('controles_calidad')
      .select('*')
      .eq('lote_id', lote.id)
      .order('created_at');

    // 3. Si hay producción, buscar los ingredientes usados (formulación activa en esa fecha)
    let ingredientes = [];
    if (produccion?.productos?.id) {
      const { data: formula } = await supabase
        .from('formulaciones')
        .select('mp_nombre, cantidad_kg_por_kg, materia_prima_id')
        .eq('producto_id', produccion.productos.id)
        .eq('activo', true)
        .is('deleted_at', null);

      if (formula && produccion.kg_producidos) {
        ingredientes = formula.map(f => ({
          nombre:    f.mp_nombre,
          kg_usados: (f.cantidad_kg_por_kg * produccion.kg_producidos).toFixed(3)
        }));
      }
    }

    // 4. Compras de las MP usadas en el período (±7 días de la fecha de producción)
    let comprasRelacionadas = [];
    if (ingredientes.length > 0 && produccion?.fecha) {
      const fechaBase = new Date(produccion.fecha + 'T00:00:00');
      const desde = new Date(fechaBase); desde.setDate(desde.getDate() - 7);
      const hasta = new Date(fechaBase); hasta.setDate(hasta.getDate() + 1);

      const { data: detalles } = await supabase
        .from('compras_detalle')
        .select('mp_nombre, cantidad_kg, precio_unitario, compras(fecha, proveedores(nombre))')
        .in('mp_nombre', ingredientes.map(i => i.nombre))
        .gte('compras.fecha', desde.toISOString().slice(0,10))
        .lte('compras.fecha', hasta.toISOString().slice(0,10));

      comprasRelacionadas = detalles || [];
    }

    setResultado({ lote, produccion, controles: controles || [], ingredientes, comprasRelacionadas });
    setCargando(false);
  }

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };

  function Seccion({ titulo, children }) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a3a1a', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
          {titulo}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div>
      {/* Buscador */}
      <div style={{ ...card, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && rastrear()}
          placeholder="Código de lote (Ej. SAL-260415-312)..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '8px',
            border: '1.5px solid #ddd', fontSize: '14px', outline: 'none',
            fontFamily: 'monospace'
          }}
        />
        <button onClick={rastrear} disabled={cargando} style={{
          background: cargando ? '#aaa' : 'linear-gradient(135deg,#1a3a1a,#2d5a1b)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '10px 20px', cursor: cargando ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {cargando ? 'Rastreando...' : '🔍 Rastrear lote'}
        </button>
      </div>

      {/* Info */}
      {!resultado && !cargando && !error && (
        <div style={{ ...card, background: '#eaf4ff', border: '1px solid #bee3f8' }}>
          <div style={{ fontSize: '13px', color: '#1a3a5c', lineHeight: '1.8' }}>
            <b>🔍 Rastreo de lote completo</b><br />
            Ingresa un código de lote para ver toda su cadena:<br />
            <b>Compras de MP</b> → <b>Producción</b> → <b>Controles de calidad</b> → <b>Estado de despacho</b>
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...card, background: '#ffeaea', border: '1px solid #e74c3c', color: '#e74c3c', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <>
          {/* Encabezado lote */}
          <div style={{ ...card, background: 'linear-gradient(135deg,#1a3a1a,#2d5a1b)', color: 'white' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', marginBottom: '6px' }}>
              🏷️ {resultado.lote.codigo_lote}
            </div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px', opacity: 0.9 }}>
              <span>📦 {resultado.lote.producto_nombre}</span>
              <span>⚖️ {resultado.lote.cantidad_kg} kg</span>
              <span>📅 Prod: {resultado.lote.fecha_produccion}</span>
              <span>⏳ Vence: {resultado.lote.fecha_vencimiento || '—'}</span>
              <span style={{
                background: resultado.lote.estado === 'activo' ? '#27ae60' : resultado.lote.estado === 'retenido' ? '#e74c3c' : '#2980b9',
                borderRadius: '12px', padding: '2px 10px', fontSize: '11px', fontWeight: 'bold'
              }}>
                {resultado.lote.estado?.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Producción */}
          {resultado.produccion && (
            <Seccion titulo="🏭 Producción de origen">
              <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#555', flexWrap: 'wrap' }}>
                <span>Fecha: <b>{resultado.produccion.fecha}</b></span>
                <span>Producto: <b>{resultado.produccion.producto_nombre}</b></span>
                <span>Kg producidos: <b>{resultado.produccion.kg_producidos} kg</b></span>
              </div>
            </Seccion>
          )}

          {/* Ingredientes usados */}
          {resultado.ingredientes.length > 0 && (
            <Seccion titulo="🧪 Ingredientes usados (según fórmula activa)">
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: '8px' }}>
                {resultado.ingredientes.map((ing, i) => (
                  <div key={i} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
                    <b>{ing.nombre}</b><br />
                    <span style={{ color: '#555' }}>{ing.kg_usados} kg</span>
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {/* Compras relacionadas */}
          {resultado.comprasRelacionadas.length > 0 && (
            <Seccion titulo="🛒 Compras de MP (±7 días de producción)">
              {resultado.comprasRelacionadas.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f2f5', fontSize: '12px', color: '#555' }}>
                  <span><b>{c.mp_nombre}</b> — {c.compras?.proveedores?.nombre || 'Proveedor'}</span>
                  <span>{c.cantidad_kg} kg · ${c.precio_unitario}/kg · {c.compras?.fecha}</span>
                </div>
              ))}
            </Seccion>
          )}

          {/* Controles de calidad */}
          <Seccion titulo={`✅ Controles de calidad (${resultado.controles.length})`}>
            {resultado.controles.length === 0 ? (
              <div style={{ color: '#888', fontSize: '13px' }}>Sin controles registrados para este lote.</div>
            ) : (
              resultado.controles.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f2f5', fontSize: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <span><b>{c.parametro}</b>: {c.valor_obtenido} {c.valor_minimo && `(min: ${c.valor_minimo} / max: ${c.valor_maximo})`}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{
                      background: c.resultado === 'Aprobado' ? '#27ae60' : c.resultado === 'Rechazado' ? '#e74c3c' : '#f39c12',
                      color: 'white', borderRadius: '10px', padding: '2px 8px', fontSize: '11px'
                    }}>{c.resultado}</span>
                    <span style={{ color: '#888' }}>{c.fecha}</span>
                  </div>
                </div>
              ))
            )}
          </Seccion>
        </>
      )}
    </div>
  );
}
