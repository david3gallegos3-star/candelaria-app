// ============================================
// MATERIAS PRIMAS — Modal agregar y editar
// Usado por: PantallaMaterias.js
// ============================================

import React from 'react';
import MateriasForm from '../../components/MateriasForm';

function MateriasModalAgregar({
  // Modal agregar
  modalAgregar, setModalAgregar,
  form, setForm,
  guardarNuevoMP,
  // Modal editar
  modalEditar, setModalEditar,
  guardarEdicionMP,
  // Compartido
  categoriasMp,
  generarSiguienteId
}) {
  return (
    <>
      {/* ── Modal AGREGAR ── */}
      {modalAgregar && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center',
          justifyContent:'center', zIndex:2000
        }}>
          <div style={{
            background:'white', padding:28, borderRadius:12,
            width:600, maxHeight:'85vh', overflowY:'auto',
            boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
          }}>

            {/* Header */}
            <h3 style={{ margin:'0 0 8px', color:'#1a1a2e' }}>
              ➕ Agregar Materia Prima
            </h3>
            <div style={{
              background:'#e8f4fd', color:'#1a5276',
              padding:'8px 12px', borderRadius:6,
              fontSize:'12px', marginBottom:16
            }}>
              💡 El ID se sugiere automáticamente · $/LB y $/GR se calculan solos
            </div>

            {/* Formulario */}
            <MateriasForm
              data={form}
              setData={setForm}
              categoriasMp={categoriasMp}
              generarSiguienteId={generarSiguienteId}
            />

            {/* Botones */}
            <div style={{
              display:'flex', gap:10,
              marginTop:20, justifyContent:'flex-end'
            }}>
              <button onClick={() => setModalAgregar(false)} style={{
                padding:'10px 20px', background:'#95a5a6',
                color:'white', border:'none',
                borderRadius:8, cursor:'pointer'
              }}>Cancelar</button>
              <button onClick={guardarNuevoMP} style={{
                padding:'10px 20px', background:'#27ae60',
                color:'white', border:'none', borderRadius:8,
                cursor:'pointer', fontWeight:'bold'
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal EDITAR ── */}
      {modalEditar && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:0,
          background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center',
          justifyContent:'center', zIndex:2000
        }}>
          <div style={{
            background:'white', padding:28, borderRadius:12,
            width:600, maxHeight:'85vh', overflowY:'auto',
            boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
          }}>

            {/* Header */}
            <h3 style={{ margin:'0 0 8px', color:'#1a1a2e' }}>
              ✏️ Editar: {modalEditar.nombre}
            </h3>
            <div style={{
              background:'#e8f4fd', color:'#1a5276',
              padding:'8px 12px', borderRadius:6,
              fontSize:'12px', marginBottom:16
            }}>
              💡 Si cambias "Nombre en Producto" se actualiza en todas las fórmulas.
            </div>

            {/* Formulario */}
            <MateriasForm
              data={modalEditar}
              setData={setModalEditar}
              categoriasMp={categoriasMp}
              generarSiguienteId={generarSiguienteId}
              esEdicion={true}
            />

            {/* Botones */}
            <div style={{
              display:'flex', gap:10,
              marginTop:20, justifyContent:'flex-end'
            }}>
              <button onClick={() => setModalEditar(null)} style={{
                padding:'10px 20px', background:'#95a5a6',
                color:'white', border:'none',
                borderRadius:8, cursor:'pointer'
              }}>Cancelar</button>
              <button onClick={guardarEdicionMP} style={{
                padding:'10px 20px', background:'#3498db',
                color:'white', border:'none', borderRadius:8,
                cursor:'pointer', fontWeight:'bold'
              }}>✅ Actualizar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MateriasModalAgregar;