// ============================================
// Conciliacion.js — módulo principal
// Inventario · Precios · Producción · IA
// ============================================
import React, { useState, useEffect } from 'react';
import ConciliacionHeader       from './components/conciliacion/ConciliacionHeader';
import TabDesfasesInventario    from './components/conciliacion/TabDesfasesInventario';
import TabDesfasesPrecios       from './components/conciliacion/TabDesfasesPrecios';
import TabDesfasesProduccion    from './components/conciliacion/TabDesfasesProduccion';
import TabAnalisisIA            from './components/conciliacion/TabAnalisisIA';

function Conciliacion({ onVolver, onVolverMenu, userRol }) {

  const [tabActiva, setTabActiva] = useState('inventario');
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
      <ConciliacionHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
      />

      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>
        {tabActiva === 'inventario' && (
          <TabDesfasesInventario mobile={mobile} />
        )}
        {tabActiva === 'precios' && (
          <TabDesfasesPrecios mobile={mobile} />
        )}
        {tabActiva === 'produccion' && (
          <TabDesfasesProduccion mobile={mobile} />
        )}
        {tabActiva === 'ia' && (
          <TabAnalisisIA mobile={mobile} />
        )}
      </div>
    </div>
  );
}

export default Conciliacion;
