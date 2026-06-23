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
      const [{ data: cobros }, { data: ventas }] = await Promise.all([
        supabase.from('cobros')
          .select('id, fecha, monto, forma_pago, observaciones, clientes(nombre)')
          .eq('forma_pago', 'efectivo')
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
        // Ventas de contado en efectivo (nunca generan fila en cobros)
        supabase.from('facturas')
          .select('id, numero, total, created_at, clientes(nombre)')
          .eq('forma_pago', 'efectivo').neq('estado', 'anulada')
          .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59'),
      ]);
      const filasVentas = (ventas || []).map(f => ({
        id: 'v' + f.id, fecha: (f.created_at || '').split('T')[0],
        monto: f.total, clientes: f.clientes, observaciones: `Venta de contado — ${f.numero}`,
      }));
      setFilas([...(cobros || []), ...filasVentas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')));
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
