// src/components/contabilidad/talonario/egresos/GastosEfectivo.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function GastosEfectivo() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('caja_gastos')
        .select('id, fecha, concepto, monto, tipo')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',   label: 'Fecha' },
    { key: 'concepto',label: 'Concepto' },
    { key: 'tipo',    label: 'Tipo' },
    { key: 'monto',   label: 'Monto', render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'fp',      label: 'Forma Pago', render: () => 'Efectivo (01)' },
  ];

  return (
    <TablaLectura
      titulo="💸 Gastos Efectivo"
      filas={filas}
      columnas={columnas}
      cargando={cargando}
      campoMonto="monto"
    />
  );
}
