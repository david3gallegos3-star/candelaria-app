// ============================================
// EditarCompraModal.js
// Editar o anular cualquier compra (personal o empresa, contado o credito)
// ============================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabase';
import CompraForm from './CompraForm';
import { puedeEditarCompra } from '../../utils/compraEditPermisos';

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
          display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fdfbff' }}>
          <button onClick={onClose} style={{
            padding: '9px 22px', borderRadius: 8, border: '1px solid #ddd',
            background: 'white', cursor: 'pointer', fontSize: 13
          }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
