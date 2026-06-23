// ============================================
// CompraForm.js
// Campos compartidos entre Nueva Compra y Editar Compra
// ============================================
import React, { useState, useEffect } from 'react';
import { calcularResumenItems } from '../../utils/comprasCalc';
import SelectBuscable from '../shared/SelectBuscable';

const itemVacioEmpresa = () => ({
  materia_prima_id: '', mp_nombre: '',
  cantidad_kg: '', precio_kg: '', subtotal: 0,
  precio_anterior: 0, inv_id: '',
  descuento: '', iva_pct: 15, ivaDiferente: false,
});

const itemVacioPersonal = () => ({
  descripcion: '', monto: '', descuento: '', iva_pct: 15, ivaDiferente: false,
});

const itemVacio = (personal) => personal ? itemVacioPersonal() : itemVacioEmpresa();

const FORMAS_PAGO = [
  { value: 'efectivo',      label: '💵 Efectivo'      },
  { value: 'transferencia', label: '🏦 Transferencia'  },
  { value: 'cheque',        label: '📝 Cheque'         },
  { value: 'credito',       label: '📅 Crédito'        },
];

export default function CompraForm({
  modo,              // 'nueva' | 'editar'
  esPersonal: esPersonalProp,
  valoresIniciales,  // null en 'nueva'; objeto precargado en 'editar'
  proveedores, materiales,
  onChange,
  mobile,
}) {
  const [proveedorId,  setProveedorId]  = useState(valoresIniciales?.proveedorId || '');
  const [fecha,        setFecha]        = useState(valoresIniciales?.fecha || new Date().toISOString().split('T')[0]);
  const [tieneFactura,    setTieneFactura]    = useState(valoresIniciales?.tieneFactura || false);
  const [esPersonal,      setEsPersonal]      = useState(esPersonalProp || false);
  const [numFactura,      setNumFactura]      = useState(valoresIniciales?.numFactura || '');
  const [autorizacionSri, setAutorizacionSri] = useState(valoresIniciales?.autorizacionSri || '');
  const [fechaEmision,    setFechaEmision]    = useState(valoresIniciales?.fechaEmision || '');
  const [recordarFactura, setRecordarFactura] = useState(valoresIniciales?.recordarFactura || false);
  const [tieneRetencion,  setTieneRetencion]  = useState(valoresIniciales?.tieneRetencion || false);
  const [retFuentePct,    setRetFuentePct]    = useState(valoresIniciales?.retFuentePct || '');
  const [retIvaPct,       setRetIvaPct]       = useState(valoresIniciales?.retIvaPct || '');
  const [numRetencion,    setNumRetencion]    = useState(valoresIniciales?.numRetencion || '');
  const [xmlContent,      setXmlContent]      = useState('');
  const [formaPago,    setFormaPago]    = useState(valoresIniciales?.formaPago || 'efectivo');
  const [referenciaPago, setReferenciaPago] = useState(valoresIniciales?.referenciaPago || '');
  const [comisionPago, setComisionPago] = useState(valoresIniciales?.comisionPago || '');
  const [diasCredito,  setDiasCredito]  = useState(valoresIniciales?.diasCredito || 30);
  const [notas,        setNotas]        = useState(valoresIniciales?.notas || '');
  const [items,        setItems]        = useState(valoresIniciales?.items?.length > 0 ? valoresIniciales.items : [itemVacio(esPersonalProp || false)]);

  // Sembrar estado cuando llegan los valoresIniciales async (EditarCompraModal carga la compra después del primer render)
  useEffect(() => {
    if (modo !== 'editar' || !valoresIniciales) return;
    setProveedorId(valoresIniciales.proveedorId || '');
    setFecha(valoresIniciales.fecha || '');
    setTieneFactura(valoresIniciales.tieneFactura || false);
    setEsPersonal(valoresIniciales.esPersonal || false);
    setNumFactura(valoresIniciales.numFactura || '');
    setAutorizacionSri(valoresIniciales.autorizacionSri || '');
    setFechaEmision(valoresIniciales.fechaEmision || '');
    setRecordarFactura(valoresIniciales.recordarFactura || false);
    setTieneRetencion(valoresIniciales.tieneRetencion || false);
    setRetFuentePct(valoresIniciales.retFuentePct || '');
    setRetIvaPct(valoresIniciales.retIvaPct || '');
    setNumRetencion(valoresIniciales.numRetencion || '');
    setFormaPago(valoresIniciales.formaPago || 'efectivo');
    setReferenciaPago(valoresIniciales.referenciaPago || '');
    setComisionPago(valoresIniciales.comisionPago || '');
    setDiasCredito(valoresIniciales.diasCredito || 30);
    setNotas(valoresIniciales.notas || '');
    setItems(valoresIniciales.items?.length > 0 ? valoresIniciales.items : [itemVacio(valoresIniciales.esPersonal || false)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valoresIniciales]);

  // Reportar el estado completo al padre en cada cambio
  useEffect(() => {
    onChange({
      proveedorId, fecha, tieneFactura, esPersonal, numFactura, autorizacionSri,
      fechaEmision, recordarFactura, tieneRetencion, retFuentePct, retIvaPct, numRetencion,
      xmlContent, formaPago, referenciaPago, comisionPago, diasCredito, notas, items,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId, fecha, tieneFactura, esPersonal, numFactura, autorizacionSri, fechaEmision,
      recordarFactura, tieneRetencion, retFuentePct, retIvaPct, numRetencion, xmlContent,
      formaPago, referenciaPago, comisionPago, diasCredito, notas, items]);

  // ── Actualizar ítem ───────────────────────────────────────
  function actualizarItem(idx, campo, valor) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const nuevo = { ...it, [campo]: valor };
      if (campo === 'materia_prima_id') {
        const mp = materiales.find(m => m.id === valor);
        nuevo.mp_nombre      = mp?.nombre_producto || mp?.nombre || '';
        nuevo.precio_kg      = mp?.precio_kg ? String(parseFloat(mp.precio_kg).toFixed(4)) : '';
        nuevo.precio_anterior = parseFloat(mp?.precio_kg || 0);
        nuevo.inv_id         = mp?.inv_id || '';
      }
      if (!esPersonal) {
        const cant   = parseFloat(nuevo.cantidad_kg || 0);
        const precio = parseFloat(nuevo.precio_kg   || 0);
        nuevo.subtotal = parseFloat((cant * precio).toFixed(2));
      }
      return nuevo;
    }));
  }

  function agregarItem()     { setItems(prev => [...prev, itemVacio(esPersonal)]); }
  function eliminarItem(idx) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  function toggleEsPersonal(checked) {
    const hayDatos = items.some(it =>
      (it.materia_prima_id || it.descripcion || '').toString().trim() !== '' ||
      parseFloat(it.cantidad_kg || it.monto || 0) > 0
    );
    if (hayDatos) {
      if (!window.confirm('Cambiar el tipo de compra borrará los items ingresados. ¿Continuar?')) return;
    }
    setEsPersonal(checked);
    setItems([itemVacio(checked)]);
  }

  // ── Totales internos (solo para mostrar valores de retención) ──
  const resumenItems = calcularResumenItems(items);
  const subtotal    = resumenItems.subtotalTotal;
  const descuentoN  = resumenItems.descuentoTotal;
  const baseIva     = parseFloat((subtotal - descuentoN).toFixed(2));
  const iva         = tieneFactura ? resumenItems.ivaTotal : 0;
  const total       = parseFloat((baseIva + iva).toFixed(2));
  const retFuenteN  = tieneRetencion ? parseFloat((baseIva * (parseFloat(retFuentePct) || 0) / 100).toFixed(2)) : 0;
  const retIvaN     = tieneRetencion ? parseFloat((iva * (parseFloat(retIvaPct) || 0) / 100).toFixed(2)) : 0;
  const netoPagar   = parseFloat((total - retFuenteN - retIvaN).toFixed(2));

  // ── Parsear XML del SRI ──────────────────────────────────
  function parsearXmlSRI(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rawXml = e.target.result;
        setXmlContent(rawXml);
        const parser = new DOMParser();
        const xml = parser.parseFromString(rawXml, 'text/xml');

        const clave = xml.querySelector('claveAcceso')?.textContent?.trim() || '';
        if (clave) setAutorizacionSri(clave);

        const estab  = xml.querySelector('estab')?.textContent?.trim() || '';
        const ptoEmi = xml.querySelector('ptoEmi')?.textContent?.trim() || '';
        const secu   = xml.querySelector('secuencial')?.textContent?.trim() || '';
        if (estab && ptoEmi && secu) setNumFactura(`${estab}-${ptoEmi}-${secu}`);

        const fRaw = xml.querySelector('fechaEmision')?.textContent?.trim() || '';
        if (fRaw) {
          const [d, m, y] = fRaw.split('/');
          if (d && m && y) setFechaEmision(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
        }

        setTieneFactura(true);
      } catch (err) {
        window.alert('Error al leer el XML: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  const inputStyle = {
    padding: '8px 10px', borderRadius: '8px',
    border: '1.5px solid #ddd', fontSize: '13px',
    outline: 'none', width: '100%', boxSizing: 'border-box'
  };
  const labelStyle = {
    fontSize: '11px', fontWeight: 'bold',
    color: '#555', display: 'block', marginBottom: 4
  };
  const card = {
    background: 'white', borderRadius: '12px',
    padding: mobile ? '14px' : '16px 20px',
    marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  };

  const columnasHeader = esPersonal
    ? ['DESCRIPCIÓN', 'MONTO ($)', 'DESCUENTO ($)', 'IVA', '']
    : (tieneFactura
        ? ['MATERIA PRIMA', 'CANT (kg)', 'PRECIO/kg ($)', 'SUBTOTAL', 'DESCUENTO ($)', 'IVA', '']
        : ['MATERIA PRIMA', 'CANT (kg)', 'PRECIO/kg ($)', 'SUBTOTAL', '']);

  const gridCols = esPersonal
    ? '2.5fr 1fr 1fr 0.8fr 36px'
    : (tieneFactura
        ? '2fr 0.8fr 0.9fr 0.8fr 0.8fr 0.7fr 36px'
        : '2.5fr 1fr 1fr 1fr 36px');

  function renderIva(item, idx) {
    if (item.ivaDiferente) {
      return (
        <input
          type="number" min="0" max="100" step="0.01"
          value={item.iva_pct}
          onChange={e => actualizarItem(idx, 'iva_pct', e.target.value)}
          placeholder="15"
          style={inputStyle}
        />
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          padding: '6px 10px', borderRadius: 6, background: '#f0f2f5',
          fontSize: 12, fontWeight: 'bold', color: '#555'
        }}>{item.iva_pct}%</span>
        <button
          onClick={() => actualizarItem(idx, 'ivaDiferente', true)}
          title="Usar otra tasa de IVA"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}
        >✏️</button>
      </div>
    );
  }

  return (
    <>
      {/* Proveedor + fecha */}
      <div style={card}>
        <div style={{
          fontWeight: 'bold', color: '#1a1a2e',
          marginBottom: 12, fontSize: '14px'
        }}>🏢 Proveedor</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr' : '2fr 1fr',
          gap: 12
        }}>
          <div>
            <label style={labelStyle}>Proveedor</label>
            <SelectBuscable
              valor={proveedorId}
              onChange={setProveedorId}
              placeholder="Buscar proveedor..."
              opciones={proveedores.map(p => ({
                value: p.id,
                label: `${p.nombre} ${p.tipo === 'extranjero' ? '🌎' : '🇪🇨'}${p.ruc ? ' — ' + p.ruc : ''}`,
              }))}
            />
          </div>
          <div>
            <label style={labelStyle}>Fecha de compra</label>
            <input
              type="date" value={fecha}
              onChange={e => setFecha(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Factura */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={tieneFactura}
              onChange={e => setTieneFactura(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>
              Tiene factura
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6,
            cursor: modo === 'editar' ? 'not-allowed' : 'pointer',
            background: esPersonal ? '#fff3e0' : 'transparent',
            padding: '4px 10px', borderRadius: 8,
            border: esPersonal ? '1.5px solid #e67e22' : '1.5px solid transparent' }}>
            <input
              type="checkbox" checked={esPersonal} disabled={modo === 'editar'}
              onChange={e => toggleEsPersonal(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: esPersonal ? '#e67e22' : '#555' }}>
              📄 Compra personal (a mi nombre)
            </span>
          </label>
          {tieneFactura && (
            <>
              <input
                type="text" value={numFactura}
                onChange={e => setNumFactura(e.target.value)}
                placeholder="Nº factura (001-001-000000001)"
                style={{ ...inputStyle, width: 'auto', flex: 1, maxWidth: 240 }}
              />
              <input
                id="xml-sri-input" type="file" accept=".xml"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) parsearXmlSRI(e.target.files[0]); e.target.value = ''; }}
              />
              <label htmlFor="xml-sri-input" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
                color: '#1565c0', background: '#e3f2fd',
                padding: '6px 12px', borderRadius: 8,
                border: '1.5px solid #90caf9', whiteSpace: 'nowrap',
                userSelect: 'none'
              }}>
                📎 Cargar XML SRI
              </label>
              {!numFactura && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  cursor: 'pointer', fontSize: '12px',
                  color: recordarFactura ? '#e67e22' : '#aaa',
                  background: recordarFactura ? '#fff3e0' : '#f5f5f5',
                  padding: '5px 10px', borderRadius: 8,
                  border: `1.5px solid ${recordarFactura ? '#e67e22' : '#ddd'}`,
                  whiteSpace: 'nowrap', userSelect: 'none'
                }}>
                  <input
                    type="checkbox"
                    checked={recordarFactura}
                    onChange={e => setRecordarFactura(e.target.checked)}
                    style={{ width: 14, height: 14 }}
                  />
                  🔔 Recordarme
                </label>
              )}
            </>
          )}
          {!tieneFactura && (
            <span style={{
              fontSize: '11px', color: '#f39c12',
              background: '#fef9e7', padding: '4px 10px', borderRadius: 6
            }}>
              ⚠️ Sin factura — IVA no aplica (proveedor extranjero o informal)
            </span>
          )}
        </div>

        {/* Campos adicionales de factura SRI */}
        {tieneFactura && (
          <div style={{
            marginTop: 14, display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
            gap: 10
          }}>
            <div>
              <label style={labelStyle}>Autorización SRI (clave de acceso)</label>
              <input
                type="text" value={autorizacionSri}
                onChange={e => setAutorizacionSri(e.target.value)}
                placeholder="49 dígitos"
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Fecha de emisión</label>
              <input
                type="date" value={fechaEmision}
                onChange={e => setFechaEmision(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {/* Retención */}
        {tieneFactura && (
          <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 7,
              cursor: 'pointer', userSelect: 'none', marginBottom: tieneRetencion ? 12 : 0
            }}>
              <input
                type="checkbox" checked={tieneRetencion}
                onChange={e => setTieneRetencion(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: tieneRetencion ? '#1565c0' : '#555' }}>
                📋 Tiene retención
              </span>
            </label>

            {tieneRetencion && (
              <div style={{
                background: '#f0f4ff', borderRadius: 10, padding: 14,
                border: '1.5px solid #90caf9'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: mobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
                  gap: 10, marginBottom: 10
                }}>
                  <div>
                    <label style={labelStyle}>Ret. Fuente %</label>
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={retFuentePct}
                      onChange={e => setRetFuentePct(e.target.value)}
                      placeholder="ej: 1, 2, 8"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Valor ret. fuente ($)</label>
                    <div style={{
                      padding: '8px 10px', borderRadius: 8,
                      background: '#fff', fontSize: '14px',
                      fontWeight: 'bold', color: '#c0392b',
                      border: '1.5px solid #ddd'
                    }}>
                      ${retFuenteN.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Ret. IVA %</label>
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={retIvaPct}
                      onChange={e => setRetIvaPct(e.target.value)}
                      placeholder="ej: 30, 70, 100"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Valor ret. IVA ($)</label>
                    <div style={{
                      padding: '8px 10px', borderRadius: 8,
                      background: '#fff', fontSize: '14px',
                      fontWeight: 'bold', color: '#c0392b',
                      border: '1.5px solid #ddd'
                    }}>
                      ${retIvaN.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>N° Comprobante retención</label>
                    <input
                      type="text" value={numRetencion}
                      onChange={e => setNumRetencion(e.target.value)}
                      placeholder="001-001-000000001"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Neto a pagar ($)</label>
                    <div style={{
                      padding: '8px 10px', borderRadius: 8,
                      background: '#e8f5e9', fontSize: '18px',
                      fontWeight: 'bold', color: '#1b5e20',
                      border: '2px solid #66bb6a'
                    }}>
                      ${netoPagar.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Materiales / Items */}
      <div style={card}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12
        }}>
          <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px' }}>
            {esPersonal ? '📄 Items de la factura' : '📦 Materiales recibidos'}
          </div>
          <button onClick={agregarItem} style={{
            background: '#27ae60', color: 'white', border: 'none',
            borderRadius: 7, padding: '6px 14px',
            cursor: 'pointer', fontWeight: 'bold', fontSize: '12px'
          }}>+ Agregar</button>
        </div>

        {!mobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: 8, marginBottom: 6
          }}>
            {columnasHeader.map((h, i) => (
              <div key={`${h}-${i}`} style={{
                fontSize: '10px', fontWeight: 'bold', color: '#888'
              }}>{h}</div>
            ))}
          </div>
        )}

        {items.map((item, idx) => (
          <div key={idx} style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : gridCols,
            gap: 8, marginBottom: 10,
            padding: mobile ? 10 : 0,
            background: mobile ? '#f8f9fa' : 'transparent',
            borderRadius: mobile ? 8 : 0
          }}>
            {esPersonal ? (
              <>
                <div>
                  {mobile && <label style={labelStyle}>Descripción</label>}
                  <input
                    type="text"
                    value={item.descripcion}
                    onChange={e => actualizarItem(idx, 'descripcion', e.target.value)}
                    placeholder="Ej: Útiles de oficina"
                    style={inputStyle}
                  />
                </div>
                <div>
                  {mobile && <label style={labelStyle}>Monto ($)</label>}
                  <input
                    type="number" min="0" step="0.01"
                    value={item.monto}
                    onChange={e => actualizarItem(idx, 'monto', e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </div>
                <div>
                  {mobile && <label style={labelStyle}>Descuento ($)</label>}
                  <input
                    type="number" min="0" step="0.01"
                    value={item.descuento}
                    onChange={e => actualizarItem(idx, 'descuento', e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </div>
                <div>
                  {mobile && <label style={labelStyle}>IVA</label>}
                  {renderIva(item, idx)}
                </div>
              </>
            ) : (
              <>
                <div>
                  {mobile && <label style={labelStyle}>Materia prima</label>}
                  <select
                    value={item.materia_prima_id}
                    onChange={e => actualizarItem(idx, 'materia_prima_id', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">— seleccionar —</option>
                    {materiales.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nombre_producto || m.nombre}
                        {' '}(stock: {parseFloat(m.stock_kg || 0).toFixed(1)} kg)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  {mobile && <label style={labelStyle}>Cant. (kg)</label>}
                  <input
                    type="number" min="0" step="0.001"
                    value={item.cantidad_kg}
                    onChange={e => actualizarItem(idx, 'cantidad_kg', e.target.value)}
                    placeholder="0.000"
                    style={inputStyle}
                  />
                </div>
                <div>
                  {mobile && <label style={labelStyle}>Precio/kg ($)</label>}
                  <input
                    type="number" min="0" step="0.0001"
                    value={item.precio_kg}
                    onChange={e => actualizarItem(idx, 'precio_kg', e.target.value)}
                    placeholder="0.0000"
                    style={{
                      ...inputStyle,
                      borderColor: item.precio_kg && parseFloat(item.precio_kg) !== item.precio_anterior
                        ? '#f39c12' : '#ddd'
                    }}
                  />
                  {item.precio_anterior > 0 &&
                   item.precio_kg &&
                   parseFloat(item.precio_kg) !== item.precio_anterior && (
                    <div style={{ fontSize: '10px', color: '#f39c12', marginTop: 2 }}>
                      ⚠️ anterior: ${item.precio_anterior.toFixed(4)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {mobile && <label style={labelStyle}>Subtotal</label>}
                  <div style={{
                    padding: '8px 10px', borderRadius: 8,
                    background: '#f0f7f0', fontSize: '14px',
                    fontWeight: 'bold', color: '#27ae60', width: '100%'
                  }}>
                    ${(parseFloat(item.subtotal) || 0).toFixed(2)}
                  </div>
                </div>
                {tieneFactura && (
                  <>
                    <div>
                      {mobile && <label style={labelStyle}>Descuento ($)</label>}
                      <input
                        type="number" min="0" step="0.01"
                        value={item.descuento}
                        onChange={e => actualizarItem(idx, 'descuento', e.target.value)}
                        placeholder="0.00"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      {mobile && <label style={labelStyle}>IVA</label>}
                      {renderIva(item, idx)}
                    </div>
                  </>
                )}
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {items.length > 1 && (
                <button onClick={() => eliminarItem(idx)} style={{
                  background: 'none', border: 'none',
                  color: '#e74c3c', cursor: 'pointer', fontSize: '18px'
                }}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Forma de pago */}
      <div style={card}>
        <div style={{ fontWeight: 'bold', color: '#1a1a2e', marginBottom: 10, fontSize: '14px' }}>
          💳 Forma de pago
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {FORMAS_PAGO.map(f => (
            <button key={f.value}
              onClick={modo === 'nueva' ? () => setFormaPago(f.value) : undefined}
              style={{
                padding: '8px 14px', borderRadius: 8,
                cursor: modo === 'nueva' ? 'pointer' : 'default',
                fontWeight: 'bold', fontSize: '13px', border: 'none',
                background: formaPago === f.value ? '#1e5c3a' : '#f0f2f5',
                color:      formaPago === f.value ? 'white'   : '#555',
                opacity: modo === 'editar' && formaPago !== f.value ? 0.5 : 1,
              }}>{f.label}</button>
          ))}
        </div>
        {['transferencia', 'cheque', 'deposito'].includes(formaPago) && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
              Nº Transacción / Depósito (opcional)
            </label>
            <input
              type="text"
              value={referenciaPago}
              onChange={e => setReferenciaPago(e.target.value)}
              placeholder="Ej: 00123456"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        )}
        {['transferencia', 'cheque'].includes(formaPago) && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
              Comisión bancaria (opcional)
            </label>
            <input
              type="number" min="0" step="0.01"
              value={comisionPago}
              onChange={e => setComisionPago(e.target.value)}
              placeholder="$0.00 — dejar vacío si no hay comisión"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        )}
        {formaPago === 'credito' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ ...labelStyle, margin: 0 }}>Días de crédito:</label>
            <select
              value={diasCredito}
              onChange={e => setDiasCredito(parseInt(e.target.value))}
              style={{ ...inputStyle, width: 'auto' }}
            >
              {[7, 15, 30, 45, 60, 90].map(d => (
                <option key={d} value={d}>{d} días</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Notas */}
      <div style={card}>
        <label style={labelStyle}>Notas (opcional)</label>
        <input
          type="text" value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Ej: Compra mensual, lote especial..."
          style={inputStyle}
        />
      </div>
    </>
  );
}
