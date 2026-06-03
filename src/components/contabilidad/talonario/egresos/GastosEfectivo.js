// src/components/contabilidad/talonario/egresos/GastosEfectivo.js
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import { useTalonario } from '../TalonarioContext';
import { TablaLectura } from '../shared/TablaLectura';

export default function GastosEfectivo() {
  const { fechaDesde, fechaHasta } = useTalonario();
  const [filas,    setFilas]    = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      // caja_gastos no tiene fecha — la fecha está en caja_chica
      const { data: cajas } = await supabase
        .from('caja_chica')
        .select('id, fecha')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha');

      const cajaIds = (cajas || []).map(c => c.id);
      if (!cajaIds.length) {
        setFilas([]);
        setCargando(false);
        return;
      }

      const { data: gastos } = await supabase
        .from('caja_gastos')
        .select('id, caja_id, proveedor, detalle, valor')
        .in('caja_id', cajaIds);

      const fechaMap = Object.fromEntries((cajas || []).map(c => [c.id, c.fecha]));
      const merged = (gastos || [])
        .map(g => ({ ...g, fecha: fechaMap[g.caja_id] || '' }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

      setFilas(merged);
      setCargando(false);
    }
    cargar();
  }, [fechaDesde, fechaHasta]);

  const columnas = [
    { key: 'fecha',     label: 'Fecha' },
    { key: 'proveedor', label: 'Proveedor', render: f => f.proveedor || '—' },
    { key: 'detalle',   label: 'Detalle',   render: f => f.detalle   || '—' },
    { key: 'valor',     label: 'Monto', render: f => `$${parseFloat(f.valor||0).toFixed(2)}`, align: 'right' },
    { key: 'fp',        label: 'Forma Pago', render: () => 'Efectivo (01)' },
  ];

  return (
    <TablaLectura
      titulo="💸 Gastos Efectivo"
      filas={filas}
      columnas={columnas}
      cargando={cargando}
      campoMonto="valor"
    />
  );
}
