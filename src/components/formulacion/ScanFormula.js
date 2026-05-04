// ScanFormula.js — Escáner de fórmula con IA (Claude Vision)
import React, { useState, useRef } from 'react';
import { supabase } from '../../supabase';

export default function ScanFormula({ producto, onCerrar, onImportada }) {
  const fileRef = useRef();
  const [imagen, setImagen]         = useState(null);   // { base64, mediaType, preview }
  const [analizando, setAnalizando] = useState(false);
  const [resultado, setResultado]   = useState(null);   // datos extraídos por IA
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState('');

  function seleccionarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const base64  = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/png';
      setImagen({ base64, mediaType, preview: dataUrl });
      setResultado(null);
      setError('');
    };
    reader.readAsDataURL(file);
  }

  async function analizar() {
    if (!imagen) return;
    setAnalizando(true);
    setError('');
    try {
      const res = await fetch('/api/analyze-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagen.base64,
          mediaType:   imagen.mediaType,
          nombreHoja:  producto.nombre,
        }),
      });
      const data = await res.json();
      const texto = data.content?.[0]?.text;
      if (!texto) throw new Error('La IA no devolvió respuesta');
      const parsed = JSON.parse(texto);

      // Verificar cada ingrediente contra materias_primas
      const todosLosIngredientes = [
        ...(parsed.ingredientes_mp || []).map(i => ({ ...i, seccion: 'MP' })),
        ...(parsed.ingredientes_ad || []).map(i => ({ ...i, seccion: 'AD' })),
      ];

      const nombres = todosLosIngredientes.map(i => i.nombre);
      const { data: mpsEncontradas } = await supabase
        .from('materias_primas')
        .select('id, nombre, nombre_producto, categoria')
        .eq('eliminado', false);

      const verificados = todosLosIngredientes.map(ing => {
        const norm = s => (s || '').toLowerCase().trim();
        const match = (mpsEncontradas || []).find(mp =>
          norm(mp.nombre_producto) === norm(ing.nombre) ||
          norm(mp.nombre)          === norm(ing.nombre) ||
          norm(mp.nombre_producto).includes(norm(ing.nombre)) ||
          norm(ing.nombre).includes(norm(mp.nombre_producto || '').split(' ')[0])
        );
        return { ...ing, mp: match || null, incluir: true };
      });

      setResultado({ ...parsed, ingredientes: verificados });
    } catch (e) {
      setError('Error al analizar: ' + e.message);
    }
    setAnalizando(false);
  }

  function toggleIncluir(idx) {
    setResultado(r => ({
      ...r,
      ingredientes: r.ingredientes.map((ing, i) =>
        i === idx ? { ...ing, incluir: !ing.incluir } : ing
      ),
    }));
  }

  async function importar() {
    if (!resultado) return;
    setGuardando(true);
    try {
      const aGuardar = resultado.ingredientes.filter(i => i.incluir);
      if (aGuardar.length === 0) throw new Error('No hay ingredientes seleccionados');

      // Borrar formulación actual y reemplazar
      await supabase.from('formulaciones').delete().eq('producto_nombre', producto.nombre);

      const mpFilas = aGuardar.filter(i => i.seccion === 'MP');
      const adFilas = aGuardar.filter(i => i.seccion === 'AD');
      const filas = [
        ...mpFilas.map((ing, idx) => ({
          producto_nombre:    producto.nombre,
          producto_id:        producto.id,
          seccion:            'MP',
          orden:              idx,
          ingrediente_nombre: ing.nombre,
          gramos:             parseFloat(ing.gramos) || 0,
          kilos:              (parseFloat(ing.gramos) || 0) / 1000,
          materia_prima_id:   ing.mp?.id || null,
          nota_cambio:        '',
          especificacion:     '',
        })),
        ...adFilas.map((ing, idx) => ({
          producto_nombre:    producto.nombre,
          producto_id:        producto.id,
          seccion:            'AD',
          orden:              idx,
          ingrediente_nombre: ing.nombre,
          gramos:             parseFloat(ing.gramos) || 0,
          kilos:              (parseFloat(ing.gramos) || 0) / 1000,
          materia_prima_id:   ing.mp?.id || null,
          nota_cambio:        '',
          especificacion:     '',
        })),
      ];

      const { error: insErr } = await supabase.from('formulaciones').insert(filas);
      if (insErr) throw insErr;

      onImportada?.();
      onCerrar();
    } catch (e) {
      setError('Error al guardar: ' + e.message);
    }
    setGuardando(false);
  }

  const mpCount    = resultado?.ingredientes.filter(i => i.seccion === 'MP').length || 0;
  const adCount    = resultado?.ingredientes.filter(i => i.seccion === 'AD').length || 0;
  const rojos      = resultado?.ingredientes.filter(i => !i.mp).length || 0;
  const incluidos  = resultado?.ingredientes.filter(i => i.incluir).length || 0;

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.7)', zIndex:4000,
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:16,
    }}>
      <div style={{
        background:'white', borderRadius:16,
        width:'100%', maxWidth:700,
        maxHeight:'90vh', overflowY:'auto',
        boxShadow:'0 20px 60px rgba(0,0,0,0.4)',
      }}>

        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg,#1a1a2e,#1a3a5c)',
          padding:'14px 20px', borderRadius:'16px 16px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, zIndex:10,
        }}>
          <div>
            <div style={{ color:'white', fontWeight:800, fontSize:15 }}>📷 Escanear fórmula con IA</div>
            <div style={{ color:'#aaa', fontSize:11, marginTop:2 }}>{producto.nombre}</div>
          </div>
          <button onClick={onCerrar} style={{
            background:'rgba(255,255,255,0.15)', border:'none',
            color:'white', width:32, height:32, borderRadius:8,
            cursor:'pointer', fontSize:16, fontWeight:'bold',
          }}>✕</button>
        </div>

        <div style={{ padding:'20px' }}>

          {/* Paso 1: subir imagen */}
          <div style={{
            border:'2px dashed #aed6f1', borderRadius:12,
            padding:'20px', textAlign:'center', marginBottom:16,
            background: imagen ? '#f0f8ff' : '#fafcff',
            cursor:'pointer',
          }} onClick={() => fileRef.current.click()}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={seleccionarArchivo} />
            {imagen ? (
              <div>
                <img src={imagen.preview} alt="preview" style={{ maxHeight:200, maxWidth:'100%', borderRadius:8, marginBottom:8 }} />
                <div style={{ fontSize:12, color:'#2980b9', fontWeight:700 }}>📸 Imagen cargada — clic para cambiar</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:40, marginBottom:8 }}>📷</div>
                <div style={{ fontWeight:700, color:'#1a3a5c', marginBottom:4 }}>Clic para subir captura de pantalla o foto</div>
                <div style={{ fontSize:12, color:'#888' }}>PNG, JPG, JPEG — foto de hoja Excel o papel</div>
              </div>
            )}
          </div>

          {/* Botón analizar */}
          {imagen && !resultado && (
            <button onClick={analizar} disabled={analizando} style={{
              width:'100%', padding:'12px',
              background: analizando ? '#95a5a6' : 'linear-gradient(135deg,#8e44ad,#6c3483)',
              color:'white', border:'none', borderRadius:10,
              fontSize:14, fontWeight:800, cursor: analizando ? 'not-allowed' : 'pointer',
              marginBottom:16,
            }}>
              {analizando ? '🤖 Analizando con Claude IA...' : '🤖 Analizar con IA'}
            </button>
          )}

          {/* Error */}
          {error && (
            <div style={{ background:'#fdecea', color:'#c0392b', padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:13 }}>
              ⚠ {error}
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <>
              {/* Resumen */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
                {[
                  { label:'MPs',          val: mpCount,   color:'#1a5276' },
                  { label:'Condimentos',  val: adCount,   color:'#6c3483' },
                  { label:'No encontrados', val: rojos,   color: rojos > 0 ? '#e74c3c' : '#27ae60' },
                  { label:'A importar',   val: incluidos, color:'#27ae60' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background:'#f8f9fa', borderRadius:8, padding:'8px 10px', textAlign:'center', border:`1.5px solid ${color}30` }}>
                    <div style={{ fontSize:20, fontWeight:900, color }}>{val}</div>
                    <div style={{ fontSize:10, color:'#888' }}>{label}</div>
                  </div>
                ))}
              </div>

              {rojos > 0 && (
                <div style={{ background:'#fef9e7', border:'1.5px solid #f39c12', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:12, color:'#7d6608' }}>
                  ⚠ Los ingredientes en <strong style={{ color:'#e74c3c' }}>rojo</strong> no están en tu base de datos de materias primas. Puedes desmarcarlos para no importarlos, o agregarlos primero en Materias.
                </div>
              )}

              {/* Tabla ingredientes */}
              {['MP', 'AD'].map(sec => {
                const ings = resultado.ingredientes.filter(i => i.seccion === sec);
                if (ings.length === 0) return null;
                return (
                  <div key={sec} style={{ marginBottom:16 }}>
                    <div style={{
                      background: sec === 'MP' ? '#1a5276' : '#6c3483',
                      color:'white', padding:'8px 14px', borderRadius:'8px 8px 0 0',
                      fontSize:12, fontWeight:800,
                    }}>
                      {sec === 'MP' ? '🥩 MATERIAS PRIMAS' : '🧂 CONDIMENTOS Y ADITIVOS'}
                    </div>
                    <div style={{ border:'1px solid #e0e0e0', borderRadius:'0 0 8px 8px', overflow:'hidden' }}>
                      {ings.map((ing, rawIdx) => {
                        const idx = resultado.ingredientes.indexOf(ing);
                        const encontrado = !!ing.mp;
                        return (
                          <div key={idx} style={{
                            display:'grid', gridTemplateColumns:'auto 1fr auto auto',
                            alignItems:'center', gap:10,
                            padding:'8px 14px',
                            background: !ing.incluir ? '#f8f9fa' : encontrado ? 'white' : '#fff5f5',
                            borderBottom:'1px solid #f0f0f0',
                          }}>
                            {/* Checkbox */}
                            <input type="checkbox" checked={ing.incluir} onChange={() => toggleIncluir(idx)}
                              style={{ width:16, height:16, cursor:'pointer' }} />
                            {/* Nombre */}
                            <div>
                              <div style={{
                                fontWeight:700, fontSize:13,
                                color: !ing.incluir ? '#bbb' : encontrado ? '#1a1a2e' : '#e74c3c',
                              }}>
                                {ing.nombre}
                                {!encontrado && ing.incluir && (
                                  <span style={{ fontSize:10, marginLeft:6, background:'#fdecea', color:'#e74c3c', padding:'1px 5px', borderRadius:4 }}>
                                    No en BD
                                  </span>
                                )}
                              </div>
                              {ing.mp && (
                                <div style={{ fontSize:10, color:'#27ae60' }}>
                                  ✓ {ing.mp.nombre_producto || ing.mp.nombre}
                                </div>
                              )}
                            </div>
                            {/* Gramos */}
                            <div style={{ textAlign:'right', fontSize:13, fontWeight:700, color:'#555', minWidth:60 }}>
                              {ing.gramos}g
                            </div>
                            {/* Status dot */}
                            <div style={{
                              width:10, height:10, borderRadius:'50%',
                              background: !ing.incluir ? '#ddd' : encontrado ? '#27ae60' : '#e74c3c',
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Botones acción */}
              <div style={{ display:'flex', gap:10, marginTop:8 }}>
                <button onClick={() => { setResultado(null); setImagen(null); }} style={{
                  flex:1, padding:'12px', background:'#f8f9fa',
                  border:'1.5px solid #ddd', borderRadius:10,
                  fontSize:13, cursor:'pointer', color:'#555',
                }}>
                  🔄 Escanear otra imagen
                </button>
                <button onClick={importar} disabled={guardando || incluidos === 0} style={{
                  flex:2, padding:'12px',
                  background: (guardando || incluidos === 0) ? '#95a5a6' : 'linear-gradient(135deg,#27ae60,#1a6b3c)',
                  color:'white', border:'none', borderRadius:10,
                  fontSize:14, fontWeight:800,
                  cursor: (guardando || incluidos === 0) ? 'not-allowed' : 'pointer',
                }}>
                  {guardando ? 'Importando...' : `✅ Importar ${incluidos} ingredientes`}
                </button>
              </div>
              <div style={{ fontSize:11, color:'#e74c3c', textAlign:'center', marginTop:8 }}>
                ⚠ Esto reemplazará la fórmula actual de {producto.nombre}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
