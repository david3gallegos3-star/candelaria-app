// ============================================
// ModalBuscador.js
// Modal de búsqueda de materias primas
// ============================================
import React from 'react';

export default function ModalBuscador({
  mobile,
  buscador, setBuscador,
  mpFiltradas,
  seleccionarMP,
  getPrecioAgua,
}) {
  if (!buscador.abierto) return null;

  const titulo = ['empaque','funda','hilo'].includes(buscador.tipo)
    ? 'Buscar Empaque'
    : buscador.tipo === 'etiqueta'
    ? 'Buscar Etiqueta'
    : 'Buscar Materia Prima';

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.65)',
      display:'flex',
      alignItems: mobile ? 'flex-end' : 'center',
      justifyContent:'center',
      zIndex:3000
    }}>
      <div style={{
        background:'white',
        borderRadius: mobile ? '16px 16px 0 0' : '12px',
        width: mobile ? '100%' : '520px',
        maxHeight: mobile ? '85vh' : '72vh',
        display:'flex', flexDirection:'column',
        boxShadow:'0 -4px 30px rgba(0,0,0,0.25)'
      }}>

        {/* Header */}
        <div style={{
          background:'#1a5276',
          padding:'14px 16px',
          borderRadius: mobile ? '16px 16px 0 0' : '12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center'
        }}>
          <span style={{
            color:'white', fontWeight:'bold',
            fontSize: mobile ? '15px' : '14px'
          }}>🔍 {titulo}</span>

          <button
            onClick={() => setBuscador({ abierto:false, tipo:'', indice:null, texto:'' })}
            style={{
              background:'rgba(255,255,255,0.2)', border:'none',
              color:'white', fontSize:'18px', cursor:'pointer',
              borderRadius:'6px', padding:'4px 10px'
            }}>✕</button>
        </div>

        {/* Input búsqueda */}
        <div style={{ padding:'12px' }}>
          <input
            autoFocus
            placeholder="Buscar... (ej: oregano = orégano)"
            value={buscador.texto}
            onChange={e => setBuscador({ ...buscador, texto: e.target.value })}
            style={{
              width:'100%',
              padding: mobile ? '12px' : '9px',
              borderRadius:'9px', border:'1.5px solid #ddd',
              fontSize: mobile ? '16px' : '13px',
              boxSizing:'border-box'
            }}
          />
        </div>

        {/* Lista resultados */}
        <div style={{ overflowY:'auto', padding:'0 12px 12px' }}>
          {mpFiltradas.slice(0, 40).map(mp => {
            const esAgua = mp.categoria?.toUpperCase().includes('AGUA');
            const precio = esAgua
              ? getPrecioAgua().toFixed(4)
              : parseFloat(mp.precio_kg || 0).toFixed(2);

            return (
              <div
                key={mp.id}
                onClick={() => seleccionarMP(mp)}
                style={{
                  padding: mobile ? '12px 14px' : '9px 12px',
                  borderRadius:'9px', cursor:'pointer',
                  marginBottom:'4px', border:'1px solid #eee',
                  display:'flex', justifyContent:'space-between',
                  alignItems:'center',
                  minHeight: mobile ? 56 : 0,
                  background:'white'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#eaf4fb'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <div>
                  <div style={{
                    fontWeight:'bold',
                    fontSize: mobile ? '14px' : '12px',
                    color:'#1a5276'
                  }}>
                    {mp.nombre_producto || mp.nombre}
                  </div>
                  <div style={{
                    fontSize: mobile ? '11px' : '10px',
                    color:'#888'
                  }}>
                    {mp.id} — {mp.categoria}
                  </div>
                </div>

                <div style={{
                  fontWeight:'bold',
                  color: esAgua ? '#3498db' : '#27ae60',
                  fontSize: mobile ? '15px' : '13px'
                }}>
                  {esAgua ? '💧' : ''}${precio}/kg
                </div>
              </div>
            );
          })}

          {mpFiltradas.length === 0 && (
            <div style={{
              textAlign:'center', padding:'40px', color:'#888'
            }}>
              No se encontraron resultados
            </div>
          )}
        </div>
      </div>
    </div>
  );
}