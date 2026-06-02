import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function CobrosEfectivo() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('cobros')
        .select('id, fecha, monto, forma_pago, observaciones, clientes(nombre)')
        .eq('forma_pago', 'efectivo')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',      label: 'Fecha' },
    { key: 'cliente',    label: 'Cliente',  render: f => f.clientes?.nombre || '—' },
    { key: 'monto',      label: 'Monto',    render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago', label: 'Forma Pago', render: () => 'Efectivo (01)' },
    { key: 'obs',        label: 'Comentario', render: f => f.observaciones || '' },
  ];

  return (
    <TablaLectura
      titulo="💵 Cobros Efectivo"
      filas={filas}
      columnas={columnas}
      cargando={cargando}
      campoMonto="monto"
    />
  );
}
