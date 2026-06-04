# Diseño: Venta a empleados con crédito nómina

**Fecha:** 2026-06-04  
**Estado:** Aprobado

## Resumen

Cuando un empleado compra productos de la empresa, el flujo registra la venta normalmente (factura/nota de venta) y crea automáticamente un movimiento "Compra empresa" en su nómina del mes. La deuda se salda al generar la nómina descontándola del sueldo neto. El empleado también puede pagar en el momento como cliente normal.

---

## 1. Cambios en base de datos

Tres columnas nuevas, todas opcionales (no rompen datos existentes):

| Tabla | Columna | Tipo | Descripción |
|---|---|---|---|
| `clientes` | `empleado_id` | UUID nullable → `empleados.id` | Vincula un registro de cliente con un empleado |
| `nomina_movimientos` | `cxc_id` | UUID nullable → `cuentas_cobrar.id` | Enlace al CxC/factura que originó el movimiento |
| `nomina_movimientos` | `activo` | boolean, default `true` | Si está en `false`, no se descuenta en la nómina del mes |

---

## 2. Nueva Venta (TabNuevaVenta)

### Selector de cliente
- Carga `clientes` + `empleados` en paralelo
- Los empleados aparecen mezclados con los clientes normales, con tag `[Empleado]` al lado del nombre
- Al seleccionar un empleado → se preselecciona automáticamente **"Crédito nómina"** como forma de pago

### Forma de pago "Crédito nómina"
- Nueva opción en el selector de forma de pago (solo visible cuando el cliente seleccionado es un empleado)
- El usuario puede cambiarla a efectivo/cheque/transferencia → flujo normal de cliente, sin nada extra
- Si deja "Crédito nómina" y presiona **"Generar factura"** o **"Generar nota de venta"**:

### Flujo al generar con "Crédito nómina"
1. Buscar si existe un registro en `clientes` con `empleado_id` = empleado seleccionado
2. Si no existe → crear uno automáticamente con nombre, cédula del empleado
3. Crear la factura/nota de venta normalmente usando ese `cliente_id`
4. Crear `cuentas_cobrar`:
   - `cliente_id` = cliente del empleado
   - `estado` = `'pendiente'`
   - `fecha_vencimiento` = último día del mes en curso
5. Crear `nomina_movimientos`:
   - `empleado_id` = empleado seleccionado
   - `periodo` = mes/año en curso (formato `YYYY-MM`)
   - `tipo` = `'compra'`
   - `valor` = total de la venta
   - `descripcion` = número de factura/nota de venta
   - `cxc_id` = id del CxC creado
   - `activo` = `true`
   - `fecha` = fecha actual

---

## 3. Modal Movimientos en Nómina (TabNomina)

### Lista de movimientos "Compra empresa"
Cada movimiento de tipo `compra` muestra:
- **Checkbox** a la izquierda (marcado si `activo=true`)
  - Al desmarcar → `activo=false` en BD, no se descuenta en la nómina de este mes, CxC sigue pendiente
  - Al volver a marcar → `activo=true`, vuelve a incluirse
- **Descripción** con número de factura (si tiene `cxc_id`)
- **Ícono de factura** clickeable a la derecha → navega a la factura correspondiente en Facturación
- **Monto** en rojo

### Generación de nómina
- `generarNomina()` solo suma movimientos `tipo='compra'` donde `activo=true`
- Al generar la nómina con movimientos activos → las CxC vinculadas (`cxc_id`) se marcan como `'pagada'`

---

## 4. Lo que NO cambia

- Si el empleado paga en el momento (efectivo, cheque, transferencia) → flujo completamente normal de cliente, sin movimiento en nómina
- El Talonario no requiere cambios: la factura ya entra en "Total ventas del mes", y el sueldo neto pagado (menor por el descuento) se registra con la forma de pago normal del salario
- La tabla `cuentas_cobrar` no requiere columnas nuevas

---

## 5. Flujo completo resumido

```
Empleado compra productos
        ↓
Nueva Venta → seleccionar empleado [Empleado] → "Crédito nómina" preseleccionado
        ↓
Generar Factura / Nota de Venta
        ↓
Se crea: factura + CxC (pendiente) + movimiento "Compra empresa" en nómina (activo=true)
        ↓
Modal Movimientos (nómina) → checkbox visible, ícono de factura clickeable
        ↓
Al generar nómina → sueldo_neto se reduce por compras activas → CxC marcada como pagada
```
