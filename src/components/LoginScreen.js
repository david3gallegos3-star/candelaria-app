// ============================================
// PANTALLA DE LOGIN
// Usado por: App.js
// ============================================

import React from 'react';

function LoginScreen({ email, setEmail, password, setPassword, login, loading }) {
  return (
    <div style={{
      display:'flex', justifyContent:'center', alignItems:'center',
      height:'100vh', background:'linear-gradient(135deg,#1a1a2e,#16213e)'
    }}>
      <div style={{
        background:'white', padding:'40px', borderRadius:'16px',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)', width:'380px'
      }}>
        <div style={{ textAlign:'center', marginBottom:'24px' }}>
          <img 
            src="/LOGO_CANDELARIA_1.png" 
            alt="Candelaria" 
            style={{
              width:'220px', maxWidth:'85%', marginBottom:'8px',
              background:'white', padding:'10px 16px', borderRadius:'10px'
            }}
          />
          <p style={{ color:'#888', margin:0, fontSize:'14px' }}>
            Sistema de Fórmulas y Costos
          </p>
        </div>

        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            width:'100%', padding:'12px', margin:'6px 0',
            borderRadius:'8px', border:'1px solid #ddd',
            boxSizing:'border-box', fontSize:'14px'
          }}
        />

        <input
          placeholder="Contraseña"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && login()}
          style={{
            width:'100%', padding:'12px', margin:'6px 0',
            borderRadius:'8px', border:'1px solid #ddd',
            boxSizing:'border-box', fontSize:'14px'
          }}
        />

        <button
          onClick={login}
          disabled={loading}
          style={{
            width:'100%', padding:'13px', background:'#27ae60',
            color:'white', border:'none', borderRadius:'8px',
            cursor:'pointer', fontSize:'15px', marginTop:'12px',
            fontWeight:'bold'
          }}
        >
          {loading ? 'Entrando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  );
}

export default LoginScreen;