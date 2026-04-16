// ============================================
// TabAlertas.js
// Alertas críticas consolidadas de todos los módulos
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';

function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy  = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(fecha + 'T00:00:00');
  return Math.round((venc - hoy) / 86400000);
}

function AlertaItem({ nivel, icono, titulo, detalle, modulo }) {
  const colores = {
    rojo:    { bg: '#fef2f2', border: '#e74c3c', txt: '#c0392b', badge: '#e74c3c' },
    naranja: { bg: '#fff8f0', border: '#f39c12', txt: '#d68910', badge: '#f39c12' },
    amarillo:{ bg: '#fffdf0', border: '#f1c40f', txt: '#b7950b', badge: '#f1c40f' },
  };
  const c = colores[nivel] || colores.amarillo;
  return (
    <div style={{
      background: c.bg, borderLeft: `4px solid ${c.border}`,
      borderRadius: '10px', padding: '12px 14px',
      marginBottom: '8px', display: 'flex',
      justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
          <span style={{ fontSize: '16px' }}>{icono}</span>
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: c.txt }}>{titulo}</span>
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>{detalle}</div>
      </div>
      <span style={{
        background: c.badge, color: 'white', borderRadius: '8px',
        padding: '2px 8px', fontSize: '10px', fontWeight: 'bold',
        whiteSpace: 'nowrap', flexShrink: 0
      }}>{modulo}</span>
    </div>
  );
}

export default function TabAlertas({ mobile }) {
  const [alertas,  setAlertas]  = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const hoy       = new Date(); hoy.setHours(0,0,0,0);
    const hoyStr    = hoy.toISOString().split('T')[0];
    const en7dias   = new Date(hoy); en7dias.setDate(en7dias.getDate() + 7);
    const en7Str    = en7dias.toISOString().split('T')[0];
    const en60dias  = new Date(hoy); en60dias.setDate(en60dias.getDate() + 60);
    const en60Str   = en60dias.toISOString().split('T')[0];

    const lista = [];

    // ── 1. Stock bajo (inventario_mp) ──
    try {
      const { data: stock } = await supabase
        .from('inventario_mp')
        .select('stock_actual, stock_minimo, materias_primas(nombre)')
        .filter('stock_actual', 'lt', 'stock_minimo');
      (stock || []).forEach(s => {
        if (s.stock_actual < s.stock_minimo) {
          lista.push({
            nivel: 'rojo', icono: '📦',
            titulo: `Stock bajo: ${s.materias_primas?.nombre || 'Ingrediente'}`,
            detalle: `Actual: ${s.stock_actual} kg · Mínimo: ${s.stock_minimo} kg`,
            modulo: 'Inventario'
          });
        }
      });
    } catch (_) {}

    // ── 2. Cuentas por pagar VENCIDAS ──
    try {
      const { data: venc } = await supabase
        .from('cuentas_pagar')
        .select('saldo_pendiente, fecha_vencimiento, proveedores(nombre)')
        .neq('estado', 'pagado')
        .lt('fecha_vencimiento', hoyStr);
      (venc || []).forEach(c => {
        const dias = Math.abs(diasRestantes(c.fecha_vencimiento));
        lista.push({
          nivel: 'rojo', icono: '💳',
          titulo: `Cuenta vencida: ${c.proveedores?.nombre || 'Proveedor'}`,
          detalle: `Vencida hace ${dias} día(s) · Saldo: $${(c.saldo_pendiente || 0).toFixed(2)}`,
          modulo: 'Compras'
        });
      });
    } catch (_) {}

    // ── 3. Cuentas por pagar que vencen en 7 días ──
    try {
      const { data: proxVenc } = await supabase
        .from('cuentas_pagar')
        .select('saldo_pendiente, fecha_vencimiento, proveedores(nombre)')
        .neq('estado', 'pagado')
        .gte('fecha_vencimiento', hoyStr)
        .lte('fecha_vencimiento', en7Str);
      (proxVenc || []).forEach(c => {
        const dias = diasRestantes(c.fecha_vencimiento);
        lista.push({
          nivel: dias === 0 ? 'rojo' : 'naranja', icono: '⏰',
          titulo: `Vence pronto: ${c.proveedores?.nombre || 'Proveedor'}`,
          detalle: `${dias === 0 ? 'Vence hoy' : `Vence en ${dias} día(s)`} · Saldo: $${(c.saldo_pendiente || 0).toFixed(2)}`,
          modulo: 'Compras'
        });
      });
    } catch (_) {}

    // ── 4. ARCSA vencida o por vencer (≤60 días) ──
    try {
      const { data: arcsa } = await supabase
        .from('notificaciones_arcsa')
        .select('producto, numero_notificacion, fecha_vencimiento')
        .lte('fecha_vencimiento', en60Str);
      (arcsa || []).forEach(a => {
        const dias = diasRestantes(a.fecha_vencimiento);
        lista.push({
          nivel: dias !== null && dias < 0 ? 'rojo' : 'naranja', icono: '🏥',
          titulo: `ARCSA: ${a.producto}`,
          detalle: `N° ${a.numero_notificacion} · ${dias !== null && dias < 0 ? `Vencida hace ${Math.abs(dias)}d` : `Vence en ${dias} día(s)`}`,
          modulo: 'Trazabilidad'
        });
      });
    } catch (_) {}

    // ── 5. Lotes retenidos ──
    try {
      const { data: lotes } = await supabase
        .from('lotes')
        .select('codigo, producto_nombre, observaciones')
        .eq('estado', 'retenido');
      (lotes || []).forEach(l => {
        lista.push({
          nivel: 'rojo', icono: '🚫',
          titulo: `Lote retenido: ${l.codigo}`,
          detalle: `Producto: ${l.producto_nombre}${l.observaciones ? ' · ' + l.observaciones : ''}`,
          modulo: 'Trazabilidad'
        });
      });
    } catch (_) {}

    // ── 6. Facturas pendientes de cobro ──
    try {
      const { data: factPend } = await supabase
        .from('facturas')
        .select('total, fecha, clientes(nombre)')
        .eq('estado_cobro', 'pendiente');
      if ((factPend || []).length > 0) {
        const totalPend = factPend.reduce((s, f) => s + (f.total || 0), 0);
        lista.push({
          nivel: 'amarillo', icono: '🧾',
          titulo: `${factPend.length} factura(s) pendiente(s) de cobro`,
          detalle: `Total por cobrar: $${totalPend.toFixed(2)}`,
          modulo: 'Facturación'
        });
      }
    } catch (_) {}

    // Ordenar: rojos primero, luego naranja, luego amarillo
    const orden = { rojo: 0, naranja: 1, amarillo: 2 };
    lista.sort((a, b) => (orden[a.nivel] || 2) - (orden[b.nivel] || 2));

    setAlertas(lista);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
      Verificando alertas...
    </div>
  );

  const rojas   = alertas.filter(a => a.nivel === 'rojo').length;
  const naranjas = alertas.filter(a => a.nivel === 'naranja').length;

  return (
    <div>
      {/* Resumen */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)',
        gap: '10px', marginBottom: '16px'
      }}>
        {[
          { label: 'Críticas',   valor: rojas,            color: '#e74c3c' },
          { label: 'Advertencias', valor: naranjas,        color: '#f39c12' },
          { label: 'Total',       valor: alertas.length,   color: '#2980b9' },
        ].map(r => (
          <div key={r.label} style={{
            background: 'white', borderRadius: '12px', padding: '14px',
            textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
          }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{r.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: r.color }}>{r.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1a3a2a' }}>
          {alertas.length === 0 ? '✅ Sin alertas activas' : `🚨 ${alertas.length} alerta(s) activa(s)`}
        </div>
        <button onClick={cargar} style={{
          background: '#f0f2f5', border: 'none', borderRadius: '8px',
          padding: '7px 14px', cursor: 'pointer', fontSize: '12px', color: '#555'
        }}>🔄 Actualizar</button>
      </div>

      {alertas.length === 0 ? (
        <div style={{
          background: '#f0fdf4', border: '2px solid #27ae60', borderRadius: '14px',
          padding: '40px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
          <div style={{ color: '#27ae60', fontWeight: 'bold', fontSize: '16px' }}>Todo en orden</div>
          <div style={{ color: '#888', fontSize: '13px', marginTop: '6px' }}>No hay alertas activas en ningún módulo</div>
        </div>
      ) : (
        <div>
          {alertas.map((a, i) => <AlertaItem key={i} {...a} />)}
        </div>
      )}
    </div>
  );
}
