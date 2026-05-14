import React, { useEffect, useRef, useState } from 'react';

function LoginScreen({ email, setEmail, password, setPassword, login, loading }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: 'radial-gradient(ellipse at 40% 50%, #28201a 0%, #1c1610 40%, #111009 70%, #0a0906 100%)',
      fontFamily: 'Arial, sans-serif',
      position: 'relative',
    }}>
      {/* Glow cálido inferior-derecha igual al de imagen 3 */}
      <div style={{
        position: 'absolute', bottom: '-100px', right: '-100px',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,120,20,0.12) 0%, transparent 65%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', bottom: '-60px', left: '30%',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(220,80,10,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Partículas subiendo */}
      <EmberParticles />

      {/* ── Contenedor centrado ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%',
        gap: isMobile ? '28px' : '60px',
        padding: isMobile ? '32px 20px' : '40px',
        boxSizing: 'border-box',
        overflowY: isMobile ? 'auto' : 'hidden',
      }}>

      {/* Columna izquierda */}
      <div style={{
        width: isMobile ? '100%' : '380px',
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: isMobile ? '14px' : '22px',
      }}>
        {/* Logo dentro de cuadradito blanco */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'white', borderRadius: '14px',
          padding: '12px 24px',
          boxShadow: '0 6px 30px rgba(0,0,0,0.5)',
        }}>
          <img
            src="/LOGO_CANDELARIA_1.png"
            alt="Candelaria"
            style={{ height: isMobile ? '38px' : '56px', objectFit: 'contain' }}
          />
        </div>

        {/* Título */}
        <h1 style={{ margin: 0, lineHeight: 1.1, textAlign: 'center' }}>
          <span style={{ display: 'block', fontSize: isMobile ? '26px' : 'clamp(26px, 3vw, 46px)', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
            Sistema de
          </span>
          <span style={{ display: 'block', fontSize: isMobile ? '26px' : 'clamp(26px, 3vw, 46px)', fontWeight: 900, color: '#e67e22', letterSpacing: '-0.5px' }}>
            Gestión
          </span>
          <span style={{ display: 'block', fontSize: isMobile ? '26px' : 'clamp(26px, 3vw, 46px)', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
            Empresarial
          </span>
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.35)', fontSize: '13px',
          margin: 0, maxWidth: '300px', lineHeight: 1.7, textAlign: 'center',
        }}>
          Plataforma integral para gestión de fórmulas, costos, inventario y producción.
        </p>
      </div>

      {/* Columna derecha — tarjeta login */}
      <div style={{ width: isMobile ? '100%' : '380px', flexShrink: 0 }}>
        <div style={{
          background: 'rgba(255,255,255,0.96)',
          borderRadius: '18px', padding: '36px 32px',
          width: '100%', boxSizing: 'border-box',
          boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#111', marginBottom: '4px' }}>
              Bienvenido
            </div>
            <div style={{ fontSize: '12px', color: '#bbb' }}>
              Ingresa tus credenciales
            </div>
          </div>

          <label style={{ fontSize: '11px', fontWeight: 700, color: '#666', display: 'block', marginBottom: '5px' }}>
            Correo electrónico
          </label>
          <input
            placeholder="usuario@candelaria.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: '100%', padding: '11px 14px', marginBottom: '14px',
              borderRadius: '9px', border: '1.5px solid #e5e5e5',
              boxSizing: 'border-box', fontSize: '13px', color: '#333',
              outline: 'none', background: '#fafafa',
            }}
            onFocus={e => e.target.style.borderColor = '#e67e22'}
            onBlur={e => e.target.style.borderColor = '#e5e5e5'}
          />

          <label style={{ fontSize: '11px', fontWeight: 700, color: '#666', display: 'block', marginBottom: '5px' }}>
            Contraseña
          </label>
          <input
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && login()}
            style={{
              width: '100%', padding: '11px 14px', marginBottom: '20px',
              borderRadius: '9px', border: '1.5px solid #e5e5e5',
              boxSizing: 'border-box', fontSize: '13px', color: '#333',
              outline: 'none', background: '#fafafa',
            }}
            onFocus={e => e.target.style.borderColor = '#e67e22'}
            onBlur={e => e.target.style.borderColor = '#e5e5e5'}
          />

          <button
            onClick={login}
            disabled={loading}
            style={{
              width: '100%', padding: '13px',
              background: loading ? '#ccc' : '#111827',
              color: 'white', border: 'none', borderRadius: '9px',
              cursor: loading ? 'default' : 'pointer',
              fontSize: '14px', fontWeight: 700,
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { if (!loading) e.target.style.background = '#e67e22'; }}
            onMouseLeave={e => { if (!loading) e.target.style.background = '#111827'; }}
          >
            {loading ? 'Entrando...' : 'Ingresar al Sistema'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '10px', color: '#ccc' }}>
            🔒 Conexión segura · Candelaria {new Date().getFullYear()}
          </div>
        </div>
      </div>

      </div>{/* fin contenedor centrado */}
    </div>
  );
}

// ── Partículas brasas subiendo ────────────────────────
function EmberParticles() {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    let animId;

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const FIRE = [
      'rgba(255,120,20,0.9)',
      'rgba(255,120,20,0.7)',
      'rgba(220,80,10,0.7)',
      'rgba(220,80,10,0.5)',
      'rgba(180,40,5,0.6)',
      'rgba(180,40,5,0.4)',
      'rgba(255,160,40,0.5)',
      'rgba(255,160,40,0.8)',
    ];

    function make(w, h, randomY) {
      return {
        x:     Math.random() * w,
        y:     randomY ? Math.random() * h : h + Math.random() * 30,
        r:     Math.random() * 2.2 + 0.4,
        speed: Math.random() * 0.55 + 0.25,
        drift: (Math.random() - 0.5) * 0.35,
        alpha: Math.random() * 0.28 + 0.04,
        color: FIRE[Math.floor(Math.random() * FIRE.length)],
        glow:  Math.random() > 0.65,
      };
    }

    let pts = Array.from({ length: 100 }, () => make(canvas.width, canvas.height, true));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        ctx.shadowBlur  = p.glow ? 16 : 7;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle   = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -8) pts[i] = make(canvas.width, canvas.height, false);
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
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0,
    }} />
  );
}

export default LoginScreen;
