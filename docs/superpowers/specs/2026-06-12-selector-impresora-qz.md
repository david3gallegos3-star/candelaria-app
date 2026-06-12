# Selector de impresora QZ Tray — Spec

## Problema

`imprimirConQzTray` (en `src/utils/imprimirTicket.js`) usa siempre `qz.printers.getDefault()`, es decir, la impresora predeterminada de Windows. En PCs donde la predeterminada de Windows no es la térmica, la impresión falla o sale por la impresora equivocada. Cada PC debe poder elegir su propia impresora térmica sin depender de la configuración de Windows.

## Solución

Agregar un selector de impresora persistido en `localStorage` (por dispositivo/navegador), accesible desde un botón en el header del módulo de Facturación.

### 1. `src/utils/imprimirTicket.js`

- Extraer la configuración de seguridad de QZ Tray (certificado + firma) actualmente dentro de `imprimirConQzTray` a una función interna compartida, p.ej. `configurarSeguridadQz(qz)`.
- Agregar export `listarImpresorasQz()`:
  - Verifica `window.qz` exista.
  - Llama `configurarSeguridadQz(qz)`.
  - Conecta el websocket si no está activo (`qz.websocket.connect({ retries: 1, delay: 0.5 })`).
  - Devuelve `await qz.printers.find()` (array de nombres de impresora).
  - Si algo falla, lanza el error (el caller lo maneja).
- En `imprimirConQzTray`, sustituir:
  ```js
  const printer = await qz.printers.getDefault();
  ```
  por:
  ```js
  const guardada = localStorage.getItem('qz_printer_name');
  const printer  = guardada || await qz.printers.getDefault();
  ```

### 2. `src/components/facturacion/SelectorImpresora.js` (nuevo)

Modal que:
- Al montarse, llama `listarImpresorasQz()`.
- Mientras carga: muestra "Buscando impresoras...".
- Si tiene éxito: dropdown `<select>` con:
  - Opción "Predeterminada del sistema" (value `""`).
  - Una opción por cada impresora detectada.
  - Preselecciona el valor guardado en `localStorage.getItem('qz_printer_name')` (o `""` si no hay nada guardado / el valor guardado ya no está en la lista).
- Si falla: mensaje "No se pudo conectar con QZ Tray. Verifica que esté abierto." + botón "Reintentar" (vuelve a llamar `listarImpresorasQz()`).
- Botones "Cancelar" (cierra sin guardar) y "Guardar":
  - Si seleccionó "Predeterminada del sistema" → `localStorage.removeItem('qz_printer_name')`.
  - Si seleccionó una impresora → `localStorage.setItem('qz_printer_name', nombreSeleccionado)`.
  - Cierra el modal.

Estilo visual: seguir el patrón de modales existentes en la app (overlay `position: fixed, inset: 0, background: rgba(0,0,0,0.5)`, tarjeta blanca centrada con `borderRadius`, como en `FacturasPersonales.js`).

### 3. `src/components/facturacion/FacturacionHeader.js`

- Agregar estado local `selectorImpresoraAbierto` (useState).
- Agregar botón "🖨️" en la fila superior (junto a "🏠 Menú" / "← Volver"), que pone `selectorImpresoraAbierto = true`.
- Renderizar `<SelectorImpresora onClose={() => setSelectorImpresoraAbierto(false)} />` cuando `selectorImpresoraAbierto` es `true`.

## Manejo de errores

- Si QZ Tray no está instalado/abierto o el certificado no es confiable, `listarImpresorasQz()` lanza un error. El modal lo captura y muestra el mensaje de error + "Reintentar", sin romper el resto de la app.
- Cerrar el modal sin guardar no cambia nada — la impresión sigue usando lo que ya estuviera en `localStorage` (o el fallback `getDefault()`).

## Testing

Esta funcionalidad depende de `window.qz` (inyectado por QZ Tray) y `localStorage` del navegador real — no es testeable de forma significativa con jest/jsdom, igual que el resto de `imprimirTicket.js` (que ya no tiene tests). La verificación es manual: abrir el modal en una PC con QZ Tray corriendo, confirmar que lista impresoras, guardar una, e imprimir un ticket para confirmar que sale por esa impresora.

## Fuera de alcance

- No se modifica la configuración de Windows.
- No se sincroniza la preferencia entre dispositivos (es intencionalmente por `localStorage`, por PC).
- No se resuelve aquí el problema separado de "Untrusted website / Remember this decision" en QZ Tray — es un tema de confianza de certificado independiente.
