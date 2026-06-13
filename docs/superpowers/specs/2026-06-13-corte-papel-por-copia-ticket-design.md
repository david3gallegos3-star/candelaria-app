# Corte de papel entre cada copia del ticket (QZ Tray)

## Problema

`src/utils/imprimirTicket.js`, función `generarTextoQz(cuerpo, repetir)`, arma un único texto ESC/POS con todos los bloques (cuerpo + "COPIA CLIENTE" / "COPIA EMPRESA", repetidos `repetir` veces) y ejecuta el comando de corte total (`GS V 0` = `\x1D\x56\x00`) **una sola vez al final**.

Resultado: todas las copias salen en una sola tira continua de papel, sin cortes entre ellas (ver foto de referencia: NOTA DE VENTA + COPIA CLIENTE + NOTA DE VENTA + COPIA EMPRESA, todo de un solo tirón).

## Objetivo

Cada copia (CLIENTE, EMPRESA) sale como un ticket físico separado, con su propio corte de papel:

- `repetir = 1` (reimpresión desde `TabFacturas.js`) → 2 bloques → **2 cortes**.
- `repetir = 2` (`copiaExtra: true`, emisión desde `TabNuevaVenta.js`) → 4 bloques → **4 cortes**.

## Diseño

### `generarTextoQz(cuerpo, repetir)` — `src/utils/imprimirTicket.js`

Reemplazar la construcción actual:

```js
function generarTextoQz(cuerpo, repetir = 1) {
  const sepCliente = '='.repeat(ANCHO) + '\n' + centrar('COPIA CLIENTE', ANCHO) + '\n' + '='.repeat(ANCHO) + '\n';
  const sepEmpresa = '='.repeat(ANCHO) + '\n' + centrar('COPIA EMPRESA', ANCHO) + '\n' + '='.repeat(ANCHO) + '\n';

  let texto = '\x1B\x40';
  for (let i = 0; i < repetir; i++) {
    texto += cuerpo + sepCliente + cuerpo + sepEmpresa;
  }
  texto += ' \n'.repeat(9);
  texto += '\x1D\x56\x00';

  return [texto];
}
```

por una versión que agrega el corte (`\x1D\x56\x00`, precedido por 2 líneas en blanco) después de cada bloque:

```js
function generarTextoQz(cuerpo, repetir = 1) {
  const sepCliente = '='.repeat(ANCHO) + '\n' + centrar('COPIA CLIENTE', ANCHO) + '\n' + '='.repeat(ANCHO) + '\n';
  const sepEmpresa = '='.repeat(ANCHO) + '\n' + centrar('COPIA EMPRESA', ANCHO) + '\n' + '='.repeat(ANCHO) + '\n';
  const CORTE   = '\x1D\x56\x00'; // GS V 0 - corte total de papel
  const ESPACIO = ' \n'.repeat(2);

  let texto = '\x1B\x40'; // ESC @ - inicializar impresora
  for (let i = 0; i < repetir; i++) {
    texto += cuerpo + sepCliente + ESPACIO + CORTE;
    texto += cuerpo + sepEmpresa + ESPACIO + CORTE;
  }

  return [texto];
}
```

### Edge cases

- `repetir = 1`: 2 bloques, 2 cortes.
- `repetir = 2` (`copiaExtra`): 4 bloques, 4 cortes (mismo contenido repetido, igual que hoy).
- Cada corte va precedido por 2 líneas en blanco (`' \n'.repeat(2)`) para que el cortador no corte sobre el texto.

## Fuera de alcance

- `generarHtml` (fallback cuando QZ Tray no está disponible): `window.print()` no soporta comandos de corte de impresora — queda sin cambios.
- `cuerpoTicket`, `filasProductos`, demás funciones de formato del ticket: sin cambios.
