// ============================================
// ModalPrecio.js
// Modal para asignar precio a cliente/producto
// ============================================
import React from 'react';

export default function ModalPrecio({
  mobile,
  modalPrecio, setModalPrecio,
  editandoPrecio,
  formPrecio, setFormPrecio,
  clientes, productos,
  guardando,
  guardarPrecio,
  getPrecioSistema,
  getCostoSistema,
}) {
  if (!modalPrecio) return null;

  const precioSistema = formPrecio.producto_nombre
    ? getPrecioSistema(formPrecio.producto_nombre) : 0;
  const costoSistema  = formPrecio.producto_nombre
    ? getCostoSistema(formPrecio.producto_nombre)  : 0;
  const precioVenta   = parseFloat(formPrecio.precio_venta_kg) || 0;
  const margenActual  = costoSistema > 0 && precioVenta > 0
    ? ((precioVenta - costoSistema) / costoSistema * 100).toFixed(1)
    : null;
  const margenMin     = parseFloat(formPrecio.margen_minimo) * 100;
  const bajoMargen    = margenActual !== null &&
    parseFloat(margenActual) < margenMin;

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.6)',
      display:'flex',
      alignItems: mobile ? 'flex-end' : 'center',
      justifyContent:'center',
      zIndex:3000
    }}>
      <div style={{
        background:'white',
        borderRadius: mobile ? '16px 16px 0 0' : '14px',
        width: mobile ? '100%' : '500px',
        maxHeight: mobile ? '92vh' : 'auto',
        overflowY:'auto',
        padding:'20px',
        boxShadow:'0 -4px 30px rgba(0,0,0,0.25)'
      }}>

        {/* Header */}
        <div style={{
          display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:'16px'
        }}>
          <h3 style={{ margin:0, color:'#1a1a2e', fontSize:'15px' }}>
            {editandoPrecio ? '✏️ Editar precio' : '💰 Asignar precio'}
          </h3>
          <button
            onClick={() => setModalPrecio(false)}
            style={{
              background:'none', border:'none',
              fontSize:'18px', cursor:'pointer', color:'#aaa'
            }}>✕</button>
        </div>

        {/* Cliente */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Cliente *</label>
          {editandoPrecio ? (
            <div style={{
              padding:'10px 12px', background:'#f8f9fa',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px', fontWeight:'bold', color:'#1a1a2e'
            }}>
              {formPrecio.cliente_nombre}
            </div>
          ) : (
            <select
              value={formPrecio.cliente_id || ''}
              onChange={e => {
                const cli = clientes.find(c => c.id === e.target.value);
                setFormPrecio({
                  ...formPrecio,
                  cliente_id:     e.target.value,
                  cliente_nombre: cli?.nombre || ''
                });
              }}
              style={{
                width:'100%', padding:'10px',
                borderRadius:'8px', border:'1.5px solid #3498db',
                fontSize:'13px'
              }}
            >
              <option value="">Selecciona un cliente...</option>
              {clientes.filter(c => c.activo).map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>

        {/* Producto */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Producto *</label>
          {editandoPrecio ? (
            <div style={{
              padding:'10px 12px', background:'#f8f9fa',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px', fontWeight:'bold', color:'#1a1a2e'
            }}>
              {formPrecio.producto_nombre}
            </div>
          ) : (
            <select
              value={formPrecio.producto_nombre || ''}
              onChange={e => setFormPrecio({
                ...formPrecio, producto_nombre: e.target.value
              })}
              style={{
                width:'100%', padding:'10px',
                borderRadius:'8px', border:'1.5px solid #3498db',
                fontSize:'13px'
              }}
            >
              <option value="">Selecciona un producto...</option>
              {productos.map(p => (
                <option key={p.id} value={p.nombre}>{p.nombre}</option>
              ))}
            </select>
          )}
        </div>

        {/* Info sistema */}
        {formPrecio.producto_nombre && (
          <div style={{
            background:'#e8f4fd', borderRadius:'8px',
            padding:'10px 12px', marginBottom:'12px',
            display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'
          }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'10px', color:'#1a5276', fontWeight:'700' }}>
                PRECIO SISTEMA
              </div>
              <div style={{ fontSize:'16px', fontWeight:'bold', color:'#1a5276' }}>
                ${precioSistema.toFixed(4)}
              </div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'10px', color:'#555', fontWeight:'700' }}>
                COSTO/KG
              </div>
              <div style={{ fontSize:'16px', fontWeight:'bold', color:'#555' }}>
                ${costoSistema.toFixed(4)}
              </div>
            </div>
          </div>
        )}

        {/* Precio venta */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Precio venta al cliente ($/kg) *</label>
          <input
            type="number"
            step="0.0001"
            value={formPrecio.precio_venta_kg || ''}
            onChange={e => setFormPrecio({
              ...formPrecio, precio_venta_kg: e.target.value
            })}
            placeholder={precioSistema > 0
              ? `Sistema: $${precioSistema.toFixed(4)}`
              : 'Ej: 5.50'}
            style={{
              width:'100%', padding:'12px',
              borderRadius:'8px',
              border: bajoMargen
                ? '1.5px solid #e74c3c'
                : '1.5px solid #27ae60',
              fontSize:'16px', fontWeight:'bold',
              textAlign:'center', boxSizing:'border-box',
              color: bajoMargen ? '#e74c3c' : '#27ae60'
            }}
          />
        </div>

        {/* Preview margen */}
        {margenActual !== null && (
          <div style={{
            background: bajoMargen ? '#fde8e8' : '#e8f5e9',
            borderRadius:'8px', padding:'10px 12px',
            marginBottom:'12px',
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <span style={{
              fontSize:'12px', fontWeight:'bold',
              color: bajoMargen ? '#721c24' : '#155724'
            }}>
              {bajoMargen ? '⚠️ Margen bajo' : '✅ Margen OK'}
            </span>
            <span style={{
              fontSize:'16px', fontWeight:'bold',
              color: bajoMargen ? '#e74c3c' : '#27ae60'
            }}>
              {margenActual}%
            </span>
          </div>
        )}

        {/* Margen mínimo */}
        <div style={{ marginBottom:'16px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>
            Margen mínimo aceptable
            <span style={{
              marginLeft:6, fontSize:'11px',
              color:'#888', fontWeight:'normal'
            }}>
              (alerta si baja de este %)
            </span>
          </label>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={formPrecio.margen_minimo || 0.10}
              onChange={e => setFormPrecio({
                ...formPrecio, margen_minimo: e.target.value
              })}
              style={{
                width:'100px', padding:'9px',
                borderRadius:'8px', border:'1px solid #ddd',
                fontSize:'13px', textAlign:'center',
                boxSizing:'border-box'
              }}
            />
            <span style={{ fontSize:'13px', color:'#888' }}>
              = {(parseFloat(formPrecio.margen_minimo || 0.10) * 100).toFixed(0)}% mínimo
            </span>
          </div>
          <div style={{ fontSize:'11px', color:'#888', marginTop:'4px' }}>
            Ejemplo: 0.10 = 10% · 0.15 = 15% · 0.20 = 20%
          </div>
        </div>

        {/* Botones */}
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button
            onClick={() => setModalPrecio(false)}
            style={{
              padding:'10px 18px', background:'#95a5a6',
              color:'white', border:'none',
              borderRadius:'8px', cursor:'pointer'
            }}>Cancelar</button>

          <button
            onClick={guardarPrecio}
            disabled={
              guardando ||
              !formPrecio.cliente_id ||
              !formPrecio.producto_nombre ||
              !formPrecio.precio_venta_kg ||
              parseFloat(formPrecio.precio_venta_kg) <= 0
            }
            style={{
              padding:'10px 22px',
              background: guardando ? '#95a5a6' : '#3498db',
              color:'white', border:'none', borderRadius:'8px',
              cursor: guardando ? 'not-allowed' : 'pointer',
              fontWeight:'bold',
              opacity: guardando ? 0.7 : 1
            }}>
            {guardando
              ? 'Guardando...'
              : editandoPrecio ? '✅ Actualizar' : '💰 Asignar precio'}
          </button>
        </div>
      </div>
    </div>
  );
}