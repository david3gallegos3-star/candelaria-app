// ============================================
// Trazabilidad.js — módulo principal
// Lotes · Calidad · ARCSA · Rastreo
// ============================================
import React, { useState, useEffect } from 'react';
import TrazabilidadHeader from './components/trazabilidad/TrazabilidadHeader';
import TabLotes           from './components/trazabilidad/TabLotes';
import TabCalidad         from './components/trazabilidad/TabCalidad';
import TabARCSA           from './components/trazabilidad/TabARCSA';
import TabRastreo         from './components/trazabilidad/TabRastreo';

function Trazabilidad({ onVolver, onVolverMenu, userRol }) {
  const [tabActiva, setTabActiva] = useState('lotes');
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
      <TrazabilidadHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
      />
      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>
        {tabActiva === 'lotes'   && <TabLotes   mobile={mobile} />}
        {tabActiva === 'calidad' && <TabCalidad mobile={mobile} />}
        {tabActiva === 'arcsa'   && <TabARCSA   mobile={mobile} />}
        {tabActiva === 'rastreo' && <TabRastreo mobile={mobile} />}
      </div>
    </div>
  );
}

export default Trazabilidad;
