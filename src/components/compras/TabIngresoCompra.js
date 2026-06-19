// ============================================
// TabIngresoCompra.js
// Registrar compra — actualiza inventario MP
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { crearNotificacion } from '../../utils/helpers';
import { generarAsientoCompra } from '../../utils/asientosContables';
import { useRealtime } from '../../hooks/useRealtime';
import { calcularResumenItems } from '../../utils/comprasCalc';
import CompraForm from './CompraForm';

export default function TabIngresoCompra({ mobile, currentUser, userRol }) {
  const [proveedores,  setProveedores]  = useState([]);
  const [materiales,   setMateriales]   = useState([]);
  const [formState,    setFormState]    = useState(null);
  const [resetKey,     setResetKey]     = useState(0);
  const [creditoDisponible, setCreditoDisponible] = useState(0);
  const [guardando,    setGuardando]    = useState(false);
  const [msgExito,     setMsgExito]     = useState('');
  const [error,        setError]        = useState('');

  const cargarDatos = useCallback(async () => {
    const [{ data: provs }, { data: mps }, { data: inv }] = await Promise.all([
      supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
      supabase.from('materias_primas').select('*').order('nombre_producto'),
      supabase.from('inventario_mp').select('*')
    ]);
    setProveedores(provs || []);
    const combinado = (mps || []).map(mp => {
      const reg = (inv || []).find(i => i.materia_prima_id === mp.id);
      return {
        ...mp,
        inv_id:   reg?.id       || null,
        stock_kg: parseFloat(reg?.stock_kg || 0)
      };
    });
    setMateriales(combinado);
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);
  useRealtime(['proveedores', 'materias_primas', 'inventario_mp'], cargarDatos);

  // ── Saldo a favor del proveedor seleccionado (camino B, spec §7) ──
  useEffect(() => {
    let activo = true;
    async function chequear() {
      if (!formState?.proveedorId || formState.formaPago !== 'credito') {
        if (activo) setCreditoDisponible(0);
        return;
      }
      const { data } = await supabase
        .from('cuentas_pagar')
        .select('saldo_pendiente')
        .eq('proveedor_id', formState.proveedorId)
        .lt('saldo_pendiente', 0)
        .neq('estado', 'anulada');
      const credito = (data || []).reduce((s, c) => s + Math.abs(c.saldo_pendiente), 0);
      if (activo) setCreditoDisponible(credito);
    }
    chequear();
    return () => { activo = false; };
  }, [formState?.proveedorId, formState?.formaPago]);

  // ── Totales (derivados del estado espejado por CompraForm) ──
  const items       = formState?.items || [];
  const tieneFactura = formState?.tieneFactura || false;
  const esPersonal   = formState?.esPersonal || false;
  const resumenItems = calcularResumenItems(items);
  const subtotal    = resumenItems.subtotalTotal;
  const descuentoN  = resumenItems.descuentoTotal;
  const baseIva15   = resumenItems.baseIva15;
  const baseIva0    = resumenItems.baseIva0;
  const otrasBases  = resumenItems.otrasBases;
  const baseIva     = parseFloat((subtotal - descuentoN).toFixed(2));
  const iva         = tieneFactura ? resumenItems.ivaTotal : 0;
  const total       = parseFloat((baseIva + iva).toFixed(2));
  const retFuenteN  = formState?.tieneRetencion ? parseFloat((baseIva * (parseFloat(formState.retFuentePct) || 0) / 100).toFixed(2)) : 0;
  const retIvaN     = formState?.tieneRetencion ? parseFloat((iva * (parseFloat(formState.retIvaPct) || 0) / 100).toFixed(2)) : 0;
  const netoPagar   = parseFloat((total - retFuenteN - retIvaN).toFixed(2));

  // ── Guardar compra ────────────────────────────────────────
  async function guardarCompra() {
    setError('');
    if (!formState) return;
    const itemsValidos = esPersonal
      ? items.filter(i => i.descripcion && parseFloat(i.monto) > 0)
      : items.filter(i => i.materia_prima_id && parseFloat(i.cantidad_kg) > 0);
    if (!formState.proveedorId)     return setError('Selecciona un proveedor');
    if (itemsValidos.length === 0) return setError(esPersonal ? 'Agrega al menos un item con monto' : 'Agrega al menos un material con cantidad');

    setGuardando(true);
    const proveedor = proveedores.find(p => p.id === formState.proveedorId);
    const fechaHoy  = new Date().toISOString().split('T')[0];
    const { proveedorId, fecha, numFactura, autorizacionSri, fechaEmision, recordarFactura,
            tieneRetencion, retFuentePct, retIvaPct, numRetencion, xmlContent,
            formaPago, referenciaPago, comisionPago, diasCredito, notas } = formState;

    try {
      const { data: compra, error: errC } = await supabase.from('compras').insert({
        proveedor_id:     proveedorId,
        proveedor_nombre: proveedor?.nombre || '',
        fecha,
        tiene_factura:      tieneFactura,
        es_personal:        esPersonal,
        numero_factura:     tieneFactura ? (numFactura || null) : null,
        autorizacion_sri:   tieneFactura && autorizacionSri ? autorizacionSri : null,
        fecha_emision:      tieneFactura && fechaEmision ? fechaEmision : null,
        base_iva15:         tieneFactura ? baseIva15 : null,
        base_iva0:          tieneFactura ? baseIva0  : null,
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
        referencia_pago:  ['transferencia', 'cheque', 'deposito'].includes(formaPago) ? referenciaPago || null : null,
        comision:         ['transferencia', 'cheque'].includes(formaPago) ? parseFloat(comisionPago) || 0 : 0,
        dias_credito:     formaPago === 'credito' ? diasCredito : 0,
        estado:           formaPago === 'credito' ? 'pendiente' : 'pagada',
        notas,
        created_by:       currentUser?.email || ''
      }).select().single();
      if (errC) throw errC;
      generarAsientoCompra({
        id: compra.id,
        proveedor_nombre: proveedor?.nombre || '',
        numero_factura: tieneFactura ? (numFactura || null) : null,
        subtotal, iva, total,
        forma_pago: formaPago,
        comision: ['transferencia', 'cheque'].includes(formaPago) ? parseFloat(comisionPago) || 0 : 0,
      }).catch(console.error);

      if (xmlContent) {
        const blob = new Blob([xmlContent], { type: 'text/xml' });
        const { error: uploadErr } = await supabase.storage.from('xml-sri').upload(`compras/${compra.id}.xml`, blob, { upsert: true, contentType: 'text/xml' });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('xml-sri').getPublicUrl(`compras/${compra.id}.xml`);
          await supabase.from('compras').update({ xml_sri_url: urlData.publicUrl }).eq('id', compra.id);
        }
      }

      for (const item of itemsValidos) {
        if (esPersonal) {
          await supabase.from('compras_detalle').insert({
            compra_id:        compra.id,
            materia_prima_id: null,
            mp_nombre:        item.descripcion,
            cantidad_kg:      null,
            precio_kg:        null,
            subtotal:         parseFloat(item.monto),
            descuento:        parseFloat(item.descuento) || 0,
            iva_pct:          (item.iva_pct === '' || item.iva_pct == null) ? 15 : (parseFloat(item.iva_pct) || 0),
          });
          continue;
        }

        const kg     = parseFloat(item.cantidad_kg);
        const precio = parseFloat(item.precio_kg || 0);
        const mp     = materiales.find(m => m.id === item.materia_prima_id);

        await supabase.from('compras_detalle').insert({
          compra_id:        compra.id,
          materia_prima_id: item.materia_prima_id,
          mp_nombre:        item.mp_nombre,
          cantidad_kg:      kg,
          precio_kg:        precio,
          subtotal:         parseFloat(item.subtotal),
          descuento:        parseFloat(item.descuento) || 0,
          iva_pct:          (item.iva_pct === '' || item.iva_pct == null) ? 15 : (parseFloat(item.iva_pct) || 0),
        });

        if (item.inv_id) {
          const nuevoStock = (mp?.stock_kg || 0) + kg;
          await supabase.from('inventario_mp')
            .update({ stock_kg: nuevoStock, updated_at: new Date().toISOString() })
            .eq('id', item.inv_id);
        }

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

      if (formaPago === 'credito') {
        const venc = new Date(fecha);
        venc.setDate(venc.getDate() + diasCredito);

        const { data: saldosFavorFrescos, error: errSaldos } = await supabase
          .from('cuentas_pagar')
          .select('id, saldo_pendiente')
          .eq('proveedor_id', proveedorId)
          .lt('saldo_pendiente', 0)
          .neq('estado', 'anulada');
        if (errSaldos) throw errSaldos;
        const creditoFresco = (saldosFavorFrescos || []).reduce((s, c) => s + Math.abs(c.saldo_pendiente), 0);
        const nuevoSaldo = total - creditoFresco;

        const { error: errCp } = await supabase.from('cuentas_pagar').insert({
          compra_id:         compra.id,
          proveedor_id:      proveedorId,
          monto_total:       total,
          saldo_pendiente:   nuevoSaldo,
          estado:            nuevoSaldo <= 0.001 ? 'pagado' : 'pendiente',
          forma_pago:        'credito',
          fecha_vencimiento: venc.toISOString().split('T')[0],
          notas:             `Crédito ${diasCredito} días`,
          updated_at:        new Date().toISOString()
        });
        if (errCp) throw errCp;

        for (const cp of saldosFavorFrescos || []) {
          const { error: errZero } = await supabase.from('cuentas_pagar').update({
            saldo_pendiente: 0,
            notas: `Aplicado a compra del ${fecha}`,
            updated_at: new Date().toISOString(),
          }).eq('id', cp.id);
          if (errZero) throw errZero;
        }
      }

      setResetKey(k => k + 1);
      mostrarExito(`✅ Compra registrada — ${itemsValidos.length} ${esPersonal ? 'item(s)' : 'material(es)'}, $${total.toFixed(2)}${esPersonal ? '' : ' — inventario actualizado'}`);
      cargarDatos();

    } catch (e) {
      setError('Error al guardar: ' + e.message);
    }
    setGuardando(false);
  }

  function mostrarExito(msg) {
    setMsgExito(msg);
    setTimeout(() => setMsgExito(''), 6000);
  }

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
      {creditoDisponible > 0 && formState?.formaPago === 'credito' && (
        <div style={{
          background: '#fff3e0', color: '#e67e22',
          padding: '10px 14px', borderRadius: 8,
          marginBottom: 14, fontSize: '13px', fontWeight: 'bold'
        }}>
          💰 Este proveedor tiene ${creditoDisponible.toFixed(2)} a favor — se aplican a esta compra, tu saldo pendiente queda en ${(total - creditoDisponible).toFixed(2)}.
        </div>
      )}

      <CompraForm
        key={resetKey}
        modo="nueva"
        esPersonal={false}
        valoresIniciales={null}
        proveedores={proveedores}
        materiales={materiales}
        onChange={setFormState}
        mobile={mobile}
      />

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
            ...(tieneFactura && baseIva15 > 0 ? [['BASE IVA 15%', `$${baseIva15.toFixed(2)}`, '#d5dbdb']] : []),
            ...(tieneFactura && baseIva0 > 0 ? [['BASE IVA 0%', `$${baseIva0.toFixed(2)}`, '#d5dbdb']] : []),
            ...(tieneFactura ? Object.entries(otrasBases).map(([pct, monto]) => [`BASE IVA ${pct}%`, `$${monto.toFixed(2)}`, '#d5dbdb']) : []),
            ['IVA',       `$${iva.toFixed(2)}`,        tieneFactura ? '#f9e79f' : '#666'],
            ['TOTAL',     `$${total.toFixed(2)}`,       '#a9dfbf'],
            ...(formState?.tieneRetencion ? [['NETO PAGAR', `$${netoPagar.toFixed(2)}`, '#fff9c4']] : []),
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
