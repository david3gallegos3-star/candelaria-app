import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

const LABEL_FORMA = {
  transferencia:   'Transferencia',
  deposito:        'Depósito',
  tarjeta_credito: 'Tarjeta de crédito',
};

export default function CobrosTransferencia() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [{ data: cobros }, { data: ventas }] = await Promise.all([
        supabase.from('cobros')
          .select('id, fecha, monto, forma_pago, observaciones, clientes(nombre), facturas(numero)')
          .in('forma_pago', ['transferencia', 'deposito', 'tarjeta_credito'])
          .gte('fecha', fechaDesde).lte('fecha', fechaHasta),
        // Ventas de contado por transferencia/tarjeta (nunca generan fila en cobros; no hay venta "deposito")
        supabase.from('facturas')
          .select('id, numero, total, forma_pago, created_at, clientes(nombre)')
          .in('forma_pago', ['transferencia', 'tarjeta_credito']).neq('estado', 'anulada')
          .gte('created_at', fechaDesde + 'T00:00:00').lte('created_at', fechaHasta + 'T23:59:59'),
      ]);
      const filasVentas = (ventas || []).map(f => ({
        id: 'v' + f.id, fecha: (f.created_at || '').split('T')[0], forma_pago: f.forma_pago,
        monto: f.total, clientes: f.clientes, facturas: { numero: f.numero },
        observaciones: 'Venta de contado',
      }));
      setFilas([...(cobros || []), ...filasVentas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')));
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',      label: 'Fecha' },
    { key: 'cliente',    label: 'Cliente',    render: f => f.clientes?.nombre || '—' },
    { key: 'monto',      label: 'Monto',      render: f => `$${parseFloat(f.monto||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago', label: 'Forma Pago', render: f => LABEL_FORMA[f.forma_pago] || f.forma_pago },
    { key: 'factura',    label: 'Nº Factura', render: f => f.facturas?.numero || '—' },
    { key: 'obs',        label: 'Comentario', render: f => f.observaciones || '' },
  ];

  const transferencias = filas.filter(f => f.forma_pago === 'transferencia');
  const deposYTarjeta  = filas.filter(f => ['deposito', 'tarjeta_credito'].includes(f.forma_pago));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <TablaLectura
        titulo="🏦 Cobros en Transferencia"
        filas={transferencias}
        columnas={columnas}
        cargando={cargando}
        campoMonto="monto"
      />
      <TablaLectura
        titulo="🏧 Cobros en Depósito y Tarjeta"
        filas={deposYTarjeta}
        columnas={columnas}
        cargando={cargando}
        campoMonto="monto"
      />
    </div>
  );
}
