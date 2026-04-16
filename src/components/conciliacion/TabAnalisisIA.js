// ============================================
// TabAnalisisIA.js
// Recolecta todos los desfases y genera un
// análisis ejecutivo usando la API de IA
// ============================================
import React, { useState, useCallback } from 'react';
import { supabase } from '../../supabase';

const hoy  = new Date().toISOString().slice(0, 10);
const mes1 = hoy.slice(0, 7) + '-01';

async function fetchDesfasesResumen(desde, hasta) {
  // ── 1. Desfases inventario ──
  const { data: detalles } = await supabase
    .from('compras_detalle')
    .select('materia_prima_id, mp_nombre, cantidad_kg, compras(fecha)')
    .gte('compras.fecha', desde).lte('compras.fecha', hasta);

  const { data: movEntradas } = await supabase
    .from('inventario_movimientos')
    .select('materia_prima_id, nombre_mp, kg')
    .eq('tipo', 'entrada')
    .gte('created_at', desde + 'T00:00:00').lte('created_at', hasta + 'T23:59:59');

  const comprasPorMP = {};
  (detalles || []).forEach(d => {
    comprasPorMP[d.materia_prima_id] = (comprasPorMP[d.materia_prima_id] || 0) + (d.cantidad_kg || 0);
  });
  const movPorMP = {};
  (movEntradas || []).forEach(m => {
    movPorMP[m.materia_prima_id] = (movPorMP[m.materia_prima_id] || 0) + (m.kg || 0);
  });
  const desfasesInv = [];
  new Set([...Object.keys(comprasPorMP), ...Object.keys(movPorMP)]).forEach(id => {
    const diff = (comprasPorMP[id] || 0) - (movPorMP[id] || 0);
    if (Math.abs(diff) > 0.01) {
      const nombre = (detalles || []).find(d => d.materia_prima_id === id)?.mp_nombre
        || (movEntradas || []).find(m => m.materia_prima_id === id)?.nombre_mp || id;
      desfasesInv.push({ nombre, diff: diff.toFixed(2) });
    }
  });

  // ── 2. Desfases precios ──
  const { data: detPrecio } = await supabase
    .from('compras_detalle')
    .select('materia_prima_id, mp_nombre, precio_unitario, cantidad_kg, compras(fecha)')
    .gte('compras.fecha', desde).lte('compras.fecha', hasta);

  const { data: materias } = await supabase
    .from('materias_primas').select('id, nombre, precio_kg').is('deleted_at', null);

  const precioActual = {};
  (materias || []).forEach(m => { precioActual[m.id] = m.precio_kg; });

  const agr = {};
  (detPrecio || []).forEach(d => {
    if (!agr[d.materia_prima_id]) agr[d.materia_prima_id] = { nombre: d.mp_nombre, totalKg: 0, totalCosto: 0 };
    agr[d.materia_prima_id].totalKg    += d.cantidad_kg || 0;
    agr[d.materia_prima_id].totalCosto += (d.cantidad_kg || 0) * (d.precio_unitario || 0);
  });
  const desfasesPrecios = [];
  Object.entries(agr).forEach(([id, c]) => {
    const pComp = c.totalKg > 0 ? c.totalCosto / c.totalKg : 0;
    const pForm = precioActual[id] || 0;
    if (pForm > 0) {
      const pct = ((pComp - pForm) / pForm) * 100;
      if (Math.abs(pct) >= 5) {
        desfasesPrecios.push({ nombre: c.nombre, pct: pct.toFixed(1), pComp: pComp.toFixed(4), pForm: pForm.toFixed(4) });
      }
    }
  });

  // ── 3. Resumen producción ──
  const { data: prod } = await supabase
    .from('produccion_diaria')
    .select('producto_nombre, kg_producidos, fecha')
    .gte('fecha', desde).lte('fecha', hasta).is('deleted_at', null);

  const totalKgProd = (prod || []).reduce((s, p) => s + (p.kg_producidos || 0), 0);
  const prodPorProd = {};
  (prod || []).forEach(p => {
    prodPorProd[p.producto_nombre] = (prodPorProd[p.producto_nombre] || 0) + (p.kg_producidos || 0);
  });

  // ── 4. Resumen compras ──
  const { data: compras } = await supabase
    .from('compras')
    .select('total, proveedor_id, proveedores(nombre)')
    .gte('fecha', desde).lte('fecha', hasta).is('deleted_at', null);

  const totalCompras  = (compras || []).reduce((s, c) => s + (c.total || 0), 0);

  return {
    periodo: `${desde} al ${hasta}`,
    desfasesInv,
    desfasesPrecios,
    totalKgProd,
    productosProd: Object.entries(prodPorProd).map(([n, kg]) => `${n}: ${kg.toFixed(1)}kg`),
    totalCompras,
    numCompras: (compras || []).length
  };
}

export default function TabAnalisisIA({ mobile }) {
  const [desde,    setDesde]    = useState(mes1);
  const [hasta,    setHasta]    = useState(hoy);
  const [analisis, setAnalisis] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error,    setError]    = useState('');

  const generarAnalisis = useCallback(async () => {
    setCargando(true);
    setAnalisis('');
    setError('');

    let resumen;
    try {
      resumen = await fetchDesfasesResumen(desde, hasta);
    } catch (e) {
      setError('Error al recolectar datos: ' + e.message);
      setCargando(false);
      return;
    }

    const prompt = `Eres un analista financiero y de operaciones para una empresa ecuatoriana de embutidos llamada "Candelaria".
Analiza el siguiente resumen de datos del período ${resumen.periodo} y genera un informe ejecutivo en español, claro y accionable.

## DATOS DEL PERÍODO

**Producción:**
- Total producido: ${resumen.totalKgProd.toFixed(1)} kg
- Por producto: ${resumen.productosProd.join(', ') || 'Sin datos'}

**Compras:**
- Total invertido: $${resumen.totalCompras.toFixed(2)}
- Número de compras: ${resumen.numCompras}

**Desfases de inventario (compras vs entradas registradas):**
${resumen.desfasesInv.length === 0
  ? '✅ Sin desfases detectados'
  : resumen.desfasesInv.map(d => `- ${d.nombre}: diferencia de ${d.diff} kg`).join('\n')}

**Desfases de precios (compra real vs precio en fórmulas, umbral 5%):**
${resumen.desfasesPrecios.length === 0
  ? '✅ Sin alertas de precio'
  : resumen.desfasesPrecios.map(d => `- ${d.nombre}: ${d.pct}% (comprado a $${d.pComp}/kg, fórmula usa $${d.pForm}/kg)`).join('\n')}

## INSTRUCCIONES
1. Menciona brevemente el volumen de operaciones del período.
2. Identifica los problemas más críticos (si los hay).
3. Explica el impacto económico potencial de los desfases.
4. Da 3 recomendaciones concretas y prioritizadas.
5. Usa formato con secciones claras. Sé directo y usa máximo 350 palabras.`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: prompt, historial: [] })
      });
      const data = await res.json();
      if (data.texto) {
        setAnalisis(data.texto);
      } else {
        setError(data.error || 'Sin respuesta de la IA.');
      }
    } catch (e) {
      setError('Error al conectar con la IA: ' + e.message);
    }
    setCargando(false);
  }, [desde, hasta]);

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  // Render básico de markdown (negrita y listas)
  function renderTexto(texto) {
    return texto.split('\n').map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      const esLista = line.trim().startsWith('-') || line.trim().startsWith('•');
      return (
        <div key={i} style={{
          marginBottom: esLista ? '4px' : '8px',
          paddingLeft: esLista ? '12px' : 0,
          lineHeight: '1.6',
          color: line.startsWith('##') ? '#1a2a3a' : '#333',
          fontWeight: line.startsWith('##') ? 'bold' : 'normal',
          fontSize: line.startsWith('##') ? '14px' : '13px'
        }}
          dangerouslySetInnerHTML={{ __html: bold.replace(/^##\s*/, '') }}
        />
      );
    });
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Desde</div>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Hasta</div>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={generarAnalisis} disabled={cargando} style={{
          background: cargando ? '#aaa' : 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
          color: 'white', border: 'none', borderRadius: '8px',
          padding: '9px 20px', cursor: cargando ? 'default' : 'pointer',
          fontSize: '13px', fontWeight: 'bold'
        }}>
          {cargando ? '🤖 Analizando...' : '🤖 Generar análisis IA'}
        </button>
      </div>

      {/* Info inicial */}
      {!analisis && !cargando && !error && (
        <div style={{ ...card, background: 'linear-gradient(135deg,#1a2a3a,#1e3a5c)', color: 'white' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px', textAlign: 'center' }}>🤖</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>
            Análisis Ejecutivo con IA
          </div>
          <div style={{ fontSize: '13px', color: '#ccc', textAlign: 'center', lineHeight: '1.7' }}>
            Recolecta automáticamente todos los desfases del período seleccionado
            y genera un informe ejecutivo con recomendaciones prioritizadas.<br /><br />
            Cruza: <b style={{ color: 'white' }}>Compras · Inventario · Producción · Precios</b>
          </div>
        </div>
      )}

      {/* Cargando */}
      {cargando && (
        <div style={{ ...card, textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏳</div>
          <div style={{ color: '#555', fontSize: '14px' }}>
            Recolectando datos y generando análisis...<br />
            <span style={{ color: '#888', fontSize: '12px' }}>Esto puede tomar unos segundos</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ ...card, background: '#ffeaea', border: '1px solid #e74c3c', color: '#e74c3c' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Resultado */}
      {analisis && (
        <div style={card}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '16px', paddingBottom: '12px',
            borderBottom: '1px solid #eee'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a2a3a' }}>
              🤖 Análisis IA — {desde} al {hasta}
            </div>
            <button onClick={() => setAnalisis('')} style={{
              background: '#f0f2f5', border: 'none', borderRadius: '6px',
              padding: '5px 10px', cursor: 'pointer', fontSize: '11px', color: '#555'
            }}>✕ Cerrar</button>
          </div>
          <div style={{ lineHeight: '1.7' }}>
            {renderTexto(analisis)}
          </div>
          <div style={{
            marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #eee',
            display: 'flex', gap: '8px', justifyContent: 'flex-end'
          }}>
            <button onClick={generarAnalisis} style={{
              background: 'linear-gradient(135deg,#1a2a3a,#1e3a5c)',
              color: 'white', border: 'none', borderRadius: '8px',
              padding: '8px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
            }}>
              🔄 Regenerar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
