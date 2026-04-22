// ============================================
// Facturacion.js — módulo principal
// Ventas · Facturas · Por cobrar · Cobros
// ============================================
import React, { useState, useEffect } from 'react';
import FacturacionHeader from './components/facturacion/FacturacionHeader';
import TabNuevaVenta     from './components/facturacion/TabNuevaVenta';
import TabFacturas       from './components/facturacion/TabFacturas';
import TabCobrar         from './components/facturacion/TabCobrar';
import TabCajaChica      from './components/facturacion/TabCajaChica';

function Facturacion({ onVolver, onVolverMenu, userRol, currentUser }) {

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

      <FacturacionHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
      />

      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>
        {tabActiva === 'nueva'    && (
          <TabNuevaVenta
            mobile={mobile}
            currentUser={currentUser}
          />
        )}
        {tabActiva === 'facturas' && (
          <TabFacturas
            mobile={mobile}
          />
        )}
        {tabActiva === 'cobros'   && (
          <TabCobrar
            mobile={mobile}
            currentUser={currentUser}
          />
        )}
        {tabActiva === 'cajachica' && (
          <TabCajaChica
            mobile={mobile}
            currentUser={currentUser}
          />
        )}
      </div>
    </div>
  );
}

export default Facturacion;
