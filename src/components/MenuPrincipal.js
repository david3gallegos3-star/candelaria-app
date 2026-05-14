// ============================================
// MENÚ PRINCIPAL — módulos por rol
// Usado por: App.js
// ============================================

import React, { useEffect, useRef } from 'react';
import Campana from './Campana';

const ROL_LABEL = {
  admin:      'Administrador',
  formulador: 'Formulador',
  produccion: 'Producción',
  bodeguero:  'Bodeguero',
  contadora:  'Contadora'
};

const ROL_COLOR = {
  admin:      '#8e44ad',
  formulador: '#1a5276',
  produccion: '#e67e22',
  bodeguero:  '#27ae60',
  contadora:  '#2980b9'
};

function MenuPrincipal({
  userRol, navegarA, logout,
  presentes,
  notificaciones, notifNoLeidas,
  campanAbierta, setCampanaAbierta,
  cargarNotificaciones, productos,
  abrirProducto, cargarUsuariosRoles,
  setModalUsuarios
}) {
  const rol = userRol?.rol;

  // Módulos visibles según rol
  const modulos = [];
  if (rol === 'admin' || rol === 'formulador')
    modulos.push({
      emoji:'🧪', titulo:'Fórmulas y costos',
      desc:'Ingredientes, precios, historial',
      color:'#27ae60', border:'rgba(39,174,96,0.4)',
      fn: () => navegarA('menu')
    });
  if (rol === 'admin' || rol === 'produccion')
    modulos.push({
      emoji:'🏭', titulo:'Producción',
      desc:'Paradas, lotes, descuentos',
      color:'#f39c12', border:'rgba(243,156,18,0.4)',
      fn: () => navegarA('produccion')
    });
  if (rol === 'admin' || rol === 'bodeguero')
    modulos.push({
      emoji:'📦', titulo:'Inventario',
      desc:'Stock, entradas, salidas',
      color:'#e74c3c', border:'rgba(231,76,60,0.4)',
      fn: () => navegarA('inventario')
    });

  if (rol === 'admin')
    modulos.push({
      emoji:'🏪', titulo:'Inv. Producción',
      desc:'Stock fundas y productos terminados',
      color:'#17a589', border:'rgba(23,165,137,0.4)',
      fn: () => navegarA('inventarioproduccion')
    });

  if (rol === 'admin') {
    modulos.push({
      emoji:'👥', titulo:'Clientes',
      desc:'Precios y alertas de margen',
      color:'#3498db', border:'rgba(52,152,219,0.4)',
      fn: () => navegarA('clientes')
    });
  }

  if (rol === 'admin')
    modulos.push({
      emoji:'👥', titulo:'RRHH',
      desc:'Empleados, nómina, IESS',
      color:'#4a2c7a', border:'rgba(74,44,122,0.4)',
      fn: () => navegarA('rrhh')
    });

  if (rol === 'admin')
    modulos.push({
      emoji:'🏷️', titulo:'Trazabilidad',
      desc:'Lotes, calidad, ARCSA',
      color:'#2d5a1b', border:'rgba(45,90,27,0.4)',
      fn: () => navegarA('trazabilidad')
    });

  if (rol === 'admin')
    modulos.push({
      emoji:'🔍', titulo:'Conciliación',
      desc:'Desfases entre módulos + IA',
      color:'#1a2a3a', border:'rgba(26,42,58,0.4)',
      fn: () => navegarA('conciliacion')
    });

  if (rol === 'admin')
    modulos.push({
      emoji:'🛒', titulo:'Compras',
      desc:'Proveedores, ingresos, pagos',
      color:'#1a5276', border:'rgba(26,82,118,0.4)',
      fn: () => navegarA('compras')
    });

  if (rol === 'admin' || rol === 'contadora')
    modulos.push({
      emoji:'🧾', titulo:'Facturación',
      desc:'Ventas, SRI, cobros',
      color:'#2980b9', border:'rgba(41,128,185,0.4)',
      fn: () => navegarA('facturacion')
    });

  if (rol === 'admin')
    modulos.push({
      emoji:'📊', titulo:'Dashboard',
      desc:'KPIs, alertas y gráficas',
      color:'#16a085', border:'rgba(22,160,133,0.4)',
      fn: () => navegarA('dashboard')
    });

  if (rol === 'admin')
    modulos.push({
      emoji:'🗂️', titulo:'Auditoría',
      desc:'Historial permanente',
      color:'#8e44ad', border:'rgba(142,68,173,0.4)',
      fn: () => navegarA('auditoria')
    });

  return (
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(135deg,#1a1a2e,#16213e)',
      fontFamily:'Arial,sans-serif',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      padding:'20px',
      position:'relative', overflow:'hidden'
    }}>
      <ParticlesBg />
      <div style={{ width:'100%', maxWidth:'700px', position:'relative', zIndex:1 }}>

        {/* Logo y título */}
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <img
            src="/LOGO_CANDELARIA_1.png"
            alt="Candelaria"
            style={{
              height:'60px', background:'white',
              padding:'8px 16px', borderRadius:'10px', marginBottom:'16px'
            }}
          />
          <div style={{ color:'white', fontSize:'22px', fontWeight:'bold', marginBottom:'6px' }}>
            Sistema de Gestión
          </div>
          <div style={{ color:'#aaa', fontSize:'13px' }}>
            Embutidos y Jamones Candelaria
          </div>
        </div>

        {/* Campana admin */}
        {rol === 'admin' && (
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'12px' }}>
            <Campana
              userRol={userRol}
              presentes={presentes}
              notificaciones={notificaciones}
              notifNoLeidas={notifNoLeidas}
              campanAbierta={campanAbierta}
              setCampanaAbierta={setCampanaAbierta}
              cargarNotificaciones={cargarNotificaciones}
              productos={productos}
              abrirProducto={abrirProducto}
              navegarA={navegarA}
            />
          </div>
        )}

        {/* Grid de módulos */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))',
          gap:'14px', marginBottom:'24px'
        }}>
          {modulos.map((m, i) => (
            <button key={i} onClick={m.fn}
              style={{
                background:'rgba(255,255,255,0.06)',
                border:`1.5px solid ${m.border}`,
                borderRadius:'14px', padding:'24px 16px',
                textAlign:'center', cursor:'pointer',
                transition:'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize:'32px', marginBottom:'10px' }}>{m.emoji}</div>
              <div style={{ color:'white', fontSize:'14px', fontWeight:'bold', marginBottom:'6px' }}>
                {m.titulo}
              </div>
              <div style={{ color:'#888', fontSize:'11px', marginBottom:'14px' }}>
                {m.desc}
              </div>
              <div style={{
                background:m.color, color:'white',
                borderRadius:'8px', padding:'8px',
                fontSize:'12px', fontWeight:'bold'
              }}>
                Abrir
              </div>
            </button>
          ))}
        </div>

        {/* Barra inferior — usuario y botones */}
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background:'rgba(255,255,255,0.06)',
          borderRadius:'10px', padding:'12px 16px'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{
              background: ROL_COLOR[rol] || '#888',
              borderRadius:'50%', width:'36px', height:'36px',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'white', fontWeight:'bold', fontSize:'14px'
            }}>
              {userRol?.nombre?.charAt(0) || 'U'}
            </div>
            <div>
              <div style={{ color:'white', fontSize:'13px', fontWeight:'bold' }}>
                {userRol?.nombre}
              </div>
              <div style={{ color:'#aaa', fontSize:'11px' }}>
                {ROL_LABEL[rol] || rol}
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:'8px' }}>
            {rol === 'admin' && (
              <button onClick={() => {
                cargarUsuariosRoles();
                setModalUsuarios(true);
              }} style={{
                background:'rgba(255,255,255,0.15)',
                border:'1px solid rgba(255,255,255,0.3)',
                color:'white', borderRadius:'8px',
                padding:'8px 14px', cursor:'pointer', fontSize:'12px'
              }}>
                👥 Usuarios
              </button>
            )}
            <button onClick={logout} style={{
              background:'#e74c3c', border:'none', color:'white',
              borderRadius:'8px', padding:'8px 14px',
              cursor:'pointer', fontSize:'12px', fontWeight:'bold'
            }}>
              Salir
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Partículas animadas de fondo ──────────────────────
// Colores fuego: desde rojo oscuro hasta naranja/amarillo intenso
const FIRE_COLORS = [
  '#ff0000','#ff1100','#ff2200','#ff3300',
  '#ff4400','#ff5500','#ff6600','#ff7700',
  '#ff8800','#ff9900','#ffaa00','#cc0000',
  '#dd1100','#bb0000','#ff2200',
];

function ParticlesBg() {
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

    const particles = Array.from({ length: 120 }, () => {
      const intense = Math.random() > 0.5; // mitad intensas, mitad suaves
      return {
        x:     Math.random() * canvas.width,
        y:     Math.random() * canvas.height,
        r:     intense ? Math.random() * 4 + 2 : Math.random() * 2 + 0.8,
        dx:    (Math.random() - 0.5) * (intense ? 0.8 : 0.3),
        dy:    (Math.random() - 0.5) * (intense ? 0.8 : 0.3),
        color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
        alpha: intense ? Math.random() * 0.12 + 0.08 : Math.random() * 0.05 + 0.02,
        glow:  intense,
      };
    });

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        // Glow para las partículas intensas
        ctx.shadowBlur  = p.glow ? 30 : 14;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle   = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width)  p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:'absolute', inset:0,
        width:'100%', height:'100%',
        pointerEvents:'none', zIndex:0,
      }}
    />
  );
}

export default MenuPrincipal;