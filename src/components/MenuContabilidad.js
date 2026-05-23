import React, { useRef, useEffect, useState } from 'react';
import { supabase } from '../supabase';

const SUBMODULOS = [
  {
    emoji: '📒', titulo: 'Libro Diario',
    desc: 'Cerebro contable — asientos, cuentas, saldos',
    color: '#1e3a5f', border: 'rgba(30,58,95,0.6)',
    destino: 'libroDiario',
  },
  {
    emoji: '🧾', titulo: 'Facturación',
    desc: 'Ventas, SRI, cobros',
    color: '#2980b9', border: 'rgba(41,128,185,0.4)',
    destino: 'facturacion',
  },
  {
    emoji: '👥', titulo: 'RRHH',
    desc: 'Empleados, nómina, IESS',
    color: '#4a2c7a', border: 'rgba(74,44,122,0.4)',
    destino: 'rrhh',
  },
  {
    emoji: '🛒', titulo: 'Compras',
    desc: 'Proveedores, ingresos, pagos',
    color: '#1a5276', border: 'rgba(26,82,118,0.4)',
    destino: 'compras',
  },
  {
    emoji: '👥', titulo: 'Clientes',
    desc: 'Precios y alertas de margen',
    color: '#3498db', border: 'rgba(52,152,219,0.4)',
    destino: 'clientes',
  },
];

async function borrarDatosPrueba() {
  const tablas = [
    'libro_diario_detalle','libro_diario',
    'facturas_detalle','facturas',
    'compras_detalle','compras',
    'caja_gastos','caja_entregas','cobros','caja_chica',
    'nomina',
    'cuentas_cobrar','cuentas_pagar',
    'clientes','empleados','proveedores',
  ];
  for (const t of tablas) {
    await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }
  await supabase.from('config_sistema')
    .update({ valor: '1' }).eq('clave', 'factura_secuencial');
  await supabase.from('config_contabilidad')
    .update({ valor: { completado: false, fecha: null, banco: 0, caja: 0, inventario: 0, patrimonio: 0 } })
    .eq('clave', 'asiento_inicial');
}

export default function MenuContabilidad({ navegarA, onVolver }) {
  const [borrando,         setBorrando]         = useState(false);
  const [msgBorrar,        setMsgBorrar]        = useState('');
  const [borrandoFacturas, setBorrandoFacturas] = useState(false);
  const [msgFacturas,      setMsgFacturas]      = useState('');
  const [borrandoNV,       setBorrandoNV]       = useState(false);
  const [msgNV,            setMsgNV]            = useState('');

  async function handleBorrarFacturas() {
    const ok = window.confirm('⚠️ ¿Borrar TODAS las facturas de prueba?\n\nSe eliminarán: facturas, detalles y cuentas por cobrar. El secuencial vuelve a 1.\n\nEsta acción NO se puede deshacer.');
    if (!ok) return;
    setBorrandoFacturas(true);
    setMsgFacturas('');
    try {
      await supabase.from('facturas_detalle').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('cuentas_cobrar').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('perdidas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('notas_credito').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('facturas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('config_sistema').update({ valor: '1' }).eq('clave', 'factura_secuencial');
      await supabase.from('config_sistema').update({ valor: '1' }).eq('clave', 'nota_credito_secuencial');
      setMsgFacturas('✓ Facturas borradas y secuenciales reiniciados');
    } catch (e) {
      setMsgFacturas('Error: ' + e.message);
    }
    setBorrandoFacturas(false);
    setTimeout(() => setMsgFacturas(''), 5000);
  }

  async function handleBorrarNotasVenta() {
    const ok = window.confirm('⚠️ ¿Borrar TODAS las notas de venta de prueba?\n\nSe eliminarán: notas de venta, detalles y cuentas por cobrar. El secuencial vuelve a 1.\n\nEsta acción NO se puede deshacer.');
    if (!ok) return;
    setBorrandoNV(true);
    setMsgNV('');
    try {
      const { data: nvs } = await supabase.from('facturas').select('id').eq('tipo', 'nota_venta');
      const ids = (nvs || []).map(f => f.id);
      if (ids.length > 0) {
        await supabase.from('facturas_detalle').delete().in('factura_id', ids);
        await supabase.from('cuentas_cobrar').delete().in('factura_id', ids);
      }
      await supabase.from('facturas').delete().eq('tipo', 'nota_venta');
      await supabase.from('config_sistema').update({ valor: '1' }).eq('clave', 'nota_venta_secuencial');
      setMsgNV('✓ Notas de venta borradas y secuencial reiniciado');
    } catch (e) {
      setMsgNV('Error: ' + e.message);
    }
    setBorrandoNV(false);
    setTimeout(() => setMsgNV(''), 5000);
  }

  async function handleBorrarPruebas() {
    const ok = window.confirm('⚠️ ¿Borrar TODOS los datos de prueba?\n\nSe eliminarán: facturas, compras, nómina, caja chica, libro diario, clientes, empleados y proveedores.\n\nEsta acción NO se puede deshacer.');
    if (!ok) return;
    const ok2 = window.confirm('¿Estás seguro? Se borrarán todos los registros.');
    if (!ok2) return;
    setBorrando(true);
    setMsgBorrar('');
    try {
      await borrarDatosPrueba();
      setMsgBorrar('✓ Datos borrados correctamente');
    } catch (e) {
      setMsgBorrar('Error: ' + e.message);
    }
    setBorrando(false);
    setTimeout(() => setMsgBorrar(''), 5000);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0d1b2a,#1a2a3a)',
      fontFamily: 'Arial,sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <BgParticles />

      <div style={{ width: '100%', maxWidth: '680px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>📊</div>
          <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '6px' }}>
            Contabilidad
          </div>
          <div style={{ color: '#7fb3d3', fontSize: '13px' }}>
            Gestión financiera y administrativa
          </div>
        </div>

        {/* Grid submodulos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: '14px', marginBottom: '28px',
        }}>
          {SUBMODULOS.map(m => (
            <button key={m.destino} onClick={() => navegarA(m.destino)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${m.border}`,
                borderRadius: '14px', padding: '24px 16px',
                textAlign: 'center', cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>{m.emoji}</div>
              <div style={{ color: 'white', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px' }}>
                {m.titulo}
              </div>
              <div style={{ color: '#888', fontSize: '11px', marginBottom: '14px' }}>
                {m.desc}
              </div>
              <div style={{
                background: m.color, color: 'white',
                borderRadius: '8px', padding: '8px',
                fontSize: '12px', fontWeight: 'bold',
              }}>
                Abrir
              </div>
            </button>
          ))}
        </div>

        {/* Borrar pruebas */}
        <div style={{ textAlign: 'center', marginBottom: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={handleBorrarPruebas} disabled={borrando} style={{
              background: borrando ? '#374151' : 'rgba(220,38,38,0.15)',
              border: '1.5px solid rgba(220,38,38,0.5)',
              color: '#f87171', borderRadius: '10px',
              padding: '10px 20px', cursor: borrando ? 'default' : 'pointer',
              fontSize: '13px', fontWeight: 'bold',
            }}>
              {borrando ? '⏳ Borrando...' : '🗑️ Borrar datos de prueba'}
            </button>
            <button onClick={handleBorrarFacturas} disabled={borrandoFacturas} style={{
              background: borrandoFacturas ? '#374151' : 'rgba(234,88,12,0.15)',
              border: '1.5px solid rgba(234,88,12,0.5)',
              color: '#fb923c', borderRadius: '10px',
              padding: '10px 20px', cursor: borrandoFacturas ? 'default' : 'pointer',
              fontSize: '13px', fontWeight: 'bold',
            }}>
              {borrandoFacturas ? '⏳ Borrando...' : '🧾 Borrar facturas de prueba'}
            </button>
            <button onClick={handleBorrarNotasVenta} disabled={borrandoNV} style={{
              background: borrandoNV ? '#374151' : 'rgba(142,68,173,0.15)',
              border: '1.5px solid rgba(142,68,173,0.5)',
              color: '#c39bd3', borderRadius: '10px',
              padding: '10px 20px', cursor: borrandoNV ? 'default' : 'pointer',
              fontSize: '13px', fontWeight: 'bold',
            }}>
              {borrandoNV ? '⏳ Borrando...' : '📋 Borrar notas de venta de prueba'}
            </button>
          </div>
          {msgBorrar && (
            <div style={{ fontSize: 12, color: msgBorrar.startsWith('✓') ? '#4ade80' : '#f87171' }}>
              {msgBorrar}
            </div>
          )}
          {msgFacturas && (
            <div style={{ fontSize: 12, color: msgFacturas.startsWith('✓') ? '#4ade80' : '#f87171' }}>
              {msgFacturas}
            </div>
          )}
          {msgNV && (
            <div style={{ fontSize: 12, color: msgNV.startsWith('✓') ? '#4ade80' : '#f87171' }}>
              {msgNV}
            </div>
          )}
        </div>

        {/* Volver */}
        <div style={{ textAlign: 'center' }}>
          <button onClick={onVolver} style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', borderRadius: '10px',
            padding: '10px 28px', cursor: 'pointer',
            fontSize: '13px', fontWeight: 'bold',
          }}>
            ← Volver al menú
          </button>
        </div>

      </div>
    </div>
  );
}

function BgParticles() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.12 + 0.03,
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = '#4a90d9';
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width)  p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      }
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0,
    }} />
  );
}
