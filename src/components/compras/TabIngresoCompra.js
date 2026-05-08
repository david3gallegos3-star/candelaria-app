// ============================================
// TabIngresoCompra.js
// Registrar compra — actualiza inventario MP
// ============================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { registrarAuditoria, crearNotificacion } from '../../utils/helpers';
import { useRealtime } from '../../hooks/useRealtime';

const itemVacio = () => ({
  materia_prima_id: '', mp_nombre: '',
  cantidad_kg: '', precio_kg: '', subtotal: 0,
  precio_anterior: 0, inv_id: ''
});

const FORMAS_PAGO = [
  { value: 'efectivo',      label: '💵 Efectivo'      },
  { value: 'transferencia', label: '🏦 Transferencia'  },
  { value: 'cheque',        label: '📝 Cheque'         },
  { value: 'credito',       label: '📅 Crédito'        },
];

export default function TabIngresoCompra({ mobile, currentUser, userRol }) {

  const [proveedores,  setProveedores]  = useState([]);
  const [materiales,   setMateriales]   = useState([]);
  const [proveedorId,  setProveedorId]  = useState('');
  const [fecha,        setFecha]        = useState(new Date().toISOString().split('T')[0]);
  const [tieneFactura,    setTieneFactura]    = useState(false);
  const [numFactura,      setNumFactura]      = useState('');
  const [autorizacionSri, setAutorizacionSri] = useState('');
  const [fechaEmision,    setFechaEmision]    = useState('');
  const [baseIva15,       setBaseIva15]       = useState('');
  const [baseIva0,        setBaseIva0]        = useState('');
  const [descuento,       setDescuento]       = useState('');
  const [recordarFactura, setRecordarFactura] = useState(false);
  const [tieneRetencion,  setTieneRetencion]  = useState(false);
  const [retFuentePct,    setRetFuentePct]    = useState('');
  const [retFuenteVal,    setRetFuenteVal]    = useState('');
  const [retIvaPct,       setRetIvaPct]       = useState('');
  const [retIvaVal,       setRetIvaVal]       = useState('');
  const [numRetencion,    setNumRetencion]    = useState('');
  const [xmlContent,      setXmlContent]      = useState('');
  const [formaPago,    setFormaPago]    = useState('efectivo');
  const [diasCredito,  setDiasCredito]  = useState(30);
  const [notas,        setNotas]        = useState('');
  const [items,        setItems]        = useState([itemVacio()]);
  const [guardando,    setGuardando]    = useState(false);
  const [msgExito,     setMsgExito]     = useState('');
  const [error,        setError]        = useState('');

  useEffect(() => { cargarDatos(); }, []);
  useRealtime(['proveedores', 'materias_primas', 'inventario_mp'], cargarDatos);

  // ── Cargar proveedores y MP con stock ─────────────────────
  async function cargarDatos() {
    const [{ data: provs }, { data: mps }, { data: inv }] = await Promise.all([
      supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
      supabase.from('materias_primas').select('*').order('nombre_producto'),
      supabase.from('inventario_mp').select('*')
    ]);
    setProveedores(provs || []);
    // Combinar MP con su registro de inventario
    const combinado = (mps || []).map(mp => {
      const reg = (inv || []).find(i => i.materia_prima_id === mp.id);
      return {
        ...mp,
        inv_id:   reg?.id       || null,
        stock_kg: parseFloat(reg?.stock_kg || 0)
      };
    });
    setMateriales(combinado);
  }

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
      const cant   = parseFloat(nuevo.cantidad_kg || 0);
      const precio = parseFloat(nuevo.precio_kg   || 0);
      nuevo.subtotal = parseFloat((cant * precio).toFixed(2));
      return nuevo;
    }));
  }

  function agregarItem()     { setItems(prev => [...prev, itemVacio()]); }
  function eliminarItem(idx) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  // ── Totales ───────────────────────────────────────────────
  const subtotal    = items.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);
  const descuentoN  = parseFloat(descuento || 0);
  const baseIva     = Math.max(0, subtotal - descuentoN);
  const iva         = tieneFactura ? parseFloat((baseIva * 0.15).toFixed(2)) : 0;
  const total       = parseFloat((baseIva + iva).toFixed(2));
  const retFuenteN  = tieneRetencion ? parseFloat((baseIva * (parseFloat(retFuentePct) || 0) / 100).toFixed(2)) : 0;
  const retIvaN     = tieneRetencion ? parseFloat((iva * (parseFloat(retIvaPct) || 0) / 100).toFixed(2)) : 0;
  const netoPagar   = parseFloat((total - retFuenteN - retIvaN).toFixed(2));

  // ── Guardar compra ────────────────────────────────────────
  async function guardarCompra() {
    setError('');
    const itemsValidos = items.filter(i => i.materia_prima_id && parseFloat(i.cantidad_kg) > 0);
    if (!proveedorId)          return setError('Selecciona un proveedor');
    if (itemsValidos.length === 0) return setError('Agrega al menos un material con cantidad');

    setGuardando(true);
    const proveedor = proveedores.find(p => p.id === proveedorId);
    const fechaHoy  = new Date().toISOString().split('T')[0];

    try {
      // 1. Crear registro de compra
      const { data: compra, error: errC } = await supabase.from('compras').insert({
        proveedor_id:     proveedorId,
        proveedor_nombre: proveedor?.nombre || '',
        fecha,
        tiene_factura:      tieneFactura,
        numero_factura:     tieneFactura ? (numFactura || null) : null,
        autorizacion_sri:   tieneFactura && autorizacionSri ? autorizacionSri : null,
        fecha_emision:      tieneFactura && fechaEmision ? fechaEmision : null,
        base_iva15:         tieneFactura && baseIva15 ? parseFloat(baseIva15) : null,
        base_iva0:          tieneFactura && baseIva0  ? parseFloat(baseIva0)  : null,
        recordar_factura:   tieneFactura && !numFactura && recordarFactura,
        subtotal,
        descuento:          descuentoN || null,
        iva,
        total,
        tiene_retencion:    tieneRetencion,
        ret_fuente_pct:     tieneRetencion && retFuentePct ? parseFloat(retFuentePct) : null,
        ret_fuente_valor:   tieneRetencion ? retFuenteN : null,
        ret_iva_pct:        tieneRetencion && retIvaPct ? parseFloat(retIvaPct) : null,
        ret_iva_valor:      tieneRetencion ? retIvaN    : null,
        num_retencion:      tieneRetencion && numRetencion ? numRetencion : null,
        neto_pagar:         tieneRetencion ? netoPagar : null,
        forma_pago:       formaPago,
        dias_credito:     formaPago === 'credito' ? diasCredito : 0,
        estado:           formaPago === 'credito' ? 'pendiente' : 'pagada',
        notas,
        created_by:       currentUser?.email || ''
      }).select().single();
      if (errC) throw errC;

      // 1b. Subir XML a Storage si fue cargado
      if (xmlContent) {
        const blob = new Blob([xmlContent], { type: 'text/xml' });
        const { error: uploadErr } = await supabase.storage.from('xml-sri').upload(`compras/${compra.id}.xml`, blob, { upsert: true, contentType: 'text/xml' });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('xml-sri').getPublicUrl(`compras/${compra.id}.xml`);
          await supabase.from('compras').update({ xml_sri_url: urlData.publicUrl }).eq('id', compra.id);
        }
      }

      // 2. Guardar detalle + actualizar inventario por cada ítem
      for (const item of itemsValidos) {
        const kg     = parseFloat(item.cantidad_kg);
        const precio = parseFloat(item.precio_kg || 0);
        const mp     = materiales.find(m => m.id === item.materia_prima_id);

        // Detalle de compra
        await supabase.from('compras_detalle').insert({
          compra_id:        compra.id,
          materia_prima_id: item.materia_prima_id,
          mp_nombre:        item.mp_nombre,
          cantidad_kg:      kg,
          precio_kg:        precio,
          subtotal:         parseFloat(item.subtotal)
        });

        // Actualizar stock en inventario_mp
        if (item.inv_id) {
          const nuevoStock = (mp?.stock_kg || 0) + kg;
          await supabase.from('inventario_mp')
            .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
            .eq('id', item.inv_id);
        }

        // Registrar movimiento de entrada
        await supabase.from('inventario_movimientos').insert({
          materia_prima_id:   item.materia_prima_id,
          nombre_mp:          item.mp_nombre,
          tipo:               'entrada',
          kg,
          precio_kg_nuevo:    precio || null,
          precio_kg_anterior: item.precio_anterior || null,
          motivo:             `Compra${proveedor ? ' — ' + proveedor.nombre : ''}${tieneFactura && numFactura ? ' · Fact. ' + numFactura : ''}`,
          usuario_nombre:     userRol?.nombre || currentUser?.email || '',
          user_id:            currentUser?.id,
          fecha:              fechaHoy
        });

        // Actualizar precio en materias_primas si cambió
        if (precio > 0 && precio !== item.precio_anterior) {
          await supabase.from('materias_primas')
            .update({ precio_kg: precio })
            .eq('id', item.materia_prima_id);
          await crearNotificacion({
            tipo:            'cambio_precio',
            origen:          'compras',
            usuario_nombre:  userRol?.nombre || '',
            user_id:         currentUser?.id,
            producto_nombre: item.mp_nombre,
            mensaje:         `Compra: "${item.mp_nombre}" +${kg}kg · precio $${item.precio_anterior.toFixed(2)} → $${precio.toFixed(2)}/kg`
          });
        }
      }

      // 3. Si es crédito → crear cuenta x pagar
      if (formaPago === 'credito') {
        const venc = new Date(fecha);
        venc.setDate(venc.getDate() + diasCredito);
        await supabase.from('cuentas_pagar').insert({
          compra_id:         compra.id,
          proveedor_id:      proveedorId,
          monto_total:       total,
          saldo_pendiente:   total,
          estado:            'pendiente',
          forma_pago:        'credito',
          fecha_vencimiento: venc.toISOString().split('T')[0],
          notas:             `Crédito ${diasCredito} días`,
          updated_at:        new Date().toISOString()
        });
      }

      // Resetear formulario
      setItems([itemVacio()]);
      setProveedorId('');
      setNumFactura('');
      setAutorizacionSri('');
      setFechaEmision('');
      setBaseIva15('');
      setBaseIva0('');
      setDescuento('');
      setTieneFactura(false);
      setRecordarFactura(false);
      setTieneRetencion(false);
      setRetFuentePct('');
      setRetIvaPct('');
      setNumRetencion('');
      setXmlContent('');
      setFormaPago('efectivo');
      setNotas('');
      mostrarExito(`✅ Compra registrada — ${itemsValidos.length} material(es), $${total.toFixed(2)} — inventario actualizado`);
      cargarDatos(); // recargar stocks

    } catch (e) {
      setError('Error al guardar: ' + e.message);
    }
    setGuardando(false);
  }

  // ── Parsear XML del SRI ──────────────────────────────────
  function parsearXmlSRI(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rawXml = e.target.result;
        setXmlContent(rawXml);
        const parser = new DOMParser();
        const xml = parser.parseFromString(rawXml, 'text/xml');

        // Clave de acceso (49 dígitos) = autorización
        const clave = xml.querySelector('claveAcceso')?.textContent?.trim() || '';
        if (clave) setAutorizacionSri(clave);

        // Número factura estab-ptoEmi-secuencial
        const estab  = xml.querySelector('estab')?.textContent?.trim() || '';
        const ptoEmi = xml.querySelector('ptoEmi')?.textContent?.trim() || '';
        const secu   = xml.querySelector('secuencial')?.textContent?.trim() || '';
        if (estab && ptoEmi && secu) setNumFactura(`${estab}-${ptoEmi}-${secu}`);

        // Fecha DD/MM/YYYY → YYYY-MM-DD
        const fRaw = xml.querySelector('fechaEmision')?.textContent?.trim() || '';
        if (fRaw) {
          const [d, m, y] = fRaw.split('/');
          if (d && m && y) setFechaEmision(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
        }

        // Descuento total
        const totalDesc = parseFloat(xml.querySelector('totalDescuento')?.textContent || '0');
        if (totalDesc > 0) setDescuento(totalDesc.toFixed(2));

        // Bases imponibles por tasa de IVA
        xml.querySelectorAll('totalConImpuestos totalImpuesto').forEach(imp => {
          const cod  = imp.querySelector('codigoPorcentaje')?.textContent?.trim();
          const base = parseFloat(imp.querySelector('baseImponible')?.textContent || '0');
          if (cod === '4' || cod === '5') setBaseIva15(base.toFixed(2)); // 15%
          if (cod === '0')               setBaseIva0(base.toFixed(2));   // 0%
        });

        setTieneFactura(true);
      } catch (err) {
        setError('Error al leer el XML: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 6000);
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

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {error && (
        <div style={{
          background: '#fde8e8', color: '#c0392b',
          padding: '10px 14px', borderRadius: 8,
          marginBottom: 14, fontSize: '13px', fontWeight: 'bold'
        }}>⚠️ {error}</div>
      )}
      {msgExito && (
        <div style={{
          background: '#d4edda', color: '#155724',
          padding: '10px 14px', borderRadius: 8,
          marginBottom: 14, fontSize: '13px', fontWeight: 'bold'
        }}>{msgExito}</div>
      )}

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
            <select
              value={proveedorId}
              onChange={e => setProveedorId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— seleccionar —</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.tipo === 'extranjero' ? '🌎' : '🇪🇨'}
                  {p.ruc ? ` — ${p.ruc}` : ''}
                </option>
              ))}
            </select>
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
          {tieneFactura && (
            <>
              <input
                type="text" value={numFactura}
                onChange={e => setNumFactura(e.target.value)}
                placeholder="Nº factura (001-001-000000001)"
                style={{ ...inputStyle, width: 'auto', flex: 1, maxWidth: 240 }}
              />
              {/* XML SRI upload */}
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
            <div>
              <label style={labelStyle}>Base IVA 15% ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={baseIva15}
                onChange={e => setBaseIva15(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Base IVA 0% ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={baseIva0}
                onChange={e => setBaseIva0(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Descuento ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={descuento}
                onChange={e => setDescuento(e.target.value)}
                placeholder="0.00"
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

      {/* Materiales */}
      <div style={card}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12
        }}>
          <div style={{ fontWeight: 'bold', color: '#1a1a2e', fontSize: '14px' }}>
            📦 Materiales recibidos
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
            gridTemplateColumns: '2.5fr 1fr 1fr 1fr 36px',
            gap: 8, marginBottom: 6
          }}>
            {['MATERIA PRIMA', 'CANT (kg)', 'PRECIO/kg ($)', 'SUBTOTAL', ''].map(h => (
              <div key={h} style={{
                fontSize: '10px', fontWeight: 'bold', color: '#888'
              }}>{h}</div>
            ))}
          </div>
        )}

        {items.map((item, idx) => (
          <div key={idx} style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : '2.5fr 1fr 1fr 1fr 36px',
            gap: 8, marginBottom: 10,
            padding: mobile ? 10 : 0,
            background: mobile ? '#f8f9fa' : 'transparent',
            borderRadius: mobile ? 8 : 0
          }}>
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
              onClick={() => setFormaPago(f.value)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                fontWeight: 'bold', fontSize: '13px', border: 'none',
                background: formaPago === f.value ? '#1e5c3a' : '#f0f2f5',
                color:      formaPago === f.value ? 'white'   : '#555',
              }}>{f.label}</button>
          ))}
        </div>
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

      {/* Totales + Guardar */}
      <div style={{
        background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
        borderRadius: '12px', padding: mobile ? '14px' : '16px 20px',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', gap: mobile ? 12 : 20, flexWrap: 'wrap' }}>
          {[
            ['SUBTOTAL',  `$${subtotal.toFixed(2)}`,   '#aed6f1'],
            ...(descuentoN > 0 ? [['DESC.', `-$${descuentoN.toFixed(2)}`, '#f1948a']] : []),
            ['IVA 15%',   `$${iva.toFixed(2)}`,        tieneFactura ? '#f9e79f' : '#666'],
            ['TOTAL',     `$${total.toFixed(2)}`,       '#a9dfbf'],
            ...(tieneRetencion ? [['NETO PAGAR', `$${netoPagar.toFixed(2)}`, '#fff9c4']] : []),
          ].map(([l, v, col]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#aaa', fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: mobile ? '14px' : '17px', fontWeight: 'bold', color: col }}>
                {v}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={guardarCompra}
          disabled={guardando}
          style={{
            background: guardando ? '#95a5a6' : '#f39c12',
            color: 'white', border: 'none', borderRadius: 10,
            padding: mobile ? '12px 20px' : '12px 28px',
            cursor: guardando ? 'not-allowed' : 'pointer',
            fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap'
          }}>
          {guardando ? '⏳ Guardando...' : '📦 Registrar compra'}
        </button>
      </div>
    </div>
  );
}
