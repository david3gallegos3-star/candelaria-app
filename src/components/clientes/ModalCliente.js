// ============================================
// ModalCliente.js
// Modal para crear y editar cliente
// ============================================
import React from 'react';

export default function ModalCliente({
  mobile,
  modalCliente, setModalCliente,
  editandoCliente,
  formCliente, setFormCliente,
  guardando,
  guardarCliente,
}) {
  if (!modalCliente) return null;

  const campos = [
    { key:'nombre',    label:'Nombre *',    type:'text',  placeholder:'Ej: Supermercado La Favorita', required:true  },
    { key:'ruc',       label:'RUC',         type:'text',  placeholder:'Ej: 1234567890001',            required:false },
    { key:'telefono',  label:'Teléfono',    type:'text',  placeholder:'Ej: 0999999999',               required:false },
    { key:'email',     label:'Email',       type:'email', placeholder:'Ej: compras@empresa.com',      required:false },
    { key:'direccion', label:'Dirección',   type:'text',  placeholder:'Ej: Av. Principal 123',        required:false },
  ];

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
        width: mobile ? '100%' : '480px',
        maxHeight: mobile ? '90vh' : 'auto',
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
            {editandoCliente ? '✏️ Editar cliente' : '➕ Nuevo cliente'}
          </h3>
          <button
            onClick={() => setModalCliente(false)}
            style={{
              background:'none', border:'none',
              fontSize:'18px', cursor:'pointer', color:'#aaa'
            }}>✕</button>
        </div>

        {/* Campos */}
        {campos.map(({ key, label, type, placeholder, required }) => (
          <div key={key} style={{ marginBottom:'12px' }}>
            <label style={{
              fontSize:'12px', fontWeight:'bold',
              color:'#555', display:'block', marginBottom:'4px'
            }}>{label}</label>
            <input
              type={type}
              value={formCliente[key] || ''}
              onChange={e => setFormCliente({ ...formCliente, [key]: e.target.value })}
              placeholder={placeholder}
              style={{
                width:'100%', padding:'10px',
                borderRadius:'8px',
                border: required
                  ? '1.5px solid #3498db'
                  : '1px solid #ddd',
                fontSize:'13px', boxSizing:'border-box'
              }}
            />
          </div>
        ))}

        {/* Notas */}
        <div style={{ marginBottom:'16px' }}>
          <label style={{
            fontSize:'12px', fontWeight:'bold',
            color:'#555', display:'block', marginBottom:'4px'
          }}>Notas</label>
          <textarea
            value={formCliente.notas || ''}
            onChange={e => setFormCliente({ ...formCliente, notas: e.target.value })}
            placeholder="Observaciones, condiciones especiales..."
            rows={3}
            style={{
              width:'100%', padding:'10px',
              borderRadius:'8px', border:'1px solid #ddd',
              fontSize:'13px', resize:'vertical',
              boxSizing:'border-box', fontFamily:'Arial'
            }}
          />
        </div>

        {/* Botones */}
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button
            onClick={() => setModalCliente(false)}
            style={{
              padding:'10px 18px', background:'#95a5a6',
              color:'white', border:'none',
              borderRadius:'8px', cursor:'pointer'
            }}>Cancelar</button>

          <button
            onClick={guardarCliente}
            disabled={guardando || !formCliente.nombre?.trim()}
            style={{
              padding:'10px 22px',
              background: guardando || !formCliente.nombre?.trim()
                ? '#95a5a6' : '#27ae60',
              color:'white', border:'none', borderRadius:'8px',
              cursor: guardando || !formCliente.nombre?.trim()
                ? 'not-allowed' : 'pointer',
              fontWeight:'bold',
              opacity: guardando || !formCliente.nombre?.trim() ? 0.7 : 1
            }}>
            {guardando
              ? 'Guardando...'
              : editandoCliente ? '✅ Actualizar' : '✅ Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}