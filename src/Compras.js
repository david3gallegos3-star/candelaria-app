// ============================================
// Compras.js — módulo principal
// Nueva compra · Proveedores · Pagos
// ============================================
import React, { useState, useEffect } from 'react';
import ComprasHeader         from './components/compras/ComprasHeader';
import TabIngresoCompra      from './components/compras/TabIngresoCompra';
import TabProveedores        from './components/compras/TabProveedores';
import TabPagosUnificado     from './components/compras/TabPagosUnificado';
import SubirFacturas from './components/compras/SubirFacturas';

function Compras({ onVolver, onVolverMenu, userRol, currentUser }) {

  const [tabActiva, setTabActiva] = useState('nueva');
  const [mobile,    setMobile]    = useState(window.innerWidth < 768);
  const [showSubir,     setShowSubir]     = useState(false);
  const [subirPersonal, setSubirPersonal] = useState(false);

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
        onSubirFacturas={() => { setSubirPersonal(false); setShowSubir(true); }}
        onSubirPersonales={() => { setSubirPersonal(true);  setShowSubir(true); }}
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
        {tabActiva === 'pagos'       && (
          <TabPagosUnificado
            mobile={mobile}
          />
        )}
      </div>
      {showSubir && (
        <SubirFacturas
          esPersonal={subirPersonal}
          onClose={() => setShowSubir(false)}
        />
      )}
    </div>
  );
}

export default Compras;
