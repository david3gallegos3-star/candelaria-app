// ============================================
// Dashboard.js — módulo principal
// KPIs · Alertas · Gráficas
// ============================================
import React, { useState, useEffect } from 'react';
import DashboardHeader from './components/dashboard/DashboardHeader';
import TabKPIs         from './components/dashboard/TabKPIs';
import TabAlertas      from './components/dashboard/TabAlertas';
import TabGraficas     from './components/dashboard/TabGraficas';

function Dashboard({ onVolver, onVolverMenu, userRol }) {
  const [tabActiva, setTabActiva] = useState('kpis');
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
      <DashboardHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
      />

      <div style={{ padding: mobile ? '12px' : '16px 20px' }}>
        {tabActiva === 'kpis'     && <TabKPIs     mobile={mobile} />}
        {tabActiva === 'alertas'  && <TabAlertas  mobile={mobile} />}
        {tabActiva === 'graficas' && <TabGraficas mobile={mobile} />}
      </div>
    </div>
  );
}

export default Dashboard;
