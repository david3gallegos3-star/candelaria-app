// ============================================
// Compras.js — módulo principal
// Nueva compra · Proveedores · Por pagar · Pagos
// ============================================
import React, { useState, useEffect } from 'react';
import ComprasHeader      from './components/compras/ComprasHeader';
import TabIngresoCompra   from './components/compras/TabIngresoCompra';
import TabProveedores     from './components/compras/TabProveedores';
import TabCuentasPagar    from './components/compras/TabCuentasPagar';
import TabPagos           from './components/compras/TabPagos';

function Compras({ onVolver, onVolverMenu, userRol, currentUser }) {

  const [tabActiva, setTabActiva] = useState('nueva');
  const [mobile,    setMobile]    = useState(window.innerWidth < 768);

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f0f2f5',
      fontFamily: '"Segoe UI", system-ui, sans-serif'
    }}>

      <ComprasHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
      />

      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>
        {tabActiva === 'nueva'       && (
          <TabIngresoCompra
            mobile={mobile}
            currentUser={currentUser}
          />
        )}
        {tabActiva === 'proveedores' && (
          <TabProveedores
            mobile={mobile}
          />
        )}
        {tabActiva === 'pagar'       && (
          <TabCuentasPagar
            mobile={mobile}
          />
        )}
        {tabActiva === 'pagos'       && (
          <TabPagos
            mobile={mobile}
          />
        )}
      </div>
    </div>
  );
}

export default Compras;
