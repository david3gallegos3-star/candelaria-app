# Nota de Venta Interna — Implementation Design

**Goal:** Agregar nota de venta interna en el módulo de Facturación: mismo flujo que una factura, sin envío al SRI/Dátil, con numeración propia y asiento contable tipo interno.

**Architecture:** Se reutiliza la tabla `facturas` añadiendo columna `tipo VARCHAR DEFAULT 'factura'`. Las notas de venta tienen `tipo='nota_venta'` y su propio secuencial en `config_sistema`. `TabNuevaVenta` añade la función `emitirNotaVenta()` y un botón secundario. `TabFacturas` diferencia visualmente con badge y filtro.

**Tech Stack:** React, Supabase (PostgREST), función existente `generarAsientoFactura(..., 'interno')`.

---

## 1. Base de datos

### Tabla `facturas`
Añadir columna:
```sql
ALTER TABLE facturas ADD COLUMN tipo VARCHAR DEFAULT 'factura';
-- Valores: 'factura' | 'nota_venta'
```

Todas las filas existentes quedan con `tipo = 'factura'` por el DEFAULT.

### Tabla `config_sistema`
Insertar fila para el secuencial propio:
```sql
INSERT INTO config_sistema (clave, valor, descripcion)
VALUES ('nota_venta_secuencial', '1', 'Secuencial para notas de venta internas');
```

Formato de número generado: `NV-001-001-000000001` (prefijo `NV-` en lugar de `001-001-`).

---

## 2. TabNuevaVenta.js

### Estado nuevo
```js
const [secuencialNV, setSecuencialNV] = useState(null);
```

### Carga en `cargarDatos()`
Añadir al Promise.all existente:
```js
supabase.from('config_sistema').select('valor').eq('clave', 'nota_venta_secuencial').single()
```
Guardar en `setSecuencialNV(parseInt(data.valor))`.

### Función `emitirNotaVenta()`
Misma validación que `emitirFactura()`. Sin llamada a `/api/emitir-factura`.

```
1. Validar items y subtotal
2. Generar numero: `NV-001-001-${String(secuencialNV).padStart(9, '0')}`
3. Insert en facturas con tipo='nota_venta', estado='autorizada', sin autorizacion_sri/datil_id/pdf_url/xml_url
4. Insert en facturas_detalle (igual que factura normal)
5. Si credito: insert en cuentas_cobrar
6. Incrementar nota_venta_secuencial en config_sistema
7. generarAsientoFactura({...}, 'interno')
8. Mostrar pantalla de éxito con esBorrador=false y tipo='nota_venta'
```

### Botón nuevo
Junto al botón "Emitir factura", agregar:
```jsx
<button onClick={emitirNotaVenta} disabled={emitiendo || subtotal <= 0}
  style={{ background: '#8e44ad', ... }}>
  {emitiendo ? '⏳...' : '📋 Nota de venta'}
</button>
```
Color morado (`#8e44ad`) para diferenciarlo del verde (factura) y naranja (offline).

### Pantalla de éxito
Reusar la pantalla existente. Añadir condición para mostrar `tipo='nota_venta'`:
- Ícono: `📋` en lugar de `✅`
- Título: "¡Nota de venta registrada!"
- Sin campo "Autorización SRI" (no aplica)

---

## 3. TabFacturas.js

### Constante ESTADO_COLOR / tipo
Añadir badge para nota_venta en la fila principal:
```js
{f.tipo === 'nota_venta' && (
  <span style={{ background: '#f3e5f5', color: '#8e44ad', ... }}>📋 Nota de venta</span>
)}
```

### Filtro
Añadir opción en el `<select>` de filtroEstado:
```jsx
<option value="nota_venta">Notas de venta</option>
```

Actualizar `facturasFiltradas` para filtrar por `tipo` cuando se selecciona esa opción:
```js
const tipoOk = filtroEstado === 'nota_venta'
  ? f.tipo === 'nota_venta'
  : filtroEstado === 'todas' || f.estado === filtroEstado;
```

### Botones por fila
- Nota de venta **no** muestra botón "Emitir al SRI"
- Nota de venta **no** muestra botón "Anular" (no requiere nota de crédito)
- Solo muestra "👁 Ver" para expandir el detalle

### Total mostrado
El contador de totales ya filtra por `estado='autorizada'`. Las notas de venta tienen `estado='autorizada'`, así que suman al total cuando se filtra por todas/autorizadas. Correcto.

---

## 4. Offline support

`emitirNotaVenta()` no llama a Dátil, así que **puede funcionar offline** usando el mismo patrón que `guardarBorrador()`: si `navigator.onLine = false`, guarda via `supabaseReal` directamente; si falla, guarda en `offlineBorradores` con `tipo='nota_venta'`.

Al sincronizar, `syncBorradores()` en `useNetworkStatus` procesa los items con `tipo='nota_venta'` igual que los borradores normales (insert factura + detalle, sin llamar al SRI).

Diferencia clave: para `tipo='nota_venta'`, `syncBorradores` **no llama a `/api/emitir-factura`** — solo inserta en Supabase y marca como `estado='autorizada'`.

---

## 5. Flujo completo

```
Usuario llena items + forma de pago
           │
           ├─ [con internet] → clic "Nota de venta"
           │      → emitirNotaVenta()
           │      → INSERT facturas (tipo='nota_venta', estado='autorizada')
           │      → INSERT facturas_detalle
           │      → UPDATE config_sistema nota_venta_secuencial
           │      → generarAsientoFactura(..., 'interno')
           │      → Pantalla éxito "📋 Nota de venta registrada!"
           │
           └─ [sin internet] → clic "Nota de venta"  
                  → navigator.onLine = false
                  → guardar en offlineBorradores con tipo='nota_venta'
                  → Pantalla éxito "📋 Guardada — se registrará al conectarse"
                  → Al reconectar: syncBorradores() inserta sin llamar SRI
```

---

## 6. Archivos a modificar / crear

| Archivo | Cambio |
|---------|--------|
| `src/components/facturacion/TabNuevaVenta.js` | Añadir `secuencialNV`, función `emitirNotaVenta()`, botón morado, pantalla éxito |
| `src/components/facturacion/TabFacturas.js` | Badge morado "📋 NV", filtro "Notas de venta", ocultar botones SRI/Anular |
| `src/hooks/useNetworkStatus.js` | `syncBorradores()`: si `tipo='nota_venta'` → no llamar SRI, solo insertar |
| `src/lib/offlineBorradores.js` | Añadir campo `tipo` al objeto guardado |
| Base de datos (SQL manual) | `ALTER TABLE facturas ADD COLUMN tipo...` + `INSERT config_sistema...` |

---

## 7. Lo que NO cambia

- No afecta inventario (igual que facturas actuales)
- No genera PDF ni XML
- No usa Dátil
- La tabla `notas_credito` no aplica a notas de venta
- El número de factura regular (`factura_secuencial`) no se toca
