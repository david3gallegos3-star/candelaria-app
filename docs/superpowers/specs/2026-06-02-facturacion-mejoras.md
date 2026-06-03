# Facturación — Mejoras de búsqueda y visualización

**Fecha:** 2026-06-02
**Módulo:** Facturación
**Estado:** Aprobado por David — listo para implementación

---

## 1. Propósito

Replicar las funcionalidades más útiles del sistema POS actual (Aldelo/similar) dentro del módulo Facturación de la app web:
- Búsqueda de facturas con filtros estructurados (Nº Factura, Período, Cliente, Vendedor)
- Visualización clara de anuladas (fila roja completa)
- Panel de ítems inline al seleccionar una factura
- Botones de acción rápida: PDF, Reenviar correo, Enviar a otro correo
- Panel de totales mejorado en nueva venta (Subtotal + IVA + TOTAL grande)
- Guardar nombre del vendedor en la factura

---

## 2. Archivos afectados

| Archivo | Acción | Qué cambia |
|---|---|---|
| Supabase SQL | Ejecutar | Agregar columna `vendedor_nombre text` a `facturas` |
| `src/components/facturacion/TabFacturas.js` | Modificar | Filtros radio + filas rojas + panel ítems + acciones |
| `src/components/facturacion/TabNuevaVenta.js` | Modificar | Panel totales + guardar vendedor_nombre |
| `src/Facturacion.js` | Modificar | Pasar `userRol` a `TabNuevaVenta` |

---

## 3. Base de datos

### Migración

```sql
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS vendedor_nombre text;
```

Los registros anteriores quedan con `vendedor_nombre = null`; el UI usa `vendedor` (email) como fallback.

---

## 4. TabFacturas — Búsqueda mejorada

### 4.1 Filtros estructurados

Reemplaza el input de texto genérico actual. Cuatro modos seleccionables con radio buttons:

| Modo | Control | Lógica de filtro |
|---|---|---|
| **Nº Factura** | Input texto | `f.numero.includes(texto)` |
| **Período** | Dos date pickers (desde / hasta) | `f.fecha_emision >= desde AND <= hasta` |
| **Cliente** | Input texto | `f.cliente_nombre.includes(texto)` |
| **Vendedor** | Dropdown con opciones únicas | `f.vendedor_nombre === seleccionado` (o email si nombre vacío) |

El dropdown de Vendedor se construye dinámicamente con los valores únicos de `vendedor_nombre` (o `vendedor`) presentes en la lista cargada.

El filtro de estado (todas/autorizada/anulada/borrador) se mantiene como está.

### 4.2 Visualización de filas

| Estado | Color de fondo de fila |
|---|---|
| `autorizada` | blanco / verde muy tenue (como ahora) |
| `anulada` | `#fde8e8` (rojo tenue) — toda la fila, no solo el badge |
| `borrador` | `#fef9e7` (amarillo tenue) — como ahora |

### 4.3 Panel de ítems inline

Al hacer clic en una fila, aparece debajo un panel con:
- Tabla: Código/Nombre del producto | Cantidad | Precio unitario | Subtotal
- Nota de crédito (si existe): número NC, motivo
- Se colapsa al hacer clic de nuevo en la misma fila

Este panel reemplaza el `expandida` actual (mantiene la misma lógica, mejora el estilo visual).

### 4.4 Botones de acción por factura

Dentro de cada fila expandida (o como columna de acciones):

| Botón | Condición para mostrarlo | Acción |
|---|---|---|
| 📄 PDF | `f.pdf_url` existe | `window.open(f.pdf_url, '_blank')` |
| ✉️ Reenviar correo | `f.datil_id` existe | POST a `/api/reenviar-factura` con `{ datil_id }` |
| ✉️ Otro correo | Siempre (para facturas autorizadas) | Input de email → POST a `/api/reenviar-factura` con `{ datil_id, email }` |

**Nota:** "Reenviar correo" y "Otro correo" requieren que la factura esté en estado `autorizada` y tenga `datil_id`.

---

## 5. TabNuevaVenta — Panel de totales

### 5.1 Display de totales

Visible en todo momento debajo de la tabla de ítems:

```
┌─────────────────────────────────┐
│  Subtotal:            $112.50   │
│  IVA 15%:              $16.88   │
│ ─────────────────────────────── │
│  TOTAL:               $129.38   │  ← fuente grande, color #1a2a4a
│ ─────────────────────────────── │
│  3 artículo(s)                  │
└─────────────────────────────────┘
```

- `subtotal` = suma de `(cantidad × precio_unitario)` de todos los ítems válidos
- `iva` = `subtotal × 0.15` (15% sobre base total, igual que ahora)
- `total` = `subtotal + iva`
- "artículos" = count de ítems con cantidad > 0

### 5.2 Vendedor nombre

- `TabNuevaVenta` recibe `userRol` como prop (además del `currentUser` actual)
- Al emitir factura, se guarda `vendedor_nombre: userRol?.nombre || ''`
- Al guardar borrador offline, también se incluye `vendedor_nombre`

En `Facturacion.js`:
```javascript
<TabNuevaVenta
  mobile={mobile}
  currentUser={currentUser}
  userRol={userRol}       // ← agregar este prop
/>
```

---

## 6. Permisos

Sin cambios: las mismas restricciones actuales por rol aplican. Los botones de anular/nota de crédito siguen siendo exclusivos de `admin`/`contador`.

---

## 7. Fuera del alcance

- Agregar tasa IVA por producto (todos los productos mantienen 15%)
- Cambio de número secuencial en pantalla (igual que ahora)
- Exportar lista de facturas a Excel
- Cambios en TabCobrar, TabCajaChica, TabCobros
