// src/components/contabilidad/talonario/hotmail/HotmailSync.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';

function TarjetaEstado({ stmt, onCargar, cargando }) {
  const d = stmt.datos_json || {};
  const esTarjeta = stmt.tipo_cuenta === 'tarjeta_credito';
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: 16,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 12,
      border: stmt.estado === 'cargado' ? '2px solid #27ae60' : '2px solid #e8f4fd',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: 14, color: '#1a2a4a' }}>
            {esTarjeta ? '💳' : '🏦'} {stmt.banco}
            {stmt.red_tarjeta && ` — ${stmt.red_tarjeta}`}
            {stmt.ultimos4 && ` ****${stmt.ultimos4}`}
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            {stmt.tipo_cuenta === 'corriente' ? 'Cuenta corriente' :
             stmt.tipo_cuenta === 'ahorros'   ? 'Cuenta de ahorros' : 'Tarjeta de crédito'}
            {' · '}{meses[(stmt.periodo_mes || 1) - 1]} {stmt.periodo_año}
          </div>
          {d.fecha_corte && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              Corte: {d.fecha_corte}{d.fecha_pago ? ` · Pago: ${d.fecha_pago}` : ''}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: esTarjeta ? '#e74c3c' : '#27ae60' }}>
            ${parseFloat(stmt.saldo || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>
            {esTarjeta ? 'Saldo pendiente' : 'Saldo disponible'}
          </div>
        </div>
      </div>

      {(d.cargos || []).length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 4 }}>CARGOS:</div>
          {(d.cargos || []).map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 11, padding: '2px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ color: '#333', flex: 1 }}>
                {c.descripcion}
                {c.cuota_actual ? ` (Cuota ${c.cuota_actual}/${c.cuota_total})` : ''}
              </span>
              <span style={{ color: '#e74c3c', fontWeight: 'bold', marginLeft: 8 }}>
                ${parseFloat(c.monto || 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {stmt.estado !== 'cargado' ? (
        <button onClick={() => onCargar(stmt.id)} disabled={cargando === stmt.id} style={{
          marginTop: 10, width: '100%',
          background: cargando === stmt.id ? '#95a5a6' : '#27ae60',
          color: 'white', border: 'none', borderRadius: 8,
          padding: '8px 0', cursor: cargando === stmt.id ? 'not-allowed' : 'pointer',
          fontWeight: 'bold', fontSize: 12,
        }}>
          {cargando === stmt.id ? '⏳ Cargando...' : '✅ Cargar al Talonario'}
        </button>
      ) : (
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#27ae60', fontWeight: 'bold' }}>
          ✅ Ya cargado al Talonario
        </div>
      )}
    </div>
  );
}

export default function HotmailSync() {
  const { mes, año } = useTalonario();
  const [tokenInfo,     setTokenInfo]     = useState(null);
  const [cargandoInfo,  setCargandoInfo]  = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [statements,    setStatements]    = useState([]);
  const [msgSync,       setMsgSync]       = useState('');
  const [cargando,      setCargando]      = useState(null);

  useEffect(() => { cargarToken(); }, []);

  async function cargarToken() {
    setCargandoInfo(true);
    const { data } = await supabase.from('ms_tokens')
      .select('email, expires_at, user_id').limit(1).maybeSingle();
    setTokenInfo(data || null);
    if (data) await cargarPendientes();
    setCargandoInfo(false);
  }

  async function cargarPendientes() {
    const { data } = await supabase.from('bank_statements')
      .select('*')
      .eq('estado', 'procesado')
      .order('created_at', { ascending: false });
    setStatements(data || []);
  }

  function conectarHotmail() {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id || 'global';
      window.location.href = `/api/auth/microsoft?userId=${uid}`;
    });
  }

  async function desconectar() {
    if (!window.confirm('¿Desconectar Hotmail? Se borrarán los tokens guardados.')) return;
    const { data: tok } = await supabase.from('ms_tokens').select('user_id').limit(1).maybeSingle();
    if (tok) await supabase.from('ms_tokens').delete().eq('user_id', tok.user_id);
    setTokenInfo(null);
    setStatements([]);
  }

  async function sincronizar() {
    if (!tokenInfo) return;
    setSincronizando(true);
    setMsgSync('');
    try {
      const { data, error } = await supabase.functions.invoke('leer-emails-banco', {
        body: { userId: tokenInfo.user_id },
      });
      if (error) throw new Error(error.message);
      if (data.total === 0) {
        setMsgSync('📭 Todo al día — no hay estados de cuenta nuevos');
      } else {
        setMsgSync(`✅ ${data.nuevos} nuevo(s) · ${data.pendientes} pendiente(s) de carga`);
        setStatements(data.statements || []);
      }
    } catch (e) {
      setMsgSync(`❌ Error: ${e.message}`);
    }
    setSincronizando(false);
  }

  async function cargarAlTalonario(statementId) {
    setCargando(statementId);
    try {
      const { error } = await supabase.functions.invoke('cargar-estado-cuenta', {
        body: { statementId, userId: tokenInfo?.user_id },
      });
      if (error) throw new Error(error.message);
      setStatements(prev =>
        prev.map(s => s.id === statementId ? { ...s, estado: 'cargado' } : s)
      );
    } catch (e) {
      alert('Error al cargar: ' + e.message);
    }
    setCargando(null);
  }

  async function cargarTodos() {
    const pendientes = statements.filter(s => s.estado !== 'cargado');
    for (const s of pendientes) {
      await cargarAlTalonario(s.id);
    }
  }

  if (cargandoInfo) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Cargando...</div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16,
      }}>
        <div style={{ fontWeight: 'bold', fontSize: 15, color: '#1a2a4a', marginBottom: 12 }}>
          📧 Sincronización con Hotmail
        </div>

        {!tokenInfo ? (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              Conecta tu Hotmail para que la IA lea automáticamente tus estados de cuenta bancarios y los cargue al Talonario.
            </p>
            <button onClick={conectarHotmail} style={{
              background: '#0078d4', color: 'white', border: 'none',
              borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
              fontWeight: 'bold', fontSize: 13,
            }}>
              📧 Conectar Hotmail
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{
                background: '#e8f5e9', color: '#27ae60', borderRadius: 8,
                padding: '6px 12px', fontSize: 12, fontWeight: 'bold',
              }}>
                ✅ {tokenInfo.email}
              </div>
              <button onClick={sincronizar} disabled={sincronizando} style={{
                background: sincronizando ? '#95a5a6' : '#2980b9',
                color: 'white', border: 'none', borderRadius: 8,
                padding: '8px 16px', cursor: sincronizando ? 'not-allowed' : 'pointer',
                fontWeight: 'bold', fontSize: 12,
              }}>
                {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar estados de cuenta'}
              </button>
              <button onClick={desconectar} style={{
                background: 'white', color: '#e74c3c',
                border: '1.5px solid #e74c3c', borderRadius: 8,
                padding: '8px 12px', cursor: 'pointer', fontSize: 12,
              }}>
                ❌ Desconectar
              </button>
            </div>
            {msgSync && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: msgSync.startsWith('❌') ? '#fde8e8' : '#e8f5e9',
                color: msgSync.startsWith('❌') ? '#e74c3c' : '#27ae60',
                fontWeight: 'bold',
              }}>
                {msgSync}
              </div>
            )}
          </div>
        )}
      </div>

      {statements.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#1a2a4a' }}>
              Estados de cuenta encontrados ({statements.length})
            </div>
            {statements.some(s => s.estado !== 'cargado') && (
              <button onClick={cargarTodos} style={{
                background: '#27ae60', color: 'white', border: 'none',
                borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 12,
              }}>
                ✅ Cargar todos al Talonario
              </button>
            )}
          </div>
          {statements.map(stmt => (
            <TarjetaEstado key={stmt.id} stmt={stmt} onCargar={cargarAlTalonario} cargando={cargando} />
          ))}
        </div>
      )}
    </div>
  );
}
