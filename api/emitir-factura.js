// ============================================
// api/emitir-factura.js
// Envía factura a Dátil → SRI Ecuador
// ============================================

const DATIL_URL = 'https://link.datil.co/invoices/issue';

const MEDIO_PAGO = {
  efectivo:      'efectivo',
  transferencia: 'transferencia',
  cheque:        'cheque',
  credito:       'tarjeta_credito',
};

function tipoIdentificacion(id) {
  if (!id || id === '9999999999999') return '07'; // consumidor final
  const limpio = id.replace(/[^0-9]/g, '');
  if (limpio.length === 13) return '04'; // RUC
  if (limpio.length === 10) return '05'; // cédula
  return '06';                            // pasaporte
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { cliente, items, formaPago, diasCredito, observaciones, vendedor, secuencial } = req.body;

  if (!items || items.length === 0)
    return res.status(400).json({ error: 'Sin productos en la factura' });

  // Totales
  const subtotal    = parseFloat(items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0).toFixed(2));
  const iva         = parseFloat((subtotal * 0.15).toFixed(2));
  const total       = parseFloat((subtotal + iva).toFixed(2));

  // Fecha y secuencial
  const fechaHoy      = new Date().toISOString().split('T')[0];
  const secuencialStr = String(secuencial).padStart(9, '0');

  const payload = {
    ambiente:       1,   // 1=pruebas · 2=producción
    tipo_emision:   1,
    secuencial:     secuencialStr,
    fecha_emision:  fechaHoy,

    emisor: {
      ruc:                    '1004007884001',
      obligado_contabilidad:  false,
      contribuyente_especial: '',
      nombre_comercial:       'Embutidos y Jamones Candelaria',
      razon_social:           'Embutidos y Jamones Candelaria',
      direccion:              'Ibarra, Imbabura, Ecuador',
      establecimiento: {
        punto_emision: '001',
        codigo:        '001',
        direccion:     'Ibarra, Imbabura, Ecuador'
      }
    },

    moneda: 'USD',

    informacion_adicional: {
      ...(vendedor      && { Vendedor:      vendedor      }),
      ...(observaciones && { Observaciones: observaciones }),
    },

    totales: {
      total_sin_impuestos: subtotal,
      impuestos: [{
        codigo:            '2',
        codigo_porcentaje: '4',   // 15% IVA (desde mayo 2024)
        base_imponible:    subtotal,
        valor:             iva
      }],
      descuento:     0,
      propina:       0,
      importe_total: total
    },

    comprador: {
      razon_social:        cliente.nombre || 'CONSUMIDOR FINAL',
      identificacion:      cliente.ruc    || '9999999999999',
      tipo_identificacion: tipoIdentificacion(cliente.ruc),
      email:               cliente.email      || '',
      telefono:            cliente.telefono   || '',
      direccion:           cliente.direccion  || ''
    },

    items: items.map((item, idx) => {
      const sub   = parseFloat(parseFloat(item.subtotal || 0).toFixed(2));
      const ivaIt = parseFloat((sub * 0.15).toFixed(2));
      return {
        cantidad:                   parseFloat(item.cantidad),
        codigo_principal:           String(idx + 1).padStart(3, '0'),
        precio_unitario:            parseFloat(parseFloat(item.precio_unitario).toFixed(4)),
        descripcion:                item.descripcion || item.producto_nombre,
        precio_total_sin_impuestos: sub,
        impuestos: [{
          codigo:            '2',
          codigo_porcentaje: '4',
          tarifa:            15,
          base_imponible:    sub,
          valor:             ivaIt
        }],
        descuento: 0
      };
    }),

    pagos: [{
      medio: MEDIO_PAGO[formaPago] || '01',
      total
    }]
  };

  try {
    const datilRes = await fetch(DATIL_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Key':        process.env.DATIL_API_KEY,
        'X-Password':   process.env.DATIL_PASSWORD
      },
      body: JSON.stringify(payload)
    });

    const data = await datilRes.json();

    if (!datilRes.ok) {
      // Extraer mensajes legibles del error Dátil
      const errores = data?.errores || data?.errors || data?.mensaje || data;
      const mensajes = Array.isArray(errores)
        ? errores.map(e => `[${e.campo || e.field || ''}] ${e.mensaje || e.message || JSON.stringify(e)}`).join(' | ')
        : JSON.stringify(errores);
      console.error('DATIL ERROR:', JSON.stringify(data, null, 2));
      return res.status(400).json({ error: mensajes || 'Error Dátil/SRI', detalle: data });
    }

    return res.status(200).json({
      ok:           true,
      datil_id:     data.id                              || '',
      autorizacion: data.autorizacion?.numero
                    || data.autorizacion
                    || data.id                           || '',
      pdf_url:      data.pdf     || data.pdf_url         || '',
      xml_url:      data.xml     || data.xml_url         || '',
      subtotal,
      iva,
      total
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
