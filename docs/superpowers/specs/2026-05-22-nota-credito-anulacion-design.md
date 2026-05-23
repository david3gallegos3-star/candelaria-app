# Spec: Anulación de facturas autorizadas — Anulación manual y Nota de Crédito SRI

**Fecha:** 2026-05-22
**Módulo:** Facturación (`src/components/facturacion/TabFacturas.js`)

---

## Contexto

Las facturas electrónicas ya autorizadas por el SRI no se pueden borrar. Actualmente la app marca la factura como `anulada` solo internamente (Supabase), sin notificar al SRI. La contadora debe hacer la anulación manualmente en el portal SRI o emitir una nota de crédito, pero el sistema no registra eso correctamente ni revierte inventario ni contabilidad de forma consistente.

---

## Alcance

Dos flujos de anulación para facturas con `estado: 'autorizada'`:

1. **Anulación manual** — cuando la contadora ya anuló en el portal SRI
2. **Nota de Crédito electrónica vía Dátil** — para errores de precio o devoluciones que deben constar en el SRI

Las notas de venta mantienen su flujo actual (interno, sin SRI).

---

## Flujo 1 — Anulación Manual

### Cuándo se usa
La contadora ingresó al portal del SRI y anuló la factura directamente. Viene al sistema a registrar esa acción para mantener la contabilidad en orden.

### UI
Botón **"📋 Anulación manual"** en la fila de cada factura `autorizada`.

### Modal
1. **Motivo** (texto libre) — obligatorio
2. **¿Qué hacer con el producto?** — tres opciones de radio:
   - **No aplica** — fue error de tipificación, sin devolución física
   - **Reingresar al inventario** — tabla con ítems de la factura; usuario edita cantidad a reingresar por ítem (puede ser parcial)
   - **Registrar como pérdida** — campo de texto: motivo de la pérdida (dañado, vencido, no recuperable, etc.)

### Acciones al confirmar
1. Marca factura como `anulada` en Supabase
2. Cancela cuentas por cobrar pendientes (`estado → 'anulada'`)
3. Revierte asiento contable de la factura
4. Si **reingresar inventario**: inserta movimiento de entrada en `inventario_movimientos` por cada ítem seleccionado
5. Si **pérdida**: inserta registro en tabla `perdidas` con motivo, ítems, monto total y referencia a la factura
6. No llama a Dátil — el SRI ya fue notificado manualmente

---

## Flujo 2 — Nota de Crédito electrónica (Dátil → SRI)

### Cuándo se usa
Error en precio, cantidad incorrecta, o devolución de producto donde el SRI debe recibir el documento de crédito formalmente.

### UI
Botón **"📄 Nota de Crédito"** en la fila de cada factura `autorizada`.

### Modal
1. **Motivo** (dropdown): Error en precio / Devolución de producto / Otro
2. **Tipo de nota de crédito**:
   - **Total** — cubre el monto completo de la factura
   - **Parcial** — muestra tabla con ítems de la factura; usuario edita cantidad y monto a acreditar por ítem
3. **¿Qué hacer con el producto devuelto?** — tres opciones de radio:
   - **No aplica** — fue error de precio, sin devolución física
   - **Reingresar al inventario** — tabla de ítems; usuario edita cantidad a reingresar
   - **Registrar como pérdida** — campo texto: motivo de pérdida

### Acciones al confirmar
1. Llama a `POST /api/emitir-nota-credito` con payload completo
2. Dátil emite la NC electrónica al SRI
3. SRI devuelve código de autorización (49 dígitos)
4. Guarda la NC en tabla `notas_credito` con `autorizacion_sri` y `datil_id`
5. Marca la factura original como `anulada`
6. Cancela cuentas por cobrar pendientes
7. Revierte asiento contable de la factura
8. Si **reingresar inventario**: inserta movimiento de entrada en `inventario_movimientos`
9. Si **pérdida**: inserta registro en `perdidas`
10. Muestra código de autorización SRI al usuario

---

## Nuevo endpoint: `api/emitir-nota-credito.js`

**URL Dátil:** `https://link.datil.co/credit-notes/issue`

**Parámetros recibidos del frontend:**
- `factura_id` — para cargar datos del comprador y items desde Supabase
- `autorizacion_sri` — clave_acceso de 49 dígitos de la factura original
- `numero_factura` — número de la factura original (ej: `001-001-000000042`)
- `fecha_emision_factura` — fecha de emisión de la factura original
- `motivo` — texto del motivo
- `tipo_motivo` — `'devolucion'` | `'error_precio'` | `'otro'`
- `items` — array de ítems a acreditar con `descripcion`, `cantidad`, `precio_unitario`, `subtotal`
- `secuencial` — número secuencial de la NC (autoincremental desde columna `nc_secuencial` en tabla `config_facturacion` de Supabase, mismo patrón que el secuencial de facturas)

**Payload a Dátil:**
```json
{
  "ambiente": 1,
  "tipo_emision": 1,
  "secuencial": "000000001",
  "fecha_emision": "2026-05-22",
  "emisor": { "...mismo que emitir-factura.js..." },
  "comprador": { "...datos del cliente..." },
  "documento_modificado": {
    "tipo": "01",
    "numero": "001-001-000000042",
    "fecha_emision": "2026-05-10",
    "numero_autorizacion": "...clave_acceso 49 dígitos..."
  },
  "motivo": "Devolución de producto dañado",
  "tipo": "01",  // 01=devolución, 02=anulación (error precio/tipificación), 03=descuento
  "totales": { "...calculados desde items..." },
  "items": [ "...ítems a acreditar..." ]
}
```

---

## Cambios en base de datos (Supabase)

### Tabla `notas_credito` — columnas nuevas
| Columna | Tipo | Descripción |
|---|---|---|
| `autorizacion_sri` | text | Clave de acceso SRI (49 dígitos), null si es manual |
| `datil_id` | text | ID en Dátil, null si es manual |
| `tipo_nc` | text | `'total'` o `'parcial'` |
| `es_manual` | boolean | true = anulación manual en portal SRI |
| `tipo_motivo` | text | `'devolucion'` \| `'error_precio'` \| `'otro'` |
| `items_nc` | jsonb | Array de ítems acreditados |
| `accion_producto` | text | `'no_aplica'` \| `'inventario'` \| `'perdida'` |
| `motivo_perdida` | text | Motivo si accion_producto = 'perdida' |

### Tabla `perdidas` — nueva
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `factura_id` | uuid | FK a facturas |
| `nota_credito_id` | uuid | FK a notas_credito, null si es anulación manual |
| `motivo` | text | Motivo de la pérdida |
| `items` | jsonb | Ítems perdidos con cantidades y montos |
| `total` | numeric | Monto total de la pérdida |
| `created_at` | timestamptz | Fecha de registro |
| `usuario_id` | uuid | FK a auth.users |

---

## Manejo de errores

- Si Dátil falla al emitir la NC: mostrar error, **no marcar la factura como anulada**, no revertir asiento — el usuario debe reintentar
- Si el reingreso al inventario falla: mostrar advertencia pero la NC/anulación ya está registrada — el usuario reingresa manualmente
- Si no hay `autorizacion_sri` en la factura: deshabilitar botón "Nota de Crédito" con tooltip explicativo

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `api/emitir-nota-credito.js` | Crear |
| `src/components/facturacion/TabFacturas.js` | Modificar — nuevos botones y modales |
| Supabase migrations | Nuevas columnas en `notas_credito`, nueva tabla `perdidas` |
