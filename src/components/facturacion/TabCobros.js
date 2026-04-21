// ============================================
// TabCobros.js
// Historial de cobros realizados
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const FORMA_ICONO = {
  efectivo:      '💵',
  transferencia: '🏦',
  cheque:        '📝',
};

export default function TabCobros({ mobile }) {

  const [cobros,       setCobros]       = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [filtroTexto,  setFiltroTexto]  = useState('');
  const [filtroForma,  setFiltroForma]  = useState('todas');
  const [filtroDesde,  setFiltroDesde]  = useState('');
  const [filtroHasta,  setFiltroHasta]  = useState('');

  useEffect(() => { cargarCobros(); }, []);

  async function cargarCobros() {
    setCargando(true);
    const { data } = await supabase
      .from('cobros')
      .select(`
        *,
        facturas ( numero ),
        cuentas_cobrar ( monto_total ),
        clientes ( nombre )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setCobros(data || []);
    setCargando(false);
  }

  // ── Filtros ───────────────────────────────────────────────
  const cobrosFiltrados = cobros.filter(c => {
    const textoOk = !filtroTexto ||
      (c.facturas?.numero || '').toLowerCase().includes(filtroTexto.toLowerCase()) ||
      (c.cliente_nombre || '').toLowerCase().includes(filtroTexto.toLowerCase());
    const formaOk = filtroForma === 'todas' || c.forma_pago === filtroForma;
    const desdeOk = !filtroDesde || c.fecha >= filtroDesde;
    const hastaOk = !filtroHasta || c.fecha <= filtroHasta;
    return textoOk && formaOk && desdeOk && hastaOk;
  });

  const totalFiltrado = cobrosFiltrados
    .reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);

  const totalesPorForma = ['efectivo', 'transferencia', 'cheque'].map(f => ({
    forma: f,
    total: cobrosFiltrados
      .filter(c => c.forma_pago === f)
      .reduce((s, c) => s + (parseFloat(c.monto) || 0), 0)
  })).filter(f => f.total > 0);

  // ── Exportar CSV ──────────────────────────────────────────
  function exportarExcel() {
    function txt(v) { return `"${String(v || '').replace(/"/g, '""')}"`; }
    function num(v) { return parseFloat(v || 0).toFixed(2); }
    function fecha(f) {
      if (!f) return '""';
      const [y, m, d] = f.split('-');
      return `"${parseInt(d)}/${parseInt(m)}/${y}"`;
    }

    const SEP  = ';';
    const enc  = ['forma_pago', 'nombre_cliente', 'valor_cuenta', 'valor_pago', 'fecha_pago'];
    const rows = cobrosFiltrados.map(c => [
      (c.forma_pago || '').toUpperCase(),
      c.clientes?.nombre || c.cliente_nombre || '',
      num(c.cuentas_cobrar?.monto_total || 0).replace('.', ','),
      num(c.monto || 0).replace('.', ','),
      fecha(c.fecha)
    ]);
    const csv  = [`sep=${SEP}`, enc.join(SEP), ...rows.map(r => r.join(SEP))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cobros_${filtroDesde || new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputStyle = {
    padding: '8px 10px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  return (
    <div>

      {/* Filtros */}
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <input
          type="text"
          value={filtroTexto}
          onChange={e => setFiltroTexto(e.target.value)}
          placeholder="🔍 Buscar factura o cliente..."
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
        />
        <select
          value={filtroForma}
          onChange={e => setFiltroForma(e.target.value)}
          style={inputStyle}
        >
          <option value="todas">Todas las formas</option>
          <option value="efectivo">💵 Efectivo</option>
          <option value="transferencia">🏦 Transferencia</option>
          <option value="cheque">📝 Cheque</option>
        </select>
        <input
          type="date" value={filtroDesde}
          onChange={e => setFiltroDesde(e.target.value)}
          style={inputStyle} title="Desde"
        />
        <input
          type="date" value={filtroHasta}
          onChange={e => setFiltroHasta(e.target.value)}
          style={inputStyle} title="Hasta"
        />
        <button onClick={exportarExcel} style={{
          background: '#27ae60', color: 'white', border: 'none',
          borderRadius: 8, padding: '8px 14px',
          cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
          whiteSpace: 'nowrap'
        }}>📥 Excel</button>
      </div>

      {/* Resumen del período */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile
          ? '1fr 1fr'
          : `repeat(${1 + totalesPorForma.length}, 1fr)`,
        gap: 10, marginBottom: 14
      }}>
        {/* Total general */}
        <div style={{
          background: 'linear-gradient(135deg,#1a2a4a,#1e3a6e)',
          borderRadius: 12, padding: '14px', textAlign: 'center',
          gridColumn: mobile ? 'span 2' : undefined
        }}>
          <div style={{ fontSize: '10px', color: '#aaa', fontWeight: 700, marginBottom: 4 }}>
            TOTAL COBRADO
          </div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#a9dfbf' }}>
            ${totalFiltrado.toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: '#aaa', marginTop: 2 }}>
            {cobrosFiltrados.length} cobros
          </div>
        </div>

        {/* Por forma de pago */}
        {totalesPorForma.map(f => (
          <div key={f.forma} style={{
            background: 'white', borderRadius: 12,
            padding: '14px', textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontSize: '18px', marginBottom: 4 }}>
              {FORMA_ICONO[f.forma]}
            </div>
            <div style={{ fontSize: '10px', color: '#888', fontWeight: 700, marginBottom: 2 }}>
              {f.forma.toUpperCase()}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a5276' }}>
              ${f.total.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Lista de cobros */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          ⏳ Cargando cobros...
        </div>
      ) : cobrosFiltrados.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40,
          background: 'white', borderRadius: 12, color: '#aaa'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 'bold' }}>Sin cobros en este período</div>
          <div style={{ fontSize: '12px', marginTop: 4 }}>
            Los cobros registrados aparecerán aquí
          </div>
        </div>
      ) : (
        <div style={{
          background: 'white', borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden'
        }}>
          {/* Encabezado tabla (desktop) */}
          {!mobile && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr 1fr 100px 120px 1fr',
              gap: 8, padding: '10px 16px',
              background: '#f0f2f5',
              fontSize: '10px', fontWeight: 'bold', color: '#888'
            }}>
              {['FECHA', 'FACTURA', 'CLIENTE', 'MONTO', 'FORMA', 'OBSERVACIONES'].map(h => (
                <div key={h}>{h}</div>
              ))}
            </div>
          )}

          {cobrosFiltrados.map((c, idx) => (
            <div key={c.id} style={{
              display: mobile ? 'block' : 'grid',
              gridTemplateColumns: '110px 1fr 1fr 100px 120px 1fr',
              gap: 8,
              padding: mobile ? '12px' : '10px 16px',
              background: idx % 2 === 0 ? 'white' : '#fafafa',
              borderBottom: '1px solid #f0f0f0',
              alignItems: 'center'
            }}>
              {/* Fecha */}
              <div style={{ fontSize: mobile ? '11px' : '13px', color: '#555' }}>
                {mobile && <span style={{ fontWeight: 'bold', color: '#888', fontSize: '10px' }}>FECHA: </span>}
                {c.fecha}
              </div>

              {/* Factura */}
              <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '13px' }}>
                {mobile && <span style={{ fontWeight: 'bold', color: '#888', fontSize: '10px' }}>FACTURA: </span>}
                {c.facturas?.numero || '—'}
              </div>

              {/* Cliente */}
              <div style={{ fontSize: '13px', color: '#555' }}>
                {mobile && <span style={{ fontWeight: 'bold', color: '#888', fontSize: '10px' }}>CLIENTE: </span>}
                {c.cliente_nombre || '—'}
              </div>

              {/* Monto */}
              <div style={{
                fontWeight: 'bold', color: '#27ae60',
                fontSize: mobile ? '15px' : '14px'
              }}>
                {mobile && <span style={{ fontWeight: 'bold', color: '#888', fontSize: '10px' }}>MONTO: </span>}
                ${parseFloat(c.monto).toFixed(2)}
              </div>

              {/* Forma */}
              <div style={{ fontSize: '13px' }}>
                {mobile && <span style={{ fontWeight: 'bold', color: '#888', fontSize: '10px' }}>FORMA: </span>}
                {FORMA_ICONO[c.forma_pago] || ''} {c.forma_pago}
              </div>

              {/* Observaciones */}
              <div style={{ fontSize: '12px', color: '#888', fontStyle: c.observaciones ? 'normal' : 'italic' }}>
                {mobile && <span style={{ fontWeight: 'bold', color: '#888', fontSize: '10px' }}>OBS: </span>}
                {c.observaciones || '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
