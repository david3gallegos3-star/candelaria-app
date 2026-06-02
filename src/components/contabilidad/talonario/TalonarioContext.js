// src/components/contabilidad/talonario/TalonarioContext.js
import React, { createContext, useContext, useState } from 'react';

const TalonarioContext = createContext(null);

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function TalonarioProvider({ userRol, children }) {
  const hoy = new Date();
  const [mes, setMes]   = useState(hoy.getMonth() + 1);  // 1-12
  const [año, setAño]   = useState(hoy.getFullYear());

  const esAdminContador = userRol?.rol === 'admin' || userRol?.rol === 'contador';

  // Rango de fechas del mes seleccionado (para filtrar tablas con columna fecha)
  const fechaDesde = `${año}-${String(mes).padStart(2,'0')}-01`;
  const ultimoDia  = new Date(año, mes, 0).getDate();
  const fechaHasta = `${año}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

  return (
    <TalonarioContext.Provider value={{
      mes, setMes,
      año, setAño,
      esAdminContador,
      fechaDesde,
      fechaHasta,
      MESES,
    }}>
      {children}
    </TalonarioContext.Provider>
  );
}

export function useTalonario() {
  return useContext(TalonarioContext);
}
