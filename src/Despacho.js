// ============================================
// Despacho.js
// Módulo de despacho vinculado a lotes
// ============================================
import React, { useState } from 'react';
import DespachoHeader    from './components/despacho/DespachoHeader';
import TabNuevoDespacho  from './components/despacho/TabNuevoDespacho';
import TabDespachos      from './components/despacho/TabDespachos';
import TabGuiasRemision  from './components/despacho/TabGuiasRemision';

const mobile = window.innerWidth < 600;

export default function Despacho({ onVolver, onVolverMenu, userRol }) {
  const [tabActiva,  setTabActiva]  = useState('nuevo');
  const [refrescar,  setRefrescar]  = useState(false);

  function alCrearDespacho() {
    setRefrescar(r => !r);
    setTabActiva('lista');
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg,#f0fdf4 0%,#f8f9fa 100%)'
    }}>
      <DespachoHeader
        mobile={mobile}
        tabActiva={tabActiva}
        setTabActiva={setTabActiva}
        onVolver={onVolver}
        onVolverMenu={onVolverMenu}
      />

      <div style={{ padding: mobile ? '12px' : '20px', maxWidth: 900, margin: '0 auto' }}>
        {tabActiva === 'nuevo' && (
          <TabNuevoDespacho mobile={mobile} onDespachoCreado={alCrearDespacho} />
        )}
        {tabActiva === 'lista' && (
          <TabDespachos mobile={mobile} refrescar={refrescar} />
        )}
        {tabActiva === 'guias' && (
          <TabGuiasRemision mobile={mobile} />
        )}
      </div>
    </div>
  );
}
