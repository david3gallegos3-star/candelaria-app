// api/emitir-nota-credito.js
// Emite nota de crédito electrónica a Dátil → SRI Ecuador

const DATIL_URL = 'https://link.datil.co/credit-notes/issue';


function tipoIdentificacion(id) {
  if (!id || id === '9999999999999') return '07';
  const limpio = id.replace(/[^0-9]/g, '');
  if (limpio.length === 13) return '04';
  if (limpio.length === 10) return '05';
  return '06';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    cliente,
    autorizacion_sri,
    numero_factura,
    fecha_emision_factura,
    motivo,
    tipo_motivo,
    items,
    secuencial,
  } = req.body;

  if (!autorizacion_sri)
    return res.status(400).json({ error: 'La factura no tiene código de autorización SRI' });
  if (!items || items.length === 0)
    return res.status(400).json({ error: 'Sin ítems en la nota de crédito' });

  const subtotal = parseFloat(
    items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0).toFixed(2)
  );
  const iva   = parseFloat((subtotal * 0.15).toFixed(2));
  const total = parseFloat((subtotal + iva).toFixed(2));

  const fechaHoy      = new Date(Date.now() - 5 * 3600 * 1000).toISOString().split('T')[0];
  const secuencialStr = String(secuencial).padStart(9, '0');

  const payload = {
    ambiente:      1,
    tipo_emision:  1,
    secuencial:    secuencialStr,
    fecha_emision: fechaHoy,

    emisor: {
      ruc:                    '1002345351001',
      obligado_contabilidad:  false,
      contribuyente_especial: '',
      nombre_comercial:       'Corella Placencia Sebastian Francisco',
      razon_social:           'Corella Placencia Sebastian Francisco',
      direccion:              'Ibarra, Imbabura, Ecuador',
      establecimiento: {
        punto_emision: '001',
        codigo:        '001',
        direccion:     'Ibarra, Imbabura, Ecuador',
      },
    },

    moneda: 'USD',

    comprador: {
      razon_social:        cliente.nombre || 'CONSUMIDOR FINAL',
      identificacion:      cliente.ruc    || '9999999999999',
      tipo_identificacion: tipoIdentificacion(cliente.ruc),
      email:               cliente.email     || '',
      telefono:            cliente.telefono  || '',
      direccion:           cliente.direccion || '',
    },

    tipo_documento_modificado:             '01',
    numero_documento_modificado:           numero_factura,
    fecha_emision_documento_modificado:    fecha_emision_factura || fechaHoy,
    numero_autorizacion_documento_modificado: autorizacion_sri,

    motivo,

    totales: {
      total_sin_impuestos: subtotal,
      impuestos: [{
        codigo:            '2',
        codigo_porcentaje: '4',
        base_imponible:    subtotal,
        valor:             iva,
      }],
      importe_total: total,
    },

    items: items.map((item, idx) => {
      const sub   = parseFloat(parseFloat(item.subtotal || 0).toFixed(2));
      const ivaIt = parseFloat((sub * 0.15).toFixed(2));
      return {
        cantidad:                   parseFloat(item.cantidad),
        codigo_principal:           item.codigo || String(idx + 1).padStart(3, '0'),
        precio_unitario:            parseFloat(parseFloat(item.precio_unitario).toFixed(4)),
        descripcion:                item.descripcion || item.producto_nombre,
        precio_total_sin_impuestos: sub,
        impuestos: [{
          codigo:            '2',
          codigo_porcentaje: '4',
          tarifa:            15,
          base_imponible:    sub,
          valor:             ivaIt,
        }],
        descuento: 0,
      };
    }),
  };

  try {
    const datilRes = await fetch(DATIL_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Key':        process.env.DATIL_API_KEY,
        'X-Password':   process.env.DATIL_PASSWORD,
      },
      body: JSON.stringify(payload),
    });

    const data = await datilRes.json();
    console.log('DATIL NC status:', datilRes.status, JSON.stringify(data, null, 2));

    if (!datilRes.ok) {
      const errores  = data?.errores || data?.errors || data?.mensaje || data;
      const mensajes = Array.isArray(errores)
        ? errores.map(e => `[${e.campo || ''}] ${e.mensaje || JSON.stringify(e)}`).join(' | ')
        : JSON.stringify(errores);
      return res.status(400).json({ error: mensajes || 'Error Dátil/SRI', detalle: data });
    }

    const estado = (data.estado || data.status || '').toLowerCase();
    if (['error', 'no_autorizada', 'rechazada', 'devuelta'].includes(estado)) {
      const errores  = data.errores || data.errors || [];
      const mensajes = Array.isArray(errores) && errores.length > 0
        ? errores.map(e => e.mensaje || JSON.stringify(e)).join(' | ')
        : `Dátil estado: ${estado}`;
      return res.status(422).json({ error: mensajes, estado, detalle: data });
    }

    const autorizacion = data.clave_acceso
      || data.autorizacion?.numero
      || (typeof data.autorizacion === 'string' ? data.autorizacion : '')
      || '';

    if (!autorizacion) {
      const errores  = data.errores || data.errors || [];
      const mensajes = Array.isArray(errores) && errores.length > 0
        ? errores.map(e => e.mensaje || JSON.stringify(e)).join(' | ')
        : 'NC no autorizada por el SRI';
      return res.status(422).json({ error: mensajes, detalle: data });
    }

    return res.status(200).json({
      ok:          true,
      datil_id:    data.id      || '',
      autorizacion,
      pdf_url:     data.pdf     || data.pdf_url || '',
      xml_url:     data.xml     || data.xml_url || '',
      subtotal,
      iva,
      total,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
