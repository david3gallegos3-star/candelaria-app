// ============================================
// RRHH.js — módulo principal
// Empleados · Nómina · IESS · Reportes
// ============================================
import React, { useState, useEffect } from 'react';
import RRHHHeader       from './components/rrhh/RRHHHeader';
import TabEmpleados     from './components/rrhh/TabEmpleados';
import TabNomina        from './components/rrhh/TabNomina';
import TabIESS          from './components/rrhh/TabIESS';
import TabReportesRRHH  from './components/rrhh/TabReportesRRHH';

function RRHH({ onVolver, onVolverMenu, userRol }) {

  const [tabActiva, setTabActiva] = useState('empleados');
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
      <RRHHHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
      />

      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>
        {tabActiva === 'empleados' && <TabEmpleados  mobile={mobile} />}
        {tabActiva === 'nomina'    && <TabNomina     mobile={mobile} />}
        {tabActiva === 'iess'      && <TabIESS       mobile={mobile} />}
        {tabActiva === 'reportes'  && <TabReportesRRHH mobile={mobile} />}
      </div>
    </div>
  );
}

export default RRHH;
