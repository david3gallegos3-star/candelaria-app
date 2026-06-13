// src/utils/imprimirTicket.js
const EMPRESA   = 'EMBUTIDOS Y JAMONES CANDELARIA';
const RUC       = '1002345351001';
const DIRECCION = 'Ibarra, Imbabura, Ecuador';
const ANCHO     = 40; // ancho en caracteres del papel (ajustar si la impresora corta o sobra espacio)

// Quita tildes, ñ y ¡¿ porque la tabla de caracteres de la impresora térmica
// no las soporta y las muestra como símbolos chinos / corta el texto.
const TILDES = {
  á:'a', é:'e', í:'i', ó:'o', ú:'u', Á:'A', É:'E', Í:'I', Ó:'O', Ú:'U',
  ñ:'n', Ñ:'N', ü:'u', Ü:'U', '¡':'', '¿':'',
};
function limpiarTexto(s) {
  return String(s ?? '').replace(/[áéíóúÁÉÍÓÚñÑüÜ¡¿]/g, c => TILDES[c]);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pad(str, len) {
  str = limpiarTexto(str);
  return str.length > len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padNum(str, len) {
  str = String(str ?? '');
  return str.length > len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

function centrar(str, ancho) {
  str = limpiarTexto(str);
  if (str.length >= ancho) return str.slice(0, ancho);
  const totalPad = ancho - str.length;
  const izq = Math.floor(totalPad / 2);
  return ' '.repeat(izq) + str + ' '.repeat(totalPad - izq);
}

function wrap(str, ancho) {
  str = String(str ?? '');
  const lineas = [];
  for (let i = 0; i < str.length; i += ancho) lineas.push(str.slice(i, i + ancho));
  return lineas.join('\n');
}

function filaTotal(label, valor) {
  const v = `$${parseFloat(valor || 0).toFixed(2)}`;
  return pad(label, ANCHO - v.length) + v;
}

function filasProductos(detalle) {
  const ANCHO_DESC = 16;
  let out = pad('PRODUCTO', ANCHO_DESC) + ' ' + padNum('CANT', 6) + ' ' + padNum('P/UNIT', 7) + ' ' + padNum('TOTAL', 8) + '\n';
  for (const d of (detalle || [])) {
    const desc  = limpiarTexto(d.descripcion || d.producto_nombre || '');
    const cant  = parseFloat(d.cantidad || 0).toFixed(3);
    const pUnit = `$${parseFloat(d.precio_unitario || 0).toFixed(2)}`;
    const sub   = `$${parseFloat(d.subtotal || 0).toFixed(2)}`;

    const partes = [];
    for (let i = 0; i < desc.length; i += ANCHO_DESC) partes.push(desc.slice(i, i + ANCHO_DESC));
    if (!partes.length) partes.push('');

    out += pad(partes[0], ANCHO_DESC) + ' ' + padNum(cant, 6) + ' ' + padNum(pUnit, 7) + ' ' + padNum(sub, 8) + '\n';
    for (let i = 1; i < partes.length; i++) out += partes[i] + '\n';
  }
  return out;
}

function cuerpoTicket(f, detalle) {
  const fecha = new Date(f.created_at || new Date())
    .toLocaleString('es-EC', { timeZone: 'America/Guayaquil',
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit' });

  const linea = '-'.repeat(ANCHO);
  let out = '';
  out += centrar(EMPRESA, ANCHO) + '\n';
  out += centrar(`RUC: ${RUC}`, ANCHO) + '\n';
  out += centrar(DIRECCION, ANCHO) + '\n';
  out += linea + '\n';
  out += `${f.tipo === 'nota_venta' ? 'NOTA DE VENTA' : 'FACTURA'}: ${f.numero || ''}\n`;
  out += `Fecha: ${fecha}\n`;
  out += `Cliente: ${limpiarTexto(f.cliente_nombre || f.cliente || 'CONSUMIDOR FINAL')}\n`;
  out += `Vendedor: ${limpiarTexto(f.vendedor_nombre || f.vendedor || '')}\n`;
  out += `Pago: ${limpiarTexto(f.forma_pago || '')}\n`;
  out += linea + '\n';
  out += filasProductos(detalle);
  out += linea + '\n';
  out += filaTotal('Subtotal:', f.subtotal) + '\n';
  out += filaTotal('IVA 15%:', f.iva) + '\n';
  out += filaTotal('TOTAL:', f.total) + '\n';
  if (f.autorizacion_sri) {
    out += linea + '\n';
    out += 'Auth SRI:\n';
    out += wrap(f.autorizacion_sri, ANCHO) + '\n';
  }
  out += linea + '\n';
  out += centrar('GRACIAS POR SU COMPRA', ANCHO) + '\n';
  out += ' \n'.repeat(4);
  out += pad('Firma:', 7) + '_'.repeat(ANCHO - 7) + '\n';
  out += centrar(limpiarTexto(f.cliente_nombre || f.cliente || 'CONSUMIDOR FINAL'), ANCHO) + '\n';
  const cedula = f.cliente_ruc || f.cliente_cedula;
  if (cedula && cedula !== '9999999999999') {
    out += centrar(`CI/RUC: ${cedula}`, ANCHO) + '\n';
  }
  return out;
}

// repetir = veces que se imprime el set completo (Nota/Factura + COPIA CLIENTE + COPIA EMPRESA)
function generarHtml(cuerpo, repetir = 1) {
  const sepCliente = '='.repeat(ANCHO) + '\n' + centrar('COPIA CLIENTE', ANCHO) + '\n' + '='.repeat(ANCHO);
  const sepEmpresa = '='.repeat(ANCHO) + '\n' + centrar('COPIA EMPRESA', ANCHO) + '\n' + '='.repeat(ANCHO);

  let copias = '';
  for (let i = 0; i < repetir; i++) {
    copias += `<pre>${escapeHtml(cuerpo)}</pre>`;
    copias += `<pre style="margin-top:6px">${escapeHtml(sepCliente)}</pre>`;
    copias += `<pre>${escapeHtml(cuerpo)}</pre>`;
    copias += `<pre style="margin-top:6px">${escapeHtml(sepEmpresa)}</pre>`;
  }

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <style>
      @page { size: 80mm auto; margin: 3mm 4mm; }
      body { font-family: 'Courier New', monospace; width: 72mm; margin: 0; padding: 0; font-size: 11px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
    </style>
  </head><body>
    ${copias}
    <pre>${' \n'.repeat(9)}</pre>
    <script>setTimeout(function(){ window.print(); }, 400);<\/script>
  </body></html>`;
}

export const QZ_PRINTER_KEY = 'qz_printer_name';

// Certificado firmado + firma — permite recordar permisos en QZ Tray
function configurarSeguridadQz(qz) {
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
}

async function conectarQz(qz) {
  configurarSeguridadQz(qz);
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 1, delay: 0.5 });
  }
}

// Lista las impresoras disponibles en esta PC (para el selector de impresora)
export async function listarImpresorasQz() {
  const qz = window.qz;
  if (!qz) throw new Error('QZ Tray no está disponible');
  await conectarQz(qz);
  return qz.printers.find();
}

// repetir = veces que se imprime el set completo (Nota/Factura + COPIA CLIENTE + COPIA EMPRESA)
// Cada copia (CLIENTE/EMPRESA) sale como ticket separado, con su propio corte de papel.
export function generarTextoQz(cuerpo, repetir = 1) {
  const sepCliente = '='.repeat(ANCHO) + '\n' + centrar('COPIA CLIENTE', ANCHO) + '\n' + '='.repeat(ANCHO) + '\n';
  const sepEmpresa = '='.repeat(ANCHO) + '\n' + centrar('COPIA EMPRESA', ANCHO) + '\n' + '='.repeat(ANCHO) + '\n';
  const CORTE   = '\x1D\x56\x00'; // GS V 0 - corte total de papel
  const ESPACIO = ' \n'.repeat(8);

  let texto = '\x1B\x40'; // ESC @ - inicializar impresora
  for (let i = 0; i < repetir; i++) {
    texto += cuerpo + sepCliente + ESPACIO + CORTE;
    texto += cuerpo + sepEmpresa + ESPACIO + CORTE;
  }

  return [texto];
}

async function imprimirConQzTray(cuerpo, repetir) {
  const qz = window.qz;
  if (!qz) return false;

  try {
    await conectarQz(qz);

    const guardada = localStorage.getItem(QZ_PRINTER_KEY);
    const printer  = guardada || await qz.printers.getDefault();
    const config   = qz.configs.create(printer);

    await qz.print(config, generarTextoQz(cuerpo, repetir));
    return true;
  } catch (e) {
    console.warn('QZ Tray no disponible, usando ventana del navegador:', e.message);
    return false;
  }
}

export async function imprimirTicket(factura, detalle, opciones = {}) {
  const cuerpo  = cuerpoTicket(factura, detalle);
  const repetir = opciones.copiaExtra ? 2 : 1;

  // Intentar QZ Tray primero (impresión directa sin diálogo)
  const usóQz = await imprimirConQzTray(cuerpo, repetir);

  // Fallback: ventana del navegador con window.print()
  if (!usóQz) {
    const html = generarHtml(cuerpo, repetir);
    const win  = window.open('', '_blank', 'width=380,height=600,left=200,top=100');
    if (!win) { alert('Permite ventanas emergentes para imprimir el ticket'); return; }
    win.document.write(html);
    win.document.close();
  }
}
