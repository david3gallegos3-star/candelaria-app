# Rediseño Excel Talonario — Design Spec

## Problema

El Excel que genera "Descargar Excel" en Talonario tiene formato plano sin estilo, columnas incorrectas y estructura distinta al Excel de referencia que David usa manualmente. El resultado es inutilizable para contabilidad directa.

## Objetivo

Rediseñar `src/components/contabilidad/talonario/shared/ExcelExport.js` para que el archivo descargado coincida con el Excel de referencia (Diciembre 2025) en estructura, columnas y formato visual, adaptado a los datos del sistema actual.

## Fuera de alcance

- Import de facturas SRI (feature futura separada)
- Cambios a otros componentes del Talonario
- `ExcelImport.js`

---

## Hojas — orden y especificación

### 1. RESUMEN (primera hoja)

Dos tablas lado a lado con bordes y formato, igual al Excel de referencia.

**Tabla izquierda (cols A–C):**
```
Fila 1: vacía
Fila 2: [MES AÑO]  (título, negrita, centrado, borde caja)
Fila 3: EMBUTIDOS Y JAMONES CANDELARIA  (negrita)
Fila 4: vacía
Fila 5: INGRESOS  (negrita)
Fila 6: (+) TOTAL VENTAS DEL 01 AL [día] [MES]    $xxx
Fila 7: (+) OTROS INGRESOS                          $xxx
Fila 8:              TOTAL INGRESOS    [verde fondo]  $xxx
Fila 9: vacía
Fila 10: EGRESOS  (negrita)
Fila 11: (-) GASTOS EFECTIVO                        $xxx
Fila 12: (-) PROVEEDORES CON FACT                   $xxx
Fila 13: (-) PROVEEDORES SIN FACT                   $xxx
Fila 14: (-) SUELDOS                                $xxx
Fila 15: (-) IESS                                   $xxx
Fila 16: (-) PAGOS DEL MES                          $xxx
Fila 17: (-) PAGOS PERSONALES                       $xxx
Fila 18:              TOTAL EGRESOS    [rojo fondo]  $xxx
Fila 19: vacía
Fila 20: (UTILIDAD BRUTA) INGRESOS - EGRESOS  [amarillo fondo, negrita]  $xxx
```

**Tabla derecha (cols F–H, mismas filas):**
```
Fila 2: CONSOLIDADO  (título, negrita, centrado, borde caja)
Fila 3: EMBUTIDOS Y JAMONES CANDELARIA  (negrita)
Fila 4: vacía
Fila 5: INGRESOS  (negrita)
Fila 6: (+) COBROS EFECTIVO                $xxx
Fila 7: (+) COBROS CHEQUE                  $xxx
Fila 8: (+) COBROS TRANSFERENCIA - DEPOSITOS  $xxx
Fila 9: (+) OTROS INGRESOS                $xxx
Fila 10:              TOTAL   [verde fondo]  $xxx
Fila 11: vacía
Fila 12: EGRESOS  (negrita)
Fila 13: (-) GASTOS EN EFECTIVO            $xxx
Fila 14: (-) PAGOS CON BANCOS (PROVEEDORES, SUELDOS)  $xxx
Fila 15: (-) TARJETAS, PRESTAMOS, AHORRO   $xxx
Fila 16: (-) GASTOS PERSONALES             $xxx
Fila 17: (-) OTROS GASTOS PERSONALES       $xxx
Fila 18:              TOTAL   [rojo fondo]  $xxx
Fila 19: vacía
Fila 20: ACTIVOS  (negrita)
Fila 21: (+) CUENTAS POR COBRAR            $xxx
Fila 22:              TOTAL   [verde fondo]  $xxx
Fila 23: vacía
Fila 24: (-) CUENTAS POR PAGAR             $0,00  (dato no disponible aún)
```

**Fuentes de datos RESUMEN:**
- `totalVentas` = suma facturas.total del mes
- `totalOtrosI` = suma talonario_otros_ingresos.monto
- `totalGastos` = suma caja_gastos.valor
- `comprasCon/Sin` = compras filtradas por tiene_factura
- `totalSueldos` = suma nomina.sueldo_prop
- `totalIess` = suma nomina.iess_patronal
- `totalPagosB` = suma talonario_pagos_banco.monto
- `totalPagosP` = suma talonario_pagos_personales.monto
- `cobroEfect/Cheq/Transf` = cobros filtrados por forma_pago
- `cxcPendiente` = cuentas_cobrar pendiente/parcial

---

### 2. GASTOS (renombrar de "GASTOS EFECTIVO")

- Fila 1: **"GASTOS EN EFECTIVO"** — negrita, centrado, fondo azul claro
- Fila 2: Cabeceras con filtro: `PROVEEDOR | FECHA | DETALLE | VALOR`
- Filas 3+: datos de `caja_gastos` (con fecha de `caja_chica`)
- Última fila: `TOTAL` (amarillo, negrita) | suma VALOR

**Datos:** igual que hoy, solo cambia columnas (quitar "Forma Pago", renombrar "Detalle"→DETALLE, agregar PROVEEDOR desde `caja_gastos.proveedor` si existe o dejarlo vacío si no hay campo — usar `detalle` como fallback).

> Nota: `caja_gastos` tiene campo `detalle` pero no `proveedor` como columna separada. La columna PROVEEDOR en el Excel de referencia parece ser un identificador del proveedor que en el sistema actual está mezclado en `detalle`. Por ahora, PROVEEDOR = primera parte del detalle antes de la primera coma/descripción, o vacío. Revisar con David si se necesita campo separado.

**Acción concreta:** caja_gastos query agregar `proveedores(nombre)` si tiene proveedor_id, si no usar vacío para PROVEEDOR y `detalle` para DETALLE.

---

### 3. COBROS EFECTIVO

- Fila 1: **"COBROS EN EFECTIVO"** — fondo amarillo, negrita, centrado
- Fila 2: `forma_pago | nombre_cliente | valor_cuenta | valor_pago | fecha_pago | numero_venta_pedido`
- Filas 3+: cobros con `forma_pago = 'efectivo'`
- Última fila: `TOTAL` (amarillo, negrita) en columna valor_pago

**Mapeo de columnas:**
| Columna Excel | Fuente |
|---|---|
| forma_pago | cobros.forma_pago (mayúsculas: "EFECTIVO") |
| nombre_cliente | cobros → clientes(nombre) |
| valor_cuenta | cobros → cuentas_cobrar(monto_total) |
| valor_pago | cobros.monto |
| fecha_pago | cobros.fecha |
| numero_venta_pedido | cobros → facturas(numero) |

**Query update:** `cobros.select('fecha,monto,forma_pago,observaciones,clientes(nombre),cuentas_cobrar(monto_total),facturas(numero)')`

---

### 4. COBROS TRANSF DEPO (renombrar de "COBROS TRANSF-DEP")

Dos tablas lado a lado en la misma hoja:

**Tabla izquierda (cols A–F):** "COBROS EN TRANSFERENCIA"
- Mismas columnas que COBROS EFECTIVO
- Datos: `forma_pago = 'transferencia'`

**Tabla derecha (cols H–M):** "COBROS EN DEPOSITO Y TARJETA"
- Mismas columnas
- Datos: `forma_pago IN ('deposito', 'tarjeta_credito', 'tarjeta')`

Cada tabla tiene su propia fila TOTAL (amarillo).

Implementación: construir AOA izquierda normal, luego usar `XLSX.utils.sheet_add_aoa(ws, rightRows, {origin: 'H1'})`.

---

### 5. COBROS CHEQUES

- Fila 1: **"COBROS EN CHEQUE"** — fondo amarillo, negrita
- Mismas columnas que COBROS EFECTIVO
- Datos: `forma_pago = 'cheque'`
- TOTAL final (amarillo)

---

### 6. PAGOS MES (nombre hoja: `PAGOS MES`)

- Fila 1: **"PAGOS PROVEEDORES/ BANCOS"** — negrita grande
- Sin fila de cabeceras de columna (datos empiezan en fila 2)
- Columnas: `Beneficiario | Fecha | Monto ($) | Forma Pago`
- Datos: `talonario_pagos_banco` ordenado por fecha
- Fila TOTAL (amarillo) al final de datos
- 4 filas vacías después del TOTAL
- Caja "SALDO AL [último día del mes] [MES] [AÑO] CUENTA CORRIENTE" con valor del saldo real

**Query nueva:** `config_contabilidad` con `clave = saldo_banco_${año}_${mes}` → `valor.saldo`

---

### 7. OTROS PAGOS PERSONALES

Tres secciones en la misma hoja (apiladas verticalmente, NO lado a lado como en referencia, para simplificar):

> **Alternativa:** la referencia las pone algunas lado a lado. Dado que el número de filas varía, apilarlas verticalmente es más robusto y fácil de mantener.

**Sección 1:** "PAGOS PRESTAMO Y TARJETA" — cabeceras NOMBRE | FECHA | VALOR — datos con `categoria IN ('prestamos', 'tarjetas')` — TOTAL amarillo

**Sección 2:** "PAGOS GASTOS PERSONALES" — NOMBRE | FECHA | VALOR — `categoria = 'gastos_personal'` — TOTAL amarillo

**Sección 3:** "PAGOS OTROS GASTOS PERSONALES" — NOMBRE | FECHA | VALOR — `categoria = 'otros'` — TOTAL amarillo

Separadas por 2 filas vacías entre secciones.

---

### 8. COMPRAS

Dos tablas lado a lado:

**Tabla izquierda (cols A–F):** "COMPRAS CON FACTURA" — fondo amarillo, negrita
- Cabeceras con filtro: `FECHA | RUC | PROVEEDOR | NUMERO | VALOR`
- Datos: `compras.tiene_factura = true`
- TOTAL (amarillo)

**Tabla derecha (cols H–J):** "COMPRAS SIN FACTURA"
- Cabeceras: `FECHA | PROVEEDOR | VALOR`
- Datos: `compras.tiene_factura = false`
- TOTAL (amarillo)

**Mapeo columnas COMPRAS CON FACTURA:**
| Columna | Fuente |
|---|---|
| FECHA | compras.fecha |
| RUC | compras → proveedores(ruc) (vacío si proveedor_id null) |
| PROVEEDOR | compras.proveedor_nombre |
| NUMERO | compras.numero_factura |
| VALOR | compras.total |

**Query update:** `compras.select('fecha,total,tiene_factura,numero_factura,proveedor_nombre,forma_pago,proveedores(ruc)')`

---

### 9. COMPRAS -PERSONAL (renombrar de "COMPRAS PERSONAL")

- Fila 1: **"FACTURAS GASTOS PERSONALES"** — fondo amarillo, negrita
- Fila 2: Cabeceras: `FECHA | RUC | PROVEEDOR | NUMERO | VALOR | DETALLE`
- Fila 3: TOTAL (amarillo) — valor $0.00 vacío
- Sin datos (placeholder hasta import SRI)

---

## Styling — reglas globales

Usando `xlsx` (SheetJS) con `{ bookType: 'xlsx', cellStyles: true }`:

| Elemento | Estilo |
|---|---|
| Filas TOTAL | `fill: FFFF00` (amarillo) + `font.bold: true` |
| Títulos de sección | `font.bold: true`, tamaño 12 |
| Cabeceras de tabla | `fill: BDD7EE` (azul claro) + `font.bold: true` + bordes |
| Celdas numéricas | formato `$#,##0.00` |
| TOTAL INGRESOS | `fill: C6EFCE` (verde claro) |
| TOTAL EGRESOS | `fill: FFC7CE` (rojo claro) |
| UTILIDAD BRUTA | `fill: FFFF00` (amarillo) + bold |

Anchos de columna: ajustados para que el contenido no quede truncado (A=25, B=15, C=35, D=15, E=12 como valores base por hoja).

---

## Queries completas necesarias

```js
Promise.all([
  cobros: select('fecha,monto,forma_pago,observaciones,clientes(nombre),cuentas_cobrar(monto_total),facturas(numero)')
  cajas: sin cambio
  compras: select('fecha,total,tiene_factura,numero_factura,proveedor_nombre,forma_pago,proveedores(ruc)')
  pagosB: sin cambio
  pagosP: sin cambio
  otrosI: sin cambio
  factP: sin cambio (mantener para compatibilidad aunque COMPRAS-PERSONAL quede vacío)
  nomina: sin cambio
  facturas: select('total') sin cambio
  cxc: sin cambio
  saldoBanco: config_contabilidad where clave = `saldo_banco_${año}_${mes}` maybeSingle()  ← NUEVA
])
```
