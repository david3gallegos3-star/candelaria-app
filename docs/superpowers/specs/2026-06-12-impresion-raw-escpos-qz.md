# Impresión raw ESC/POS para QZ Tray — Spec

## Problema

En PCs donde la impresora térmica está instalada con un driver genérico sin soporte de gráficos (ej. "Generic / Text Only", solo papel A4), `imprimirConQzTray` (en `src/utils/imprimirTicket.js`) usa `type: 'pixel', format: 'html'` para imprimir el ticket como imagen en papel de 80mm. Ese driver acepta el trabajo (aparece un instante en la cola de Windows y luego desaparece) pero no logra mandar nada útil a la impresora física, porque no puede renderizar gráficos ni maneja el tamaño 80mm — resultado: no imprime nada.

Un programa antiguo, en esa misma PC y con esa misma impresora, imprime y corta el papel correctamente — usando el protocolo de texto crudo ESC/POS, que ese driver sí soporta (pasa los bytes directo al puerto de la impresora).

## Solución

Cambiar el modo de impresión de QZ Tray de "imagen HTML" a "texto crudo ESC/POS".

### `src/utils/imprimirTicket.js`

- Nueva función `generarTextoQz(cuerpo, repetir)`:
  - Devuelve un array de strings para `qz.print()`.
  - Empieza con `'\x1B\x40'` (ESC @, comando de inicialización).
  - Por cada repetición (`repetir` veces): `cuerpo` + separador "COPIA CLIENTE" + `cuerpo` + separador "COPIA EMPRESA" (mismos separadores de texto que ya construye `generarHtml`, sin escapar HTML).
  - Al final: 9 saltos de línea (igual cantidad que hoy, para que el papel avance) + `'\x1D\x56\x00'` (GS V 0, comando de corte de papel).

- `imprimirConQzTray(cuerpo, repetir)` — cambia su firma (antes recibía `html`):
  - `qz.configs.create(printer)` — sin `size`, `units` ni `margins` (esas opciones eran solo para el modo imagen).
  - `qz.print(config, generarTextoQz(cuerpo, repetir))`.
  - El resto de la lógica (conectar, impresora guardada/default, try/catch con fallback a `console.warn` + `return false`) no cambia.

- `generarHtml(cuerpo, repetir)`:
  - Pierde el parámetro `paraQzTray` (ya no se usa, solo queda para el fallback del navegador).
  - El `<script>setTimeout(...) window.print()...</script>` se incluye siempre.

- `imprimirTicket(factura, detalle, opciones)`:
  - Ya no genera `htmlQz`. Llama directamente `await imprimirConQzTray(cuerpo, repetir)`.
  - Si `imprimirConQzTray` devuelve `false`, genera `generarHtml(cuerpo, repetir)` para el fallback del navegador (igual que hoy).

## Manejo de errores

No cambia: si `qz.print()` falla, se captura, se loguea con `console.warn`, y se hace fallback a ventana del navegador — igual que hoy.

## Testing

Igual que hoy: no es testeable con jest/jsdom (depende de `window.qz` real). Verificación manual:

1. PC nueva (driver "Generic / Text Only"): imprimir un ticket, confirmar que sale impreso y corta el papel.
2. PC personal (donde el modo imagen ya funcionaba): imprimir un ticket, confirmar que sigue saliendo bien formateado y corta el papel.
3. Si el corte de papel no funciona en alguna PC, probar reemplazar `'\x1D\x56\x00'` por `'\x1B\x69'` (comando de corte alternativo, más antiguo, ampliamente soportado).

## Fuera de alcance

- No se hace configurable por PC (modo imagen vs texto crudo) — si en el futuro alguna PC necesita el modo imagen, se evalúa entonces.
- No se cambia el fallback del navegador (`generarHtml` con `window.print()`).
- No se resuelve aquí ningún tema adicional de certificados/confianza de QZ Tray.
