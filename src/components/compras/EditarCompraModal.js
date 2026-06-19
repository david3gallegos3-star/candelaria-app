// ============================================
// EditarCompraModal.js
// Editar o anular cualquier compra (personal o empresa, contado o credito)
// ============================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabase';
import CompraForm from './CompraForm';
import { puedeEditarCompra } from '../../utils/compraEditPermisos';
import { calcularResumenItems } from '../../utils/comprasCalc';
import { ajustarInventarioPorEdicion } from '../../utils/inventarioSync';
import { sincronizarAsientoCompraEditada } from '../../utils/asientosContables';

export default function EditarCompraModal({ compraId, userRol, currentUser, onClose, onGuardado }) {
  const [compra,      setCompra]      = useState(null);
  const [detalles,    setDetalles]    = useState([]);
  const [cuentaPagar, setCuentaPagar] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [materiales,  setMateriales]  = useState([]);
  const [formState,   setFormState]   = useState(null);
  const [cargando,    setCargando]    = useState(true);
  const [guardando,   setGuardando]   = useState(false);
  const [error,       setError]       = useState('');
  const [avisoSaldo,  setAvisoSaldo]  = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: c }, { data: dets }, { data: cp }, { data: provs }, { data: mps }, { data: inv }] = await Promise.all([
      supabase.from('compras').select('*').eq('id', compraId).maybeSingle(),
      supabase.from('compras_detalle').select('*').eq('compra_id', compraId).order('id'),
      supabase.from('cuentas_pagar').select('*').eq('compra_id', compraId).maybeSingle(),
      supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
      supabase.from('materias_primas').select('*').order('nombre_producto'),
      supabase.from('inventario_mp').select('*'),
    ]);
    setCompra(c || null);
    setDetalles(dets || []);
    setCuentaPagar(cp || null);
    setProveedores(provs || []);
    setMateriales((mps || []).map(mp => {
      const reg = (inv || []).find(i => i.materia_prima_id === mp.id);
      return { ...mp, inv_id: reg?.id || null, stock_kg: parseFloat(reg?.stock_kg || 0) };
    }));
    setCargando(false);
  }, [compraId]);

  useEffect(() => { cargar(); }, [cargar]);

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16,
  };
  const modalStyle = {
    background: 'white', borderRadius: 14, width: 720, maxWidth: '96vw',
    maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
  };

  if (cargando) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, padding: 40, textAlign: 'center', color: '#888' }}>⏳ Cargando...</div>
      </div>
    );
  }

  if (!compra) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, padding: 40, textAlign: 'center', color: '#e74c3c' }}>
          No se encontró la compra.
          <div style={{ marginTop: 16 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#f0f2f5', cursor: 'pointer' }}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  const permiso = puedeEditarCompra(compra, userRol);

  // useMemo es obligatorio acá: sin él, este objeto se crea de nuevo en cada
  // render de EditarCompraModal — y CompraForm re-renderiza al padre en cada
  // tecla (vía onChange → setFormState). Sin memo, el useEffect de CompraForm
  // que re-siembra el estado al cambiar `valoresIniciales` se dispararía en
  // cada tecla y borraría lo que el usuario está escribiendo.
  const valoresIniciales = useMemo(() => ({
    proveedorId: compra.proveedor_id || '',
    fecha: compra.fecha || '',
    tieneFactura: compra.tiene_factura || false,
    esPersonal: compra.es_personal || false,
    numFactura: compra.numero_factura || '',
    autorizacionSri: compra.autorizacion_sri || '',
    fechaEmision: compra.fecha_emision || '',
    recordarFactura: compra.recordar_factura || false,
    tieneRetencion: compra.tiene_retencion || false,
    retFuentePct: compra.ret_fuente_pct != null ? String(compra.ret_fuente_pct) : '',
    retIvaPct: compra.ret_iva_pct != null ? String(compra.ret_iva_pct) : '',
    numRetencion: compra.num_retencion || '',
    formaPago: compra.forma_pago || 'efectivo',
    referenciaPago: compra.referencia_pago || '',
    comisionPago: compra.comision ? String(compra.comision) : '',
    diasCredito: compra.dias_credito || 30,
    notas: compra.notas || '',
    items: detalles.map(d => compra.es_personal ? {
      descripcion: d.mp_nombre || '', monto: String(d.subtotal || ''),
      descuento: String(d.descuento || ''), iva_pct: d.iva_pct ?? 15,
      ivaDiferente: d.iva_pct != null && d.iva_pct !== 15,
    } : {
      materia_prima_id: d.materia_prima_id || '', mp_nombre: d.mp_nombre || '',
      cantidad_kg: String(d.cantidad_kg || ''), precio_kg: String(d.precio_kg || ''),
      subtotal: parseFloat(d.subtotal || 0), precio_anterior: parseFloat(d.precio_kg || 0),
      inv_id: materiales.find(m => m.id === d.materia_prima_id)?.inv_id || '',
      descuento: String(d.descuento || ''), iva_pct: d.iva_pct ?? 15,
      ivaDiferente: d.iva_pct != null && d.iva_pct !== 15,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [compra, detalles, materiales]);

  const bloqueadaPorPago = compra.forma_pago === 'credito' && cuentaPagar &&
    Math.abs(cuentaPagar.saldo_pendiente - cuentaPagar.monto_total) > 0.01;

  async function guardar() {
    if (!formState) return;
    setError(''); setAvisoSaldo('');
    const itemsValidos = formState.esPersonal
      ? formState.items.filter(i => i.descripcion && parseFloat(i.monto) > 0)
      : formState.items.filter(i => i.materia_prima_id && parseFloat(i.cantidad_kg) > 0);
    if (itemsValidos.length === 0) {
      setError(formState.esPersonal ? 'Agrega al menos un item con monto' : 'Agrega al menos un material con cantidad');
      return;
    }

    setGuardando(true);
    const proveedor = proveedores.find(p => p.id === formState.proveedorId);
    const resumen = calcularResumenItems(itemsValidos);
    const subtotal = resumen.subtotalTotal;
    const descuentoN = resumen.descuentoTotal;
    const iva = formState.tieneFactura ? resumen.ivaTotal : 0;
    const baseIva = parseFloat((subtotal - descuentoN).toFixed(2));
    const total = parseFloat((baseIva + iva).toFixed(2));
    const retFuenteN = formState.tieneRetencion ? parseFloat((baseIva * (parseFloat(formState.retFuentePct) || 0) / 100).toFixed(2)) : 0;
    const retIvaN = formState.tieneRetencion ? parseFloat((iva * (parseFloat(formState.retIvaPct) || 0) / 100).toFixed(2)) : 0;
    const netoPagar = parseFloat((total - retFuenteN - retIvaN).toFixed(2));

    try {
      const { error: errU } = await supabase.from('compras').update({
        proveedor_id: formState.proveedorId,
        proveedor_nombre: proveedor?.nombre || compra.proveedor_nombre,
        fecha: formState.fecha,
        tiene_factura: formState.tieneFactura,
        numero_factura: formState.tieneFactura ? (formState.numFactura || null) : null,
        autorizacion_sri: formState.tieneFactura && formState.autorizacionSri ? formState.autorizacionSri : null,
        fecha_emision: formState.tieneFactura && formState.fechaEmision ? formState.fechaEmision : null,
        base_iva15: formState.tieneFactura ? resumen.baseIva15 : null,
        base_iva0: formState.tieneFactura ? resumen.baseIva0 : null,
        subtotal, descuento: descuentoN || null, iva, total,
        tiene_retencion: formState.tieneRetencion,
        ret_fuente_pct: formState.tieneRetencion && formState.retFuentePct ? parseFloat(formState.retFuentePct) : null,
        ret_fuente_valor: formState.tieneRetencion ? retFuenteN : null,
        ret_iva_pct: formState.tieneRetencion && formState.retIvaPct ? parseFloat(formState.retIvaPct) : null,
        ret_iva_valor: formState.tieneRetencion ? retIvaN : null,
        num_retencion: formState.tieneRetencion && formState.numRetencion ? formState.numRetencion : null,
        neto_pagar: formState.tieneRetencion ? netoPagar : null,
        notas: formState.notas,
      }).eq('id', compra.id);
      if (errU) throw errU;

      if (!compra.es_personal) {
        const detallesPorMpId = new Map(detalles.map(d => [d.materia_prima_id, d]));
        for (const item of itemsValidos) {
          const original = detallesPorMpId.get(item.materia_prima_id) || { cantidad_kg: 0 };
          await ajustarInventarioPorEdicion(original, item, {
            proveedor_nombre: proveedor?.nombre || compra.proveedor_nombre,
            usuario_nombre: userRol?.nombre || currentUser?.email || '',
            user_id: currentUser?.id,
          });
          detallesPorMpId.delete(item.materia_prima_id);
        }
        for (const eliminado of detallesPorMpId.values()) {
          await ajustarInventarioPorEdicion(eliminado, { ...eliminado, cantidad_kg: 0 }, {
            proveedor_nombre: proveedor?.nombre || compra.proveedor_nombre,
            usuario_nombre: userRol?.nombre || currentUser?.email || '',
            user_id: currentUser?.id,
          });
        }
      }

      const { error: errDel } = await supabase.from('compras_detalle').delete().eq('compra_id', compra.id);
      if (errDel) throw errDel;
      const { error: errIns } = await supabase.from('compras_detalle').insert(itemsValidos.map(item => formState.esPersonal ? {
        compra_id: compra.id, materia_prima_id: null, mp_nombre: item.descripcion,
        cantidad_kg: null, precio_kg: null, subtotal: parseFloat(item.monto),
        descuento: parseFloat(item.descuento) || 0,
        iva_pct: (item.iva_pct === '' || item.iva_pct == null) ? 15 : parseFloat(item.iva_pct) || 0,
      } : {
        compra_id: compra.id, materia_prima_id: item.materia_prima_id, mp_nombre: item.mp_nombre,
        cantidad_kg: parseFloat(item.cantidad_kg), precio_kg: parseFloat(item.precio_kg || 0),
        subtotal: parseFloat(item.subtotal), descuento: parseFloat(item.descuento) || 0,
        iva_pct: (item.iva_pct === '' || item.iva_pct == null) ? 15 : parseFloat(item.iva_pct) || 0,
      })));
      if (errIns) throw errIns;

      if (compra.forma_pago === 'credito' && cuentaPagar) {
        const { data: cuentaPagarFresca, error: errCpSel } = await supabase
          .from('cuentas_pagar')
          .select('monto_total, saldo_pendiente')
          .eq('compra_id', compra.id)
          .single();
        if (errCpSel) throw errCpSel;
        const pagadoHastaAhora = cuentaPagarFresca.monto_total - cuentaPagarFresca.saldo_pendiente;
        const nuevoSaldo = total - pagadoHastaAhora;
        const { error: errCpUpd } = await supabase.from('cuentas_pagar').update({
          monto_total: total,
          saldo_pendiente: nuevoSaldo,
          estado: nuevoSaldo <= 0.001 ? 'pagado' : (nuevoSaldo < cuentaPagarFresca.saldo_pendiente ? 'parcial' : 'pendiente'),
          updated_at: new Date().toISOString(),
        }).eq('compra_id', compra.id);
        if (errCpUpd) throw errCpUpd;
        if (nuevoSaldo < 0) {
          setAvisoSaldo(`⚠️ Ya se pagó $${Math.abs(nuevoSaldo).toFixed(2)} de más con el monto corregido — el proveedor te queda debiendo.`);
        }
      }

      const { error: errAsiento } = await sincronizarAsientoCompraEditada(
        { ...compra, subtotal, iva, total },
        { forzarReversion: permiso.soloAdmin }
      );
      if (errAsiento) throw errAsiento;

      setGuardando(false);
      onGuardado?.();
    } catch (e) {
      setError('Error al guardar: ' + e.message);
      setGuardando(false);
    }
  }

  async function anular() {
    if (!window.confirm('¿Anular esta compra? Esto revierte el inventario (si aplica) y deja un asiento de reversión en el Libro Diario.')) return;
    setGuardando(true);
    setError('');
    try {
      const { error: errAnular } = await supabase.from('compras').update({ estado: 'anulada' }).eq('id', compra.id);
      if (errAnular) throw errAnular;

      if (compra.forma_pago === 'credito' && cuentaPagar) {
        const { error: errCp } = await supabase.from('cuentas_pagar').update({ estado: 'anulada' }).eq('compra_id', compra.id);
        if (errCp) throw errCp;
      }

      if (!compra.es_personal) {
        for (const item of detalles) {
          await ajustarInventarioPorEdicion(item, { ...item, cantidad_kg: 0 }, {
            proveedor_nombre: compra.proveedor_nombre,
            usuario_nombre: userRol?.nombre || currentUser?.email || '',
            user_id: currentUser?.id,
          });
        }
      }

      const { error: errAsiento } = await sincronizarAsientoCompraEditada(
        { ...compra, subtotal: 0, iva: 0, total: 0 },
        { forzarReversion: true }
      );
      if (errAsiento) throw errAsiento;

      setGuardando(false);
      onGuardado?.();
    } catch (e) {
      setError('Error al anular: ' + e.message);
      setGuardando(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ background: 'linear-gradient(135deg,#1a3a2a,#1e5c3a)', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>
            ✏️ {compra.proveedor_nombre} — ${parseFloat(compra.total || 0).toFixed(2)}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {!permiso.permitido ? (
            <div style={{ background: '#fde8e8', color: '#c0392b', padding: '14px 16px', borderRadius: 10, fontSize: 13, fontWeight: 'bold' }}>
              🔒 Esta compra tiene más de 7 días y solo un administrador puede editarla o anularla.
            </div>
          ) : (
            <>
              {error && (
                <div style={{ background: '#fde8e8', color: '#c0392b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 'bold' }}>⚠️ {error}</div>
              )}
              {avisoSaldo && (
                <div style={{ background: '#fff3e0', color: '#e67e22', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 'bold' }}>{avisoSaldo}</div>
              )}
              <CompraForm
                modo="editar"
                esPersonal={compra.es_personal}
                valoresIniciales={valoresIniciales}
                proveedores={proveedores}
                materiales={materiales}
                onChange={setFormState}
                mobile={false}
              />
            </>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #eee',
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', background: '#fdfbff' }}>
          {permiso.permitido && bloqueadaPorPago && (
            <span style={{ fontSize: 11, color: '#888', marginRight: 'auto' }}>
              Esta compra ya tiene pagos registrados — usa Editar para corregir el monto.
            </span>
          )}
          <button onClick={onClose} style={{
            padding: '9px 22px', borderRadius: 8, border: '1px solid #ddd',
            background: 'white', cursor: 'pointer', fontSize: 13
          }}>Cancelar</button>
          {permiso.permitido && (
            <button onClick={anular} disabled={guardando || bloqueadaPorPago} title={bloqueadaPorPago ? 'Esta compra ya tiene pagos registrados — usa Editar para corregir el monto.' : ''} style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              background: bloqueadaPorPago ? '#eee' : '#fde8e8',
              color: bloqueadaPorPago ? '#aaa' : '#c0392b',
              cursor: (guardando || bloqueadaPorPago) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 'bold'
            }}>🚫 Anular</button>
          )}
          {permiso.permitido && (
            <button onClick={guardar} disabled={guardando} style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              background: guardando ? '#aaa' : 'linear-gradient(135deg,#1a3a2a,#1e5c3a)',
              color: 'white', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 'bold'
            }}>{guardando ? 'Guardando...' : '💾 Guardar cambios'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
