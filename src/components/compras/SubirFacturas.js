// src/components/compras/SubirFacturas.js
import React, { useRef, useState } from 'react';
import { supabase } from '../../supabase';

// Parsear XML de factura electrónica SRI Ecuador
function parsearXmlSRI(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const get = (tag) => doc.querySelector(tag)?.textContent?.trim() || null;

    const items = [];
    doc.querySelectorAll('detalle').forEach(d => {
      items.push({
        descripcion:     d.querySelector('descripcion')?.textContent?.trim() || '',
        cantidad:        parseFloat(d.querySelector('cantidad')?.textContent || '0'),
        unidad:          d.querySelector('unidadMedida')?.textContent?.trim() || null,
        precio_unitario: parseFloat(d.querySelector('precioUnitario')?.textContent || '0'),
        subtotal:        parseFloat(d.querySelector('precioTotalSinImpuesto')?.textContent || '0'),
      });
    });

    const fechaRaw = get('fechaEmision'); // DD/MM/YYYY
    let fecha = null;
    if (fechaRaw && fechaRaw.includes('/')) {
      const [d, m, y] = fechaRaw.split('/');
      fecha = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    const estab  = get('estab')  || '001';
    const pto    = get('ptoEmi') || '001';
    const secuencial = get('secuencial') || '';
    const numero = secuencial ? `${estab}-${pto}-${secuencial}` : null;

    let baseIva0 = 0, baseIva15 = 0, totalIva = 0;
    doc.querySelectorAll('totalImpuesto').forEach(imp => {
      const codigo = imp.querySelector('codigo')?.textContent;
      const base   = parseFloat(imp.querySelector('baseImponible')?.textContent || '0');
      const valor  = parseFloat(imp.querySelector('valor')?.textContent || '0');
      if (codigo === '2') { baseIva15 += base; totalIva += valor; }
      else if (codigo === '0') { baseIva0 += base; }
    });

    return {
      es_factura:       true,
      proveedor_nombre: get('razonSocialProveedor') || get('razonSocial'),
      proveedor_ruc:    get('rucProveedor')          || get('ruc'),
      numero_factura:   numero,
      autorizacion_sri: get('numeroAutorizacion'),
      fecha_emision:    fecha,
      subtotal:         parseFloat(get('totalSinImpuestos') || '0'),
      base_iva0:        baseIva0,
      base_iva15:       baseIva15,
      iva:              totalIva,
      total:            parseFloat(get('importeTotal') || '0'),
      tiene_factura:    true,
      items,
    };
  } catch {
    return { es_factura: false };
  }
}

async function analizarArchivo(file) {
  const nombre = file.name.toLowerCase();

  if (nombre.endsWith('.xml')) {
    const text = await file.text();
    return parsearXmlSRI(text);
  }

  const buf   = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  const base64 = btoa(bin);
  const tipo   = nombre.endsWith('.pdf') ? 'pdf' : 'imagen';

  const { data, error } = await supabase.functions.invoke('analizar-factura', {
    body: { tipo, contenido: base64, nombre: file.name },
  });
  if (error) throw new Error(error.message);
  return data;
}

async function verificarDuplicado(numeroFactura, esPersonal) {
  if (!numeroFactura) return null;
  if (esPersonal) {
    // talonario_facturas_personales no tiene numero_factura — se guarda en comentario
    const { data } = await supabase
      .from('talonario_facturas_personales')
      .select('id, fecha')
      .eq('comentario', numeroFactura)
      .maybeSingle();
    return data || null;
  }
  const { data } = await supabase.from('compras').select('id, fecha').eq('numero_factura', numeroFactura).maybeSingle();
  return data || null;
}

export default function SubirFacturas({ onClose, esPersonal = false }) {
  const fileRef  = useRef(null);
  const [archivos,   setArchivos]   = useState([]);
  const [analizando, setAnalizando] = useState(false);
  const [guardando,  setGuardando]  = useState(false);
  const [msg,        setMsg]        = useState('');

  async function handleFiles(e) {
    const files = Array.from(e.target.files).slice(0, 10);
    if (!files.length) return;

    setAnalizando(true);
    setMsg('');
    const resultado = [];

    for (const file of files) {
      try {
        const datos     = await analizarArchivo(file);
        const duplicado = datos.es_factura
          ? await verificarDuplicado(datos.numero_factura, esPersonal)
          : null;
        resultado.push({ file, datos, duplicado, estado: datos.es_factura ? 'ok' : 'error' });
      } catch (err) {
        resultado.push({ file, datos: null, duplicado: null, estado: 'error', errorMsg: err.message });
      }
    }

    // Detectar duplicados dentro del mismo lote
    const vistos = {};
    for (const item of resultado) {
      const num = item.datos?.numero_factura;
      if (!num) continue;
      if (vistos[num]) {
        if (!item.duplicado) item.duplicado = { fecha: vistos[num].datos.fecha_emision, enLote: true };
      } else {
        vistos[num] = item;
      }
    }

    setArchivos(resultado);
    setAnalizando(false);
    e.target.value = '';
  }

  async function confirmar() {
    const nuevos = archivos.filter(a => a.estado === 'ok' && !a.duplicado && a.datos?.es_factura);
    if (!nuevos.length) return;
    setGuardando(true);

    for (const { datos } of nuevos) {
      const fecha = datos.fecha_emision || null;
      const mes   = fecha ? parseInt(fecha.split('-')[1]) : new Date().getMonth() + 1;
      const año   = fecha ? parseInt(fecha.split('-')[0]) : new Date().getFullYear();

      if (esPersonal) {
        await supabase.from('talonario_facturas_personales').insert({
          mes, año,
          fecha,
          proveedor:     datos.proveedor_nombre || '',
          descripcion:   datos.items?.[0]?.descripcion || 'Factura personal',
          monto:         datos.total || 0,
          tiene_factura: datos.tiene_factura !== false,
          forma_pago:    '20',
          comentario:    datos.numero_factura || null,
        });
      } else {
        await supabase.from('compras').insert({
          proveedor_nombre:  datos.proveedor_nombre || '',
          proveedor_ruc:     datos.proveedor_ruc    || null,
          fecha,
          tiene_factura:     datos.tiene_factura !== false,
          numero_factura:    datos.numero_factura   || null,
          autorizacion_sri:  datos.autorizacion_sri || null,
          fecha_emision:     fecha,
          base_iva15:        datos.base_iva15  || null,
          base_iva0:         datos.base_iva0   || null,
          subtotal:          datos.subtotal    || datos.total || 0,
          iva:               datos.iva         || 0,
          total:             datos.total       || 0,
          es_personal:       false,
          estado:            'pendiente',
          origen:            'subida_ia',
          notas:             datos.items?.length
            ? datos.items.map(i => `${i.descripcion} x${i.cantidad}`).join('; ')
            : null,
        });
      }
    }

    setGuardando(false);
    setMsg(`✅ ${nuevos.length} factura(s) cargada(s) correctamente`);
    setTimeout(onClose, 2000);
  }

  const nuevos     = archivos.filter(a => a.estado === 'ok' && !a.duplicado && a.datos?.es_factura);
  const duplicados = archivos.filter(a => a.duplicado);
  const errores    = archivos.filter(a => a.estado === 'error' || (a.datos && !a.datos.es_factura));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28,
        width: 620, maxWidth: '96vw', maxHeight: '88vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1a3a2a' }}>
            {esPersonal ? '📄 Subir Facturas Personales' : '📎 Subir Facturas del Negocio'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>

        {!archivos.length && !analizando && (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              Selecciona hasta <b>10 archivos</b> de facturas (PDF, JPG, PNG, XML del SRI).
              La IA leerá cada una y detectará duplicados automáticamente.
            </p>
            <input ref={fileRef} type="file" multiple
              accept=".pdf,.jpg,.jpeg,.png,.xml"
              style={{ display: 'none' }} onChange={handleFiles} />
            <button onClick={() => fileRef.current.click()}
              style={{ background: '#1a3a2a', color: 'white', border: 'none',
                borderRadius: 10, padding: '12px 24px', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 14, width: '100%' }}>
              📁 Seleccionar archivos
            </button>
          </div>
        )}

        {analizando && (
          <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
            <div style={{ fontWeight: 'bold' }}>Analizando facturas con IA...</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>Puede tardar unos segundos</div>
          </div>
        )}

        {!analizando && archivos.length > 0 && (
          <>
            {nuevos.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', color: '#27ae60', marginBottom: 8, fontSize: 13 }}>
                  ✅ NUEVAS — se van a cargar ({nuevos.length}):
                </div>
                {nuevos.map((a, i) => (
                  <div key={i} style={{ background: '#e8f5e9', border: '1px solid #27ae60',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 'bold', color: '#1a5276' }}>
                      {a.datos.numero_factura || 'Sin número'} — {a.datos.proveedor_nombre || 'Proveedor desconocido'}
                    </div>
                    <div style={{ color: '#555', marginTop: 3 }}>
                      {a.datos.fecha_emision} · Total: ${parseFloat(a.datos.total||0).toFixed(2)}
                      {a.datos.items?.length > 0 && (
                        <span style={{ marginLeft: 8, color: '#888' }}>
                          · {a.datos.items.length} ítem(s)
                        </span>
                      )}
                    </div>
                    {a.datos.items?.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
                        {a.datos.items.slice(0,3).map((it,j) => (
                          <span key={j} style={{ marginRight: 8 }}>
                            {it.descripcion} x{it.cantidad} = ${it.subtotal?.toFixed(2)}
                          </span>
                        ))}
                        {a.datos.items.length > 3 && <span>+ {a.datos.items.length - 3} más</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {duplicados.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', color: '#e74c3c', marginBottom: 8, fontSize: 13 }}>
                  🔴 DUPLICADAS — ya están en el sistema ({duplicados.length}):
                </div>
                {duplicados.map((a, i) => (
                  <div key={i} style={{ background: '#fde8e8', border: '1px solid #e74c3c',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 'bold', color: '#c0392b' }}>
                      {a.datos?.numero_factura} — {a.datos?.proveedor_nombre}
                    </div>
                    <div style={{ color: '#888', marginTop: 2 }}>
                      {a.duplicado.enLote
                        ? 'Repetida en este lote · No se volverá a cargar'
                        : `Ya registrada el ${a.duplicado.fecha} · No se volverá a cargar`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {errores.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', color: '#e67e22', marginBottom: 8, fontSize: 13 }}>
                  ⚠️ NO RECONOCIDAS ({errores.length}):
                </div>
                {errores.map((a, i) => (
                  <div key={i} style={{ background: '#fff3e0', border: '1px solid #e67e22',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 12, color: '#7d5200' }}>
                    {a.file.name} — {a.errorMsg || 'No se pudo identificar como factura'}
                  </div>
                ))}
              </div>
            )}

            {msg && (
              <div style={{ background: '#e8f5e9', color: '#27ae60', padding: '10px 14px',
                borderRadius: 8, fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
                {msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setArchivos([]); setMsg(''); }}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #ddd',
                  background: 'white', cursor: 'pointer', fontSize: 13 }}>
                Subir otros archivos
              </button>
              {nuevos.length > 0 && (
                <button onClick={confirmar} disabled={guardando}
                  style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
                    background: guardando ? '#95a5a6' : '#27ae60',
                    color: 'white', cursor: guardando ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold', fontSize: 13 }}>
                  {guardando ? '⏳ Guardando...' : `✅ Cargar ${nuevos.length} nueva(s)`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
