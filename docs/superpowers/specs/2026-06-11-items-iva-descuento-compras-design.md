# Items con IVA% y Descuento por línea en Compras — Design Spec

**Fecha:** 2026-06-11
**Estado:** Aprobado

## Problema

En "Compras" (empresa y personales) el IVA 15%, IVA 0% y descuento se ingresan como un solo valor global por factura. En la realidad, una misma factura puede tener items con distinto tratamiento: unos al 15%, otros al 0% (o cualquier otra tasa), y solo algunos items con descuento. Ejemplo real (factura Quimatec): 1 item, Subtotal $46.00, Base IVA 15% = $46.00, IVA = $6.90, Total = $52.90 — si hubiera un segundo item con IVA 0% o con descuento, el sistema actual no lo podría reflejar correctamente.

Además, "Facturas Personales" del Talonario no tiene lista de items — solo un campo "Monto" total.

## Solución

Cada item de una compra (empresa o personal) lleva ahora **Descuento ($)** e **IVA %** (por defecto 15%, editable a cualquier valor vía un toggle "IVA diferente"). El resumen de la factura (Base IVA15, Base IVA0, otras bases, Descuento total, IVA total, Total) se **calcula** sumando los items — ya no se ingresa manualmente.

Cálculo por item:
```
base_item = subtotal - descuento
iva_item  = base_item × (iva_pct / 100)
```

Resumen de la factura:
- `base_iva15` = Σ base_item donde iva_pct = 15
- `base_iva0`  = Σ base_item donde iva_pct = 0
- Para cualquier otra tasa presente (ej. 5%), se muestra una línea adicional "Base IVA {pct}%"
- `descuento` = Σ descuento_item
- `iva`       = Σ iva_item (correcto sin importar la tasa)
- `total`     = Σ subtotal − descuento + iva

**Descuento e inventario:** el descuento reduce la base imponible (igual que en el SRI), pero **no** modifica `precio_kg` (precio de referencia guardado en `materias_primas`) ni el `subtotal` usado para costeo — esos siguen siendo cantidad × precio/kg tal cual se ingresan.

---

## 1. Base de datos

```sql
ALTER TABLE compras_detalle ADD COLUMN IF NOT EXISTS descuento numeric DEFAULT 0;
ALTER TABLE compras_detalle ADD COLUMN IF NOT EXISTS iva_pct numeric DEFAULT 15;
-- materia_prima_id debe ser nullable (items de "compra personal" no tienen materia prima)
ALTER TABLE compras_detalle ALTER COLUMN materia_prima_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS talonario_facturas_personales_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES talonario_facturas_personales(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  monto numeric NOT NULL DEFAULT 0,
  descuento numeric DEFAULT 0,
  iva_pct numeric DEFAULT 15,
  orden int DEFAULT 0
);

ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS base_iva15 numeric DEFAULT 0;
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS base_iva0  numeric DEFAULT 0;
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS iva        numeric DEFAULT 0;
ALTER TABLE talonario_facturas_personales ADD COLUMN IF NOT EXISTS descuento  numeric DEFAULT 0;
```

---

## 2. Utilidad compartida — `src/utils/comprasCalc.js`

```js
export function calcularResumenItems(items) {
  let baseIva15 = 0, baseIva0 = 0, descuentoTotal = 0, ivaTotal = 0, subtotalTotal = 0;
  const otrasBases = {}; // { [pct]: monto }

  for (const it of items) {
    const subtotal  = parseFloat(it.subtotal ?? it.monto) || 0;
    const descuento = parseFloat(it.descuento) || 0;
    const ivaPct    = parseFloat(it.iva_pct ?? 15);
    const base      = Math.max(0, subtotal - descuento);
    const iva       = parseFloat((base * ivaPct / 100).toFixed(2));

    subtotalTotal  += subtotal;
    descuentoTotal += descuento;
    ivaTotal       += iva;

    if (ivaPct === 15) baseIva15 += base;
    else if (ivaPct === 0) baseIva0 += base;
    else otrasBases[ivaPct] = (otrasBases[ivaPct] || 0) + base;
  }

  const total = subtotalTotal - descuentoTotal + ivaTotal;
  return { subtotalTotal, descuentoTotal, ivaTotal, baseIva15, baseIva0, otrasBases, total };
}
```

Usada por `TabIngresoCompra.js` y `FacturasPersonales.js`.

---

## 3. TabIngresoCompra.js (Compras empresa)

### 3a. Modo empresa (esPersonal = false) — igual que ahora + 2 columnas

Tabla de materiales agrega, solo si `tieneFactura`: **Descuento ($)** e **IVA** (badge "15%" con botón ✏️ que lo convierte en input numérico para cualquier tasa).

`itemVacio()`:
```js
const itemVacio = () => ({
  materia_prima_id: '', mp_nombre: '',
  cantidad_kg: '', precio_kg: '', subtotal: 0,
  precio_anterior: 0, inv_id: '',
  descuento: '', iva_pct: 15, ivaDiferente: false,
});
```

### 3b. Modo personal (esPersonal = true) — items genéricos

- Título de la sección cambia: "📦 Materiales recibidos" → **"📄 Items de la factura"**
- Columnas: `DESCRIPCIÓN | MONTO | DESCUENTO | IVA`
- Item vacío: `{ descripcion: '', monto: '', descuento: '', iva_pct: 15, ivaDiferente: false }`
- Estos items **no** generan `materia_prima_id`/`inv_id`/movimientos de inventario

### 3c. Toggle "Compra personal" con confirmación

Si la lista de items tiene datos (`materia_prima_id`/`descripcion` o `cantidad_kg`/`monto` no vacíos) y el usuario cambia el checkbox "Compra personal" (en cualquier dirección), mostrar `window.confirm('Cambiar el tipo de compra borrará los items ingresados. ¿Continuar?')`. Si cancela, el checkbox no cambia. Si confirma, `setItems([itemVacio()])` con la forma correspondiente al nuevo modo.

### 3d. Totales

Reemplazar los inputs manuales "Base IVA 15%/0%/Descuento" por el resultado de `calcularResumenItems(items)`, mostrado como texto (no editable). El bloque inferior de totales usa `baseIva15 + baseIva0 + ΣotrasBases`, `descuentoTotal`, `ivaTotal`, `total`.

### 3e. guardarCompra()

- Validación: en modo personal, `itemsValidos = items.filter(i => i.descripcion && parseFloat(i.monto) > 0)`; en modo empresa, igual que ahora (`materia_prima_id` + `cantidad_kg`).
- `compras` insert: `base_iva15`, `base_iva0`, `descuento`, `iva`, `subtotal`, `total` provienen de `calcularResumenItems(items)`.
- `compras_detalle` insert por item incluye `descuento: item.descuento || 0, iva_pct: item.iva_pct ?? 15`. En modo personal: `materia_prima_id: null, mp_nombre: item.descripcion, cantidad_kg: null, precio_kg: null, subtotal: parseFloat(item.monto)`.
- El bloque de actualización de inventario (`inventario_mp`, `inventario_movimientos`, cambio de `precio_kg` en `materias_primas`) **se omite por completo** cuando `esPersonal === true`.

---

## 4. FacturasPersonales.js (Talonario → Compras → Personales)

### 4a. Modal con lista de items

Reemplaza el campo único "Monto ($)" por una lista de items (Descripción + Monto + Descuento + IVA%, con botón "+ Agregar item" / eliminar), misma UI que 3b. El resumen (Base IVA15/IVA0/otras, Descuento, IVA, Total) se muestra abajo, calculado con `calcularResumenItems`.

### 4b. cargar()

Para cada fila de `talonario_facturas_personales` (no las `_readOnly` de `compras`), cargar también sus items desde `talonario_facturas_personales_items` (un query adicional `.in('factura_id', ids)`).

### 4c. guardar()

- `payload.monto` = `total` calculado.
- `payload.base_iva15/base_iva0/iva/descuento` = del resumen.
- Si es edición (`form.id` existe): `delete` de items previos en `talonario_facturas_personales_items` por `factura_id = form.id`, luego `insert` de los items actuales.
- Si es nuevo: `insert` de la fila padre primero (con `.select().single()` para obtener el `id`), luego `insert` de los items con ese `factura_id`.

### 4d. Filas `_readOnly` (de `compras` con `es_personal=true`)

Sin cambios — siguen sin lista de items editable (sus items viven en `compras_detalle`, fuera de alcance de esta pantalla).

---

## 5. Fuera de alcance (fase 2, opcional)

- **SubirFacturas.js / `analizar-factura`**: hacer que la IA detecte `iva_pct` y `descuento` por item al leer una foto/PDF/XML, precargando los nuevos campos (el usuario los confirma/ajusta igual).
- Mostrar desglose de items de `compras_detalle` para las filas `_readOnly` en FacturasPersonales.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Supabase SQL (manual) | ALTER `compras_detalle` (descuento, iva_pct, materia_prima_id nullable); CREATE `talonario_facturas_personales_items`; ALTER `talonario_facturas_personales` (base_iva15, base_iva0, iva, descuento) |
| `src/utils/comprasCalc.js` (nuevo) | `calcularResumenItems(items)` |
| `src/components/compras/TabIngresoCompra.js` | items modo empresa (+2 cols), modo personal (items genéricos + título dinámico), confirm al togglear, totales calculados, `guardarCompra()` |
| `src/components/contabilidad/talonario/compras/FacturasPersonales.js` | lista de items en modal, `cargar()`, `guardar()` |
