// src/Talonario.js
import React from 'react';
import { TalonarioProvider } from './components/contabilidad/talonario/TalonarioContext';
import TabTalonario from './components/contabilidad/talonario/TabTalonario';

export default function Talonario({ onVolver, onVolverMenu, userRol }) {
  return (
    <TalonarioProvider userRol={userRol}>
      <TabTalonario onVolver={onVolver} onVolverMenu={onVolverMenu} />
    </TalonarioProvider>
  );
}
