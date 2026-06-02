import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function ComprasTalonario() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const { data } = await supabase
        .from('compras')
        .select('id, fecha, total, tiene_factura, forma_pago, proveedores(nombre)')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');
      setFilas(data || []);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',         label: 'Fecha' },
    { key: 'proveedor',     label: 'Proveedor', render: f => f.proveedores?.nombre || '—' },
    { key: 'tiene_factura', label: 'Tipo', render: f => f.tiene_factura ? 'Con factura' : 'Sin factura' },
    { key: 'total',         label: 'Total', render: f => `$${parseFloat(f.total||0).toFixed(2)}`, align: 'right' },
    { key: 'forma_pago',    label: 'Forma Pago', render: f => {
      const map = { efectivo: 'Efectivo (01)', transferencia: 'Transf. (20)',
                    cheque: 'Cheque (20)', debito: 'Débito (16)', credito: 'Crédito (19)' };
      return map[f.forma_pago] || f.forma_pago || '—';
    }},
  ];

  const totalCon = filas.filter(f =>  f.tiene_factura).reduce((s, f) => s + parseFloat(f.total||0), 0);
  const totalSin = filas.filter(f => !f.tiene_factura).reduce((s, f) => s + parseFloat(f.total||0), 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[['Con factura', totalCon], ['Sin factura', totalSin]].map(([lbl, val]) => (
          <div key={lbl} style={{ background: 'white', borderRadius: 8, padding: '10px 16px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: '#1a5276' }}>${val.toFixed(2)}</div>
          </div>
        ))}
      </div>
      <TablaLectura
        titulo="🛒 Compras del Mes"
        filas={filas}
        columnas={columnas}
        cargando={cargando}
        campoMonto="total"
      />
    </>
  );
}
