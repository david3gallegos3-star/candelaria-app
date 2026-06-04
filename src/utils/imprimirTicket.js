// src/utils/imprimirTicket.js
const EMPRESA   = 'EMBUTIDOS Y JAMONES CANDELARIA';
const RUC       = '1002345351001';
const DIRECCION = 'Ibarra, Imbabura, Ecuador';

function cuerpoTicket(f, detalle) {
  const fecha = new Date(f.created_at || new Date())
    .toLocaleString('es-EC', { timeZone: 'America/Guayaquil',
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit' });

  const filas = (detalle || []).map(d =>
    `<tr>
      <td style="padding:1px 0;max-width:110px;word-wrap:break-word">${d.descripcion || d.producto_nombre}</td>
      <td style="padding:1px 3px;text-align:right;white-space:nowrap">${parseFloat(d.cantidad||0).toFixed(3)}</td>
      <td style="padding:1px 3px;text-align:right;white-space:nowrap">$${parseFloat(d.precio_unitario||0).toFixed(4)}</td>
      <td style="padding:1px 0;text-align:right;white-space:nowrap">$${parseFloat(d.subtotal||0).toFixed(2)}</td>
    </tr>`
  ).join('');

  return `
    <div style="text-align:center;font-weight:bold;font-size:13px;margin-bottom:3px">${EMPRESA}</div>
    <div style="text-align:center;font-size:10px">RUC: ${RUC}</div>
    <div style="text-align:center;font-size:10px">${DIRECCION}</div>
    <div style="border-top:1px dashed #000;margin:5px 0"></div>
    <div style="font-size:11px"><b>${f.tipo === 'nota_venta' ? 'NOTA DE VENTA' : 'FACTURA'}:</b> ${f.numero || ''}</div>
    <div style="font-size:10px">Fecha: ${fecha}</div>
    <div style="font-size:10px">Cliente: ${f.cliente_nombre || f.cliente || 'CONSUMIDOR FINAL'}</div>
    <div style="font-size:10px">Vendedor: ${f.vendedor_nombre || f.vendedor || ''}</div>
    <div style="font-size:10px">Pago: ${f.forma_pago || ''}</div>
    <div style="border-top:1px dashed #000;margin:5px 0"></div>
    <table style="width:100%;font-size:10px;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:1px solid #000">
          <th style="text-align:left;padding:1px 0">PRODUCTO</th>
          <th style="text-align:right;padding:1px 3px">KG</th>
          <th style="text-align:right;padding:1px 3px">P/KG</th>
          <th style="text-align:right;padding:1px 0">TOTAL</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <div style="border-top:1px dashed #000;margin:5px 0"></div>
    <div style="display:flex;justify-content:space-between;font-size:11px"><span>Subtotal:</span><span>$${parseFloat(f.subtotal||0).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:11px"><span>IVA 15%:</span><span>$${parseFloat(f.iva||0).toFixed(2)}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;margin-top:3px"><span>TOTAL:</span><span>$${parseFloat(f.total||0).toFixed(2)}</span></div>
    ${f.autorizacion_sri
      ? `<div style="font-size:8px;margin-top:5px;word-break:break-all">Auth SRI: ${f.autorizacion_sri}</div>`
      : ''}
    <div style="border-top:1px dashed #000;margin:5px 0"></div>
    <div style="text-align:center;font-size:10px">¡Gracias por su compra!</div>
  `;
}

function generarHtml(cuerpo, paraQzTray = false) {
  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <style>
      @page { size: 80mm auto; margin: 3mm 4mm; }
      body { font-family: 'Courier New', monospace; width: 72mm; margin: 0; padding: 0; }
    </style>
  </head><body>
    <div>${cuerpo}</div>
    <div style="border-top:2px dashed #000;margin:10px 0;text-align:center;font-size:9px;letter-spacing:2px">COPIA CLIENTE</div>
    <div>${cuerpo}</div>
    <div style="border-top:2px dashed #000;margin:10px 0;text-align:center;font-size:9px;letter-spacing:2px">COPIA EMPRESA</div>
    ${paraQzTray ? '' : '<script>setTimeout(function(){ window.print(); }, 400);<\/script>'}
  </body></html>`;
}

async function imprimirConQzTray(html) {
  const qz = window.qz;
  if (!qz) return false;

  try {
    // Certificado firmado — permite recordar permisos en QZ Tray
    qz.security.setCertificatePromise((resolve, reject) => {
      fetch('/qz-certificate.pem')
        .then(r => r.text())
        .then(resolve)
        .catch(reject);
    });
    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
      fetch('/api/qz-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toSign }),
      })
        .then(r => r.json())
        .then(d => resolve(d.signature))
        .catch(reject);
    });

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({ retries: 1, delay: 0.5 });
    }

    const printer = await qz.printers.getDefault();
    const config  = qz.configs.create(printer, {
      size:    { width: 80, height: null },
      units:   'mm',
      margins: { top: 3, right: 4, bottom: 3, left: 4 },
      copies:  1, // El HTML ya incluye las 2 copias
    });

    await qz.print(config, [{ type: 'html', format: 'plain', data: html }]);
    return true;
  } catch (e) {
    console.warn('QZ Tray no disponible, usando ventana del navegador:', e.message);
    return false;
  }
}

export async function imprimirTicket(factura, detalle) {
  const cuerpo = cuerpoTicket(factura, detalle);

  // Intentar QZ Tray primero (impresión directa sin diálogo)
  const htmlQz = generarHtml(cuerpo, true);
  const usóQz  = await imprimirConQzTray(htmlQz);

  // Fallback: ventana del navegador con window.print()
  if (!usóQz) {
    const html = generarHtml(cuerpo, false);
    const win  = window.open('', '_blank', 'width=380,height=600,left=200,top=100');
    if (!win) { alert('Permite ventanas emergentes para imprimir el ticket'); return; }
    win.document.write(html);
    win.document.close();
  }
}
