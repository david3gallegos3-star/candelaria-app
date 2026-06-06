# Comisiones Bancarias en Cobros

**Fecha:** 2026-06-05
**Estado:** Aprobado

## Problema

Los bancos en Ecuador cobran comisiones por cobros vía transferencia, depósito y cheque. La app no tenía forma de registrarlas, lo que generaba diferencia entre el saldo calculado y el saldo real del banco.

## Solución

Campo `comision` en la tabla `cobros` + UI en dos puntos de entrada (al registrar el cobro y después desde la pestaña BANCO).

---

## 1. Base de datos

Agregar columna a tabla `cobros` en Supabase:

```sql
ALTER TABLE cobros ADD COLUMN comision NUMERIC DEFAULT 0;
```

- No nullable, default 0 → los cobros existentes no se rompen.

---

## 2. TabCobrar.js — Caso A (al momento del cobro)

Cuando `formaCobro` es `transferencia`, `deposito` o `cheque`, mostrar debajo del campo de referencia:

```
☐ Tiene comisión bancaria
   └ Monto comisión: [$____]   ← visible solo si checkbox marcado
```

**Estados nuevos:**
- `tieneComision` boolean, default false
- `montoComision` string, default ''

**Al guardar**, incluir en el INSERT:
```js
comision: tieneComision ? parseFloat(montoComision) || 0 : 0
```

**Resetear** `tieneComision` y `montoComision` al limpiar el formulario.

---

## 3. MovimientosBanco.js — Caso B (edición posterior) + visualización

### 3a. Query

Agregar `comision` al select de cobros:
```js
.select('id,fecha,monto,comision,forma_pago,observaciones,clientes(nombre),facturas(numero)')
```

### 3b. Construcción de lista de movimientos

Por cada cobro con `comision > 0`, generar dos filas:
1. Entrada normal (el cobro)
2. Salida indentada (la comisión)

```js
...(cobros||[]).flatMap(c => {
  const entrada = { fecha: c.fecha, descripcion: `Cobro ... — ${cliente}`, tipo: 'entrada', monto: parseFloat(c.monto||0), cobroId: c.id };
  const filas = [entrada];
  if (parseFloat(c.comision||0) > 0) {
    filas.push({ fecha: c.fecha, descripcion: `└ Comisión — ${cliente}`, tipo: 'salida', monto: parseFloat(c.comision), esComision: true });
  }
  return filas;
}),
```

### 3c. Edición posterior inline

En las filas de cobros (transferencia/cheque/depósito) mostrar ✏️ al hover. Al clicar:
- Input inline con el valor actual de comisión (0 si no tiene)
- Botón ✓ Guardar → `UPDATE cobros SET comision = X WHERE id = ?`
- Botón Cancelar

Las filas `esComision: true` no muestran el botón ✏️.

### 3d. KPIs y totales

Las comisiones se incluyen en `totalSalidas` automáticamente ya que son filas de tipo `salida`.

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| Supabase (manual) | `ALTER TABLE cobros ADD COLUMN comision NUMERIC DEFAULT 0` |
| `src/components/facturacion/TabCobrar.js` | Checkbox + input comisión en el formulario de cobro |
| `src/components/contabilidad/talonario/banco/MovimientosBanco.js` | Query + filas comisión + edición inline |

---

## Fuera de alcance

- Comisiones en cobros de efectivo (el banco no cobra por efectivo)
- Histórico de cambios de comisión
- Comisiones no ligadas a un cobro (se manejan como pago banco manual)
