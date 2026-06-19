// ============================================
// Compras.js — módulo principal
// Nueva compra · Proveedores · Pagos
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import ComprasHeader         from './components/compras/ComprasHeader';
import TabIngresoCompra      from './components/compras/TabIngresoCompra';
import TabProveedores        from './components/compras/TabProveedores';
import TabPagosUnificado     from './components/compras/TabPagosUnificado';
import TabPersonalesCompras  from './components/compras/TabPersonalesCompras';
import SubirFacturas         from './components/compras/SubirFacturas';

const FORMA_LABEL = {
  transferencia: 'Transferencia', cheque: 'Cheque', deposito: 'Depósito',
  efectivo: 'Efectivo', credito: 'Crédito', tarjeta: 'Tarjeta',
};

function ModalPersonales({ onClose, onNueva }) {
  const [compras,     setCompras]     = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [busqueda,    setBusqueda]    = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase
      .from('compras')
      .select('id,fecha,proveedor_nombre,total,forma_pago,tiene_factura,numero_factura,es_personal')
      .eq('es_personal', true)
      .order('fecha', { ascending: false });
    if (filtroDesde) q = q.gte('fecha', filtroDesde);
    if (filtroHasta) q = q.lte('fecha', filtroHasta);
    const { data } = await q;
    setCompras(data || []);
    setCargando(false);
  }, [filtroDesde, filtroHasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = compras.filter(c =>
    !busqueda || (c.proveedor_nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const total = filtradas.reduce((s, c) => s + parseFloat(c.total || 0), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'white', borderRadius: 14, width: 720, maxWidth: '96vw',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#7d3c98,#5b2c6f)', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>📄 Compras Personales</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={onNueva} style={{ background: '#27ae60', color: 'white', border: 'none',
              borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
              + Nueva compra personal
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none',
              color: 'white', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee',
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, color: '#777', display: 'block', marginBottom: 2 }}>Desde</label>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#777', display: 'block', marginBottom: 2 }}>Hasta</label>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11, color: '#777', display: 'block', marginBottom: 2 }}>Proveedor</label>
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar..." style={{ width: '100%', padding: '6px 10px', borderRadius: 6,
                border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }} />
          </div>
          {(filtroDesde || filtroHasta || busqueda) && (
            <button onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setBusqueda(''); }}
              style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer',
                fontSize: 12, alignSelf: 'flex-end', paddingBottom: 6 }}>✕ Limpiar</button>
          )}
        </div>

        {/* Tabla */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>⏳ Cargando...</div>
          ) : filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>
              Sin compras personales registradas
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: '#f5f0fa' }}>
                  {['Fecha','Proveedor','Forma pago','Factura','Total'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Total' ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: '#555', borderBottom: '2px solid #e0d0f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0',
                    background: i % 2 === 0 ? 'white' : '#fdf9ff' }}>
                    <td style={{ padding: '8px 12px', color: '#555' }}>{c.fecha || '—'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.proveedor_nombre || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666' }}>{FORMA_LABEL[c.forma_pago] || c.forma_pago}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {c.tiene_factura
                        ? (c.numero_factura
                            ? <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ {c.numero_factura}</span>
                            : <span style={{ color: '#f39c12' }}>⚠️ Pendiente</span>)
                        : <span style={{ color: '#aaa' }}>Sin factura</span>}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#7d3c98' }}>
                      ${parseFloat(c.total || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer con total */}
        {filtradas.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '2px solid #e0d0f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#fdf9ff' }}>
            <span style={{ fontSize: 12, color: '#888' }}>{filtradas.length} compra{filtradas.length !== 1 ? 's' : ''}</span>
            <span style={{ fontWeight: 'bold', color: '#7d3c98', fontSize: 14 }}>
              Total: ${total.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Compras({ onVolver, onVolverMenu, userRol, currentUser, navState, onClearNavState }) {
  const [tabActiva,       setTabActiva]       = useState('nueva');
  const [editCompraId,    setEditCompraId]    = useState(null);
  const [mobile,          setMobile]          = useState(window.innerWidth < 768);
  const [showSubir,       setShowSubir]       = useState(false);
  const [subirPersonal,   setSubirPersonal]   = useState(false);
  const [showPersonales,  setShowPersonales]  = useState(false);

  useEffect(() => {
    if (!navState) return;
    if (navState.tab === 'personales') {
      setTabActiva('personales');
      setEditCompraId(navState.editId || null);
    }
  }, [navState]);

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  function abrirNuevaPersonal() {
    setShowPersonales(false);
    setSubirPersonal(true);
    setShowSubir(true);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5',
      fontFamily: '"Segoe UI", system-ui, sans-serif' }}>

      <ComprasHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
        onSubirFacturas={() => { setSubirPersonal(false); setShowSubir(true); }}
        onSubirPersonales={() => setShowPersonales(true)}
      />

      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>
        {tabActiva === 'nueva'       && <TabIngresoCompra mobile={mobile} currentUser={currentUser} />}
        {tabActiva === 'proveedores' && <TabProveedores   mobile={mobile} />}
        {tabActiva === 'pagos'       && <TabPagosUnificado mobile={mobile} />}
        {tabActiva === 'personales'  && (
          <TabPersonalesCompras
            mobile={mobile}
            currentUser={currentUser}
            userRol={userRol}
            editCompraId={editCompraId}
            onClearEdit={() => { setEditCompraId(null); onClearNavState?.(); }}
          />
        )}
      </div>

      {showSubir && (
        <SubirFacturas
          esPersonal={subirPersonal}
          onClose={() => setShowSubir(false)}
        />
      )}

      {showPersonales && (
        <ModalPersonales
          onClose={() => setShowPersonales(false)}
          onNueva={abrirNuevaPersonal}
        />
      )}
    </div>
  );
}

export default Compras;
