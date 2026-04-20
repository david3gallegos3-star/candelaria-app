// ============================================
// TabPagos.js
// Historial de pagos a proveedores + Excel
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabase';

const FORMAS = ['Todas', 'transferencia', 'efectivo', 'cheque', 'tarjeta'];

const FORMA_SRI = { efectivo: '01', transferencia: '20', cheque: '20', credito: '19', tarjeta: '19' };

function exportarPagos(filas) {
  const datos = filas.map(p => ({
    'Fecha':         p.fecha_pago || '',
    'Proveedor':     p.proveedores?.nombre || '',
    'Forma de pago': p.forma_pago || '',
    'Monto':         parseFloat((p.monto || 0).toFixed(2)),
    'Notas':         p.notas || ''
  }));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
  XLSX.writeFile(wb, `pagos_proveedores_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportarATS(compras) {
  const RUC_EMPRESA   = '1004007884001';
  const NOMBRE_EMPRESA = 'Embutidos y Jamones Candelaria';

  const enc = [
    'N','CodDoc','Fecha','RUC Emisor','Razón Social Emisor',
    'Nro.Secuencial','TipoId.','Id.Comprador','Razón Social Comprador',
    'Formas de Pago','Descuento','Total Sin Impuestos',
    'Base IVA 0%','Base IVA 5%','Base IVA 8%','Base IVA 12%','Base IVA 14%','Base IVA 15%',
    'No Objeto IVA','Exento IVA','Desc. Adicional','Devol. IVA',
    'Monto IVA','Base ICE','Monto ICE','Base IRBPNR','Monto IRBPNR',
    'Propina','Ret. IVA Pres.','Ret. Renta Pres.',
    'Monto Total','Guía de Remisión','Primeras 3 Artículos','EXTRAS','Nro de Autorización'
  ];

  const rows = compras.map((c, i) => {
    const subtotal  = parseFloat(c.subtotal || 0);
    const iva       = parseFloat(c.iva || 0);
    const total     = parseFloat(c.total || 0);
    const codDoc    = c.tiene_factura ? '01' : '03';
    const baseIVA15 = c.tiene_factura ? subtotal : 0;
    const baseIVA0  = c.tiene_factura ? 0 : subtotal;

    const items3 = (c.compras_detalle || [])
      .slice(0, 3).map(d => d.mp_nombre).join(' / ');

    return [
      i + 1,
      codDoc,
      c.fecha || '',
      c.proveedores?.ruc   || '',
      c.proveedores?.nombre || c.proveedor_nombre || '',
      c.numero_factura || '',
      '04',
      RUC_EMPRESA,
      NOMBRE_EMPRESA,
      FORMA_SRI[c.forma_pago] || '20',
      '0.00',
      subtotal.toFixed(2),
      baseIVA0.toFixed(2), '0.00','0.00','0.00','0.00',
      baseIVA15.toFixed(2),
      '0.00','0.00','0.00','0.00',
      iva.toFixed(2),
      '0.00','0.00','0.00','0.00','0.00','0.00','0.00',
      total.toFixed(2),
      '',
      items3,
      '',
      c.autorizacion_sri || ''
    ];
  });

  const datos = rows.map(r => Object.fromEntries(enc.map((k, i) => [k, r[i]])));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ATS Compras');
  XLSX.writeFile(wb, `ATS_compras_${new Date().toISOString().slice(0,10)}.xlsx`);
}

export default function TabPagos({ mobile }) {
  const hoy   = new Date().toISOString().slice(0, 10);
  const mes1  = hoy.slice(0, 7) + '-01';

  const [pagos,      setPagos]      = useState([]);
  const [comprasATS, setComprasATS] = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [desde,      setDesde]      = useState(mes1);
  const [hasta,      setHasta]      = useState(hoy);
  const [formaFiltro,setFormaFiltro]= useState('Todas');
  const [busqueda,   setBusqueda]   = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: pagosData }, { data: comprasData }] = await Promise.all([
      (() => {
        let q = supabase
          .from('pagos_compras')
          .select(`*, proveedores ( nombre )`)
          .gte('fecha_pago', desde)
          .lte('fecha_pago', hasta)
          .order('fecha_pago', { ascending: false });
        if (formaFiltro !== 'Todas') q = q.eq('forma_pago', formaFiltro);
        return q;
      })(),
      supabase
        .from('compras')
        .select(`*, proveedores ( ruc, nombre ), compras_detalle ( mp_nombre )`)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
    ]);
    setPagos(pagosData || []);
    setComprasATS(comprasData || []);
    setCargando(false);
  }, [desde, hasta, formaFiltro]);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtro por búsqueda local (proveedor o nota)
  const filtrados = pagos.filter(p => {
    if (!busqueda) return true;
    const b = busqueda.toLowerCase();
    return (
      (p.proveedores?.nombre || '').toLowerCase().includes(b) ||
      (p.notas || '').toLowerCase().includes(b)
    );
  });

  // Totales por forma
  const totalesPorForma = filtrados.reduce((acc, p) => {
    const f = p.forma_pago || 'otro';
    acc[f] = (acc[f] || 0) + (p.monto || 0);
    return acc;
  }, {});
  const totalGeneral = filtrados.reduce((s, p) => s + (p.monto || 0), 0);

  const FORMA_EMOJI = {
    transferencia: '🏦', efectivo: '💵', cheque: '📄', tarjeta: '💳'
  };

  const card = {
    background: 'white', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: mobile ? '12px' : '16px', marginBottom: '10px'
  };
  const inputStyle = {
    padding: '8px 12px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px', outline: 'none'
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Desde</div>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Hasta</div>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Forma de pago</div>
          <select value={formaFiltro} onChange={e => setFormaFiltro(e.target.value)} style={inputStyle}>
            {FORMAS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: '11px', color: '#777', marginBottom: '3px', fontWeight: '600' }}>Buscar proveedor</div>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Nombre del proveedor..."
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={() => exportarPagos(filtrados)} style={{
          background: '#27ae60', color: 'white', border: 'none',
          borderRadius: '8px', padding: '9px 16px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          📥 Pagos CSV
        </button>
        <button onClick={() => exportarATS(comprasATS)} style={{
          background: '#8e44ad', color: 'white', border: 'none',
          borderRadius: '8px', padding: '9px 16px', cursor: 'pointer',
          fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
        }}>
          📋 ATS SRI
        </button>
      </div>

      {/* Resumen totales */}
      {filtrados.length > 0 && (
        <div style={{
          ...card,
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a', marginRight: '4px' }}>
            Total: <span style={{ color: '#2980b9' }}>${totalGeneral.toFixed(2)}</span>
          </div>
          {Object.entries(totalesPorForma).map(([forma, total]) => (
            <span key={forma} style={{
              background: '#f0f2f5', borderRadius: '20px',
              padding: '4px 12px', fontSize: '12px', color: '#555'
            }}>
              {FORMA_EMOJI[forma] || '💰'} {forma}: <b>${total.toFixed(2)}</b>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
            {filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Lista */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          Cargando pagos...
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          No hay pagos en el período seleccionado.
        </div>
      ) : (
        filtrados.map(p => (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              {/* Izquierda */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a2a' }}>
                    🏢 {p.proveedores?.nombre || '—'}
                  </span>
                  <span style={{
                    background: '#eaf4ff', color: '#2980b9',
                    borderRadius: '12px', padding: '2px 10px',
                    fontSize: '11px', fontWeight: 'bold'
                  }}>
                    {FORMA_EMOJI[p.forma_pago] || '💰'} {p.forma_pago || '—'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#777' }}>
                  📅 {p.fecha_pago}
                  {p.notas && <span style={{ marginLeft: '10px', fontStyle: 'italic' }}>📝 {p.notas}</span>}
                </div>
              </div>

              {/* Derecha — monto */}
              <div style={{
                fontSize: mobile ? '18px' : '20px',
                fontWeight: 'bold', color: '#27ae60'
              }}>
                ${(p.monto || 0).toFixed(2)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
