# Sueldos Neto en el Resumen y Adelantos con Forma de Pago — Design Spec

**Goal:** Completar el flujo de Nómina en el Talonario/Resumen: (1) que "Sueldos" refleje lo que realmente recibe el empleado (neto de crédito-nómina y adelantos) tanto en MES como en CONSOLIDADO, y (2) que los adelantos en efectivo se vean reflejados en Caja Chica del día correspondiente, y los adelantos por banco en Movimientos de Banco.

**Architecture:** Parte A reutiliza el campo `nomina.sueldo_neto` (ya calculado correctamente) para alimentar dos líneas del Resumen — una ya existente (MES) y una nueva (CONSOLIDADO). Parte B agrega un selector de forma de pago al formulario de "Anticipo" en Nómina; según la elección, crea automáticamente un gasto vinculado en Caja Chica o un pago vinculado en Movimientos de Banco — sin tocar los cálculos de Gastos en Efectivo / Pagos con Banco, que ya leen esas tablas de forma genérica.

**Tech Stack:** React, Supabase/PostgREST.

**Fuera de alcance (explícitamente acordado):**
- IESS patronal no se agrega a CONSOLIDADO en esta iteración — no forma parte de lo que David pidió, y su tratamiento de caja real (cuándo se paga al IESS) no está modelado en la app todavía.
- "Créditos Empleados" (agregado el 2026-06-24) no cambia — se confirmó explícitamente que no hay doble conteo: Sueldo neto + Adelantos (aparte) + Créditos Empleados (aparte) reconstruyen el sueldo bruto total, en tres líneas que no se superponen.
- El tema "Compras -Personal" / facturas a nombre del dueño (pendiente de una conversación aparte con la contadora, y de una nueva sección de consolidación que David quiere explicar después) **no** es parte de este spec — queda fuera, se retoma en otra sesión de brainstorming.

---

## Parte A — Sueldos neto en el Resumen

**Qué cambia:** las líneas "(-) Sueldos" del Resumen (MES y la nueva en CONSOLIDADO) usan `nomina.sueldo_neto` en vez de `nomina.sueldo_prop`.

- `sueldo_neto` ya existe y ya se calcula así en `TabNomina.js`: `sueldo_prop (bruto) − anticipo − compras_empresa (crédito nómina) − IESS empleado`. No requiere ningún cambio en `TabNomina.js`.
- **MES (izquierdo):** `totalSueldos` pasa de `suma(nomina, 'sueldo_prop')` a `suma(nomina, 'sueldo_neto')`. Sin filtro de `estado` (igual que hoy — se cuenta toda nómina generada para ese período, esté pagada o no).
- **CONSOLIDADO (derecho):** se agrega una línea nueva "(-) Sueldos", usando `suma(nomina.filter(n => n.estado === 'pagado'), 'sueldo_neto')` — solo nóminas efectivamente marcadas como pagadas ese mes (caja real). Esta línea no existe hoy en CONSOLIDADO; hay que agregar `estado` a la consulta de `nomina` en `ResumenTalonario.js` (hoy solo selecciona `sueldo_prop,iess_patronal`).
- El período de nómina (`nomina.periodo`) ya se tagea por el mes de **trabajo**, no por cuándo se genera o se paga — esto ya es correcto, no requiere cambios.

---

## Parte B — Adelantos con forma de pago (efectivo / banco)

**Qué registra:** cuando se agrega un movimiento tipo "Anticipo" en Nómina, ahora se elige si se entregó en efectivo o por banco, y eso se refleja automáticamente donde corresponde.

### Esquema

- **`nomina_movimientos`**: nueva columna `forma_pago` (text, nullable) — solo se usa cuando `tipo = 'anticipo'`. Valores: `'efectivo'` o `'banco'`.
- **`caja_gastos`**: nueva columna `origen_nomina_movimiento_id` (uuid, nullable, FK a `nomina_movimientos.id`) — marca qué gastos vienen de un adelanto de nómina, para distinguirlos de los gastos puestos a mano en Caja Chica.

### Flujo al agregar un Anticipo

En el formulario "+ Movimiento" de `TabNomina.js`, cuando `tipo === 'anticipo'`, aparece un selector "Forma de pago" (Efectivo / Banco), junto a los campos ya existentes (fecha, descripción, valor).

Al guardar:
- **Efectivo:** se busca la fila de `caja_chica` para esa `fecha` (la misma que ya usa `TabCajaChica.js`, búsqueda por `fecha` única); si no existe, se crea una vacía. Luego se inserta un `caja_gastos` vinculado a esa caja, con `proveedor` o `detalle` = "Adelanto nómina — `<nombre empleado>`", `valor` = el monto del anticipo, `es_personal = false` (es un gasto de la empresa, no personal), y `origen_nomina_movimiento_id` = el id del `nomina_movimientos` recién creado.
- **Banco:** se inserta una fila en `talonario_pagos_banco` con `concepto` = "Adelanto nómina", `beneficiario` = el nombre del empleado, `monto` = el valor del anticipo, `fecha`, y `mes`/`año` derivados del período de nómina actual. Ojo: el estado `mes` de `TabNomina.js` es 0-indexado (`useState(now.getMonth())`, igual que `Date.getMonth()`), mientras que `talonario_pagos_banco.mes` es 1-indexado (1-12, igual que el resto del Talonario) — hay que guardar `mes + 1`, no `mes` directo.

### Visibilidad en Caja Chica (`TabCajaChica.js`)

El gasto del adelanto debe aparecer en la lista de gastos del día correspondiente, pero como una fila de **solo lectura** — no se puede editar ni eliminar desde esa pantalla (su fuente de verdad es Nómina, no Caja Chica). Esto requiere dos cambios puntuales en `TabCajaChica.js`:

1. **`cargarDia()`**: al cargar los `caja_gastos` de ese `caja_id`, marcar como `_readOnly: true` (mismo patrón ya usado en `PagosPersonales.js` para gastos personales registrados en Caja Chica) cualquier fila con `origen_nomina_movimiento_id` no nulo, para que la UI la muestre sin los controles de editar/eliminar.
2. **`autoGuardarBorrador()`**: hoy hace `DELETE FROM caja_gastos WHERE caja_id = id` y reinserta TODAS las filas desde el array `gastos` en memoria — esto borraría y recrearía (con un id nuevo) cualquier gasto vinculado a nómina cada vez que se guarda algo más ese día, rompiendo la relación. Cambio: excluir las filas `_readOnly` del `DELETE`+reinsert — solo se borran/reinsertan las filas puestas a mano en esa pantalla; las vinculadas a nómina quedan intactas.

### Eliminar un anticipo desde Nómina

Si se elimina un movimiento de tipo "anticipo" desde `TabNomina.js` (`eliminarMov`), también se elimina el `caja_gastos` vinculado (`WHERE origen_nomina_movimiento_id = mov.id`) o la fila de `talonario_pagos_banco` correspondiente, según la forma de pago que tuviera.

### Resumen y Talonario — sin cambios

`ResumenTalonario.js` (Gastos en efectivo, Pagos con banco) y la pestaña Talonario de Gastos en Efectivo ya leen `caja_gastos`/`talonario_pagos_banco` de forma genérica (sin filtrar por origen) — el adelanto se suma automáticamente a esos totales en cuanto se inserta, sin necesidad de tocar esos cálculos.

---

## Resumen de cambios por archivo

- **Nueva migración SQL:** `nomina_movimientos.forma_pago`, `caja_gastos.origen_nomina_movimiento_id`.
- **`ResumenTalonario.js`:** `totalSueldos` usa `sueldo_neto`; nueva línea "(-) Sueldos" en CONSOLIDADO (`sueldo_neto`, filtrado por `estado='pagado'`); query de `nomina` agrega `sueldo_neto,estado` al select.
- **`TabNomina.js`:** selector "Forma de pago" en el formulario de Anticipo; al guardar un anticipo, crear el gasto en Caja Chica o el pago en Banco según corresponda; al eliminar un anticipo, eliminar el registro vinculado.
- **`TabCajaChica.js`:** `cargarDia()` marca como solo-lectura los gastos vinculados a nómina; `autoGuardarBorrador()` los excluye del ciclo de borrar/reinsertar.
